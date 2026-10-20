import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { blankPharmacyItem, type PharmacyItem, type PharmacyVessel } from './pharmacyModel';
import { fetchPharmacyNotifications, savePharmacyItem, uploadPharmacyControl, validatePharmacyControl } from './pharmacyQueries';

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
