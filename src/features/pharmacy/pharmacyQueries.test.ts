import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { blankPharmacyItem, pharmacyToday, type PharmacyCategory, type PharmacyItem, type PharmacyNotification, type PharmacyVessel } from './pharmacyModel';
import { deletePharmacyCategory, fetchPharmacyNotifications, fetchPharmacyRegister, fetchPharmacyVesselExpiryCounts, fetchPharmacyVessels, savePharmacyCategory, savePharmacyItem, uploadPharmacyControl, validatePharmacyControl } from './pharmacyQueries';
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

describe('pharmacy categories', () => {
  const category: PharmacyCategory = { id: 20, company_id: 1, vessel_id: 4, name: 'SOINS', revision: 7, created_at: '2026-10-22T00:00:00Z', updated_at: '2026-10-22T00:00:00Z' };
  it('creates trimmed categories and sends the displayed category revision for rename and deletion', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 20, error: null });
    const client = { rpc } as unknown as SupabaseClient;
    await expect(savePharmacyCategory(client, 4, '  MATÉRIEL  ')).resolves.toBe(20);
    expect(rpc).toHaveBeenLastCalledWith('save_pharmacy_category', { p_vessel_id: 4, p_name: 'MATÉRIEL', p_id: null, p_revision: null });
    await savePharmacyCategory(client, 4, 'NOUVEAUX SOINS', category);
    expect(rpc).toHaveBeenLastCalledWith('save_pharmacy_category', { p_vessel_id: 4, p_name: 'NOUVEAUX SOINS', p_id: 20, p_revision: 7 });
    await deletePharmacyCategory(client, 4, category);
    expect(rpc).toHaveBeenLastCalledWith('delete_pharmacy_category', { p_vessel_id: 4, p_id: 20, p_revision: 7 });
  });
  it('rejects empty, oversized and cross-vessel requests before calling the server', async () => {
    const rpc = vi.fn(); const client = { rpc } as unknown as SupabaseClient;
    await expect(savePharmacyCategory(client, 4, '  ')).rejects.toThrow('1 et 200');
    await expect(savePharmacyCategory(client, 4, 'x'.repeat(201))).rejects.toThrow('1 et 200');
    await expect(savePharmacyCategory(client, 9, 'SOINS', category)).rejects.toThrow('autre navire');
    await expect(deletePharmacyCategory(client, 9, category)).rejects.toThrow('autre navire');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('propagates mutation and category-read failures without reporting an empty successful catalogue', async () => {
    const failure = new Error('Catégories indisponibles');
    const rpc = vi.fn().mockResolvedValue({ error: failure, data: null });
    await expect(savePharmacyCategory({ rpc } as unknown as SupabaseClient, 4, 'SOINS')).rejects.toThrow(failure);
    await expect(deletePharmacyCategory({ rpc } as unknown as SupabaseClient, 4, category)).rejects.toThrow(failure);
    const from = vi.fn((name: string) => {
      const chain = { select: () => chain, eq: vi.fn(() => chain), order: () => chain, then: (resolve: (result: unknown) => void) => Promise.resolve({ data: [], error: name === 'pharmacy_categories' ? failure : null }).then(resolve) };
      return chain;
    });
    await expect(fetchPharmacyRegister({ from } as unknown as SupabaseClient, 4)).rejects.toThrow(failure);
    expect(from).toHaveBeenCalledWith('pharmacy_categories');
    for (const result of from.mock.results) expect(result.value.eq).toHaveBeenCalledWith('vessel_id', 4);
  });
  it('persists empty categories, renames retired and active articles, then removes only their classification in the preview fixture', async () => {
    const client = createPharmacyPreviewClient();
    const [selected, other] = await fetchPharmacyVessels(client);
    const before = await fetchPharmacyRegister(client, selected.id);
    const otherBefore = await fetchPharmacyRegister(client, other.id);
    const id = await savePharmacyCategory(client, selected.id, 'NOUVELLE CATÉGORIE');
    let loaded = await fetchPharmacyRegister(client, selected.id);
    const empty = loaded.categories.find((candidate) => candidate.id === id)!;
    expect(empty.name).toBe('NOUVELLE CATÉGORIE');
    expect(loaded.items).toEqual(before.items);
    await expect(savePharmacyCategory(client, selected.id, ' nouvelle catégorie ')).rejects.toMatchObject({ message: expect.stringContaining('existe déjà') });
    const target = before.categories.find((candidate) => before.items.filter((item) => item.category === candidate.name).length > 1)!;
    const original = before.items.find((item) => item.category === target.name)!;
    await savePharmacyItem(client, selected.id, { ...original, active: false }, original);
    const withRetired = await fetchPharmacyRegister(client, selected.id);
    const affected = withRetired.items.filter((item) => item.category === target.name);
    await savePharmacyCategory(client, selected.id, 'RENOMMÉE', target);
    loaded = await fetchPharmacyRegister(client, selected.id);
    expect(loaded.items).toHaveLength(before.items.length);
    for (const item of affected) expect(loaded.items.find((candidate) => candidate.id === item.id)).toEqual({ ...item, category: 'RENOMMÉE', revision: item.revision + 1, updated_at: expect.any(String) });
    await expect(savePharmacyItem(client, selected.id, original, original)).rejects.toMatchObject({ message: expect.stringContaining('modifié') });
    await expect(deletePharmacyCategory(client, selected.id, target)).rejects.toMatchObject({ message: expect.stringContaining('modifiée') });
    const renamed = loaded.categories.find((candidate) => candidate.id === target.id)!;
    const beforeDelete = loaded.items;
    const expiryBefore = await fetchPharmacyVesselExpiryCounts(client);
    await deletePharmacyCategory(client, selected.id, renamed);
    loaded = await fetchPharmacyRegister(client, selected.id);
    expect(loaded.categories.some((candidate) => candidate.id === target.id)).toBe(false);
    expect(loaded.categories.some((candidate) => candidate.id === empty.id)).toBe(true);
    expect(loaded.items).toHaveLength(before.items.length);
    for (const item of beforeDelete) expect(loaded.items.find((candidate) => candidate.id === item.id)).toEqual(item.category === 'RENOMMÉE' ? { ...item, category: '', revision: item.revision + 1, updated_at: expect.any(String) } : item);
    expect(await fetchPharmacyVesselExpiryCounts(client)).toEqual(expiryBefore);
    expect(await fetchPharmacyRegister(client, other.id)).toEqual(otherBefore);
  });
  it('registers freeform item categories and reuses the existing category spelling', async () => {
    const client = createPharmacyPreviewClient();
    const [selected] = await fetchPharmacyVessels(client);
    const { items } = await fetchPharmacyRegister(client, selected.id);
    const item = items[0];
    const catId = await savePharmacyCategory(client, selected.id, 'CHOIX CANONIQUE');
    await savePharmacyItem(client, selected.id, { ...item, category: ' choix canonique ' }, item);
    let loaded = await fetchPharmacyRegister(client, selected.id);
    expect(loaded.items.find(({ id }) => id === item.id)?.category).toBe('CHOIX CANONIQUE');
    expect(loaded.categories.filter(({ name }) => name === 'CHOIX CANONIQUE')).toEqual([expect.objectContaining({ id: catId })]);
    const updated = loaded.items.find(({ id }) => id === item.id)!;
    await savePharmacyItem(client, selected.id, { ...updated, category: 'CATÉGORIE LIBRE' }, updated);
    loaded = await fetchPharmacyRegister(client, selected.id);
    expect(loaded.categories.some(({ name }) => name === 'CATÉGORIE LIBRE')).toBe(true);
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
