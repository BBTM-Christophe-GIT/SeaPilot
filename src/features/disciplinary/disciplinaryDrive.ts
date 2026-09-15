import { blobBase64, launcherOpenUri, localDriveRequest, type LocalDriveConnection } from '../documents/localDriveLauncher';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DisciplinaryCase } from './disciplinaryModel';

export const ATTACHMENT_TYPES = '.pdf,.png,.jpg,.jpeg,.docx,.xlsx,.pptx,.txt,.odt,.ods,.odp';
export const DRIVE_MAX_BYTES = 25 * 1024 * 1024;
export function safeDrivePart(value: string): string {
  // eslint-disable-next-line no-control-regex -- Windows filenames cannot contain control characters.
  const cleaned = value.normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').slice(0, 100).replace(/[. ]+$/g, '');
  return !cleaned || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(cleaned) ? `Document-${cleaned || 'sans-nom'}` : cleaned;
}
export function documentDrivePath(record: DisciplinaryCase, date: string, name: string, documentId: string, folder = collaboratorDriveFolder(record)): string {
  const extension = name.match(/\.[^.]+$/)?.[0] || '';
  const base = safeDrivePart(name.slice(0, extension ? -extension.length : undefined)).slice(0, 75);
  return `${folder}/${date}/${documentId.slice(0, 8)} - ${base}${extension}`;
}
export function validateDisciplinaryPath(path: string): string {
  if (!path || path.length > 500 || !/\.(pdf|png|jpe?g|docx|xlsx|pptx|txt|odt|ods|odp)$/i.test(path)
    || path.split('/').some((part) => part !== safeDrivePart(part) || part === '.' || part === '..')) {
    throw new Error('Chemin Google Drive invalide ou format non autorisé.');
  }
  return path;
}
export function collaboratorDriveFolder(record: Pick<DisciplinaryCase, 'company_id' | 'person_id' | 'data'>): string {
  return `${safeDrivePart(record.data.employeeName).slice(0, 75)} - c${record.company_id}-p${record.person_id}`;
}
export function disciplinaryDesktopUri(path: string): string {
  return launcherOpenUri('disciplinary', validateDisciplinaryPath(path));
}
export function ensureCollaboratorDriveFolder(client: SupabaseClient, connection: LocalDriveConnection, record: DisciplinaryCase): Promise<{ folder: string }> {
  return localDriveRequest(client, connection, { action: 'ensure-person', companyId: record.company_id, personId: record.person_id });
}
export function validateDriveUrl(value: string): string {
  if (!value.trim()) return '';
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Lien Google Drive invalide.'); }
  if (url.protocol !== 'https:' || url.port || url.username || url.password
    || !['drive.google.com', 'docs.google.com'].includes(url.hostname)) throw new Error('Utilisez un lien Google Drive privé.');
  return url.href;
}
export async function writeDriveFile(client: SupabaseClient, connection: LocalDriveConnection, record: DisciplinaryCase, path: string, blob: Blob): Promise<void> {
  validateDisciplinaryPath(path);
  if (!blob.size || blob.size > DRIVE_MAX_BYTES) throw new Error('Le fichier doit peser entre 1 octet et 25 Mo.');
  const written = await localDriveRequest<{ path: string; bytes: number }>(client, connection, {
    action: 'write', companyId: record.company_id, personId: record.person_id, path, base64: await blobBase64(blob),
  });
  if (written.path !== path || written.bytes !== blob.size) throw new Error('La vérification du fichier écrit a échoué.');
}
