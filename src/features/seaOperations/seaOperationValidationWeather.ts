import type { SupabaseClient } from '@supabase/supabase-js';
import type { SeaOperationPayload } from './seaOperationModel';
import { seaWaypointPosition } from './seaOperationNavigation';
import { seaOperationEtaUtc } from './seaOperationWeatherModel';
import { fetchSeaOperationWaypointWeather } from './seaOperationWeatherQueries';
import { retainSeaOperationWeather } from './seaOperationWaypointSnapshots';

/** Collect the available forecasts before saving the revision the Captain will sign. */
export async function captureSeaOperationValidationWeather(client: SupabaseClient, payload: SeaOperationPayload,
  options: { preview?: boolean; signal?: AbortSignal; now?: number } = {}): Promise<SeaOperationPayload> {
  options.signal?.throwIfAborted();
  const projectId = payload.planning?.projectId;
  if (!projectId) return payload;
  const now = options.now ?? Date.now();
  const pending = payload.waypoints.flatMap((point) => {
    const position = seaWaypointPosition(point);
    if (!position) return [];
    try { if (Date.parse(seaOperationEtaUtc(point.eta)) <= now) return []; } catch { return []; }
    return [{ input: { projectId, pointId: point.id, ...position, eta: point.eta },
      context: { projectId, pointId: point.id, latitude: point.latitude, longitude: point.longitude, eta: point.eta } }];
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
