import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { loadRegisterPerformance } from './processPerformanceRegisters';
import type { ProcessPerformanceScope } from './processPerformanceScope';

const company: ProcessPerformanceScope = { kind: 'company', label: 'Société', personId: 1, personIds: [], vesselIds: [], vesselNames: [], watchGroups: [] };
const watch: ProcessPerformanceScope = { ...company, kind: 'watch', label: 'Bordée', vesselIds: [2], vesselNames: ['GOURY'], personIds: [1, 2] };
type Row = Record<string, unknown>;

function fixtureClient(tables: Record<string, Row[]> = {}, options: { failedTable?: string; failedOffset?: number; vessels?: { id: number; name: string }[]; exercises?: number } = {}) {
  const selections: { table: string; select: string; filters: [string, string, unknown][]; offset: number; until: number }[] = [];
  const from = vi.fn((table: string) => {
    const read = { table, select: '', filters: [] as [string, string, unknown][], offset: 0, until: 499 };
    selections.push(read);
    const query = {
      select(columns: string) { read.select = columns; return query; },
      in(key: string, value: unknown[]) { read.filters.push(['in', key, value]); return query; },
      eq(key: string, value: unknown) { read.filters.push(['eq', key, value]); return query; },
      is(key: string, value: unknown) { read.filters.push(['is', key, value]); return query; },
      order() { return query; },
      range(offset: number, until: number) { read.offset = offset; read.until = until; return query; },
      then(resolve: (result: { data: Row[] | null; error: Error | null }) => unknown) {
        if (options.failedTable === table && read.offset === (options.failedOffset || 0)) return Promise.resolve({ data: null, error: new Error('unavailable') }).then(resolve);
        const data = (tables[table] || []).filter((row) => read.filters.every(([operator, key, value]) => {
          if (operator === 'in') return (value as unknown[]).includes(row[key]);
          return row[key] === value || (operator === 'is' && row[key] === undefined);
        })).slice(read.offset, read.until + 1);
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return query;
  });
  const vessels = options.vessels || [{ id: 1, name: 'Autre navire' }, { id: 2, name: 'GOURY' }];
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    if (name === 'emergency_exercises_people') return { data: { scope: 'watch', people: [], vessels }, error: null };
    if (name === 'emergency_exercises_report') return { data: { person: args?.target_person_id ? { id: args.target_person_id, name: 'Self', current: true, former: false } : null,
      vessel: vessels.find((vessel) => vessel.id === args?.target_vessel_id), year: args?.target_year,
      counts: options.exercises ? [{ exercise_key: 'fire', exercise_name: 'Incendie', month: 5, count: options.exercises }] : [] }, error: null };
    return { data: vessels, error: null };
  });
  return { client: { from, rpc } as unknown as SupabaseClient, from, rpc, selections };
}

