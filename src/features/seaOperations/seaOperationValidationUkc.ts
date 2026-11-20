import type { SupabaseClient } from '@supabase/supabase-js';
import type { SeaOperationPayload, SeaOperationWaypoint } from './seaOperationModel';
import { seaWaypointPosition } from './seaOperationNavigation';
import { isSeaOperationTransitRequestContext, seaOperationEtaUtc } from './seaOperationWeatherModel';
import { isVesselDraftMeters } from './seaOperationUkc';
import { fetchSeaOperationWaypointUkc } from './seaOperationUkcQueries';
import { calculateSeaOperationCopernicusEstimate, validateSeaOperationCopernicusInput } from './seaOperationCopernicusModel';
import { retainSeaOperationUkc, seaOperationUkcReference, waypointUkcSnapshot, type SeaOperationUkcReference } from './seaOperationWaypointSnapshots';

const UKC_VALIDATION_TIMEOUT_MS = 12_000;

export interface SeaOperationUkcRequestStatus { loading: boolean; error?: string }
export function ukcRequestKey(reference: SeaOperationUkcReference, point: SeaOperationWaypoint): string {
  return JSON.stringify([reference.projectId || '', reference.vesselId, reference.draftMeters ?? null,
    reference.transit?.date ?? null, reference.transit?.vesselId ?? null,
    point.id, point.latitude, point.longitude, point.eta, point.ukcMode || 'manual']);
}

/** Save compatible estimates and the reason when an automatic estimate is unavailable. */
export async function captureSeaOperationValidationUkc(client: SupabaseClient, payload: SeaOperationPayload,
  options: { signal?: AbortSignal; now?: number; missingOnly?: boolean; preview?: boolean;
    onError?: (point: SeaOperationWaypoint, error: string) => void } = {}): Promise<SeaOperationPayload> {
  options.signal?.throwIfAborted();
  const reference = seaOperationUkcReference(payload), { projectId, transit } = reference;
  const draftMeters = payload.vessel.draftMeters, vesselId = payload.vessel.id;
  if (options.preview || !projectId && !isSeaOperationTransitRequestContext(transit) || !vesselId || !isVesselDraftMeters(draftMeters)) return payload;
  const request = { projectId: projectId ?? '', ...(transit === undefined ? {} : { transit }) };
  const now = options.now ?? Date.now();
  const pending = payload.waypoints.flatMap(point => {
    if (point.ukcMode !== 'automatic') return [];
    const stored = waypointUkcSnapshot(point, reference);
    if (options.missingOnly && stored?.status === 'available') return [];
    const position = seaWaypointPosition(point); if (!position) return [];
    try {
      const identity = { ...request, vesselId, draftMeters, pointId: point.id };
      const input = validateSeaOperationCopernicusInput({ ...identity, ...position, eta: point.eta });
      const pastEta = Date.parse(seaOperationEtaUtc(point.eta)) <= now;
      if (pastEta && stored) return [];
      return [{ point, pastEta, input, context: { ...identity, latitude: point.latitude, longitude: point.longitude, eta: point.eta } }];
    } catch { return []; }
  });
  if (!pending.length) return payload;
  const deadlineController = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, deadlineController.signal]) : deadlineController.signal;
  let captured = payload, next = 0;
  const worker = async () => {
    while (!signal.aborted && next < pending.length) {
      const entry = pending[next++];
      if (entry.pastEta) {
        const unavailable = calculateSeaOperationCopernicusEstimate(entry.input, {
          status: 'unavailable', reasonCode: 'past-eta', message: 'L’ETA est passée et aucune estimation n’a été enregistrée.',
          source: null, cell: null, waterLevel: null,
        }, new Date(now).toISOString());
        captured = retainSeaOperationUkc(captured, unavailable, entry.context);
        continue;
      }
      try {
        const forecast = await fetchSeaOperationWaypointUkc(client, entry.input, { signal });
        if (signal.aborted) return;
        captured = retainSeaOperationUkc(captured, forecast, entry.context);
      } catch (error) {
        if (signal.aborted) return;
        const message = error instanceof Error ? error.message : 'Le calcul UKC est indisponible. Réessayez.';
        options.onError?.(entry.point, message);
        const unavailable = calculateSeaOperationCopernicusEstimate(entry.input, {
          status: 'unavailable', message, source: null, cell: null, waterLevel: null,
        }, new Date(options.now ?? Date.now()).toISOString());
        captured = retainSeaOperationUkc(captured, unavailable, entry.context);
      }
    }
  };
  let stopWaiting!: () => void;
  const stopped = new Promise<void>(resolve => { stopWaiting = resolve; });
  signal.addEventListener('abort', stopWaiting, { once: true });
  const deadline = setTimeout(() => deadlineController.abort(), UKC_VALIDATION_TIMEOUT_MS);
  try {
    // Authentication and network waits may outlive cancellation.
    await Promise.race([Promise.all(Array.from({ length: Math.min(2, pending.length) }, worker)), stopped]);
    options.signal?.throwIfAborted();
    return captured;
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener('abort', stopWaiting);
  }
}
