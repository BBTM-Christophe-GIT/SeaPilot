import { describe, expect, it } from 'vitest';
import { buildPlanningAbsencePeriod, planningAbsenceCalendarWeeks, readPlanningAbsencePeriod } from './planningAbsencePeriodPickerModel';

describe('absence calendar civil dates', () => {
  it('represents an exclusive midnight end by the last included date and round-trips its timestamps', () => {
    const selection = readPlanningAbsencePeriod('2026-10-05T00:00', '2026-10-08T00:00');
    expect(selection).toEqual({ startsOn: '2026-10-05', endsOn: '2026-10-07', startTime: '00:00', endTime: '00:00' });
    expect(buildPlanningAbsencePeriod(selection)).toEqual({ startsAt: '2026-10-05T00:00', endsAt: '2026-10-08T00:00' });
  });
  it.each([
    { startsOn: '2026-03-28', endsOn: '2026-03-30' },
    { startsOn: '2026-10-24', endsOn: '2026-10-26' },
  ])('keeps hours and civil dates across the daylight-saving boundary $startsOn', ({ startsOn, endsOn }) => {
    expect(buildPlanningAbsencePeriod({ startsOn, endsOn, startTime: '08:15', endTime: '18:20' })).toEqual({ startsAt: `${startsOn}T08:15`, endsAt: `${endsOn}T18:20` });
  });
  it('advances a midnight end by one calendar day across the daylight-saving change', () => {
    expect(buildPlanningAbsencePeriod({ startsOn: '2026-03-28', endsOn: '2026-03-29', startTime: '08:00', endTime: '00:00' })).toEqual({ startsAt: '2026-03-28T08:00', endsAt: '2026-03-30T00:00' });
  });
  it('rejects a nonexistent Paris time and a reversed same-day interval', () => {
    expect(() => buildPlanningAbsencePeriod({ startsOn: '2026-03-29', endsOn: '2026-03-29', startTime: '02:30', endTime: '18:00' })).toThrow('changement d’heure');
    expect(() => buildPlanningAbsencePeriod({ startsOn: '2026-10-05', endsOn: '2026-10-05', startTime: '15:00', endTime: '12:00' })).toThrow('postérieure');
  });
  it('places dates from Monday through Sunday without duplicate adjacent-month dates', () => {
    const weeks = planningAbsenceCalendarWeeks('2026-09-01');
    expect(weeks[0]).toEqual([null, '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06']);
    const dates = weeks.flat().filter((value) => value !== null);
    expect(dates).toHaveLength(30); expect(new Set(dates).size).toBe(30); expect(dates.at(-1)).toBe('2026-09-30');
  });
});
