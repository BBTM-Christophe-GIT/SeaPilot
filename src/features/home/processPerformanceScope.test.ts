import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { mapHrDocumentRows, mapPersonRows, type HrVisibilityRule } from '../humanResources/peopleQueries';
import { buildProcessPerformance, type ProcessPerformanceSources } from './processPerformance';
import { buildProcessPerformanceScope, filterProcessPerformanceSources } from './processPerformanceScope';
import { fetchProcessPerformance } from './processPerformanceQueries';

vi.mock('./processPerformanceRegisters', () => ({ loadRegisterPerformance: vi.fn(async () => []) }));

const TODAY = '2026-11-01';
const assignments = [
  { vessel_id: 1, crew_person_id: 2, captain_person_id: 1, watch_group: 'Bleu', vessels: { name: 'GOURY' } },
  { vessel_id: 1, crew_person_id: 3, captain_person_id: 1, watch_group: 'Bleu', vessels: { name: 'GOURY' } },
  { vessel_id: 1, crew_person_id: 4, captain_person_id: 5, watch_group: 'Rouge', vessels: { name: 'GOURY' } },
  { vessel_id: 2, crew_person_id: 6, captain_person_id: 7, watch_group: 'Bleu', vessels: { name: 'CELAN' } },
];
const people = mapPersonRows([1, 2, 3, 4, 5, 6, 7].map((id) => ({ id, first_name: `Personne ${id}`, last_name: 'TEST',
  hired_on: '2020-01-01', active: true, function_label: id === 1 ? 'Capitaine' : 'Matelot polyvalent',
} as Parameters<typeof mapPersonRows>[0][number])));
const docs = mapHrDocumentRows([1, 2, 3, 4, 6].map((id) => ({ id, person_id: id, title: `Brevet ${id}`, category_key: 'certificate', status: 'renew_due', expires_on: '2026-12-01' } as Parameters<typeof mapHrDocumentRows>[0][number])));
function sources(): ProcessPerformanceSources {
  return { people, documents: docs, actions: [], reviews: [], purchases: [], auditSites: [], audits: [], findings: [], fleetDocuments: [], procedures: [] };
}

function queryClient(data: Record<string, unknown[]>) {
  const calls: Array<{ table: string; columns: string; filters: Array<[string, unknown]> }> = [];
  const from = vi.fn((table: string) => {
    const call = { table, columns: '', filters: [] as Array<[string, unknown]> };
    calls.push(call);
    const query = {
      select: (columns: string) => { call.columns = columns; return query; }, order: () => query, range: () => query,
      in: (column: string, values: unknown[]) => { call.filters.push([column, values]); return query; },
      lte: () => query, gte: () => query, neq: () => query,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: data[table] || [], error: null }).then(resolve),
    };
    return query;
  });
  return { client: { from } as unknown as SupabaseClient, calls };
}

