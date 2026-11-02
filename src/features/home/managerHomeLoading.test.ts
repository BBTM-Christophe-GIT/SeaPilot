import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchManagerHomeDashboard } from './managerHomeData';
import { invalidateHomeReadCache } from './homeReadCache';
import { invalidateProcessPerformanceCache } from './processPerformanceQueries';

const TODAY = new Date(2026, 10, 2, 12);
function fixture() {
  let resolveAssignments!: () => void;
  const assignments = new Promise<void>((resolve) => { resolveAssignments = resolve; });
  let onAuthChange: (event: string, session: { user: { id: string } } | null) => void = () => undefined;
  const from = vi.fn((table: string) => {
    const query = {
      select: () => query, order: () => query, lte: () => query, gte: () => query, neq: () => query, eq: () => query, in: () => query,
      then: (resolve: (result: unknown) => unknown) => Promise.resolve(table === 'planning_assignments' ? assignments : undefined).then(() => ({
        data: table === 'purchase_requests' ? [{ id: 1, title: 'Achat à traiter', requested_on: '2026-11-02', status: 'En attente' }] : [], error: null,
      })).then(resolve),
    };
    return query;
  });
  const rpc = vi.fn(async () => ({ data: [], error: null }));
  const auth = { onAuthStateChange: (callback: typeof onAuthChange) => { onAuthChange = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; } };
  return { client: { from, rpc, auth } as unknown as SupabaseClient, from, rpc, resolveAssignments: () => resolveAssignments(),
    auth: (event: string, userId: string | null) => onAuthChange(event, userId === null ? null : { user: { id: userId } }),
  };
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

  it.each(['radar-refresh', 'force-refresh', 'TOKEN_REFRESHED', 'SIGNED_IN'] as const)('keeps the pending queue usable after %s for the same account', async (event) => {
    const data = fixture();
    const viewer = { roles: ['admin'] as Array<'admin'>, personId: 1 };
    const pending = fetchManagerHomeDashboard(data.client, TODAY, viewer);
    data.auth('INITIAL_SESSION', 'user-a');
    let refreshed: Promise<unknown> | undefined;
    if (event === 'radar-refresh') invalidateProcessPerformanceCache(data.client);
    else if (event === 'force-refresh') refreshed = fetchManagerHomeDashboard(data.client, TODAY, viewer, { forceRefresh: true });
    else data.auth(event, 'user-a');
    data.resolveAssignments();
    const result = await pending;
    expect(result.items.map((item) => item.title)).toEqual(['DA-2026-001 · Achat à traiter']);
    expect(result.unavailableSources).toEqual([]);
    if (refreshed) await expect(refreshed).resolves.toMatchObject({ unavailableSources: [] });
    await fetchManagerHomeDashboard(data.client, TODAY, viewer);
    expect(data.from.mock.calls.filter(([table]) => table === 'people')).toHaveLength(2);
  });

  it.each([
    { event: 'SIGNED_OUT', userId: null, known: true },
    { event: 'SIGNED_IN', userId: 'user-b', known: true },
    { event: 'TOKEN_REFRESHED', userId: 'user-b', known: true },
    { event: 'INITIAL_SESSION', userId: 'user-b', known: true },
    { event: 'SIGNED_IN', userId: 'user-a', known: false },
  ])('rejects the old pending queue across $event (known identity: $known)', async ({ event, userId, known }) => {
    const data = fixture();
    const pending = fetchManagerHomeDashboard(data.client, TODAY, { roles: ['admin'], personId: 1 });
    const rejected = expect(pending).rejects.toThrow('Le contexte de lecture a changé');
    if (known) data.auth('INITIAL_SESSION', 'user-a');
    data.auth(event, userId);
    data.resolveAssignments();
    await rejected;
    await expect(fetchManagerHomeDashboard(data.client, TODAY, { roles: ['admin'], personId: 1 })).resolves.toMatchObject({ unavailableSources: [] });
    expect(data.from.mock.calls.filter(([table]) => table === 'people')).toHaveLength(2);
  });
});
