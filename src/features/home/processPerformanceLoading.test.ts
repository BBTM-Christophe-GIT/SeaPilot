import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchProcessPerformance, fetchProcessPerformanceDashboard, invalidateProcessPerformanceCache } from './processPerformanceQueries';
import { HOME_READ_CACHE_TTL_MS } from './homeReadCache';
import { loadRegisterPerformance } from './processPerformanceRegisters';

vi.mock('./processPerformanceRegisters', () => ({
  createRegisterPerformanceCache: () => new Map(),
  loadRegisterPerformance: vi.fn(async () => []),
}));

const TODAY = '2026-11-02';
const MODULES = ['humanResources', 'purchaseRequests'] as const;
type Row = Record<string, unknown>;
function deferred() {
  let resolve!: () => void;
  return { promise: new Promise<void>((done) => { resolve = done; }), resolve: () => resolve() };
}
function fixture(gates: Record<string, Promise<void>> = {}) {
  const tables: Record<string, Row[]> = {
    vessels: [{ id: 1, name: 'GOURY', active: true, asset_kind: 'vessel' }, { id: 2, name: 'SUROIT', active: true, asset_kind: 'vessel' }],
    people: [{ id: 11, first_name: 'Personne', last_name: 'AUTORISÉE', active: true, hired_on: '2020-01-01', photo_storage_path: 'private/photo.jpg' }],
    planning_assignments: [{ id: 1, vessel_id: 1, crew_person_id: 11, captain_person_id: 12, watch_group: 'Bleu', starts_on: '2026-01-01', ends_on: '2026-12-31', confirmation_status: 'confirmed', vessels: { name: 'GOURY' } }],
    hr_documents: [{ id: 1, person_id: 11, category_key: 'certificate', title: 'Brevet à renouveler', status: 'expired', expires_on: '2026-01-01' }],
    purchase_requests: [{ id: 1, vessel_id: 1, title: 'Demande à traiter', requested_on: '2026-01-01', status: 'submitted', approval_status: 'pending' }],
  };
  const calls: Array<{ table: string; columns: string }> = [];
  const failures = new Set<string>();
  let onAuthChange: (event: string) => void = () => undefined;
  const from = vi.fn((table: string) => {
    const call = { table, columns: '' }; calls.push(call);
    let start = 0; let end = 499;
    const filters: Array<(row: Row) => boolean> = [];
    const query = {
      select: (columns: string) => { call.columns = columns; return query; }, order: () => query,
      range: (a: number, b: number) => { start = a; end = b; return query; },
      in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return query; },
      eq: () => query, lte: () => query, gte: () => query, neq: () => query,
      then: (resolve: (result: unknown) => unknown) => Promise.resolve(gates[table]).then(() => ({
        data: (tables[table] || []).filter((row) => filters.every((filter) => filter(row))).slice(start, end + 1),
        error: failures.has(table) ? new Error('indisponible') : null,
      })).then(resolve),
    };
    return query;
  });
  const download = vi.fn();
  const client = { from, rpc: vi.fn(), storage: { from: () => ({ download }) }, auth: {
    onAuthStateChange: vi.fn((callback: (event: string) => void) => { onAuthChange = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; }),
  } } as unknown as SupabaseClient;
  return { client, calls, tables, failures, download, auth: (event: string) => onAuthChange(event), count: (table: string) => calls.filter((call) => call.table === table).length };
}
const modules = () => [...MODULES];

afterEach(() => { invalidateProcessPerformanceCache(); vi.clearAllMocks(); vi.useRealTimers(); });

