import type { SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_APPLICATION_LOGO = '/seapilot-logo.png';
export const APPLICATION_LOGO_BUCKET = 'application-branding';
export const MAX_APPLICATION_LOGO_BYTES = 2 * 1024 * 1024;
const LOGO_PATH = /^logos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;

export interface ApplicationBranding {
  logoPath: string | null;
  revision: number;
  canManage: boolean;
  updatedAt: string | null;
}

function brandingResult(data: unknown): ApplicationBranding {
  const value = data as Partial<ApplicationBranding> | null;
  if (!value || typeof value !== 'object' || !Number.isSafeInteger(value.revision)
    || Number(value.revision) < 0 || typeof value.canManage !== 'boolean'
    || (value.logoPath !== null && (typeof value.logoPath !== 'string' || !LOGO_PATH.test(value.logoPath)))) {
    throw new Error('Impossible de lire la configuration du logo.');
  }
  return { logoPath: value.logoPath, revision: value.revision!, canManage: value.canManage,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null };
}

function saveError(error: { code?: string; message?: string }): Error {
  if (error.code === '40001') return new Error('Le logo a été modifié depuis un autre écran. Actualisez avant de réessayer.');
  if (error.code === '42501') return new Error('La modification du logo est réservée aux administrateurs autorisés.');
  return new Error('Impossible d’enregistrer le logo. Réessayez.');
}

export async function fetchApplicationBranding(client: SupabaseClient): Promise<ApplicationBranding> {
  const { data, error } = await client.rpc('get_application_branding');
  if (error) throw new Error('Impossible de charger le logo de l’application.');
  return brandingResult(data);
}

export function applicationLogoUrl(client: SupabaseClient, branding: ApplicationBranding): string {
  if (!branding.logoPath) return DEFAULT_APPLICATION_LOGO;
  if (!LOGO_PATH.test(branding.logoPath)) throw new Error('Référence de logo invalide.');
  const { data } = client.storage.from(APPLICATION_LOGO_BUCKET).getPublicUrl(branding.logoPath);
  const url = new URL(data.publicUrl);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Adresse de logo invalide.');
  return url.href;
}

function readHeader(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => reader.result instanceof ArrayBuffer
      ? resolve(new Uint8Array(reader.result)) : reject(new Error('Impossible de lire cette image.'));
    reader.onerror = reader.onabort = () => reject(new Error('Impossible de lire cette image.'));
    reader.readAsArrayBuffer(file.slice(0, 12));
  });
}

export async function prepareApplicationLogoFile(file: File): Promise<File> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Choisissez une image PNG, JPEG ou WebP.');
  }
  if (!file.size || file.size > MAX_APPLICATION_LOGO_BYTES) throw new Error('Le logo doit peser entre 1 octet et 2 Mo.');
  const header = await readHeader(file);
  const matches = file.type === 'image/png'
    ? [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => header[index] === value)
    : file.type === 'image/jpeg' ? header[0] === 255 && header[1] === 216 && header[2] === 255
      : String.fromCharCode(...header.slice(0, 4)) === 'RIFF' && String.fromCharCode(...header.slice(8, 12)) === 'WEBP';
  if (!matches) throw new Error('Le contenu du fichier ne correspond pas à une image PNG, JPEG ou WebP valide.');
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      const timeout = window.setTimeout(() => { image.onload = image.onerror = null; reject(new Error('Impossible de lire cette image.')); }, 10_000);
      image.onload = () => {
        window.clearTimeout(timeout);
        if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 4096 || image.naturalHeight > 4096
          || image.naturalWidth * image.naturalHeight > 8_000_000) {
          reject(new Error('Choisissez une image de 4 096 pixels maximum par côté et de moins de 8 millions de pixels.'));
        } else resolve();
      };
      image.onerror = () => { window.clearTimeout(timeout); reject(new Error('Cette image ne peut pas être lue. Choisissez un autre fichier.')); };
      image.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
  return file;
}

export async function saveApplicationLogo(client: SupabaseClient, file: File, expectedRevision: number): Promise<ApplicationBranding> {
  await prepareApplicationLogoFile(file);
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) throw new Error('Connectez-vous pour enregistrer le logo.');
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `logos/${userData.user.id}/${crypto.randomUUID()}.${extension}`;
  const storage = client.storage.from(APPLICATION_LOGO_BUCKET);
  const { error: uploadError } = await storage.upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false });
  if (uploadError) throw new Error('Impossible de transférer le logo. Réessayez.');
  try {
    const { data, error } = await client.rpc('save_application_logo', { p_logo_path: path, p_expected_revision: expectedRevision });
    if (error) throw saveError(error);
    return brandingResult(data);
  } catch (error) {
    // The server refuses deletion when an ambiguous network response actually saved this logo.
    try { await storage.remove([path]); } catch { /* Keep the original save error. */ }
    throw error;
  }
}

export async function resetApplicationLogo(client: SupabaseClient, expectedRevision: number): Promise<ApplicationBranding> {
  const { data, error } = await client.rpc('save_application_logo', { p_logo_path: null, p_expected_revision: expectedRevision });
  if (error) throw saveError(error);
  return brandingResult(data);
}
