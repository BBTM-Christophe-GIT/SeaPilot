import { describe, expect, it } from 'vitest';
import {
  cloneDefaultProjectDocumentCategories,
  projectDocumentCategorySnapshot,
  validateProjectDocumentCategories,
} from './projectDocumentCategories';

describe('projectDocumentCategories', () => {
  it('provides the requested editable category hierarchy', () => {
    const categories = cloneDefaultProjectDocumentCategories();
    const roots = categories.filter((category) => category.parentKey === null);

    expect(roots.map((category) => category.label)).toEqual([
      'Offre Commerciale',
      'HSE',
      'Facturation',
    ]);
    expect(categories.filter((category) => category.parentKey === 'commercial_offer').map((category) => category.label))
      .toEqual(['Contrat', 'Prestation annexe']);
    expect(categories.filter((category) => category.parentKey === 'hse').map((category) => category.label))
      .toEqual(['Procédure', 'Comptes Rendus', 'KPI', 'Audits']);
  });

  it('rejects blank, duplicated and orphaned editable categories', () => {
    const categories = cloneDefaultProjectDocumentCategories();
    categories.push({ active: true, displayOrder: 40, key: 'blank', label: ' ', parentKey: null });
    categories.push({ active: true, displayOrder: 41, key: 'duplicate', label: 'HSE', parentKey: null });
    categories.push({ active: true, displayOrder: 42, key: 'orphan', label: 'Orpheline', parentKey: 'missing' });

    expect(validateProjectDocumentCategories(categories)).toEqual(expect.arrayContaining([
      'Chaque catégorie et sous-catégorie doit avoir un nom.',
      'Le nom « HSE » est utilisé plusieurs fois au même niveau.',
      'La catégorie parente de « Orpheline » est introuvable.',
    ]));
  });

  it('creates a stable snapshot without sharing mutable defaults', () => {
    const first = cloneDefaultProjectDocumentCategories();
    const second = cloneDefaultProjectDocumentCategories();
    first[0].label = 'Modifiée';

    expect(second[0].label).toBe('Offre Commerciale');
    expect(projectDocumentCategorySnapshot(first)).not.toBe(projectDocumentCategorySnapshot(second));
  });
});
