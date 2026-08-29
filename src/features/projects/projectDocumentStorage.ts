import type { SupabaseClient } from '@supabase/supabase-js';
import type { GeneratedProjectDocument } from './projectDocumentGeneration';
import type { ProjectGeneratedDocumentKind } from './projectDocumentTypes';

export interface StoredProjectDocument {
  fileName: string;
  folderPath: string;
  id: number;
  storageBucket?: string;
  storagePath?: string;
  webUrl: string;
}

export interface OperationDocumentUploadResult {
  failed: Array<{ fileName: string; message: string }>;
  stored: StoredProjectDocument[];
}

export interface ProjectAttachmentDraft {
  categoryKey: string;
  expiresOn: string;
  file: File;
  id: string;
  subcategoryKey: string | null;
}

export interface ProjectAttachmentUploadResult {
  failed: Array<{ draftId: string; fileName: string; message: string }>;
  stored: Array<StoredProjectDocument & { draftId: string }>;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

const PROJECT_FILES_BUCKET = 'project-files';

function storageSafeSegment(value: string, fallback: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return normalized || fallback;
}

export async function createProjectDocumentAccessUrl(
  client: SupabaseClient,
  document: {
    sharePointWebUrl?: string;
    storageBucket?: string;
    storagePath?: string;
  },
): Promise<string> {
  if (document.storageBucket && document.storagePath) {
    const { data, error } = await client.storage
      .from(document.storageBucket)
      .createSignedUrl(document.storagePath, 300);
    if (error) throw new Error(error.message || 'Impossible de préparer l’accès au document Supabase.');
    if (!data?.signedUrl) throw new Error('Supabase n’a pas retourné de lien sécurisé pour ce document.');
    return data.signedUrl;
  }
  if (document.sharePointWebUrl) return document.sharePointWebUrl;
  throw new Error('Ce document ne possède aucun emplacement de stockage exploitable.');
}

export async function storeGeneratedProjectDocument(
  client: SupabaseClient,
  input: {
    document: GeneratedProjectDocument;
    documentType: ProjectGeneratedDocumentKind;
    planningOccurrenceId?: number | null;
    projectId: number;
    revision?: number;
  },
): Promise<StoredProjectDocument> {
  const buffer = await input.document.blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  const { data, error } = await client.functions.invoke('project-document-upload', {
    body: {
      base64Content: bytesToBase64(bytes),
      documentType: input.documentType,
      fileName: input.document.fileName,
      mimeType: input.document.mimeType,
      planningOccurrenceId: input.planningOccurrenceId || null,
      projectId: input.projectId,
      revision: input.revision || 1,
      sha256: bytesToHex(digest),
    },
  });

  if (error) {
    const context = await error.context?.json().catch(() => null) as { message?: string } | null;
    throw new Error(context?.message || 'Le document n’a pas pu être enregistré dans SharePoint.');
  }

  const document = (data as { document?: StoredProjectDocument } | null)?.document;
  if (!document?.webUrl) throw new Error('SharePoint n’a pas retourné le lien du document enregistré.');
  return document;
}

export async function storeOperationDocument(
  client: SupabaseClient,
  input: {
    file: File;
    planningOccurrenceId: number;
    projectId: number;
  },
): Promise<StoredProjectDocument> {
  const buffer = await input.file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  const { data, error } = await client.functions.invoke('project-document-upload', {
    body: {
      base64Content: bytesToBase64(bytes),
      documentType: 'operation_attachment',
      fileName: input.file.name,
      mimeType: input.file.type || 'application/octet-stream',
      planningOccurrenceId: input.planningOccurrenceId,
      projectId: input.projectId,
      revision: 1,
      sha256: bytesToHex(digest),
    },
  });

  if (error) {
    const context = await error.context?.json().catch(() => null) as { message?: string } | null;
    throw new Error(context?.message || `Le document ${input.file.name} n’a pas pu être enregistré dans SharePoint.`);
  }

  const document = (data as { document?: StoredProjectDocument } | null)?.document;
  if (!document?.webUrl) throw new Error(`SharePoint n’a pas retourné le lien de ${input.file.name}.`);
  return document;
}

export async function storeOperationDocuments(
  client: SupabaseClient,
  input: {
    files: File[];
    planningOccurrenceId: number;
    projectId: number;
  },
): Promise<OperationDocumentUploadResult> {
  const result: OperationDocumentUploadResult = { failed: [], stored: [] };

  for (const file of input.files) {
    try {
      result.stored.push(await storeOperationDocument(client, { ...input, file }));
    } catch (error) {
      result.failed.push({
        fileName: file.name,
        message: error instanceof Error ? error.message : 'Échec du classement SharePoint.',
      });
    }
  }

  return result;
}

export async function storeProjectAttachment(
  client: SupabaseClient,
  input: {
    draft: ProjectAttachmentDraft;
    projectId: number;
  },
): Promise<StoredProjectDocument> {
  const buffer = await input.draft.file.arrayBuffer();
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  const mimeType = input.draft.file.type || 'application/octet-stream';
  const categoryPath = storageSafeSegment(input.draft.categoryKey, 'categorie');
  const subcategoryPath = storageSafeSegment(input.draft.subcategoryKey || 'documents', 'documents');
  const fileName = storageSafeSegment(input.draft.file.name, 'document');
  const storagePath = [
    'projects',
    String(input.projectId),
    'attachments',
    categoryPath,
    subcategoryPath,
    `${crypto.randomUUID()}-${fileName}`,
  ].join('/');

  const storage = client.storage.from(PROJECT_FILES_BUCKET);
  const { error: uploadError } = await storage.upload(storagePath, input.draft.file, {
    cacheControl: '3600',
    contentType: mimeType,
    upsert: false,
  });
  if (uploadError) {
    throw new Error(uploadError.message || `Le document ${input.draft.file.name} n’a pas pu être envoyé vers Supabase.`);
  }

  try {
    const { data, error } = await client.rpc('projects_register_storage_attachment', {
      target_bucket: PROJECT_FILES_BUCKET,
      target_category_key: input.draft.categoryKey,
      target_expires_on: input.draft.expiresOn || null,
      target_file_name: input.draft.file.name,
      target_file_size_bytes: input.draft.file.size,
      target_mime_type: mimeType,
      target_path: storagePath,
      target_project_id: input.projectId,
      target_sha256: bytesToHex(digest),
      target_subcategory_key: input.draft.subcategoryKey,
    });
    if (error) {
      throw new Error(error.message || `Le document ${input.draft.file.name} n’a pas pu être rattaché au projet.`);
    }
    const documentId = Number(data);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      throw new Error(`Supabase n’a pas confirmé le rattachement de ${input.draft.file.name}.`);
    }
    return {
      fileName: input.draft.file.name,
      folderPath: storagePath.slice(0, storagePath.lastIndexOf('/')),
      id: documentId,
      storageBucket: PROJECT_FILES_BUCKET,
      storagePath,
      webUrl: '',
    };
  } catch (error) {
    await storage.remove([storagePath]).catch(() => undefined);
    throw error;
  }
}

export async function storeProjectAttachments(
  client: SupabaseClient,
  input: {
    drafts: ProjectAttachmentDraft[];
    projectId: number;
  },
): Promise<ProjectAttachmentUploadResult> {
  const result: ProjectAttachmentUploadResult = { failed: [], stored: [] };

  for (const draft of input.drafts) {
    try {
      result.stored.push({
        ...await storeProjectAttachment(client, { draft, projectId: input.projectId }),
        draftId: draft.id,
      });
    } catch (error) {
      result.failed.push({
        draftId: draft.id,
        fileName: draft.file.name,
        message: error instanceof Error ? error.message : 'Échec de l’enregistrement dans Supabase.',
      });
    }
  }

  return result;
}
