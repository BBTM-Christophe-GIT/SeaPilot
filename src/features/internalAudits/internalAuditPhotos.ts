import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuditPhoto } from './internalAuditModel';

export const INTERNAL_AUDIT_PHOTO_BUCKET = 'internal-audit-photos';
export const INTERNAL_AUDIT_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const INTERNAL_AUDIT_PHOTO_MAX_FILES = 10;
export const INTERNAL_AUDIT_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';
const PHOTO_URL_TTL_SECONDS = 60 * 60;
const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export interface AuditPhotoScope {
  companyId: number;
  auditId: string;
  findingId: string;
  kind: 'finding' | 'treatment' | 'closure';
}

export function photoReferences(photos: readonly AuditPhoto[] = []): Omit<AuditPhoto, 'url'>[] {
  return photos.map(({ id, fileName, storagePath, mimeType, sizeBytes }) => ({ id, fileName, storagePath, mimeType, sizeBytes }));
}

export function mapAuditPhotos(value: unknown): AuditPhoto[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => item != null && typeof item === 'object')
    .map((photo) => ({ id: String(photo.id || ''), fileName: String(photo.fileName || ''), storagePath: String(photo.storagePath || ''),
      mimeType: String(photo.mimeType || ''), sizeBytes: Number(photo.sizeBytes || 0), url: '' }));
}

export async function validateAuditPhotoFiles(files: readonly File[]): Promise<void> {
  if (files.length > INTERNAL_AUDIT_PHOTO_MAX_FILES) throw new Error('Ajoutez au maximum 10 photos à la fois.');
  for (const file of files) {
    if (!EXTENSIONS[file.type]) throw new Error('Les photos doivent être au format JPEG, PNG ou WebP.');
    if (file.size < 1 || file.size > INTERNAL_AUDIT_PHOTO_MAX_BYTES) throw new Error('Chaque photo doit peser entre 1 octet et 10 Mo.');
    if (!file.name.trim() || file.name.length > 255) throw new Error('Le nom d’une photo doit contenir entre 1 et 255 caractères.');
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
    if (!(file.type === 'image/png' ? png : file.type === 'image/jpeg' ? jpeg : webp)) {
      throw new Error(`Le contenu de la photo « ${file.name} » ne correspond pas à son format.`);
    }
  }
}

/** Only unattached uploads can be removed by Storage RLS. Saved evidence is kept. */
export async function discardAuditPhotoUploads(client: SupabaseClient, photos: readonly AuditPhoto[]): Promise<boolean> {
  if (!photos.length) return true;
  try {
    const result = await client.storage.from(INTERNAL_AUDIT_PHOTO_BUCKET).remove(photos.map((photo) => photo.storagePath));
    const removed = new Set((result.data || []).map((photo) => photo.name));
    return !result.error && photos.every((photo) => removed.has(photo.storagePath));
  } catch { return false; }
}

export async function uploadAuditPhotos(client: SupabaseClient, scope: AuditPhotoScope, files: readonly File[]): Promise<AuditPhoto[]> {
  await validateAuditPhotoFiles(files);
  if (!files.length) return [];
  const userResult = await client.auth.getUser();
  if (userResult.error) throw userResult.error;
  const actorId = userResult.data.user?.id;
  if (!actorId) throw new Error('Reconnectez-vous avant d’ajouter des photos.');
  const uploaded: AuditPhoto[] = [];
  try {
    for (const file of files) {
      const id = crypto.randomUUID();
      const storagePath = `${scope.companyId}/${scope.auditId}/${scope.findingId}/${scope.kind}/${actorId}/${id}.${EXTENSIONS[file.type]}`;
      const result = await client.storage.from(INTERNAL_AUDIT_PHOTO_BUCKET).upload(storagePath, file, { contentType: file.type, upsert: false, cacheControl: '3600' });
      if (result.error) throw result.error;
      uploaded.push({ id, fileName: file.name, storagePath, mimeType: file.type, sizeBytes: file.size, url: '' });
    }
    return uploaded;
  } catch (error) {
    const cleaned = await discardAuditPhotoUploads(client, uploaded);
    if (!cleaned) throw new Error('Le téléversement a échoué et certaines photos n’ont pas pu être nettoyées. Rechargez l’audit avant de réessayer.', { cause: error });
    throw error;
  }
}

/** Batch-sign only RLS-visible references; unavailable photos leave an empty URL. */
export async function hydrateAuditPhotoUrls(client: SupabaseClient, photos: AuditPhoto[]): Promise<void> {
  const paths = [...new Set(photos.map((photo) => photo.storagePath).filter(Boolean))];
  if (!paths.length) return;
  try {
    const result = await client.storage.from(INTERNAL_AUDIT_PHOTO_BUCKET).createSignedUrls(paths, PHOTO_URL_TTL_SECONDS);
    if (result.error) return;
    const urls = new Map((result.data || []).map((item) => [item.path, item.signedUrl || '']));
    photos.forEach((photo) => { photo.url = urls.get(photo.storagePath) || ''; });
  } catch { /* Audit answers and treatment stay readable when Storage is unavailable. */ }
}

export async function getAuditPhotoUrl(client: SupabaseClient, photo: AuditPhoto): Promise<string> {
  const result = await client.storage.from(INTERNAL_AUDIT_PHOTO_BUCKET).createSignedUrl(photo.storagePath, PHOTO_URL_TTL_SECONDS);
  if (result.error) throw result.error;
  if (!result.data?.signedUrl) throw new Error('Cette photo est indisponible.');
  return result.data.signedUrl;
}

/** Downloads use the caller's authenticated Storage permission, including exports. */
export async function downloadAuditPhoto(client: SupabaseClient, photo: AuditPhoto): Promise<Blob> {
  const result = await client.storage.from(INTERNAL_AUDIT_PHOTO_BUCKET).download(photo.storagePath);
  if (result.error) throw result.error;
  if (!result.data) throw new Error('Cette photo est indisponible.');
  return result.data;
}
