export interface SeaOperationTransitRequestContext { date: string; vesselId: string }

export interface SeaOperationWeatherInput {
  projectId: string;
  transit?: SeaOperationTransitRequestContext;
  pointId: string;
  latitude: number;
  longitude: number;
  /** A complete local date and time in Europe/Paris, without a guessed UTC offset. */
  eta: string;
}

export interface SeaOperationWaypointWeather {
  pointId: string;
  latitude: number;
  longitude: number;
  etaUtc: string;
  fetchedAt: string;
  wind: { time: string; speedKnots: number | null; gustKnots: number | null; directionDegrees: number | null } | null;
  /** Significant swell height, not the combined wind-wave and swell sea state. */
  waves: { time: string; heightMeters: number | null; periodSeconds: number | null; directionDegrees: number | null; component: 'swell' } | null;
  windMessage: string;
  wavesMessage: string;
  attribution: 'Open-Meteo' | 'Météo-France';
  sourceUrl: string;
  model?: { name: string; referenceTime: string; latitude: number; longitude: number };
}

export const SEA_METEO_FRANCE_SOURCE_URL = 'https://www.data.gouv.fr/datasets/paquets-de-modele-de-vagues-mfwam-resolution-0-025deg';

/** The explicit business day and real vessel replace a project ID for a Transit request. */
export function isSeaOperationTransitRequestContext(value: unknown): value is SeaOperationTransitRequestContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const context = value as Record<string, unknown>;
  return Object.keys(context).length === 2 && typeof context.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(context.date)
    && Number(context.date.slice(0, 4)) >= 1000 && Number.isFinite(Date.parse(context.date)) && new Date(context.date).toISOString().slice(0, 10) === context.date
    && typeof context.vesselId === 'string' && /^[1-9]\d{0,18}$/.test(context.vesselId) && BigInt(context.vesselId) <= 9223372036854775807n;
}
export function sameSeaOperationTransitContext(a: unknown, b: unknown): boolean {
  return a === undefined ? b === undefined : isSeaOperationTransitRequestContext(a) && isSeaOperationTransitRequestContext(b)
    && a.date === b.date && a.vesselId === b.vesselId;
}

export function isSeaOperationWaypointWeather(value: unknown): value is SeaOperationWaypointWeather {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const timestamp = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) && Number.isFinite(Date.parse(value));
  const component = (value: unknown, fields: string[]) => {
    if (value === null) return true;
    if (!value || typeof value !== 'object') return false;
    const row = value as Record<string, unknown>;
    return timestamp(row.time) && fields.every((field) => row[field] === null || typeof row[field] === 'number' && Number.isFinite(row[field]) && row[field] >= 0)
      && (row.directionDegrees === null || (row.directionDegrees as number) <= 360);
  };
  return typeof record.pointId === 'string' && typeof record.latitude === 'number' && Number.isFinite(record.latitude)
    && typeof record.longitude === 'number' && Number.isFinite(record.longitude) && timestamp(record.etaUtc) && timestamp(record.fetchedAt)
    && component(record.wind, ['speedKnots', 'gustKnots', 'directionDegrees'])
    && component(record.waves, ['heightMeters', 'periodSeconds', 'directionDegrees'])
    && (record.waves === null || (record.waves as Record<string, unknown>).component === 'swell')
    && typeof record.windMessage === 'string' && typeof record.wavesMessage === 'string'
    && (record.attribution === 'Open-Meteo' && record.sourceUrl === 'https://open-meteo.com/en/docs/marine-weather-api'
      || record.attribution === 'Météo-France' && record.sourceUrl === SEA_METEO_FRANCE_SOURCE_URL)
    && (record.model === undefined || Boolean(record.model && typeof record.model === 'object'
      && typeof (record.model as Record<string, unknown>).name === 'string'
      && timestamp((record.model as Record<string, unknown>).referenceTime)
      && typeof (record.model as Record<string, unknown>).latitude === 'number'
      && Math.abs((record.model as Record<string, unknown>).latitude as number) <= 90
      && typeof (record.model as Record<string, unknown>).longitude === 'number'
      && Math.abs((record.model as Record<string, unknown>).longitude as number) <= 180));
}