describe('Permission-scoped register performance', () => {
  it('does not query hidden registers or medical logbook clinical content', async () => {
    const fixture = fixtureClient();
    expect(await loadRegisterPerformance(fixture.client, [], company, '2026-11-01')).toEqual([]);
    const [medical] = await loadRegisterPerformance(fixture.client, ['medicalLogbook'], company, '2026-11-01');
    expect(medical.score).toBeNull();
    expect(medical.summary).toContain('confidentiel');
    expect(fixture.from).not.toHaveBeenCalled();
    expect(fixture.rpc).not.toHaveBeenCalled();
  });

  it('never falls back to company-wide data for a self/watch scope without vessels', async () => {
    const fixture = fixtureClient();
    const results = await loadRegisterPerformance(fixture.client, ['chemicals', 'lsa', 'lifting', 'pharmacy', 'emergencyExercises'], { ...watch, kind: 'self', vesselIds: [] }, '2026-11-01');
    expect(results).toHaveLength(5);
    expect(results.every((process) => process.score === null && process.tasks.length === 0)).toBe(true);
    expect(fixture.from).not.toHaveBeenCalled();
    expect(fixture.rpc).not.toHaveBeenCalled();
  });

  it('intersects a real role-scoped vessel RPC with the watch scope on every page', async () => {
    const fixture = fixtureClient({ lifting_inventory: [
      { id: 1, vessel_id: 1, kind: 'lifting', reference: 'Other vessel secret', active: true, inspection_due_on: '2025-01-01' },
      { id: 2, vessel_id: 2, kind: 'lifting', reference: 'GOURY 02', active: true, inspection_due_on: '2025-01-01' },
    ] });
    const [process] = await loadRegisterPerformance(fixture.client, ['lifting'], watch, '2026-11-01');
    expect(process.tasks.map((task) => task.title)).toEqual(['GOURY 02']);
    expect(fixture.rpc).toHaveBeenCalledWith('lifting_available_vessels');
    expect(fixture.selections.every((selection) => selection.filters.some(([operator, key, value]) => operator === 'in' && key === 'vessel_id' && JSON.stringify(value) === '[2]'))).toBe(true);
  });

  it('keeps LSA expiry risk visible after booking and checks the date and place', async () => {
    const fixture = fixtureClient({ lsa_items: [
      { id: 1, vessel_id: 2, title: 'Périmé', expires_on: '2026-10-30', planned_on: '2026-11-05', visit_location: 'Port' },
      { id: 2, vessel_id: 2, title: 'À renouveler', expires_on: '2026-11-16', planned_on: '2026-11-10', visit_location: 'Le Havre' },
      { id: 3, vessel_id: 2, title: 'Plan trop tardif', expires_on: '2026-11-05', planned_on: '2026-11-10', visit_location: 'Le Havre' },
      { id: 4, vessel_id: 2, title: 'Sans date', expires_on: null },
    ] });
    const [process] = await loadRegisterPerformance(fixture.client, ['lsa'], watch, '2026-11-01');
    expect(process.tasks.find((task) => task.title === 'Périmé')?.state).toBe('overdue');
    expect(process.tasks.find((task) => task.title === 'À renouveler')).toMatchObject({ state: 'planned', scheduledOn: '2026-11-10', location: 'Le Havre', to: '/modules/lsa?vessel=2&item=2' });
    expect(process.tasks.find((task) => task.title === 'Plan trop tardif')?.state).toBe('unplanned');
    expect(process.score).toBeLessThan(100);
    expect(process.summary).toContain('1 date(s) à vérifier');
  });

  it('does not award perfect LSA or pharmacy scores to an empty/undated source', async () => {
    const fixture = fixtureClient({ lsa_items: [{ id: 1, vessel_id: 2, title: 'Date inconnue', expires_on: null }] });
    const results = await loadRegisterPerformance(fixture.client, ['lsa', 'pharmacy'], watch, '2026-11-01');
    expect(results.every((process) => process.score === null)).toBe(true);
    expect(results[0].tasks[0].state).toBe('unplanned');
  });

  it('uses current lifting inventory deadlines without querying draft/report snapshots', async () => {
    const fixture = fixtureClient({ lifting_inventory: [
      { id: 1, vessel_id: 2, kind: 'lifting', reference: 'À jour', active: true, inspection_due_on: '2027-01-01' },
      { id: 2, vessel_id: 2, kind: 'towing', reference: 'Remorque', active: true, inspection_due_on: null },
    ] });
    const [process] = await loadRegisterPerformance(fixture.client, ['lifting'], watch, '2026-11-01');
    expect(process.score).toBe(50);
    expect(process.tasks[0]).toMatchObject({ state: 'unplanned', to: '/modules/lifting/remorques?vessel=2&item=2' });
    expect(fixture.from.mock.calls.map(([table]) => table)).toEqual(['lifting_inventory']);
  });

  it('measures chemical FDS and storage completeness using scoped attachment metadata only', async () => {
    const fixture = fixtureClient({ chemical_products: [
      { id: 'one', vessel_id: 2, brand: 'A', product_type: 'Nettoyant', storage_location: 'Local A' },
      { id: 'two', vessel_id: 2, brand: 'B', product_type: 'Huile', storage_location: '' },
    ], chemical_attachments: [{ id: 'a', product_id: 'one', kind: 'fds' }, { id: 'b', product_id: 'two', kind: 'other' }] });
    const [process] = await loadRegisterPerformance(fixture.client, ['chemicals'], watch, '2026-11-01');
    expect(process.score).toBe(50);
    expect(process.tasks[0].to).toBe('/modules/chemicals?vessel=2&product=two');
    expect(fixture.selections.find((selection) => selection.table === 'chemical_attachments')?.select).toBe('id,product_id,kind');
  });

  it('reuses pharmacy expiry and numeric stock thresholds, retaining unknown unit formats for review', async () => {
    const fixture = fixtureClient({ pharmacy_inventory: [
      { id: 1, vessel_id: 2, designation: 'Périmé', active: true, expires_on: '2026-10-31', quantity: '2', required_quantity: '5' },
      { id: 2, vessel_id: 2, designation: 'Conditionnement', active: true, expires_on: '2027-05-01', quantity: '1 boîte de 20', required_quantity: '10' },
    ], pharmacy_controls: [{ id: 1, vessel_id: 2, is_current: true, expires_on: '2027-06-01' }] });
    const [process] = await loadRegisterPerformance(fixture.client, ['pharmacy'], watch, '2026-11-01');
    expect(process.tasks.find((task) => task.title === 'Périmé')).toMatchObject({ state: 'overdue', to: '/modules/pharmacy?vessel=2&item=1&filter=expiry' });
    expect(process.tasks.find((task) => task.title === 'Conditionnement')?.context).toContain('Stock à vérifier');
    expect(process.score).toBeLessThan(100);
    expect(process.summary).toContain('1 stock(s) insuffisant(s)');
  });

  it('paginates full equipment inventories and invalidates partial failures', async () => {
    const inventory = Array.from({ length: 501 }, (_, index) => ({ id: index + 1, vessel_id: 2, kind: 'lifting', reference: `Matériel ${index}`, active: true, inspection_due_on: '2026-01-01' }));
    const fixture = fixtureClient({ lifting_inventory: inventory });
    const [complete] = await loadRegisterPerformance(fixture.client, ['lifting'], watch, '2026-11-01');
    expect(complete.tasks).toHaveLength(501);
    expect(fixture.selections.map((selection) => selection.offset)).toEqual([0, 500]);
    const failing = fixtureClient({ lifting_inventory: inventory }, { failedTable: 'lifting_inventory', failedOffset: 500 });
    const [unavailable] = await loadRegisterPerformance(failing.client, ['lifting'], watch, '2026-11-01');
    expect(unavailable.score).toBeNull();
    expect(unavailable.tasks).toEqual([]);
    expect(unavailable.unavailableSources).toEqual(['Levage et remorques']);
  });

  it('reports scoped exercise counts without inventing an annual compliance objective', async () => {
    const fixture = fixtureClient({}, { exercises: 12 });
    const [process] = await loadRegisterPerformance(fixture.client, ['emergencyExercises'], watch, '2026-11-01');
    expect(process.score).toBeNull();
    expect(process.summary).toContain('12 exercice(s)');
    expect(process.criteria[0].detail).toContain('Aucun objectif annuel ou mensuel');
    expect(fixture.rpc).toHaveBeenCalledWith('emergency_exercises_report', { target_person_id: null, target_year: 2026, target_vessel_id: 2, target_population: 'current' });
  });
});
