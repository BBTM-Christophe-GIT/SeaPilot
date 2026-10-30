import type { SupabaseClient } from '@supabase/supabase-js';
import type { PDFDocument } from 'pdf-lib';
import type { ProjectBillingDocument } from './projectBilling';
import { projectDriveStorage } from './projectDriveStorage';

export interface BillingAttachmentIssue {
  documentId: number;
  fileName: string;
  status: 'missing' | 'invalid' | 'unavailable';
  message: string;
}

export interface BillingAttachmentCheck extends Omit<BillingAttachmentIssue, 'status'> {
  status: BillingAttachmentIssue['status'] | 'available' | 'unverified';
}

export interface BillingAttachmentCheckOptions {
  signal?: AbortSignal;
  /** Explicit user actions may open the local connector; passive checks never do. */
  allowLocalDrive?: boolean;
}

export interface BillingAttachmentRead {
  check: BillingAttachmentCheck;
  blob: Blob | null;
  pdf: PDFDocument | null;
}

interface BillingAttachmentReadOptions extends BillingAttachmentCheckOptions {
  /** ZIP preserves encrypted PDF bytes; merging and UI inspection require readable pages. */
  parsePdf?: boolean;
}

export class BillingAttachmentExportError extends Error {
  readonly attachmentIssues: BillingAttachmentIssue[];
  readonly issues: BillingAttachmentIssue[];
  readonly checkedDocumentIds: number[];

  constructor(issues: BillingAttachmentIssue[], checkedDocumentIds: number[]) {
    super(`Le ZIP nécessite toutes les pièces sélectionnées. Pièces jointes indisponibles :\n${issues.map((issue) => `${issue.fileName} : ${issue.message}`).join('\n')}\nVérifiez les pièces signalées avant de relancer l’export ZIP.`);
    this.name = 'BillingAttachmentExportError';
    this.attachmentIssues = issues;
    this.issues = issues;
    this.checkedDocumentIds = checkedDocumentIds;
  }
}

export function isBillingPdfAttachment(document: Pick<ProjectBillingDocument, 'mimeType' | 'fileName'>): boolean {
  return document.mimeType.split(';')[0].trim().toLowerCase() === 'application/pdf'
    || document.fileName.toLowerCase().endsWith('.pdf');
}

function failureMessage(failure: unknown): string {
  return failure && typeof failure === 'object' && 'message' in failure && typeof failure.message === 'string'
    ? failure.message : 'Le téléchargement du fichier est indisponible.';
}

function failureStatus(failure: unknown): BillingAttachmentIssue['status'] {
  const detail = failure && typeof failure === 'object' ? failure as Record<string, unknown> : {};
  const statuses = [detail.status, detail.statusCode, detail.context instanceof Response ? detail.context.status : undefined].map(Number);
  // A refusal is never evidence that a file is absent, and must not trigger another source.
  if (detail.code === '42501' || statuses.some((status) => status === 401 || status === 403)) return 'unavailable';
  if (statuses.includes(404) || ['404', 'not_found', 'object_not_found', 'NoSuchKey'].includes(String(detail.code))) return 'missing';
  return 'unavailable';
}

/** Read one authorized source and validate its bytes; never retry through another provider. */
export async function readBillingAttachment(
  client: SupabaseClient,
  document: ProjectBillingDocument,
  options: BillingAttachmentReadOptions = {},
): Promise<BillingAttachmentRead> {
  const { signal, allowLocalDrive = false } = options;
  signal?.throwIfAborted();
  const failed = (status: BillingAttachmentCheck['status'], message: string): BillingAttachmentRead => ({
    check: { documentId: document.id, fileName: document.fileName, status, message }, blob: null, pdf: null,
  });
  if (!Number.isSafeInteger(document.fileSizeBytes) || document.fileSizeBytes <= 0) {
    return failed('invalid', 'Les métadonnées indiquent un fichier vide ou une taille invalide.');
  }
  let blob: Blob;
  try {
    const { data, error } = await projectDriveStorage(client, document.bucketName)
      .download(document.objectPath, signal, { allowLocalDrive });
    signal?.throwIfAborted();
    if (error) throw error;
    if (data === null) return failed('missing', 'Le téléchargement n’a retourné aucun fichier.');
    if (!(data instanceof Blob)) return failed('invalid', 'Le téléchargement n’a pas renvoyé un fichier valide.');
    blob = data;
  } catch (failure) {
    signal?.throwIfAborted();
    if (failure && typeof failure === 'object' && 'name' in failure && failure.name === 'AbortError') throw failure;
    const message = failureMessage(failure);
    if (!allowLocalDrive && failure && typeof failure === 'object' && 'code' in failure && failure.code === 'LOCAL_DRIVE_REQUIRED') {
      return failed('unverified', 'La présence de ce fichier local n’a pas encore été vérifiée.');
    }
    return failed(failureStatus(failure), message);
  }
  if (blob.size !== document.fileSizeBytes) {
    return failed('invalid', 'La taille du fichier ne correspond pas au document enregistré.');
  }
  let pdf: PDFDocument | null = null;
  if (isBillingPdfAttachment(document)) {
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      signal?.throwIfAborted();
      // Some readable PDFs have a short leading prefix before their PDF header.
      if (!/%PDF-\d\.\d/.test(new TextDecoder('latin1').decode(bytes.subarray(0, 1024)))) {
        return failed('invalid', 'Le fichier ne contient pas un PDF valide.');
      }
      if (options.parsePdf !== false) {
        const { PDFDocument } = await import('pdf-lib');
        pdf = await PDFDocument.load(bytes);
        signal?.throwIfAborted();
        if (!pdf.getPageCount()) return failed('invalid', 'Le PDF ne contient aucune page.');
      }
    } catch (failure) {
      signal?.throwIfAborted();
      if (failure && typeof failure === 'object' && 'name' in failure && failure.name === 'AbortError') throw failure;
      return failed('invalid', 'Le PDF est illisible, protégé ou endommagé.');
    }
  }
  return {
    check: { documentId: document.id, fileName: document.fileName, status: 'available', message: 'Fichier vérifié.' },
    blob, pdf,
  };
}

/** Bounded on-demand checks. Local-only files remain unverified until an explicit connector action. */
export async function checkBillingAttachments(
  client: SupabaseClient,
  documents: ProjectBillingDocument[],
  options: BillingAttachmentCheckOptions = {},
): Promise<BillingAttachmentCheck[]> {
  const checks: BillingAttachmentCheck[] = [];
  for (let start = 0; start < documents.length; start += 4) {
    options.signal?.throwIfAborted();
    const reads = await Promise.all(documents.slice(start, start + 4).map((document) => readBillingAttachment(client, document, options)));
    checks.push(...reads.map((read) => read.check));
  }
  options.signal?.throwIfAborted();
  return checks;
}
