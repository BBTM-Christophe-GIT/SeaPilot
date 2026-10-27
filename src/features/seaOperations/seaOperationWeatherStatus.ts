import type { SeaOperationWaypoint } from './seaOperationModel';
import { seaWaypointPosition } from './seaOperationNavigation';
import { isSeaOperationTransitRequestContext, seaOperationEtaUtc, type SeaOperationTransitRequestContext } from './seaOperationWeatherModel';
import { waypointWeatherSnapshot } from './seaOperationWaypointSnapshots';

export interface WeatherRequestStatus { loading: boolean; error?: string }

/** Capture data is excluded so receiving a forecast does not start another request. */
export type SeaOperationWeatherReference = string | { projectId: string; transit?: SeaOperationTransitRequestContext };
export function weatherRequestKey(reference: SeaOperationWeatherReference, point: Pick<SeaOperationWaypoint, 'id' | 'latitude' | 'longitude' | 'eta'>): string {
  const { projectId, transit } = typeof reference === 'string' ? { projectId: reference } : reference;
  return JSON.stringify([projectId, point.id, point.latitude, point.longitude, point.eta, ...(transit ? [transit.date, transit.vesselId] : [])]);
}

export function initialSeaOperationWeatherStatus(reference: SeaOperationWeatherReference, point: SeaOperationWaypoint): WeatherRequestStatus {
  const { projectId, transit } = typeof reference === 'string' ? { projectId: reference } : reference;
  const stored = waypointWeatherSnapshot(point);
  if (stored) return { loading: false };
  if (!projectId && !isSeaOperationTransitRequestContext(transit)) return { loading: false, error: 'Sélectionnez un projet du planning ou un navire et une date de Transit pour consulter la météo.' };
  if (!seaWaypointPosition(point)) return { loading: false, error: 'Renseignez la latitude et la longitude pour consulter la météo.' };
  try { seaOperationEtaUtc(point.eta); }
  catch (error) { return { loading: false, error: (error as Error).message }; }
  return { loading: true };
}
