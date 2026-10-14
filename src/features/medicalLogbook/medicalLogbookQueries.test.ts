import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { blankMedicalDraft, type MedicalEntry, type MedicalSignatureSnapshot } from './medicalLogbookModel';
import { fetchMedicalEntries, fetchMedicalHistory, fetchMedicalVessels, parseMedicalEntry, parseMedicalSignature, saveMedicalEntry, setMedicalEntryArchived, fetchMedicalSigner, fetchMedicalSignatureImages } from './medicalLogbookQueries';
import { createMedicalPreviewClient } from './medicalLogbookPreview';

const draft = { ...blankMedicalDraft(), occurred_on: '2026-10-14', occurred_time: '10:00', patient_name: 'Patient fictif', injury_illness: 'Blessure fictive',
  treatment_medicines: 'Soins fictifs', first_aider_name: 'Secouriste fictif' };
const signature: MedicalSignatureSnapshot = { signature_id: 8, version_number: 3, signer_person_id: 42,
  signer_user_id: 'ba870000-0000-4000-8000-000000000001', signer_name: draft.first_aider_name,
  storage_bucket: 'working-time-signatures', storage_path: '1/42/profile-signature.png', mime_type: 'image/png',
  file_size_bytes: 128, sha256: 'a'.repeat(64), valid_from: '2026-10-14T08:00:00Z' };
const entry: MedicalEntry = { ...draft, signature_name: draft.first_aider_name, signature_version_id: 8, signature_snapshot: signature,
  id: 1, company_id: 1, vessel_id: 4, revision: 1, archived: false, created_at: '2026-10-14T08:00:00Z', updated_at: '2026-10-14T08:00:00Z' };
