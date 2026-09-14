import { describe, expect, it } from 'vitest';
import { buildPlanningCrewBalanceDays, planningCrewDayCents } from './planningCrewBalance';
import { EMPTY_PLANNING_OVERVIEW } from './usePlanningOverview';
import type { PlanningAssignmentRecord, PlanningOverview, PlanningPerson } from './planningQueries';
import { getAllPlanningCrewEvents } from './planningModel';
import { buildPlanningCrewLanes } from './planningViews';
import { getPlanningConflictDatesByEvent } from './planningOverlap';
import type { PlanningAbsenceRecord } from './planningP12';

const person: PlanningPerson = { id: 20, firstName: 'Alexandre', lastName: 'ROUPSARD', functionLabel: 'Chef Mécanicien', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '2020-01-01', departedOn: '', active: true };
const assignment = (id: number, startsOn: string, endsOn: string, statusLabel = 'En Mer', extra: Partial<PlanningAssignmentRecord> = {}): PlanningAssignmentRecord => ({
  id, startsOn, endsOn, statusLabel, vesselId: 2, vesselName: 'LE ROZEL', crewPersonId: person.id, crewName: 'Alexandre ROUPSARD', captainPersonId: null, captainName: '', assignmentRole: '2nd Capitaine', confirmationStatus: 'confirmed', watchGroup: 'Bordée 1', comments: '', sourceLabel: 'seapilot', ...extra,
});
const overview = (assignments: PlanningAssignmentRecord[]): PlanningOverview => ({ ...EMPTY_PLANNING_OVERVIEW, people: [person], assignments });
const range = { start: '2026-09-30', end: '2026-10-08' };
const ref = { personId: person.id, asOf: range.start, balance: 10 };

describe('crew cumulative balance', () => {
  it.each([['En Mer', 105], ['A Terre', 50], ['Extra', 205], ['Formation', 50], ['Arrêt Maladie', 0], ['Accident du Travail', 0], ['Repos', -100], ['Congés', -100], ['', -100]])('%s has the agreed weight in cents', (status, cents) => expect(planningCrewDayCents(status)).toBe(cents));
  it('starts the day after the EOD checkpoint and carries the sum across months and empty days', () => {
    const data = overview([
      assignment(1, '2026-09-30', '2026-10-01'), assignment(2, '2026-10-02', '2026-10-02', 'A Terre'),
      assignment(3, '2026-10-03', '2026-10-03', 'Extra'), assignment(4, '2026-10-04', '2026-10-04', 'Congés'),
      assignment(5, '2026-10-06', '2026-10-06', 'Arrêt Maladie'), assignment(6, '2026-10-07', '2026-10-07', 'Accident du Travail'),
      assignment(7, '2026-10-08', '2026-10-08', 'Formation'),
    ]);
    const result = buildPlanningCrewBalanceDays(person, data, [], [ref], range);
    expect([...result.values()].map((day) => day.value)).toEqual([10, 11.05, 11.55, 13.6, 12.6, 11.6, 11.6, 11.6, 12.1]);
    expect(buildPlanningCrewBalanceDays(person, data, [], [ref], { start: '2026-10-08', end: '2026-10-08' }).get('2026-10-08')?.value).toBe(12.1);
  });
  it('requires a reference, permits negative balances and resets at a later EOD checkpoint', () => {
    expect(buildPlanningCrewBalanceDays(person, overview([]), [], [], range).get(range.end)?.value).toBeNull();
    const result = buildPlanningCrewBalanceDays(person, overview([]), [], [{ ...ref, balance: 0 }, { ...ref, asOf: '2026-10-03', balance: 5 }], range);
    expect(result.get('2026-10-02')?.value).toBe(-2);
    expect(result.get('2026-10-03')?.value).toBe(5);
    expect(result.get('2026-10-04')?.value).toBe(4);
  });
  it('does not debit outside employment or invent an unknown status weight', () => {
    const limited = { ...person, hiredOn: '2026-10-02', departedOn: '2026-10-03' };
    const result = buildPlanningCrewBalanceDays(limited, overview([]), [], [ref], range);
    expect(result.get('2026-10-01')?.value).toBeNull();
    expect(result.get('2026-10-03')?.value).toBe(8);
    expect(result.get('2026-10-04')?.value).toBeNull();
    expect(buildPlanningCrewBalanceDays(person, overview([assignment(1, '2026-10-01', '2026-10-01', 'Inconnu')]), [], [ref], range).get(range.end)?.explanation).toContain('À préciser');
  });
  it('retains the saved fleet decision, ignores cancellations, and counts the overlapping role only once', () => {
    const data = overview([
      assignment(122, '2026-08-03', '2026-08-10', 'En Mer', { updatedAt: '2026-07-31T11:17:16Z' }),
      assignment(123, '2026-08-03', '2026-08-03', 'En Mer', { confirmationStatus: 'cancelled', assignmentRole: 'Matelot Polyvalent', updatedAt: '2026-07-16T14:13:16Z' }),
      assignment(125, '2026-08-03', '2026-08-03', 'Extra', { assignmentRole: 'Matelot Polyvalent', updatedAt: '2026-07-16T14:13:25Z' }),
      assignment(126, '2026-08-03', '2026-08-05', 'En Mer', { vesselId: 3, vesselName: 'AUTRE', confirmationStatus: 'cancelled' }),
    ]);
    const events = getAllPlanningCrewEvents(data);
    expect(events.map((event) => event.id)).toEqual(['assignment-122']);
    expect(getPlanningConflictDatesByEvent(data).size).toBe(0);
    const dates = { start: '2026-08-02', end: '2026-08-04' };
    expect(buildPlanningCrewBalanceDays(person, data, [], [{ ...ref, asOf: dates.start, balance: 0 }], dates).get(dates.end)?.value).toBe(2.1);
    const filters = { vesselName: '', personName: '', eventType: '', status: '', responsible: '' };
    expect(buildPlanningCrewLanes(data, dates, filters, 'people')[0].events).toEqual(events);
    expect(buildPlanningCrewLanes(overview([]), dates, filters, 'teams')[0].personId).toBe(person.id);
  });
  it('applies daily edits and approved absences but ignores notes from a superseded assignment', () => {
    const data = overview([
      assignment(1, '2026-10-01', '2026-10-04', 'En Mer', { updatedAt: '2026-09-15T12:00:00Z' }),
      assignment(2, '2026-10-01', '2026-10-01', 'Extra', { updatedAt: '2026-09-01T12:00:00Z' }),
    ]);
    data.days = [
      { id: 1, personId: person.id, vesselId: 2, workDate: '2026-10-01', sourceLabel: 'seapilot-assignment-note', slot365: 'assignment:2', sailorStatus: 'Extra' },
      { id: 2, personId: person.id, vesselId: 2, workDate: '2026-10-02', sourceLabel: 'seapilot-assignment-note', slot365: 'assignment:1', sailorStatus: 'A Terre' },
    ] as PlanningOverview['days'];
    const absences = [
      { id: 1, personId: person.id, startsOn: '2026-10-03', endsOn: '2026-10-03', absenceType: 'leave', status: 'approved' },
      { id: 2, personId: person.id, startsOn: '2026-10-04', endsOn: '2026-10-04', absenceType: 'training', status: 'approved' },
    ] as PlanningAbsenceRecord[];
    const results = buildPlanningCrewBalanceDays(person, data, absences, [{ ...ref, balance: 0 }], { ...range, end: '2026-10-04' });
    expect([...results.values()].map((day) => day.value)).toEqual([0, 1.05, 1.55, 0.55, 1.05]);
  });
});
