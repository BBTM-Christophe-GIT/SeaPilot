import { describe, expect, it } from 'vitest';
import { buildPlanningHandoverComparison, buildPlanningHandoverPositions } from './planningHandovers';
import type { PlanningAssignmentRecord, PlanningOverview } from './planningQueries';

const baseAssignment: PlanningAssignmentRecord = {
  id: 1,
  vesselId: 1,
  vesselName: 'COTENTIN',
  captainPersonId: 1,
  captainName: 'Anne MARTIN',
  crewPersonId: 1,
  crewName: 'Anne MARTIN',
  startsOn: '2026-07-01',
  endsOn: '2026-07-15',
  startsAt: '2026-07-01T06:00:00.000Z',
  endsAt: '2026-07-15T10:00:00.000Z',
  assignmentRole: 'Capitaine',
  statusLabel: 'En Mer',
  confirmationStatus: 'confirmed',
  watchGroup: 'Bordée A',
  comments: '',
  sourceLabel: 'seapilot',
};

const overview: PlanningOverview = {
  vessels: [{ id: 1, name: 'COTENTIN', acronym: 'CTN', active: true }],
  people: [
    { id: 1, firstName: 'Anne', lastName: 'MARTIN', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', deckCertificateLabel: 'Capitaine 500', engineCertificateLabel: '', active: true },
    { id: 2, firstName: 'Paul', lastName: 'DURAND', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', deckCertificateLabel: 'Capitaine 500', engineCertificateLabel: '', active: true },
    { id: 3, firstName: 'Luc', lastName: 'SANS-TITRE', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', deckCertificateLabel: '', engineCertificateLabel: '', active: true },
  ],
  assignments: [],
  days: [],
  periods: [],
  projects: [],
  certificates: [],
  hrDocuments: [],
  rules: [],
  publications: [],
  versions: [],
  history: [],
  handovers: [],
  derogations: [],
  derogationHistory: [],
};

describe('planning handovers', () => {
  it('pairs the outgoing and incoming assignments around the same handover instant', () => {
    const incoming: PlanningAssignmentRecord = {
      ...baseAssignment,
      id: 2,
      crewPersonId: 2,
      crewName: 'Paul DURAND',
      startsOn: '2026-07-15',
      endsOn: '2026-07-30',
      startsAt: '2026-07-15T10:00:00.000Z',
      endsAt: '2026-07-30T18:00:00.000Z',
      watchGroup: 'Bordée B',
    };

    expect(buildPlanningHandoverPositions([baseAssignment, incoming], 1, '2026-07-15T12:00')).toEqual([{
      functionLabel: 'Capitaine',
      outgoingPersonId: '1',
      incomingPersonId: '2',
      outgoingAssignmentId: '1',
      incomingAssignmentId: '2',
      comments: '',
    }]);
  });

  it('classifies unchanged, replaced, vacant and non-compliant positions', () => {
    const rows = buildPlanningHandoverComparison(overview, 1, '2026-07-15T12:00', [
      { functionLabel: 'Capitaine', outgoingPersonId: '1', incomingPersonId: '1', comments: '' },
      { functionLabel: 'Capitaine', outgoingPersonId: '1', incomingPersonId: '2', comments: '' },
      { functionLabel: 'Capitaine', outgoingPersonId: '1', incomingPersonId: '', comments: '' },
      { functionLabel: 'Capitaine', outgoingPersonId: '1', incomingPersonId: '3', comments: '' },
    ]);

    expect(rows.map((row) => row.status)).toEqual(['unchanged', 'replaced', 'vacant', 'noncompliant']);
    expect(rows[3].qualificationIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing_qualification', level: 'warning' }),
    ]));
  });
});
