import { describe, expect, it, vi } from 'vitest';
import { buildHumanResourcesDashboard, buildPermanentWorkforceTurnover, buildStaffEvolution, buildWorkforceExitBreakdown, buildWorkforceTurnover, fetchAllPeople, getPersonEmploymentPeriods, isPersonEmployedOn, isPersonFormerOn, mapPersonRows, validateEmploymentPeriods, type EmploymentPeriod, type HrDocumentRecord } from './peopleQueries';

const period = (hiredOn: string, departedOn = '', contractType = 'CDI', departureReason = ''): EmploymentPeriod => ({ hiredOn, departedOn, contractType, departureReason });
function makePerson(periods: EmploymentPeriod[]) {
  const last = periods[periods.length - 1];
  return mapPersonRows([{ id: 1, first_name: 'Jean', last_name: 'MARTIN', function_label: 'Capitaine', active: true,
    hired_on: last.hiredOn, departed_on: last.departedOn, contract_type: last.contractType, departure_reason: last.departureReason, employment_periods: periods } as never])[0];
}

describe('employment history and workforce indicators', () => {
  it('keeps historical employment and excludes the gap before rehire', () => {
    const person = makePerson([period('2024-01-01', '2025-03-01'), period('2026-02-01')]);
    expect(isPersonEmployedOn(person, '2024-12-31')).toBe(true);
    expect(isPersonEmployedOn(person, '2025-03-01')).toBe(false);
    expect(isPersonFormerOn(person, '2025-12-31')).toBe(true);
    expect(isPersonEmployedOn(person, '2026-02-01')).toBe(true);
    expect(isPersonFormerOn(person, '2026-07-01')).toBe(false);
    expect(buildStaffEvolution([person], [2024, 2025, 2026], '2026-07-01').map((point) => point.count)).toEqual([1, 0, 1]);
  });

  it('counts every departure even when a person has been rehired, by the period contract and reason', () => {
    const person = makePerson([period('2025-01-01', '2026-02-01', 'CDI', 'Démission'), period('2026-03-01', '2026-04-01', 'CDD', 'Fin de contrat'), period('2026-05-01', '', 'CDD')]);
    expect(buildWorkforceTurnover([person], '2026-07-01', '2026-01-01').departures).toBe(2);
    expect(buildPermanentWorkforceTurnover([person], '2026-07-01', '2026-01-01').departures).toBe(1);
    expect(buildPermanentWorkforceTurnover([person], '2026-07-01', '2026-01-01').headcountEnd).toBe(0);
    expect(buildWorkforceExitBreakdown([person], '2026-07-01', '2026-01-01')).toMatchObject({
      departures: 2, byContract: [{ label: 'CDI', count: 1 }, { label: 'CDD', count: 1 }],
      byReason: [{ label: 'Fin de contrat', count: 1 }, { label: 'Démission', count: 1 }],
    });
  });

  it('calculates cumulative worked tenure without counting absence between periods', () => {
    const person = makePerson([period('2020-01-01', '2021-01-01'), period('2026-01-01')]);
    expect(buildHumanResourcesDashboard([person], [], '2026-07-01').metrics.averageTenureYears).toBe(1.5);
  });

  it('retains legacy single-period records and same-day departures', () => {
    const person = makePerson([period('2026-03-04', '2026-03-04')]);
    delete person.employmentPeriods;
    expect(getPersonEmploymentPeriods(person)).toEqual([period('2026-03-04', '2026-03-04')]);
    expect(validateEmploymentPeriods(getPersonEmploymentPeriods(person))).toBeNull();
    expect(isPersonEmployedOn(person, '2026-03-04')).toBe(false);
  });

  it('rejects overlapping, open-ended previous periods and impossible dates', () => {
    expect(validateEmploymentPeriods([period('2026-01-01'), period('2026-04-01')])).toMatch(/chevaucher/);
    expect(validateEmploymentPeriods([period('2026-01-01', '2026-04-02'), period('2026-04-01')])).toMatch(/chevaucher/);
    expect(validateEmploymentPeriods([period('2026-02-30')])).toMatch(/valide/);
    expect(validateEmploymentPeriods([period('2026-03-04', '2026-03-03')])).toMatch(/précéder/);
    expect(validateEmploymentPeriods([period('2026-01-01', '2026-04-01'), period('2026-04-01')])).toBeNull();
  });

  it('reconciles all renewal categories without labelling administrative documents as certificates', () => {
    const documents = ['certificate', 'medical_visit', 'medical_visit', 'administrative'].map((categoryKey, id) => ({ id, personId: 1, categoryKey, status: 'renew_due' }) as HrDocumentRecord);
    const metrics = buildHumanResourcesDashboard([makePerson([period('2026-01-01')])], documents, '2026-07-01').metrics;
    expect(metrics.renewalDue).toBe(4);
    expect(metrics.certificateRenewals).toBe(1);
    expect(metrics.medicalVisitRenewals).toBe(2);
    expect(metrics.otherRenewals).toBe(1);
    expect(metrics.certificateRenewals + metrics.medicalVisitRenewals + metrics.otherRenewals).toBe(metrics.renewalDue);
  });

  it('loads beyond the server row limit with stable pages', async () => {
    const range = vi.fn().mockImplementation((offset: number) => Promise.resolve({ data: Array.from({ length: offset === 0 ? 500 : 2 }, (_, index) => ({ id: offset + index + 1, first_name: 'Jean', last_name: 'MARTIN' })), error: null }));
    const query = { order: vi.fn().mockReturnThis(), range };
    const client = { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(query) }) };
    const people = await fetchAllPeople(client as never);
    expect(people).toHaveLength(502);
    expect(range.mock.calls).toEqual([[0, 499], [500, 999]]);
    expect(query.order).toHaveBeenCalledWith('id', { ascending: true });
  });
});
