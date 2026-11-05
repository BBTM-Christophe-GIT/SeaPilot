import type { SupabaseClient } from '@supabase/supabase-js';
import type { FleetAssetKind } from '../fleet/fleetDisplay';

export interface PermitLocation {
  id: number;
  name: string;
  asset_kind: FleetAssetKind;
  length_overall?: string | null;
  can_sign: boolean;
}

export type PermitAnswers = Record<string, string>;
export type PlanPoint = { x: number; y: number };
export type ExclusionZone = { planKey: string; points: PlanPoint[] };
export type PermitAction = 'sign' | 'pause' | 'resume' | 'close';

export interface PermitValues {
  title: string;
  permit_type: string;
  plan_key: string | null;
  zone: string;
  point_x: number | null;
  point_y: number | null;
  starts_at: string;
  exclusion_zones: ExclusionZone[];
  checklist_answers: PermitAnswers;
  closing_answers: PermitAnswers;
}

export interface WorkPermit extends PermitValues {
  id: string;
  vessel_id: number;
  status: 'draft' | 'open' | 'paused' | 'closed';
  ends_at: string | null;
  paused_at: string | null;
  paused_seconds: number;
  pause_history: unknown[];
  captain_signed_at: string | null;
  captain_signer_name: string | null;
  closed_at: string | null;
  updated_at: string;
}

const columns = 'id,vessel_id,status,title,permit_type,plan_key,zone,point_x,point_y,starts_at,ends_at,paused_at,paused_seconds,pause_history,exclusion_zones,checklist_answers,closing_answers,captain_signed_at,captain_signer_name,closed_at,updated_at';

export async function loadWorkPermits(client: SupabaseClient) {
  const [locations, permits] = await Promise.all([
    client.rpc('list_work_permit_locations_with_lengths'),
    client.from('qhse_work_permits').select(columns).order('starts_at').order('id').range(0, 499),
  ]);
  if (locations.error) throw new Error(locations.error.message);
  if (permits.error) throw new Error(permits.error.message);
  const list = (permits.data ?? []) as WorkPermit[];
  // PostgREST limits each response. Page through the complete visible register.
  for (let offset = 500; list.length === offset; offset += 500) {
    const page = await client.from('qhse_work_permits').select(columns).order('starts_at').order('id').range(offset, offset + 499);
    if (page.error) throw new Error(page.error.message);
    list.push(...(page.data ?? []) as WorkPermit[]);
  }
  return { locations: (locations.data ?? []) as PermitLocation[], permits: list };
}

export async function saveWorkPermit(client: SupabaseClient, locationId: number, values: Partial<PermitValues>, current?: WorkPermit) {
  const table = client.from('qhse_work_permits');
  const mutation = current
    ? table.update(values).eq('id', current.id).eq('updated_at', current.updated_at)
    : table.insert({ ...values, vessel_id: locationId });
  const { data, error } = await mutation.select(columns).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Le permis a été modifié ou votre accès a changé. Actualisez le registre avant de réessayer.');
  return data as WorkPermit;
}

export async function transitionWorkPermit(client: SupabaseClient, permit: WorkPermit, action: PermitAction) {
  const { error } = await client.rpc(`${action}_work_permit`, {
    p_permit_id: permit.id,
    p_expected_updated_at: permit.updated_at,
  });
  if (error) throw new Error(error.message);
}

export async function deleteWorkPermit(client: SupabaseClient, permit: WorkPermit) {
  const { error } = await client.rpc('delete_work_permit', {
    p_permit_id: permit.id,
    p_expected_updated_at: permit.updated_at,
  });
  if (error) throw new Error(error.message);
}
