import type { SupabaseClient } from '@supabase/supabase-js';
import type { PharmacyCategory, PharmacyControl, PharmacyItem, PharmacyItemDraft, PharmacyNotification, PharmacyVessel, PharmacyVesselExpiryCounts } from './pharmacyModel';
import { PHARMACY_ALERT_DAYS, pharmacyDaysUntil, pharmacyDotationKey } from './pharmacyModel';

export async function fetchPharmacyVessels(client: SupabaseClient): Promise<PharmacyVessel[]> {
  const { data, error } = await client.rpc('pharmacy_available_vessels');
  if (error) throw error;
  return data || [];
}
export async function fetchPharmacyRegister(client: SupabaseClient, vesselId: number): Promise<{ items: PharmacyItem[]; controls: PharmacyControl[]; categories: PharmacyCategory[] }> {
  const [items, controls, categories] = await Promise.all([
    client.from('pharmacy_inventory').select('*').eq('vessel_id', vesselId).order('id'),
    client.from('pharmacy_controls').select('*').eq('vessel_id', vesselId).order('created_at', { ascending: false }).order('id', { ascending: false }),
    client.from('pharmacy_categories').select('*').eq('vessel_id', vesselId).order('name'),
  ]);
  if (items.error) throw items.error;
  if (controls.error) throw controls.error;
  if (categories.error) throw categories.error;
  return { items: (items.data || []) as PharmacyItem[], controls: (controls.data || []) as PharmacyControl[], categories: (categories.data || []) as PharmacyCategory[] };
}
export async function savePharmacyCategory(client: SupabaseClient, vesselId: number, name: string, category?: PharmacyCategory, medicalDotation?: string): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 200) throw new Error('Renseignez un nom de catégorie entre 1 et 200 caractères.');
  if (category && category.vessel_id !== vesselId) throw new Error('Cette catégorie appartient à un autre navire.');
  if (category && medicalDotation !== undefined && pharmacyDotationKey(category.medical_dotation) !== pharmacyDotationKey(medicalDotation)) throw new Error('Cette catégorie appartient à une autre dotation médicale.');
  const { data, error } = await client.rpc('save_pharmacy_category', { p_vessel_id: vesselId, p_name: trimmed, p_id: category?.id ?? null, p_revision: category?.revision ?? null, p_medical_dotation: medicalDotation ?? category?.medical_dotation ?? null });
  if (error) throw error;
  return data as number;
}
export async function deletePharmacyCategory(client: SupabaseClient, vesselId: number, category: PharmacyCategory): Promise<void> {
  if (category.vessel_id !== vesselId) throw new Error('Cette catégorie appartient à un autre navire.');
  const { error } = await client.rpc('delete_pharmacy_category', { p_vessel_id: vesselId, p_id: category.id, p_revision: category.revision });
  if (error) throw error;
}
export async function savePharmacyItem(client: SupabaseClient, vesselId: number, draft: PharmacyItemDraft, item?: PharmacyItem): Promise<number> {
  const { data, error } = await client.rpc('save_pharmacy_item', { p_vessel_id: vesselId, p_item: draft, p_id: item?.id ?? null, p_revision: item?.revision ?? null });
  if (error) throw error;
  return data as number;
}
export function validatePharmacyControl(file: File, expiresOn: string, issuedOn?: string): void {
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) throw new Error('Choisissez un document PDF ou une image JPG / PNG.');
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('Le document doit peser entre 1 octet et 20 Mo.');
  if (pharmacyDaysUntil(expiresOn) === null) throw new Error('Renseignez une date d’échéance valide.');
  if (issuedOn && (pharmacyDaysUntil(issuedOn) === null || issuedOn > expiresOn)) throw new Error('La date de contrôle doit précéder l’échéance.');
}
export async function uploadPharmacyControl(client: SupabaseClient, vessel: PharmacyVessel, file: File, expiresOn: string, issuedOn?: string, expectedControlId: number | null = null): Promise<number> {
  validatePharmacyControl(file, expiresOn, issuedOn);
  const extension = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
  const path = `${vessel.company_id}/${vessel.id}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await client.storage.from('pharmacy-controls').upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;
  const { data, error } = await client.rpc('publish_pharmacy_control', {
    p_vessel_id: vessel.id, p_expected_control_id: expectedControlId, p_storage_path: path,
    p_file_name: file.name, p_file_size: file.size, p_mime_type: file.type,
    p_expires_on: expiresOn, p_issued_on: issuedOn || null,
  });
  // Retain an immutable upload on ambiguous responses: the transaction may have committed.
  if (error) throw error;
  return data as number;
}
export async function downloadPharmacyControl(client: SupabaseClient, path: string): Promise<Blob> {
  const { data, error } = await client.storage.from('pharmacy-controls').download(path);
  if (error || !data) throw error || new Error('Document de contrôle introuvable.');
  return data;
}
export async function fetchPharmacyNotifications(client: SupabaseClient): Promise<PharmacyNotification[]> {
  const { data, error } = await client.rpc('pharmacy_notifications');
  if (error) throw error;
  return data || [];
}

export async function fetchPharmacyVesselExpiryCounts(client: SupabaseClient): Promise<Record<number, PharmacyVesselExpiryCounts>> {
  const notifications = await fetchPharmacyNotifications(client);
  const counts: Record<number, PharmacyVesselExpiryCounts> = {};
  for (const notification of notifications) {
    const days = notification.days_until_expiry;
    if (notification.kind !== 'item' || !Number.isFinite(days) || days > PHARMACY_ALERT_DAYS) continue;
    const vesselCounts = counts[notification.vessel_id] ||= { due: 0, expired: 0 };
    if (days < 0) vesselCounts.expired += 1;
    else vesselCounts.due += 1;
  }
  return counts;
}
