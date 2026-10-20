import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchPurchaseRequests } from './purchaseRequestQueries';

function clientFixture(ownIds: unknown, rows: unknown[] = [], error: unknown = null) {
  const filters: Array<{ table: string; column: string; values: number[] } | { table: string; expression: string }> = [];
  const rpc = vi.fn().mockResolvedValue({ data: ownIds, error });
  const storage = { from: vi.fn() };
  const from = vi.fn((table: string) => {
    const data = table === 'purchase_requests' ? rows : table === 'purchase_request_attachments'
      ? [10, 11, 12, 13].map((id) => ({ id: id + 100, purchase_request_id: id, title: `${id}.pdf`, storage_path: `${id}/proof.pdf` }))
      : [10, 11, 12, 13].map((id) => ({ id: id + 200, purchase_request_id: id, event_type: 'created' }));
    const query = {
      select: () => query,
      order: () => query,
      in: (column: string, values: number[]) => { filters.push({ table, column, values }); return query; },
      or: (expression: string) => { filters.push({ table, expression }); return query; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
    };
    return query;
  });
  return { client: { rpc, from, storage } as unknown as SupabaseClient, rpc, from, storage, filters };
}

describe('purchase own submission visibility', () => {
  const rows = [
    { id: 10, title: 'Affectation courante', vessel_id: 1 },
    { id: 11, title: 'Ma demande sans navire', vessel_id: null },
    { id: 12, title: 'Ma demande après débarquement', vessel_id: 99 },
    { id: 13, title: 'Demande privée d’un autre compte', vessel_id: 99 },
  ];

  it('keeps server-owned submissions alongside assigned vessels without admitting another author’s rows or metadata', async () => {
    const { client, rpc, storage, filters } = clientFixture([11, '12', 11], rows);
    const result = await fetchPurchaseRequests(client, [1]);

    expect(rpc).toHaveBeenCalledExactlyOnceWith('purchase_request_own_submission_ids');
    expect(result.map((row) => row.id)).toEqual([10, 11, 12]);
    expect(result.map((row) => row.attachments.map((attachment) => attachment.id))).toEqual([[110], [111], [112]]);
    expect(result.map((row) => row.events.map((event) => event.id))).toEqual([[210], [211], [212]]);
    expect(filters).toEqual([
      { table: 'purchase_requests', expression: 'vessel_id.in.(1),id.in.(11,12)' },
      { table: 'purchase_request_attachments', column: 'purchase_request_id', values: [10, 11, 12] },
      { table: 'purchase_request_events', column: 'purchase_request_id', values: [10, 11, 12] },
    ]);
    expect(storage.from).not.toHaveBeenCalled();
  });

  it('retains a submitted request after a fresh load when the account has no assigned vessel', async () => {
    const { client, filters } = clientFixture([11], rows);
    for (let load = 0; load < 2; load++) {
      const result = await fetchPurchaseRequests(client, []);
      expect(result.map((row) => row.id)).toEqual([11]);
    }
    expect(filters[0]).toEqual({ table: 'purchase_requests', column: 'id', values: [11] });
  });

  it('does not query company data when both server scopes are empty', async () => {
    const { client, from, storage } = clientFixture([]);
    await expect(fetchPurchaseRequests(client, [])).resolves.toEqual([]);
    expect(from).not.toHaveBeenCalled();
    expect(storage.from).not.toHaveBeenCalled();
  });

  it.each([null, {}, ['other-user'], [true], [0], [-1], [1.2], [Number.MAX_SAFE_INTEGER + 1]])(
    'fails closed before reading requests or files on malformed own scope: %j', async (ownIds) => {
      const { client, from, storage } = clientFixture(ownIds, rows);
      await expect(fetchPurchaseRequests(client, [1])).rejects.toThrow('Impossible de vérifier vos demandes soumises');
      expect(from).not.toHaveBeenCalled();
      expect(storage.from).not.toHaveBeenCalled();
    },
  );

  it('propagates an unavailable or refused ownership RPC without company-wide fallback', async () => {
    const error = { code: '42501', message: 'Scope refused' };
    const { client, from } = clientFixture(null, rows, error);
    await expect(fetchPurchaseRequests(client, [1])).rejects.toEqual(error);
    expect(from).not.toHaveBeenCalled();
  });

  it('preserves the office company-wide read without requiring an ownership RPC', async () => {
    const { client, rpc } = clientFixture(null, rows);
    const result = await fetchPurchaseRequests(client);
    expect(result.map((row) => row.id)).toEqual([10, 11, 12, 13]);
    expect(rpc).not.toHaveBeenCalled();
  });
});
