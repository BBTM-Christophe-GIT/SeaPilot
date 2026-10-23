/** Measured weather remains separate from the forecast signed by the Captain. */
export interface SeaOperationWeatherObservationInput {
  pointId: string;
  latitude: number;
  longitude: number;
  etaUtc: string;
}

export interface SeaOperationObservationStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
}

export interface SeaOperationObservationSource {
  provider: 'Météo-France' | 'Met Office';
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  /** Météo-France's public archive does not publish a quality flag per value. */
  quality: 'good' | 'not_provided';
}

interface ObservedComponent {
  observedAt: string;
  station: SeaOperationObservationStation;
  source: SeaOperationObservationSource;
}

export interface ObservationResult extends SeaOperationWeatherObservationInput {
  recordedAt: string;
  wind: (ObservedComponent & {
    speedKnots: number | null;
    directionDegrees: number | null;
    instrumentHeightMeters: number | null;
  }) | null;
  waves: (ObservedComponent & {
    heightMeters: number | null;
    periodSeconds: number | null;
    directionDegrees: number | null;
    component: 'swell' | 'total';
    periodKind: 'peak' | 'mean';
  }) | null;
  status: 'recorded' | 'pending' | 'unavailable';
  message: string;
}

export type SeaOperationWeatherObservation = ObservationResult;

export const SEA_OBSERVATION_MAX_DISTANCE_KM = 50;
export const SEA_OBSERVATION_MAX_TIME_DIFFERENCE_MS = 30 * 60_000;
export const SEA_METEO_FRANCE_OBSERVATIONS_URL = 'https://www.data.gouv.fr/datasets/archives-annuelles-des-observations-bouees';
export const SEA_MET_OFFICE_OBSERVATIONS_URL = 'https://registry.opendata.aws/met-office-uk-marine-observations/';
export const SEA_METEO_FRANCE_OBSERVATIONS_LICENSE_URL = 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/';
export const SEA_MET_OFFICE_OBSERVATIONS_LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function number(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
function utc(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z');
}
function text(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

export function isSeaOperationWeatherObservationInput(value: unknown): value is SeaOperationWeatherObservationInput {
  const row = record(value);
  return Boolean(row && text(row.pointId, 2048) && number(row.latitude, -90, 90) && number(row.longitude, -180, 180) && utc(row.etaUtc));
}

/** Reject malformed server/cached data before it enters an operation or PDF. */
export function isSeaOperationWeatherObservation(value: unknown): value is ObservationResult {
  const row = record(value);
  if (!row || !isSeaOperationWeatherObservationInput(value) || !utc(row.recordedAt)
    || !['recorded', 'pending', 'unavailable'].includes(String(row.status))
    || typeof row.message !== 'string' || row.message.length > 2000) return false;
  const component = (value: unknown, kind: 'wind' | 'waves') => {
    if (value === null) return true;
    const part = record(value);
    const station = record(part?.station);
    const source = record(part?.source);
    if (!part || !station || !source || !utc(part.observedAt)
      || Date.parse(part.observedAt) > Date.parse(row.recordedAt as string)
      || Math.abs(Date.parse(part.observedAt) - Date.parse(row.etaUtc as string)) > SEA_OBSERVATION_MAX_TIME_DIFFERENCE_MS
      || !text(station.id, 128) || !text(station.name, 256)
      || !number(station.latitude, -90, 90) || !number(station.longitude, -180, 180)
      || !number(station.distanceKm, 0, SEA_OBSERVATION_MAX_DISTANCE_KM)) return false;
    if (source.provider === 'Météo-France') {
      if (source.sourceUrl !== SEA_METEO_FRANCE_OBSERVATIONS_URL || source.license !== 'Licence Ouverte 2.0'
        || source.licenseUrl !== SEA_METEO_FRANCE_OBSERVATIONS_LICENSE_URL || source.quality !== 'not_provided') return false;
    } else if (source.provider === 'Met Office') {
      if (source.sourceUrl !== SEA_MET_OFFICE_OBSERVATIONS_URL || source.license !== 'CC BY-SA 4.0'
        || source.licenseUrl !== SEA_MET_OFFICE_OBSERVATIONS_LICENSE_URL || source.quality !== 'good') return false;
    } else return false;
    const nullableNumber = (key: string, min: number, max: number) => part[key] === null || number(part[key], min, max);
    if (!nullableNumber('directionDegrees', 0, 360)) return false;
    if (kind === 'wind') return nullableNumber('speedKnots', 0, 300) && nullableNumber('instrumentHeightMeters', 0, 100)
      && (part.speedKnots !== null || part.directionDegrees !== null);
    return nullableNumber('heightMeters', 0, 100) && nullableNumber('periodSeconds', Number.MIN_VALUE, 100)
      && ['swell', 'total'].includes(String(part.component)) && ['peak', 'mean'].includes(String(part.periodKind))
      && (part.heightMeters !== null || part.periodSeconds !== null || part.directionDegrees !== null);
  };
  return component(row.wind, 'wind') && component(row.waves, 'waves')
    && (row.status === 'recorded' ? row.wind !== null || row.waves !== null : row.wind === null && row.waves === null);
}
