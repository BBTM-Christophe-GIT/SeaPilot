import { parseSeaCoordinate } from './seaOperationNavigation';

type Coordinate = number | string;
type Axis = 'latitude' | 'longitude';
type MinuteDecimals = 3 | 4;

function coordinateNumber(value: Coordinate, axis: Axis): number | null {
  if (typeof value === 'string') return parseSeaCoordinate(value, axis);
  return Number.isFinite(value) && Math.abs(value) <= (axis === 'latitude' ? 90 : 180) ? value : null;
}

/** SMCP §11.1 display only; minute precision can differ by surface.
 * https://wwwcdn.imo.org/localresources/en/OurWork/Safety/Documents/A.918(22).pdf
 * Keep the original coordinate and its precision in storage and requests.
 */
function formatCoordinate(value: Coordinate, axis: Axis, minuteDecimals: MinuteDecimals): string {
  const decimal = coordinateNumber(value, axis);
  if (decimal === null) return typeof value === 'string' ? value.trim() : '';
  const negative = decimal < 0 || Object.is(decimal, -0);
  // Round total minutes first so rounding can carry into the degree field.
  const unitsPerMinute = minuteDecimals === 4 ? 10_000 : 1_000;
  const unitsPerDegree = 60 * unitsPerMinute;
  const totalUnits = Math.round(Math.abs(decimal) * unitsPerDegree);
  const degrees = Math.floor(totalUnits / unitsPerDegree);
  const minutes = ((totalUnits % unitsPerDegree) / unitsPerMinute).toFixed(minuteDecimals).padStart(minuteDecimals + 3, '0');
  const hemisphere = axis === 'latitude' ? negative ? 'S' : 'N' : negative ? 'W' : 'E';
  return `${String(degrees).padStart(axis === 'latitude' ? 2 : 3, '0')}° ${minutes}′ ${hemisphere}`;
}

export const formatSeaLatitude = (value: Coordinate, minuteDecimals: MinuteDecimals = 3): string => formatCoordinate(value, 'latitude', minuteDecimals);
export const formatSeaLongitude = (value: Coordinate, minuteDecimals: MinuteDecimals = 3): string => formatCoordinate(value, 'longitude', minuteDecimals);

export function formatSeaPosition(position: { latitude: Coordinate; longitude: Coordinate }, minuteDecimals: MinuteDecimals = 3): string {
  return `${formatSeaLatitude(position.latitude, minuteDecimals) || 'Latitude à renseigner'} — ${formatSeaLongitude(position.longitude, minuteDecimals) || 'Longitude à renseigner'}`;
}
