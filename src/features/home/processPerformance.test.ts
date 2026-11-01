import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mapHrDocumentRows, mapPersonRows } from '../humanResources/peopleQueries';
import type { HrActionRecord } from '../humanResources/hrActionPlanning';
import { buildProcessPerformance, performanceToday, prioritizeProcesses, type PerformanceReview, type ProcessPerformanceSources } from './processPerformance';
import { canViewCompanyPerformance, fetchPerformanceRows, fetchProcessPerformance } from './processPerformanceQueries';

const TODAY = '2026-11-01';
function person(id: number, firstName = 'Pierre', lastName = `PERSONNE ${id}`) {
  return mapPersonRows([{ id, first_name: firstName, last_name: lastName, function_label: 'Capitaine', hired_on: '2020-01-01', active: true,
  } as Parameters<typeof mapPersonRows>[0][number]])[0];
}
function document(id: number, personId: number, overrides: Record<string, unknown> = {}) {
  return mapHrDocumentRows([{ id, person_id: personId, category_key: 'certificate', title: `Certificat ${id}`, status: 'valid',
    expires_on: '2027-12-31', ...overrides,
  } as Parameters<typeof mapHrDocumentRows>[0][number]])[0];
}
function action(overrides: Partial<HrActionRecord> = {}): HrActionRecord {
  return { id: 1, personId: 1, documentId: 1, kind: 'certificate', title: 'Renouvellement', status: 'planned',
    dueOn: '2026-12-01', scheduledOn: '2026-11-15', completedOn: '', location: 'Centre du Havre', ownerName: '', notes: '', ...overrides };
}
function review(overrides: Partial<PerformanceReview> = {}): PerformanceReview {
  return { id: 1, employee_person_id: 1, employee_name_snapshot: '', review_year: 2026, status: 'scheduled',
    starts_at: '2026-11-03T08:00:00Z', due_on: '2026-12-31', meeting_location: 'À bord du GOURY', meeting_mode: 'in_person',
    video_url: null, manager_validated_at: null, ...overrides };
}
function sources(overrides: Partial<ProcessPerformanceSources> = {}): ProcessPerformanceSources {
  return { people: [], documents: [], actions: [], reviews: [], purchases: [], auditSites: [], audits: [], findings: [], fleetDocuments: [], procedures: [], ...overrides };
}
const rh = (data: ProcessPerformanceSources) => buildProcessPerformance(data, TODAY).find((process) => process.key === 'humanResources')!;

