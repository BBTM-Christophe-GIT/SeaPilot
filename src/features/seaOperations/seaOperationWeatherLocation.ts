import type { SeaOperationWaypointWeather } from './seaOperationWeatherModel';
import { seaDistanceToRouteNm } from './seaOperationNavigation';
import { formatSeaPosition } from './seaOperationCoordinates';

const distance = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Keep the forecast's actual model cell visible, including a nearby marine replacement. */
export function seaOperationWeatherLocation(forecast: SeaOperationWaypointWeather): string {
  const model = forecast.model;
  if (!model) return '';
  const distanceKm = model.distanceKm ?? seaDistanceToRouteNm(model, [{ latitude: forecast.latitude, longitude: forecast.longitude }]) * 1.852;
  const selection = model.selection === 'marine-fallback' ? 'Maille marine voisine.' : 'Prévision de maille, position approchée.';
  return `Point météo : ${formatSeaPosition(model)} · à ${distance.format(distanceKm)} km du waypoint. ${selection}`;
}

export function seaOperationWeatherGridLocations(forecast: SeaOperationWaypointWeather): string[] {
  if (forecast.model) return [seaOperationWeatherLocation(forecast)];
  const components = [{ label: 'Vent', grid: forecast.wind?.grid }, { label: 'Houle', grid: forecast.waves?.grid },
    { label: 'Mer totale', grid: forecast.seaState?.grid }];
  return components.flatMap(({ label, grid }) => grid ? [`Maille ${label.toLowerCase()} · ${formatSeaPosition(grid)} · à ${distance.format(grid.distanceKm)} km du waypoint.`] : []);
}
