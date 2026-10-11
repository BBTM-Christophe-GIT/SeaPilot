import { describe, expect, it } from 'vitest';
import {
  workingTimeApprovalTodayDate,
  workingTimeCaptainApprovalDateAllowed,
  workingTimeCaptainApprovalStartDate,
} from './workingTimeApprovalWindow';

describe('captain working-time approval window', () => {
  it('uses the Paris date at midnight and across the summer time change', () => {
    expect(workingTimeApprovalTodayDate(new Date('2026-10-10T22:30:00Z'))).toBe('2026-10-11');
    expect(workingTimeApprovalTodayDate(new Date('2026-10-25T22:30:00Z'))).toBe('2026-10-25');
    expect(workingTimeApprovalTodayDate(new Date('2026-10-25T23:30:00Z'))).toBe('2026-10-26');
  });

  it('includes today and exactly two calendar months ago, and excludes older or future days', () => {
    expect(workingTimeCaptainApprovalStartDate('2026-10-11')).toBe('2026-08-11');
    expect(workingTimeCaptainApprovalDateAllowed('2026-08-11', '2026-10-11')).toBe(true);
    expect(workingTimeCaptainApprovalDateAllowed('2026-08-10', '2026-10-11')).toBe(false);
    expect(workingTimeCaptainApprovalDateAllowed('2026-10-11', '2026-10-11')).toBe(true);
    expect(workingTimeCaptainApprovalDateAllowed('2026-10-12', '2026-10-11')).toBe(false);
    for (const date of ['2026-09-20', '2026-09-21', '2026-09-22']) {
      expect(workingTimeCaptainApprovalDateAllowed(date, '2026-10-11')).toBe(true);
    }
  });

  it.each([
    ['2026-04-30', '2026-02-28'],
    ['2028-04-30', '2028-02-29'],
    ['2026-08-31', '2026-06-30'],
    ['2027-01-31', '2026-11-30'],
  ])('clamps two months before %s to %s', (referenceDate, expected) => {
    expect(workingTimeCaptainApprovalStartDate(referenceDate)).toBe(expected);
    expect(workingTimeCaptainApprovalDateAllowed(expected, referenceDate)).toBe(true);
  });

  it('rejects invalid dates instead of normalizing them into the approval window', () => {
    expect(workingTimeCaptainApprovalDateAllowed('2026-02-30', '2026-04-30')).toBe(false);
    expect(workingTimeCaptainApprovalDateAllowed('2026-09-20', '2026-10-32')).toBe(false);
    expect(workingTimeCaptainApprovalStartDate('')).toBe('');
  });
});
