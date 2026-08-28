import type { SupabaseClient } from '@supabase/supabase-js';

export const PROJECT_CATALOG_MEDIA_BUCKET = 'project-catalog-media';
export const PROJECT_CATALOG_MEDIA_MAX_BYTES = 5 * 1024 * 1024;

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export type ProjectCatalogMediaKind = 'clients' | 'towed-assets';

export function normalizeProjectCatalogUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(candidate);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Utilisez une adresse commençant par http:// ou https://.');
  }
  return url.toString();
}

export function discoverClientLogoUrl(website: string): string {
  const normalizedWebsite = normalizeProjectCatalogUrl(website);
  if (!normalizedWebsite) throw new Error('Renseignez d’abord le site internet du client.');
  return new URL('/favicon.ico', normalizedWebsite).toString();
}

export function validateProjectCatalogImage(file: File): void {
  if (!(file.type in IMAGE_EXTENSIONS)) {
    throw new Error('Le fichier doit être une image JPG, PNG ou WebP.');
  }
  if (file.size > PROJECT_CATALOG_MEDIA_MAX_BYTES) {
    throw new Error('L’image ne doit pas dépasser 5 Mo.');
  }
}

export async function uploadProjectCatalogImage(
  client: SupabaseClient,
  kind: ProjectCatalogMediaKind,
  entityId: number,
  file: File,
): Promise<string> {
  validateProjectCatalogImage(file);
  const extension = IMAGE_EXTENSIONS[file.type];
  const suffix = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const path = `${kind}/${entityId}/${suffix}.${extension}`;
  const { error } = await client.storage.from(PROJECT_CATALOG_MEDIA_BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message || "Impossible d’importer l’image.");
  return path;
}

export async function resolveProjectCatalogImageUrl(
  client: SupabaseClient,
  storagePath: string,
  externalUrl: string,
): Promise<string> {
  if (!storagePath) return externalUrl;
  const { data, error } = await client.storage
    .from(PROJECT_CATALOG_MEDIA_BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (error) throw new Error(error.message || "Impossible d’afficher l’image.");
  return data?.signedUrl || externalUrl;
}

export async function removeProjectCatalogImage(client: SupabaseClient, storagePath: string): Promise<void> {
  if (!storagePath) return;
  const { error } = await client.storage.from(PROJECT_CATALOG_MEDIA_BUCKET).remove([storagePath]);
  if (error) throw new Error(error.message || "Impossible de supprimer l’image.");
}
