import type { SupabaseClient } from '@supabase/supabase-js';
import { connectLocalDrive, localDriveRequest, supportsLocalDriveVersion } from '../documents/localDriveLauncher';
import { hasDocumentDriveFile } from '../documents/documentDriveStorage';
import { hasDocumentBlobFile } from '../documents/documentBlobStorage';

interface DriveReceipt { path: string; bytes: number; sha256: string; base64?: string }
interface DriveFile { id: number; path: string; bytes: number; sha256: string; mime_type: string; drive_file_id?: string | null }
export function projectDriveCategory(path: string): string {
  if (/\/generated\/offer\//.test(path)) return 'Offres';
  if (path.includes('/generated/')) return 'Contrat';
  if (path.includes('/operations/')) return 'Operations';
  if (path.includes('/attachments/')) {
    const category = path.split('/attachments/')[1].split('/')[0];
    return /hse|qhse|securite/i.test(category) ? 'HSE' : /contrat|contract/i.test(category) ? 'Contrat' : /factur|billing/i.test(category) ? 'Facturation' : category;
  }
  return 'Facturation';
}
async function connection() {
  const session = await connectLocalDrive();
  if (!supportsLocalDriveVersion(session.version, '2.5.0')) throw new Error('Installez le lanceur SeaPilot 2.5 ou ultérieur depuis Administration → Documents et Google Drive. Le dossier déjà configuré sera conservé.');
  return session;
}
async function sha256(blob: Blob): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Logical legacy addresses stay stable. Drive receipts route reads without rewriting historical rows. */
export function projectDriveStorage(client: SupabaseClient, bucket: string) {
  const lookup = async (path: string): Promise<DriveFile | null> => {
    const { data, error } = await client.from('project_drive_files').select('id,path,bytes,sha256,mime_type,drive_file_id').eq('source_bucket', bucket).eq('source_path', path).maybeSingle();
    if (error) throw error;
    return data;
  };
  const read = async (file: DriveFile): Promise<Blob> => {
    const session = await connection();
    const receipt = await localDriveRequest<DriveReceipt>(client, session, { action: 'read', module: 'projects', path: file.path });
    const blob = new Blob([Uint8Array.from(atob(receipt.base64 || ''), (character) => character.charCodeAt(0))], { type: file.mime_type });
    if (receipt.path !== file.path || blob.size !== file.bytes || receipt.sha256 !== file.sha256 || await sha256(blob) !== file.sha256) throw new Error('Le document Google Drive est incomplet ou a été modifié. La copie historique est conservée.');
    return blob;
  };
  return {
    async upload(path: string, blob: Blob, options: { contentType?: string; cacheControl?: string; upsert?: boolean }) {
      try {
        const projectId = Number(/^projects\/(\d+)\//.exec(path)?.[1]);
        if (!projectId || bucket !== 'project-files' || options.upsert) throw new Error('Emplacement de projet invalide.');
        return await client.storage.from(bucket).upload(path, blob, {
          ...options, upsert: false, metadata: { project_id: projectId, file_name: path.split('/').at(-1) },
        });
      } catch (error) { return { error: error instanceof Error ? error : new Error((error as { message?: string })?.message || 'Enregistrement du document impossible.') }; }
    },
    async download(path: string) {
      // Migrated documents use the same authorized gateway as the browser's
      // other libraries, before consulting a historical desktop receipt.
      if (bucket !== 'local-demo' && (await hasDocumentBlobFile(client, bucket, path) || await hasDocumentDriveFile(client, bucket, path))) return client.storage.from(bucket).download(path);
      const file = await lookup(path);
      if (!file) return client.storage.from(bucket).download(path);
      if (await hasDocumentBlobFile(client, 'project-drive', String(file.id))) return client.storage.from('project-drive').download(String(file.id));
      return { data: await read(file), error: null };
    },
    async createSignedUrl(path: string, seconds: number) {
      if (bucket !== 'local-demo' && (await hasDocumentBlobFile(client, bucket, path) || await hasDocumentDriveFile(client, bucket, path))) return client.storage.from(bucket).createSignedUrl(path, seconds);
      const file = await lookup(path);
      if (!file) return bucket === 'sharepoint' ? { data: { signedUrl: path }, error: null } : client.storage.from(bucket).createSignedUrl(path, seconds);
      if (await hasDocumentBlobFile(client, 'project-drive', String(file.id))) return client.storage.from('project-drive').createSignedUrl(String(file.id), seconds);
      if (file.drive_file_id && /^[a-zA-Z0-9_-]+$/.test(file.drive_file_id)) return { data: { signedUrl: `https://drive.google.com/file/d/${file.drive_file_id}/view` }, error: null };
      const signedUrl = URL.createObjectURL(await read(file));
      window.setTimeout(() => URL.revokeObjectURL(signedUrl), seconds * 1000);
      return { data: { signedUrl }, error: null };
    },
    async remove(paths: string[]) {
      // Never destroy a verified Drive copy if linking the business record fails.
      // Its receipt remains available to managers for recovery.
      for (const path of paths) if (!await lookup(path)) await client.storage.from(bucket).remove([path]);
      return { error: null };
    },
  };
}
