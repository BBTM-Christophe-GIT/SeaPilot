import type { DisciplinaryCase } from './disciplinaryModel';

export interface DriveDirectory {
  name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DriveDirectory>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{
    getFile(): Promise<File>;
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void>; abort(): Promise<void> }>;
  }>;
}
type DriveWindow = Window & { showDirectoryPicker?: (options: { mode: 'readwrite'; id: string }) => Promise<DriveDirectory> };
export const ATTACHMENT_TYPES = '.pdf,.png,.jpg,.jpeg,.docx,.xlsx,.pptx,.txt,.odt,.ods,.odp';
export const DRIVE_MAX_BYTES = 25 * 1024 * 1024;
export function safeDrivePart(value: string): string {
  // eslint-disable-next-line no-control-regex -- Windows filenames cannot contain control characters.
  const cleaned = value.normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').slice(0, 100).replace(/[. ]+$/g, '');
  return !cleaned || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(cleaned) ? `Document-${cleaned || 'sans-nom'}` : cleaned;
}
export function documentDrivePath(record: DisciplinaryCase, date: string, name: string, documentId: string): string {
  const extension = name.match(/\.[^.]+$/)?.[0] || '';
  const base = safeDrivePart(name.slice(0, extension ? -extension.length : undefined)).slice(0, 75);
  return `${record.company_id}/${safeDrivePart(record.data.employeeName).slice(0, 75)} - ${record.person_id}/${date}/${documentId.slice(0, 8)} - ${base}${extension}`;
}
export function validateDisciplinaryPath(path: string): string {
  if (!path || path.length > 500 || !/\.(pdf|png|jpe?g|docx|xlsx|pptx|txt|odt|ods|odp)$/i.test(path)
    || path.split('/').some((part) => part !== safeDrivePart(part) || part === '.' || part === '..')) {
    throw new Error('Chemin Google Drive invalide ou format non autorisé.');
  }
  return path;
}
export function disciplinaryDesktopUri(path: string): string {
  const bytes = new TextEncoder().encode(validateDisciplinaryPath(path));
  const payload = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `seapilot-drive://disciplinary/open/${payload}`;
}
export function validateDriveUrl(value: string): string {
  if (!value.trim()) return '';
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Lien Google Drive invalide.'); }
  if (url.protocol !== 'https:' || url.port || url.username || url.password
    || !['drive.google.com', 'docs.google.com'].includes(url.hostname)) throw new Error('Utilisez un lien Google Drive privé.');
  return url.href;
}
export function chooseDriveDirectory(): Promise<DriveDirectory> {
  const picker = (window as DriveWindow).showDirectoryPicker;
  if (!picker) throw new Error('L’enregistrement dans le dossier Google Drive nécessite Chrome ou Edge sur ordinateur. Vous pouvez aussi télécharger le courrier puis lier le fichier déjà enregistré dans Drive.');
  return picker.call(window, { mode: 'readwrite', id: 'seapilot-disciplinary' });
}
export async function writeDriveFile(root: DriveDirectory, path: string, blob: Blob): Promise<void> {
  validateDisciplinaryPath(path);
  if (!blob.size || blob.size > DRIVE_MAX_BYTES) throw new Error('Le fichier doit peser entre 1 octet et 25 Mo.');
  const parts = path.split('/');
  let dir = root;
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
  // Never replace a document edited in Office. Every saved export has a new immutable path.
  try { await dir.getFileHandle(parts.at(-1)!); throw new Error('Ce fichier existe déjà. Créez une nouvelle version.'); }
  catch (error) { if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error; }
  const handle = await dir.getFileHandle(parts.at(-1)!, { create: true });
  const stream = await handle.createWritable();
  try { await stream.write(blob); await stream.close(); }
  catch (error) { await stream.abort().catch(() => undefined); throw error; }
  const written = await handle.getFile();
  if (written.size !== blob.size) throw new Error('La vérification du fichier écrit a échoué.');
}
