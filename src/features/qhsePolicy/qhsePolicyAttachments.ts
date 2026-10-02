import type { SupabaseClient } from '@supabase/supabase-js';
import { isQhsePolicyId, validateQhsePolicyObjectiveUpdateDraft, type QhsePolicyAttachment, type QhsePolicyObjectiveUpdateDraft } from './qhsePolicyModel';

export const QHSE_POLICY_ATTACHMENT_MAX_FILES = 10;
export const QHSE_POLICY_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
export const QHSE_POLICY_ATTACHMENT_BUCKET = 'qhse-policy-attachments';
export const QHSE_POLICY_ATTACHMENT_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet', odp: 'application/vnd.oasis.opendocument.presentation',
  txt: 'text/plain', csv: 'text/csv',
};
export const QHSE_POLICY_ATTACHMENT_ACCEPT = Object.keys(QHSE_POLICY_ATTACHMENT_MIME_TYPES).map((extension) => `.${extension}`).join(',');
export function validateQhsePolicyAttachmentFiles(files: readonly File[]): Array<{ fileName: string; mimeType: string; sizeBytes: number }> {
  if (files.length > QHSE_POLICY_ATTACHMENT_MAX_FILES) throw new Error('Un suivi peut contenir au maximum 10 pièces jointes.');
  return files.map((file) => {
    const fileName = file.name.trim();
    const extension = fileName.split('.').at(-1)?.toLowerCase() || '';
    const mimeType = QHSE_POLICY_ATTACHMENT_MIME_TYPES[extension];
    if (!mimeType || !fileName || fileName.length > 200 || Array.from(fileName).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 || character === '/' || character === '\\')) throw new Error('Choisissez un PDF, une image, un document bureautique ou un fichier texte courant.');
    if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > QHSE_POLICY_ATTACHMENT_MAX_BYTES) throw new Error('Chaque pièce jointe doit contenir entre 1 octet et 25 Mo.');
    // The canonical MIME is determined from the accepted extension. Browsers often
    // omit Office MIME or use application/octet-stream; Storage receives this value.
    return { fileName, mimeType, sizeBytes: file.size };
  });
}
type StagedUpload = { id: string; storagePath: string; fileName: string; mimeType: string; sizeBytes: number };
function stagedUploads(value: unknown, expected: number): StagedUpload[] {
  if (!Array.isArray(value) || value.length !== expected) throw new Error('La préparation des pièces jointes est incomplète.');
  return value.map((item: unknown) => {
    const row = item as Record<string, unknown>;
    if (!row || !isQhsePolicyId(row.id) || typeof row.storage_path !== 'string' || typeof row.file_name !== 'string'
      || typeof row.mime_type !== 'string' || !Number.isSafeInteger(row.size_bytes)) throw new Error('La préparation des pièces jointes est incomplète.');
    return { id: row.id, storagePath: row.storage_path, fileName: row.file_name, mimeType: row.mime_type, sizeBytes: row.size_bytes as number };
  });
}
export async function saveQhsePolicyObjectiveUpdateWithAttachments(client: SupabaseClient, draft: QhsePolicyObjectiveUpdateDraft, files: readonly File[]): Promise<string> {
  const value = validateQhsePolicyObjectiveUpdateDraft(draft);
  const metadata = validateQhsePolicyAttachmentFiles(files);
  let staged: StagedUpload[] = [];
  try {
    if (files.length) {
      const { data, error } = await client.rpc('qhse_policy_prepare_attachments', { p_objective_id: value.objectiveId, p_files: metadata.map((file) => ({ file_name: file.fileName, mime_type: file.mimeType, size_bytes: file.sizeBytes })) });
      if (error) throw new Error('Impossible de préparer les pièces jointes. Actualisez et réessayez.', { cause: error });
      staged = stagedUploads(data, files.length);
      for (let index = 0; index < files.length; index += 1) {
        const upload = staged[index];
        if (upload.fileName !== metadata[index].fileName || upload.mimeType !== metadata[index].mimeType || upload.sizeBytes !== metadata[index].sizeBytes) throw new Error('La préparation des pièces jointes est incohérente.');
        const { error } = await client.storage.from(QHSE_POLICY_ATTACHMENT_BUCKET).upload(upload.storagePath, files[index], { contentType: upload.mimeType, upsert: false });
        if (error) throw new Error(`Le transfert de « ${upload.fileName} » a échoué. Le suivi n’a pas été enregistré.`, { cause: error });
      }
    }
    const { data, error } = await client.rpc('qhse_policy_add_objective_update_with_attachments', { p_objective_id: value.objectiveId, p_progress: value.progress, p_occurred_on: value.occurredOn, p_note: value.note, p_expected_revision: value.expectedRevision, p_upload_ids: staged.map((file) => file.id) });
    if (error) throw new Error(error.code === '40001' ? 'Cet objectif a été modifié entre-temps. Actualisez avant de réessayer.' : 'Le suivi et ses pièces jointes n’ont pas été enregistrés. Actualisez et réessayez.', { cause: error });
    if (!isQhsePolicyId(data)) throw new Error('La confirmation du suivi est incomplète. Actualisez la page.');
    return data;
  } catch (error) {
    // Finalized files cannot be removed by Storage RLS, including when the commit
    // succeeded but the network lost its response. Only this user's staging is removed.
    if (staged.length) {
      try { await client.storage.from(QHSE_POLICY_ATTACHMENT_BUCKET).remove(staged.map((file) => file.storagePath)); } catch { /* The next retry can proceed with new upload tokens. */ }
    }
    throw error;
  }
}
function validateAttachment(attachment: QhsePolicyAttachment) {
  if (attachment.storageBucket !== QHSE_POLICY_ATTACHMENT_BUCKET || !isQhsePolicyId(attachment.id) || !isQhsePolicyId(attachment.objectiveId)
    || !isQhsePolicyId(attachment.updateId) || !new RegExp(`^[1-9][0-9]*/${attachment.objectiveId}/${attachment.id}\\.[a-z0-9]+$`).test(attachment.storagePath)) throw new Error('Pièce jointe QHSE invalide.');
}
export async function getQhsePolicyAttachmentUrl(client: SupabaseClient, attachment: QhsePolicyAttachment, download = false): Promise<string> {
  validateAttachment(attachment);
  const { data, error } = await client.storage.from(attachment.storageBucket).createSignedUrl(attachment.storagePath, 300, download ? { download: attachment.fileName } : undefined);
  if (error || !data?.signedUrl) throw new Error(`Impossible de consulter « ${attachment.fileName} ».`, { cause: error });
  return data.signedUrl;
}
export async function readQhsePolicyAttachment(client: SupabaseClient, attachment: QhsePolicyAttachment): Promise<Blob> {
  validateAttachment(attachment);
  const { data, error } = await client.storage.from(attachment.storageBucket).download(attachment.storagePath);
  if (error || !data || data.size !== attachment.sizeBytes) throw new Error(`Impossible de lire intégralement « ${attachment.fileName} ».`, { cause: error });
  return data;
}
