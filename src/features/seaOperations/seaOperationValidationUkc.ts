import type { SupabaseClient } from '@supabase/supabase-js';
import type { SeaOperationPayload, SeaOperationWaypoint } from './seaOperationModel';
import { seaWaypointPosition } from './seaOperationNavigation';
import { seaOperationEtaUtc } from './seaOperationWeatherModel';
import { isVesselDraftMeters } from './seaOperationUkc';
import { fetchSeaOperationWaypointUkc } from './seaOperationUkcQueries';
import { retainSeaOperationUkc, seaOperationUkcReference, waypointUkcSnapshot, type SeaOperationUkcReference } from './seaOperationWaypointSnapshots';

export interface SeaOperationUkcRequestStatus { loading: boolean; error?: string }
export function ukcRequestKey(reference: SeaOperationUkcReference, point: SeaOperationWaypoint): string {
  return JSON.stringify([reference.projectId || '', reference.vesselId, reference.draftMeters ?? null,
    point.id, point.latitude, point.longitude, point.eta, point.ukcMode || 'manual']);
}

/** Incomplete drafts remain saveable; only compatible available captures can complete a GO. */
export async function captureSeaOperationValidationUkc(client: SupabaseClient, payload: SeaOperationPayload,
  options: { signal?: AbortSignal; now?: number; missingOnly?: boolean; preview?: boolean;
    onError?: (point: SeaOperationWaypoint, error: string) => void } = {}): Promise<SeaOperationPayload> {
  options.signal?.throwIfAborted();
  const projectId = payload.planning?.projectId, draftMeters = payload.vessel.draftMeters, vesselId = payload.vessel.id;
  if (options.preview || !projectId || !vesselId || !isVesselDraftMeters(draftMeters)) return payload;
  const now = options.now ?? Date.now(), reference = seaOperationUkcReference(payload);
  const pending = payload.waypoints.flatMap(point => {
    if (point.ukcMode !== 'automatic' || options.missingOnly && waypointUkcSnapshot(point, reference)?.status === 'available') return [];
    const position = seaWaypointPosition(point); if (!position) return [];
    try { if (Date.parse(seaOperationEtaUtc(point.eta)) <= now) return []; } catch { return []; }
    return [{ point, input: { projectId, vesselId, draftMeters, pointId: point.id, ...position, eta: point.eta },
      context: { projectId, vesselId, draftMeters, pointId: point.id, latitude: point.latitude, longitude: point.longitude, eta: point.eta } }];
  });
  let captured = payload, next = 0;
  const worker = async () => {
    while (next < pending.length) {
      options.signal?.throwIfAborted(); const entry = pending[next++];
      try {
        const forecast = await fetchSeaOperationWaypointUkc(client, entry.input, { signal: options.signal });
        options.signal?.throwIfAborted(); captured = retainSeaOperationUkc(captured, forecast, entry.context);
      } catch (error) {
        options.signal?.throwIfAborted();
        options.onError?.(entry.point, error instanceof Error ? error.message : 'Le calcul UKC est indisponible. Réessayez.');
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, pending.length) }, worker));
  options.signal?.throwIfAborted(); return captured;
}
