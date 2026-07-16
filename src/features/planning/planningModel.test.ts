import { describe, expect, it } from 'vitest';
import {
  buildPlanningCertificateAlerts,
  buildPlanningControlCenter,
  buildPlanningCrewRows,
  buildPlanningHrAlerts,
  buildPlanningTimeline,
  buildPlanningExportRows,
  evaluatePlanningAssignment,
  hasBlockingPlanningControls,
  getAllPlanningCrewEvents,
  getUnassignedPlanningPeople,
  getUnbilledPlanningProjects,
  isSedentaryPlanningFunction,
  normalizePlanningStatus,
  planningStatusDisplayLabel,
  planningStatusTone,
  projectStatusTone,
  timelineRange,
} from './planningModel';
import { getPlanningConflicts, getPlanningConflictEventIds } from './planningOverlap';
import type { PlanningOverview } from './planningQueries';

const overview: PlanningOverview = {
  vessels: [{ id: 1, name: 'GOURY', acronym: 'GRY', active: true }],
  people: [
    { id: 1, firstName: 'Anne', lastName: 'CAPITAINE', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '2020-01-01', departedOn: '', active: true },
    { id: 2, firstName: 'Marc', lastName: 'LIBRE', functionLabel: 'Matelot', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '2024-01-01', departedOn: '', active: true },
  ],
  assignments: [],
  days: [],
  periods: [{ id: 10, personId: 1, vesselId: 1, crewName: 'Anne CAPITAINE', vesselName: 'GOURY', watchGroup: 'Bordée 1', functionLabel: 'Capitaine', sailorStatus: 'Embarqué', startsOn: '2026-07-01', endsOn: '2026-07-20', yearNumber: 2026, comments: '', slot365SourceId: '1', slot365SourceKey: 'slot', sourceLabel: 'sharepoint' }],
  projects: [
    { id: 20, title: 'Mission A', startsOn: '2026-07-02', endsOn: '2026-07-15', description: '', clientName: '', primaryVesselId: 1, primaryVesselName: 'GOURY', secondaryVesselId: null, secondaryVesselName: '', eventType: 'operation', responsibleName: '', status: 'Validé', sourceLabel: 'sharepoint' },
    { id: 21, title: 'Mission B', startsOn: '2026-08-02', endsOn: '2026-08-15', description: '', clientName: '', primaryVesselId: 1, primaryVesselName: 'GOURY', secondaryVesselId: null, secondaryVesselName: '', eventType: 'operation', responsibleName: '', status: 'Facturé', sourceLabel: 'sharepoint' },
  ],
  certificates: [{ id: 30, vesselId: 1, vesselName: 'GOURY', title: 'Franc-bord', status: 'expired', expiresOn: '2026-07-01', fileUrl: '' }],
  hrDocuments: [{
    id: 40,
    personId: 1,
    personName: 'Anne CAPITAINE',
    categoryKey: 'medical',
    title: 'Visite médicale',
    status: 'renew_due',
    expiresOn: '2026-08-01',
    requiresCaptainValidation: false,
    medicalRestriction: '',
    medicalUnfit: false,
    fileUrl: '',
  }],
  rules: [],
  publications: [],
  versions: [],
  history: [],
  handovers: [],
  derogations: [],
  derogationHistory: [],
};

