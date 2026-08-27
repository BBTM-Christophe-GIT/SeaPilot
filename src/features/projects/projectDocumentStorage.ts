import type { SupabaseClient } from '@supabase/supabase-js';
import type { GeneratedProjectDocument } from './projectDocumentGeneration';
import type { ProjectGeneratedDocumentKind } from './projectDocumentTypes';

export interface StoredProjectDocument {
  fileName: string;
  folderPath: string;
  id: number;
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
  const bytes = new Uint8Array(buffer);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  const { data, error } = await client.functions.invoke('project-document-upload', {
    body: {
      base64Content: bytesToBase64(bytes),
      categoryKey: input.draft.categoryKey,
      documentType: 'project_attachment',
      expiresOn: input.draft.expiresOn || null,
      fileName: input.draft.file.name,
      mimeType: input.draft.file.type || 'application/octet-stream',
      planningOccurrenceId: null,
      projectId: input.projectId,
      revision: 1,
      sha256: bytesToHex(digest),
      subcategoryKey: input.draft.subcategoryKey,
    },
  });

  if (error) {
    const context = await error.context?.json().catch(() => null) as { message?: string } | null;
    throw new Error(context?.message || `Le document ${input.draft.file.name} n’a pas pu être enregistré dans SharePoint.`);
  }

  const document = (data as { document?: StoredProjectDocument } | null)?.document;
  if (!document?.webUrl) throw new Error(`SharePoint n’a pas retourné le lien de ${input.draft.file.name}.`);
  return document;
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
        message: error instanceof Error ? error.message : 'Échec du classement SharePoint.',
      });
    }
  }

  return result;
}
