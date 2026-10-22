import type { SupabaseClient } from '@supabase/supabase-js';
import { getSharePointDocumentLinkState } from '../projects/projectDocuments';

export interface SeaOperationProjectDocument {
  id: string;
  projectId: string;
  title: string;
  fileName: string;
  mimeType: string;
  categoryLabel: string;
  subcategoryLabel: string;
  createdAt: string;
  expiresOn: string | null;
}

function projectKey(value: string): string {
  if (!/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) {
    throw new Error('Le projet sélectionné est invalide.');
  }
  return value;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('La réponse des documents du projet est invalide.');
  return value as Record<string, unknown>;
}

function requiredText(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('La réponse des documents du projet est invalide.');
  return value;
}

/** Only the server projects the selected project's operational document metadata. */
export async function fetchSeaOperationProjectDocuments(client: SupabaseClient, projectId: string): Promise<SeaOperationProjectDocument[]> {
  const key = projectKey(projectId);
  const { data, error } = await client.rpc('sea_operation_project_documents', { p_project_id: key });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('La réponse des documents du projet est invalide.');
  return data.map((value) => {
    const row = object(value);
    const id = requiredText(row.id);
    if (!/^(generated|project):[1-9][0-9]*$/.test(id) || String(row.project_id) !== key
      || typeof row.subcategory_label !== 'string' || row.expires_on !== null && typeof row.expires_on !== 'string') {
      throw new Error('La réponse des documents du projet est invalide.');
    }
    return {
      id, projectId: key, title: requiredText(row.title), fileName: requiredText(row.file_name), mimeType: requiredText(row.mime_type),
      categoryLabel: requiredText(row.category_label), subcategoryLabel: row.subcategory_label,
      createdAt: requiredText(row.created_at), expiresOn: row.expires_on,
    };
  });
}

/** Reauthorize every opening; never use a saved SharePoint URL or a cached access URL. */
export async function createSeaOperationProjectDocumentUrl(client: SupabaseClient, projectId: string, documentId: string): Promise<string> {
  const key = projectKey(projectId);
  if (!/^(generated|project):[1-9][0-9]{0,18}$/.test(documentId)) throw new Error('Le document sélectionné est invalide.');
  const { data, error } = await client.rpc('sea_operation_project_document_access', { p_project_id: key, p_document_id: documentId });
  if (error) throw error;
  const location = object(data);
  if ('sharepoint_url' in location) {
    const link = getSharePointDocumentLinkState(requiredText(location.sharepoint_url));
    if (link.status !== 'available') throw new Error('L’accès sécurisé au document est invalide.');
    return link.href;
  }
  const path = requiredText(location.path);
  if (location.bucket !== 'project-files' && location.bucket !== 'project-drive'
    || location.bucket === 'project-files' && !path.startsWith(`projects/${key}/`)
    || location.bucket === 'project-drive' && !/^[1-9][0-9]*$/.test(path)
    // eslint-disable-next-line no-control-regex -- Storage locations must not contain traversal or control characters.
    || /[\\\u0000-\u001f\u007f]/.test(path) || /(^|\/)\.\.?($|\/)/.test(path)) {
    throw new Error('L’accès sécurisé au document est invalide.');
  }
  const signed = await client.storage.from(location.bucket).createSignedUrl(path, 300);
  if (signed.error) throw signed.error;
  const url = signed.data?.signedUrl;
  if (typeof url !== 'string' || !/^(https?:\/\/|blob:|\/(?!\/))/.test(url)) throw new Error('Le lien sécurisé du document est indisponible.');
  return url;
}
