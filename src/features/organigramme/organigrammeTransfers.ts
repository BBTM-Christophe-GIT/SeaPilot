import type { SupabaseClient } from '@supabase/supabase-js';
import { compareFleetAssets } from '../fleet/fleetDisplay';
import { resolveMemberships, type OrgData, type OrgWatch } from './organigrammeModel';

export interface OrgWatchDestination {
  key: string;
  vesselId: number;
  vesselName: string;
  watchId: number | null;
  watchName: string;
  memberIds: ReadonlySet<number>;
}

export const orgWatchLocationKey = (vesselId: number, watchName: string) => vesselId + ':' + watchName;

export function orgDestinationLabel({ vesselName, watchName }: OrgWatchDestination) {
  return vesselName + ' · ' + watchName;
}

export function orgCanReceiveMember(destination: OrgWatchDestination, personId: number, fromWatchId: number | null) {
  return (fromWatchId === null || destination.watchId !== fromWatchId) && !destination.memberIds.has(personId);
}

export function orgTransferFleet(data: OrgData) {
  const byVessel = new Map<number, OrgWatch[]>();
  const membersByWatch = new Map<string, Set<number>>();
  for (const row of resolveMemberships(data)) {
    const key = orgWatchLocationKey(row.vesselId, row.watchGroup);
    const members = membersByWatch.get(key) ?? new Set<number>();
    members.add(row.personId);
    membersByWatch.set(key, members);
  }
  for (const watch of data.watches ?? []) {
    const watches = byVessel.get(watch.vesselId) ?? [];
    watches.push(watch);
    byVessel.set(watch.vesselId, watches);
  }
  return [...data.vessels].sort(compareFleetAssets).map((vessel) => {
    const watches = byVessel.get(vessel.id) ?? [];
    const destinations: OrgWatchDestination[] = watches
      .sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }))
      .map((watch) => ({
        key: 'watch:' + watch.id, vesselId: vessel.id, vesselName: vessel.name, watchId: watch.id, watchName: watch.name,
        memberIds: membersByWatch.get(orgWatchLocationKey(vessel.id, watch.name)) ?? new Set(),
      }));
    if (!destinations.length) {
      destinations.push({ key: 'vessel:' + vessel.id, vesselId: vessel.id, vesselName: vessel.name, watchId: null, watchName: 'Bordée 1', memberIds: new Set() });
    }
    return { ...vessel, destinations };
  });
}

export async function moveOrgWatchMember(
  client: SupabaseClient,
  chartId: number,
  personId: number,
  fromWatchId: number | null,
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
    const operation = fromWatchId === null ? 'd’affecter' : 'de déplacer';
    throw new Error('Impossible ' + operation + ' ce collaborateur. Actualisez l’organigramme puis réessayez.', { cause: error });
  }
}
