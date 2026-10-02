import { describe, expect, it } from 'vitest';
import { buildPlanningLeaveCounterSummaries, getPlanningLeaveRightsRange, getPlanningRequestCrewBalance, planningFrenchPublicHolidays, planningWorkingAbsenceDates, validatePlanningLeaveCounterPeriod, validatePlanningLeaveRightsPeriod, type PlanningAbsenceBalanceContext } from './planningAbsenceBalance';
import { planningLocalDateTimeToUtc } from './planningDates';
import type { PlanningAbsenceRecord } from './planningP12';

const period = { id: 1, counterType: 'leave' as const, startsOn: '2026-01-01', endsOn: '2026-12-31', entitlement: 25 };
const person = { id: 15, firstName: 'Christophe', lastName: 'MINASSIAN', functionLabel: '', gradeLabel: '', roleLabel: '', contractType: '', hiredOn: '2020-01-01', departedOn: '', active: true };
const base: PlanningAbsenceBalanceContext = { kind: 'leave_rtt', person, counterPeriods: [period, { ...period, id: 2, counterType: 'rtt', entitlement: 10 }], absences: [], crewCheckpoints: [], crewSources: { assignments: [], periods: [], days: [] } };
const request = { absenceType: 'leave' as const, startsAt: '2026-10-12T08:00', endsAt: '2026-10-13T18:00' };
function absence(id: number, start: string, end: string, status: PlanningAbsenceRecord['status'] = 'approved', type: PlanningAbsenceRecord['absenceType'] = 'leave'): PlanningAbsenceRecord {
  return { id, personId: person.id, absenceType: type, startsAt: planningLocalDateTimeToUtc(start), endsAt: planningLocalDateTimeToUtc(end), startsOn: start.slice(0, 10), endsOn: end.slice(0, 10), status, reason: '', requestedBy: '', reviewedBy: '', reviewedAt: '', reviewComment: '', createdAt: '', updatedAt: '' };
}

describe('working days for leave / RTT entitlements', () => {
  // Service Public F2405, France general case; weekends do not become extra holidays.
  it.each([
    [2026, ['2026-01-01', '2026-04-06', '2026-05-01', '2026-05-08', '2026-05-14', '2026-05-25', '2026-07-14', '2026-08-15', '2026-11-01', '2026-11-11', '2026-12-25']],
    [2027, ['2027-01-01', '2027-03-29', '2027-05-01', '2027-05-08', '2027-05-06', '2027-05-17', '2027-07-14', '2027-08-15', '2027-11-01', '2027-11-11', '2027-12-25']],
  ] as const)('excludes the eleven national holidays in %s', (year, dates) => expect([...planningFrenchPublicHolidays(year)].sort()).toEqual([...dates].sort()));
  it('counts Monday through Friday, excluding national holidays, with inclusive clipped dates', () => {
    expect([...planningWorkingAbsenceDates('2026-05-07T06:00:00Z', '2026-05-15T16:00:00Z')]).toEqual(['2026-05-07', '2026-05-11', '2026-05-12', '2026-05-13', '2026-05-15']);
    expect([...planningWorkingAbsenceDates('2026-05-07T06:00:00Z', '2026-05-15T16:00:00Z', { start: '2026-05-11', end: '2026-05-14' })]).toEqual(['2026-05-11', '2026-05-12', '2026-05-13']);
  });
  it('uses Paris local dates and exclusive midnight through DST, and counts each partial working date once', () => {
    expect([...planningWorkingAbsenceDates('2026-10-23T06:00:00Z', '2026-10-25T23:00:00Z')]).toEqual(['2026-10-23']);
    expect([...planningWorkingAbsenceDates('2026-03-27T07:00:00Z', '2026-03-30T22:00:00Z')]).toEqual(['2026-03-27', '2026-03-30']);
    expect(planningWorkingAbsenceDates('2026-10-01T08:00:00Z', '2026-10-01T10:00:00Z').size).toBe(1);
    expect(planningWorkingAbsenceDates('invalid', 'invalid').size).toBe(0);
  });
});

