import type { SupabaseClient } from '@supabase/supabase-js';
import type { LiftingItem } from './liftingModel';

export interface LiftingCertificate {
  id: string; item_id: number; storage_path: string; file_name: string; mime_type: string; file_size: number; created_at: string;
}
const BUCKET = 'lifting-certificates';
const EXTENSIONS: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

export async function fetchLiftingCertificates(client: SupabaseClient, itemId: number): Promise<LiftingCertificate[]> {
  const { data, error } = await client.from('lifting_item_certificates').select('*').eq('item_id', itemId).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function addLiftingCertificate(client: SupabaseClient, item: LiftingItem, file: File) {
  const extension = EXTENSIONS[file.type];
  if (!extension || !file.size || file.size > 20 * 1024 * 1024 || file.name.length > 255) throw new Error('Joignez un PDF, JPG ou PNG de 20 Mo maximum.');
  const path = `${item.company_id}/${item.vessel_id}/${item.id}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await client.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;
  const { error } = await client.rpc('add_lifting_item_certificate', {
    p_item_id: item.id, p_storage_path: path, p_file_name: file.name, p_mime_type: file.type, p_file_size: file.size,
  });
  if (error) throw error;
}

export async function downloadLiftingCertificate(client: SupabaseClient, certificate: LiftingCertificate): Promise<Blob> {
  const { data, error } = await client.storage.from(BUCKET).download(certificate.storage_path);
  if (error) throw error;
  if (!data) throw new Error('Certificat indisponible.');
  return data;
}
