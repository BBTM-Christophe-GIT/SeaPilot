import { describe, expect, it } from 'vitest';
import { blankMedicalDraft, canAccessMedicalLogbook, formatMedicalDate, medicalEntryMatches, validateMedicalDraft, type MedicalEntry } from './medicalLogbookModel';

const draft = () => ({ ...blankMedicalDraft(), occurred_on: '2026-10-14', occurred_time: '10:00', patient_name: 'Patient fictif',
  injury_illness: 'Événement fictif', treatment_medicines: 'Soins fictifs', first_aider_name: 'Secouriste fictif' });
describe('medical register validation', () => {
  it('limits medical access to administrators and captains', () => {
    expect(canAccessMedicalLogbook(['admin'])).toBe(true);
    expect(canAccessMedicalLogbook(['capitaine'])).toBe(true);
    for (const role of ['direction', 'armement', 'marin'] as const) expect(canAccessMedicalLogbook([role])).toBe(false);
    expect(canAccessMedicalLogbook([])).toBe(false);
  });
  it('validates a real calendar date and minute time without converting the recorded local time', () => {
    expect(validateMedicalDraft(draft())).toBeNull();
    expect(validateMedicalDraft({ ...draft(), occurred_on: '2026-02-30' })).toContain('date');
    expect(validateMedicalDraft({ ...draft(), occurred_time: '24:01' })).toContain('heure');
    expect(validateMedicalDraft({ ...draft(), occurred_time: '10:60' })).toContain('heure');
    expect(formatMedicalDate('2026-10-14')).toBe('14/10/2026');
  });
  it('requires the medical fields while signature identity is populated separately by the server', () => {
    for (const key of ['patient_name', 'injury_illness', 'treatment_medicines', 'first_aider_name'] as const) {
      expect(validateMedicalDraft({ ...draft(), [key]: '  ' })).not.toBeNull();
    }
    expect(validateMedicalDraft({ ...draft(), patient_name: 'x'.repeat(161) })).toContain('160');
    expect(validateMedicalDraft({ ...draft(), treatment_medicines: 'x'.repeat(4001) })).toContain('4000');
    expect(validateMedicalDraft(draft())).toBeNull();
  });
  it('searches accented patient and treatment text and respects the chosen year', () => {
    const entry = { ...draft(), signature_name: 'Secouriste fictif', id: 1 } as MedicalEntry;
    expect(medicalEntryMatches(entry, 'evenement', '2026')).toBe(true);
    expect(medicalEntryMatches(entry, 'Soins', '2025')).toBe(false);
    expect(medicalEntryMatches(entry, '14/10', '')).toBe(true);
  });
});
