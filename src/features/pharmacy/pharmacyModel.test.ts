import { describe, expect, it, vi } from 'vitest';
import { blankPharmacyItem, canManagePharmacy, formatPharmacyDate, pharmacyDaysUntil, pharmacyExpiryStatus, pharmacyStockStatus, pharmacyToday } from './pharmacyModel';

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
