import type { SupabaseClient } from '@supabase/supabase-js';
import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptySeaOperation } from './seaOperationModel';
import { fetchSeaOperationCaptainSignature, fetchSeaOperationData, fetchSeaOperationDetail, fetchSeaOperationPlanning, loadSeaOperationSignature, mapSeaOperationRecord, saveSeaOperation, signSeaOperation } from './seaOperationQueries';

afterEach(() => vi.unstubAllGlobals());
const signature = { signature_id: 17, signer_person_id: 4, signer_name: 'Arthur DUPONT', storage_bucket: 'working-time-signatures',
  storage_path: 'immutable/captain-v1.png', mime_type: 'image/png', sha256: 'a'.repeat(64), version_number: 1 };

function record(overrides: Record<string, unknown> = {}) {
  return { id: 'record-1', company_id: 1, version: 3, status: 'draft', draft: emptySeaOperation(),
    created_by: 'crew-id', created_by_name: 'Marin réel', created_at: '2026-10-16T08:00:00Z',
    updated_by: 'manager-id', updated_by_name: 'Armement réel', updated_at: '2026-10-16T09:00:00Z',
    signed_by: null, signed_by_name: null, signed_at: null, captain_name: null, can_edit: true, can_sign: false, ...overrides };
}

describe('sea operation queries', () => {
  it('uses server permissions and orders real vessel options by decreasing length', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { company_id: 1, actor_id: 'crew-id', actor_name: 'Marin réel',
      records: [record()], vessels: [
        { id: 1, name: 'Petit', length_overall: '12 m', draft_m: '1.4', registration_imo: '123', can_sign: false },
        { id: 2, name: 'Grand', length_overall: '45 m', draft_m: 2.1, registration_imo: '456', can_sign: true },
      ] }, error: null });
    const data = await fetchSeaOperationData({ rpc } as unknown as SupabaseClient);
    expect(data.actorId).toBe('crew-id');
    expect(data.records[0]).toMatchObject({ version: 3, canEdit: true, canSign: false, signedAt: null });
    expect(data.vessels.map((vessel) => vessel.id)).toEqual([2, 1]);
    expect(data.vessels.map((vessel) => vessel.draftMeters)).toEqual([2.1, 1.4]);
    expect(rpc).toHaveBeenCalledWith('sea_operations_overview', undefined);
  });

  it('keeps unknown vessel draughts empty, including historical RPC responses', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { company_id: 1, actor_id: 'crew-id', actor_name: 'Marin réel', records: [],
      vessels: [{ id: 1, name: 'Inconnu', draft_m: null }, { id: 2, name: 'Historique' }] }, error: null });
    const data = await fetchSeaOperationData({ rpc } as unknown as SupabaseClient);
    expect(data.vessels.every((vessel) => vessel.draftMeters === null)).toBe(true);
  });

  it('saves only payload and expected revision, without accepting client actor metadata', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: record(), error: null });
    const client = { rpc } as unknown as SupabaseClient;
    const draft = emptySeaOperation();
    await saveSeaOperation(client, draft);
    expect(rpc).toHaveBeenLastCalledWith('sea_operation_save', { p_id: null, p_version: null, p_draft: draft });
    await saveSeaOperation(client, draft, { id: 'record-1', version: 2 });
    expect(rpc).toHaveBeenLastCalledWith('sea_operation_save', { p_id: 'record-1', p_version: 2, p_draft: draft });
  });

  it('signs the saved version and preserves server-authenticated signatory metadata', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: record({ status: 'signed', version: 4, can_edit: false, can_sign: false,
      signed_by: 'real-captain-id', signed_by_name: 'Capitaine authentifié', captain_name: 'Nom déclaré', signed_at: '2026-10-16T10:00:00Z' }), error: null });
    const result = await signSeaOperation({ rpc } as unknown as SupabaseClient, { id: 'record-1', version: 3 }, ' Nom déclaré ', true);
    expect(rpc).toHaveBeenCalledWith('sea_operation_sign', { p_id: 'record-1', p_version: 3, p_captain_name: 'Nom déclaré', p_acknowledged: true });
    expect(result).toMatchObject({ status: 'signed', version: 4, signedBy: 'real-captain-id', signedByName: 'Capitaine authentifié', canEdit: false });
  });

  it('propagates revision and permission failures instead of falling back to a writable form', async () => {
    const error = { code: '40001', message: 'Rechargez l’opération.' };
    const rpc = vi.fn().mockResolvedValue({ data: null, error });
    await expect(fetchSeaOperationDetail({ rpc } as unknown as SupabaseClient, 'record-1')).rejects.toBe(error);
    expect(rpc).toHaveBeenCalledWith('sea_operation_detail', { p_id: 'record-1' });
  });

  it.each([null, [], { id: 'bad', version: 1, status: 'signed', draft: null }, { ...record(), version: 0.5 },
    { ...record(), draft: { version: 1 } }, { ...record(), version: 0 }])(
    'rejects malformed record responses', (value) => expect(() => mapSeaOperationRecord(value)).toThrow('réponse'),
  );

  it('fails closed when the server omits permission booleans', () => {
    expect(mapSeaOperationRecord(record({ can_edit: undefined, can_sign: 'true' }))).toMatchObject({ canEdit: false, canSign: false });
  });

  it('keeps distinct same-day planning occurrences and their own linked data and actual captain permissions', async () => {
    const choices = [1, 2].map((id) => ({ operationId: `${id}:42`, projectId: String(id), project: `P${id}`, client: `Client ${id}`,
      clientContact: `Contact ${id}`, description: `Mission ${id}`, vessel: { id: '42', name: 'Navire', registrationImo: 'IMO1', departurePort: `Port ${id}`, arrivalPort: '', etd: '', eta: '' },
      captains: [{ personId: '5', name: 'Alice MARTIN', functionLabel: 'Capitaine', hasSignature: true, canSign: id === 1 }], canSign: id === 1 }));
    const rpc = vi.fn().mockResolvedValue({ data: { date: '2026-10-16', choices }, error: null });
    const result = await fetchSeaOperationPlanning({ rpc } as unknown as SupabaseClient, '2026-10-16');
    expect(rpc).toHaveBeenCalledWith('sea_operation_planning_context', { p_date: '2026-10-16' });
    expect(result.choices.map((choice) => [choice.operationId, choice.client, choice.captains[0].canSign])).toEqual([
      ['1:42', 'Client 1', true], ['2:42', 'Client 2', false],
    ]);
  });

  it('requests a signature for the exact planning choice before obtaining private image access', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: signature, error: null });
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://private.test/short-lived' }, error: null });
    const client = { rpc, storage: { from: vi.fn(() => ({ createSignedUrl })) } } as unknown as SupabaseClient;
    const result = await fetchSeaOperationCaptainSignature(client, '2026-10-16', '1:42', '4');
    expect(rpc).toHaveBeenCalledWith('sea_operation_captain_signature', { p_date: '2026-10-16', p_operation_id: '1:42', p_captain_person_id: '4' });
    expect(createSignedUrl).toHaveBeenCalledWith('immutable/captain-v1.png', 600);
    expect(result).toEqual({ snapshot: signature, url: 'https://private.test/short-lived' });
  });

  it('does not invent a signature when the selected captain has none', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) } as unknown as SupabaseClient;
    expect(await fetchSeaOperationCaptainSignature(client, '2026-10-16', '1:42', '4')).toBeNull();
  });

  it('orders vessels within one planning occurrence by decreasing fleet length', async () => {
    const base = { projectId: '1', project: 'P1', client: '', clientContact: '', description: '', captains: [], canSign: false };
    const vessel = { registrationImo: '', departurePort: '', arrivalPort: '', etd: '', eta: '' };
    const rpc = vi.fn().mockResolvedValue({ data: { date: '2026-10-16', choices: [
      { ...base, operationId: '1:2', vessel: { ...vessel, id: '2', name: 'Petit', lengthOverall: '12 m' } },
      { ...base, operationId: '1:3', vessel: { ...vessel, id: '3', name: 'Grand', lengthOverall: '42 m' } },
    ] }, error: null });
    expect((await fetchSeaOperationPlanning({ rpc } as unknown as SupabaseClient, '2026-10-16')).choices.map((choice) => choice.vessel.name)).toEqual(['Grand', 'Petit']);
  });

  it('keeps valid saved records readable when refreshing a signature URL is unavailable', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: record({ signature_snapshot: signature }), error: null });
    const client = { rpc, storage: { from: () => ({ createSignedUrl: vi.fn().mockRejectedValue(new Error('offline')) }) } } as unknown as SupabaseClient;
    const saved = await fetchSeaOperationDetail(client, 'record-1');
    expect(saved).toMatchObject({ id: 'record-1', signatureSnapshot: signature });
    expect(saved.signatureUrl).toBeUndefined();
  });

  it('exports the immutable snapshot bytes after checking their stored checksum', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const bytes = new Uint8Array([1, 2, 3]);
    const sha256 = Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256', bytes))).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const download = vi.fn().mockResolvedValue({ data: { arrayBuffer: async () => bytes.buffer }, error: null });
    const client = { storage: { from: () => ({ download }) } } as unknown as SupabaseClient;
    const saved = mapSeaOperationRecord(record({ signature_snapshot: { ...signature, sha256 } }));
    expect(await loadSeaOperationSignature(client, saved)).toBe('data:image/png;base64,AQID');
    expect(download).toHaveBeenCalledWith('immutable/captain-v1.png');
    saved.signatureSnapshot!.sha256 = '0'.repeat(64);
    await expect(loadSeaOperationSignature(client, saved)).rejects.toThrow('empreinte');
  });
});
