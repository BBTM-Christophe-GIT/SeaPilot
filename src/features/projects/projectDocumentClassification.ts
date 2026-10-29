import type { SupabaseClient } from '@supabase/supabase-js';

export interface ProjectDocumentClassification {
  projectId: number;
  documentId: string;
  categoryKey: string;
  subcategoryKey: string | null;
}

export interface ProjectDocumentClassificationInput extends ProjectDocumentClassification {
  expectedCategoryKey: string | null;
  expectedSubcategoryKey: string | null;
}

const categoryPattern = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const nullableKey = (value: string | null) => value?.trim() || null;

/** Reclassify one document without moving or replacing its file. */
export async function saveProjectDocumentClassification(
  client: SupabaseClient,
  input: ProjectDocumentClassificationInput,
): Promise<ProjectDocumentClassification> {
  const document = typeof input.documentId === 'string' ? /^(generated|project|contract):([1-9][0-9]{0,18})$/.exec(input.documentId) : null;
  if (!Number.isSafeInteger(input.projectId) || input.projectId <= 0 || !document
    || BigInt(document[2]) > 9223372036854775807n || typeof input.categoryKey !== 'string' || !categoryPattern.test(input.categoryKey)
    || (input.subcategoryKey !== null && (typeof input.subcategoryKey !== 'string' || !categoryPattern.test(input.subcategoryKey)))
    || (input.expectedCategoryKey !== null && typeof input.expectedCategoryKey !== 'string')
    || (input.expectedSubcategoryKey !== null && typeof input.expectedSubcategoryKey !== 'string')) {
    throw new Error('Le classement du document est invalide.');
  }
  const { data, error } = await client.rpc('projects_set_document_category', {
    target_project_id: String(input.projectId),
    target_document_id: input.documentId,
    target_category_key: input.categoryKey,
    target_subcategory_key: nullableKey(input.subcategoryKey),
    target_expected_category_key: nullableKey(input.expectedCategoryKey),
    target_expected_subcategory_key: nullableKey(input.expectedSubcategoryKey),
  });
  if (error) throw Object.assign(new Error(error.message || 'Impossible de modifier le classement du document.'), { code: error.code });
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Le classement enregistré n’a pas été confirmé.');
  const row = data as Record<string, unknown>;
  if (row.project_id !== String(input.projectId) || row.document_id !== input.documentId
    || row.category_key !== input.categoryKey || row.subcategory_key !== nullableKey(input.subcategoryKey)) {
    throw new Error('Le classement enregistré ne correspond pas au document sélectionné.');
  }
  return { projectId: input.projectId, documentId: input.documentId, categoryKey: input.categoryKey,
    subcategoryKey: row.subcategory_key as string | null };
}
