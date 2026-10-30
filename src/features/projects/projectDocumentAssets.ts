import type { SupabaseClient } from '@supabase/supabase-js';
import { inferredDocumentMimeType } from '../documents/documentBlobStorage';
import { projectDriveStorage } from './projectDriveStorage';
import { getSharePointDocumentLinkState } from './projectDocuments';

export interface ProjectFileReference {
  fileName: string;
  storageBucket?: string;
  storagePath?: string;
  sharePointWebUrl?: string;
  mimeType?: string;
  fileSizeBytes?: number | null;
}
export type ProjectDocumentFileReference = ProjectFileReference;
export interface ProjectDownloadItem { id: string; file: ProjectFileReference; categoryLabel?: string }
export interface ProjectDocumentDownloadFailure { id: string; fileName: string; message: string }
export interface ProjectDocumentDownloadResult { fileName: string; count: number }

export class ProjectDocumentDownloadError extends Error {
  readonly failures: ProjectDocumentDownloadFailure[];
  constructor(failures: ProjectDocumentDownloadFailure[]) {
    super(`Téléchargement annulé : ${failures.length} document${failures.length > 1 ? 's' : ''} indisponible${failures.length > 1 ? 's' : ''}. ${failures.map(failure => `${failure.fileName} : ${failure.message}`).join(' ; ')}`);
    this.name = 'ProjectDocumentDownloadError';
    this.failures = failures;
  }
}

function errorMessage(error: unknown): string {
  return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message : 'Impossible de lire le fichier privé.';
}

function cancellable<T>(promise: PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  if (!signal) return Promise.resolve(promise);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason || new DOMException('Lecture annulée.', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** Read only through the existing authorized provider; passive thumbnails never launch the desktop connector. */
export async function loadProjectDocumentBlob(
  client: SupabaseClient,
  file: ProjectFileReference,
  signal?: AbortSignal,
  options?: { allowLocalDrive?: boolean },
): Promise<Blob> {
  signal?.throwIfAborted();
  let bucket = file.storageBucket || '';
  let path = file.storagePath || '';
  if (!bucket || !path) {
    const link = getSharePointDocumentLinkState(file.sharePointWebUrl || '');
    if (link.status !== 'available') throw new Error(link.status === 'invalid'
      ? 'La référence SharePoint de ce document est invalide ou non autorisée.'
      : 'Ce document ne possède aucune copie privée téléchargeable.');
    bucket = 'sharepoint'; path = link.href;
  }
  const result = await cancellable(projectDriveStorage(client, bucket).download(path, signal, { allowLocalDrive: options?.allowLocalDrive === true }), signal);
  signal?.throwIfAborted();
  if (result.error) throw new Error(errorMessage(result.error));
  if (!(result.data instanceof Blob) || !result.data.size) throw new Error('Le téléchargement du document est vide ou incomplet.');
  return result.data.type ? result.data : result.data.slice(0, result.data.size, file.mimeType || inferredDocumentMimeType(file.fileName));
}

function safeName(value: string, fallback: string): string {
  const cleaned = value.normalize('NFC').split('').filter(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127).join('')
    .replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '');
  const name = cleaned || fallback;
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ? `_${name}` : name;
}

function uniqueName(name: string, used: Set<string>): string {
  const normalized = (value: string) => value.normalize('NFKC').toLocaleLowerCase('fr');
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  let candidate = name;
  for (let index = 2; used.has(normalized(candidate)); index += 1) candidate = `${stem} (${index})${extension}`;
  used.add(normalized(candidate));
  return candidate;
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = fileName; anchor.hidden = true;
  document.body.append(anchor);
  try { anchor.click(); }
  finally { anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

/** All requested files must be readable before an original file or complete ZIP is saved. */
export async function downloadProjectFiles(
  client: SupabaseClient,
  items: readonly ProjectDownloadItem[],
  archiveName: string,
  signal?: AbortSignal,
): Promise<ProjectDocumentDownloadResult> {
  signal?.throwIfAborted();
  if (!items.length) throw new Error('Sélectionnez au moins un document à télécharger.');
  const loaded: Array<Blob | undefined> = new Array(items.length);
  const failed: Array<ProjectDocumentDownloadFailure | undefined> = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      const item = items[index];
      signal?.throwIfAborted();
      try { loaded[index] = await loadProjectDocumentBlob(client, item.file, signal, { allowLocalDrive: true }); }
      catch (error) {
        signal?.throwIfAborted();
        failed[index] = { id: item.id, fileName: item.file.fileName, message: errorMessage(error) };
      }
    }
  }));
  signal?.throwIfAborted();
  const failures = failed.filter((failure): failure is ProjectDocumentDownloadFailure => Boolean(failure));
  if (failures.length) throw new ProjectDocumentDownloadError(failures);
  if (items.length === 1) {
    const fileName = safeName(items[0].file.fileName, 'document');
    saveBlob(loaded[0]!, fileName);
    return { fileName, count: 1 };
  }
  const { default: JSZip } = await import('jszip');
  signal?.throwIfAborted();
  const archive = new JSZip();
  const used = new Set<string>();
  for (const [index, item] of items.entries()) {
    const fileName = uniqueName(safeName(item.file.fileName, `document-${index + 1}`), used);
    archive.file(fileName, new Uint8Array(await loaded[index]!.arrayBuffer()));
    signal?.throwIfAborted();
  }
  const blob = await cancellable(archive.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }), signal);
  signal?.throwIfAborted();
  const name = safeName(archiveName.replace(/\.zip$/i, ''), 'Documents du projet');
  const fileName = `${name}.zip`;
  saveBlob(blob, fileName);
  return { fileName, count: items.length };
}
