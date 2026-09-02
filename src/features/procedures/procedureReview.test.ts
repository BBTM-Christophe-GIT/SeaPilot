import { describe, expect, it } from 'vitest';
import { buildProcedureCode, getAnnualReviewAlert, getAnnualReviewDueDate } from './procedureReview';

describe('procedureReview', () => {
  it('builds the procedure code from the theme, number and version', () => {
    expect(buildProcedureCode(' ope ', '04', ' d ')).toBe('OPE 04-D');
    expect(buildProcedureCode('', '04', 'D')).toBe('04-D');
  });

  it('schedules the review one calendar year after diffusion', () => {
    expect(getAnnualReviewDueDate('2026-04-27')).toBe('2027-04-27');
    expect(getAnnualReviewDueDate('2024-02-29')).toBe('2025-02-28');
  });

  it('raises an alert only inside the 90-day horizon', () => {
    const today = new Date(2026, 7, 25, 12);
    expect(getAnnualReviewAlert(true, '2025-11-04', today)).toMatchObject({
      dueDate: '2026-11-04',
      daysUntilDue: 71,
      tone: 'warning',
    });
    expect(getAnnualReviewAlert(true, '2026-03-20', today)).toBeNull();
    expect(getAnnualReviewAlert(false, '2025-11-04', today)).toBeNull();
  });
});
