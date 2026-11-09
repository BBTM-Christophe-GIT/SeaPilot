import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { buildExercisePerformance, loadRegisterPerformance, loadRegisterPerformanceDashboard, type ExercisePerformanceSnapshot } from './processPerformanceRegisters';
import type { ProcessPerformanceScope } from './processPerformanceScope';

const company: ProcessPerformanceScope = { kind: 'company', label: 'Société', personId: 1, personIds: [], vesselIds: [], vesselNames: [], watchGroups: [] };
const watch: ProcessPerformanceScope = { ...company, kind: 'watch', label: 'Bordée', vesselIds: [2], vesselNames: ['GOURY'], personIds: [1, 2] };
const exerciseTypes = [
  { key: 'fire-protection', label: 'Protection contre l’incendie', cadenceMonths: 1 as const },
  { key: 'abandon-ship', label: 'Évacuation et abandon du navire', cadenceMonths: 1 as const },
];
const exerciseCounts = (fire = 0, abandon = 0) => ({ 'fire-protection': fire, 'abandon-ship': abandon });
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
    if (name === 'emergency_exercises_performance') return { data: {
      schemaVersion: 2, scope: 'fleet', year: args?.target_year, asOf: '2026-11-01', vessels, exerciseTypes,
      crewDays: vessels.map((vessel) => ({ vesselId: vessel.id, on: `${args?.target_year}-10-01`, count: 1 })),
      personMonths: [{ personId: 9, personName: 'Fixture marin', month: 10, fireCount: (options.exercises || 0) * vessels.length,
        abandonCount: 0, counts: exerciseCounts((options.exercises || 0) * vessels.length), tbtCount: 0, presenceDays: 1,
        units: vessels.map((vessel) => ({ vesselId: vessel.id, fireCount: options.exercises || 0, abandonCount: 0,
          counts: exerciseCounts(options.exercises), tbtCount: 0, presenceDays: 1 })) }],
    }, error: null };
    if (name === 'emergency_exercises_people') return { data: { scope: 'watch', people: [], vessels }, error: null };
    if (name === 'emergency_exercises_report') return { data: { person: args?.target_person_id ? { id: args.target_person_id, name: 'Self', current: true, former: false } : null,
      vessel: vessels.find((vessel) => vessel.id === args?.target_vessel_id), year: args?.target_year,
      counts: options.exercises ? [{ exercise_key: 'fire', exercise_name: 'Incendie', month: 5, count: options.exercises }] : [] }, error: null };
    return { data: vessels, error: null };
  });
  return { client: { from, rpc } as unknown as SupabaseClient, from, rpc, selections };
}

