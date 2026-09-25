import type { SupabaseClient } from '@supabase/supabase-js';
import { blobBase64, connectLocalDrive, localDriveRequest, type LocalDriveConnection } from '../documents/localDriveLauncher';
import type { ProcedureInput, ProcedureRecord, PublishedProcedureRecord } from './procedureQueries';

export const PROCEDURE_IMPORT_TYPES = '.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.txt,.pdf';
export const PROCEDURE_DRIVE_LIMIT = 25 * 1024 * 1024;
export interface ProcedureDriveReceipt { path: string; bytes: number; sha256: string }
export interface ProcedureDriveSource extends ProcedureDriveReceipt { mimeType: string }
export interface ProcedureFileStore {
  connect: () => Promise<LocalDriveConnection>;
  write: (input: ProcedureInput, file: File, connection: LocalDriveConnection) => Promise<ProcedureDriveSource>;
  publish: (record: ProcedureRecord) => Promise<ProcedureDriveReceipt>;
  open: (record: ProcedureRecord) => Promise<void>;
  read: (record: ProcedureRecord | PublishedProcedureRecord) => Promise<Blob>;
}

export function procedureDriveFilename(input: Pick<ProcedureInput, 'theme' | 'documentNumber' | 'versionLabel' | 'title'>, extension = '.docx'): string {
  if (!/^\.(docx?|xlsx?|pptx?|odt|ods|odp|txt|pdf)$/i.test(extension)) throw new Error('Format de fichier non pris en charge.');
  const identity = [input.theme.trim(), input.documentNumber.trim(), input.versionLabel.trim().toUpperCase()].filter(Boolean).join(' ');
  const name = Array.from(`${identity} - ${input.title.trim()}`.normalize('NFC')
    .replace(/[<>:"/\\|?*]/g, '-').replace(/\p{Cc}/gu, '-')).slice(0, 180).join('').replace(/[. ]+$/, '');
  if (![input.theme, input.documentNumber, input.versionLabel, input.title].every(value => value.trim())) throw new Error('Renseignez le thème, le numéro, la version et le titre du document.');
  return `${name}${extension.toLowerCase()}`;
}

async function hashBytes(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createProcedureFileStore(client: SupabaseClient): ProcedureFileStore {
  async function connect() {
    const connection = await connectLocalDrive();
    if (connection.version !== '2.3.0') throw new Error('Installez le lanceur SeaPilot 2.3 depuis Administration → Documents et Google Drive. Votre dossier configuré sera conservé.');
    return connection;
  }
  return {
    connect,
    write: async (input, file, connection) => {
      if (!file.size || file.size > PROCEDURE_DRIVE_LIMIT) throw new Error('Le fichier doit peser entre 1 octet et 25 Mo.');
      const path = procedureDriveFilename(input, file.name.match(/\.[^.]+$/)?.[0] || '');
      const base64 = await blobBase64(file);
      const sha256 = await hashBytes(Uint8Array.from(atob(base64), character => character.charCodeAt(0)));
      const result = await localDriveRequest<ProcedureDriveReceipt>(client, connection, { action: 'write', module: 'procedures', path, base64 });
      if (result.path !== path || result.bytes !== file.size || result.sha256 !== sha256) throw new Error('Le fichier créé ne correspond pas au document demandé.');
      return { ...result, mimeType: file.type || 'application/octet-stream' };
    },
    publish: async record => {
      const result = await localDriveRequest<ProcedureDriveReceipt>(client, await connect(), { action: 'publish', module: 'procedures', procedureId: record.id });
      if (result.path !== procedureDriveFilename(record, '.pdf') || result.bytes <= 0 || result.bytes > PROCEDURE_DRIVE_LIMIT || !/^[a-f0-9]{64}$/.test(result.sha256)) throw new Error('La conversion PDF n’a pas pu être vérifiée.');
      return result;
    },
    open: async record => {
      await localDriveRequest(client, await connect(), { action: 'open', module: 'procedures', procedureId: record.id });
    },
    read: async record => {
      const result = await localDriveRequest<ProcedureDriveReceipt & { base64: string }>(client, await connect(), {
        action: 'read', module: 'procedures', ...('procedureId' in record ? { publicationId: record.id } : { procedureId: record.id }),
      });
      const bytes = Uint8Array.from(atob(result.base64), character => character.charCodeAt(0));
      if (result.path !== record.googleDrivePath || result.bytes !== bytes.length || await hashBytes(bytes) !== result.sha256) throw new Error('Le fichier téléchargé n’a pas pu être vérifié.');
      return new Blob([bytes], { type: record.mimeType });
    },
  };
}

export function showProcedureBlob(blob: Blob, filename: string, download: boolean) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  if (download) anchor.download = filename;
  else { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
