import { describe, expect, it } from 'vitest';
import type { HrSalaryGridRow } from './salaryGridQueries';
import { parseSalaryGridAmount, salaryGridConventionLabel, salaryGridDraftRows, salaryGridMonthlyAmount, salaryGridRowsFromDraft } from './salaryGridModel';

const source: HrSalaryGridRow = { id: 'poste-a', positionLabel: 'Poste A', ccn: 'Officier', enimCategory: '12',
  conventionalAnnualBase: 30000, indexationPercent: 25, annualGross: 37500, annualPremium: 2500, totalAnnualBase: 43200, active: true };

describe('editable salary grid source model', () => {
  it('uses annual gross divided by twelve, rounded up directly to a whole monthly euro', () => {
    expect(salaryGridMonthlyAmount({ annualGross: 12000 })).toBe('1000.00');
    expect(salaryGridMonthlyAmount({ annualGross: 12000.01 })).toBe('1001.00');
    expect(salaryGridMonthlyAmount({ annualGross: 11999.99 })).toBe('1000.00');
    expect(salaryGridMonthlyAmount(source)).toBe('3125.00');
  });
  it('preserves all eight source columns without recalculating inconsistent source totals', () => {
    const draft = salaryGridDraftRows([source]);
    draft[0].totalAnnualBase = '51 900,00 €';
    const parsed = salaryGridRowsFromDraft(draft);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]).toEqual({ ...source, totalAnnualBase: 51900 });
    expect(salaryGridMonthlyAmount(parsed.rows[0])).toBe('3125.00');
  });
  it('accepts French decimals while rejecting malformed and overly precise amounts', () => {
    expect(parseSalaryGridAmount('1 234,56 €')).toBe(1234.56);
    expect(parseSalaryGridAmount('13%')).toBe(13);
    for (const value of ['-1', '1e5', '1,234', '', 'NaN']) expect(parseSalaryGridAmount(value)).toBeNaN();
  });
  it('rejects duplicate positions, missing text and invalid numeric values before saving', () => {
    const draft = salaryGridDraftRows([source, { ...source, id: 'other', ccn: '' }]);
    draft[1].annualGross = 'invalid';
    const parsed = salaryGridRowsFromDraft(draft);
    expect(parsed.errors.some(error => error.includes('existe plusieurs fois'))).toBe(true);
    expect(parsed.errors.some(error => error.includes('CCN'))).toBe(true);
    expect(parsed.errors.some(error => error.includes('Annuel brut'))).toBe(true);
  });
  it('maps only the two supplied CCN groups to their supplied convention wording', () => {
    expect(salaryGridConventionLabel(source)).toBe('CONVENTION COLLECTIVE DES OFFICIERS DE LA MARINE MARCHANDE');
    expect(salaryGridConventionLabel({ ccn: 'PEX' })).toBe('CONVENTION COLLECTIVE PERSONNELS EXECUTION');
    expect(salaryGridConventionLabel({ ccn: 'Autre convention' })).toBe('Autre convention');
  });
});
