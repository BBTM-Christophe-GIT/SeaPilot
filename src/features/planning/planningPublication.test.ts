import { describe, expect, it } from 'vitest';
import {
  findPlanningPublication,
  isPlanningPublicationLocked,
  planningPublicationActions,
  planningPublicationStatusLabel,
} from './planningPublication';
import type { PlanningPublicationRecord } from './planningQueries';

const publication: PlanningPublicationRecord = {
  id: 1,
  vesselId: null,
  scopeKey: 'fleet',
  startsOn: '2026-07-01',
  endsOn: '2026-07-31',
  status: 'published',
  currentVersion: 2,
  comment: 'Planning opérationnel',
  submittedAt: '2026-07-01T08:00:00Z',
  submittedBy: 'user-submit',
  submittedByName: 'Armement',
  validatedAt: '2026-07-01T09:00:00Z',
  validatedBy: 'user-validate',
  validatedByName: 'Direction',
  publishedAt: '2026-07-01T10:00:00Z',
  publishedBy: 'user-publish',
  publishedByName: 'Direction',
  lockedAt: '2026-07-01T08:00:00Z',
  lockedBy: 'user-submit',
  lockedByName: 'Armement',
  updatedAt: '2026-07-01T10:00:00Z',
  updatedBy: 'user-publish',
  updatedByName: 'Direction',
};

describe('planning publication workflow helpers', () => {
  it('marks submitted and published periods as locked and exposes the reopen action', () => {
    expect(isPlanningPublicationLocked(publication)).toBe(true);
    expect(planningPublicationActions(publication)).toEqual(['reopen', 'archive']);
    expect(planningPublicationStatusLabel(publication.status)).toBe('Publié');
  });

  it('offers the ordered submit, validate and publish transitions', () => {
    expect(planningPublicationActions(null)).toEqual(['submit']);
    expect(planningPublicationActions({ ...publication, status: 'pending_validation' })).toEqual(['validate', 'reopen', 'archive']);
    expect(planningPublicationActions({ ...publication, status: 'validated' })).toEqual(['publish', 'reopen', 'archive']);
  });

  it('prioritizes a fleet lock over an editable vessel draft for the visible period', () => {
    const vesselDraft = {
      ...publication,
      id: 2,
      vesselId: 7,
      scopeKey: 'vessel:7',
      status: 'preparation' as const,
      lockedAt: '',
      updatedAt: '2026-07-02T10:00:00Z',
    };

    expect(findPlanningPublication(
      [vesselDraft, publication],
      { start: '2026-07-10', end: '2026-07-20' },
      7,
    )?.id).toBe(publication.id);
  });
});
