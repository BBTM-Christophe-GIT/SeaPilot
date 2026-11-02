import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { fetchProcessPerformanceDashboard } from './processPerformanceQueries';

const TODAY = '2026-11-02';
type Row = Record<string, unknown>;
function fixture(tables: Record<string, Row[]>, failedTable?: string) {
  const calls: { table: string; columns: string; filters: [string, string, unknown][] }[] = [];
  const from = vi.fn((table: string) => {
    const read = { table, columns: '', filters: [] as [string, string, unknown][] };
    calls.push(read);
    let start = 0; let end = 499;
    const query = {
      select: (columns: string) => { read.columns = columns; return query; }, order: () => query,
      range: (a: number, b: number) => { start = a; end = b; return query; },
      in: (key: string, value: unknown[]) => { read.filters.push(['in', key, value]); return query; },
      eq: (key: string, value: unknown) => { read.filters.push(['eq', key, value]); return query; },
      lte: (key: string, value: unknown) => { read.filters.push(['lte', key, value]); return query; },
      gte: (key: string, value: unknown) => { read.filters.push(['gte', key, value]); return query; },
      neq: (key: string, value: unknown) => { read.filters.push(['neq', key, value]); return query; },
      then: (resolve: (result: unknown) => unknown) => Promise.resolve({
        data: (tables[table] || []).filter((row) => read.filters.every(([operator, key, value]) => {
          if (operator === 'in') return (value as unknown[]).includes(row[key]);
          if (operator === 'eq') return row[key] === value;
          if (row[key] == null) return true;
          if (operator === 'lte') return String(row[key]) <= String(value);
          if (operator === 'gte') return String(row[key]) >= String(value);
          return row[key] !== value;
        })).slice(start, end + 1), error: table === failedTable ? new Error('unavailable') : null,
      }).then(resolve),
    };
    return query;
  });
  const rpc = vi.fn();
  return { client: { from, rpc } as unknown as SupabaseClient, calls, rpc };
}
const assets = [
  { id: 1, name: 'SUROIT', asset_kind: 'vessel', length_overall: '18.6', active: true },
  { id: 2, name: 'GOURY', asset_kind: 'vessel', length_overall: '30.62', active: true },
  { id: 3, name: 'QUAI LE HAVRE', asset_kind: 'quay', active: true },
  { id: 4, name: 'BUREAUX CHERBOURG', asset_kind: 'office', active: true },
  { id: 5, name: 'Ancien navire', asset_kind: 'vessel', active: false },
];
const person = (id: number) => ({ id, first_name: `Personne ${id}`, last_name: 'TEST', function_label: 'Capitaine', hired_on: '2020-01-01', active: true });
const assignment = (id: number, vessel: number, crew: number, captain: number | null = null, extra: Row = {}) => ({
  id, vessel_id: vessel, crew_person_id: crew, captain_person_id: captain, watch_group: 'Bleu',
  starts_on: '2026-11-01', ends_on: '2026-11-30', confirmation_status: 'confirmed',
  vessels: { name: assets.find((row) => row.id === vessel)?.name }, ...extra,
});

