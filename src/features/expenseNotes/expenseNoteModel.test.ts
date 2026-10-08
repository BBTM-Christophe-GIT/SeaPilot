import { describe, expect, it } from 'vitest';
import { canViewAllExpenseNotes, groupExpenseNotes, mileageAmount, mileageTotal, validateExpenseFiles } from './expenseNoteModel';
import { EXPENSE_NOTE_PREVIEW } from './expenseNotePreview';

describe('expense note rules', () => {
  it.each(['marin', 'capitaine', 'armement'] as const)('%s has personal history only', (role) => expect(canViewAllExpenseNotes([role])).toBe(false));
  it.each(['admin', 'direction'] as const)('%s can oversee the active company', (role) => expect(canViewAllExpenseNotes([role])).toBe(true));
  it('keeps the existing NDF thermal cap and electric manual amounts', () => {
    expect(mileageAmount(100, 'diesel', 999)).toBe(60.6);
    expect(mileageAmount(200, 'hybrid', 0)).toBe(100);
    expect(mileageAmount(400, 'electric', 124.25)).toBe(124.25);
    expect(mileageTotal({ vehicle: 'Auto', fiscalPower: '5', fuel: 'essence', function: 'Matelot', period: 'Septembre', tolls: 12.3, trips: [
      { date: '2026-09-17', route: 'A-B', reason: 'Embarquement', km: 100, amount: 0 },
      { date: '2026-09-18', route: 'B-A', reason: 'Débarquement', km: 200, amount: 0 },
    ] })).toBe(172.9);
  });
  it('groups by vessel and stable issuer ID, including no vessel and namesakes', () => {
    const groups = groupExpenseNotes([...EXPENSE_NOTE_PREVIEW, { ...EXPENSE_NOTE_PREVIEW[0], id: 'other', issuer_person_id: 99 }]);
    expect(groups.map((g) => g.name)).toEqual(['GOURY', 'SUROIT', 'Hors navire']);
    expect(groups[0].issuers).toHaveLength(3);
    expect(groups[0].issuers.filter((p) => p.name === 'Camille Martin')).toHaveLength(2);
  });
  it('rejects unsupported receipts and excessive file counts', () => {
    expect(() => validateExpenseFiles([new File(['x'], 'script.svg', { type: 'image/svg+xml' })])).toThrow('PDF');
    expect(() => validateExpenseFiles(Array.from({ length: 21 }, () => new File(['x'], 'a.pdf', { type: 'application/pdf' })))).toThrow('20');
  });
});
