import { XMLParser } from 'fast-xml-parser';
import {
  isSeaOperationWeatherObservationInput, SEA_METEO_FRANCE_OBSERVATIONS_LICENSE_URL,
  SEA_METEO_FRANCE_OBSERVATIONS_URL, SEA_MET_OFFICE_OBSERVATIONS_LICENSE_URL,
  SEA_MET_OFFICE_OBSERVATIONS_URL, SEA_OBSERVATION_MAX_DISTANCE_KM,
  SEA_OBSERVATION_MAX_TIME_DIFFERENCE_MS,
  type ObservationResult, type SeaOperationObservationSource, type SeaOperationObservationStation,
  type SeaOperationWeatherObservationInput,
} from '../src/features/seaOperations/seaOperationWeatherObservationsModel.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MF_CATALOGUE = 'https://www.data.gouv.fr/api/1/datasets/archives-annuelles-des-observations-bouees/';
const UK_BUCKET = 'https://met-office-marine-observations-data.s3.eu-west-2.amazonaws.com/';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const mfSource: SeaOperationObservationSource = { provider: 'Météo-France', sourceUrl: SEA_METEO_FRANCE_OBSERVATIONS_URL,
  license: 'Licence Ouverte 2.0', licenseUrl: SEA_METEO_FRANCE_OBSERVATIONS_LICENSE_URL, quality: 'not_provided' };
const ukSource: SeaOperationObservationSource = { provider: 'Met Office', sourceUrl: SEA_MET_OFFICE_OBSERVATIONS_URL,
  license: 'CC BY-SA 4.0', licenseUrl: SEA_MET_OFFICE_OBSERVATIONS_LICENSE_URL, quality: 'good' };

/** Fixed marine stations, checked against the producers' public files on 23 October 2026.
 * Their returned coordinates are always rechecked; these locations only limit discovery/downloads.
 * Mobile ships are excluded rather than assigning a ship's present position to a past observation.
 */
const MF_STATIONS = [
  [15.85, -57.466667], [43.360167, 7.842333], [42.106, 4.687333], [41.75, 7.583333],
  [41.6, 10.2], [42.8, 8.4], [41.583333, 5.5], [40.5, 6.7], [42.5, 6.9], [45.237167, -4.9915],
] as const;
const UK_STATIONS = [
  { id: 'brittany_buoy', latitude: 47.49, longitude: -8.46 },
  { id: 'channel_test_buoy', latitude: 49.91, longitude: -2.88 },
  { id: 'e1_buoy', latitude: 50.04, longitude: -4.37 },
  { id: 'f3_light_vessel_automatic_weather_station', latitude: 51.4, longitude: 2.01 },
  { id: 'greenwich_light_vessel_automatic_weather_station', latitude: 50.41, longitude: 0 },
  { id: 'k1_buoy', latitude: 48.76, longitude: -12.45 },
  { id: 'k2_buoy', latitude: 51.04, longitude: -13.3 },
  { id: 'l4_buoy', latitude: 50.25, longitude: -4.22 },
  { id: 'pap_buoy', latitude: 48.92, longitude: -16.36 },
  { id: 'sandettie_light_vessel_automatic_weather_station', latitude: 51.16, longitude: 1.79 },
  { id: 'seven_stones_light_vessel_automatic_weather_station', latitude: 50.06, longitude: -6.07 },
] as const;

interface Candidate { wind: ObservationResult['wind']; waves: ObservationResult['waves'] }
interface ProviderResult { candidates: Candidate[]; pending: boolean; failed?: boolean }
interface Cached { expires: number; promise: Promise<string> }
const caches = new WeakMap<typeof fetch, Map<string, Cached>>();

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function finite(value: unknown, min: number, max: number): number | null {
  if (typeof value === 'string') {
    if (!/^-?\d+(?:\.\d+)?$/.test(value.trim())) return null;
    value = Number(value);
  }
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
}
function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const radians = Math.PI / 180;
  const lat = (b.latitude - a.latitude) * radians;
  const lon = (b.longitude - a.longitude) * radians;
  const sum = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(lon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, sum)));
}
function validTime(value: unknown, target: number, now: number): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed <= now && Math.abs(parsed - target) <= SEA_OBSERVATION_MAX_TIME_DIFFERENCE_MS
    ? new Date(parsed).toISOString() : null;
}
function stationFor(point: SeaOperationWeatherObservationInput, row: Record<string, unknown>, id: string): SeaOperationObservationStation | null {
  const latitude = finite(row.latitude ?? row.lat, -90, 90);
  const longitude = finite(row.longitude ?? row.lon, -180, 180);
  if (latitude === null || longitude === null || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 256) return null;
  const distance = distanceKm(point, { latitude, longitude });
  return distance <= SEA_OBSERVATION_MAX_DISTANCE_KM ? { id, name: row.name.trim(), latitude, longitude, distanceKm: distance } : null;
}
function waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    void promise.then((result) => { signal.removeEventListener('abort', abort); resolve(result); },
      (error: unknown) => { signal.removeEventListener('abort', abort); reject(error); });
  });
}
async function body(response: Response, maximum: number): Promise<string> {
  if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('Observations indisponibles.'); }
  const size = response.headers.get('content-length');
  if (size !== null && (!Number.isSafeInteger(Number(size)) || Number(size) < 0 || Number(size) > maximum)) {
    await response.body.cancel(); throw new Error('Observations trop volumineuses.');
  }
  const reader = response.body.getReader();
  let total = 0;
  let text = '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maximum) { await reader.cancel(); throw new Error('Observations trop volumineuses.'); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}
