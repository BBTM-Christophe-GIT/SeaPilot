// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calculateEmploymentSalary,
  calculateEmploymentSeniority,
  EMPLOYMENT_SALARY_CALCULATION_VERSION,
  monthlyGrossSalaryFromAnnual,
} from './employmentSeniority';

function period(hiredOn: string, departedOn = '') {
  return { hiredOn, departedOn, contractType: 'CDI', departureReason: '' };
}

afterEach(() => vi.useRealTimers());

describe('cumulative employment seniority', () => {
  it.each([
    ['2013-05-19', '2013-05-20', 1.5],
    ['2016-05-19', '2016-05-20', 3],
    ['2019-05-19', '2019-05-20', 4.5],
    ['2025-05-19', '2025-05-20', 6],
  ] as const)('applies the next rate inclusively on %s → %s without adding prior rates', (before, anniversary, expected) => {
    const periods = [period('2010-05-20')];
    expect(calculateEmploymentSeniority(periods, before).seniorityRatePercent).toBeLessThan(expected);
    expect(calculateEmploymentSeniority(periods, anniversary).seniorityRatePercent).toBe(expected);
    expect(calculateEmploymentSeniority(periods, '2050-05-20').seniorityRatePercent).toBe(6);
  });

  it('counts completed days and reaches three years exactly on the anniversary, not the preceding day', () => {
    expect(calculateEmploymentSeniority([period('2020-01-01')], '2023-01-01')).toEqual({
      workedDays: 1096, seniorityRatePercent: 1.5, firstWorkedOn: '2020-01-01', virtualDate: '2023-01-01', calculatedOn: '2023-01-01',
    });
    expect(calculateEmploymentSeniority([period('2020-01-01')], '2022-12-31').seniorityRatePercent).toBe(0);
    expect(calculateEmploymentSeniority([period('2026-11-04')], '2026-11-04')).toMatchObject({
      workedDays: 0, seniorityRatePercent: 0, firstWorkedOn: '2026-11-04', virtualDate: '2026-11-04',
    });
  });

  it('unions overlaps, duplicates and adjacent intervals instead of counting any day twice', () => {
    const periods = [period('2022-01-01'), period('2020-06-01', '2021-06-01'),
      period('2020-01-01', '2021-01-01'), period('2021-06-01', '2022-01-01'), period('2020-01-01', '2021-01-01')];
    expect(calculateEmploymentSeniority(periods, '2023-01-01')).toMatchObject({ workedDays: 1096, virtualDate: '2023-01-01', seniorityRatePercent: 1.5 });
  });

  it('excludes rehire gaps and compares the virtual cumulative date to the first-hire calendar anniversary', () => {
    const periods = [period('2023-01-01', '2024-01-01'), period('2025-01-01')];
    expect(calculateEmploymentSeniority(periods, '2027-01-01')).toMatchObject({
      workedDays: 1095, firstWorkedOn: '2023-01-01', virtualDate: '2025-12-31', seniorityRatePercent: 0,
    });
    expect(calculateEmploymentSeniority(periods, '2027-01-02')).toMatchObject({
      workedDays: 1096, virtualDate: '2026-01-01', seniorityRatePercent: 1.5,
    });
  });

  it('caps future departures at the reference day and ignores future hires entirely', () => {
    expect(calculateEmploymentSeniority([period('2024-01-01', '2030-01-01'), period('2031-01-01')], '2025-01-01'))
      .toMatchObject({ workedDays: 366, firstWorkedOn: '2024-01-01', virtualDate: '2025-01-01', seniorityRatePercent: 0 });
    expect(calculateEmploymentSeniority([period('2031-01-01')], '2025-01-01')).toMatchObject({
      workedDays: 0, seniorityRatePercent: 0, firstWorkedOn: '', virtualDate: '',
    });
  });

  it('excludes the departure day and stops accruing after a closed employment period', () => {
    expect(calculateEmploymentSeniority([period('2026-11-01', '2026-11-04')], '2026-11-04').workedDays).toBe(3);
    expect(calculateEmploymentSeniority([period('2020-05-20', '2023-05-20')], '2040-01-01'))
      .toMatchObject({ workedDays: 1095, virtualDate: '2023-05-20', seniorityRatePercent: 1.5 });
  });

  it.each([['2023-02-27', 0], ['2023-02-28', 1.5], ['2026-02-27', 1.5], ['2026-02-28', 3]] as const)('clamps a February 29 anniversary on %s to the correct rate', (asOf, rate) => {
      expect(calculateEmploymentSeniority([period('2020-02-29')], asOf).seniorityRatePercent).toBe(rate);
    });

  it.each([['2026-03-28', '2026-03-31'], ['2026-10-24', '2026-10-27']])('counts UTC calendar days across the clock change from %s', (hire, asOf) => {
    expect(calculateEmploymentSeniority([period(hire)], asOf).workedDays).toBe(3);
  });

  it('ignores incomplete, invalid, reversed and empty periods without throwing during profile editing', () => {
    const invalid = [period(''), period('not-a-date'), period('2023-02-29'), period('2026-02-30'),
      period('2023-01-01', 'invalid'), period('2025-01-01', '2024-01-01'), period('2024-01-01', '2024-01-01')];
    expect(calculateEmploymentSeniority(invalid, '2026-11-04')).toMatchObject({ workedDays: 0, seniorityRatePercent: 0, firstWorkedOn: '', virtualDate: '' });
    expect(calculateEmploymentSeniority([...invalid, period('2023-01-01')], '2026-01-01')).toMatchObject({ workedDays: 1096, seniorityRatePercent: 1.5 });
  });

  it('uses the Paris day by default even when the UTC date is still the day before an anniversary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T23:30:00Z'));
    expect(calculateEmploymentSeniority([period('2023-11-04')])).toMatchObject({ calculatedOn: '2026-11-04', seniorityRatePercent: 1.5 });
  });

  it('does not mutate the supplied period history', () => {
    const periods = Object.freeze([Object.freeze(period('2023-01-01')), Object.freeze(period('2020-01-01', '2021-01-01'))]);
    expect(() => calculateEmploymentSeniority(periods, '2026-01-01')).not.toThrow();
    expect(periods[0].hiredOn).toBe('2023-01-01');
  });

  it('rejects an invalid explicit reference date', () => {
    expect(() => calculateEmploymentSeniority([], '2026-02-30')).toThrow('date de référence');
  });
});

