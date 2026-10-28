import type { SupabaseClient } from '@supabase/supabase-js';
import { parseSeaOperationProjectDocuments, type SeaOperationProjectDocument } from '../seaOperations/seaOperationDocumentQueries';

export interface ProjectSeaOperationDocument extends SeaOperationProjectDocument {
  selected: boolean;
}

export interface ProjectSeaOperationDocumentSelection {
  configured: boolean;
  documents: ProjectSeaOperationDocument[];
}

function projectKey(projectId: number): string {
  if (!Number.isSafeInteger(projectId) || projectId <= 0) throw new Error('Le projet sélectionné est invalide.');
  return String(projectId);
}

function selection(data: unknown, key: string): ProjectSeaOperationDocumentSelection {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('La sélection documentaire reçue est invalide.');
  const row = data as Record<string, unknown>;
  if (typeof row.configured !== 'boolean' || !Array.isArray(row.documents)) throw new Error('La sélection documentaire reçue est invalide.');
  const documents = parseSeaOperationProjectDocuments(row.documents, key);
  const seen = new Set<string>();
  return {
    configured: row.configured,
    documents: documents.map((document, index) => {
      const selected = (row.documents as Record<string, unknown>[])[index].selected;
      if (typeof selected !== 'boolean' || seen.has(document.id)) throw new Error('La sélection documentaire reçue est invalide.');
      seen.add(document.id);
      return { ...document, selected };
    }),
  };
}

/** Management catalog, authorized by the Project permissions on the server. */
export async function fetchProjectSeaOperationDocuments(client: SupabaseClient, projectId: number): Promise<ProjectSeaOperationDocumentSelection> {
  const key = projectKey(projectId);
  const { data, error } = await client.rpc('project_sea_operation_documents', { p_project_id: key });
  if (error) throw error;
  return selection(data, key);
}

export async function saveProjectSeaOperationDocuments(client: SupabaseClient, projectId: number, documentIds: readonly string[]): Promise<ProjectSeaOperationDocumentSelection> {
  const key = projectKey(projectId);
  const seen = new Set<string>();
  for (const id of documentIds) {
    const match = /^(generated|project):([1-9][0-9]{0,18})$/.exec(id);
    if (!match || BigInt(match[2]) > 9223372036854775807n || seen.has(id)) throw new Error('La sélection des documents est invalide.');
    seen.add(id);
  }
  const { data, error } = await client.rpc('set_project_sea_operation_documents', { p_project_id: key, p_document_ids: [...documentIds] });
  if (error) throw error;
  return selection(data, key);
}
