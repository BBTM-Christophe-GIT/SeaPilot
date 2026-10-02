import type { SupabaseClient } from '@supabase/supabase-js';
import { createProcedureFileStore } from '../procedures/procedureDriveFiles';
import { fetchPublishedProcedures, getProcedureFileUrl, type PublishedProcedureRecord } from '../procedures/procedureQueries';
import type { QhsePolicySnapshot } from './qhsePolicyModel';
import { policyPublicationLabel, resolvePolicyPublication } from './qhsePolicyDocumentModel';

export async function readQhsePolicyPublication(client: SupabaseClient, publication: PublishedProcedureRecord, signal?: AbortSignal): Promise<Blob> {
  let blob: Blob;
  if (publication.googleDrivePath) {
    blob = await createProcedureFileStore(client).read(publication);
  } else {
    const url = await getProcedureFileUrl(client, publication, 'open');
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('Le PDF de la politique est indisponible. Réessayez.');
    blob = await response.blob();
  }
  if (signal?.aborted) throw new DOMException('Lecture annulée.', 'AbortError');
  if ((await blob.slice(0, 5).text()) !== '%PDF-') throw new Error('Le fichier sélectionné ne contient pas un PDF valide.');
  return blob;
}

export async function readQhsePolicyDocument(client: SupabaseClient, settings: QhsePolicySnapshot['settings']): Promise<{ blob: Blob; title: string; fileName: string }> {
  if (settings?.documentUrl) throw new Error('Sélectionnez une politique dans la liste des fichiers PDF avant de compiler le rapport.');
  const publication = resolvePolicyPublication(await fetchPublishedProcedures(client), settings?.publicationId ?? null);
  if (!publication) throw new Error('Aucun PDF de politique publié et accessible. Sélectionnez la politique avant de compiler le rapport.');
  return { blob: await readQhsePolicyPublication(client, publication), title: policyPublicationLabel(publication), fileName: publication.fileName };
}
