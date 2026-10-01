import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuditAttachment } from './documentaryAuditModel';

export const DOCUMENTARY_AUDIT_FILE_BUCKET = 'documentary-audit-files';
export const DOCUMENTARY_AUDIT_FILE_ACCEPT = '.pdf,.docx,.xlsx,.pptx,.txt,.csv,.jpg,.jpeg,.png,.webp';
const TYPES: Record<string, string> = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx', 'text/plain': 'txt', 'text/csv': 'csv',
};
export function documentaryFileMime(file: File): string {
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  const inferred = Object.entries(TYPES).find(([, ext]) => ext === (extension === 'jpeg' ? 'jpg' : extension))?.[0];
  if (!inferred || (file.type && file.type !== inferred && !(extension === 'csv' && file.type === 'application/vnd.ms-excel'))) throw new Error('Utilisez un PDF, document Word/Excel/PowerPoint, texte ou une photo JPEG/PNG/WebP.');
  return inferred;
}
export async function validateDocumentaryFiles(files: readonly File[]): Promise<void> {
  if (files.length > 10) throw new Error('Ajoutez au maximum 10 fichiers à la fois.');
  for (const file of files) {
    const mime = documentaryFileMime(file);
    if (!file.name.trim() || file.name.length > 255) throw new Error('Le nom du fichier doit contenir entre 1 et 255 caractères.');
    const max = mime.startsWith('image/') ? 10 * 1024 * 1024 : 25 * 1024 * 1024;
    if (file.size < 1 || file.size > max) throw new Error(`${file.name} dépasse la limite : 10 Mo pour une photo, 25 Mo pour un document.`);
    const bytes = new Uint8Array(await file.slice(0, 512).arrayBuffer());
    const prefix = String.fromCharCode(...bytes.slice(0, 12));
    const valid = mime === 'application/pdf' ? prefix.startsWith('%PDF-') : mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : mime === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
        : mime === 'image/webp' ? prefix.startsWith('RIFF') && prefix.slice(8, 12) === 'WEBP'
          : mime.startsWith('text/') ? !bytes.includes(0) : bytes[0] === 80 && bytes[1] === 75 && bytes[2] === 3 && bytes[3] === 4;
    if (!valid) throw new Error(`Le contenu de « ${file.name} » ne correspond pas à son format.`);
  }
}
export function documentaryFileReferences(files: readonly AuditAttachment[] = []): Omit<AuditAttachment, 'url'>[] {
  return files.map(({ id, fileName, storagePath, mimeType, sizeBytes }) => ({ id, fileName, storagePath, mimeType, sizeBytes }));
}
export function mapDocumentaryFiles(value: unknown): AuditAttachment[] {
  return Array.isArray(value) ? value.filter((x) => x && typeof x === 'object').map((x) => ({ id: String(x.id || ''), fileName: String(x.fileName || ''), storagePath: String(x.storagePath || ''), mimeType: String(x.mimeType || ''), sizeBytes: Number(x.sizeBytes || 0), url: '' })) : [];
}
export async function hydrateDocumentaryFiles(client: SupabaseClient, files: AuditAttachment[]): Promise<void> {
  const paths = [...new Set(files.map((file) => file.storagePath).filter(Boolean))];
  if (!paths.length) return;
  try {
    const result = await client.storage.from(DOCUMENTARY_AUDIT_FILE_BUCKET).createSignedUrls(paths, 3600);
    if (result.error) return;
    const urls = new Map((result.data || []).map((x) => [x.path, x.signedUrl || '']));
    files.forEach((file) => { file.url = urls.get(file.storagePath) || ''; });
  } catch { /* A Storage outage must not hide the audit or its treatment history. */ }
}
export async function getDocumentaryFileUrl(client: SupabaseClient, file: AuditAttachment): Promise<string> {
  const result = await client.storage.from(DOCUMENTARY_AUDIT_FILE_BUCKET).createSignedUrl(file.storagePath, 3600);
  if (result.error) throw result.error;
  if (!result.data?.signedUrl) throw new Error('Ce fichier est indisponible.');
  return result.data.signedUrl;
}
export async function downloadDocumentaryFile(client: SupabaseClient, file: AuditAttachment): Promise<Blob> {
  const result = await client.storage.from(DOCUMENTARY_AUDIT_FILE_BUCKET).download(file.storagePath);
  if (result.error) throw result.error;
  if (!result.data) throw new Error('Ce fichier est indisponible.');
  return result.data;
}
export async function discardDocumentaryUploads(client: SupabaseClient, files: readonly AuditAttachment[]): Promise<boolean> {
  if (!files.length) return true;
  try {
    const result = await client.storage.from(DOCUMENTARY_AUDIT_FILE_BUCKET).remove(files.map((file) => file.storagePath));
    const removed = new Set((result.data || []).map((file) => file.name));
    return !result.error && files.every((file) => removed.has(file.storagePath));
  } catch { return false; }
}
export async function uploadDocumentaryFiles(client: SupabaseClient, scope: { companyId: number; auditId: string; recordId: string; kind: 'audit' | 'finding' | 'treatment' | 'closure' }, files: readonly File[]): Promise<AuditAttachment[]> {
  await validateDocumentaryFiles(files);
  if (!files.length) return [];
  const auth = await client.auth.getUser();
  if (auth.error) throw auth.error;
  const actorId = auth.data.user?.id;
  if (!actorId) throw new Error('Reconnectez-vous pour joindre un fichier.');
  const uploaded: AuditAttachment[] = [];
  try {
    for (const file of files) {
      const mimeType = documentaryFileMime(file); const id = crypto.randomUUID();
      const storagePath = `${scope.companyId}/${scope.auditId}/${scope.recordId}/${scope.kind}/${actorId}/${id}.${TYPES[mimeType]}`;
      const result = await client.storage.from(DOCUMENTARY_AUDIT_FILE_BUCKET).upload(storagePath, file, { contentType: mimeType, upsert: false });
      if (result.error) throw result.error;
      uploaded.push({ id, fileName: file.name, storagePath, mimeType, sizeBytes: file.size, url: '' });
    }
    return uploaded;
  } catch (error) {
    if (!await discardDocumentaryUploads(client, uploaded)) throw new Error('Le téléversement a échoué ; certains fichiers sont conservés. Rechargez le dossier avant de réessayer.', { cause: error });
    throw error;
  }
}
