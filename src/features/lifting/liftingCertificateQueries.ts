import type { SupabaseClient } from '@supabase/supabase-js';
import type { LiftingItem } from './liftingModel';

export interface LiftingCertificate {
  id: string; item_id: number; service_version: number; storage_path: string; file_name: string; mime_type: string; file_size: number; created_at: string;
}
export type UploadedLiftingCertificate = Pick<LiftingCertificate, 'storage_path' | 'file_name' | 'mime_type' | 'file_size'>;
const BUCKET = 'lifting-certificates';
const EXTENSIONS: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

export async function fetchLiftingCertificates(client: SupabaseClient, itemId: number): Promise<LiftingCertificate[]> {
  const { data, error } = await client.from('lifting_item_certificates').select('*').eq('item_id', itemId).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export function validateLiftingCertificate(file: File) {
  const extension = EXTENSIONS[file.type];
  if (!extension || !file.size || file.size > 20 * 1024 * 1024 || file.name.length > 255) throw new Error('Joignez un PDF, JPG ou PNG de 20 Mo maximum.');
  return extension;
}
export async function uploadLiftingCertificate(client: SupabaseClient, item: LiftingItem, file: File, version = item.service_version ?? 1): Promise<UploadedLiftingCertificate> {
  const extension = validateLiftingCertificate(file);
  const path = `${item.company_id}/${item.vessel_id}/${item.id}/${version}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await client.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;
  return { storage_path: path, file_name: file.name, mime_type: file.type, file_size: file.size };
}
export async function addLiftingCertificate(client: SupabaseClient, item: LiftingItem, file: File) {
  const uploaded = await uploadLiftingCertificate(client, item, file);
  const { error } = await client.rpc('add_lifting_item_certificate', {
    p_item_id: item.id, p_storage_path: uploaded.storage_path, p_file_name: uploaded.file_name, p_mime_type: uploaded.mime_type, p_file_size: uploaded.file_size,
  });
  if (error) throw error;
}

export async function downloadLiftingCertificate(client: SupabaseClient, certificate: LiftingCertificate): Promise<Blob> {
  const { data, error } = await client.storage.from(BUCKET).download(certificate.storage_path);
  if (error) throw error;
  if (!data) throw new Error('Certificat indisponible.');
  return data;
}
