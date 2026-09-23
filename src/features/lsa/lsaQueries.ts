import type { SupabaseClient } from '@supabase/supabase-js';
import { compareFleetAssets } from '../fleet/fleetDisplay';
import type { LiftingVessel } from '../lifting/liftingModel';
import type { LsaDraft, LsaEvent, LsaItem, LsaVersion } from './lsaModel';

export async function fetchLsaVessels(client: SupabaseClient): Promise<LiftingVessel[]> {
  const { data, error } = await client.rpc('lsa_available_vessels');
  if (error) throw error;
  return [...(data || []) as LiftingVessel[]].sort(compareFleetAssets);
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

export async function downloadLsaDocument(client: SupabaseClient, document: { storage_bucket: string | null; storage_path: string | null }) {
  if (!document.storage_bucket || !document.storage_path) throw new Error('Aucun fichier associé.');
  const { data, error } = await client.storage.from(document.storage_bucket).download(document.storage_path);
  if (error || !data) throw error || new Error('Le document est indisponible.');
  return data;
}
