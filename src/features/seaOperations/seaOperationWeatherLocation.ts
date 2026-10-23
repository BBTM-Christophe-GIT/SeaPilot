import type { SeaOperationWaypointWeather } from './seaOperationWeatherModel';
import { seaDistanceToRouteNm } from './seaOperationNavigation';

const distance = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Keep the forecast's actual model cell visible, including a nearby marine replacement. */
export function seaOperationWeatherLocation(forecast: SeaOperationWaypointWeather): string {
  const model = forecast.model;
  if (!model) return '';
  const distanceKm = seaDistanceToRouteNm(model, [{ latitude: forecast.latitude, longitude: forecast.longitude }]) * 1.852;
  return `Point météo : ${model.latitude.toFixed(4)}, ${model.longitude.toFixed(4)} · à ${distance.format(distanceKm)} km du waypoint. Prévision de maille, position approchée.`;
}