describe('progressive performance reads', () => {
  it('loads global and catalogue first, then only the requested unit, and reuses sources for comparison', async () => {
    const data = fixture();
    const initial = await fetchProcessPerformanceDashboard(data.client, ['admin'], TODAY, 99, modules(), { includeEntities: false });
    expect(initial.processes.map((process) => process.key)).toEqual(['humanResources', 'purchases']);
    expect(initial.entities.map((entity) => [entity.id, entity.processesLoaded, entity.processes])).toEqual([[1, false, []], [2, false, []]]);
    expect(data.count('planning_assignments')).toBe(0);
    expect(loadRegisterPerformance).toHaveBeenCalledTimes(1);
    expect(data.download).not.toHaveBeenCalled();
    expect(data.calls.find((call) => call.table === 'people')?.columns).not.toMatch(/photo|phone|email|emergency|identity/);
    expect(data.calls.find((call) => call.table === 'hr_documents')?.columns).not.toMatch(/storage|file|drive|url/);

    const selected = await fetchProcessPerformanceDashboard(data.client, ['admin'], TODAY, 99, modules(), { entityIds: [1, 999] });
    expect(selected.entities.map((entity) => [entity.id, entity.processesLoaded])).toEqual([[1, true], [2, false]]);
    expect(selected.entities[0].processes[0].tasks.some((task) => task.title === 'Brevet à renouveler')).toBe(true);
    expect(data.count('planning_assignments')).toBe(1);
    expect(loadRegisterPerformance).toHaveBeenCalledTimes(2);

    const comparison = await fetchProcessPerformanceDashboard(data.client, ['admin'], TODAY, 99, modules());
    expect(comparison.entities.every((entity) => entity.processesLoaded)).toBe(true);
    expect(loadRegisterPerformance).toHaveBeenCalledTimes(3);
    for (const table of ['people', 'hr_documents', 'hr_action_plans', 'purchase_requests', 'vessels', 'planning_assignments']) expect(data.count(table)).toBe(1);
    expect(vi.mocked(loadRegisterPerformance).mock.calls.map((call) => call[4]).every((cache) => cache === vi.mocked(loadRegisterPerformance).mock.calls[0][4])).toBe(true);
  });

  it('starts permitted independent reads before HR visibility or catalogue resolves, without querying hidden documents early', async () => {
    const rules = deferred(); const catalogue = deferred();
    const data = fixture({ hr_visibility_rules: rules.promise, vessels: catalogue.promise });
    const pending = fetchProcessPerformanceDashboard(data.client, ['direction'], TODAY, 99, modules(), { includeEntities: false });
    await vi.waitFor(() => expect(data.count('vessels')).toBe(1));
    expect(data.count('people')).toBe(1);
    expect(data.count('purchase_requests')).toBe(1);
    expect(data.count('hr_documents')).toBe(0);
    expect(data.count('planning_assignments')).toBe(0);
    rules.resolve();
    await vi.waitFor(() => expect(data.count('hr_documents')).toBe(1));
    catalogue.resolve();
    await expect(pending).resolves.toMatchObject({ scopeLabel: 'Périmètre compagnie' });
  });

  it('deduplicates concurrent normalized contexts, including legacy global-only reads', async () => {
    const people = deferred(); const data = fixture({ people: people.promise });
    const a = fetchProcessPerformanceDashboard(data.client, ['direction', 'admin'], TODAY, 99, modules(), { includeEntities: false });
    const b = fetchProcessPerformanceDashboard(data.client, ['admin', 'direction'], TODAY, 99, ['purchaseRequests', 'humanResources'], { includeEntities: false });
    const global = fetchProcessPerformance(data.client, ['admin', 'direction'], TODAY, 99, modules());
    await vi.waitFor(() => expect(data.count('people')).toBe(1));
    people.resolve();
    const [first, second, legacy] = await Promise.all([a, b, global]);
    expect(first).toEqual(second); expect(legacy).toEqual(first.processes);
    expect(data.count('people')).toBe(1); expect(data.count('vessels')).toBe(1);
  });

  it('keeps clients, linked people, roles, module grants and calendar dates in separate contexts', async () => {
    const data = fixture(); const other = fixture();
    const read = (client = data.client, date = TODAY, person = 99, roles = ['admin'] as const, keys = modules()) => fetchProcessPerformanceDashboard(client, [...roles], date, person, keys, { includeEntities: false });
    await read(); await read(); expect(data.count('people')).toBe(1);
    await read(other.client); expect(other.count('people')).toBe(1);
    await read(data.client, '2026-11-03');
    await read(data.client, TODAY, 100);
    await fetchProcessPerformanceDashboard(data.client, ['direction'], TODAY, 99, modules(), { includeEntities: false });
    expect(data.count('people')).toBe(4);
    const hidden = await read(data.client, TODAY, 99, ['admin'], ['purchaseRequests']);
    expect(hidden.processes.map((process) => process.key)).toEqual(['purchases']);
    expect(data.count('people')).toBe(4);
  });

  it('expires retained reads and bounds contexts without persisting private values', async () => {
    vi.useFakeTimers(); const data = fixture();
    const read = (personId = 99) => fetchProcessPerformanceDashboard(data.client, ['admin'], TODAY, personId, modules(), { includeEntities: false });
    await read(); await read(); expect(data.count('people')).toBe(1);
    await vi.advanceTimersByTimeAsync(HOME_READ_CACHE_TTL_MS + 1);
    await read(); expect(data.count('people')).toBe(2);
    for (let id = 100; id < 108; id += 1) await read(id);
    await read(); expect(data.count('people')).toBe(11);
  });

  it('invalidates explicit refresh and auth changes, rejecting stale requests already in flight', async () => {
    const data = fixture();
    const read = () => fetchProcessPerformanceDashboard(data.client, ['admin'], TODAY, 99, modules(), { includeEntities: false });
    await read(); data.auth('INITIAL_SESSION'); await read(); expect(data.count('people')).toBe(1);
    data.auth('SIGNED_OUT'); await read(); expect(data.count('people')).toBe(2);
    await fetchProcessPerformanceDashboard(data.client, ['admin'], TODAY, 99, modules(), { includeEntities: false, forceRefresh: true });
    expect(data.count('people')).toBe(3);
    invalidateProcessPerformanceCache(data.client); await read(); expect(data.count('people')).toBe(4);

    const people = deferred(); const pendingData = fixture({ people: people.promise });
    const pending = fetchProcessPerformanceDashboard(pendingData.client, ['admin'], TODAY, 99, modules(), { includeEntities: false });
    const rejected = expect(pending).rejects.toThrow('Le contexte de lecture a changé');
    await vi.waitFor(() => expect(pendingData.count('people')).toBe(1));
    pendingData.auth('SIGNED_OUT'); people.resolve(); await rejected;
  });

  it('allows immediate retry after partial source failures', async () => {
    const data = fixture(); data.failures.add('people');
    const first = await fetchProcessPerformanceDashboard(data.client, ['admin'], TODAY, 99, modules(), { includeEntities: false });
    expect(first.processes[0].unavailableSources).toContain('Collaborateurs');
    data.failures.clear();
    const retried = await fetchProcessPerformanceDashboard(data.client, ['admin'], TODAY, 99, modules(), { includeEntities: false });
    expect(data.count('people')).toBe(2);
    expect(retried.processes[0].unavailableSources).not.toContain('Collaborateurs');
  });
});
