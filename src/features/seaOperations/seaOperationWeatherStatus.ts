import type { SeaOperationWaypoint } from './seaOperationModel';
import { seaWaypointPosition } from './seaOperationNavigation';
import { seaOperationEtaUtc } from './seaOperationWeatherModel';
import { waypointWeatherSnapshot } from './seaOperationWaypointSnapshots';

export interface WeatherRequestStatus { loading: boolean; error?: string }

/** Capture data is excluded so receiving a forecast does not start another request. */
export function weatherRequestKey(projectId: string, point: Pick<SeaOperationWaypoint, 'id' | 'latitude' | 'longitude' | 'eta'>): string {
  return JSON.stringify([projectId, point.id, point.latitude, point.longitude, point.eta]);
}

export function initialSeaOperationWeatherStatus(projectId: string, point: SeaOperationWaypoint): WeatherRequestStatus {
  const stored = waypointWeatherSnapshot(point);
  if (stored) return { loading: false };
  if (!projectId) return { loading: false, error: 'Sélectionnez un projet du planning pour consulter la météo.' };
  if (!seaWaypointPosition(point)) return { loading: false, error: 'Renseignez la latitude et la longitude pour consulter la météo.' };
  try { seaOperationEtaUtc(point.eta); }
  catch (error) { return { loading: false, error: (error as Error).message }; }
  return { loading: true };
}
