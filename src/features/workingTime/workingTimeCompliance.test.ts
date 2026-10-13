import { describe, expect, it } from 'vitest';
import type { WorkingTimeCalculationWindow, WorkingTimeInterval } from './workingTimeModel';
import type { WorkingTimePolicyThresholds } from './workingTimeQueries';
import {
  workingTimeNonCompliantDates, workingTimeRollingImpactDetails, workingTimeStatusCalculation,
  workingTimeViolationDetails, workingTimeViolationText, workingTimeViolationWindowText,
} from './workingTimeCompliance';

const policy: WorkingTimePolicyThresholds = {
  id: 1, name: 'Accord navire', maxWork24h: 12, minRest24h: 10,
  maxWork7d: 84, minRest7d: 77, minConsecutiveRestHours: 6,
  maxRestPeriods24h: 2, maxNightWork24h: 10, maxAmplitudeHours: 14, maxIntervalBetweenRestsHours: 14,
};
function interval(startsAt: string, endsAt: string, day: string, overrides: Partial<WorkingTimeInterval> = {}): WorkingTimeInterval {
  return {
    id: 1, registerId: 100, companyId: 1, personId: 20, localWorkDate: day, startsAt, endsAt,
    timezoneName: 'UTC', utcOffsetMinutes: 0, vesselId: 7, watchGroup: 'Bordée 1', comment: null,
    authorUserId: null, authorPersonId: null, sourceType: 'manual', sourceReference: null, sourceRecordKey: null,
    ...overrides,
  };
}
function calculation(overrides: Partial<WorkingTimeCalculationWindow> = {}): WorkingTimeCalculationWindow {
  return {
    id: 401, companyId: 1, personId: 20, windowEnd: '2026-10-14T22:00:00Z', localWindowEndDate: '2026-10-14',
    timezoneName: 'UTC', vesselId: 7, workRestPolicyId: 1, work24hSeconds: 13 * 3600, rest24hSeconds: 11 * 3600,
    longestRest24hSeconds: 6 * 3600, restPeriodCount24h: 2, work7dSeconds: 59 * 3600, rest7dSeconds: 109 * 3600,
    nightWork24hSeconds: 0, isCompliant: false, violationCodes: ['work_24h'], calculationVersion: 1,
    calculatedAt: '2026-10-14T22:00:00Z', ...overrides,
  };
}

