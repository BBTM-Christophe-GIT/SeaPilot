import { describe, expect, it } from 'vitest';
import type { WorkingTimeCalculationWindow, WorkingTimeInterval } from './workingTimeModel';
import type { WorkingTimePolicyThresholds } from './workingTimeQueries';
import {
  workingTimeNonCompliantDates,
  workingTimeRollingImpactDetails,
  workingTimeStatusCalculation,
  workingTimeViolationDetails,
  workingTimeViolationText,
  workingTimeViolationWindowText,
} from './workingTimeCompliance';

const interval: WorkingTimeInterval = {
  id: 1, registerId: 1, companyId: 1, personId: 20, localWorkDate: '2026-10-14',
  startsAt: '2026-10-14T06:00:00Z', endsAt: '2026-10-14T20:00:00Z',
  timezoneName: 'Europe/Paris', utcOffsetMinutes: 120, vesselId: null, watchGroup: null,
  comment: null, authorUserId: null, authorPersonId: null, sourceType: 'manual',
  sourceReference: null, sourceRecordKey: null,
};
const policy: WorkingTimePolicyThresholds = {
  id: 1, name: 'Seuils du serveur', maxWork24h: 12, minRest24h: 10, maxWork7d: 84,
  minRest7d: 52, minConsecutiveRestHours: 6, maxRestPeriods24h: 6, maxNightWork24h: 10,
  maxAmplitudeHours: 13.25, maxIntervalBetweenRestsHours: 12.5,
};
function calculation(codes: string[]): WorkingTimeCalculationWindow {
  return {
    id: 1, companyId: 1, personId: 20, windowEnd: '2026-10-15T04:00:00Z',
    localWindowEndDate: '2026-10-15', timezoneName: 'Europe/Paris', vesselId: null,
    workRestPolicyId: 1, work24hSeconds: 28800, rest24hSeconds: 57600,
    longestRest24hSeconds: 43200, restPeriodCount24h: 2, work7dSeconds: 28800,
    rest7dSeconds: 576000, nightWork24hSeconds: 0, isCompliant: false,
    violationCodes: codes, calculationVersion: 4, calculatedAt: '2026-10-15T04:00:01Z',
  };
}

describe('server working-time compliance alerts', () => {
  it.each([
    ['amplitude', 'Amplitude de travail', 13.25, '13,25 h'],
    ['rest_interval', 'Intervalle entre deux repos', 12.5, '12,5 h'],
  ] as const)('keeps %s visible with its real threshold and without inventing a measured duration', (code, label, threshold, formatted) => {
    const server = calculation([code]);
    expect(workingTimeStatusCalculation([server], [interval], '2026-10-14')).toBe(server);
    expect(workingTimeNonCompliantDates([server], [interval])).toEqual(['2026-10-14']);
    const [detail] = workingTimeViolationDetails([server], [interval], '2026-10-14', [policy]);
    expect(detail).toMatchObject({ code, label, threshold, value: null, alarmDay: '2026-10-14' });
    const text = workingTimeViolationText(detail);
    expect(text).toContain(`maximum ${formatted}`);
    expect(text).toContain('alerte signalée');
    expect(text).not.toMatch(/8 h|0 h|null|NaN/);
    expect(workingTimeViolationWindowText(detail)).toContain('Fenêtre d’analyse');
    expect(workingTimeRollingImpactDetails([server], [interval], '2026-10-15', [policy])).toEqual([detail]);
  });

  it('does not substitute a default threshold when an older policy projection lacks it', () => {
    const oldPolicy = { ...policy };
    delete oldPolicy.maxAmplitudeHours;
    delete oldPolicy.maxIntervalBetweenRestsHours;
    const details = workingTimeViolationDetails([calculation(['amplitude', 'rest_interval'])], [interval], '2026-10-14', [oldPolicy]);
    expect(details).toHaveLength(2);
    for (const detail of details) {
      expect(detail.threshold).toBeNull();
      expect(detail.value).toBeNull();
      expect(workingTimeViolationText(detail)).toContain('alerte signalée');
      expect(workingTimeViolationText(detail)).not.toMatch(/14 h|0 h|null|NaN/);
    }
  });

  it.each(['future_server_rule', '__proto__', 'constructor'])('preserves unknown %s without crashing or inventing its window', (code) => {
    const server = calculation([code]);
    expect(workingTimeStatusCalculation([server], [], '2026-10-15')).toBe(server);
    expect(workingTimeNonCompliantDates([server], [])).toEqual(['2026-10-15']);
    const [detail] = workingTimeViolationDetails([server], [], '2026-10-15', [policy]);
    expect(detail).toMatchObject({ code, label: 'Alerte de conformité', value: null, threshold: null });
    expect(workingTimeViolationText(detail)).toContain('alerte signalée');
    expect(workingTimeViolationWindowText(detail)).toBe('Période d’analyse non précisée par le calcul serveur.');
    expect(workingTimeRollingImpactDetails([server], [], '2026-10-15', [policy])).toEqual([]);
    expect(server.isCompliant).toBe(false);
    expect(server.violationCodes).toEqual([code]);
  });

  it('retains measured legacy alerts alongside new server-only alerts', () => {
    const server = { ...calculation(['work_24h', 'amplitude']), work24hSeconds: 46800 };
    const details = workingTimeViolationDetails([server], [interval], '2026-10-14', [policy]);
    expect(details).toHaveLength(2);
    expect(details[0]).toMatchObject({ code: 'work_24h', value: 13, threshold: 12 });
    expect(workingTimeViolationText(details[0])).toContain('13 h / maximum 12 h');
    expect(details[1]).toMatchObject({ code: 'amplitude', value: null, threshold: 13.25 });
  });
});
