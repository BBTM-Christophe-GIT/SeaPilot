import { describe, expect, it } from 'vitest';
import {
  canTransitionWorkingTimeRegister,
  workingTimeActionRequiresSignature,
  workingTimeIntervalMinutes,
  workingTimePeriodBounds,
  workingTimeTransitionTarget,
} from './workingTimeModel';

describe('workingTimeModel', () => {
  it('implements the sailor then captain workflow', () => {
    expect(workingTimeTransitionTarget('draft', 'request_sailor_signature'))
      .toBe('awaiting_sailor_signature');
    expect(workingTimeTransitionTarget('awaiting_sailor_signature', 'sailor_sign'))
      .toBe('submitted');
    expect(workingTimeTransitionTarget('submitted', 'captain_validate')).toBe('validated');
    expect(canTransitionWorkingTimeRegister('validated', 'captain_validate')).toBe(false);
  });

  it('reopens signed or validated registers before another signature cycle', () => {
    expect(workingTimeTransitionTarget('awaiting_sailor_signature', 'reopen')).toBe('reopened');
    expect(workingTimeTransitionTarget('submitted', 'reopen')).toBe('reopened');
    expect(workingTimeTransitionTarget('validated', 'reopen')).toBe('reopened');
    expect(workingTimeTransitionTarget('reopened', 'request_sailor_signature'))
      .toBe('awaiting_sailor_signature');
  });

  it('requires an immutable profile signature for both signatures and validations', () => {
    expect(workingTimeActionRequiresSignature('sailor_sign')).toBe(true);
    expect(workingTimeActionRequiresSignature('captain_validate')).toBe(true);
    expect(workingTimeActionRequiresSignature('request_sailor_signature')).toBe(false);
    expect(workingTimeActionRequiresSignature('reopen')).toBe(false);
  });

  it('derives duration from absolute timestamps, including an overnight interval', () => {
    expect(workingTimeIntervalMinutes({
      startsAt: '2026-08-03T22:00:00+02:00',
      endsAt: '2026-08-04T06:30:00+02:00',
    })).toBe(510);
  });

  it('rejects invalid or reversed timestamps', () => {
    expect(() => workingTimeIntervalMinutes({ startsAt: 'bad', endsAt: 'also-bad' }))
      .toThrow('Intervalle de travail invalide.');
    expect(() => workingTimeIntervalMinutes({
      startsAt: '2026-08-03T10:00:00Z',
      endsAt: '2026-08-03T09:00:00Z',
    })).toThrow('Intervalle de travail invalide.');
  });

  it('builds weekly and calendar-month register bounds', () => {
    expect(workingTimePeriodBounds('weekly', '2026-08-03')).toEqual({
      periodStart: '2026-08-03',
      periodEnd: '2026-08-09',
    });
    expect(workingTimePeriodBounds('monthly', '2028-02-12')).toEqual({
      periodStart: '2028-02-01',
      periodEnd: '2028-02-29',
    });
  });
});
