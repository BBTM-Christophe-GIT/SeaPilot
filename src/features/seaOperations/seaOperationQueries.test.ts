import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { emptySeaOperation } from './seaOperationModel';
import { fetchSeaOperationData, fetchSeaOperationDetail, mapSeaOperationRecord, saveSeaOperation, signSeaOperation } from './seaOperationQueries';

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
        { id: 1, name: 'Petit', length_overall: '12 m', registration_imo: '123', can_sign: false },
        { id: 2, name: 'Grand', length_overall: '45 m', registration_imo: '456', can_sign: true },
      ] }, error: null });
    const data = await fetchSeaOperationData({ rpc } as unknown as SupabaseClient);
    expect(data.actorId).toBe('crew-id');
    expect(data.records[0]).toMatchObject({ version: 3, canEdit: true, canSign: false, signedAt: null });
    expect(data.vessels.map((vessel) => vessel.id)).toEqual([2, 1]);
    expect(rpc).toHaveBeenCalledWith('sea_operations_overview', undefined);
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
});
