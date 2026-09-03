import { describe, expect, it } from 'vitest';
import {
  workingTimeEntryCutoffDate,
  workingTimeEntryDateIsOpen,
  workingTimeEntryIsInGracePeriod,
} from './workingTimeEntryWindow';

describe('working-time entry window', () => {
  it('keeps a month editable through the fifth day of the following month', () => {
    expect(workingTimeEntryCutoffDate('2026-08-21')).toBe('2026-09-05');
    expect(workingTimeEntryDateIsOpen('2026-08-31', '2026-09-05')).toBe(true);
    expect(workingTimeEntryDateIsOpen('2026-08-31', '2026-09-06')).toBe(false);
  });

  it('handles the December to January rollover', () => {
    expect(workingTimeEntryCutoffDate('2026-12-01')).toBe('2027-01-05');
    expect(workingTimeEntryDateIsOpen('2026-12-31', '2027-01-05')).toBe(true);
    expect(workingTimeEntryDateIsOpen('2026-12-31', '2027-01-06')).toBe(false);
  });

  it('identifies only the following-month grace period', () => {
    expect(workingTimeEntryIsInGracePeriod('2026-08-15', '2026-08-31')).toBe(false);
    expect(workingTimeEntryIsInGracePeriod('2026-08-15', '2026-09-01')).toBe(true);
    expect(workingTimeEntryIsInGracePeriod('2026-08-15', '2026-09-06')).toBe(false);
  });
});
