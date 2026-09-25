import type { SupabaseClient } from '@supabase/supabase-js';
import { blobBase64, connectLocalDrive, localDriveRequest } from '../documents/localDriveLauncher';

export const HR_DRIVE_LIMIT = 25 * 1024 * 1024;
export const HR_DRIVE_EXTENSIONS = /\.(pdf|png|jpe?g|docx?|xlsx?|pptx?|odt|ods|odp|txt)$/i;
export interface HrDriveReference { drivePath?: string; driveSha256?: string; fileSizeBytes: number | null; mimeType: string; id: number }

async function hash(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function connectHrDrive() {
  const connection = await connectLocalDrive();
  if (connection.version !== '2.4.0') throw new Error('Installez le lanceur SeaPilot 2.4 depuis Administration → Documents et Google Drive. Votre dossier configuré sera conservé.');
  return connection;
}

export async function writeHrDriveFile(client: SupabaseClient, personId: number, fileName: string, file: File) {
  if (!file.size || file.size > HR_DRIVE_LIMIT || !HR_DRIVE_EXTENSIONS.test(fileName)) {
    throw new Error('Sélectionnez un PDF, une image PNG/JPEG, un document Office, OpenDocument ou TXT de 25 Mo maximum.');
  }
  const pending = connectHrDrive();
  const [connection, scope, base64] = await Promise.all([
    pending, client.rpc('hr_document_drive_scope', { target_person: personId }), blobBase64(file),
  ]);
  if (scope.error) throw scope.error;
  if (scope.data?.directory !== 'Ressources Humaines' || !scope.data?.folder) throw new Error('Le dossier RH Google Drive est indisponible.');
  const safeName = fileName.normalize('NFC').replace(/[<>:"/\\|?*]/g, '-').replace(/\p{Cc}/gu, '-').slice(-180);
  const path = `${scope.data.folder}/${crypto.randomUUID()}-${safeName}`;
  const sha256 = await hash(Uint8Array.from(atob(base64), character => character.charCodeAt(0)));
  const result = await localDriveRequest<{ path: string; bytes: number; sha256: string }>(client, connection, {
    action: 'write', module: 'humanResources', personId, path, base64,
  });
  if (result.path !== path || result.bytes !== file.size || result.sha256 !== sha256) throw new Error('Le fichier enregistré dans Drive ne correspond pas au fichier sélectionné.');
  return { drive_path: path, drive_sha256: sha256 };
}

export async function readHrDriveFile(client: SupabaseClient, document: HrDriveReference): Promise<Blob> {
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
