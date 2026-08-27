import type { SupabaseClient } from '@supabase/supabase-js';

export interface ProjectDocumentCategory {
  active: boolean;
  displayOrder: number;
  key: string;
  label: string;
  parentKey: string | null;
}

interface ProjectDocumentCategoryRow {
  active: boolean | null;
  category_key: string;
  display_order: number | null;
  label: string;
  parent_key: string | null;
}

export const DEFAULT_PROJECT_DOCUMENT_CATEGORIES: readonly ProjectDocumentCategory[] = [
  { active: true, displayOrder: 10, key: 'commercial_offer', label: 'Offre Commerciale', parentKey: null },
  { active: true, displayOrder: 11, key: 'commercial_contract', label: 'Contrat', parentKey: 'commercial_offer' },
  { active: true, displayOrder: 12, key: 'commercial_appendix', label: 'Prestation annexe', parentKey: 'commercial_offer' },
  { active: true, displayOrder: 20, key: 'hse', label: 'HSE', parentKey: null },
  { active: true, displayOrder: 21, key: 'hse_procedure', label: 'Procédure', parentKey: 'hse' },
  { active: true, displayOrder: 22, key: 'hse_minutes', label: 'Comptes Rendus', parentKey: 'hse' },
  { active: true, displayOrder: 23, key: 'hse_kpi', label: 'KPI', parentKey: 'hse' },
  { active: true, displayOrder: 24, key: 'hse_audits', label: 'Audits', parentKey: 'hse' },
  { active: true, displayOrder: 30, key: 'billing', label: 'Facturation', parentKey: null },
] as const;

export function cloneDefaultProjectDocumentCategories(): ProjectDocumentCategory[] {
  return DEFAULT_PROJECT_DOCUMENT_CATEGORIES.map((category) => ({ ...category }));
}

export async function fetchProjectDocumentCategories(
  client: SupabaseClient,
): Promise<ProjectDocumentCategory[]> {
  const { data, error } = await client
    .from('project_document_categories')
    .select('category_key,parent_key,label,display_order,active')
    .eq('active', true)
    .order('display_order', { ascending: true });
  if (error) throw new Error(error.message || 'Impossible de charger les catégories documentaires.');
  return ((data || []) as ProjectDocumentCategoryRow[]).map((row) => ({
    active: row.active ?? true,
    displayOrder: Number(row.display_order) || 0,
    key: row.category_key,
    label: row.label,
    parentKey: row.parent_key,
  }));
}

export function validateProjectDocumentCategories(categories: ProjectDocumentCategory[]): string[] {
  const errors: string[] = [];
  const activeCategories = categories.filter((category) => category.active);
  const keys = new Set(activeCategories.map((category) => category.key));
  const normalizedLabels = new Set<string>();
  activeCategories.forEach((category) => {
    const label = category.label.trim();
    if (!label) errors.push('Chaque catégorie et sous-catégorie doit avoir un nom.');
    const labelKey = `${category.parentKey || 'root'}:${label.toLocaleLowerCase('fr')}`;
    if (normalizedLabels.has(labelKey)) errors.push(`Le nom « ${label} » est utilisé plusieurs fois au même niveau.`);
    normalizedLabels.add(labelKey);
    if (category.parentKey && !keys.has(category.parentKey)) {
      errors.push(`La catégorie parente de « ${label} » est introuvable.`);
    }
  });
  return [...new Set(errors)];
}

export async function saveProjectDocumentCategories(
  client: SupabaseClient,
  categories: ProjectDocumentCategory[],
): Promise<void> {
  const validationErrors = validateProjectDocumentCategories(categories);
  if (validationErrors.length > 0) throw new Error(validationErrors.join(' '));
  const { error } = await client.rpc('projects_save_document_categories', {
    target_categories: categories.map((category) => ({
      active: category.active,
      category_key: category.key,
      display_order: category.displayOrder,
      label: category.label.trim(),
      parent_key: category.parentKey,
    })),
  });
  if (error) throw new Error(error.message || 'Impossible d’enregistrer les catégories documentaires.');
}

export function projectDocumentCategorySnapshot(categories: ProjectDocumentCategory[]): string {
  return JSON.stringify(categories.map((category) => ({
    active: category.active,
    displayOrder: category.displayOrder,
    key: category.key,
    label: category.label.trim(),
    parentKey: category.parentKey,
  })));
}

export function newProjectDocumentCategoryKey(prefix: 'category' | 'subcategory'): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}