describe('persisted working-time violation explanations', () => {
  it('renames the work rule while retaining the exact persisted value and legacy rolling bounds', () => {
    const saved = calculation();
    const details = workingTimeViolationDetails([saved], [interval('2026-10-14T18:00:00Z', '2026-10-14T22:00:00Z', '2026-10-14')], '2026-10-14', [policy]);
    expect(workingTimeViolationText(details[0])).toBe('Travail maximal par journée de calcul : 13 h / maximum 12 h');
    expect(workingTimeViolationWindowText(details[0])).toBe('Fenêtre d’analyse du mar 13 oct. à 22:00 au mer 14 oct. à 22:00.');
  });

  it('shows v4 work-day bounds starting at the beginning of the preceding six-hour rest', () => {
    const saved = calculation({ calculationVersion: 4, work24hSeconds: 9 * 3600 });
    const history = [
      interval('2026-10-13T13:00:00Z', '2026-10-13T18:30:00Z', '2026-10-13'),
      interval('2026-10-14T02:00:00Z', '2026-10-14T07:00:00Z', '2026-10-14'),
      interval('2026-10-14T08:00:00Z', '2026-10-14T12:00:00Z', '2026-10-14'),
      interval('2026-10-14T18:00:00Z', '2026-10-14T22:00:00Z', '2026-10-14'),
    ];
    const [detail] = workingTimeViolationDetails([saved], history, '2026-10-14', [{ ...policy, maxWork24h: 8 }]);
    expect(detail).toMatchObject({ value: 9, windowStartsAt: '2026-10-13T18:30:00.000Z', windowEndsAt: '2026-10-14T12:00:00.000Z' });
    expect(workingTimeViolationWindowText(detail)).toContain('Journée de calcul du mar 13 oct. à 18:30 au mer 14 oct. à 12:00.');
    expect(workingTimeViolationWindowText(detail)).toContain('couverture à confirmer');
  });

  it('does not invent v4 work-day bounds when loaded history does not reconstruct the persisted total', () => {
    const [detail] = workingTimeViolationDetails([calculation({ calculationVersion: 4 })], [
      interval('2026-10-14T18:00:00Z', '2026-10-14T22:00:00Z', '2026-10-14'),
    ], '2026-10-14', [policy]);
    expect(detail.value).toBe(13);
    expect(detail.windowStartsAt).toBeUndefined();
    expect(workingTimeViolationWindowText(detail)).toMatch(/^Fenêtre d’analyse/);
  });

  it('explains amplitude using merged real intervals and the configured long-rest threshold', () => {
    const saved = calculation({ violationCodes: ['amplitude'], work24hSeconds: 11 * 3600 });
    const history = [
      interval('2026-10-13T20:00:00Z', '2026-10-13T22:00:00Z', '2026-10-13'),
      interval('2026-10-14T04:00:00Z', '2026-10-14T08:00:00Z', '2026-10-14'),
      interval('2026-10-14T07:00:00Z', '2026-10-14T08:00:00Z', '2026-10-14'),
      interval('2026-10-14T12:00:00Z', '2026-10-14T19:00:00Z', '2026-10-14'),
      interval('2026-10-14T00:00:00Z', '2026-10-14T22:00:00Z', '2026-10-14', { personId: 30 }),
    ];
    const [detail] = workingTimeViolationDetails([saved], history, '2026-10-14', [policy]);
    expect(workingTimeViolationText(detail)).toBe('Amplitude entre repos : 15 h / maximum 14 h');
    expect(detail).toMatchObject({ windowStartsAt: '2026-10-14T04:00:00.000Z', windowEndsAt: '2026-10-14T19:00:00.000Z' });
    expect(workingTimeViolationWindowText(detail)).toMatch(/^Séquence de travail du mer 14 oct\. à 04:00 au mer 14 oct\. à 19:00\./);
    const [shorterReset] = workingTimeViolationDetails([saved], history, '2026-10-14', [{ ...policy, minConsecutiveRestHours: 4, maxAmplitudeHours: 6 }]);
    expect(shorterReset.value).toBe(7);
    expect(shorterReset.windowStartsAt).toBe('2026-10-14T12:00:00.000Z');
  });

  it('keeps a continuous work block across the rolling boundary for the interval-between-rests value', () => {
    const saved = calculation({ windowEnd: '2026-10-14T14:00:00Z', violationCodes: ['rest_interval'] });
    const [detail] = workingTimeViolationDetails([saved], [
      interval('2026-10-13T12:00:00Z', '2026-10-13T23:00:00Z', '2026-10-13'),
      interval('2026-10-13T22:00:00Z', '2026-10-14T06:00:00Z', '2026-10-13'),
    ], '2026-10-13', [policy]);
    expect(workingTimeViolationText(detail)).toBe('Intervalle entre deux repos : 18 h / maximum 14 h');
    expect(detail.windowStartsAt).toBe('2026-10-13T12:00:00.000Z');
    expect(workingTimeViolationWindowText(detail)).toMatch(/^Travail continu entre repos/);
  });

  it('keeps a server breach when incomplete history would show an apparently valid derived value', () => {
    const saved = calculation({ violationCodes: ['amplitude', 'rest_interval'] });
    const details = workingTimeViolationDetails([saved], [
      interval('2026-10-14T18:00:00Z', '2026-10-14T22:00:00Z', '2026-10-14'),
    ], '2026-10-14', [policy]);
    expect(details).toHaveLength(2);
    details.forEach((detail) => {
      expect(detail.value).toBeNull();
      expect(detail.windowStartsAt).toBeUndefined();
      expect(workingTimeViolationText(detail)).toContain('mesure à confirmer / maximum 14 h');
    });
    expect(workingTimeNonCompliantDates([saved], [interval('2026-10-14T18:00:00Z', '2026-10-14T22:00:00Z', '2026-10-14')])).toEqual(['2026-10-14']);
  });

  it('preserves contribution-day attribution and next-day inherited impact for the new codes', () => {
    const saved = calculation({ windowEnd: '2026-10-15T02:00:00Z', localWindowEndDate: '2026-10-15', violationCodes: ['amplitude', 'rest_interval'] });
    const history = [interval('2026-10-14T04:00:00Z', '2026-10-14T22:00:00Z', '2026-10-14')];
    expect(workingTimeNonCompliantDates([saved], history)).toEqual(['2026-10-14']);
    expect(workingTimeViolationDetails([saved], history, '2026-10-15', [policy])).toEqual([]);
    expect(workingTimeRollingImpactDetails([saved], history, '2026-10-15', [policy]).map((detail) => detail.code)).toEqual(['amplitude', 'rest_interval']);
    expect(workingTimeStatusCalculation([saved], history, '2026-10-14')).toBe(saved);
  });
});
