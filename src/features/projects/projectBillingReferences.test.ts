import { describe, expect, it } from 'vitest';
import { billingReferenceScope, billingReferenceScopeLabel } from './projectBillingReferences';

describe('billing reference contents', () => {
  it('preserves existing scopes when raw billing is absent or excluded', () => {
    expect(billingReferenceScope({})).toBe(7);
    expect(billingReferenceScope({ includeRawInPdf: false })).toBe(7);
    expect(billingReferenceScope({ includeExpensesInPdf: false })).toBe(5);
  });

  it('distinguishes raw billing from the previous PDF contents', () => {
    expect(billingReferenceScope({ includeRawInPdf: true })).toBe(15);
    expect(billingReferenceScope({ includeOperationsInPdf: false, includeExpensesInPdf: false, includeBbtmInPdf: false, includeRawInPdf: true })).toBe(8);
    expect(billingReferenceScopeLabel(15)).toBe('Loyers + Frais fournisseurs + Prestations BBTM + Saisie brute');
    expect(billingReferenceScopeLabel(8)).toBe('Saisie brute');
  });
});
