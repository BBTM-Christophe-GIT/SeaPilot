import { describe, expect, it } from 'vitest';
import type { PersonRecord } from './peopleQueries';
import {
  buildEmploymentContractFileName, buildEmploymentContractPreview, calculateEmploymentContractEndDate, createEmploymentContractDraft,
  validateEmploymentContractDraft, type EmploymentContractDraft,
} from './employmentContractModel';

const person = {
  id: 7, firstName: 'Camille', lastName: 'DUPRÉ', birthDate: '1990-05-04', birthPlace: 'Rouen',
  postalAddress: '1 quai du Port\n76000 Rouen', sailorNumber: '2000123', functionLabel: 'Matelot polyvalent',
  enimCategory: 12, enimFunctionCode: 'AA01A', hiredOn: '2026-11-04', contractType: 'CDD',
} as PersonRecord;

function complete(type: 'CDI' | 'CDD'): EmploymentContractDraft {
  return { ...createEmploymentContractDraft(person, type, {
    socialSecurityNumber: '190057612345678', vesselNames: 'GOURY', grossMonthlySalary: '3 250,50',
    collectiveAgreement: 'CONVENTION COLLECTIVE PERSONNELS EXECUTION', endDate: '2027-05-03',
  }), signatureDate: '2026-11-04' };
}

describe('employment contract data from the RH record', () => {
  it('prefills recorded facts and confidential saved details without inventing financial or identity data', () => {
    const draft = createEmploymentContractDraft(person);
    expect(draft).toMatchObject({ type: 'CDD', personId: 7, lastName: 'DUPRÉ', birthDate: '1990-05-04',
      postalAddress: '1 quai du Port\n76000 Rouen', enimCategory: '12', enimFunctionCode: 'AA01A', startDate: '2026-11-04',
      socialSecurityNumber: '', grossMonthlySalary: '', vesselNames: '', endDate: '' });
    expect(validateEmploymentContractDraft(draft)).toEqual(expect.arrayContaining([
      'Numéro de sécurité sociale : renseignez ce champ.', 'Date de fin : renseignez ce champ.',
    ]));
    expect(validateEmploymentContractDraft(complete('CDD'))).toEqual([]);
    expect(createEmploymentContractDraft(person, 'CDI', { endDate: '2027-01-01' }).endDate).toBe('');
  });

  it('rejects invalid calendars, inverted CDD periods and malformed salary before document generation', () => {
    expect(validateEmploymentContractDraft({ ...complete('CDD'), birthDate: '2026-02-30', endDate: '2026-01-01', grossMonthlySalary: '1e5' }))
      .toEqual(expect.arrayContaining([
        'Date de naissance : date invalide.',
        'La date de fin du CDD doit être postérieure ou égale à la date de début.',
        'Le salaire mensuel brut doit être un montant positif avec deux décimales au maximum.',
      ]));
    expect(validateEmploymentContractDraft(complete('CDI'))).toEqual([]);
  });

  it('reflects the selected template clauses and entered values in the text representation', () => {
    const cdd = buildEmploymentContractPreview(complete('CDD')).join('\n');
    const cdi = buildEmploymentContractPreview(complete('CDI')).join('\n');
    expect(cdd).toContain('Camille DUPRÉ');
    expect(cdd).toContain('04/05/1990');
    expect(cdd).toContain('3\u202f250,50 €uros');
    expect(cdd).toContain('prime de précarité de 10%');
    expect(cdi).toContain('pour une durée indéterminée');
    expect(cdi).toContain('La CONVENTION COLLECTIVE PERSONNELS EXECUTION.');
    expect(cdd + cdi).not.toContain('{{');
    expect(buildEmploymentContractFileName(complete('CDD'))).toBe('Contrat-CDD-DUPRE-Camille-2026-11-04.pdf');
  });
});

describe('inclusive CDD duration from the saved RH start date', () => {
  it.each([
    ['2026-01-01', '1', 'days', '2026-01-01'],
    ['2026-01-01', '31', 'days', '2026-01-31'],
    ['2026-12-29', '7', 'days', '2027-01-04'],
    ['2026-03-27', '1', 'weeks', '2026-04-02'],
    ['2026-10-23', '2', 'weeks', '2026-11-05'],
    ['2026-01-01', '1', 'months', '2026-01-31'],
    ['2026-01-15', '1', 'months', '2026-02-14'],
    ['2026-01-31', '1', 'months', '2026-02-28'],
    ['2028-01-31', '1', 'months', '2028-02-29'],
    ['2026-01-30', '1', 'months', '2026-02-28'],
    ['2026-01-31', '2', 'months', '2026-03-30'],
    ['2028-02-29', '12', 'months', '2029-02-28'],
    ['2026-11-04', '3', 'months', '2027-02-03'],
    ['9999-12-31', '1', 'days', '9999-12-31'],
  ] as const)('starts %s for %s %s and ends %s', (start, amount, unit, expected) => {
    expect(calculateEmploymentContractEndDate(start, amount, unit)).toBe(expected);
  });

  it.each(['', '0', '-1', '1.5', '1,5', '1e2', 'NaN', '9007199254740992'])('rejects invalid duration %j', (amount) => {
    expect(() => calculateEmploymentContractEndDate('2026-01-01', amount, 'months')).toThrow('nombre entier strictement positif');
  });

  it('validates the saved start date, unit and representable end date', () => {
    expect(() => calculateEmploymentContractEndDate('2026-02-30', '1', 'months')).toThrow('date de début enregistrée');
    expect(() => calculateEmploymentContractEndDate('', '1', 'months')).toThrow('date de début enregistrée');
    expect(() => calculateEmploymentContractEndDate('2026-01-01', '1', 'years' as 'months')).toThrow('jours, semaines ou mois');
    expect(() => calculateEmploymentContractEndDate('9999-12-31', '2', 'days')).toThrow('plage de dates');
    expect(() => calculateEmploymentContractEndDate('2026-01-01', '9007199254740991', 'months')).toThrow('plage de dates');
  });
});