describe('real-profile radar scope fixtures', () => {
  it('uses current captain watch personnel and excludes other watches and vessels from RH', () => {
    const scope = buildProcessPerformanceScope(['capitaine'], 1, assignments);
    expect(scope.kind).toBe('watch');
    expect([...scope.personIds].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(scope.label).toBe('Votre périmètre · Bleu · GOURY');
    const result = filterProcessPerformanceSources(sources(), scope, ['capitaine'], [], true);
    expect(result.people?.map((person) => person.id)).toEqual([1, 2, 3]);
    expect(result.documents?.map((document) => document.personId)).toEqual([1, 2, 3]);
  });

  it('restricts sailor RH to the actual linked person and never infers company performance', () => {
    const scope = buildProcessPerformanceScope(['marin'], 2, assignments);
    const result = filterProcessPerformanceSources(sources(), scope, ['marin'], [], false);
    expect(scope.kind).toBe('self');
    expect(result.people?.map((person) => person.id)).toEqual([2]);
    expect(result.documents?.map((document) => document.personId)).toEqual([2]);
    const hr = buildProcessPerformance(result, TODAY, { includeReviews: false, includeAnnualAuditCycles: false })[0];
    expect(hr.criteria.some((criterion) => criterion.id === 'reviews')).toBe(false);
    expect(hr.tasks.some((task) => task.to.includes('annualReviews'))).toBe(false);
  });

  it('treats an absent assignment or person link as an empty scope, with no company fallback', () => {
    const scope = buildProcessPerformanceScope(['capitaine'], null, assignments);
    const result = filterProcessPerformanceSources(sources(), scope, ['capitaine'], [], true);
    expect(scope.vesselIds).toEqual([]);
    expect(result.people).toEqual([]);
    expect(result.documents).toEqual([]);
    expect(scope.label).toContain('aucune affectation active');
  });

  it('honors HR function/document visibility, including linked action suppression', () => {
    const rules: HrVisibilityRule[] = [{ scope: 'document_type', itemKey: 'certificate', itemLabel: 'Brevets', visibleToRoles: ['admin'] }];
    const result = filterProcessPerformanceSources(sources(), buildProcessPerformanceScope(['capitaine'], 1, assignments), ['capitaine'], rules, true);
    expect(result.documents).toEqual([]);
  });

  it('does not label inaccessible annual audits as missing for captain and sailor profiles', () => {
    const result = buildProcessPerformance({ ...sources(), auditSites: [{ id: 'site', name: 'GOURY', anniversary_on: null, vessel_id: 1 }] }, TODAY,
      { includeReviews: false, includeAnnualAuditCycles: false }).find((process) => process.key === 'internalAudits')!;
    expect(result.score).toBeNull();
    expect(result.criteria.map((criterion) => criterion.id)).toEqual(['findings']);
    expect(result.tasks).toEqual([]);
  });

  it('evaluates only a captain’s RLS-accessible interviews without inventing missing interviews for the rest of the watch', async () => {
    // annual_review_can_read allows employee, manager or office roles; it does not grant a captain every team interview.
    const { client } = queryClient({ planning_assignments: assignments, people: people.slice(0, 3).map((person) => ({
      id: person.id, first_name: person.firstName, last_name: person.lastName, function_label: person.functionLabel, active: true, hired_on: '2020-01-01',
    })), annual_reviews: [{ id: 51, employee_person_id: 2, employee_name_snapshot: 'Personne 2 TEST', review_year: 2026,
      status: 'scheduled', starts_at: '2026-11-15T09:00:00Z', due_on: '2026-12-31', meeting_location: 'À bord', meeting_mode: 'in_person', manager_validated_at: null }] });
    const result = (await fetchProcessPerformance(client, ['capitaine'], TODAY, 1, ['humanResources', 'annualReviews']))[0];
    expect(result.criteria.find((criterion) => criterion.id === 'reviews')).toMatchObject({ label: 'Entretiens accessibles 2026', score: 50 });
    expect(result.tasks.filter((task) => task.id.startsWith('hr-review-')).map((task) => task.id)).toEqual(['hr-review-2']);
    expect(result.criteria.find((criterion) => criterion.id === 'reviews')?.detail).toContain('1 suivi(s) accessible(s)');
    const noAccessibleReviews = buildProcessPerformance(sources(), TODAY, { includeReviews: true, reviewPersonIds: [] })[0];
    expect(noAccessibleReviews.criteria.some((criterion) => criterion.id === 'reviews')).toBe(false);
    expect(noAccessibleReviews.tasks.some((task) => task.id.startsWith('hr-review-'))).toBe(false);
  });

  it('does not infer missing medical alerts or document obligations from hidden categories and sections', async () => {
    const own = sources();
    own.documents = mapHrDocumentRows([{ id: 88, person_id: 1, category_key: 'medical_visit', title: 'Visite CONFIDENTIELLE', status: 'expired', expires_on: '2026-01-01' } as Parameters<typeof mapHrDocumentRows>[0][number]]);
    const medicalHidden = buildProcessPerformance(own, TODAY, { includeMedical: false, includeReviews: false })[0];
    expect(medicalHidden.criteria.some((criterion) => criterion.id === 'medical')).toBe(false);
    expect(medicalHidden.tasks.some((task) => task.id.includes('medical') || task.title.includes('CONFIDENTIELLE'))).toBe(false);
    const { client, calls } = queryClient({ planning_assignments: assignments, hr_visibility_rules: [
      { scope: 'section', item_key: 'documents', item_label: 'Documents', visible_to_roles: ['admin'] },
    ], people: [{ id: 1, first_name: 'Capitaine', last_name: 'TEST', function_label: 'Capitaine', active: true, hired_on: '2020-01-01' }] });
    const sectionHidden = (await fetchProcessPerformance(client, ['capitaine'], TODAY, 1, ['humanResources']))[0];
    expect(sectionHidden.criteria.some((criterion) => ['medical', 'certificates', 'planning'].includes(criterion.id))).toBe(false);
    expect(sectionHidden.tasks).toEqual([]);
    expect(calls.map((call) => call.table)).not.toContain('hr_documents');
    expect(calls.map((call) => call.table)).not.toContain('hr_action_plans');
  });

  it('does not fetch hidden modules or annual reviews for a real sailor, even if broad backend rows are returned', async () => {
    const { client, calls } = queryClient({ planning_assignments: assignments, people: [
      { id: 2, first_name: 'Marin', last_name: 'TEST', function_label: 'Matelot polyvalent', active: true, hired_on: '2020-01-01' },
      { id: 4, first_name: 'Autre bordée', last_name: 'SECRET', function_label: 'Matelot polyvalent', active: true, hired_on: '2020-01-01' },
    ], hr_documents: [{ id: 20, person_id: 2, title: 'Brevet propre', category_key: 'certificate', status: 'renew_due', expires_on: '2026-12-01' },
      { id: 40, person_id: 4, title: 'Brevet autre bordée SECRET', category_key: 'certificate', status: 'expired', expires_on: '2026-01-01' }] });
    const result = await fetchProcessPerformance(client, ['marin'], TODAY, 2, ['humanResources', 'annualReviews']);
    expect(result.map((process) => process.key)).toEqual(['humanResources']);
    expect(calls.map((call) => call.table)).not.toContain('annual_reviews');
    expect(calls.map((call) => call.table)).not.toContain('purchase_requests');
    expect(calls.find((call) => call.table === 'people')?.filters).toContainEqual(['id', [2]]);
    expect(calls.find((call) => call.table === 'hr_documents')?.filters).toContainEqual(['person_id', [2]]);
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(result[0].scopeLabel).toContain('Votre périmètre');
  });

  it('filters a real captain’s purchase rows by authorized vessel and never falls back to a matching name for a foreign ID', async () => {
    const base = { title: 'Demande', status: 'À traiter', requested_on: '2026-10-01' };
    const { client, calls } = queryClient({ planning_assignments: assignments, purchase_requests: [
      { ...base, id: 1, vessel_id: 1, vessel_name: 'GOURY' }, { ...base, id: 2, vessel_id: 2, vessel_name: 'GOURY', title: 'Demande autre navire SECRET' },
    ] });
    const result = await fetchProcessPerformance(client, ['capitaine'], TODAY, 1, ['purchaseRequests']);
    expect(result[0].tasks).toHaveLength(1);
    expect(calls.find((call) => call.table === 'purchase_requests')?.filters).toContainEqual(['vessel_id', [1]]);
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(calls.map((call) => call.table)).not.toContain('hr_documents');
  });

  it('uses configured backend module permissions when the shell has not provided them', async () => {
    const { client, calls } = queryClient({ role_module_permissions: [
      { module_key: 'purchaseRequests', role_key: 'direction', is_visible: true },
      { module_key: 'humanResources', role_key: 'direction', is_visible: false },
    ] });
    const result = await fetchProcessPerformance(client, ['direction'], TODAY, 1);
    expect(result.map((process) => process.key)).toEqual(['purchases']);
    expect(calls.map((call) => call.table)).toContain('role_module_permissions');
    expect(calls.map((call) => call.table)).not.toContain('people');
  });
});
