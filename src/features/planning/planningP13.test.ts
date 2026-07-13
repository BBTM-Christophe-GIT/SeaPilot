import { describe, expect, it } from 'vitest';
import type { PlanningDayRecord, PlanningOverview } from './planningQueries';
import {
  buildPlanningDependencyViolations,
  buildPlanningP13Dashboard,
  buildPlanningWorkRestChecks,
  type PlanningDependencyRecord,
  type PlanningP13Data,
  type PlanningWorkRestPolicy,
} from './planningP13';
import { EMPTY_PLANNING_OVERVIEW } from './usePlanningOverview';

const policy: PlanningWorkRestPolicy = {
  id: 1, name: 'Politique interne test', scope: 'company', vesselId: null,
  effectiveFrom: '2026-01-01', effectiveTo: '', maxWork24h: 12, minRest24h: 11,
  maxWork7d: 72, minRest7d: 96, minConsecutiveRestHours: 6, maxRestPeriods24h: 2,
  nightStartsAt: '22:00', nightEndsAt: '06:00', maxNightWork24h: 8,
  includeHandover: true, active: true, notes: '', updatedAt: '',
};

function planningDay(overrides: Partial<PlanningDayRecord> = {}): PlanningDayRecord {
  return {
    id: 1, personId: 10, vesselId: 2, crewName: 'Anne MARTIN', captainName: '', vesselName: 'COTENTIN',
    workDate: '2026-08-04', disembarkOn: '', yearNumber: 2026, monthNumber: 8, monthLabel: 'Août', dayNumber: 4,
    functionLabel: 'Capitaine', sailorStatus: 'En mer', dayStatus: 'Travail', rhythmLabel: 'Jour', watchGroup: 'A',
    slot365: '', departureOn: '', workedHours: 12, rest24h: 10, cumulative7d: 80,
    consecutiveRestHours: 5, restPeriodCount: 3, nightWorkHours: 9, comments: '', sourceLabel: 'test',
    ...overrides,
  };
}