function request(url: string, fetcher: typeof fetch, now: number, maximum: number, ttl = 10 * 60_000): Promise<string> {
  let cache = caches.get(fetcher);
  if (!cache) { cache = new Map(); caches.set(fetcher, cache); }
  for (const [key, entry] of cache) if (entry.expires <= now) cache.delete(key);
  const existing = cache.get(url);
  if (existing) return existing.promise;
  while (cache.size >= 64) cache.delete(cache.keys().next().value!);
  const active = cache;
  const promise = fetcher(url, { credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12_000) })
    .then((response) => body(response, maximum)).catch((error: unknown) => { active.delete(url); throw error; });
  cache.set(url, { expires: now + ttl, promise });
  return promise;
}

async function meteoFrance(point: SeaOperationWeatherObservationInput, target: number, now: number, fetcher: typeof fetch): Promise<ProviderResult> {
  if (!MF_STATIONS.some(([latitude, longitude]) => distanceKm(point, { latitude, longitude }) <= SEA_OBSERVATION_MAX_DISTANCE_KM + 3)) return { candidates: [], pending: false };
  const year = new Date(target).getUTCFullYear();
  if (year < 1996 || year > new Date(now).getUTCFullYear()) return { candidates: [], pending: false };
  const catalogue = object(JSON.parse(await request(MF_CATALOGUE, fetcher, now, 2 * 1024 * 1024, HOUR)));
  if (!Array.isArray(catalogue?.resources) || catalogue.resources.length > 128) throw new Error('Catalogue observations invalide.');
  const resource = catalogue.resources.map(object).find((row) => row?.title === `marine_${year}` && typeof row.id === 'string' && UUID.test(row.id)
    && row.url === `https://meteofrance.s3.sbg.io.cloud.ovh.net/data/OBS/BOUEES/marine_${year}.csv.gz`);
  if (!resource) return { candidates: [], pending: now - target < 2 * DAY };
  const url = new URL(`https://tabular-api.data.gouv.fr/api/resources/${resource.id as string}/data/`);
  const deltaLatitude = 0.46;
  const deltaLongitude = deltaLatitude / Math.max(0.01, Math.cos(point.latitude * Math.PI / 180));
  url.search = new URLSearchParams({
    lat__greater: String(point.latitude - deltaLatitude), lat__less: String(point.latitude + deltaLatitude),
    lon__greater: String(point.longitude - deltaLongitude), lon__less: String(point.longitude + deltaLongitude),
    validity_time__greater: new Date(target - SEA_OBSERVATION_MAX_TIME_DIFFERENCE_MS).toISOString(),
    validity_time__less: new Date(target + SEA_OBSERVATION_MAX_TIME_DIFFERENCE_MS).toISOString(),
    columns: 'lat,lon,geo_id_wmo,name,validity_time,ff,dd,haut_vag,per_moy_vag,dir_vag', page_size: '50',
  }).toString();
  const payload = object(JSON.parse(await request(url.href, fetcher, now, 256 * 1024)));
  if (!Array.isArray(payload?.data) || payload.data.length > 50) throw new Error('Observations Météo-France invalides.');
  const candidates = payload.data.flatMap((value): Candidate[] => {
    const row = object(value);
    if (!row || !/^[0-9]{5,8}$/.test(String(row.geo_id_wmo))) return [];
    const observedAt = validTime(row.validity_time, target, now);
    const station = stationFor(point, row, String(row.geo_id_wmo));
    if (!observedAt || !station) return [];
    const common = { observedAt, station, source: mfSource };
    const speed = finite(row.ff, 0, 150);
    const direction = finite(row.dd, 0, 360);
    const height = finite(row.haut_vag, 0, 100);
    const period = finite(row.per_moy_vag, Number.MIN_VALUE, 100);
    const waveDirection = finite(row.dir_vag, 0, 360);
    return [{ wind: speed !== null || direction !== null ? { ...common, speedKnots: speed === null ? null : speed * 1.9438444924406,
      directionDegrees: direction, instrumentHeightMeters: null } : null,
    waves: height !== null || period !== null || waveDirection !== null ? { ...common, heightMeters: height, periodSeconds: period,
      directionDegrees: waveDirection, component: 'total', periodKind: 'mean' } : null }];
  });
  return { candidates, pending: candidates.length === 0 && now - target < 2 * DAY };
}

