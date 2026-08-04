import type { SupabaseClient } from '@supabase/supabase-js';

export const WORKING_TIME_SIGNATURE_BUCKET = 'working-time-signatures';
export const WORKING_TIME_SIGNATURE_MAX_BYTES = 1_048_576;

interface SignatureRow {
  id: number | string;
  person_id: number | string;
  version_number: number | string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number | string;
  sha256: string;
  valid_from: string;
  valid_to: string | null;
  created_at: string;
}

interface SignatureUploadContext {
  company_id?: number | string;
  person_id?: number | string;
  next_version?: number | string;
  path_prefix?: string;
  max_file_size_bytes?: number | string;
  mime_type?: string;
}

export interface WorkingTimeProfileSignature {
  id: number;
  personId: number;
  versionNumber: number;
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
  sha256: string;
  validFrom: string;
  validTo: string | null;
  createdAt: string;
}

function assertResult(error: { message?: string } | null, fallback: string): void {
  if (error) throw new Error(error.message || fallback);
}

function mapSignature(row: SignatureRow): WorkingTimeProfileSignature {
  return {
    id: Number(row.id),
    personId: Number(row.person_id),
    versionNumber: Number(row.version_number),
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    fileSizeBytes: Number(row.file_size_bytes),
    sha256: row.sha256,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    createdAt: row.created_at,
  };
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function fetchWorkingTimeProfileSignatures(
  client: SupabaseClient,
  personId: number,
): Promise<WorkingTimeProfileSignature[]> {
  const { data, error } = await client
    .from('working_time_profile_signatures')
    .select('id,person_id,version_number,storage_bucket,storage_path,mime_type,file_size_bytes,sha256,valid_from,valid_to,created_at')
    .eq('person_id', personId)
    .order('version_number', { ascending: false });
  assertResult(error, 'Impossible de charger les versions de signature.');
  return ((data || []) as SignatureRow[]).map(mapSignature);
}

export async function createWorkingTimeSignatureUrl(
  client: SupabaseClient,
  signature: Pick<WorkingTimeProfileSignature, 'storageBucket' | 'storagePath'>,
  expiresIn = 600,
): Promise<string> {
  const { data, error } = await client.storage
    .from(signature.storageBucket)
    .createSignedUrl(signature.storagePath, expiresIn);
  assertResult(error, 'Impossible d’afficher la signature privée.');
  return data?.signedUrl || '';
}

export async function uploadWorkingTimeProfileSignature(
  client: SupabaseClient,
  personId: number,
  png: Blob,
): Promise<number> {
  if (png.type !== 'image/png') throw new Error('La signature doit être un fichier PNG.');
  if (png.size < 1 || png.size > WORKING_TIME_SIGNATURE_MAX_BYTES) {
    throw new Error('La signature PNG doit peser moins de 1 Mo.');
  }

  const [{ data: contextData, error: contextError }, hash] = await Promise.all([
    client.rpc('working_time_signature_upload_context', { p_person_id: personId }),
    sha256Hex(png),
  ]);
  assertResult(contextError, 'Vous n’êtes pas autorisé à gérer cette signature.');
  const context = (contextData || {}) as SignatureUploadContext;
  const prefix = String(context.path_prefix || '');
  if (!prefix || Number(context.person_id) !== personId || context.mime_type !== 'image/png') {
    throw new Error('Le périmètre de dépôt de signature est invalide.');
  }

  const storagePath = `${prefix}${crypto.randomUUID()}.png`;
  const { error: uploadError } = await client.storage
    .from(WORKING_TIME_SIGNATURE_BUCKET)
    .upload(storagePath, png, { cacheControl: '3600', contentType: 'image/png', upsert: false });
  assertResult(uploadError, 'Impossible de déposer la signature privée.');

  const { data, error } = await client.rpc('register_working_time_profile_signature', {
    p_person_id: personId,
    p_storage_path: storagePath,
    p_mime_type: 'image/png',
    p_file_size_bytes: png.size,
    p_sha256: hash,
  });
  if (error) {
    await client.storage.from(WORKING_TIME_SIGNATURE_BUCKET).remove([storagePath]);
    throw new Error(error.message || 'Impossible d’enregistrer la version de signature.');
  }
  return Number(data);
}