const paris = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const HOUR = 3_600_000;
function localParts(time: number): number[] {
  const parts = paris.formatToParts(time);
  return ['year', 'month', 'day', 'hour', 'minute', 'second'].map((type) => Number(parts.find((part) => part.type === type)!.value));
}

/** Reject missing and duplicated clock times at the Paris DST transitions. */
export function seaOperationEtaUtc(eta: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/.exec(eta);
  if (!match) throw new Error('Renseignez une ETA complète, date et heure de Paris.');
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const wallTime = Date.UTC(year, month - 1, day, hour, minute);
  if (year < 1000 || new Date(wallTime).toISOString().slice(0, 16) !== eta) throw new Error('La date de l’ETA est invalide.');
  const offsets = new Set([-24, 0, 24].map((hours) => {
    const candidate = wallTime + hours * HOUR;
    const values = localParts(candidate);
    return Date.UTC(values[0], values[1] - 1, values[2], values[3], values[4], values[5]) - candidate;
  }));
  const matches = [...offsets].map((offset) => wallTime - offset).filter((candidate) => {
    const values = localParts(candidate);
    return values.slice(0, 5).every((value, index) => value === [year, month, day, hour, minute][index]);
  });
  if (matches.length !== 1) throw new Error('Cette heure de Paris est inexistante ou ambiguë lors du changement d’heure. Choisissez une autre ETA.');
  return new Date(matches[0]).toISOString();
}

export function validateSeaOperationWeatherInput(value: unknown): SeaOperationWeatherInput {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const validContext = input.transit === undefined
    ? typeof input.projectId === 'string' && /^[1-9][0-9]{0,18}$/.test(input.projectId) && BigInt(input.projectId) <= 9223372036854775807n
    : input.projectId === '' && isSeaOperationTransitRequestContext(input.transit);
  if (!validContext
    || typeof input.pointId !== 'string' || !/^[a-zA-Z0-9._:-]{1,100}$/.test(input.pointId)
    || typeof input.latitude !== 'number' || !Number.isFinite(input.latitude) || Math.abs(input.latitude) > 90
    || typeof input.longitude !== 'number' || !Number.isFinite(input.longitude) || Math.abs(input.longitude) > 180
    || typeof input.eta !== 'string') throw new Error('Le projet, les coordonnées ou l’ETA du point sont invalides.');
  seaOperationEtaUtc(input.eta);
  return { projectId: input.projectId as string, ...(input.transit === undefined ? {} : { transit: { ...input.transit as SeaOperationTransitRequestContext } }),
    pointId: input.pointId, latitude: input.latitude, longitude: input.longitude, eta: input.eta };
}

type WeatherKind = 'wind' | 'waves';
const VARIABLES = { wind: ['wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m'], waves: ['swell_wave_height', 'swell_wave_period', 'swell_wave_direction'] } as const;
export function seaOperationWeatherProviderUrl(kind: WeatherKind, input: SeaOperationWeatherInput, key?: string): URL {
  const host = kind === 'wind' ? 'api.open-meteo.com' : 'marine-api.open-meteo.com';
  const url = new URL(`https://${key ? `customer-${host}` : host}/v1/${kind === 'wind' ? 'forecast' : 'marine'}`);
  url.search = new URLSearchParams({ latitude: String(input.latitude), longitude: String(input.longitude), hourly: VARIABLES[kind].join(','),
    timezone: 'UTC', timeformat: 'unixtime', forecast_days: kind === 'wind' ? '16' : '7', cell_selection: 'sea',
    ...(kind === 'wind' ? { wind_speed_unit: 'kn' } : {}), ...(key ? { apikey: key } : {}) }).toString();
  return url;
}

