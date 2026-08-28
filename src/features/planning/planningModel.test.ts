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
  getBillablePlanningProjects,
  isPlanningPersonEmployedDuring,
  isSedentaryPlanningFunction,
  normalizePlanningStatus,
  planningExpiredDocumentsForDate,
  planningReferenceMonthLabel,
  planningReferenceMonthRange,
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
    expect(timelineRange(buildPlanningTimeline('2026-07-12', 'month'))).toEqual({
      start: '2026-07-06',
      end: '2026-08-23',
    });
    expect(timelineRange(buildPlanningTimeline('2026-02-12', 'month'))).toEqual({
      start: '2026-02-09',
      end: '2026-03-29',
    });
    expect(timelineRange(buildPlanningTimeline('2026-07-29', 'month'))).toEqual({
      start: '2026-07-27',
      end: '2026-09-13',
    });
    expect(timelineRange(buildPlanningTimeline('2026-07-12', 'year'))).toEqual({
      start: '2025-11-01',
      end: '2027-02-28',
    });
    expect(buildPlanningTimeline('2026-07-12', 'year')).toHaveLength(485);
    expect(timelineRange(buildPlanningTimeline('2026-07-12', 'week'))).toEqual({ start: '2026-07-06', end: '2026-07-12' });
    expect(timelineRange(buildPlanningTimeline('2026-07-12', 'fortnight'))).toEqual({ start: '2026-07-06', end: '2026-07-19' });
  });

  it('normalizes imported crew and project statuses', () => {
    expect(normalizePlanningStatus('Embarqué')).toBe('En Mer');
    expect(planningStatusDisplayLabel('Vacance')).toBe('Vacances');
    expect(planningStatusDisplayLabel('Repos')).toBe('Repos');
    expect(normalizePlanningStatus('arrêt maladie')).toBe('Arrêt Maladie');
    expect(normalizePlanningStatus('accident du travail')).toBe('Accident du Travail');
    expect(planningStatusTone('Arrêt Maladie')).toBe('sick-leave');
    expect(planningStatusTone('Accident du Travail')).toBe('accident');
    expect(planningStatusTone('Formation')).toBe('training');
    expect(projectStatusTone('À facturer')).toBe('billed');
    expect(projectStatusTone('Validé')).toBe('valid');
    expect(projectStatusTone('Non validé')).toBe('unvalidated');
  });

  it('checks employment dates against the complete reference month', () => {
    const january2025 = planningReferenceMonthRange('2025-01-18');
    expect(january2025).toEqual({ start: '2025-01-01', end: '2025-01-31' });
    expect(planningReferenceMonthLabel('2025-01-18')).toBe('Janvier 2025');
    expect(planningReferenceMonthLabel('2026-08-25')).toBe('Août 2026');
    expect(isPlanningPersonEmployedDuring({ hiredOn: '2022-03-01', departedOn: '2025-01-12' }, january2025)).toBe(true);
    expect(isPlanningPersonEmployedDuring({ hiredOn: '2025-01-31', departedOn: '' }, january2025)).toBe(true);
    expect(isPlanningPersonEmployedDuring({ hiredOn: '2025-02-01', departedOn: '' }, january2025)).toBe(false);
    expect(isPlanningPersonEmployedDuring({ hiredOn: '2020-01-01', departedOn: '2024-12-31' }, january2025)).toBe(false);
  });

  it('uses employment dates instead of the current active flag for historical assignments', () => {
    const historicalPerson = {
      ...overview.people[1],
      id: 37,
      firstName: 'Loic',
      lastName: 'ALIX',
      hiredOn: '2024-07-01',
      departedOn: '2025-12-02',
      active: false,
    };
    const historicalOverview = {
      ...overview,
      people: [...overview.people, historicalPerson],
      rules: [{
        id: 90,
        code: 'inactive_person',
        name: 'Période d’emploi',
        description: '',
        scope: 'availability',
        controlLevel: 'blocking' as const,
        active: true,
        effectiveFrom: '2020-01-01',
        configuration: {},
        sourceReference: '',
        version: 1,
      }],
    };

    expect(evaluatePlanningAssignment(historicalOverview, {
      id: 'historical-valid',
      personId: historicalPerson.id,
      person: 'Loic ALIX',
      vessel: 'GOURY',
      functionLabel: 'Matelot',
      status: 'En Mer',
      startsOn: '2025-01-10',
      endsOn: '2025-01-20',
    })).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'inactive_person' })]));

    expect(evaluatePlanningAssignment(historicalOverview, {
      id: 'historical-invalid',
      personId: historicalPerson.id,
      person: 'Loic ALIX',
      vessel: 'GOURY',
      functionLabel: 'Matelot',
      status: 'En Mer',
      startsOn: '2026-01-10',
      endsOn: '2026-01-20',
    })).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'inactive_person' })]));
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

  it('treats document expiry as a visual alert instead of an assignment control', () => {
    const controls = evaluatePlanningAssignment({
      ...overview,
      people: overview.people.map((person) => ({ ...person, deckCertificateLabel: 'Capitaine 500' })),
    }, {
      id: 'new',
      personId: 1,
      person: 'Anne CAPITAINE',
      vessel: 'GOURY',
      functionLabel: 'Capitaine',
      status: 'En Mer',
      startsOn: '2026-08-01',
      endsOn: '2026-08-15',
    });

    expect(controls).toEqual([]);
    expect(hasBlockingPlanningControls(controls)).toBe(false);
  });

  it('finds every expired document for a sailor and a calendar date', () => {
    const documents = [
      { ...overview.hrDocuments[0], id: 41, title: 'Brevet pont', expiresOn: '2026-07-31' },
      { ...overview.hrDocuments[0], id: 42, title: 'Visite médicale', expiresOn: '2026-08-01' },
      { ...overview.hrDocuments[0], id: 43, title: 'Document administratif', expiresOn: '', status: 'expired' },
    ];
    expect(planningExpiredDocumentsForDate(documents, 1, '2026-08-01').map((document) => document.title)).toEqual([
      'Brevet pont',
      'Document administratif',
    ]);
    expect(planningExpiredDocumentsForDate(documents, 1, '2026-08-02')).toHaveLength(3);
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

  it('orders every board hierarchy by the HR function sequence', () => {
    const functions = [
      'Président',
      'Capitaine',
      'Chef Mécanicien',
      '2nd Capitaine',
      '2nd Mécanicien',
      "Maître d'Equipage",
      'Matelot polyvalent',
      'Matelot Qualifié',
      'Directeur QHSE / Chef de Projet',
      'Directrice Administrative et Financière',
      'Stagiaire',
    ];
    const firstNames = ['Zoé', 'Yann', 'Xavier', 'William', 'Violette', 'Victor', 'Ulysse', 'Thomas', 'Simon', 'Rémi', 'Quentin'];
    const people = functions.map((functionLabel, index) => ({
      ...overview.people[0],
      id: index + 100,
      firstName: firstNames[index],
      lastName: `ROLE${index + 1}`,
      functionLabel,
    }));
    const periods = functions.map((functionLabel, index) => ({
      ...overview.periods[0],
      id: index + 100,
      personId: people[index].id,
      crewName: `${people[index].firstName} ${people[index].lastName}`,
      functionLabel,
    })).reverse();

    const rows = buildPlanningCrewRows({ ...overview, people, periods }, buildPlanningTimeline('2026-07-12', 'month'), { vesselName: '', personName: '' });

    expect(rows.filter((row) => row.type === 'person').map((row) => row.functionLabel)).toEqual(functions);
  });

  it('uses the catalog vessel label to merge historical Armement spellings', () => {
    const armementOverview: PlanningOverview = {
      ...overview,
      vessels: [{ id: 13, name: 'Armement - Cherbourg', acronym: 'ARM', active: true }],
      periods: [{
        ...overview.periods[0],
        vesselId: 13,
        vesselName: 'ARMEMENT CHERBOURG',
        watchGroup: 'Armement',
      }],
      projects: [],
    };
    const events = getAllPlanningCrewEvents(armementOverview);
    const rows = buildPlanningCrewRows(
      armementOverview,
      buildPlanningTimeline('2026-07-12', 'month'),
      { vesselName: '', personName: '' },
      events,
    );

    expect(events).toEqual([
      expect.objectContaining({ vesselId: 13, vessel: 'Armement - Cherbourg', board: 'Armement' }),
    ]);
    expect(rows.filter((row) => row.type === 'vessel').map((row) => row.label)).toEqual(['Armement - Cherbourg']);
  });

  it('keeps a departed sailor visible as an empty deletable board row', () => {
    const departedPerson = {
      id: 3,
      firstName: 'Alain',
      lastName: 'ANCIEN',
      functionLabel: 'Matelot',
      gradeLabel: '',
      roleLabel: '',
      contractType: 'CDD',
      hiredOn: '2020-01-01',
      departedOn: '2025-12-31',
      active: false,
    };
    const rows = buildPlanningCrewRows({
      ...overview,
      people: [...overview.people, departedPerson],
      boardRows: [{
        id: 90,
        vesselId: 1,
        personId: 3,
        watchGroup: 'Bordée 2',
        functionLabel: 'Matelot',
        createdAt: '2026-07-17T08:00:00Z',
      }],
    }, buildPlanningTimeline('2026-07-12', 'month'), { vesselName: '', personName: '' });

    expect(rows.find((row) => row.label === 'Alain ANCIEN')).toMatchObject({
      type: 'person',
      board: 'Bordée 2',
      boardRowId: 90,
      hasAnyRecords: false,
      events: [],
    });
  });

  it('finds active unassigned marins for the visible range', () => {
    const overviewWithDepartedDuplicate = {
      ...overview,
      people: [
        ...overview.people,
        {
          ...overview.people[1],
          id: 55,
          firstName: 'Nicolas',
          lastName: 'BODINIER',
          hiredOn: '2025-05-05',
          departedOn: '2025-07-31',
          active: false,
        },
      ],
    };

    expect(
      getUnassignedPlanningPeople(
        overviewWithDepartedDuplicate,
        { start: '2026-07-01', end: '2026-07-31' },
        { vesselName: '', personName: '' },
      ).map((person) => person.id),
    ).toEqual([2]);
  });

  it('builds the 90-day certificate/RH alarms and keeps only validated projects to bill', () => {
    const overviewWithEveryBillingStatus: PlanningOverview = {
      ...overview,
      projects: [
        ...overview.projects,
        { ...overview.projects[0], id: 22, title: 'Mission non validée', status: 'Non validé' },
        { ...overview.projects[0], id: 23, title: 'Mission météo', status: 'Stand-by météo' },
      ],
    };

    expect(buildPlanningCertificateAlerts(overview, '2026-07-12')[0]).toMatchObject({ title: 'Franc-bord', tone: 'danger' });
    expect(buildPlanningHrAlerts(overview, '2026-07-12')[0]).toMatchObject({ title: 'Anne CAPITAINE', tone: 'warning' });
    expect(getBillablePlanningProjects(overviewWithEveryBillingStatus, 2026).map((project) => project.title)).toEqual(['Mission A']);
  });
});
