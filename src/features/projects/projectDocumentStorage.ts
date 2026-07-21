import type { SupabaseClient } from '@supabase/supabase-js';
import type { GeneratedProjectDocument } from './projectDocumentGeneration';
import type { ProjectGeneratedDocumentKind } from './projectDocumentTypes';

export interface StoredProjectDocument {
  fileName: string;
  folderPath: string;
  id: number;
  webUrl: string;
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