describe('employment gross salary calculation', () => {
  const person = { hiredOn: '2023-01-01', departedOn: '' };

  it('uses only the unadjusted annual gross column and records a reproducible calculation snapshot', () => {
    const row = { annualGross: 24000, totalAnnualBase: 48000 };
    const calculation = calculateEmploymentSalary(person, row, '2026-01-01');
    expect(calculation).toEqual({ annualBaseSalary: '24000.00', annualGrossSalary: '24360.00', grossMonthlySalary: '2030.00',
      seniorityRatePercent: 1.5, workedDays: 1096, firstWorkedOn: '2023-01-01', virtualDate: '2026-01-01', calculatedOn: '2026-01-01',
      calculationVersion: EMPLOYMENT_SALARY_CALCULATION_VERSION });
  });

  it('uses explicit employment history instead of counting the latest legacy hire a second time', () => {
    const calculation = calculateEmploymentSalary({ hiredOn: '2020-01-01', departedOn: '2021-01-01', employmentPeriods: [period('2023-01-01')] },
      { annualGross: 24000 }, '2026-01-01');
    expect(calculation).toMatchObject({ workedDays: 1096, firstWorkedOn: '2023-01-01', seniorityRatePercent: 1.5, grossMonthlySalary: '2030.00' });
    expect(calculateEmploymentSalary({ ...person, employmentPeriods: [] }, { annualGross: 24000 }, '2026-01-01')).toEqual(calculation);
  });

  it('rounds the adjusted annual salary to cents before dividing, then rounds monthly pay directly up to a whole euro', () => {
    expect(calculateEmploymentSalary(person, { annualGross: 1 }, '2026-01-01')).toMatchObject({ annualGrossSalary: '1.02', grossMonthlySalary: '1.00' });
    expect(calculateEmploymentSalary(person, { annualGross: 12000 }, '2026-01-01')).toMatchObject({ annualGrossSalary: '12180.00', grossMonthlySalary: '1015.00' });
    expect(calculateEmploymentSalary(person, { annualGross: 12000.01 }, '2026-01-01')).toMatchObject({ annualGrossSalary: '12180.01', grossMonthlySalary: '1016.00' });
    expect(monthlyGrossSalaryFromAnnual(12000.01)).toBe('1001.00');
    expect(monthlyGrossSalaryFromAnnual(12000)).toBe('1000.00');
    expect(monthlyGrossSalaryFromAnnual(0)).toBe('0.00');
  });

  it('applies only the highest rate to the original annual base, never a saved adjusted salary', () => {
    const previous = { hiredOn: '2000-01-01', departedOn: '', annualGrossSalary: 'PRIVATE_PREVIOUS_PAY', grossMonthlySalary: 'PRIVATE_PREVIOUS_MONTHLY' };
    const calculation = calculateEmploymentSalary(previous, { annualGross: 24000 }, '2026-01-01');
    expect(calculation).toMatchObject({ seniorityRatePercent: 6, annualBaseSalary: '24000.00', annualGrossSalary: '25440.00', grossMonthlySalary: '2120.00' });
    expect(JSON.stringify(calculation)).not.toContain('PRIVATE_');
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])('leaves invalid annual gross %s empty for the existing profile validation', annualGross => {
    expect(calculateEmploymentSalary(person, { annualGross }, '2026-01-01')).toMatchObject({ annualBaseSalary: '', annualGrossSalary: '', grossMonthlySalary: '' });
    expect(monthlyGrossSalaryFromAnnual(annualGross)).toBe('');
  });
});
