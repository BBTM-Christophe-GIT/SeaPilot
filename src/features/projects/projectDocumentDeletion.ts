import type { SupabaseClient } from '@supabase/supabase-js';

export interface ProjectDocumentDeletionExpected {
  fileName: string;
  categoryKey: string | null;
  subcategoryKey: string | null;
  storageBucket: string | null;
  storagePath: string | null;
  sourceUrl: string | null;
  fileSizeBytes: number | null;
  modifiedAt: string | null;
}
export interface ProjectDocumentDeletionTarget { projectId: number; documentId: string }
export interface ProjectDocumentDeletionInput extends ProjectDocumentDeletionTarget { expected: ProjectDocumentDeletionExpected }
export interface ProjectDocumentDeletionResult extends ProjectDocumentDeletionTarget { deletedAt: string }

function validTarget(input: ProjectDocumentDeletionTarget): boolean {
  const document = typeof input.documentId === 'string' ? /^(generated|project|contract):([1-9][0-9]{0,18})$/.exec(input.documentId) : null;
  return Number.isSafeInteger(input.projectId) && input.projectId > 0 && Boolean(document && BigInt(document[2]) <= 9223372036854775807n);
}
const nullableText = (value: unknown): value is string | null => value === null || typeof value === 'string' && value.length <= 4000;
function validExpected(value: unknown): value is ProjectDocumentDeletionExpected {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.fileName === 'string' && Boolean(item.fileName.trim()) && item.fileName.length <= 4000
    && ['categoryKey', 'subcategoryKey', 'storageBucket', 'storagePath', 'sourceUrl'].every(key => nullableText(item[key]))
    && (item.fileSizeBytes === null || typeof item.fileSizeBytes === 'number' && Number.isSafeInteger(item.fileSizeBytes) && item.fileSizeBytes >= 0)
    && (item.modifiedAt === null || typeof item.modifiedAt === 'string' && Number.isFinite(Date.parse(item.modifiedAt)));
}
function writeError(error: { message?: string; code?: string }): Error {
  return Object.assign(new Error(error.message || 'Impossible de supprimer ce document du projet.'), { code: error.code });
}
function acknowledgement(data: unknown, input: ProjectDocumentDeletionTarget): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('La réponse documentaire du serveur n’a pas été confirmée.');
  const row = data as Record<string, unknown>;
  if (row.project_id !== String(input.projectId) || row.document_id !== input.documentId) throw new Error('La réponse du serveur ne correspond pas au document sélectionné.');
  return row;
}

/** Obtain an authoritative version for confirmation; the server requires a current project manager. */
export async function fetchProjectDocumentDeletionSnapshot(client: SupabaseClient, input: ProjectDocumentDeletionTarget): Promise<ProjectDocumentDeletionInput> {
  if (!validTarget(input)) throw new Error('La référence du document est invalide.');
  const { data, error } = await client.rpc('projects_document_deletion_snapshot', { target_project_id: String(input.projectId), target_document_id: input.documentId });
  if (error) throw writeError(error);
  const row = acknowledgement(data, input);
  const snapshot = row.expected_document;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new Error('La version du document n’a pas été confirmée.');
  const raw = snapshot as Record<string, unknown>;
  const expected = { fileName: raw.file_name, categoryKey: raw.category_key, subcategoryKey: raw.subcategory_key,
    storageBucket: raw.storage_bucket, storagePath: raw.storage_path, sourceUrl: raw.source_url,
    fileSizeBytes: raw.file_size_bytes, modifiedAt: raw.modified_at };
  if (!validExpected(expected)) throw new Error('La version du document reçue est invalide.');
  return { ...input, expected };
}

/** Hide exactly the confirmed document; neither source bytes nor shared storage mappings are removed. */
export async function deleteProjectDocument(client: SupabaseClient, input: ProjectDocumentDeletionInput): Promise<ProjectDocumentDeletionResult> {
  if (!validTarget(input) || !validExpected(input.expected)) throw new Error('La suppression du document est invalide.');
  const value = input.expected;
  const { data, error } = await client.rpc('projects_delete_document', {
    target_project_id: String(input.projectId), target_document_id: input.documentId,
    target_expected_document: { file_name: value.fileName, category_key: value.categoryKey, subcategory_key: value.subcategoryKey,
      storage_bucket: value.storageBucket, storage_path: value.storagePath, source_url: value.sourceUrl,
      file_size_bytes: value.fileSizeBytes, modified_at: value.modifiedAt },
  });
  if (error) throw writeError(error);
  const row = acknowledgement(data, input);
  if (typeof row.deleted_at !== 'string' || !Number.isFinite(Date.parse(row.deleted_at))) throw new Error('La suppression du document n’a pas été confirmée.');
  return { projectId: input.projectId, documentId: input.documentId, deletedAt: row.deleted_at };
}
