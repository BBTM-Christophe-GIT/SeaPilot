import type { SupabaseClient } from '@supabase/supabase-js';
import { fleetIllustration, normalizeFleetName } from './fleetDisplay';
import { resolveFleetVesselPhotoUrl, type FleetVessel } from './fleetQueries';

export async function resolveFleetCoverPhotos(client: SupabaseClient, vessel: FleetVessel): Promise<string[]> {
  async function illustration() {
    if (!vessel.illustrationStorageBucket || !vessel.illustrationStoragePath) return '';
    const { data } = await client.storage.from(vessel.illustrationStorageBucket).createSignedUrl(vessel.illustrationStoragePath, 3600);
    return data?.signedUrl || '';
  }
  const [primary, backup] = await Promise.all([
    resolveFleetVesselPhotoUrl(client, vessel).catch(() => ''),
    illustration().catch(() => ''),
  ]);
  const goury = normalizeFleetName(vessel.name) === 'GOURY' ? '/vessels/goury.jpg' : '';
  return [...new Set([primary, vessel.photoUrl, goury, backup, fleetIllustration(vessel, vessel.illustrationThumbnailUrl)].filter(Boolean))];
}