describe('Permission-scoped register performance', () => {
  it('assigns zero to an absent LSA register on an authorized active vessel and keeps a quay non-applicable', async () => {
    const fixture = fixtureClient({ lsa_items: [{ id: 1, vessel_id: 1, title: 'À jour', expires_on: '2027-05-01' }] });
    const data = await loadRegisterPerformanceDashboard(fixture.client, ['lsa'], company, '2026-11-01', [watch]);
    expect(data.processes[0].score).toBe(50);
    expect(data.entities[0][0].score).toBe(0);
    expect(data.entities[0][0].tasks[0]).toMatchObject({ id: 'lsa-register-missing-2', to: '/modules/lsa?vessel=2' });
    const quay = fixtureClient({}, { vessels: [{ id: 2, name: 'QUAI LE HAVRE' }] });
    expect((await loadRegisterPerformance(quay.client, ['lsa', 'lifting'], watch, '2026-11-01')).every((process) => process.score === null)).toBe(true);
  });

  it('does not hide an absent towing register behind current lifting equipment', async () => {
    const fixture = fixtureClient({ lifting_inventory: [{ id: 1, vessel_id: 2, reference: 'Apparaux', kind: 'lifting', active: true, inspection_due_on: '2027-01-01' }] });
    const [lifting, towing] = await loadRegisterPerformance(fixture.client, ['lifting'], watch, '2026-11-01');
    expect(lifting.score).toBe(100);
    expect(towing.score).toBe(0);
    expect(towing.criteria[0]).toMatchObject({ id: 'towing-controls', score: 0 });
    expect(towing.tasks[0]).toMatchObject({ id: 'lifting-register-towing-2', to: '/modules/lifting/remorques?vessel=2' });
  });

  it('shares authorized inventory reads across entity comparisons and leaves an office non-applicable', async () => {
    const fixture = fixtureClient({ lifting_inventory: [
      { id: 1, vessel_id: 1, reference: 'À jour', kind: 'lifting', active: true, inspection_due_on: '2027-05-01' },
      { id: 2, vessel_id: 2, reference: 'Échu', kind: 'lifting', active: true, inspection_due_on: '2026-01-01' },
    ] });
    const entityScopes = [1, 2, 3].map((id) => ({ ...watch, vesselIds: [id], label: `Entité ${id}` }));
    const result = await loadRegisterPerformanceDashboard(fixture.client, ['lifting', 'medicalLogbook'], company, '2026-11-01', entityScopes);
    expect(result.processes[0].score).toBe(50);
    expect(result.entities.map((processes) => processes[0].score)).toEqual([100, 0, null]);
    expect(result.entities.every((processes) => processes.map((process) => process.key).join() === 'lifting,towing')).toBe(true);
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
    expect(fixture.from).toHaveBeenCalledTimes(1);
    expect(fixture.selections[0].table).toBe('lifting_inventory');
  });


  it('reuses only chemical attachment metadata without repeating product reads for each entity', async () => {
    const fixture = fixtureClient({ chemical_products: [
      { id: 'a', vessel_id: 1, brand: 'A', product_type: 'Nettoyant', storage_location: 'Local A' },
      { id: 'b', vessel_id: 2, brand: 'B', product_type: 'Huile', storage_location: '' },
    ], chemical_attachments: [{ id: 'aa', product_id: 'a', kind: 'fds' }] });
    const result = await loadRegisterPerformanceDashboard(fixture.client, ['chemicals'], company, '2026-11-01', [
      { ...watch, vesselIds: [1] }, { ...watch, vesselIds: [2] },
    ]);
    expect(result.entities.map((processes) => processes[0].score)).toEqual([100, 0]);
    expect(fixture.from.mock.calls.map(([table]) => table)).toEqual(['chemical_products', 'chemical_attachments']);
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
  });

  it('shares exercise report RPCs while preserving individual report scope for a real sailor', async () => {
    const fixture = fixtureClient({}, { exercises: 1 });
    const self = { ...watch, kind: 'self' as const, personId: 9, vesselIds: [1, 2] };
    await loadRegisterPerformanceDashboard(fixture.client, ['emergencyExercises'], self, '2026-11-01', [
      { ...self, vesselIds: [1] }, { ...self, vesselIds: [2] },
    ]);
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
    expect(fixture.rpc).toHaveBeenCalledWith('emergency_exercises_performance', { target_year: 2026 });
  });

  it('does not query hidden registers or medical logbook clinical content', async () => {
    const fixture = fixtureClient();
    expect(await loadRegisterPerformance(fixture.client, [], company, '2026-11-01')).toEqual([]);
    expect(await loadRegisterPerformance(fixture.client, ['medicalLogbook'], company, '2026-11-01')).toEqual([]);
    expect(fixture.from).not.toHaveBeenCalled();
    expect(fixture.rpc).not.toHaveBeenCalled();
  });

  it('never falls back to company-wide data for a self/watch scope without vessels', async () => {
    const fixture = fixtureClient();
    const results = await loadRegisterPerformance(fixture.client, ['chemicals', 'lsa', 'lifting', 'pharmacy', 'emergencyExercises'], { ...watch, kind: 'self', vesselIds: [] }, '2026-11-01');
    expect(results).toHaveLength(6);
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
    expect(results[0].score).toBe(0);
    expect(results[1].score).toBeNull();
    expect(results[0].tasks[0].state).toBe('unplanned');
  });

  it('uses current lifting inventory deadlines without querying draft/report snapshots', async () => {
    const fixture = fixtureClient({ lifting_inventory: [
      { id: 1, vessel_id: 2, kind: 'lifting', reference: 'À jour', active: true, inspection_due_on: '2027-01-01' },
      { id: 2, vessel_id: 2, kind: 'towing', reference: 'Remorque', active: true, inspection_due_on: null },
    ] });
    const [lifting, towing] = await loadRegisterPerformance(fixture.client, ['lifting'], watch, '2026-11-01');
    expect(lifting.score).toBe(100);
    expect(towing.score).toBe(0);
    expect(towing.tasks[0]).toMatchObject({ state: 'unplanned', to: '/modules/lifting/remorques?vessel=2&item=2' });
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

  it('compares equivalent volumes and scores only applicable stock and expiry fields', async () => {
    const fixture = fixtureClient({ pharmacy_inventory: [
      { id: 1, vessel_id: 2, designation: 'Volume équivalent', active: true, expires_on: '2027-05-01', quantity: '10', required_quantity: '20',
        stock_quantity: 10, stock_unit: 'ampoule', strength: '10 mL', required_stock_quantity: 20, required_stock_unit: 'ampoule', required_strength: '5 mL' },
      { id: 2, vessel_id: 2, designation: 'Hors dotation sans date', active: true, expires_on: null, quantity: '', required_quantity: '', outside_dotation: true },
      { id: 3, vessel_id: 2, designation: 'Hors dotation périmé', active: true, expires_on: '2026-10-31', quantity: '1', required_quantity: '10', outside_dotation: true },
      { id: 4, vessel_id: 2, designation: 'Sans péremption', active: true, expires_on: null, quantity: '3', required_quantity: '2', no_expiry: true },
      { id: 5, vessel_id: 2, designation: 'À renseigner', active: true, expires_on: null, quantity: '', required_quantity: '5' },
    ], pharmacy_controls: [{ id: 1, vessel_id: 2, is_current: true, expires_on: '2027-06-01' }] });
    const [process] = await loadRegisterPerformance(fixture.client, ['pharmacy'], watch, '2026-11-01');
    expect(process.tasks).toMatchObject([
      { title: 'Hors dotation périmé', context: 'GOURY · Périmé', state: 'overdue' },
      { title: 'À renseigner', context: 'GOURY · Stock à vérifier', state: 'unplanned' },
    ]);
    expect(process.criteria).toMatchObject([
      { id: 'expiry', score: 50, detail: expect.stringContaining('2/3 échéances') },
      { id: 'stock', score: 100, detail: expect.stringContaining('2/3 quantités') },
      { id: 'data', score: 67 },
      { id: 'controls', score: 100 },
    ]);
    const fields = fixture.selections.find((selection) => selection.table === 'pharmacy_inventory')?.select.split(',');
    expect(fields).toEqual(expect.arrayContaining(['stock_unit', 'strength', 'required_stock_unit', 'required_strength', 'outside_dotation', 'no_expiry']));
  });

  it('paginates full equipment inventories and invalidates partial failures', async () => {
    const inventory = Array.from({ length: 501 }, (_, index) => ({ id: index + 1, vessel_id: 2, kind: 'lifting', reference: `Matériel ${index}`, active: true, inspection_due_on: '2026-01-01' }));
    const fixture = fixtureClient({ lifting_inventory: inventory });
    const [complete] = await loadRegisterPerformance(fixture.client, ['lifting'], watch, '2026-11-01');
    expect(complete.tasks.filter((task) => task.id.startsWith('lifting-') && !task.id.startsWith('lifting-register'))).toHaveLength(501);

    expect(fixture.selections.map((selection) => selection.offset)).toEqual([0, 500]);
    const failing = fixtureClient({ lifting_inventory: inventory }, { failedTable: 'lifting_inventory', failedOffset: 500 });
    const [unavailable] = await loadRegisterPerformance(failing.client, ['lifting'], watch, '2026-11-01');
    expect(unavailable.score).toBeNull();
    expect(unavailable.tasks).toEqual([]);
    expect(unavailable.unavailableSources).toEqual(['Apparaux de levage']);
  });

  it('rates exactly one fire and one abandon objective per eligible person-month, capping repeat exercises', async () => {
    const fixture = fixtureClient({}, { exercises: 12 });
    const [process] = await loadRegisterPerformance(fixture.client, ['emergencyExercises'], watch, '2026-11-01');
    expect(process.score).toBe(50);
    expect(process.criteria.map((criterion) => criterion.score)).toEqual([100, 0]);
    expect(process.summary).toContain('1/2 obligations closes');
    expect(process.tasks).toHaveLength(1);
    expect(process.tasks[0].state).toBe('overdue');
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
  });});

describe('monthly exercise objectives', () => {
  const base: ExercisePerformanceSnapshot = { schemaVersion: 2, scope: 'fleet', year: 2026, asOf: '2026-11-02',
    vessels: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }], exerciseTypes, crewDays: [], personMonths: [] };
  it('rates only closed eligible months and labels current obligations as upcoming', () => {
    const month = (value: number, fire = 0, abandon = 0) => ({ personId: 9, personName: 'Marin', month: value, fireCount: fire, abandonCount: abandon,
      counts: exerciseCounts(fire, abandon), tbtCount: 0, presenceDays: 1,
      units: [{ vesselId: 1, fireCount: fire, abandonCount: abandon, counts: exerciseCounts(fire, abandon), tbtCount: 0, presenceDays: 1 }] });
    const process = buildExercisePerformance({ ...base, personMonths: [month(10, 3), month(11), month(12, 8, 8)] }, company, '2026-11-02');
    expect(process.score).toBe(50);
    expect(process.tasks.filter((task) => task.state === 'overdue')).toHaveLength(1);
    expect(process.tasks.filter((task) => task.state === 'unplanned')).toHaveLength(2);
    expect(process.tasks.every((task) => task.dueOn < '2026-12-01')).toBe(true);
    expect(process.tasks.find((task) => task.state === 'unplanned')?.dueOn).toBe('2026-11-30');
  });
  it('deduplicates a global person-month while keeping the two local unit categories separate', () => {
    const snapshot = { ...base, personMonths: [{ personId: 9, personName: 'Marin', month: 10, fireCount: 1, abandonCount: 1,
      counts: exerciseCounts(1, 1), tbtCount: 0, presenceDays: 2,
      units: [{ vesselId: 1, fireCount: 1, abandonCount: 0, counts: exerciseCounts(1), tbtCount: 0, presenceDays: 1 },
        { vesselId: 2, fireCount: 0, abandonCount: 1, counts: exerciseCounts(0, 1), tbtCount: 0, presenceDays: 1 }] }] };
    expect(buildExercisePerformance(snapshot, company, '2026-11-02').score).toBe(100);
    expect(buildExercisePerformance(snapshot, { ...watch, vesselIds: [1] }, '2026-11-02').score).toBe(50);
    expect(buildExercisePerformance(snapshot, { ...watch, vesselIds: [2] }, '2026-11-02').score).toBe(50);
    expect(buildExercisePerformance(snapshot, company, '2026-11-02').summary).toContain('2/2 obligations closes');
  });
  it('leaves a newly eligible current month unscored until its deadline and keeps sailor data individual', () => {
    const snapshot = { ...base, personMonths: [9, 10].map((personId) => ({ personId, personName: `Marin ${personId}`, month: 11, fireCount: 0, abandonCount: 0,
      counts: exerciseCounts(), tbtCount: 0, presenceDays: 1,
      units: [{ vesselId: 1, fireCount: 0, abandonCount: 0, counts: exerciseCounts(), tbtCount: 0, presenceDays: 1 }] })) };
    const process = buildExercisePerformance(snapshot, { ...watch, kind: 'self', personId: 9, vesselIds: [1] }, '2026-11-02');
    expect(process.score).toBeNull();
    expect(process.tasks).toHaveLength(2);
    expect(process.tasks.every((task) => task.state === 'unplanned' && task.context.startsWith('Marin 9'))).toBe(true);
  });
});