function overview(): PlanningOverview {
  return {
    ...EMPTY_PLANNING_OVERVIEW,
    vessels: [{ id: 2, name: 'COTENTIN', acronym: 'CTN', active: true }],
    people: [{ id: 10, firstName: 'Anne', lastName: 'MARTIN', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', active: true }],
    days: [planningDay()],
    handovers: [{
      id: 20, vesselId: 2, handoverAt: '2026-08-04T08:00:00Z', location: 'Cherbourg', durationMinutes: 60,
      responsiblePersonId: 10, comments: '', status: 'confirmed', createdBy: '', updatedBy: '', createdAt: '', updatedAt: '',
      positions: [{ id: 21, handoverId: 20, positionOrder: 0, functionLabel: 'Capitaine', outgoingPersonId: 10, incomingPersonId: null, outgoingAssignmentId: null, incomingAssignmentId: null, comments: '' }],
    }],
    rules: [{ id: 90, code: 'work_24h', name: 'Travail 24 h', description: '', scope: 'work_rest', controlLevel: 'warning', active: true, effectiveFrom: '2026-01-01', configuration: {}, sourceReference: '', version: 1 }],
    derogations: [{ id: 91, ruleId: 90, assignmentId: null, personId: 10, vesselId: 2, reason: 'Dérogation test', startsAt: '2026-08-04T00:00:00Z', endsAt: '2026-08-04T23:59:00Z', evidenceUrl: '', status: 'active', authorId: '', authorName: '', createdAt: '', updatedAt: '' }],
  };
}

const emptyData: PlanningP13Data = {
  policies: [], notifications: [], dependencies: [],
  p12: { absences: [], conflictCases: [], conflictHistory: [], matrices: [] },
};

describe('Planning P1.3 work and rest engine', () => {
  it('uses only the configured thresholds, includes handover time and applies a matching derogation', () => {
    const checks = buildPlanningWorkRestChecks(overview(), [policy], { start: '2026-08-01', end: '2026-08-07' });
    expect(checks).toHaveLength(7);
    expect(checks.find((check) => check.ruleCode === 'work_24h')).toMatchObject({ value: 13, threshold: 12, status: 'derogated', derogationId: 91 });
    expect(checks.find((check) => check.ruleCode === 'rest_24h')).toMatchObject({ value: 10, threshold: 11, status: 'non_compliant' });
    expect(checks.find((check) => check.ruleCode === 'work_7d')).toMatchObject({ value: 80, threshold: 72, status: 'non_compliant' });
    expect(checks.find((check) => check.ruleCode === 'rest_7d')).toMatchObject({ value: 88, threshold: 96, status: 'non_compliant' });
    expect(checks.find((check) => check.ruleCode === 'consecutive_rest')).toMatchObject({ value: 5, status: 'non_compliant' });
    expect(checks.find((check) => check.ruleCode === 'rest_periods')).toMatchObject({ value: 3, status: 'non_compliant' });
    expect(checks.find((check) => check.ruleCode === 'night_work')).toMatchObject({ value: 9, status: 'non_compliant' });
  });

  it('does not invent regulatory thresholds when no policy is configured', () => {
    const checks = buildPlanningWorkRestChecks(overview(), [], { start: '2026-08-01', end: '2026-08-07' });
    expect(checks.every((check) => check.threshold === null && check.status === 'not_evaluable')).toBe(true);
  });

  it('marks missing consecutive, split-rest and night data as not evaluable', () => {
    const source = overview();
    source.days = [planningDay({ consecutiveRestHours: null, restPeriodCount: null, nightWorkHours: null })];
    const checks = buildPlanningWorkRestChecks(source, [policy], { start: '2026-08-01', end: '2026-08-07' });
    expect(checks.filter((check) => ['consecutive_rest', 'rest_periods', 'night_work'].includes(check.ruleCode)).every((check) => check.status === 'not_evaluable')).toBe(true);
  });
});

describe('Planning P1.3 dependencies and dashboard', () => {
  const dependency: PlanningDependencyRecord = {
    id: 1, dependencyType: 'maintenance_recommission', predecessorKind: 'project', predecessorId: 100,
    successorKind: 'project', successorId: 101, lagMinutes: 60, vesselId: 2, personId: null,
    notes: '', active: true, createdAt: '', updatedAt: '',
  };

  it('detects a successor that starts before maintenance and its lag are complete', () => {
    const source = overview();
    source.projects = [
      { id: 100, title: 'Maintenance', startsOn: '2026-08-01', endsOn: '2026-08-03', description: '', clientName: '', primaryVesselId: 2, primaryVesselName: 'COTENTIN', secondaryVesselId: null, secondaryVesselName: '', eventType: 'maintenance', responsibleName: '', status: 'Confirmé', sourceLabel: 'test' },
      { id: 101, title: 'Remise en service', startsOn: '2026-08-03', endsOn: '2026-08-05', description: '', clientName: '', primaryVesselId: 2, primaryVesselName: 'COTENTIN', secondaryVesselId: null, secondaryVesselName: '', eventType: 'operation', responsibleName: '', status: 'Confirmé', sourceLabel: 'test' },
    ];
    expect(buildPlanningDependencyViolations(source, [], [dependency])[0]).toMatchObject({ violated: true, predecessorLabel: 'Maintenance', successorLabel: 'Remise en service' });
  });

  it('builds the operational KPI snapshot and cumulative 7/14/30-day deadlines', () => {
    const source = overview();
    source.projects = [{ id: 1, title: 'Opération', startsOn: '2026-08-01', endsOn: '2026-08-10', description: '', clientName: '', primaryVesselId: 2, primaryVesselName: 'COTENTIN', secondaryVesselId: null, secondaryVesselName: '', eventType: 'operation', responsibleName: '', status: 'Confirmé', sourceLabel: 'test' }];
    source.assignments = [{ id: 2, vesselId: 2, vesselName: 'COTENTIN', captainPersonId: null, captainName: '', crewPersonId: 10, crewName: 'Anne MARTIN', startsOn: '2026-08-01', endsOn: '2026-08-10', startsAt: '', endsAt: '', assignmentRole: 'Capitaine', statusLabel: 'En mer', confirmationStatus: 'confirmed', watchGroup: 'A', comments: '', sourceLabel: 'test' }];
    source.certificates = [{ id: 3, vesselId: 2, vesselName: 'COTENTIN', title: 'Certificat', status: 'Valide', expiresOn: '2026-08-10', fileUrl: '' }];
    const data: PlanningP13Data = { ...emptyData, notifications: [{ id: 1, notificationType: 'publication', severity: 'information', title: 'Publié', body: 'Planning publié', entityKind: 'publication', entityId: 1, personId: null, vesselId: 2, dueOn: '', createdAt: '', readAt: '' }] };
    const checks = buildPlanningWorkRestChecks(source, [policy], { start: '2026-08-01', end: '2026-08-07' });
    const result = buildPlanningP13Dashboard(source, data, checks, [], '2026-08-04');
    expect(result).toMatchObject({ operatingVessels: 1, embarkedSailors: 1, availableSailors: 0, deadlines7Days: 1, deadlines14Days: 1, deadlines30Days: 1, unreadNotifications: 1 });
  });

  it('evaluates thousands of day controls without a quadratic scan', () => {
    const source = overview();
    source.people = Array.from({ length: 100 }, (_, index) => ({ ...source.people[0], id: index + 1, firstName: `Marin${index}` }));
    source.days = source.people.flatMap((person) => Array.from({ length: 31 }, (_, dayIndex) => planningDay({ id: person.id * 100 + dayIndex, personId: person.id, workDate: `2026-08-${String(dayIndex + 1).padStart(2, '0')}`, workedHours: 8, cumulative7d: null })));
    const startedAt = performance.now();
    const checks = buildPlanningWorkRestChecks(source, [policy], { start: '2026-08-01', end: '2026-08-31' });
    const duration = performance.now() - startedAt;
    expect(checks).toHaveLength(21_700);
    expect(duration).toBeLessThan(1000);
  });
});
