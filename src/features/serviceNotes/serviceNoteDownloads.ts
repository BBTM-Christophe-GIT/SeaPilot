import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchServiceNoteAttachmentBlob, type ServiceNote } from './serviceNoteQueries';
import { buildServiceNotePdf, downloadServiceNotePdf, prepareServiceNotePdf } from './serviceNotePdf';

export type ServiceNoteDownloadMode = 'note' | 'attachments' | 'complete';

export interface ServiceNoteDownloadArchive {
  blob: Blob;
  filename: string;
  entries: string[];
}

function safeFilename(value: string): string {
  const withoutControls = Array.from(value, (character) => character.charCodeAt(0) < 32 ? '-' : character).join('');
  return withoutControls.normalize('NFD').replace(/[\u0300-\u036f]/gu, '')
    .replace(/[<>:"/\\|?*]/gu, '-')
    .replace(/\s+/gu, ' ').trim().slice(0, 140);
}

function serviceNoteBaseFilename(note: ServiceNote): string {
  return safeFilename([note.chronologyCode || 'Note de Service', note.subject].filter(Boolean).join(' - ')) || 'Note de Service';
}

function uniqueFilename(filename: string, usedNames: Set<string>): string {
  if (!usedNames.has(filename.toLocaleLowerCase('fr'))) {
    usedNames.add(filename.toLocaleLowerCase('fr'));
    return filename;
  }
  const dotIndex = filename.lastIndexOf('.');
  const stem = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  const extension = dotIndex > 0 ? filename.slice(dotIndex) : '';
  let suffix = 2;
  while (usedNames.has(`${stem} (${suffix})${extension}`.toLocaleLowerCase('fr'))) suffix += 1;
  const unique = `${stem} (${suffix})${extension}`;
  usedNames.add(unique.toLocaleLowerCase('fr'));
  return unique;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function buildServiceNoteDownloadArchive(
  client: SupabaseClient,
  note: ServiceNote,
  includeNote: boolean,
): Promise<ServiceNoteDownloadArchive> {
  if (!note.attachments.length && !includeNote) throw new Error('Cette note ne contient aucune pièce jointe.');
  const [{ default: JSZip }, attachmentFiles, generatedPdf] = await Promise.all([
    import('jszip'),
    Promise.all(note.attachments.map((attachment) => fetchServiceNoteAttachmentBlob(client, attachment))),
    includeNote ? prepareServiceNotePdf(client, note).then(buildServiceNotePdf) : Promise.resolve(null),
  ]);
  const archive = new JSZip();
  const entries: string[] = [];
  const usedNames = new Set<string>();
  if (generatedPdf) {
    const filename = uniqueFilename(generatedPdf.filename, usedNames);
    archive.file(filename, generatedPdf.blob);
    entries.push(filename);
  }
  attachmentFiles.forEach((file) => {
    const filename = uniqueFilename(file.filename, usedNames);
    archive.file(`Pieces jointes/${filename}`, file.blob);
    entries.push(`Pieces jointes/${filename}`);
  });
  const suffix = includeNote ? 'Note et pieces jointes' : 'Pieces jointes';
  return {
    blob: await archive.generateAsync({ type: 'blob' }),
    filename: `${serviceNoteBaseFilename(note)} - ${suffix}.zip`,
    entries,
  };
}

export async function downloadServiceNoteSelection(
  client: SupabaseClient,
  note: ServiceNote,
  mode: ServiceNoteDownloadMode,
): Promise<void> {
  if (mode === 'note') {
    await downloadServiceNotePdf(client, note);
    return;
  }
  if (!note.attachments.length) throw new Error('Cette note ne contient aucune pièce jointe.');
  if (mode === 'attachments' && note.attachments.length === 1) {
    const file = await fetchServiceNoteAttachmentBlob(client, note.attachments[0]);
    triggerBlobDownload(file.blob, file.filename);
    return;
  }
  const archive = await buildServiceNoteDownloadArchive(client, note, mode === 'complete');
  triggerBlobDownload(archive.blob, archive.filename);
}
