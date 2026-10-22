import type { SupabaseClient } from '@supabase/supabase-js';
import { compareFleetAssets } from '../fleet/fleetDisplay';
import { countVesselExpiries, VESSEL_EXPIRY_ALERT_DAYS, type VesselExpiryCounts } from '../fleet/vesselExpiryAlerts';
import type { LiftingVessel } from '../lifting/liftingModel';
import type { LsaCatalog, LsaDraft, LsaEvent, LsaItem, LsaVersion } from './lsaModel';

export async function fetchLsaCatalog(client: SupabaseClient): Promise<LsaCatalog> {
  const [types, designations] = await Promise.all([
    client.from('lsa_equipment_types').select('*').order('name'),
    client.from('lsa_designations').select('*').order('name'),
  ]);
  if (types.error) throw types.error;
  if (designations.error) throw designations.error;
  return { types: types.data || [], designations: designations.data || [] };
}

export async function saveLsaCatalogEntry(client: SupabaseClient, kind: 'type' | 'designation', entry: {
  id?: number; name: string; equipment_type_id?: number; active: boolean; updated_at?: string;
}) {
  const { error } = await client.rpc('save_lsa_catalog_entry', { p_kind: kind, p_entry: entry });
  if (error) throw error;
}

export async function fetchLsaVessels(client: SupabaseClient): Promise<LiftingVessel[]> {
  const { data, error } = await client.rpc('lsa_available_vessels');
  if (error) throw error;
  return [...(data || []) as LiftingVessel[]].sort(compareFleetAssets);
}

export async function fetchLsaVesselExpiryCounts(client: SupabaseClient, today: string): Promise<Record<number, VesselExpiryCounts>> {
  const until = new Date(`${today}T12:00:00Z`);
  until.setUTCDate(until.getUTCDate() + VESSEL_EXPIRY_ALERT_DAYS);
  const rows = new Map<number, Pick<LsaItem, 'id' | 'vessel_id' | 'expires_on'>>();
  // Current equipment only: RLS enforces company, module and vessel scope.
  // An error on any page invalidates the whole snapshot instead of reporting partial zeroes.
  for (let offset = 0; ; offset += 750) {
    const { data, error } = await client.from('lsa_items').select('id,vessel_id,expires_on')
      .is('deleted_at', null).lte('expires_on', until.toISOString().slice(0, 10))
      .order('id').range(offset, offset + 749);
    if (error) throw error;
    const page = (data || []) as Pick<LsaItem, 'id' | 'vessel_id' | 'expires_on'>[];
    page.forEach((item) => rows.set(item.id, item));
    if (page.length < 750) break;
  }
  return countVesselExpiries([...rows.values()], today);
}

export async function fetchLsaCreateAccess(client: SupabaseClient, vesselId: number): Promise<boolean> {
  const { data, error } = await client.rpc('lsa_can_add_item', { p_vessel_id: vesselId });
  if (error) throw error;
  return data === true;
}

export async function fetchLsaRegister(client: SupabaseClient, vesselId: number) {
  const { data, error } = await client.from('lsa_items').select('*').eq('vessel_id', vesselId).order('id');
  if (error) throw error;
  const items = (data || []) as LsaItem[];
  if (!items.length) return { items, versions: [] as LsaVersion[], events: [] as LsaEvent[] };
  const ids = items.map((item) => item.id);
  const [versions, events] = await Promise.all([
    client.from('lsa_versions').select('*').in('certificate_id', ids).order('created_at', { ascending: false }),
    client.from('lsa_renewal_events').select('*').in('certificate_id', ids).order('created_at', { ascending: false }),
  ]);
  if (versions.error) throw versions.error;
  if (events.error) throw events.error;
  return { items, versions: (versions.data || []) as LsaVersion[], events: (events.data || []) as LsaEvent[] };
}

export async function saveLsaItem(client: SupabaseClient, vesselId: number, draft: LsaDraft, item?: LsaItem) {
  const { error } = await client.rpc('save_lsa_item', {
    p_vessel_id: vesselId, p_item: draft, p_id: item?.id ?? null, p_expected_updated_at: item?.updated_at ?? null,
  });
  if (error) throw error;
}

export async function updateLsaItemExpiry(client: SupabaseClient, item: LsaItem, expiresOn: string) {
  const { error } = await client.rpc('update_lsa_item_expiry', {
    p_id: item.id, p_expires_on: expiresOn, p_expected_updated_at: item.updated_at,
  });
  if (error) throw error;
}

export async function deleteLsaItem(client: SupabaseClient, item: LsaItem) {
  const { error } = await client.rpc('delete_lsa_item', {
    p_id: item.id, p_expected_updated_at: item.updated_at,
  });
  if (error) throw error;
}

export async function downloadLsaDocument(client: SupabaseClient, document: { storage_bucket: string | null; storage_path: string | null }) {
  if (!document.storage_bucket || !document.storage_path) throw new Error('Aucun fichier associé.');
  const { data, error } = await client.storage.from(document.storage_bucket).download(document.storage_path);
  if (error || !data) throw error || new Error('Le document est indisponible.');
  return data;
}

export async function fetchNextLsaNumber(client: SupabaseClient, vesselId: number, designationId: number): Promise<number> {
  const { data, error } = await client.rpc('lsa_next_item_number', { p_vessel_id: vesselId, p_designation_id: designationId });
  if (error) throw error;
  return data as number;
}
