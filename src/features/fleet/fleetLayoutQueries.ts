import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeFleetLayout, type FleetLayout } from './fleetLayout';

export async function fetchFleetLayout(client: SupabaseClient, companyId: number): Promise<FleetLayout> {
  const { data, error } = await client.from('fleet_vessel_layouts').select('layout').eq('company_id', companyId).maybeSingle();
  if (error) throw error;
  return normalizeFleetLayout(data?.layout);
}

export async function saveFleetLayout(client: SupabaseClient, companyId: number, layout: FleetLayout): Promise<FleetLayout> {
  const normalized = normalizeFleetLayout(layout);
  const { data, error } = await client.from('fleet_vessel_layouts')
    .upsert({ company_id: companyId, layout: normalized }, { onConflict: 'company_id' })
    .select('layout').single();
  if (error) throw error;
  return normalizeFleetLayout(data.layout);
}
