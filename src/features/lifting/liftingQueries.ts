import type { SupabaseClient } from '@supabase/supabase-js';
import type { InspectionEntry, ItemDraft, LiftingInspection, LiftingItem, LiftingKind, LiftingVessel } from './liftingModel';
import { uploadLiftingCertificate, validateLiftingCertificate, type UploadedLiftingCertificate } from './liftingCertificateQueries';

export async function fetchLiftingCanStart(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client.rpc('lifting_can_start_inspection');
  if (error) throw error;
  return data === true;
}
export async function replaceLiftingItem(client: SupabaseClient, item: LiftingItem, date: string, files: File[] = []) {
  files.forEach(validateLiftingCertificate);
  const certificates: UploadedLiftingCertificate[] = [];
  for (const file of files) certificates.push(await uploadLiftingCertificate(client, item, file, (item.service_version ?? 1) + 1));
  const { error } = await client.rpc('replace_lifting_item', { p_id: item.id, p_service_version: item.service_version ?? 1, p_commissioned_on: date, p_certificates: certificates });
  if (error) throw error;
}

export async function fetchLiftingVessels(client: SupabaseClient): Promise<LiftingVessel[]> {
  const { data, error } = await client.rpc('lifting_available_vessels');
  if (error) throw error;
  // The role-scoped RPC supplies the small, cacheable thumbnail URL directly.
  // Opening an inventory never waits for signed URLs or original photographs.
  return (data || []) as LiftingVessel[];
}
// Paper forms always read current inventory, independently of UI filters and report snapshots.
export async function fetchLiftingPaperInventory(client: SupabaseClient, vesselId: number, kind: LiftingKind) {
  const [vessels, result] = await Promise.all([
    fetchLiftingVessels(client),
    client.from('lifting_inventory').select('*').eq('vessel_id', vesselId).eq('kind', kind).eq('active', true).order('reference'),
  ]);
  if (result.error) throw result.error;
  const vessel = vessels.find((candidate) => candidate.id === vesselId);
  if (!vessel) throw new Error('Ce navire ou site n’est plus accessible. Rechargez le registre.');
  const items = (result.data || []) as LiftingItem[];
  if (!items.length) throw new Error('Aucun matériel actif dans ce registre pour le navire ou site choisi.');
  return { vessel, items };
}
export async function fetchLiftingRegister(client: SupabaseClient, vesselId: number, kind: LiftingKind) {
  const [items, inspections] = await Promise.all([
    client.from('lifting_inventory').select('*').eq('vessel_id', vesselId).eq('kind', kind).order('reference'),
    client.from('lifting_inspections').select('*').eq('vessel_id', vesselId).eq('kind', kind).order('issued_on', { ascending: false }).order('id', { ascending: false }),
  ]);
  if (items.error) throw items.error;
  if (inspections.error) throw inspections.error;
  const orderedItems = [...(items.data || []) as LiftingItem[]].sort((a, b) => a.reference.localeCompare(b.reference, 'fr', { numeric: true }));
  return { items: orderedItems, inspections: (inspections.data || []) as LiftingInspection[] };
}
export async function fetchInspectionEntries(client: SupabaseClient, id: number): Promise<InspectionEntry[]> {
  const { data, error } = await client.from('lifting_inspection_entries').select('*').eq('inspection_id', id).order('id');
  if (error) throw error;
  return data || [];
}
export async function saveLiftingItem(client: SupabaseClient, vesselId: number, kind: LiftingKind, draft: ItemDraft, id?: number) {
  const { data, error } = await client.rpc('save_lifting_item', { p_vessel_id: vesselId, p_kind: kind, p_item: draft, p_id: id || null });
  if (error) throw error;
  return data as number;
}
export async function setLiftingItemActive(client: SupabaseClient, id: number, active: boolean) {
  const { error } = await client.rpc('set_lifting_item_active', { p_id: id, p_active: active });
  if (error) throw error;
}
export async function startLiftingInspection(client: SupabaseClient, vesselId: number, kind: LiftingKind, issuedOn: string, expiresOn: string) {
  const { data, error } = await client.rpc('start_lifting_inspection', { p_vessel_id: vesselId, p_kind: kind, p_issued_on: issuedOn, p_expires_on: expiresOn });
  if (error) throw error;
  return data as number;
}
export async function saveInspectionEntry(client: SupabaseClient, inspection: LiftingInspection, entry: InspectionEntry): Promise<number> {
  const { data, error } = await client.rpc('save_lifting_inspection_entry', {
    p_inspection_id: inspection.id, p_entry_id: entry.id, p_revision: inspection.revision,
    p_condition: entry.condition, p_checks: entry.checks, p_observations: entry.observations,
  });
  if (error) throw error;
  return data as number;
}
export async function deleteLiftingInspectionDraft(client: SupabaseClient, inspection: LiftingInspection) {
  if (inspection.status !== 'draft') throw new Error('Seul un brouillon peut être supprimé.');
  const { error } = await client.rpc('delete_lifting_inspection_draft', { p_id: inspection.id, p_revision: inspection.revision });
  if (error) throw error;
}
export async function saveInspectionEntries(client: SupabaseClient, inspection: LiftingInspection, entries: InspectionEntry[]): Promise<number> {
  const { data, error } = await client.rpc('save_lifting_inspection_entries', {
    p_inspection_id: inspection.id, p_revision: inspection.revision,
    p_entries: entries.map((entry) => ({ id: entry.id, condition: entry.condition, checks: entry.checks, observations: entry.observations })),
  });
  if (error) throw error;
  return data as number;
}
export async function publishLiftingInspection(client: SupabaseClient, inspection: LiftingInspection, blob: Blob, filename: string): Promise<number> {
  // An immutable upload plus a revision check avoids publishing a stale inspection or creating duplicate certificates on retry.
  const path = `${inspection.company_id}/${inspection.vessel_snapshot.acronym || inspection.vessel_id}/lifting/${inspection.id}/${inspection.revision}-${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await client.storage.from('fleet-certificates').upload(path, blob, { contentType: 'application/pdf', upsert: false });
  if (uploadError) throw uploadError;
  const { data, error } = await client.rpc('publish_lifting_inspection', {
    p_id: inspection.id, p_revision: inspection.revision, p_storage_path: path,
    p_file_name: filename, p_file_size: blob.size,
  });
  // Do not delete the upload after an ambiguous network response: the transaction may have committed.
  if (error) throw error;
  return data as number;
}
export async function downloadLiftingReport(client: SupabaseClient, path: string): Promise<Blob> {
  const { data, error } = await client.storage.from('fleet-certificates').download(path);
  if (error || !data) throw error || new Error('Rapport introuvable.');
  return data;
}
export async function loadLiftingStamp(client: SupabaseClient, companyId: number): Promise<Uint8Array> {
  const { data, error } = await client.storage.from('lifting-assets').download(`${companyId}/antoine-monceaux.png`);
  if (error || !data) throw new Error('Le tampon du vérificateur est indisponible. Le rapport reste en brouillon.');
  return new Uint8Array(await data.arrayBuffer());
}
