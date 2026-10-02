import type { PublishedProcedureRecord } from '../procedures/procedureQueries';
import { chapterKey } from '../procedures/procedureChapters';

export const QHSE_POLICY_DOCUMENT_TITLE = "02 - Politique en Matière de Sécurité et de Protection de l'Environnement";

export function policyPublicationLabel(record: PublishedProcedureRecord): string {
  const title = record.title.replace(/\.pdf$/i, '').trim();
  return record.procedureCode && !title.startsWith(record.procedureCode) ? `${record.procedureCode} · ${title}` : title;
}

export function policyPublications(records: PublishedProcedureRecord[], chapterOnly = true): PublishedProcedureRecord[] {
  return records.filter((record) => (!chapterOnly || chapterKey(record.ismChapter) === '02')
    && record.status === 'published' && record.mimeType.toLowerCase() === 'application/pdf'
    && record.fileName.toLowerCase().endsWith('.pdf'))
    .sort((left, right) => right.publishedOn.localeCompare(left.publishedOn) || right.id - left.id);
}

export function resolvePolicyPublication(records: PublishedProcedureRecord[], publicationId: number | null): PublishedProcedureRecord | undefined {
  const publications = policyPublications(records, false);
  return publicationId !== null ? publications.find((record) => record.id === publicationId) : policyPublications(publications)[0];
}

export function policyDriveUrls(value: string): { open: string; preview: string } | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com' || url.username || url.password || url.port) return null;
    const match = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]{10,200})(?:\/(?:view|preview))?\/?$/);
    return match ? {
      open: `https://drive.google.com/file/d/${match[1]}/view`,
      preview: `https://drive.google.com/file/d/${match[1]}/preview`,
    } : null;
  } catch { return null; }
}