describe('planning timeline rules', () => {
  it('builds day, week, fortnight, month and year ranges', () => {
    expect(buildPlanningTimeline('2026-07-12', 'day')).toHaveLength(7);
    expect(timelineRange(buildPlanningTimeline('2026-07-12', 'day'))).toEqual({ start: '2026-07-09', end: '2026-07-15' });
    expect(buildPlanningTimeline('2026-07-12', 'week')).toHaveLength(7);
    expect(buildPlanningTimeline('2026-07-12', 'fortnight')).toHaveLength(14);
    expect(buildPlanningTimeline('2026-07-12', 'month')).toHaveLength(49);
    expect(buildPlanningTimeline('2026-07-12', 'year')).toHaveLength(365);
    expect(timelineRange(buildPlanningTimeline('2026-07-12', 'week'))).toEqual({ start: '2026-07-06', end: '2026-07-12' });
    expect(timelineRange(buildPlanningTimeline('2026-07-12', 'fortnight'))).toEqual({ start: '2026-07-06', end: '2026-07-19' });
  });

  it('normalizes imported crew and project statuses', () => {
    expect(normalizePlanningStatus('Embarqué')).toBe('En Mer');
    expect(planningStatusDisplayLabel('Vacance')).toBe('Vacances');
    expect(planningStatusDisplayLabel('Repos')).toBe('Repos');
    expect(planningStatusTone('Formation')).toBe('training');
    expect(projectStatusTone('À facturer')).toBe('billed');
    expect(projectStatusTone('Validé')).toBe('valid');
  });

  it('detects a sailor assigned to two different vessels on overlapping dates', () => {
    const event = getAllPlanningCrewEvents(overview)[0];
    const conflicts = getPlanningConflicts(overview, { ...event, id: 'new', vessel: 'SUROIT', startsOn: '2026-07-10', endsOn: '2026-07-12' });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].date).toBe('2026-07-10');
  });

  it('identifies every event involved in a cross-vessel conflict', () => {
    const conflictingOverview = {
      ...overview,
      vessels: [...overview.vessels, { id: 2, name: 'SUROIT', acronym: 'SRT', active: true }],
      periods: [
        ...overview.periods,
        { ...overview.periods[0], id: 11, vesselId: 2, vesselName: 'SUROIT', startsOn: '2026-07-10', endsOn: '2026-07-12' },
      ],
    };
    expect([...getPlanningConflictEventIds(conflictingOverview)].sort()).toEqual(['period-10', 'period-11']);
    expect(buildPlanningControlCenter(conflictingOverview)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'assignment_overlap', level: 'warning' }),
    ]));
  });

  it('blocks work planned over an unavailability period', () => {
    const unavailableOverview: PlanningOverview = {
      ...overview,
      periods: [{ ...overview.periods[0], sailorStatus: 'Repos' }],
    };
    const controls = evaluatePlanningAssignment(unavailableOverview, {
      id: 'new',
      personId: 1,
      person: 'Anne CAPITAINE',
      vessel: 'GOURY',
      functionLabel: 'Capitaine',
      status: 'En Mer',
      startsOn: '2026-07-10',
      endsOn: '2026-07-12',
    });

    expect(controls).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'crew_unavailability', level: 'blocking' }),
    ]));
    expect(hasBlockingPlanningControls(controls)).toBe(true);
  });

  it('checks medical validity through the end of an assignment', () => {
    const controls = evaluatePlanningAssignment(overview, {
      id: 'new',
      personId: 1,
      person: 'Anne CAPITAINE',
      vessel: 'GOURY',
      functionLabel: 'Capitaine',
      status: 'En Mer',
      startsOn: '2026-08-01',
      endsOn: '2026-08-15',
    });

    expect(controls[0]).toMatchObject({ code: 'expired_medical', level: 'blocking' });
  });

  it('uses the configurable control level delivered by Supabase', () => {
    const configuredOverview: PlanningOverview = {
      ...overview,
      people: overview.people.map((person) => ({ ...person, deckCertificateLabel: 'Capitaine 500' })),
      rules: [{
        id: 1,
        code: 'expired_medical',
        name: 'Aptitude médicale',
        description: '',
        scope: 'medical',
        controlLevel: 'warning',
        active: true,
        effectiveFrom: '2026-01-01',
        configuration: {},
        sourceReference: 'Règle interne',
        version: 1,
      }],
    };
    const controls = evaluatePlanningAssignment(configuredOverview, {
      id: 'new',
      personId: 1,
      person: 'Anne CAPITAINE',
      vessel: 'GOURY',
      functionLabel: 'Capitaine',
      status: 'En Mer',
      startsOn: '2026-08-01',
      endsOn: '2026-08-15',
    });

    expect(controls).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'expired_medical', level: 'warning' }),
    ]));
    expect(hasBlockingPlanningControls(controls)).toBe(false);
    expect(evaluatePlanningAssignment({
      ...configuredOverview,
      rules: configuredOverview.rules.map((rule) => ({ ...rule, active: false })),
    }, {
      id: 'new',
      personId: 1,
      person: 'Anne CAPITAINE',
      vessel: 'GOURY',
      functionLabel: 'Capitaine',
      status: 'En Mer',
      startsOn: '2026-08-01',
      endsOn: '2026-08-15',
    })).toEqual([]);
  });

  it('applies a derogation only when its exact UTC period covers the assignment', () => {
    const rule = { id: 9, code: 'expired_medical', name: 'Aptitude médicale', description: '', scope: 'medical', controlLevel: 'blocking' as const, active: true, effectiveFrom: '2026-01-01', configuration: {}, sourceReference: '', version: 1 };
    const candidate = { id: 'new', personId: 1, person: 'Anne CAPITAINE', vessel: 'GOURY', functionLabel: 'Capitaine', status: 'En Mer', startsOn: '2026-08-01', endsOn: '2026-08-15', startsAt: '2026-08-01T08:00', endsAt: '2026-08-15T20:00' };
    const derogation = { id: 1, ruleId: 9, assignmentId: null, personId: 1, vesselId: 1, reason: 'Décision maritime documentée', startsAt: '2026-08-01T06:00:00.000Z', endsAt: '2026-08-15T18:00:00.000Z', evidenceUrl: '', status: 'active' as const, authorId: 'admin', authorName: 'Admin', createdAt: '2026-07-13T20:00:00.000Z', updatedAt: '2026-07-13T20:00:00.000Z' };

    expect(evaluatePlanningAssignment({ ...overview, rules: [rule], derogations: [{ ...derogation, endsAt: '2026-08-15T10:00:00.000Z' }] }, candidate)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'expired_medical' }),
    ]));
    expect(evaluatePlanningAssignment({ ...overview, rules: [rule], derogations: [derogation] }, candidate)).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'expired_medical' }),
    ]));
  });

  it('uses the shore status for the sedentary functions defined by BBTM', () => {
    expect(isSedentaryPlanningFunction('Directeur QHSE / Chef de Projet')).toBe(true);
    expect(isSedentaryPlanningFunction('Directrice Administrative et Financière')).toBe(true);
    expect(isSedentaryPlanningFunction('Capitaine')).toBe(false);
  });

  it('exports one auditable row per sailor and calendar day', () => {
    const rows = buildPlanningExportRows(overview, 'Anne CAPITAINE', { start: '2026-07-10', end: '2026-07-12' });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ date: '2026-07-10', worked: 'Oui', functionLabel: 'Capitaine', vessel: 'GOURY' });
  });
});

