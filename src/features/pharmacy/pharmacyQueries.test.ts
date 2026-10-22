import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { blankPharmacyItem, pharmacyToday, type PharmacyItem, type PharmacyNotification, type PharmacyVessel } from './pharmacyModel';
import { fetchPharmacyNotifications, fetchPharmacyRegister, fetchPharmacyVesselExpiryCounts, fetchPharmacyVessels, savePharmacyItem, uploadPharmacyControl, validatePharmacyControl } from './pharmacyQueries';
import { createPharmacyPreviewClient } from './pharmacyPreview';

const vessel: PharmacyVessel = { id: 4, company_id: 1, name: 'SUROIT', acronym: 'SUR', can_manage: true };
describe('pharmacy persistence', () => {
  it('sends the expected revision and exact textual stock to the guarded item RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 12, error: null });
    const draft = { ...blankPharmacyItem(), designation: 'Compresses', quantity: '2 Boîtes', required_quantity: '4x5' };
    await savePharmacyItem({ rpc } as unknown as SupabaseClient, 4, draft, { id: 12, revision: 7 } as PharmacyItem);
    expect(rpc).toHaveBeenCalledWith('save_pharmacy_item', { p_vessel_id: 4, p_item: draft, p_id: 12, p_revision: 7 });
  });
  it('rejects unsupported documents and invalid dates before starting an upload', () => {
    expect(() => validatePharmacyControl(new File(['hello'], 'controle.txt', { type: 'text/plain' }), '2027-01-01')).toThrow('PDF');
    const file = new File(['pdf'], 'controle.pdf', { type: 'application/pdf' });
    expect(() => validatePharmacyControl(file, '2026-02-31')).toThrow('date');
    expect(() => validatePharmacyControl(file, '2027-01-01', '2027-01-02')).toThrow('précéder');
  });
  it('stores an immutable vessel-scoped upload and compares the current control before replacement', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upload });
    const rpc = vi.fn().mockResolvedValue({ data: 19, error: null });
    const client = { rpc, storage: { from } } as unknown as SupabaseClient;
    const file = new File(['pdf'], 'Contrôle Pharmacie.pdf', { type: 'application/pdf' });
    expect(await uploadPharmacyControl(client, vessel, file, '2027-01-01', '2026-01-01', 18)).toBe(19);
    expect(from).toHaveBeenCalledWith('pharmacy-controls');
    expect(upload).toHaveBeenCalledWith(expect.stringMatching(/^1\/4\/[\da-f-]+\.pdf$/), file, { contentType: 'application/pdf', upsert: false });
    expect(rpc).toHaveBeenCalledWith('publish_pharmacy_control', expect.objectContaining({ p_vessel_id: 4, p_expected_control_id: 18, p_file_name: file.name, p_file_size: 3, p_expires_on: '2027-01-01' }));
  });
  it('keeps the immutable file when a publication response is ambiguous', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn();
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error('network') });
    const client = { rpc, storage: { from: () => ({ upload, remove }) } } as unknown as SupabaseClient;
    await expect(uploadPharmacyControl(client, vessel, new File(['pdf'], 'a.pdf', { type: 'application/pdf' }), '2027-01-01')).rejects.toThrow('network');
    expect(remove).not.toHaveBeenCalled();
  });
  it('propagates alert failures instead of inventing an empty successful result', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error('not installed') });
    await expect(fetchPharmacyNotifications({ rpc } as unknown as SupabaseClient)).rejects.toThrow('not installed');
  });
});

describe('pharmacy vessel expiry badges', () => {
  const notification = (id: number, vesselId: number, days: number, kind: PharmacyNotification['kind'] = 'item'): PharmacyNotification => ({ id: `${kind}-${id}`, kind, vessel_id: vesselId, vessel_name: `Vessel ${vesselId}`, title: `Article ${id}`, expires_on: '2026-11-19', days_until_expiry: days, item_id: kind === 'item' ? id : null });

  it('counts only article expiries across all vessels in one authorized server snapshot', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [notification(1, 4, -1), notification(2, 4, 0), notification(3, 4, 1),
      notification(4, 4, 30), notification(5, 4, 31), notification(6, 1, -365),
      notification(7, 4, -1, 'control'), notification(8, 1, 30, 'control'), notification(9, 6, 1, 'control')], error: null });
    expect(await fetchPharmacyVesselExpiryCounts({ rpc } as unknown as SupabaseClient)).toEqual({ 4: { due: 3, expired: 1 }, 1: { due: 0, expired: 1 } });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('pharmacy_notifications');
  });

  it('distinguishes a successful empty snapshot from a failed counter load', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: null, error: new Error('Access unavailable') });
    const client = { rpc } as unknown as SupabaseClient;
    expect(await fetchPharmacyVesselExpiryCounts(client)).toEqual({});
    await expect(fetchPharmacyVesselExpiryCounts(client)).rejects.toThrow('Access unavailable');
  });

  it('keeps preview alerts aligned with active articles, current controls and the Paris day', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T23:00:00Z'));
    try {
      const client = createPharmacyPreviewClient();
      const vessels = await fetchPharmacyVessels(client);
      const selected = vessels[0];
      const { items } = await fetchPharmacyRegister(client, selected.id);
      expect(pharmacyToday()).toBe('2026-10-20');
      expect(items.some(({ category }) => category === '1. CARDIOLOGIE')).toBe(true);
      expect(items.some(({ category }) => category.startsWith('10.'))).toBe(true);
      expect(await fetchPharmacyVesselExpiryCounts(client)).toEqual(Object.fromEntries(vessels.map(({ id }) => [id, { due: 1, expired: 1 }])));

      const file = new File(['pdf'], 'Démonstration.pdf', { type: 'application/pdf' });
      const controlId = await uploadPharmacyControl(client, selected, file, '2026-11-19', '2026-10-20');
      const notifications = await fetchPharmacyNotifications(client);
      expect(notifications.find(({ id }) => id === `control-${controlId}`)?.days_until_expiry).toBe(30);
      expect((await fetchPharmacyVesselExpiryCounts(client))[selected.id]).toEqual({ due: 1, expired: 1 });

      await uploadPharmacyControl(client, selected, file, '2026-11-20', '2026-10-20', controlId);
      expect((await fetchPharmacyNotifications(client)).filter(({ kind }) => kind === 'control')).toEqual([]);
      const expired = items.find(({ expires_on }) => expires_on && expires_on < pharmacyToday())!;
      await savePharmacyItem(client, selected.id, { ...expired, active: false }, expired);
      expect((await fetchPharmacyVesselExpiryCounts(client))[selected.id]).toEqual({ due: 1, expired: 0 });
      expect((await fetchPharmacyVesselExpiryCounts(client))[vessels[1].id]).toEqual({ due: 1, expired: 1 });
    } finally { vi.useRealTimers(); }
  });
});