function sdk(data: unknown = entry, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { rpc, client: { rpc } as unknown as SupabaseClient };
}
describe('medical register queries', () => {
  it('preserves hour-on-the-hour values and normalizes SQL seconds only', () => {
    expect(parseMedicalEntry(entry).occurred_time).toBe('10:00');
    expect(parseMedicalEntry({ ...entry, occurred_time: '10:00:00' }).occurred_time).toBe('10:00');
    expect(() => parseMedicalEntry({ ...entry, occurred_time: '10:00:30' })).toThrow('invalide');
  });
  it('fails closed for malformed rows and records from a different vessel', async () => {
    expect(() => parseMedicalEntry({ ...entry, signature_snapshot: 'https://external.invalid' })).toThrow('invalide');
    const { client } = sdk([entry]);
    await expect(fetchMedicalEntries(client, 99)).rejects.toThrow('invalide');
  });
  it('sends only normalized editable content and the expected revision', async () => {
    const { client, rpc } = sdk();
    await saveMedicalEntry(client, 4, { ...draft, patient_name: '  Patient fictif  ', company_id: 99 } as typeof draft, entry);
    expect(rpc).toHaveBeenCalledWith('save_medical_logbook_entry', { p_vessel_id: 4, p_entry_id: 1, p_expected_revision: 1, p_entry: draft });
  });
  it('blocks invalid dates and editing archived or cross-vessel entries before any RPC', async () => {
    const { client, rpc } = sdk();
    await expect(saveMedicalEntry(client, 4, { ...draft, occurred_on: '2026-02-30' })).rejects.toThrow('date');
    await expect(saveMedicalEntry(client, 9, draft, entry)).rejects.toThrow('modifiée');
    await expect(saveMedicalEntry(client, 4, draft, { ...entry, archived: true })).rejects.toThrow('modifiée');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('maps conflicts and denied access without echoing medical values from backend errors', async () => {
    const conflict = sdk(null, { code: '40001', message: 'Sensitive content must not appear' });
    await expect(setMedicalEntryArchived(conflict.client, entry, true)).rejects.toThrow('Actualisez');
    const denied = sdk(null, { code: '42501', message: 'Sensitive content must not appear' });
    await expect(fetchMedicalEntries(denied.client, 4)).rejects.toThrow('réservé');
  });
  it('orders vessels by length and keeps server write capability', async () => {
    const { client } = sdk([{ id: 1, company_id: 1, name: 'SUROIT', can_write: true, length_overall: '18.6' },
      { id: 2, company_id: 1, name: 'GOURY', can_write: false, length_overall: '30.62' }]);
    expect((await fetchMedicalVessels(client)).map((row) => [row.id, row.can_write])).toEqual([[2, false], [1, true]]);
  });
  it('validates history belongs to the requested entry and snapshot revision', async () => {
    const { client } = sdk([{ id: 2, revision: 2, action: 'updated', changed_at: entry.updated_at, actor_name: 'Démo', entry }]);
    await expect(fetchMedicalHistory(client, 1)).rejects.toThrow('Historique');
  });
  it('keeps preview changes and medical snapshots local to one client with revision protection', async () => {
    const local = createMedicalPreviewClient();
    const other = createMedicalPreviewClient();
    const vessels = await fetchMedicalVessels(local);
    const vessel = vessels[0];
    const originalCount = (await fetchMedicalEntries(local, vessel.id)).length;
    const signer = await fetchMedicalSigner(local);
    const previewDraft = { ...draft, first_aider_name: signer.signer_name };
    const saved = await saveMedicalEntry(local, vessel.id, previewDraft);
    expect((await fetchMedicalEntries(local, vessel.id)).length).toBe(originalCount + 1);
    expect((await fetchMedicalEntries(other, vessel.id)).length).toBe(originalCount);
    const corrected = await saveMedicalEntry(local, vessel.id, { ...previewDraft, injury_illness: 'Correction fictive' }, saved);
    await expect(saveMedicalEntry(local, vessel.id, previewDraft, saved)).rejects.toThrow('Actualisez');
    const archived = await setMedicalEntryArchived(local, corrected, true);
    const restored = await setMedicalEntryArchived(local, archived, false);
    expect(restored.archived).toBe(false);
    const history = await fetchMedicalHistory(local, saved.id);
    expect(history.map((event) => event.action)).toEqual(['restored', 'archived', 'updated', 'created']);
    expect(history.at(-1)?.entry.injury_illness).toBe(draft.injury_illness);
    expect(history[1].entry.archived).toBe(true);
  });
  it('rejects a signature from another profile, bucket, path or record version', () => {
    expect(() => parseMedicalSignature({ ...signature, storage_bucket: 'public-files' })).toThrow('invalide');
    expect(() => parseMedicalSignature({ ...signature, storage_path: '1/99/profile-signature.png' })).toThrow('invalide');
    expect(() => parseMedicalSignature({ ...signature, storage_path: 'https://external.invalid/sig.png' })).toThrow('invalide');
    expect(() => parseMedicalEntry({ ...entry, signature_version_id: 99 })).toThrow('invalide');
    expect(() => parseMedicalEntry({ ...entry, first_aider_name: 'Autre personne' })).toThrow('invalide');
  });
  it('requires the personal signature projection to match the connected profile', async () => {
    const { client } = sdk({ person_id: 99, signer_name: draft.first_aider_name, signature });
    await expect(fetchMedicalSigner(client)).rejects.toThrow('invalide');
    const missing = sdk({ person_id: 42, signer_name: draft.first_aider_name, signature: null });
    await expect(fetchMedicalSigner(missing.client)).resolves.toMatchObject({ signature: null });
  });
  it('downloads each frozen private signature version once and verifies its bytes before export', async () => {
    const client = createMedicalPreviewClient();
    const vessel = (await fetchMedicalVessels(client))[0];
    const rows = await fetchMedicalEntries(client, vessel.id);
    const images = await fetchMedicalSignatureImages(client, rows);
    expect(images.size).toBe(rows.length);
    expect(images.get(rows[0].id)?.slice(0, 4)).toEqual(new Uint8Array([137, 80, 78, 71]));
    expect(images.get(rows[0].id)).toBe(images.get(rows[1].id));
  });
});
