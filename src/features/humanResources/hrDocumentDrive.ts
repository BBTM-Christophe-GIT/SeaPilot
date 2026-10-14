import type { SupabaseClient } from '@supabase/supabase-js';
import { connectLocalDrive, localDriveRequest, supportsLocalDriveVersion } from '../documents/localDriveLauncher';
import { hasDocumentBlobFile } from '../documents/documentBlobStorage';

export const HR_DRIVE_LIMIT = 25 * 1024 * 1024;
export const HR_DRIVE_EXTENSIONS = /\.(pdf|png|jpe?g|docx?|xlsx?|pptx?|odt|ods|odp|txt)$/i;
export interface HrDriveReference { drivePath?: string; driveSha256?: string; fileSizeBytes: number | null; mimeType: string; id: number }
const HR_MIMES: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', txt: 'text/plain',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
};

async function hash(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function connectHrDrive() {
  const connection = await connectLocalDrive();
  if (!supportsLocalDriveVersion(connection.version, '2.4.0')) throw new Error('Installez le lanceur SeaPilot 2.4 ou ultérieur depuis Administration → Documents et Google Drive. Votre dossier configuré sera conservé.');
  return connection;
}

export async function writeHrDriveFile(client: SupabaseClient, personId: number, fileName: string, file: File) {
  if (!file.size || file.size > HR_DRIVE_LIMIT || !HR_DRIVE_EXTENSIONS.test(fileName)) {
    throw new Error('Sélectionnez un PDF, une image PNG/JPEG, un document Office, OpenDocument ou TXT de 25 Mo maximum.');
  }
  const scope = await client.rpc('hr_document_drive_scope', { target_person: personId });
  if (scope.error) throw scope.error;
  if (scope.data?.directory !== 'Ressources Humaines' || !scope.data?.folder || !Number.isSafeInteger(personId) || personId <= 0) throw new Error('Le dossier RH est indisponible.');
  const safeName = fileName.normalize('NFC').replace(/[<>:"/\\|?*]/g, '-').replace(/\p{Cc}/gu, '-').slice(-180);
  const path = `people/${personId}/${crypto.randomUUID()}-${safeName}`;
  const contentType = file.type && file.type !== 'application/octet-stream' ? file.type : HR_MIMES[safeName.split('.').at(-1)?.toLowerCase() || ''] || 'application/octet-stream';
  const { error } = await client.storage.from('hr-documents').upload(path, new File([file], safeName, { type: contentType }), {
    contentType, upsert: false,
    metadata: { person_id: personId, file_name: fileName },
  });
  if (error) throw error;
  return { storage_bucket: 'hr-documents', storage_path: path, drive_path: null, drive_sha256: null };
}

export async function readHrDriveFile(client: SupabaseClient, document: HrDriveReference): Promise<Blob> {
  if (document.drivePath && await hasDocumentBlobFile(client, 'hr-drive', String(document.id))) {
    const { data, error } = await client.storage.from('hr-drive').download(String(document.id));
    if (error || !data) throw error || new Error('Le document RH est indisponible.');
    return data;
  }
  const result = await localDriveRequest<{ path: string; bytes: number; sha256: string; base64: string }>(client, await connectHrDrive(), {
    action: 'read', module: 'humanResources', documentId: document.id,
  });
  const bytes = Uint8Array.from(atob(result.base64), character => character.charCodeAt(0));
  if (result.path !== document.drivePath || result.bytes !== bytes.length || bytes.length !== document.fileSizeBytes
    || result.sha256 !== document.driveSha256 || await hash(bytes) !== document.driveSha256) {
    throw new Error('Le fichier RH a changé ou sa synchronisation Drive est incomplète. Rechargez la liste puis réessayez.');
  }
  return new Blob([bytes], { type: document.mimeType || 'application/octet-stream' });
}