describe('authorized entity radar comparisons', () => {
  it('keeps unassigned RH global, maps only current assignments and uses the same criteria for every entity', async () => {
    const data = fixture({ vessels: assets, people: [person(11), person(12), person(13)], planning_assignments: [
      assignment(1, 1, 11), assignment(2, 2, 12), assignment(3, 1, 13, null, { ends_on: '2025-12-31' }),
      assignment(4, 4, 13, null, { starts_on: '2027-01-01', ends_on: '2027-12-31' }),
      assignment(5, 2, 13, null, { confirmation_status: 'cancelled' }),
    ], hr_documents: [11, 12, 13].map((id) => ({ id, person_id: id, title: `Certificat ${id}`, category_key: 'certificate', status: 'expired', expires_on: '2026-01-01' })) });
    const result = await fetchProcessPerformanceDashboard(data.client, ['direction'], TODAY, 99, ['humanResources']);
    expect(result.scopeLabel).toBe('Périmètre compagnie');
    expect(result.entities.map((entity) => [entity.id, entity.assetKind])).toEqual([[2, 'vessel'], [1, 'vessel'], [3, 'quay'], [4, 'office']]);
    expect(result.processes[0].tasks.some((task) => task.title === 'Certificat 13')).toBe(true);
    expect(result.entities.find((entity) => entity.id === 1)?.processes[0].tasks.filter((task) => task.id.startsWith('hr-document')).map((task) => task.title)).toEqual(['Certificat 11']);
    expect(result.entities.find((entity) => entity.id === 2)?.processes[0].tasks.filter((task) => task.id.startsWith('hr-document')).map((task) => task.title)).toEqual(['Certificat 12']);
    expect(result.entities.find((entity) => entity.id === 4)?.processes[0].score).toBeNull();
    expect(result.entities.every((entity) => entity.processes[0].criteria.map((criterion) => criterion.id).join() === result.processes[0].criteria.map((criterion) => criterion.id).join())).toBe(true);
    for (const table of ['people', 'hr_documents', 'hr_action_plans', 'planning_assignments', 'vessels']) {
      expect(data.calls.filter((call) => call.table === table)).toHaveLength(1);
    }
  });

  it('matches office and quay audit sites by exact normalized name without accepting foreign IDs or partial names', async () => {
    const data = fixture({ vessels: assets, internal_audit_sites: [
      { id: 'office', name: 'BUREAUX CHERBOURG', vessel_id: null },
      { id: 'quay', name: 'QUAI LE HAVRE', vessel_id: null },
      { id: 'partial', name: 'BUREAUX CHERBOURG ANNEXE', vessel_id: null },
      { id: 'foreign', name: 'BUREAUX CHERBOURG', vessel_id: 999 },
    ] });
    const result = await fetchProcessPerformanceDashboard(data.client, ['admin'], TODAY, 99, ['internalAudits']);
    const office = result.entities.find((entity) => entity.id === 4)!.processes[0];
    const quay = result.entities.find((entity) => entity.id === 3)!.processes[0];
    expect(office.tasks.map((task) => task.id)).toEqual(['audit-cycle-office']);
    expect(quay.tasks.map((task) => task.id)).toEqual(['audit-cycle-quay']);
    expect(result.entities.find((entity) => entity.id === 1)!.processes[0].score).toBeNull();
    expect(data.calls.filter((call) => call.table === 'internal_audit_sites')).toHaveLength(1);
  });

  it('keeps real captain entities and RH inside the current watch and suppresses hidden medical/review data', async () => {
    const data = fixture({ vessels: assets, planning_assignments: [assignment(1, 1, 2, 1), assignment(2, 1, 3, 4, { watch_group: 'Rouge' }), assignment(3, 2, 5, 6)],
      people: [person(1), person(2), person(3), person(5)],
      hr_visibility_rules: [{ scope: 'document_type', item_key: 'medical_visit', item_label: 'Medical', visible_to_roles: ['admin'] }],
      hr_documents: [{ id: 11, person_id: 2, category_key: 'certificate', title: 'Bordée autorisée', status: 'expired', expires_on: '2026-01-01' },
        { id: 12, person_id: 3, category_key: 'certificate', title: 'AUTRE BORDÉE SECRET', status: 'expired', expires_on: '2026-01-01' },
        { id: 13, person_id: 2, category_key: 'medical_visit', title: 'MEDICAL SECRET', status: 'expired', expires_on: '2026-01-01' }],
    });
    const result = await fetchProcessPerformanceDashboard(data.client, ['capitaine'], TODAY, 1, ['humanResources', 'medicalLogbook']);
    expect(result.entities.map((entity) => entity.id)).toEqual([1]);
    expect(result.entities[0].processes[0].tasks.map((task) => task.title)).toEqual(['Bordée autorisée']);
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(result.entities[0].processes[0].criteria.some((criterion) => criterion.id === 'medical')).toBe(false);
    expect(data.calls.map((call) => call.table)).not.toContain('annual_reviews');
    expect(data.calls.map((call) => call.table).some((table) => /medical_log|patient|consultation/.test(table))).toBe(false);
    expect(data.rpc).not.toHaveBeenCalled();
  });

  it('retains sailor self-only RH on its assigned entity and never substitutes the whole vessel crew', async () => {
    const data = fixture({ vessels: assets, planning_assignments: [assignment(1, 1, 2, 1)], people: [person(1), person(2)],
      hr_documents: [1, 2].map((id) => ({ id, person_id: id, title: `Personne ${id}`, category_key: 'certificate', status: 'expired', expires_on: '2026-01-01' })),
    });
    const result = await fetchProcessPerformanceDashboard(data.client, ['marin'], TODAY, 2, ['humanResources', 'annualReviews']);
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].processes[0].tasks.filter((task) => task.id.startsWith('hr-document')).map((task) => task.title)).toEqual(['Personne 2']);
    expect(data.calls.map((call) => call.table)).not.toContain('annual_reviews');
  });

  it('marks entity RH unavailable when assignment membership fails instead of copying company personnel', async () => {
    const data = fixture({ vessels: assets, people: [person(1)] }, 'planning_assignments');
    const result = await fetchProcessPerformanceDashboard(data.client, ['direction'], TODAY, 99, ['humanResources']);
    expect(result.entities[0].processes[0].score).toBeNull();
    expect(result.entities[0].processes[0].unavailableSources).toContain('Collaborateurs');
  });

  it('does not query entity catalogs for unauthorized modules or profiles without an active assignment', async () => {
    const data = fixture({ vessels: assets, planning_assignments: [] });
    expect(await fetchProcessPerformanceDashboard(data.client, [], TODAY, 99, ['humanResources'])).toEqual({ processes: [], scopeLabel: '', entities: [] });
    const result = await fetchProcessPerformanceDashboard(data.client, ['marin'], TODAY, 2, ['purchaseRequests']);
    expect(result.entities).toEqual([]);
    expect(data.calls.map((call) => call.table)).not.toContain('vessels');
    expect(data.calls.map((call) => call.table)).not.toContain('people');
  });
});
