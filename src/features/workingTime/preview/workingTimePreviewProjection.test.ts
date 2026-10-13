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
  it('shows actual rolling work, explicit bounds and the chronological excess rail', () => {
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

  it('does not reset work or waive the total rest requirement after six hours off', () => {
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
      status: 'deviation', deviation: 4,
    });
    expect(result.excessWorkSegments[0].startsAt).toBe('2026-10-13T18:00:00');
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
    expect(result.excessWorkSegments).toMatchObject([
      { startsAt: '2026-10-13T18:00:00', endsAt: '2026-10-13T20:00:00', hours: 2 },
    ]);
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
