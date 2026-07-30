import { describe, expect, it } from 'vitest';
import { normalizeProjectStatus, PROJECT_STATUSES } from './projectStatus';

describe('project statuses', () => {
  it('exposes exactly the four canonical business statuses', () => {
    expect(PROJECT_STATUSES).toEqual(['Non validé', 'Validé', 'Stand-by météo', 'Facturé']);
  });

  it.each([
    [null, 'Non validé'],
    ['A planifier', 'Non validé'],
    ['Contrat Signé', 'Non validé'],
    ['En cours', 'Validé'],
    ['Valide', 'Validé'],
    ['standby meteo', 'Stand-by météo'],
    ['Facture', 'Facturé'],
    ['Annulé', 'Non validé'],
  ])('maps historical value %s to %s', (source, expected) => {
    expect(normalizeProjectStatus(source)).toBe(expected);
  });
});
