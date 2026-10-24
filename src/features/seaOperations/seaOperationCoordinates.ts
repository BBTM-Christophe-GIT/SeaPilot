import { parseSeaCoordinate } from './seaOperationNavigation';

type Coordinate = number | string;
type Axis = 'latitude' | 'longitude';

function coordinateNumber(value: Coordinate, axis: Axis): number | null {
  if (typeof value === 'string') return parseSeaCoordinate(value, axis);
  return Number.isFinite(value) && Math.abs(value) <= (axis === 'latitude' ? 90 : 180) ? value : null;
}

/** SMCP §11.1 display only; three minute decimals are the requested presentation choice.
 * https://wwwcdn.imo.org/localresources/en/OurWork/Safety/Documents/A.918(22).pdf
 * Keep the original coordinate and its precision in storage and requests.
 */
function formatCoordinate(value: Coordinate, axis: Axis): string {
  const decimal = coordinateNumber(value, axis);
  if (decimal === null) return typeof value === 'string' ? value.trim() : '';
  const negative = decimal < 0 || Object.is(decimal, -0);
  // Round the total minutes first so 59.9995′ carries into the degree field.
  const thousandthsOfMinute = Math.round(Math.abs(decimal) * 60_000);
  const degrees = Math.floor(thousandthsOfMinute / 60_000);
  const minutes = ((thousandthsOfMinute % 60_000) / 1000).toFixed(3).padStart(6, '0');
  const hemisphere = axis === 'latitude' ? negative ? 'S' : 'N' : negative ? 'W' : 'E';
  return `${String(degrees).padStart(axis === 'latitude' ? 2 : 3, '0')}° ${minutes}′ ${hemisphere}`;
}

export const formatSeaLatitude = (value: Coordinate): string => formatCoordinate(value, 'latitude');
export const formatSeaLongitude = (value: Coordinate): string => formatCoordinate(value, 'longitude');

export function formatSeaPosition(position: { latitude: Coordinate; longitude: Coordinate }): string {
  return `${formatSeaLatitude(position.latitude) || 'Latitude à renseigner'} — ${formatSeaLongitude(position.longitude) || 'Longitude à renseigner'}`;
}
