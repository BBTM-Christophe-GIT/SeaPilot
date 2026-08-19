import { describe, expect, it } from 'vitest';
import { FLEET_CERTIFICATE_CATEGORY_CATALOG, getFleetCertificateCategoryOptions } from './fleetCertificateCategories';

describe('fleet certificate categories', () => {
  it('contains the requested parent categories and subcategories', () => {
    expect(FLEET_CERTIFICATE_CATEGORY_CATALOG.map((category) => category.label)).toEqual([
      '06 - Incendie',
      '06.1 - Extincteurs portatifs',
      '06.2 - Extinction fixe',
      '06.3 - Tenue de pompier, ARI',
      '07 - LSA',
      '07.1 - Radeaux / HRU',
      '07.2 - Life Jacket',
      '07.3 - Combinaison de survie',
      '07.4 - GMDSS',
      '07.5 - Personal Locator Beacon, AIS',
      '07.6 - Pyrotechnie',
      '07.7 - Lance Amarre',
      '07.8 - Bouée, Feux à retournement et MOB',
      '07.9 - Défibrilateur',
      '08 - Levage',
      '08.1 - Grue',
      '08.2 - Bossoir',
      '08.3 - Accessoires de levage',
      '08.4 - Treuils',
      '08.5 - Remorques',
      '15 - Dotation Médicale',
      '16 - Registre des produits dangereux',
      '16.1 - Liste des produits Dangereux',
      '16.2 - Fiches de Donnée de Sécurité',
    ]);
  });

  it('keeps existing categories and normalizes the former lifting label', () => {
    const options = getFleetCertificateCategoryOptions([
      { categoryKey: '02-securite', categoryLabel: '02 - Centre de Sécurité des Navires' },
      { categoryKey: '08-grue-et-bossoir', categoryLabel: '08 - Grue & Bossoir' },
      { categoryKey: '10-dotation-medicale', categoryLabel: '10 - Dotation Médicale' },
    ]);

    expect(options).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: '02-securite', label: '02 - Centre de Sécurité des Navires' }),
      expect.objectContaining({ key: '08-levage', label: '08 - Levage' }),
      expect.objectContaining({ key: '10-dotation-medicale', label: '10 - Dotation Médicale' }),
      expect.objectContaining({ key: '15-dotation-medicale', label: '15 - Dotation Médicale' }),
    ]));
    expect(options.some((category) => category.key === '08-grue-et-bossoir')).toBe(false);
  });
});
