import type { SupabaseClient } from '@supabase/supabase-js';
import type { SeaOperationPayload } from './seaOperationModel';
import { seaWaypointPosition } from './seaOperationNavigation';
import { isSeaOperationTransitRequestContext, seaOperationEtaUtc } from './seaOperationWeatherModel';
import { fetchSeaOperationWaypointWeather } from './seaOperationWeatherQueries';
import { retainSeaOperationWeather, seaOperationWeatherReference, waypointWeatherSnapshot } from './seaOperationWaypointSnapshots';

/** Collect available forecasts before a draft save or the revision the Captain will sign. */
export async function captureSeaOperationValidationWeather(client: SupabaseClient, payload: SeaOperationPayload,
  options: { preview?: boolean; signal?: AbortSignal; now?: number; missingOnly?: boolean } = {}): Promise<SeaOperationPayload> {
  options.signal?.throwIfAborted();
  const reference = seaOperationWeatherReference(payload);
  if (!reference.projectId && !isSeaOperationTransitRequestContext(reference.transit)) return payload;
  const now = options.now ?? Date.now();
  const pending = payload.waypoints.flatMap((point) => {
    const stored = waypointWeatherSnapshot(point);
    if (options.missingOnly && (stored?.wind || stored?.waves)) return [];
    const position = seaWaypointPosition(point);
    if (!position) return [];
    try { if (Date.parse(seaOperationEtaUtc(point.eta)) <= now) return []; } catch { return []; }
    return [{ input: { ...reference, pointId: point.id, ...position, eta: point.eta },
      context: { ...reference, pointId: point.id, latitude: point.latitude, longitude: point.longitude, eta: point.eta } }];
  });
  let captured = payload;
  let next = 0;
  const worker = async () => {
    while (next < pending.length) {
      options.signal?.throwIfAborted();
      const entry = pending[next++];
      try {
        const weather = await fetchSeaOperationWaypointWeather(client, entry.input, { preview: options.preview, signal: options.signal });
        options.signal?.throwIfAborted();
        captured = retainSeaOperationWeather(captured, weather, entry.context);
      } catch {
        // A forecast outage cannot fabricate a historical value or decide GO / NO GO.
        options.signal?.throwIfAborted();
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, pending.length) }, worker));
  options.signal?.throwIfAborted();
  return captured;
}
