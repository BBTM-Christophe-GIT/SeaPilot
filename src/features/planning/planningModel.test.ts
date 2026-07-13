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
    { id: 20, title: 'Mission A', startsOn: '2026-07-02', endsOn: '2026-07-15', description: '', clientName: '', primaryVesselId: 1, primaryVesselName: 'GOURY', secondaryVesselId: null, secondaryVesselName: '', status: 'Validé', sourceLabel: 'sharepoint' },
    { id: 21, title: 'Mission B', startsOn: '2026-08-02', endsOn: '2026-08-15', description: '', clientName: '', primaryVesselId: 1, primaryVesselName: 'GOURY', secondaryVesselId: null, secondaryVesselName: '', status: 'Facturé', sourceLabel: 'sharepoint' },
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
};

describe('planning timeline rules', () => {
  it('keeps the SPFx 14-day week and builds month/year ranges', () => {
    expect(buildPlanningTimeline('2026-07-12', 'week')).toHaveLength(14);
    expect(buildPlanningTimeline('2026-07-12', 'month')).toHaveLength(49);
    expect(buildPlanningTimeline('2026-07-12', 'year')).toHaveLength(365);
    expect(timelineRange(buildPlanningTimeline('2026-07-12', 'week'))).toEqual({ start: '2026-07-06', end: '2026-07-19' });
  });

  it('normalizes imported crew and project statuses', () => {
    expect(normalizePlanningStatus('Embarqué')).toBe('En Mer');
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

    expect(controls[0]).toMatchObject({ code: 'expired_medical', level: 'warning' });
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
