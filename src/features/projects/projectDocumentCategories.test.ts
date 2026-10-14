import { describe, expect, it, vi } from 'vitest';
import {
  cloneDefaultProjectDocumentCategories,
  fetchProjectDocumentCategories,
  projectDocumentCategorySnapshot,
  saveProjectDocumentCategories,
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
      'Toilette de Mer',
    ]);
    expect(categories.filter((category) => category.parentKey === 'commercial_offer').map((category) => category.label))
      .toEqual(['Contrat', 'Prestation annexe']);
    expect(categories.filter((category) => category.parentKey === 'hse').map((category) => category.label))
      .toEqual(['Procédure', 'Comptes Rendus', 'KPI', 'Audits']);
    expect(categories.filter((category) => category.parentKey === 'toilette_de_mer').map((category) => category.label))
      .toEqual(['Attestation Expert/BV']);
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

  it('loads retired category labels by default and can request only upload choices', async () => {
    const order = vi.fn().mockResolvedValue({ data: [
      { active: false, category_key: 'retired', display_order: 5, label: 'Ancienne', parent_key: null },
      { active: true, category_key: 'current', display_order: 10, label: 'Actuelle', parent_key: null },
    ], error: null });
    const query = { eq: vi.fn().mockReturnThis(), order };
    const client = { from: vi.fn(() => ({ select: vi.fn(() => query) })) };
    const categories = await fetchProjectDocumentCategories(client as never);
    expect(categories).toEqual([
      { active: false, key: 'retired', displayOrder: 5, label: 'Ancienne', parentKey: null },
      { active: true, key: 'current', displayOrder: 10, label: 'Actuelle', parentKey: null },
    ]);
    expect(query.eq).not.toHaveBeenCalled();
    await fetchProjectDocumentCategories(client as never, { includeInactive: false });
    expect(query.eq).toHaveBeenCalledWith('active', true);
    expect(order).toHaveBeenCalledWith('display_order', { ascending: true });
  });

  it('rejects duplicate keys and nested or cyclic hierarchies, including retired rows', () => {
    const categories = [
      { active: false, displayOrder: 0, key: 'root', label: 'Ancienne', parentKey: 'child' },
      { active: false, displayOrder: 1, key: 'child', label: 'Ancienne sous-catégorie', parentKey: 'root' },
      { active: false, displayOrder: 2, key: 'child', label: 'Autre', parentKey: null },
    ];
    expect(validateProjectDocumentCategories(categories)).toEqual(expect.arrayContaining([
      'Chaque catégorie doit avoir une clé valide et unique.',
      'Les sous-catégories doivent dépendre directement d’une catégorie principale.',
    ]));
  });

  it('can retire every choice while retaining a valid historical hierarchy', async () => {
    const categories = cloneDefaultProjectDocumentCategories().map((category) => ({ ...category, active: false }));
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await saveProjectDocumentCategories({ rpc } as never, categories);
    expect(rpc).toHaveBeenCalledWith('projects_save_document_categories', {
      target_categories: categories.map((category) => ({
        active: false, category_key: category.key, display_order: category.displayOrder,
        label: category.label, parent_key: category.parentKey,
      })),
    });
  });

  it('rejects invalid keys, missing parents and invalid order before writing', async () => {
    const rpc = vi.fn();
    await expect(saveProjectDocumentCategories({ rpc } as never, [{
      active: true, displayOrder: 1.5, key: 'INVALID/key', label: 'Fichier', parentKey: 'missing',
    }])).rejects.toThrow('clé valide');
    expect(rpc).not.toHaveBeenCalled();
    expect(validateProjectDocumentCategories([])).toEqual(['Conservez au moins une catégorie, même désactivée.']);
  });

  it('does not treat a failed catalog read or save as success', async () => {
    const read = { from: () => ({ select: () => ({ order: async () => ({ data: null, error: { message: 'Lecture refusée' } }) }) }) };
    await expect(fetchProjectDocumentCategories(read as never)).rejects.toThrow('Lecture refusée');
    await expect(saveProjectDocumentCategories({ rpc: async () => ({ error: { message: 'Écriture refusée' } }) } as never,
      cloneDefaultProjectDocumentCategories())).rejects.toThrow('Écriture refusée');
  });
});
