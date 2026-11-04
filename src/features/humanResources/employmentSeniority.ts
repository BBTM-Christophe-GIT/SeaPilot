import { getParisDateKey } from './hrDocumentNotifications';
import type { EmploymentPeriod, PersonRecord } from './peopleQueries';
import type { HrSalaryGridRow } from './salaryGridQueries';

export const EMPLOYMENT_SALARY_CALCULATION_VERSION = 'employment-seniority-v1' as const;

export interface EmploymentSeniority {
  workedDays: number;
  seniorityRatePercent: number;
  firstWorkedOn: string;
  virtualDate: string;
  calculatedOn: string;
}

export interface EmploymentSalaryCalculation extends EmploymentSeniority {
  annualBaseSalary: string;
  annualGrossSalary: string;
  grossMonthlySalary: string;
  calculationVersion: typeof EMPLOYMENT_SALARY_CALCULATION_VERSION;
}

type SeniorityPeriod = Pick<EmploymentPeriod, 'hiredOn' | 'departedOn'>;
type SalaryPerson = Pick<PersonRecord, 'hiredOn' | 'departedOn' | 'employmentPeriods'>;
const DAY_MS = 86_400_000;
const thresholds = [{ years: 3, rate: 1.5 }, { years: 6, rate: 3 }, { years: 9, rate: 4.5 }, { years: 15, rate: 6 }] as const;

function parseDay(value: string): number | null {
  const key = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match || Number(match[1]) < 1) return null;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === key ? date.getTime() / DAY_MS : null;
}

function dayKey(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function anniversaryDay(firstDay: number, years: number): number {
  const anchor = new Date(firstDay * DAY_MS);
  const anniversary = new Date(firstDay * DAY_MS);
  anniversary.setUTCFullYear(anchor.getUTCFullYear() + years, anchor.getUTCMonth(), anchor.getUTCDate());
  // February 29 anniversaries occur on February 28 in a non-leap year.
  if (anniversary.getUTCMonth() !== anchor.getUTCMonth()) anniversary.setUTCDate(0);
  return anniversary.getTime() / DAY_MS;
}

/** Count completed UTC days in the union of [hire, min(departure, asOf)) intervals. */
export function calculateEmploymentSeniority(periods: readonly SeniorityPeriod[], asOf = getParisDateKey()): EmploymentSeniority {
  const referenceDay = parseDay(asOf);
  if (referenceDay === null) throw new Error('La date de référence de l’ancienneté est invalide.');
  const ranges: Array<{ start: number; end: number }> = [];
  let firstDay: number | null = null;
  for (const period of periods) {
    const start = parseDay(period.hiredOn);
    const departed = period.departedOn.trim() ? parseDay(period.departedOn) : null;
    if (start === null || start > referenceDay || (period.departedOn.trim() && departed === null)
      || (departed !== null && departed <= start)) continue;
    const end = Math.min(departed ?? referenceDay, referenceDay);
    firstDay = firstDay === null ? start : Math.min(firstDay, start);
    if (end > start) ranges.push({ start, end });
  }
  ranges.sort((left, right) => left.start - right.start || left.end - right.end);
  const union: Array<{ start: number; end: number }> = [];
  for (const range of ranges) {
    const previous = union.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else union.push({ ...range });
  }
  const workedDays = union.reduce((total, range) => total + range.end - range.start, 0);
  const virtualDay = firstDay === null ? null : firstDay + workedDays;
  let seniorityRatePercent = 0;
  if (firstDay !== null && virtualDay !== null) {
    for (const threshold of thresholds) if (virtualDay >= anniversaryDay(firstDay, threshold.years)) seniorityRatePercent = threshold.rate;
  }
  return { workedDays, seniorityRatePercent, firstWorkedOn: firstDay === null ? '' : dayKey(firstDay),
    virtualDate: virtualDay === null ? '' : dayKey(virtualDay), calculatedOn: dayKey(referenceDay) };
}

function annualCents(value: number): number | null {
  // The editable salary grid has the same upper bound; all subsequent integer
  // products remain exact, including the largest seniority adjustment.
  if (!Number.isFinite(value) || value < 0 || value > 100_000_000) return null;
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function monthlyFromCents(cents: number): string {
  return Math.ceil(cents / 1200).toFixed(2);
}

/** Convert the annual base into monthly whole euros without rounding monthly cents first. */
export function monthlyGrossSalaryFromAnnual(annualGross: number): string {
  const cents = annualCents(annualGross);
  return cents === null ? '' : monthlyFromCents(cents);
}

export function calculateEmploymentSalary(
  person: SalaryPerson,
  row: Pick<HrSalaryGridRow, 'annualGross'>,
  asOf = getParisDateKey(),
): EmploymentSalaryCalculation {
  const periods = person.employmentPeriods?.length ? person.employmentPeriods : [{ hiredOn: person.hiredOn, departedOn: person.departedOn }];
  const seniority = calculateEmploymentSeniority(periods, asOf);
  const baseCents = annualCents(row.annualGross);
  const rateBasisPoints = Math.round(seniority.seniorityRatePercent * 100);
  const adjustedCents = baseCents === null ? null : Math.floor((baseCents * (10_000 + rateBasisPoints) + 5_000) / 10_000);
  return { ...seniority, calculationVersion: EMPLOYMENT_SALARY_CALCULATION_VERSION,
    annualBaseSalary: baseCents === null ? '' : (baseCents / 100).toFixed(2),
    annualGrossSalary: adjustedCents === null ? '' : (adjustedCents / 100).toFixed(2),
    grossMonthlySalary: adjustedCents === null ? '' : monthlyFromCents(adjustedCents) };
}
