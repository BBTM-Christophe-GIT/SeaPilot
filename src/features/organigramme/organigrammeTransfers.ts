import type { SupabaseClient } from '@supabase/supabase-js';

export async function moveOrgWatchMember(
  client: SupabaseClient,
  chartId: number,
  personId: number,
  fromWatchId: number,
  vesselId: number,
  toWatchId: number | null,
): Promise<void> {
  const { error } = await client.rpc('move_organigramme_watch_member', {
    p_chart_id: chartId,
    p_person_id: personId,
    p_from_watch_id: fromWatchId,
    p_to_vessel_id: vesselId,
    p_to_watch_id: toWatchId,
  });
  if (error) {
    throw new Error('Impossible de déplacer ce collaborateur. Actualisez l’organigramme puis réessayez.', { cause: error });
  }
}