describe('rights minus all approved days in the configured period', () => {
  it('deducts historical and future approved requests only, with pending requests separate and other types ignored', () => {
    const absences = [absence(1, '2026-02-02T08:00', '2026-02-03T18:00'), absence(2, '2026-12-14T08:00', '2026-12-14T18:00'), absence(3, '2026-11-02T08:00', '2026-11-03T18:00', 'requested'), absence(4, '2026-02-09T08:00', '2026-02-10T18:00', 'cancelled'), absence(5, '2026-02-16T08:00', '2026-02-17T18:00', 'rejected'), absence(6, '2026-02-23T08:00', '2026-02-23T18:00', 'approved', 'rtt'), absence(7, '2026-02-24T08:00', '2026-02-25T18:00', 'approved', 'illness')];
    const result = buildPlanningLeaveCounterSummaries({ ...base, absences }, request, '2026-10-01');
    expect(result[0]).toMatchObject({ approvedDays: 3, pendingDays: 2, remaining: 22, requestDays: 2, newRequestDays: 2, projectedRemaining: 20 });
    expect(result[1]).toMatchObject({ approvedDays: 1, pendingDays: 0, remaining: 9, requestDays: null, projectedRemaining: null });
  });
  it('counts overlapping dates once and excludes the request being edited', () => {
    const absences = [absence(1, '2026-10-12T08:00', '2026-10-13T18:00'), absence(2, '2026-10-13T08:00', '2026-10-14T18:00'), absence(3, '2026-10-13T08:00', '2026-10-15T18:00', 'requested')];
    expect(buildPlanningLeaveCounterSummaries({ ...base, absences }, request, '2026-10-01')[0]).toMatchObject({ approvedDays: 3, pendingDays: 1, remaining: 22, newRequestDays: 0, projectedRemaining: 22 });
    expect(buildPlanningLeaveCounterSummaries({ ...base, absences }, { ...request, absenceId: 3 }, '2026-10-01')[0].pendingDays).toBe(0);
  });
  it('recomputes after a cancellation, a deletion or a reclassification without a stored running total', () => {
    const a = absence(1, '2026-10-12T08:00', '2026-10-13T18:00');
    expect(buildPlanningLeaveCounterSummaries({ ...base, absences: [a] }, request, '2026-10-01')[0].remaining).toBe(23);
    for (const absences of [[], [{ ...a, status: 'cancelled' as const }], [{ ...a, absenceType: 'rtt' as const }]]) expect(buildPlanningLeaveCounterSummaries({ ...base, absences }, request, '2026-10-01')[0].remaining).toBe(25);
  });
  it('supports custom periods, clips absences crossing them and splits a request over two periods', () => {
    const context = { ...base, counterPeriods: [{ ...period, startsOn: '2026-06-01', endsOn: '2027-05-31' }, { ...period, id: 3, startsOn: '2027-06-01', endsOn: '2028-05-31', entitlement: 20 }], absences: [absence(1, '2026-05-29T08:00', '2026-06-02T18:00')] };
    const result = buildPlanningLeaveCounterSummaries(context, { ...request, startsAt: '2027-05-31T08:00', endsAt: '2027-06-02T18:00' }, '2026-10-01');
    expect(result.filter((row) => row.counterType === 'leave').map((row) => [row.approvedDays, row.requestDays, row.projectedRemaining])).toEqual([[2, 1, 22], [0, 2, 18]]);
  });
  it('distinguishes uninitialized rights from explicit zero and warns for uncovered working dates', () => {
    expect(buildPlanningLeaveCounterSummaries({ ...base, counterPeriods: [] }, request, '2026-10-01')[0]).toMatchObject({ remaining: null, projectedRemaining: null, uncoveredRequestDays: 2 });
    expect(buildPlanningLeaveCounterSummaries({ ...base, counterPeriods: [{ ...period, entitlement: 0 }] }, request, '2026-10-01')[0]).toMatchObject({ remaining: 0, projectedRemaining: -2 });
    expect(buildPlanningLeaveCounterSummaries({ ...base, counterPeriods: [{ ...period, endsOn: '2026-10-12' }] }, request, '2026-10-01')[0]).toMatchObject({ requestDays: 1, uncoveredRequestDays: 1 });
  });
  it('does not project invalid or DST-gap local times', () => {
    expect(buildPlanningLeaveCounterSummaries(base, { ...request, startsAt: '2026-03-29T02:30' }, '2026-10-01')[0].requestDays).toBeNull();
    expect(buildPlanningLeaveCounterSummaries(base, { ...request, endsAt: '2026-10-11T18:00' }, '2026-10-01')[0].requestDays).toBeNull();
  });
  it('reuses the existing crew formula and retains an unknown balance without a checkpoint', () => {
    expect(getPlanningRequestCrewBalance({ ...base, kind: 'crew' }, '2026-10-01').value).toBeNull();
    expect(getPlanningRequestCrewBalance({ ...base, kind: 'crew', crewCheckpoints: [{ personId: person.id, asOf: '2026-09-30', balance: 10 }] }, '2026-10-01').value).toBe(9);
  });
});

