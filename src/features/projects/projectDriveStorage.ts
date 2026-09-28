import type { SupabaseClient } from '@supabase/supabase-js';
import { blobBase64, connectLocalDrive, localDriveRequest } from '../documents/localDriveLauncher';

interface DriveReceipt { path: string; bytes: number; sha256: string; base64?: string }
interface DriveFile { path: string; bytes: number; sha256: string; mime_type: string; drive_file_id?: string | null }
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
  if (session.version !== '2.5.0') throw new Error('Installez le lanceur SeaPilot 2.5 depuis Administration → Documents et Google Drive. Le dossier déjà configuré sera conservé.');
  return session;
}
async function sha256(blob: Blob): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Logical legacy addresses stay stable. Drive receipts route reads without rewriting historical rows. */
export function projectDriveStorage(client: SupabaseClient, bucket: string) {
  const lookup = async (path: string): Promise<DriveFile | null> => {
    const { data, error } = await client.from('project_drive_files').select('path,bytes,sha256,mime_type,drive_file_id').eq('source_bucket', bucket).eq('source_path', path).maybeSingle();
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
        const session = await connection();
        const { data: project, error } = await client.from('projects').select('company_id').eq('id', projectId).single();
        if (error) throw error;
        const drivePath = `Projet-${projectId}/${projectDriveCategory(path)}/${path.split('/').at(-1)}`;
        const hash = await sha256(blob);
        const receipt = await localDriveRequest<DriveReceipt>(client, session, { action: 'write', module: 'projects', projectId, path: drivePath, base64: await blobBase64(blob) });
        if (receipt.path !== drivePath || receipt.bytes !== blob.size || receipt.sha256 !== hash) throw new Error('La copie Google Drive n’a pas été confirmée.');
        const saved = await client.from('project_drive_files').insert({ project_id: projectId, company_id: project.company_id, source_bucket: bucket, source_path: path, path: drivePath, bytes: blob.size, sha256: hash, mime_type: options.contentType || blob.type || 'application/octet-stream' });
        if (saved.error) throw saved.error;
        return { error: null };
      } catch (error) { return { error: error instanceof Error ? error : new Error((error as { message?: string })?.message || 'Classement Google Drive impossible.') }; }
    },
    async download(path: string) {
      const file = await lookup(path);
      if (!file) return client.storage.from(bucket).download(path);
      return { data: await read(file), error: null };
    },
    async createSignedUrl(path: string, seconds: number) {
      const file = await lookup(path);
      if (!file) return bucket === 'sharepoint' ? { data: { signedUrl: path }, error: null } : client.storage.from(bucket).createSignedUrl(path, seconds);
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