/** Pipe-delimited producer CSV: JSON quality/spectra are raw fields, not CSV-quoted JSON. */
function csvRows(text: string): Record<string, unknown>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2 || lines.length > 4) throw new Error('Fichier marine invalide.');
  const headers = lines[0].replace(/^\uFEFF/, '').split('|');
  if (headers.length > 100 || new Set(headers).size !== headers.length || !headers.includes('timestep')) throw new Error('Colonnes marine invalides.');
  return lines.slice(1).filter(Boolean).map((line) => {
    const cells = line.split('|');
    if (cells.length !== headers.length) throw new Error('Colonnes marine invalides.');
    return Object.fromEntries(headers.map((name, index) => [name, cells[index]]));
  });
}
function good(row: Record<string, unknown>, name: string, maximum: number, minimum = 0): number | null {
  const raw = row[`${name}_qc`];
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  let quality: Record<string, unknown> | null;
  try { quality = object(JSON.parse(raw)); } catch { return null; }
  if (!quality || Object.keys(quality).length !== 1 || !Array.isArray(quality.good)) return null;
  return finite(row[name], minimum, maximum);
}
function firstGood(row: Record<string, unknown>, names: string[], maximum: number, minimum = 0): number | null {
  for (const name of names) { const value = good(row, name, maximum, minimum); if (value !== null) return value; }
  return null;
}
async function metOffice(point: SeaOperationWeatherObservationInput, target: number, now: number, fetcher: typeof fetch): Promise<ProviderResult> {
  const stations = UK_STATIONS.filter((station) => distanceKm(point, station) <= SEA_OBSERVATION_MAX_DISTANCE_KM + 3)
    .sort((a, b) => distanceKm(point, a) - distanceKm(point, b)).slice(0, 3);
  if (stations.length === 0 || now - target > 7 * DAY) return { candidates: [], pending: false };
  // On a half-hour tie the earlier observation is preferred, as for the forecast.
  const hour = Math.ceil(target / HOUR - 0.5) * HOUR;
  const publication = hour + HOUR + 15 * 60_000;
  if (publication > now) return { candidates: [], pending: true };
  const compact = (time: number) => new Date(time).toISOString().replace(/[-:TZ.]/g, '').slice(0, 12);
  const prefix = `${compact(publication)}_${compact(hour)}_${compact(hour + 59 * 60_000)}/`;
  const listingUrl = new URL(UK_BUCKET);
  listingUrl.search = new URLSearchParams({ 'list-type': '2', prefix, 'max-keys': '200' }).toString();
  const xml = await request(listingUrl.href, fetcher, now, 256 * 1024);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Catalogue marine invalide.');
  const parsed = object(new XMLParser({ ignoreAttributes: true, processEntities: false, parseTagValue: false }).parse(xml));
  const listing = object(parsed?.ListBucketResult);
  if (!listing || listing.Prefix !== prefix || listing.IsTruncated !== 'false') throw new Error('Catalogue marine incomplet.');
  const objects = listing.Contents === undefined ? [] : Array.isArray(listing.Contents) ? listing.Contents : [listing.Contents];
  if (objects.length > 200) throw new Error('Catalogue marine trop volumineux.');
  const selected = stations.flatMap((station) => {
    const matches = objects.map(object).filter((row) => typeof row?.Key === 'string' && row.Key.startsWith(`${prefix}${station.id}_`)
      && row.Key.endsWith('.csv') && UUID.test(row.Key.slice(`${prefix}${station.id}_`.length, -4))
      && finite(row.Size, 1, 64 * 1024) !== null);
    // Multiple publications for a station are not silently conflated.
    return matches.length === 1 ? [{ station, key: matches[0]!.Key as string }] : [];
  });
  const downloaded = await Promise.allSettled(selected.map(async ({ station: known, key }) => {
    const text = await request(`${UK_BUCKET}${key}`, fetcher, now, 64 * 1024);
    return csvRows(text).flatMap((row): Candidate[] => {
      const observedAt = validTime(row.timestep, target, now);
      const station = stationFor(point, row, known.id);
      if (!observedAt || !station || distanceKm(known, station) > 10) return [];
      const common = { observedAt, station, source: ukSource };
      const direction = good(row, 'wind_direction_marine', 360);
      // The public marine CSV documentation does not state its wind speed unit.
      // Retain the measured direction; never guess a speed or silently call it 10 m wind.
      const wind: ObservationResult['wind'] = direction === null ? null : { ...common, speedKnots: null, directionDegrees: direction, instrumentHeightMeters: null };
      const swellHeight = good(row, 'significant_wave_height_hm_0_swell', 100);
      const swellPeriod = good(row, 'wave_peak_period_swell', 100, Number.MIN_VALUE);
      const swellDirection = good(row, 'wave_peak_direction_swell', 360);
      let waves: ObservationResult['waves'] = null;
      if (swellHeight !== null || swellPeriod !== null || swellDirection !== null) {
        waves = { ...common, heightMeters: swellHeight, periodSeconds: swellPeriod, directionDegrees: swellDirection, component: 'swell', periodKind: 'peak' };
      } else {
        const height = firstGood(row, ['significant_wave_height_hm_0', 'significant_wave_height_h_third', 'significant_wave_height_heave'], 100);
        const meanPeriod = firstGood(row, ['wave_mean_period_tm_02', 'wave_mean_period_tz', 'wave_mean_period_heave'], 100, Number.MIN_VALUE);
        const period = meanPeriod ?? good(row, 'wave_peak_period', 100, Number.MIN_VALUE);
        const direction = good(row, 'wave_mean_direction', 360);
        if (height !== null || period !== null || direction !== null) waves = { ...common, heightMeters: height, periodSeconds: period,
          directionDegrees: direction, component: 'total', periodKind: meanPeriod !== null ? 'mean' : 'peak' };
      }
      return [{ wind, waves }];
    });
  }));
  return { candidates: downloaded.flatMap((result) => result.status === 'fulfilled' ? result.value : []),
    pending: selected.length === 0 && now - target < DAY, failed: downloaded.some((result) => result.status === 'rejected') };
}

