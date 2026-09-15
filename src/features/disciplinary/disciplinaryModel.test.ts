import { describe, expect, it } from 'vitest';
import { afterClearWorkingDays, deadlines, FAULTS, frenchDate, frenchHolidays, generateLetter, initialForm, isEmployed, letterIssues, monthDeadline, REASONS, SANCTIONS, todayParis, type FaultKey, type ReasonKey, type SanctionKey } from './disciplinaryModel';

const person = { id: 1, companyId: 1, firstName: 'Élodie', lastName: 'durand', functionLabel: 'Matelot', postalAddress: '1 rue du Port\n50100 Cherbourg', hiredOn: '2025-01-01', departedOn: '', contractType: 'CDI' };
describe('disciplinary legal calendar', () => {
  it('uses the date in Paris near midnight', () => expect(todayParis(new Date('2026-09-14T23:30:00Z'))).toBe('2026-09-15'));
  it('matches the official Tuesday summons example', () => expect(afterClearWorkingDays('2026-09-08', 5)).toBe('2026-09-15'));
  it('matches Monday and Thursday interview examples with Saturday expiry extension', () => {
    expect(afterClearWorkingDays('2026-09-07', 2)).toBe('2026-09-10');
    expect(afterClearWorkingDays('2026-09-10', 2)).toBe('2026-09-15');
  });
  it('handles a holiday, an additional closed day and month ends', () => {
    expect(afterClearWorkingDays('2026-07-10', 2)).toBe('2026-07-15');
    expect(afterClearWorkingDays('2026-09-07', 2, ['2026-09-08'])).toBe('2026-09-11');
    expect(monthDeadline('2026-01-31', 1)).toBe('2026-03-02');
    expect(monthDeadline('2026-11-30', 2)).toBe('2027-02-01');
    expect(frenchHolidays(2026)).toEqual(expect.arrayContaining(['2026-04-06', '2026-05-14', '2026-05-25']));
  });
  it('requires actual employment dates and keeps the departure day excluded', () => {
    expect(isEmployed(person, '2026-09-15')).toBe(true);
    expect(isEmployed({ ...person, hiredOn: '' }, '2026-09-15')).toBe(false);
    expect(isEmployed({ ...person, departedOn: '2026-09-15' }, '2026-09-15')).toBe(false);
  });
  it('applies interview deadlines to voluntary interviews too', () => {
    const f = { ...initialForm(person), optionalInterview: true, interviewAt: '2026-09-07T10:00' };
    expect(deadlines(f).notifyFrom).toBe('2026-09-10');
    expect(deadlines({ ...f, optionalInterview: false }).notifyFrom).toBe('');
  });
});
describe('disciplinary templates', () => {
  it('requires a fresh review after preparation changes and validates the actual sending date', () => {
    const form = { ...initialForm(person), optionalInterview: true, interviewAt: '2026-09-07T10:00', notificationOn: '2026-10-09' };
    const letter = generateLetter(form, 'notification', { name: 'Marie', function: 'Direction' });
    expect(letterIssues(form, letter).join(' ')).toContain('délai d’un mois');
    expect(letterIssues({ ...form, sanction: 'blame' }, letter).join(' ')).toContain('La préparation a changé');
  });
  for (const fault of Object.keys(FAULTS) as FaultKey[]) for (const sanction of Object.keys(SANCTIONS) as SanctionKey[]) for (const reason of Object.keys(REASONS) as ReasonKey[]) {
    it(`builds editable ${fault}/${sanction}/${reason} without losing recipient or facts`, () => {
      const letter = generateLetter({ ...initialForm(person), fault, sanction, reason, facts: 'Observation factuelle TEST.' }, 'notification', { name: 'Marie MANAGER', function: 'Directrice' });
      expect(letter.employeeName).toBe('Élodie DURAND'); expect(letter.address).toBe(person.postalAddress);
      expect(letter.body).toContain('Observation factuelle TEST.'); expect(letter.body).toContain(REASONS[reason].paragraph);
      expect(letter.emitterFunction).toBe('Directrice'); expect(frenchDate(letter.date)).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
      if (fault === 'lourde' && sanction === 'licenciement') expect(letter.body).toContain('intention de nuire');
    });
  }
  it('does not prejudge a decision in a summons and includes external assistance when required', () => {
    const letter = generateLetter({ ...initialForm(person), sanction: 'licenciement', representatives: false, advisorAddresses: 'Inspection et mairie compétentes' }, 'convocation', { name: 'Marie', function: 'Direction' });
    expect(letter.body).toContain('Aucune décision n’est prise'); expect(letter.body).toContain('conseiller du salarié'); expect(letter.body).toContain('Inspection et mairie compétentes');
  });
  it('distinguishes protective suspension and restricts generic dismissal documents', () => {
    const f = { ...initialForm(person), sanction: 'licenciement' as const, contractType: 'CDD', protectedEmployee: true };
    const letter = generateLetter(f, 'conservatoire', { name: 'Marie', function: 'Direction' });
    expect(letter.body).toContain('ne constitue pas une sanction');
    const issues = letterIssues(f, { ...letter, kind: 'notification' });
    expect(issues.join(' ')).toContain('CDI'); expect(issues.join(' ')).toContain('protégé'); expect(issues.join(' ')).toContain('signature');
  });
});
