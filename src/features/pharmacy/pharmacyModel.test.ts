import { describe, expect, it, vi } from 'vitest';
import { blankPharmacyItem, canManagePharmacy, formatPharmacyDate, groupPharmacyItems, pharmacyDaysUntil, pharmacyExpiryStatus, pharmacyStockStatus, pharmacyToday, type PharmacyItem } from './pharmacyModel';

describe('pharmacy dates and stock', () => {
  it('alerts inclusively at thirty days and retains expired dates', () => {
    expect(pharmacyExpiryStatus('2026-11-20', '2026-10-20')).toBe('valid');
    expect(pharmacyExpiryStatus('2026-11-19', '2026-10-20')).toBe('due');
    expect(pharmacyExpiryStatus('2026-10-20', '2026-10-20')).toBe('due');
    expect(pharmacyExpiryStatus('2026-10-19', '2026-10-20')).toBe('expired');
    expect(pharmacyExpiryStatus(null, '2026-10-20')).toBe('unknown');
  });
  it('counts calendar days over daylight saving and rejects invalid dates', () => {
    expect(pharmacyDaysUntil('2026-10-26', '2026-10-24')).toBe(2);
    expect(pharmacyDaysUntil('2026-02-31', '2026-02-01')).toBeNull();
    expect(pharmacyDaysUntil('inconnue', '2026-02-01')).toBeNull();
  });
  it('uses the Paris calendar even when the UTC date is still the previous day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T23:00:00Z'));
    expect(pharmacyToday()).toBe('2026-10-20');
    vi.useRealTimers();
  });
  it('shows only the known month precision from the source', () => {
    expect(formatPharmacyDate('2028-03-01', 'month')).toBe('03/2028');
    expect(formatPharmacyDate('2028-03-09')).toBe('09/03/2028');
    expect(formatPharmacyDate(null)).toBe('Non renseignée');
  });
  it('compares bare quantities and leaves incomparable packages for review', () => {
    expect(pharmacyStockStatus({ quantity: '4', required_quantity: '10' })).toBe('low');
    expect(pharmacyStockStatus({ quantity: '10', required_quantity: '4' })).toBe('ok');
    expect(pharmacyStockStatus({ quantity: '0,5', required_quantity: '1' })).toBe('low');
    for (const quantity of ['', '30x300mg', '4x5', '2 Boîtes', '100g']) {
      expect(pharmacyStockStatus({ quantity, required_quantity: '4' })).toBe('unknown');
    }
  });
  it('allows managers and captains to request edits, while sailors remain readers', () => {
    expect(canManagePharmacy(['admin'])).toBe(true);
    expect(canManagePharmacy(['direction'])).toBe(true);
    expect(canManagePharmacy(['armement'])).toBe(true);
    expect(canManagePharmacy(['capitaine'])).toBe(true);
    expect(canManagePharmacy(['marin'])).toBe(false);
    expect(blankPharmacyItem().expires_on).toBeNull();
  });
});

describe('pharmacy inventory grouping', () => {
  const item = (id: number, section: string, category: string): PharmacyItem => ({ ...blankPharmacyItem(), id, company_id: 1, vessel_id: 4, section, category, designation: `Article ${id}`, revision: 1, source_file: '', source_sheet: '', source_row: null, updated_at: '' });

  it('keeps sections in source order and sorts numbered categories naturally within each section', () => {
    const source = [item(1, 'MÉDICAMENTS', '10. DIVERS'), item(2, 'MATÉRIEL', '1. SOINS'),
      item(3, 'MÉDICAMENTS', '2. GASTRO'), item(4, 'MÉDICAMENTS', '1. CARDIOLOGIE'),
      item(5, 'MÉDICAMENTS', ''), item(6, 'MATÉRIEL', '2. GASTRO'), item(7, 'MÉDICAMENTS', '1. CARDIOLOGIE')];
    const groups = groupPharmacyItems(source);
    expect(groups.map(({ section, category }) => [section, category])).toEqual([
      ['MÉDICAMENTS', '1. CARDIOLOGIE'], ['MÉDICAMENTS', '2. GASTRO'], ['MÉDICAMENTS', '10. DIVERS'], ['MÉDICAMENTS', 'Sans catégorie'],
      ['MATÉRIEL', '1. SOINS'], ['MATÉRIEL', '2. GASTRO'],
    ]);
    expect(groups[0].items.map(({ id }) => id)).toEqual([4, 7]);
    expect(groups[1].items[0]).toBe(source[2]);
    expect(source.map(({ id }) => id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('keeps identical category names in different sections separate and avoids delimiter collisions', () => {
    const groups = groupPharmacyItems([item(1, 'Section A', '1. SOINS'), item(2, 'Section B', '1. SOINS'),
      item(3, 'A::B', 'C'), item(4, 'A', 'B::C')]);
    expect(groups).toHaveLength(4);
    expect(new Set(groups.map(({ key }) => key)).size).toBe(4);
    expect(groups.slice(0, 2).map(({ items }) => items.map(({ id }) => id))).toEqual([[1], [2]]);
  });

  it('labels blank categories consistently and handles an empty inventory', () => {
    const groups = groupPharmacyItems([item(1, '', ''), item(2, '', '   ')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe('Sans catégorie');
    expect(groups[0].items).toHaveLength(2);
    expect(groupPharmacyItems([])).toEqual([]);
  });
});
