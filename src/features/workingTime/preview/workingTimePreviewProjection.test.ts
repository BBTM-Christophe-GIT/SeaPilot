import { describe, expect, it } from 'vitest';
import {
  analyzeWorkingTimePreview,
  PREVIEW_DEMO_POLICY,
} from './workingTimePreviewProjection';
import type { PreviewWorkPhase, WorkingTimePreviewInput } from './workingTimePreviewProjection';

const phase = (date: string, start: string, end: string, endDate = date): PreviewWorkPhase => ({
  startsAt: `${date}T${start}:00`,
  endsAt: `${endDate}T${end}:00`,
});

function project(overrides: Partial<WorkingTimePreviewInput> = {}) {
  return analyzeWorkingTimePreview({
    selectedDate: '2026-10-13', history: [], phases: [], coverageComplete: true,
    ...overrides,
  });
}

describe('working time entry preview projection', () => {
  it('keeps raw rolling totals while applying the legacy work threshold to calculation days', () => {
    const history = Array.from({ length: 6 }, (_, index) =>
      phase(`2026-10-${String(7 + index).padStart(2, '0')}`, '09:00', '17:00'));
    const result = project({
      history,
      phases: [phase('2026-10-13', '06:00', '12:00'), phase('2026-10-13', '13:00', '20:00')],
    });

    expect(result.window24.startsAt).toBe('2026-10-12T20:00:00');
    expect(result.window24.endsAt).toBe('2026-10-13T20:00:00');
    expect(result.window7.startsAt).toBe('2026-10-06T20:00:00');
    expect(result.window24.workHours).toBe(13);
    expect(result.window24.restHours).toBe(11);
    expect(result.window24.longestRestHours).toBe(10);
    expect(result.window24.restPeriodCount).toBe(2);
    expect(result.window7.workHours).toBe(61);
    expect(result.window7.restHours).toBe(107);
    expect(result.dailyAmplitudeHours).toBe(14);
    expect(result.rules.find((rule) => rule.key === 'max_work_24h')).toMatchObject({
      status: 'deviation', actual: 13, limit: 12, deviation: 1,
    });
    expect(result.rules.filter((rule) => rule.status === 'deviation')).toHaveLength(1);
    expect(result.excessWorkSegments).toMatchObject([
      { startsAt: '2026-10-13T19:00:00', endsAt: '2026-10-13T20:00:00', hours: 1 },
    ]);
  });

  it('starts another calculation day after six hours off without waiving rolling rest', () => {
    const result = project({
      phases: [phase('2026-10-13', '00:00', '08:00'), phase('2026-10-13', '14:00', '22:00')],
    });

    expect(result.window24.workHours).toBe(16);
    expect(result.window24.restHours).toBe(8);
    expect(result.window24.longestRestHours).toBe(6);
    expect(result.dailyAmplitudeHours).toBe(8);
    expect(result.rules.find((rule) => rule.key === 'min_continuous_rest')?.status).toBe('ok');
    expect(result.rules.find((rule) => rule.key === 'min_rest_24h')).toMatchObject({
      status: 'deviation', deviation: 2,
    });
    expect(result.rules.find((rule) => rule.key === 'max_work_24h')).toMatchObject({
      actual: 8, status: 'unknown', deviation: 0,
    });
    expect(result.calculationDays.map((day) => day.workHours)).toEqual([8, 8]);
    expect(result.latestCalculationDay).toMatchObject({ startsAt: '2026-10-13T08:00:00', workHours: 8, restHours: 6 });
    expect(result.excessWorkSegments).toEqual([]);
  });

  it('retains identical rolling bounds and rule results when entered phases are saved', () => {
    const morning = phase('2026-10-13', '06:00', '12:00');
    const afternoon = phase('2026-10-13', '13:00', '20:00');
    const beforeSave = project({ history: [morning], phases: [afternoon] });
    const afterSave = project({ history: [afternoon, morning], phases: [] });

    expect(afterSave.window24).toEqual(beforeSave.window24);
    expect(afterSave.window7).toEqual(beforeSave.window7);
    expect(afterSave.rules).toEqual(beforeSave.rules);
    expect(afterSave.excessWorkSegments).toEqual(beforeSave.excessWorkSegments);
    expect(afterSave.window24.endsAt).toBe('2026-10-13T20:00:00');
    expect(afterSave.window24.restPeriodCount).toBe(2);
  });

  it('confirms only windows entirely within the explicit history coverage', () => {
    const coverage = { startsAt: '2026-10-06T00:00', endsAt: '2026-10-14T00:00' };
    const earlierDay = project({
      selectedDate: '2026-10-07', coverage,
      history: [phase('2026-10-07', '09:00', '17:00')],
    });
    const coveredDay = project({
      coverage,
      history: [phase('2026-10-13', '06:00', '12:00')],
      phases: [phase('2026-10-13', '13:00', '20:00')],
    });

    expect(earlierDay.window7.startsAt).toBe('2026-09-30T17:00:00');
    expect(earlierDay.coverageComplete).toBe(false);
    expect(earlierDay.rules.find((rule) => rule.key === 'min_rest_7d')?.status).toBe('unknown');
    expect(coveredDay.coverageComplete).toBe(true);
    expect(coveredDay.rules.find((rule) => rule.key === 'min_rest_7d')?.status).toBe('ok');
  });

  it('requires the entire projected window, including an overnight end, to be covered', () => {
    const result = project({
      coverage: { startsAt: '2026-10-06T00:00', endsAt: '2026-10-14T00:00' },
      phases: [phase('2026-10-13', '22:00', '06:00', '2026-10-14')],
    });
    expect(result.window24.endsAt).toBe('2026-10-14T06:00:00');
    expect(result.coverageComplete).toBe(false);
    expect(result.rules.find((rule) => rule.key === 'min_rest_24h')?.status).toBe('unknown');
  });

  it('merges overlapping and touching phases instead of double-counting work', () => {
    const result = project({
      history: [phase('2026-10-13', '08:00', '12:00')],
      phases: [phase('2026-10-13', '10:00', '14:00'), phase('2026-10-13', '14:00', '16:00')],
    });

    expect(result.window24.workHours).toBe(8);
    expect(result.window24.workSegments).toHaveLength(1);
    expect(result.dailyWorkHours).toBe(8);
    expect(result.excessWorkSegments).toEqual([]);
  });

  it('counts overnight work in the rolling window and clips the calendar-day total', () => {
    const result = project({ phases: [phase('2026-10-13', '22:00', '06:00', '2026-10-14')] });

    expect(result.window24.startsAt).toBe('2026-10-13T06:00:00');
    expect(result.window24.endsAt).toBe('2026-10-14T06:00:00');
    expect(result.window24.workHours).toBe(8);
    expect(result.dailyAmplitudeHours).toBe(8);
    expect(result.dailyWorkHours).toBe(2);
    expect(result.window24.restHours).toBe(16);
  });

  it('clips a previous night to the rolling boundary and does not count it twice', () => {
    const result = project({
      history: [phase('2026-10-12', '18:00', '02:00', '2026-10-13')],
      phases: [phase('2026-10-13', '01:00', '04:00'), phase('2026-10-13', '14:00', '20:00')],
    });

    // 20:00–04:00 is a single eight-hour block, plus 14:00–20:00.
    expect(result.window24.workHours).toBe(14);
    expect(result.dailyWorkHours).toBe(10);
    expect(result.window24.workSegments).toHaveLength(2);
    expect(result.maximumCalculationDay?.workHours).toBe(10);
    expect(result.excessWorkSegments).toEqual([]);
  });

  it('checks weekly work and weekly rest separately with independent limits', () => {
    const result = project({
      history: Array.from({ length: 6 }, (_, index) =>
        phase(`2026-10-${String(7 + index).padStart(2, '0')}`, '06:00', '21:00')),
      phases: [phase('2026-10-13', '06:00', '21:00')],
    });

    expect(result.window7.workHours).toBe(105);
    expect(result.window7.restHours).toBe(63);
    expect(result.rules.find((rule) => rule.key === 'max_work_7d')).toMatchObject({
      actual: 105, limit: 84, deviation: 21, status: 'deviation',
    });
    expect(result.rules.find((rule) => rule.key === 'min_rest_7d')).toMatchObject({
      actual: 63, limit: 77, deviation: 14, status: 'deviation',
    });
  });

  it('distinguishes work phases from the three rest gaps inside the selected window', () => {
    const result = project({
      history: [phase('2026-10-12', '22:00', '23:00')],
      phases: [phase('2026-10-13', '06:00', '12:00'), phase('2026-10-13', '13:00', '20:00')],
    });

    expect(result.window24.restSegments).toMatchObject([
      { startsAt: '2026-10-12T20:00:00', endsAt: '2026-10-12T22:00:00', hours: 2 },
      { startsAt: '2026-10-12T23:00:00', endsAt: '2026-10-13T06:00:00', hours: 7 },
      { startsAt: '2026-10-13T12:00:00', endsAt: '2026-10-13T13:00:00', hours: 1 },
    ]);
    expect(result.rules.find((rule) => rule.key === 'max_rest_periods')).toMatchObject({
      actual: 3, limit: 2, unit: 'periods', status: 'deviation',
    });
  });

  it('uses elapsed continuous work for the interval between rests, independently of amplitude', () => {
    const result = project({ phases: [phase('2026-10-13', '04:00', '20:00')] });
    expect(result.window24.maxIntervalBetweenRestsHours).toBe(16);
    expect(result.rules.find((rule) => rule.key === 'max_interval_between_rests')).toMatchObject({
      actual: 16, limit: 14, deviation: 2, status: 'deviation',
    });

    const split = project({
      phases: [phase('2026-10-13', '04:00', '06:00'), phase('2026-10-13', '18:00', '20:00')],
    });
    expect(split.dailyAmplitudeHours).toBe(2);
    expect(split.window24.maxIntervalBetweenRestsHours).toBe(2);
    expect(split.rules.find((rule) => rule.key === 'max_amplitude')?.status).toBe('ok');
    expect(split.rules.find((rule) => rule.key === 'max_interval_between_rests')?.status).toBe('ok');
  });

  it('starts a new amplitude after exactly six hours of rest without resetting rolling totals', () => {
    const result = project({
      selectedDate: '2026-10-14',
      phases: [phase('2026-10-14', '04:00', '08:00'), phase('2026-10-14', '12:00', '16:00'),
        phase('2026-10-14', '22:00', '00:00', '2026-10-15')],
    });
    expect(result.window24.workHours).toBe(10);
    expect(result.window24.restHours).toBe(14);
    expect(result.dailyAmplitudeHours).toBe(12);
    expect(result.maximumAmplitudeSequence).toMatchObject({
      startsAt: '2026-10-14T04:00:00', endsAt: '2026-10-14T16:00:00', hours: 12,
    });
    expect(result.amplitudeSequences).toMatchObject([
      { startsAt: '2026-10-14T04:00:00', endsAt: '2026-10-14T16:00:00', hours: 12 },
      { startsAt: '2026-10-14T22:00:00', endsAt: '2026-10-15T00:00:00', hours: 2 },
    ]);
    expect(result.rules.find((rule) => rule.key === 'max_amplitude')).toMatchObject({
      actual: 12, status: 'ok', window: '24h',
    });
  });

  it('closes a calculation day at the beginning of long rest and starts the next at the same instant', () => {
    const result = project({
      selectedDate: '2026-10-14',
      history: [phase('2026-10-13', '06:00', '12:00'), phase('2026-10-13', '13:00', '18:30')],
      phases: [phase('2026-10-14', '02:00', '07:00'), phase('2026-10-14', '08:00', '12:00'),
        phase('2026-10-14', '18:00', '22:00')],
    });

    expect(result.calculationDays).toMatchObject([
      { startsAt: '2026-10-13T18:30:00', endsAt: '2026-10-14T12:00:00',
        hours: 17.5, workHours: 9, restHours: 8.5, status: 'closed', remainingHours: 0,
        workSequence: { startsAt: '2026-10-14T02:00:00', endsAt: '2026-10-14T12:00:00', hours: 10 },
        historyCovered: true },
      { startsAt: '2026-10-14T12:00:00', endsAt: '2026-10-14T22:00:00',
        hours: 10, workHours: 4, restHours: 6, status: 'open', remainingHours: 14,
        precedingRest: { startsAt: '2026-10-14T12:00:00', endsAt: '2026-10-14T18:00:00', hours: 6 },
        horizonEndsAt: '2026-10-15T12:00:00', historyCovered: true },
    ]);
    expect(result.latestCalculationDay).toEqual(result.calculationDays[1]);
    expect(result.maximumCalculationDay).toEqual(result.calculationDays[0]);
    expect(result.window24).toMatchObject({
      startsAt: '2026-10-13T22:00:00', endsAt: '2026-10-14T22:00:00',
      workHours: 13, restHours: 11, longestRestHours: 6,
    });
    expect(result.rules.find((rule) => rule.key === 'max_work_24h')).toMatchObject({
      label: 'Travail maximal par journée de calcul', actual: 9, limit: 12, status: 'ok', deviation: 0,
    });
    expect(result.excessWorkSegments).toEqual([]);
    // Fractioning is a separate policy rule and is not waived by the reset.
    expect(result.rules.find((rule) => rule.key === 'max_rest_periods')).toMatchObject({ actual: 3, status: 'deviation' });
    expect(Object.keys(result.policy)).toHaveLength(8);
    expect(result.policy.maxWork24Hours).toBe(12);
  });

  it('opens a zero-work day after exactly six attested hours without waiting for resumed work', () => {
    const input = {
      selectedDate: '2026-10-14',
      history: [phase('2026-10-13', '12:00', '15:00'), phase('2026-10-13', '22:00', '18:00', '2026-10-14')],
    };
    const result = project(input);
    expect(result.calculationDays).toMatchObject([
      { startsAt: '2026-10-13T15:00:00', endsAt: '2026-10-14T18:00:00', workHours: 20, status: 'closed' },
      { startsAt: '2026-10-14T18:00:00', endsAt: '2026-10-15T00:00:00', workHours: 0, restHours: 6,
        workSequence: null, status: 'open', historyCovered: true, remainingHours: 18 },
    ]);
    expect(result.latestCalculationDay?.horizonEndsAt).toBe('2026-10-15T18:00:00');
    expect(result.rules.find((rule) => rule.key === 'max_work_24h')).toMatchObject({ actual: 20, deviation: 8, status: 'deviation' });
    const sevenHours = project({ ...input, policy: { minContinuousRestHours: 7 } });
    expect(sevenHours.calculationDays).toHaveLength(1);
    expect(sevenHours.latestCalculationDay).toMatchObject({ workHours: 20, restHours: 13, status: 'open' });
  });

  it('keeps the rest-only day when its preceding work lies before the rolling window', () => {
    const result = project({ selectedDate: '2026-10-14', history: [phase('2026-10-13', '06:00', '18:00')] });
    expect(result.amplitudeSequences).toEqual([]);
    expect(result.calculationDays).toHaveLength(1);
    expect(result.latestCalculationDay).toMatchObject({ startsAt: '2026-10-13T18:00:00',
      endsAt: '2026-10-15T00:00:00', workHours: 0, restHours: 30, workSequence: null, status: 'open' });
  });

  it('does not start a rest-only day from a gap outside attested coverage', () => {
    const result = project({ selectedDate: '2026-10-14', history: [phase('2026-10-13', '06:00', '18:00')],
      coverage: { startsAt: '2026-10-06T00:00', endsAt: '2026-10-14T00:00' } });
    expect(result.calculationDays).toEqual([]);
    expect(result.latestCalculationDay).toBeNull();
    expect(result.rules.find((rule) => rule.key === 'max_work_24h')?.status).toBe('unknown');
  });

  it('keeps five and a half hours of rest inside the same calculation day', () => {
    const result = project({
      selectedDate: '2026-10-14', history: [phase('2026-10-13', '13:00', '18:30')],
      phases: [phase('2026-10-14', '02:00', '07:00'), phase('2026-10-14', '08:00', '12:00'),
        phase('2026-10-14', '17:30', '22:00')],
    });

    expect(result.calculationDays).toHaveLength(1);
    expect(result.latestCalculationDay).toMatchObject({ startsAt: '2026-10-13T18:30:00', workHours: 13.5, status: 'open' });
    expect(result.rules.find((rule) => rule.key === 'max_work_24h')).toMatchObject({ actual: 13.5, deviation: 1.5, status: 'deviation' });
    expect(result.excessWorkSegments).toMatchObject([{ startsAt: '2026-10-14T20:30:00', endsAt: '2026-10-14T22:00:00', hours: 1.5 }]);
  });

  it('uses the configured rest minimum to join or separate calculation days without changing rolling totals', () => {
    const input = {
      selectedDate: '2026-10-14', history: [phase('2026-10-13', '13:00', '18:30')],
      phases: [phase('2026-10-14', '02:00', '07:00'), phase('2026-10-14', '08:00', '12:00'),
        phase('2026-10-14', '18:00', '22:00')],
    };
    const sixHours = project(input);
    const sevenHours = project({ ...input, policy: { minContinuousRestHours: 7 } });

    expect(sixHours.calculationDays).toHaveLength(2);
    expect(sevenHours.calculationDays).toHaveLength(1);
    expect(sevenHours.latestCalculationDay).toMatchObject({ startsAt: '2026-10-13T18:30:00', workHours: 13, restHours: 14.5 });
    expect(sevenHours.rules.find((rule) => rule.key === 'max_work_24h')).toMatchObject({ actual: 13, status: 'deviation', deviation: 1 });
    expect(sevenHours.window24).toEqual(sixHours.window24);
    expect(sevenHours.window7).toEqual(sixHours.window7);
  });

  it('retains a breached closed calculation day after work starts in a new day', () => {
    const result = project({
      selectedDate: '2026-10-14', history: [phase('2026-10-13', '12:00', '18:00')],
      phases: [phase('2026-10-14', '00:00', '13:00'), phase('2026-10-14', '19:00', '21:00')],
    });

    expect(result.calculationDays).toMatchObject([
      { startsAt: '2026-10-13T18:00:00', endsAt: '2026-10-14T13:00:00', workHours: 13, status: 'closed' },
      { startsAt: '2026-10-14T13:00:00', endsAt: '2026-10-14T21:00:00', workHours: 2, status: 'open' },
    ]);
    expect(result.latestCalculationDay?.workHours).toBe(2);
    expect(result.maximumCalculationDay?.workHours).toBe(13);
    expect(result.rules.find((rule) => rule.key === 'max_work_24h')).toMatchObject({ actual: 13, deviation: 1, status: 'deviation' });
    expect(result.excessWorkSegments).toMatchObject([{ startsAt: '2026-10-14T12:00:00', endsAt: '2026-10-14T13:00:00', hours: 1 }]);
    expect(result.rules.find((rule) => rule.key === 'min_rest_24h')).toMatchObject({ actual: 9, deviation: 1, status: 'deviation' });
  });

  it('does not truncate calculation-day work at midnight or the rolling boundary', () => {
    const result = project({
      history: [phase('2026-10-12', '06:00', '12:00'), phase('2026-10-12', '18:00', '06:00', '2026-10-13')],
      phases: [phase('2026-10-13', '10:00', '22:00')],
    });

    expect(result.window24.workHours).toBe(20);
    expect(result.latestCalculationDay).toMatchObject({ startsAt: '2026-10-12T12:00:00', endsAt: '2026-10-13T22:00:00',
      workHours: 24, restHours: 10, status: 'open' });
    expect(result.rules.find((rule) => rule.key === 'max_work_24h')).toMatchObject({ actual: 24, deviation: 12 });
    expect(result.excessWorkSegments).toMatchObject([{ startsAt: '2026-10-13T10:00:00', endsAt: '2026-10-13T22:00:00', hours: 12 }]);
  });

  it('retains and chronologically unions each calculation day’s excess', () => {
    const result = project({
      history: [phase('2026-10-12', '06:00', '12:00'), phase('2026-10-12', '18:00', '07:00', '2026-10-13')],
      phases: [phase('2026-10-13', '13:00', '02:00', '2026-10-14')],
    });

    expect(result.calculationDays.map((day) => day.workHours)).toEqual([13, 13]);
    expect(result.excessWorkSegments).toMatchObject([
      { startsAt: '2026-10-13T06:00:00', endsAt: '2026-10-13T07:00:00', hours: 1 },
      { startsAt: '2026-10-14T01:00:00', endsAt: '2026-10-14T02:00:00', hours: 1 },
    ]);
  });

  it('does not attest a candidate day or a closing rest outside history coverage', () => {
    const noPreviousWork = project({ phases: [phase('2026-10-13', '08:00', '12:00')] });
    expect(noPreviousWork.latestCalculationDay).toMatchObject({ startsAt: '2026-10-13T08:00:00',
      precedingRest: null, historyCovered: false, status: 'open' });
    expect(noPreviousWork.rules.find((rule) => rule.key === 'max_work_24h')?.status).toBe('unknown');

    const closingRestNotCovered = project({
      selectedDate: '2026-10-14',
      coverage: { startsAt: '2026-10-13T18:30', endsAt: '2026-10-14T12:00' },
      history: [phase('2026-10-13', '13:00', '18:30')],
      phases: [phase('2026-10-14', '02:00', '07:00'), phase('2026-10-14', '08:00', '12:00'),
        phase('2026-10-14', '18:00', '22:00')],
    });
    expect(closingRestNotCovered.calculationDays[0]).toMatchObject({ status: 'closed', historyCovered: false });
    expect(closingRestNotCovered.rules.find((rule) => rule.key === 'max_work_24h')?.status).toBe('unknown');

    const knownBreach = project({ coverageComplete: false, phases: [phase('2026-10-13', '02:00', '15:00')] });
    expect(knownBreach.latestCalculationDay?.historyCovered).toBe(false);
    expect(knownBreach.rules.find((rule) => rule.key === 'max_work_24h')).toMatchObject({ status: 'deviation', actual: 13 });
  });

  it('keeps shorter rests in a sequence and uses the configurable rest threshold', () => {
    const phases = [phase('2026-10-13', '04:00', '08:00'), phase('2026-10-13', '12:00', '16:00'),
      phase('2026-10-13', '22:00', '00:00', '2026-10-14')];
    const longerThreshold = project({ phases, policy: { minContinuousRestHours: 7 } });
    expect(longerThreshold.dailyAmplitudeHours).toBe(20);
    expect(longerThreshold.window24.workHours).toBe(10);
    expect(longerThreshold.rules.find((rule) => rule.key === 'max_amplitude')?.status).toBe('deviation');
    const shortRest = project({ phases: [phases[0], phases[1], phase('2026-10-13', '21:59', '00:00', '2026-10-14')] });
    expect(shortRest.dailyAmplitudeHours).toBe(20);
    expect(shortRest.amplitudeSequences).toHaveLength(1);
  });

  it('does not reset at midnight or truncate a continuing sequence at the rolling boundary', () => {
    const result = project({
      history: [phase('2026-10-12', '18:00', '06:00', '2026-10-13')],
      phases: [phase('2026-10-13', '10:00', '22:00')],
    });
    expect(result.window24.startsAt).toBe('2026-10-12T22:00:00');
    expect(result.dailyAmplitudeHours).toBe(28);
    expect(result.maximumAmplitudeSequence?.startsAt).toBe('2026-10-12T18:00:00');
    expect(result.rules.find((rule) => rule.key === 'max_amplitude')).toMatchObject({
      actual: 28, status: 'deviation', deviation: 14,
    });
  });

  it('separates sequences by a qualifying rest across midnight', () => {
    const result = project({
      history: [phase('2026-10-12', '18:00', '22:00')],
      phases: [phase('2026-10-13', '04:00', '08:00')],
    });
    expect(result.amplitudeSequences).toHaveLength(2);
    expect(result.dailyAmplitudeHours).toBe(4);
    expect(result.window24.workHours).toBe(8);
  });

  it('unions overlaps before measuring rest and excludes work outside the analysis window', () => {
    const result = project({
      history: [phase('2026-10-10', '00:00', '20:00'), phase('2026-10-13', '04:00', '12:00'),
        phase('2026-10-13', '10:00', '16:00'), phase('2026-10-14', '03:00', '15:00')],
      phases: [phase('2026-10-13', '18:00', '20:00')],
    });
    expect(result.dailyAmplitudeHours).toBe(16);
    expect(result.amplitudeSequences).toHaveLength(1);
    expect(result.maximumAmplitudeSequence?.endsAt).toBe('2026-10-13T20:00:00');
    expect(result.window24.workHours).toBe(14);
  });

  it('does not certify an amplitude reset from unattested gaps in incomplete history', () => {
    const result = project({
      coverageComplete: false,
      phases: [phase('2026-10-13', '04:00', '08:00'), phase('2026-10-13', '14:00', '16:00')],
    });
    expect(result.dailyAmplitudeHours).toBe(4);
    expect(result.rules.find((rule) => rule.key === 'max_amplitude')?.status).toBe('unknown');
  });

  it('ends a continuing amplitude at the displayed analysis end without counting future work', () => {
    const result = project({
      history: [phase('2026-10-13', '04:00', '20:00')],
      phases: [phase('2026-10-13', '06:00', '08:00')],
    });
    expect(result.window24.endsAt).toBe('2026-10-13T08:00:00');
    expect(result.maximumAmplitudeSequence).toMatchObject({
      startsAt: '2026-10-13T04:00:00', endsAt: '2026-10-13T08:00:00', hours: 4,
    });
    expect(result.latestCalculationDay).toMatchObject({
      startsAt: '2026-10-13T04:00:00', endsAt: '2026-10-13T08:00:00', workHours: 4, status: 'open',
    });
  });

  it('adds an informational period since the last long rest without resetting rolling totals', () => {
    const result = project({
      selectedDate: '2026-10-14',
      history: [phase('2026-10-13', '06:00', '12:00'), phase('2026-10-13', '13:00', '18:30')],
      phases: [phase('2026-10-14', '02:00', '07:00'), phase('2026-10-14', '08:00', '12:00')],
    });

    expect(result.operationalPeriod).toMatchObject({
      observedWindow: {
        startsAt: '2026-10-13T18:30:00', endsAt: '2026-10-14T12:00:00',
        hours: 17.5, workHours: 9, restHours: 8.5,
      },
      precedingRest: { startsAt: '2026-10-13T18:30:00', endsAt: '2026-10-14T02:00:00', hours: 7.5 },
      amplitude: { startsAt: '2026-10-14T02:00:00', endsAt: '2026-10-14T12:00:00', hours: 10 },
      horizonEndsAt: '2026-10-14T18:30:00', remainingHours: 6.5, historyCovered: true,
    });
    expect(result.operationalPeriod?.observedWindow.restSegments).toHaveLength(2);
    expect(result.operationalPeriod).not.toHaveProperty('status');
    expect(result.operationalPeriod).not.toHaveProperty('rules');
    expect(result.window24).toMatchObject({
      startsAt: '2026-10-13T12:00:00', endsAt: '2026-10-14T12:00:00',
      workHours: 14.5, restHours: 9.5,
    });
    expect(result.rules.find((rule) => rule.key === 'max_work_24h')).toMatchObject({
      actual: 11.5, deviation: 0, status: 'unknown',
    });
    expect(result.rules.find((rule) => rule.key === 'min_rest_24h')).toMatchObject({
      actual: 9.5, deviation: 0.5, status: 'deviation',
    });
  });

  it('does not start a new operational period after a rest shorter than the threshold', () => {
    const result = project({
      selectedDate: '2026-10-14',
      history: [phase('2026-10-12', '06:00', '12:00'),
        phase('2026-10-13', '06:00', '12:00'), phase('2026-10-13', '13:00', '20:01')],
      phases: [phase('2026-10-14', '02:00', '07:00'), phase('2026-10-14', '08:00', '12:00')],
    });

    expect(result.operationalPeriod).toMatchObject({
      observedWindow: { startsAt: '2026-10-12T12:00:00', hours: 48 },
      precedingRest: { startsAt: '2026-10-12T12:00:00', endsAt: '2026-10-13T06:00:00', hours: 18 },
      amplitude: { startsAt: '2026-10-13T06:00:00', endsAt: '2026-10-14T12:00:00', hours: 30 },
      horizonEndsAt: '2026-10-13T12:00:00', remainingHours: 0,
    });
  });

  it('uses the configured long-rest threshold for the period while preserving the rolling metrics', () => {
    const input = {
      selectedDate: '2026-10-14',
      history: [phase('2026-10-12', '06:00', '12:00'),
        phase('2026-10-13', '06:00', '12:00'), phase('2026-10-13', '13:00', '18:30')],
      phases: [phase('2026-10-14', '02:00', '07:00'), phase('2026-10-14', '08:00', '12:00')],
    };
    const sixHours = project(input);
    const eightHours = project({ ...input, policy: { minContinuousRestHours: 8 } });

    expect(sixHours.operationalPeriod?.observedWindow.startsAt).toBe('2026-10-13T18:30:00');
    expect(eightHours.operationalPeriod?.observedWindow.startsAt).toBe('2026-10-12T12:00:00');
    expect(eightHours.operationalPeriod?.amplitude.hours).toBe(30);
    expect(eightHours.window24).toEqual(sixHours.window24);
    expect(eightHours.window7).toEqual(sixHours.window7);
  });

  it('keeps an entered overnight phase in its operational period with an exact qualifying rest', () => {
    const result = project({
      history: [phase('2026-10-13', '08:00', '16:00')],
      phases: [phase('2026-10-13', '22:00', '06:00', '2026-10-14')],
    });

    expect(result.operationalPeriod).toMatchObject({
      observedWindow: {
        startsAt: '2026-10-13T16:00:00', endsAt: '2026-10-14T06:00:00',
        hours: 14, workHours: 8, restHours: 6,
      },
      precedingRest: { hours: 6 },
      amplitude: { startsAt: '2026-10-13T22:00:00', endsAt: '2026-10-14T06:00:00', hours: 8 },
      horizonEndsAt: '2026-10-14T16:00:00', remainingHours: 10,
    });
  });

  it('retains the candidate period but does not attest rest in an incomplete local history', () => {
    const input = {
      selectedDate: '2026-10-14', coverageComplete: false,
      history: [phase('2026-10-13', '13:00', '18:30')],
      phases: [phase('2026-10-14', '02:00', '07:00'), phase('2026-10-14', '08:00', '12:00')],
    };
    const unattested = project(input);
    const partialCoverage = project({ ...input,
      coverage: { startsAt: '2026-10-06T00:00', endsAt: '2026-10-14T00:00' },
    });
    const localCoverage = project({ ...input,
      coverage: { startsAt: '2026-10-13T18:30', endsAt: '2026-10-14T12:00' },
    });

    expect(unattested.operationalPeriod).toMatchObject({ historyCovered: false,
      observedWindow: { workHours: 9, restHours: 8.5 } });
    expect(partialCoverage.operationalPeriod?.historyCovered).toBe(false);
    expect(localCoverage.operationalPeriod?.historyCovered).toBe(true);
    expect(localCoverage.coverageComplete).toBe(false);
    expect(localCoverage.rules.find((rule) => rule.key === 'min_rest_7d')?.status).toBe('unknown');
  });

  it('excludes future recorded work and future rest from the operational view', () => {
    const result = project({
      selectedDate: '2026-10-14',
      history: [phase('2026-10-13', '13:00', '18:30'),
        phase('2026-10-14', '02:00', '07:00'), phase('2026-10-14', '08:00', '20:00'),
        phase('2026-10-15', '02:00', '08:00')],
      phases: [phase('2026-10-14', '08:00', '12:00')],
    });

    expect(result.operationalPeriod).toMatchObject({
      observedWindow: { endsAt: '2026-10-14T12:00:00', hours: 17.5,
        workHours: 9, restHours: 8.5, maxIntervalBetweenRestsHours: 5 },
      amplitude: { endsAt: '2026-10-14T12:00:00', hours: 10 },
      remainingHours: 6.5,
    });
    expect(result.operationalPeriod?.observedWindow.workSegments.at(-1)?.endsAt).toBe('2026-10-14T12:00:00');
    expect(result.operationalPeriod?.observedWindow.restSegments.at(-1)?.endsAt).toBe('2026-10-14T08:00:00');
    expect(result.latestCalculationDay).toMatchObject({ endsAt: '2026-10-14T12:00:00', workHours: 9, restHours: 8.5, status: 'open' });
  });

  it('does not invent a preceding rest or a period on a day without observed work', () => {
    const noPreviousWork = project({ phases: [phase('2026-10-13', '06:00', '12:00')] });
    const emptyDay = project({ selectedDate: '2026-10-14',
      history: [phase('2026-10-12', '08:00', '16:00'), phase('2026-10-13', '06:00', '12:00')],
    });
    const futureOnly = project({ selectedDate: '2026-10-14',
      history: [phase('2026-10-13', '08:00', '16:00'), phase('2026-10-15', '06:00', '12:00')],
    });

    expect(noPreviousWork.operationalPeriod).toBeNull();
    expect(emptyDay.operationalPeriod).toBeNull();
    expect(futureOnly.operationalPeriod).toBeNull();
  });

  it('does not claim compliant rest or a compliant week when history is incomplete', () => {
    const result = project({
      coverageComplete: false,
      phases: [phase('2026-10-13', '06:00', '12:00'), phase('2026-10-13', '13:00', '20:00')],
    });

    expect(result.coverageComplete).toBe(false);
    expect(result.rules.find((rule) => rule.key === 'max_work_24h')?.status).toBe('deviation');
    expect(result.rules.find((rule) => rule.key === 'min_rest_24h')?.status).toBe('unknown');
    expect(result.rules.find((rule) => rule.key === 'min_rest_7d')?.status).toBe('unknown');
    expect(result.rules.find((rule) => rule.key === 'max_rest_periods')?.status).toBe('unknown');
  });

  it('still identifies a rest deficit already established by recorded work in an incomplete history', () => {
    const result = project({
      coverageComplete: false,
      phases: [phase('2026-10-13', '00:00', '08:00'), phase('2026-10-13', '14:00', '22:00')],
    });
    expect(result.rules.find((rule) => rule.key === 'min_rest_24h')).toMatchObject({
      actual: 8, status: 'deviation',
    });
  });

  it('keeps malformed phases out of calculations and explicitly marks partial results', () => {
    const result = project({ phases: [
      phase('2026-10-13', '08:00', '12:00'),
      phase('2026-10-13', '14:00', '10:00'),
      { startsAt: 'bad', endsAt: 'invalid' },
    ] });

    expect(result.window24.workHours).toBe(4);
    expect(result.invalidPhases.map(({ index }) => index)).toEqual([1, 2]);
    expect(result.coverageComplete).toBe(false);
    expect(result.rules.every((rule) => rule.status === 'unknown')).toBe(true);
  });

  it('honors exact thresholds and a configured continuous-rest minimum without modifying the demo policy', () => {
    const result = project({
      policy: { minContinuousRestHours: 13 },
      history: [phase('2026-10-12', '08:00', '18:00')],
      phases: [phase('2026-10-13', '08:00', '20:00')],
    });

    expect(result.rules.find((rule) => rule.key === 'max_work_24h')).toMatchObject({ status: 'ok', deviation: 0 });
    expect(result.rules.find((rule) => rule.key === 'min_continuous_rest')).toMatchObject({
      actual: 12, limit: 13, deviation: 1, status: 'deviation',
    });
    expect(PREVIEW_DEMO_POLICY.minContinuousRestHours).toBe(6);
    expect(result.excessWorkSegments).toEqual([]);
  });

  it('does not mutate the supplied phases while sorting and merging them', () => {
    const phases = Object.freeze([
      Object.freeze(phase('2026-10-13', '14:00', '20:00')),
      Object.freeze(phase('2026-10-13', '06:00', '12:00')),
    ]);
    const result = project({ phases });
    expect(result.window24.workHours).toBe(12);
    expect(phases[0].startsAt).toBe('2026-10-13T14:00:00');
  });

  it('rejects impossible dates and invalid policy values', () => {
    expect(() => project({ selectedDate: '2026-02-30' })).toThrow('Date de saisie invalide.');
    expect(() => project({ policy: { maxWork24Hours: Number.NaN } })).toThrow('Règles de démonstration invalides.');
    expect(() => project({ policy: { maxRestPeriods: 2.5 } })).toThrow('Règles de démonstration invalides.');
  });
});
