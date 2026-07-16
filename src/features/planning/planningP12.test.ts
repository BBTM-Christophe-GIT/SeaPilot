import { describe, expect, it } from 'vitest';
import type { PlanningOverview } from './planningQueries';
import {
  buildPlanningP12Conflicts,
  buildPlanningReplacementCandidates,
  type PlanningP12Data,
} from './planningP12';
import { EMPTY_PLANNING_OVERVIEW } from './usePlanningOverview';

const people: PlanningOverview['people'] = [
  { id: 1, firstName: 'Alice', lastName: 'MARTIN', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', deckCertificateLabel: 'Capitaine 3000', active: true },
  { id: 2, firstName: 'Benoît', lastName: 'DURAND', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', deckCertificateLabel: 'Capitaine 3000', active: true },
  { id: 3, firstName: 'Chloé', lastName: 'ROBERT', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', deckCertificateLabel: 'Capitaine 3000', active: true },
  { id: 4, firstName: 'Dina', lastName: 'LEGRAND', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', deckCertificateLabel: 'Capitaine 3000', active: true },
];

const assignments: PlanningOverview['assignments'] = [
  { id: 1, vesselId: 10, vesselName: 'COTENTIN', captainPersonId: null, captainName: '', crewPersonId: 1, crewName: 'Alice MARTIN', startsOn: '2026-08-01', endsOn: '2026-08-14', startsAt: '2026-08-01T06:00:00Z', endsAt: '2026-08-14T18:00:00Z', assignmentRole: 'Capitaine', statusLabel: 'Embarqué', confirmationStatus: 'confirmed', watchGroup: 'A', comments: '', sourceLabel: 'seapilot' },
  { id: 2, vesselId: 11, vesselName: 'SUROIT', captainPersonId: null, captainName: '', crewPersonId: 1, crewName: 'Alice MARTIN', startsOn: '2026-08-05', endsOn: '2026-08-08', startsAt: '2026-08-05T06:00:00Z', endsAt: '2026-08-08T18:00:00Z', assignmentRole: 'Capitaine', statusLabel: 'Embarqué', confirmationStatus: 'confirmed', watchGroup: 'B', comments: '', sourceLabel: 'seapilot' },
  { id: 3, vesselId: 12, vesselName: 'ARGONAUTE', captainPersonId: null, captainName: '', crewPersonId: 3, crewName: 'Chloé ROBERT', startsOn: '2026-08-01', endsOn: '2026-08-14', assignmentRole: 'Capitaine', statusLabel: 'Embarqué', confirmationStatus: 'confirmed', watchGroup: 'A', comments: '', sourceLabel: 'seapilot' },
];

const overview: PlanningOverview = {
  ...EMPTY_PLANNING_OVERVIEW,
  vessels: [
    { id: 10, name: 'COTENTIN', acronym: 'CTN', active: true },
    { id: 11, name: 'SUROIT', acronym: 'SRT', active: true },
    { id: 12, name: 'ARGONAUTE', acronym: 'ARG', active: true },
  ],
  people,
  assignments,
  periods: [{ id: 20, personId: 1, vesselId: null, crewName: 'Alice MARTIN', vesselName: '', watchGroup: '', functionLabel: '', sailorStatus: 'Indisponible', startsOn: '2026-08-10', endsOn: '2026-08-12', yearNumber: 2026, comments: '', slot365SourceId: '', slot365SourceKey: '', sourceLabel: 'sharepoint' }],
  projects: [{ id: 30, title: 'Arrêt technique', startsOn: '2026-08-06', endsOn: '2026-08-07', description: '', clientName: '', primaryVesselId: 10, primaryVesselName: 'COTENTIN', secondaryVesselId: null, secondaryVesselName: '', eventType: 'maintenance', responsibleName: '', status: 'Confirmé', sourceLabel: 'seapilot' }],
  handovers: [{ id: 40, vesselId: 10, handoverAt: '2026-08-08T08:00:00Z', location: 'Cherbourg', durationMinutes: 60, responsiblePersonId: 2, comments: '', status: 'confirmed', createdBy: '', updatedBy: '', createdAt: '', updatedAt: '', positions: [] }],
  hrDocuments: [
    { id: 50, personId: 1, personName: 'Alice MARTIN', categoryKey: 'certificate', title: 'Capitaine 3000', status: 'expired', expiresOn: '2026-07-01', requiresCaptainValidation: false, medicalRestriction: '', medicalUnfit: false, fileUrl: '' },
    { id: 51, personId: 2, personName: 'Benoît DURAND', categoryKey: 'certificate', title: 'Capitaine 3000', status: 'valid', expiresOn: '2027-12-31', requiresCaptainValidation: false, medicalRestriction: '', medicalUnfit: false, fileUrl: '' },
    { id: 52, personId: 2, personName: 'Benoît DURAND', categoryKey: 'qualification', title: 'Grue offshore', status: 'valid', expiresOn: '2027-12-31', requiresCaptainValidation: false, medicalRestriction: '', medicalUnfit: false, fileUrl: '' },
    { id: 53, personId: 3, personName: 'Chloé ROBERT', categoryKey: 'certificate', title: 'Capitaine 3000', status: 'valid', expiresOn: '2027-12-31', requiresCaptainValidation: false, medicalRestriction: '', medicalUnfit: false, fileUrl: '' },
    { id: 54, personId: 4, personName: 'Dina LEGRAND', categoryKey: 'certificate', title: 'Capitaine 3000', status: 'valid', expiresOn: '2027-12-31', requiresCaptainValidation: false, medicalRestriction: '', medicalUnfit: false, fileUrl: '' },
  ],
};

const data: PlanningP12Data = {
  absences: [
    { id: 60, personId: 1, absenceType: 'leave', startsAt: '2026-08-04T06:00:00Z', endsAt: '2026-08-10T16:00:00Z', startsOn: '2026-08-04', endsOn: '2026-08-10', reason: 'Congés validés', status: 'approved', requestedBy: 'user', reviewedBy: 'manager', reviewedAt: '2026-07-10T10:00:00Z', reviewComment: '', createdAt: '', updatedAt: '' },
    { id: 61, personId: 4, absenceType: 'training', startsAt: '2026-08-01T06:00:00Z', endsAt: '2026-08-14T18:00:00Z', startsOn: '2026-08-01', endsOn: '2026-08-14', reason: 'Formation', status: 'approved', requestedBy: 'user', reviewedBy: 'manager', reviewedAt: '2026-07-10T10:00:00Z', reviewComment: '', createdAt: '', updatedAt: '' },
  ],
  conflictCases: [],
  conflictHistory: [],
  matrices: [{
    id: 70, vesselId: 10, name: 'Armement COTENTIN', effectiveFrom: '2026-01-01', effectiveTo: '', status: 'active', notes: '', version: 1,
    requirements: [{ id: 71, matrixId: 70, functionLabel: 'Capitaine', minimumCount: 2, targetCount: 2, requiredCertificates: ['Capitaine 3000'], requiredQualifications: ['Grue offshore'], requiredAuthorizations: [], requiredTrainings: [], restrictions: [], displayOrder: 0 }],
  }],
};

describe('planning P1.2 conflict detection', () => {
  it('detects and classifies every P1.2 conflict family from existing operational data', () => {
    const conflicts = buildPlanningP12Conflicts(overview, data, { start: '2026-08-01', end: '2026-08-31' });
    expect(new Set(conflicts.map((item) => item.type))).toEqual(new Set([
      'double_assignment',
      'absence',
      'unavailability',
      'vacant_position',
      'invalid_certificate',
      'missing_qualification',
      'insufficient_staffing',
      'maintenance_incompatible',
      'incomplete_handover',
    ]));
    expect(conflicts.find((item) => item.type === 'absence')).toMatchObject({ severity: 'blocking', personId: 1, assignmentId: 1, absenceId: 60 });
    expect(conflicts.find((item) => item.type === 'vacant_position' && item.absenceId === 60)?.detail).toContain('libère le poste');
    expect(conflicts.find((item) => item.type === 'incomplete_handover')).toMatchObject({ severity: 'blocking', handoverId: 40 });
  });

  it('keeps stable keys when recalculating the same conflicts', () => {
    const first = buildPlanningP12Conflicts(overview, data, { start: '2026-08-01', end: '2026-08-31' });
    const second = buildPlanningP12Conflicts(overview, data, { start: '2026-08-01', end: '2026-08-31' });
    expect(second.map((item) => item.key)).toEqual(first.map((item) => item.key));
    expect(new Set(first.map((item) => item.key)).size).toBe(first.length);
  });
});

describe('planning P1.2 manual replacement search', () => {
  it('explains availability, assignment, absence, certificates and qualifications without selecting a sailor', () => {
    const target = buildPlanningP12Conflicts(overview, data, { start: '2026-08-01', end: '2026-08-31' })
      .find((item) => item.key === 'vacant_position:absence:60:assignment:1')!;
    const candidates = buildPlanningReplacementCandidates(overview, data, target);
    expect(candidates.find((item) => item.person.id === 2)).toMatchObject({ compatibility: 'compatible' });
    expect(candidates.find((item) => item.person.id === 3)).toMatchObject({ compatibility: 'incompatible' });
    expect(candidates.find((item) => item.person.id === 3)?.reasons.join(' ')).toContain('Déjà affecté');
    expect(candidates.find((item) => item.person.id === 4)?.reasons.join(' ')).toContain('Formation validée');
    expect(candidates.every((item) => item.person.id !== 1)).toBe(true);
  });

  it('filters candidates by function and qualification', () => {
    const target = buildPlanningP12Conflicts(overview, data, { start: '2026-08-01', end: '2026-08-31' })
      .find((item) => item.key === 'vacant_position:absence:60:assignment:1')!;
    const candidates = buildPlanningReplacementCandidates(overview, data, target, { functionLabel: 'Capitaine', qualification: 'Grue offshore' });
    expect(candidates.map((item) => item.person.id)).toEqual([2]);
  });
});