/** Official observations only: no forecasts, interpolation, reanalysis or synthetic waypoint weather. */
export async function loadSeaOperationWeatherObservations(input: SeaOperationWeatherObservationInput, options: {
  now?: number; signal?: AbortSignal; fetcher?: typeof fetch;
} = {}): Promise<ObservationResult> {
  if (!isSeaOperationWeatherObservationInput(input)) throw new Error('Le point ou l’ETA des observations est invalide.');
  const now = options.now ?? Date.now();
  const target = Date.parse(input.etaUtc);
  options.signal?.throwIfAborted();
  const result: ObservationResult = { ...input, recordedAt: new Date(now).toISOString(), wind: null, waves: null,
    status: 'pending', message: 'Les mesures officielles ne sont pas encore publiées pour cette ETA.' };
  if (target > now) return result;
  const fetcher = options.fetcher ?? fetch;
  const providers = await waitFor(Promise.allSettled([meteoFrance(input, target, now, fetcher), metOffice(input, target, now, fetcher)]), options.signal);
  const values = providers.flatMap((provider) => provider.status === 'fulfilled' ? [provider.value] : []);
  const candidates = values.flatMap((provider) => provider.candidates);
  const compare = (a: { station: SeaOperationObservationStation; observedAt: string }, b: { station: SeaOperationObservationStation; observedAt: string }) =>
    a.station.distanceKm - b.station.distanceKm || Math.abs(Date.parse(a.observedAt) - target) - Math.abs(Date.parse(b.observedAt) - target)
    || Date.parse(a.observedAt) - Date.parse(b.observedAt);
  result.wind = candidates.flatMap((candidate) => candidate.wind ? [candidate.wind] : []).sort((a, b) =>
    Number(a.speedKnots === null) - Number(b.speedKnots === null) || compare(a, b))[0] ?? null;
  result.waves = candidates.flatMap((candidate) => candidate.waves ? [candidate.waves] : []).sort((a, b) =>
    Number(a.heightMeters === null) - Number(b.heightMeters === null) || compare(a, b))[0] ?? null;
  if (result.wind || result.waves) {
    result.status = 'recorded';
    result.message = 'Mesures à la station indiquée, à moins de 50 km et 30 minutes de l’ETA ; aucune interpolation au waypoint.';
    if (result.wind?.source.provider === 'Met Office') result.message += ' Vitesse du vent non enregistrée : unité non précisée dans la documentation du fichier public.';
    if (!result.wind || !result.waves) result.message += ' Certaines composantes ne sont pas disponibles.';
  } else if (providers.some((provider) => provider.status === 'rejected') || values.some((provider) => provider.pending || provider.failed)) {
    result.message = 'Mesures officielles en attente de publication ou temporairement indisponibles. La collecte sera retentée.';
  } else {
    result.status = 'unavailable';
    result.message = 'Aucune mesure officielle exploitable à moins de 50 km et 30 minutes de cette ETA (couverture, qualité ou archive indisponible).';
  }
  return result;
}