/** No interpolation: show the nearest available model hour and keep its actual timestamp. */
function hourlyValues(value: unknown, kind: WeatherKind, target: number): { time: string; values: (number | null)[] } | null {
  const body = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const hourly = body.hourly as Record<string, unknown> | undefined;
  const units = body.hourly_units as Record<string, unknown> | undefined;
  if (body.utc_offset_seconds !== 0 || !hourly || !units || !Array.isArray(hourly.time) || hourly.time.length > 400
    || !hourly.time.every((time) => typeof time === 'number' && Number.isFinite(time))) throw new Error('Invalid forecast time axis');
  const variables = VARIABLES[kind];
  const expectedUnits = kind === 'wind' ? ['kn', 'kn', '°'] : ['m', 's', '°'];
  if (variables.some((variable, index) => units[variable] !== expectedUnits[index] || !Array.isArray(hourly[variable])
    || hourly[variable].length !== (hourly.time as unknown[]).length)) throw new Error('Invalid forecast units or arrays');
  let nearest = -1;
  let delta = Infinity;
  hourly.time.forEach((time, index) => {
    const distance = Math.abs(time * 1000 - target);
    if (distance < delta) { nearest = index; delta = distance; }
  });
  if (nearest < 0 || delta > HOUR / 2) return null;
  const values = variables.map((variable, index) => {
    const number = (hourly[variable] as unknown[])[nearest];
    if (number === null) return null;
    if (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || index === 2 && number > 360) throw new Error('Invalid forecast value');
    return number;
  });
  return values.every((value) => value === null) ? null : { time: new Date(hourly.time[nearest] * 1000).toISOString(), values };
}

export async function loadSeaOperationForecast(input: SeaOperationWeatherInput, options: {
  key?: string; fetcher?: typeof fetch; now?: number; signal?: AbortSignal;
} = {}): Promise<SeaOperationWaypointWeather> {
  const etaUtc = seaOperationEtaUtc(input.eta);
  const target = Date.parse(etaUtc);
  const now = options.now ?? Date.now();
  options.signal?.throwIfAborted();
  const unavailable = 'Aucune prévision disponible à cette ETA : horizon dépassé, point non couvert ou données manquantes.';
  const result: SeaOperationWaypointWeather = { pointId: input.pointId, latitude: input.latitude, longitude: input.longitude, etaUtc,
    fetchedAt: new Date(now).toISOString(), wind: null, waves: null, windMessage: unavailable, wavesMessage: unavailable,
    attribution: 'Open-Meteo', sourceUrl: 'https://open-meteo.com/en/docs/marine-weather-api' };
  if (target < now) {
    result.windMessage = result.wavesMessage = 'L’ETA est passée : les prévisions actuelles ne reconstituent pas la météo historique.';
    return result;
  }
  const fetcher = options.fetcher ?? fetch;
  const values = await Promise.allSettled((['wind', 'waves'] as const).map(async (kind) => {
    if (target > now + (kind === 'wind' ? 16 : 7) * 24 * HOUR) return null;
    const timeout = AbortSignal.timeout(12_000);
    const response = await fetcher(seaOperationWeatherProviderUrl(kind, input, options.key), {
      credentials: 'omit', cache: 'no-store', redirect: 'error',
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
    });
    if (!response.ok) throw new Error('Forecast unavailable');
    return hourlyValues(await response.json(), kind, target);
  }));
  options.signal?.throwIfAborted();
  if (values.every((value) => value.status === 'rejected')) throw new Error('Le service de prévision météo est indisponible. Réessayez.');
  const wind = values[0].status === 'fulfilled' ? values[0].value : null;
  const waves = values[1].status === 'fulfilled' ? values[1].value : null;
  if (values[0].status === 'rejected') result.windMessage = 'Les prévisions de vent sont temporairement indisponibles.';
  if (values[1].status === 'rejected') result.wavesMessage = 'Les prévisions de houle sont temporairement indisponibles.';
  if (wind) {
    result.wind = { time: wind.time, speedKnots: wind.values[0], gustKnots: wind.values[1], directionDegrees: wind.values[2] };
    result.windMessage = '';
  }
  if (waves) {
    result.waves = { time: waves.time, heightMeters: waves.values[0], periodSeconds: waves.values[1], directionDegrees: waves.values[2], component: 'swell' };
    result.wavesMessage = '';
  }
  return result;
}