describe('process performance evidence and scoring', () => {
  it('reports the real example as one completed interview and two planned, with no expiry-date inference', () => {
    const people = [person(32, 'ADAM', 'DEBORDEAUX'), person(29, 'Pierre', 'LEPRETRE'), person(10, 'Pierre', 'HARACHE'),
      ...Array.from({ length: 24 }, (_, i) => person(100 + i))];
    const data = sources({ people, documents: people.map((p) => document(1000 + p.id, p.id, { category_key: 'medical_visit' })),
      reviews: [review({ id: 1, employee_person_id: 32, status: 'awaiting_signature', starts_at: '2026-09-17T12:00:00Z', manager_validated_at: '2026-09-28T16:50:00Z' }),
        review({ id: 2, employee_person_id: 29, status: 'collaborator_submitted' }), review({ id: 3, employee_person_id: 10, starts_at: '2026-11-03T10:00:00Z' })] });
    const result = rh(data);
    expect(result.summary).toContain('1 entretien réalisé · 2 planifiés');
    expect(result.criteria.find((item) => item.id === 'reviews')?.score).toBe(7);
    expect(result.criteria.find((item) => item.id === 'medical')?.score).toBe(100);
    expect(result.tasks.find((task) => task.id === 'hr-review-32')).toBeUndefined();
    expect(result.tasks.find((task) => task.id === 'hr-review-29')).toMatchObject({ state: 'planned', scheduledOn: '2026-11-03', location: 'À bord du GOURY', to: '/modules/annualReviews?review=2&person=29' });
  });

  it('never treats a document interview deadline, a submitted questionnaire or a past appointment as completion', () => {
    const result = rh(sources({ people: [person(1)], documents: [document(1, 1, { category_key: 'annual_review', expires_on: '2026-07-01' })],
      reviews: [review({ status: 'collaborator_submitted', starts_at: '2026-07-01T09:00:00Z' })] }));
    expect(result.criteria.find((item) => item.id === 'reviews')?.score).toBe(0);
    expect(result.summary).toContain('0 entretien réalisé · 0 planifié');
    expect(result.tasks.find((task) => task.id === 'hr-review-1')?.state).toBe('overdue');
  });

  it('gives planning credit only to a future appointment with a place before expiry, without pretending a certificate was renewed', () => {
    const data = sources({ people: [person(1)], documents: [document(1, 1, { expires_on: '2026-12-01' })], actions: [action()] });
    const booked = rh(data);
    expect(booked.criteria.find((item) => item.id === 'planning')?.score).toBe(100);
    expect(booked.criteria.find((item) => item.id === 'certificates')?.score).toBe(0);
    expect(booked.tasks.find((task) => task.id === 'hr-document-1')).toMatchObject({ state: 'planned', location: 'Centre du Havre' });
    for (const planned of [action({ scheduledOn: '2026-12-15' }), action({ location: '' }), action({ scheduledOn: '2026-10-01' }), action({ status: 'cancelled' })]) {
      expect(rh({ ...data, actions: [planned] }).criteria.find((item) => item.id === 'planning')?.score).toBe(0);
    }
    expect(rh({ ...data, actions: [action({ scheduledOn: '2026-10-01' })] }).tasks.find((task) => task.id === 'hr-document-1')).toMatchObject({ state: 'overdue', scheduledOn: '2026-10-01' });
  });

  it('keeps expired medical visits noncompliant even if a renewal action is marked completed', () => {
    const result = rh(sources({ people: [person(1)], documents: [document(1, 1, { category_key: 'medical_visit', expires_on: '2026-10-01' })],
      actions: [action({ kind: 'medical_visit', status: 'completed', completedOn: '2026-10-20' })] }));
    expect(result.criteria.find((item) => item.id === 'medical')?.score).toBe(0);
    expect(result.tasks.find((task) => task.id === 'hr-document-1')?.state).toBe('overdue');
  });

  it('shows the same dated booking used to credit a document renewal', () => {
    const result = rh(sources({ people: [person(1)], documents: [document(1, 1, { expires_on: '2026-12-01' })],
      actions: [action({ id: 2, scheduledOn: '2026-12-15', location: 'Créneau trop tardif' }), action()] }));
    expect(result.criteria.find((item) => item.id === 'planning')?.score).toBe(100);
    expect(result.tasks.find((item) => item.id === 'hr-document-1')).toMatchObject({ state: 'planned', scheduledOn: '2026-11-15', location: 'Centre du Havre' });
  });

  it('surfaces a missing medical file and excludes former collaborators and employment gaps', () => {
    const former = { ...person(2), departedOn: '2026-10-01', active: false };
    const result = rh(sources({ people: [person(1), former] }));
    expect(result.tasks).toContainEqual(expect.objectContaining({ id: 'hr-missing-medical-1', state: 'overdue' }));
    expect(result.tasks.some((task) => task.id.endsWith('-2'))).toBe(false);
  });

  it('distinguishes unavailable sources and empty obligations from a perfect score', () => {
    const empty = buildProcessPerformance(sources(), TODAY);
    expect(empty.every((process) => process.score === null)).toBe(true);
    const unavailable = rh(sources({ people: [person(1)], actions: null }));
    expect(unavailable.score).toBeNull();
    expect(unavailable.unavailableSources).toEqual(['Planification RH']);
  });

  it('rates an annual ISM cycle zero if no audit has been performed or planned for its site', () => {
    const data = sources({ auditSites: [{ id: 'site-1', name: 'GOURY', anniversary_on: '2020-06-10' }] });
    const process = buildProcessPerformance(data, TODAY).find((item) => item.key === 'internalAudits')!;
    expect(process.score).toBe(0);
    expect(process.tasks[0]).toMatchObject({ state: 'overdue', dueOn: '2026-06-10', to: '/modules/internalAudits?site=site-1&tab=planning&year=2026' });
    const booked = buildProcessPerformance({ ...data, auditSites: [{ id: 'site-1', name: 'GOURY', anniversary_on: null }],
      audits: [{ id: 'audit-1', site_id: 'site-1', year: 2026, status: 'planned', planned_on: '2026-11-20', performed_on: null }] }, TODAY).find((item) => item.key === 'internalAudits')!;
    expect(booked.score).toBe(50);
    expect(booked.tasks[0].state).toBe('planned');
  });

  it('does not use a completed audit from a previous year to satisfy the current campaign', () => {
    const result = buildProcessPerformance(sources({ auditSites: [{ id: 'site-1', name: 'GOURY', anniversary_on: null }],
      audits: [{ id: 'audit-1', site_id: 'site-1', year: 2025, status: 'completed', planned_on: '2025-10-01', performed_on: '2025-10-01' }] }), TODAY);
    expect(result.find((item) => item.key === 'internalAudits')?.score).toBe(0);
  });

  it('recognizes purchasing workflow progress and overdue deliveries using actual statuses', () => {
    const base = { request_number: 'DA2026', title: 'Pièce moteur', approval_status: 'Approuvée', requested_on: '2026-09-01', ordered_on: null,
      expected_delivery_on: null, received_on: null, urgent: false, vessel_name: 'GOURY', owner_name: 'Alice' };
    const result = buildProcessPerformance(sources({ purchases: [
      { ...base, id: 1, status: 'À traiter' }, { ...base, id: 2, status: 'En cours', ordered_on: '2026-10-20' },
      { ...base, id: 3, status: 'Réception', expected_delivery_on: '2026-10-20' }, { ...base, id: 4, status: 'Traitée', received_on: '2026-10-21' },
    ] }), TODAY).find((item) => item.key === 'purchases')!;
    expect(result.score).toBe(40);
    expect(result.tasks.map((task) => task.state)).toEqual(['overdue', 'unplanned', 'in_progress']);
    expect(result.tasks[0].to).toBe('/modules/purchaseRequests?requestId=3&focus=attention');
  });

  it('ranks the lowest evidence-backed process before unavailable axes', () => {
    const result = buildProcessPerformance(sources({ auditSites: [{ id: 'site-1', name: 'Bureau', anniversary_on: null }] }), TODAY);
    expect(prioritizeProcesses(result)[0].key).toBe('internalAudits');
  });

  it('uses Paris calendar boundaries', () => {
    expect(performanceToday(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11-01');
  });
});

describe('performance data scope and pagination', () => {
  it('never queries any process hidden by the configured module permissions', async () => {
    const from = vi.fn();
    for (const roles of [['marin'], ['capitaine']] as const) {
      expect(canViewCompanyPerformance([...roles])).toBe(false);
      expect(await fetchProcessPerformance({ from } as unknown as SupabaseClient, [...roles], TODAY, 1, [])).toEqual([]);
    }
    expect(from).not.toHaveBeenCalled();
    expect(canViewCompanyPerformance(['armement'])).toBe(true);
  });

  it('loads all pages in stable identifier order past the API row limit', async () => {
    const rows = Array.from({ length: 1201 }, (_, index) => ({ id: index + 1 }));
    const range = vi.fn(async (start: number, end: number) => ({ data: rows.slice(start, end + 1), error: null }));
    const order = vi.fn(() => ({ range }));
    const client = { from: vi.fn(() => ({ select: vi.fn(() => ({ order })) })) } as unknown as SupabaseClient;
    expect(await fetchPerformanceRows(client, 'purchase_requests', 'id')).toHaveLength(1201);
    expect(order).toHaveBeenCalledWith('id', { ascending: true });
    expect(range.mock.calls).toEqual([[0, 499], [500, 999], [1000, 1499]]);
  });

  it('propagates a page error instead of rating a partial source', async () => {
    const range = vi.fn().mockResolvedValue({ data: null, error: new Error('denied') });
    const client = { from: () => ({ select: () => ({ order: () => ({ range }) }) }) } as unknown as SupabaseClient;
    await expect(fetchPerformanceRows(client, 'purchase_requests', 'id')).rejects.toThrow('denied');
  });
});
