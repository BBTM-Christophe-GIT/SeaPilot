import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchManagerHomeDashboard } from './managerHomeData';
import { invalidateHomeReadCache } from './homeReadCache';

const TODAY = new Date(2026, 10, 2, 12);
function fixture() {
  let resolveAssignments!: () => void;
  const assignments = new Promise<void>((resolve) => { resolveAssignments = resolve; });
  const from = vi.fn((table: string) => {
    const query = {
      select: () => query, order: () => query, lte: () => query, gte: () => query, neq: () => query, eq: () => query, in: () => query,
      then: (resolve: (result: unknown) => unknown) => Promise.resolve(table === 'planning_assignments' ? assignments : undefined).then(() => ({ data: [], error: null })).then(resolve),
    };
    return query;
  });
  const rpc = vi.fn(async () => ({ data: [], error: null }));
  return { client: { from, rpc } as unknown as SupabaseClient, from, rpc, resolveAssignments: () => resolveAssignments() };
}
afterEach(() => { invalidateHomeReadCache(); });

describe('home queue loading', () => {
  it('starts independent office sources while assignments are pending and deduplicates concurrent remounts', async () => {
    const data = fixture();
    const first = fetchManagerHomeDashboard(data.client, TODAY, { roles: ['direction', 'admin'], personId: 1 });
    const duplicate = fetchManagerHomeDashboard(data.client, TODAY, { roles: ['admin', 'direction'], personId: 1 });
    expect(data.from).toHaveBeenCalledWith('purchase_requests');
    expect(data.from).toHaveBeenCalledWith('people');
    expect(data.from.mock.calls.filter(([table]) => table === 'planning_assignments')).toHaveLength(1);
    data.resolveAssignments();
    expect(await first).toEqual(await duplicate);
    await fetchManagerHomeDashboard(data.client, TODAY, { roles: ['admin', 'direction'], personId: 1 });
    expect(data.from.mock.calls.filter(([table]) => table === 'people')).toHaveLength(1);
    await fetchManagerHomeDashboard(data.client, TODAY, { roles: ['admin', 'direction'], personId: 1 }, { forceRefresh: true });
    expect(data.from.mock.calls.filter(([table]) => table === 'people')).toHaveLength(2);
  });

  it.each(['marin', 'capitaine'] as const)('retains the assignment authorization boundary for real %s readers', async (role) => {
    const data = fixture();
    const pending = fetchManagerHomeDashboard(data.client, TODAY, { roles: [role], personId: 42 });
    expect(data.from.mock.calls.map(([table]) => table)).toEqual(['planning_assignments']);
    expect(data.rpc).not.toHaveBeenCalled();
    data.resolveAssignments();
    await expect(pending).resolves.toMatchObject({ items: [], scopeLabel: 'Aucune affectation active' });
    expect(data.from.mock.calls.map(([table]) => table)).toEqual(['planning_assignments']);
  });

  it('does not reuse the queue for a different module-permission context', async () => {
    const data = fixture(); data.resolveAssignments();
    await fetchManagerHomeDashboard(data.client, TODAY, { roles: ['admin'], personId: 1, moduleKeys: ['humanResources'] });
    await fetchManagerHomeDashboard(data.client, TODAY, { roles: ['admin'], personId: 1, moduleKeys: ['purchaseRequests'] });
    expect(data.from.mock.calls.filter(([table]) => table === 'people')).toHaveLength(2);
  });
});