describe('planning hierarchy and side panels', () => {
  it('attaches per-day texts to their assignment without exposing technical rows', () => {
    const assignment = {
      id: 50, vesselId: 1, vesselName: 'GOURY', captainPersonId: 1, captainName: 'Anne CAPITAINE',
      crewPersonId: 1, crewName: 'Anne CAPITAINE', startsOn: '2026-07-01', endsOn: '2026-07-20',
      startsAt: '2026-07-01T06:00:00Z', endsAt: '2026-07-20T18:00:00Z', assignmentRole: 'Capitaine',
      statusLabel: 'En Mer', confirmationStatus: 'confirmed' as const, watchGroup: 'Bordée 1', comments: '', sourceLabel: 'seapilot',
    };
    const technicalDay = {
      id: 51, personId: 1, vesselId: 1, crewName: 'Anne CAPITAINE', captainName: 'Anne CAPITAINE', vesselName: 'GOURY',
      manualVesselName: '', workDate: '2026-07-14', disembarkOn: '2026-07-14', yearNumber: 2026, monthNumber: 7,
      monthLabel: 'Juillet', dayNumber: 14, functionLabel: 'Capitaine', sailorStatus: 'Repos', dayStatus: 'État quotidien',
      rhythmLabel: '', watchGroup: 'Bordée 1', slot365: 'assignment:50', departureOn: '2026-07-14', workedHours: 0,
      rest24h: 0, cumulative7d: 0, comments: 'Cherbourg', sourceLabel: 'seapilot-assignment-note',
    };
    const events = getAllPlanningCrewEvents({ ...overview, assignments: [assignment], periods: [], days: [technicalDay] });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ assignmentId: 50, dailyNotes: { '2026-07-14': 'Cherbourg' }, dailyStatuses: { '2026-07-14': 'Repos' } });
  });

  it('groups visible crew by vessel, watch and role', () => {
    const rows = buildPlanningCrewRows(overview, buildPlanningTimeline('2026-07-12', 'month'), { vesselName: '', personName: '' });
    expect(rows.map((row) => [row.type, row.label])).toEqual([
      ['vessel', 'GOURY'],
      ['board', 'Bordée 1'],
      ['person', 'Anne CAPITAINE'],
    ]);
    expect(rows[0].projects).toHaveLength(2);
  });

  it('finds active unassigned marins for the visible range', () => {
    expect(getUnassignedPlanningPeople(overview, { start: '2026-07-01', end: '2026-07-31' }, { vesselName: '', personName: '' }).map((person) => person.id)).toEqual([2]);
  });

  it('builds the 90-day certificate/RH alarms and excludes billed projects', () => {
    expect(buildPlanningCertificateAlerts(overview, '2026-07-12')[0]).toMatchObject({ title: 'Franc-bord', tone: 'danger' });
    expect(buildPlanningHrAlerts(overview, '2026-07-12')[0]).toMatchObject({ title: 'Anne CAPITAINE', tone: 'warning' });
    expect(getUnbilledPlanningProjects(overview, 2026).map((project) => project.title)).toEqual(['Mission A']);
  });
});