describe('period input validation', () => {
  const draft = { ...period, personId: person.id };
  it('accepts zero and two decimals', () => { expect(validatePlanningLeaveCounterPeriod({ ...draft, entitlement: 0 }).entitlement).toBe(0); expect(validatePlanningLeaveCounterPeriod({ ...draft, entitlement: 25.25 }).entitlement).toBe(25.25); });
  it.each([{ startsOn: '2026-02-30' }, { endsOn: '2025-12-31' }, { startsOn: '1899-01-01' }, { endsOn: '2101-01-01' }, { startsOn: '2000-01-01', endsOn: '2020-01-01' }, { entitlement: -1 }, { entitlement: 100000 }, { entitlement: 1.123 }, { entitlement: NaN }, { personId: 0 }])('rejects invalid rights/period %j', (override) => expect(() => validatePlanningLeaveCounterPeriod({ ...draft, ...override })).toThrow());
});

describe('June through May combined rights', () => {
  const draft = { personId: person.id, startsOn: '2026-06-01', endsOn: '2027-05-31', leaveEntitlement: 25.5, rttEntitlement: 0 };
  it.each([
    ['2026-05-31', { start: '2025-06-01', end: '2026-05-31' }],
    ['2026-06-01', { start: '2026-06-01', end: '2027-05-31' }],
    ['2027-02-28', { start: '2026-06-01', end: '2027-05-31' }],
    ['2028-02-29', { start: '2027-06-01', end: '2028-05-31' }],
  ])('finds the rights year containing %s', (date, range) => expect(getPlanningLeaveRightsRange(date as string)).toEqual(range));
  it('uses the same annual bounds for both uninitialized counters', () => {
    const summaries = buildPlanningLeaveCounterSummaries({ ...base, counterPeriods: [] }, { ...request, startsAt: '2027-02-02T08:00', endsAt: '2027-02-02T18:00' }, '2026-10-01');
    expect(summaries.map((summary) => summary.range)).toEqual([{ start: draft.startsOn, end: draft.endsOn }, { start: draft.startsOn, end: draft.endsOn }]);
    expect(summaries.every((summary) => summary.remaining === null)).toBe(true);
  });
  it('requires both totals while accepting an explicit zero RTT entitlement', () => {
    expect(validatePlanningLeaveRightsPeriod(draft)).toEqual(draft);
    expect(() => validatePlanningLeaveRightsPeriod({ ...draft, rttEntitlement: NaN })).toThrow();
    expect(() => validatePlanningLeaveRightsPeriod({ ...draft, leaveEntitlement: -1 })).toThrow();
  });
  it.each([{ startsOn: '2026-01-01', endsOn: '2026-12-31' }, { startsOn: '2026-06-02' }, { endsOn: '2027-06-01' }, { endsOn: '2028-05-31' }])('rejects nonannual bounds %j', (override) => expect(() => validatePlanningLeaveRightsPeriod({ ...draft, ...override })).toThrow('1er juin'));
});
