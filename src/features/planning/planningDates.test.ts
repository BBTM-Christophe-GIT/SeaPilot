import { describe, expect, it } from 'vitest';
import {
  addPlanningDays,
  daysBetween,
  formatPlanningDate,
  inclusivePlanningDayCount,
  isPlanningDate,
  isPlanningLocalDateTime,
  planningLocalDateTimeToUtc,
  rangesOverlap,
  shiftPlanningMonths,
  shiftPlanningYears,
  utcToPlanningLocalDateTime,
} from './planningDates';

describe('planning civil dates', () => {
  it('accepts real ISO civil dates and rejects calendar rollovers', () => {
    expect(isPlanningDate('2028-02-29')).toBe(true);
    expect(isPlanningDate('2026-02-29')).toBe(false);
    expect(isPlanningDate('2026-13-01')).toBe(false);
    expect(isPlanningDate('07/07/2026')).toBe(false);
  });

  it('represents an event passing midnight as two inclusive civil dates', () => {
    expect(daysBetween('2026-10-24', '2026-10-25')).toBe(1);
    expect(inclusivePlanningDayCount('2026-10-24', '2026-10-25')).toBe(2);
  });

  it('keeps multi-day durations stable across daylight-saving changes', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(inclusivePlanningDayCount('2026-03-28', '2026-03-30')).toBe(3);
    expect(addPlanningDays('2026-03-28', 2)).toBe('2026-03-30');
  });

  it('stores maritime assignment instants in UTC and restores Europe/Paris local time', () => {
    expect(isPlanningLocalDateTime('2026-07-20T08:15')).toBe(true);
    expect(planningLocalDateTimeToUtc('2026-07-20T08:15')).toBe('2026-07-20T06:15:00.000Z');
    expect(utcToPlanningLocalDateTime('2026-07-20T06:15:00.000Z')).toBe('2026-07-20T08:15');
  });

  it('rejects a nonexistent local time during the spring daylight-saving change', () => {
    expect(() => planningLocalDateTimeToUtc('2026-03-29T02:30')).toThrow('heure locale inexistante');
  });

  it('clamps month and year navigation instead of skipping a month', () => {
    expect(shiftPlanningMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(shiftPlanningYears('2028-02-29', 1)).toBe('2029-02-28');
  });

  it('does not crash on absent historical dates', () => {
    expect(formatPlanningDate('')).toBe('Date non renseignée');
    expect(rangesOverlap('', '', '2026-07-01', '2026-07-31')).toBe(false);
  });
});
