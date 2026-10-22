import { seaOperationEtaUtc, validateSeaOperationWeatherInput, type SeaOperationWeatherInput, type SeaOperationWaypointWeather } from '../src/features/seaOperations/seaOperationWeatherModel.js';
import { decodeMfwamPoint } from './seaOperationGrib.js';

const CATALOGUE = 'https://www.data.gouv.fr/api/1/datasets/paquets-de-modele-de-vagues-mfwam-resolution-0-025deg/';
const SOURCE = 'https://www.data.gouv.fr/datasets/paquets-de-modele-de-vagues-mfwam-resolution-0-025deg';
const HOUR = 3_600_000;
const TTL = 5 * 60_000;
const MAX_CATALOGUE = 2 * 1024 * 1024;
const MAX_FILE = 20 * 1024 * 1024;
const MAX_CACHE = 64 * 1024 * 1024;
const RESOURCE = /^https:\/\/meteofrance-pnt\.s3\.rbx\.io\.cloud\.ovh\.net\/pnt\/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\/vague-surcote\/MFWAM\/0025\/SP1\/vague-surcote-MFWAM__0025__SP1__(\d{3})H__(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\.grib2$/;

interface Resource { url: string; run: number; time: number; version: string }
interface State {
  catalogue?: { expires: number; resources: Resource[] };
  cataloguePending?: Promise<Resource[]>;
  files: Map<string, { expires: number; bytes: Uint8Array }>;
  filesPending: Map<string, Promise<Uint8Array>>;
  decodedPending: Map<string, ReturnType<typeof decodeMfwamPoint>>;
}
const states = new WeakMap<typeof fetch, State>();
function stateFor(fetcher: typeof fetch): State {
  let state = states.get(fetcher);
  if (!state) {
    state = { files: new Map(), filesPending: new Map(), decodedPending: new Map() };
    states.set(fetcher, state);
  }
  return state;
}

/** A caller leaving the form must not cancel a shared download used by another caller. */
function waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    void promise.then((value) => { signal.removeEventListener('abort', abort); resolve(value); },
      (error: unknown) => { signal.removeEventListener('abort', abort); reject(error); });
  });
}

async function boundedBody(response: Response, limit: number): Promise<Uint8Array> {
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error('Les données Météo-France sont temporairement indisponibles.');
  }
  const length = response.headers.get('content-length');
  if (length !== null && (!Number.isSafeInteger(Number(length)) || Number(length) < 0 || Number(length) > limit)) {
    await response.body.cancel();
    throw new Error('La réponse Météo-France dépasse la taille autorisée.');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('La réponse Météo-France dépasse la taille autorisée.'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function resourcesFrom(value: unknown, now: number): Resource[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as Record<string, unknown>).resources)) {
    throw new Error('Le catalogue Météo-France est invalide.');
  }
  const rows = (value as { resources: unknown[] }).resources;
  if (rows.length > 512) throw new Error('Le catalogue Météo-France est trop volumineux.');
  return rows.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const row = value as Record<string, unknown>;
    if (row.format !== 'grib2' || typeof row.url !== 'string') return [];
    const match = RESOURCE.exec(row.url);
    if (!match || match[1] !== match[3]) return [];
    const run = Date.parse(match[1]);
    if (!Number.isFinite(run) || new Date(run).toISOString().replace('.000Z', 'Z') !== match[1]
      || run > now || run < now - 24 * HOUR || Number(match[2]) > 168) return [];
    if (row.filesize !== null && row.filesize !== undefined
      && (typeof row.filesize !== 'number' || !Number.isSafeInteger(row.filesize) || row.filesize <= 0 || row.filesize > MAX_FILE)) return [];
    const checksum = row.checksum && typeof row.checksum === 'object' ? (row.checksum as Record<string, unknown>).value : undefined;
    const version = typeof checksum === 'string' && checksum.length <= 128 ? checksum
      : typeof row.last_modified === 'string' && row.last_modified.length <= 64 ? row.last_modified : '';
    return [{ url: row.url, run, time: run + Number(match[2]) * HOUR, version }];
  });
}

function catalogue(state: State, fetcher: typeof fetch, now: number): Promise<Resource[]> {
  if (state.catalogue && state.catalogue.expires > now) return Promise.resolve(state.catalogue.resources);
  if (state.cataloguePending) return state.cataloguePending;
  const pending = (async () => {
    const response = await fetcher(CATALOGUE, { credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12_000) });
    const bytes = await boundedBody(response, MAX_CATALOGUE);
    const resources = resourcesFrom(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), now);
    state.catalogue = { expires: now + TTL, resources };
    return resources;
  })().finally(() => { state.cataloguePending = undefined; });
  state.cataloguePending = pending;
  return pending;
}

function expireFiles(state: State, now: number) {
  for (const [key, file] of state.files) if (file.expires <= now) state.files.delete(key);
}
function file(state: State, resource: Resource, fetcher: typeof fetch, now: number): Promise<Uint8Array> {
  expireFiles(state, now);
  const key = `${resource.url}|${resource.version}`;
  const existing = state.files.get(key);
  if (existing) {
    state.files.delete(key);
    state.files.set(key, existing);
    return Promise.resolve(existing.bytes);
  }
  const running = state.filesPending.get(key);
  if (running) return running;
  if (state.filesPending.size >= 4) return Promise.reject(new Error('Le service Météo-France est occupé. Réessayez.'));
  const pending = (async () => {
    const response = await fetcher(resource.url, { credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20_000) });
    const bytes = await boundedBody(response, MAX_FILE);
    if (bytes.length < 20 || bytes[0] !== 71 || bytes[1] !== 82 || bytes[2] !== 73 || bytes[3] !== 66) throw new Error('Le fichier Météo-France est invalide.');
    state.files.set(key, { expires: now + TTL, bytes });
    let total = [...state.files.values()].reduce((sum, entry) => sum + entry.bytes.byteLength, 0);
    while (state.files.size > 4 || total > MAX_CACHE) {
      const oldest = state.files.keys().next().value!;
      total -= state.files.get(oldest)!.bytes.byteLength;
      state.files.delete(oldest);
    }
    return bytes;
  })().finally(() => { state.filesPending.delete(key); });
  state.filesPending.set(key, pending);
  return pending;
}

function finite(value: number | null, maximum: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum ? value : null;
}

/** Public MFWAM data, decoded on the server. It never supplies an invented coastal value or gust. */
export async function loadMeteoFranceForecast(input: SeaOperationWeatherInput, options: {
  now?: number; signal?: AbortSignal; fetcher?: typeof fetch;
} = {}): Promise<SeaOperationWaypointWeather> {
  const point = validateSeaOperationWeatherInput(input);
  const etaUtc = seaOperationEtaUtc(point.eta);
  const target = Date.parse(etaUtc);
  const now = options.now ?? Date.now();
  options.signal?.throwIfAborted();
  const unavailable = 'Aucune prévision Météo-France disponible à cette ETA : horizon dépassé ou données manquantes.';
  const result: SeaOperationWaypointWeather = { pointId: point.pointId, latitude: point.latitude, longitude: point.longitude, etaUtc,
    fetchedAt: new Date(now).toISOString(), wind: null, waves: null, windMessage: unavailable, wavesMessage: unavailable,
    attribution: 'Météo-France', sourceUrl: SOURCE };
  if (target < now) {
    result.windMessage = result.wavesMessage = 'L’ETA est passée : les prévisions actuelles ne reconstituent pas la météo historique.';
    return result;
  }
  if (point.latitude < 38 || point.latitude > 53 || point.longitude < -8 || point.longitude > 12) {
    result.windMessage = result.wavesMessage = 'Ce point est hors du domaine MFWAM disponible (38–53° N, 8° O–12° E).';
    return result;
  }
  const fetcher = options.fetcher ?? fetch;
  const state = stateFor(fetcher);
  const resources = await waitFor(catalogue(state, fetcher, now), options.signal);
  const selected = resources.filter((entry) => entry.run <= now && entry.run >= now - 24 * HOUR
    && entry.run <= target && Math.abs(entry.time - target) <= HOUR / 2)
    .sort((a, b) => b.run - a.run || Math.abs(a.time - target) - Math.abs(b.time - target) || a.time - b.time)[0];
  if (!selected) return result;
  options.signal?.throwIfAborted();
  const bytes = await waitFor(file(state, selected, fetcher, now), options.signal);
  options.signal?.throwIfAborted();
  const decodeKey = `${selected.url}|${selected.version}|${point.latitude}|${point.longitude}|${target}`;
  let pending = state.decodedPending.get(decodeKey);
  if (!pending) {
    pending = decodeMfwamPoint(bytes, { latitude: point.latitude, longitude: point.longitude }, target)
      .finally(() => { state.decodedPending.delete(decodeKey); });
    state.decodedPending.set(decodeKey, pending);
  }
  const decoded = await waitFor(pending, options.signal);
  const validTime = Date.parse(decoded.validTime);
  if (Date.parse(decoded.referenceTime) !== selected.run || !Number.isFinite(validTime) || validTime < selected.run
    || Math.abs(validTime - target) > HOUR / 2 || !Number.isFinite(decoded.latitude) || !Number.isFinite(decoded.longitude)
    || Math.abs(decoded.latitude - point.latitude) > 0.012501 || Math.abs(decoded.longitude - point.longitude) > 0.012501) {
    throw new Error('La prévision Météo-France ne correspond pas au point ou à l’ETA demandés.');
  }
  result.model = { name: 'MFWAM 0,025° — forçage AROME', referenceTime: new Date(selected.run).toISOString(), latitude: decoded.latitude, longitude: decoded.longitude };
  const speed = finite(decoded.windSpeedMps, 150);
  const direction = finite(decoded.windDirectionDegrees, 360);
  const height = finite(decoded.heightMeters, 100);
  const period = finite(decoded.periodSeconds, 100);
  const swellDirection = finite(decoded.swellDirectionDegrees, 360);
  const time = new Date(validTime).toISOString();
  const missing = 'Aucune donnée marine pour cette maille : point terrestre ou données manquantes. Vérifiez les coordonnées.';
  result.windMessage = result.wavesMessage = missing;
  if (speed !== null || direction !== null) {
    result.wind = { time, speedKnots: speed === null ? null : speed * 1.9438444924406, gustKnots: null, directionDegrees: direction };
    result.windMessage = '';
  }
  if (height !== null || period !== null || swellDirection !== null) {
    result.waves = { time, heightMeters: height, periodSeconds: period, directionDegrees: swellDirection, component: 'swell' };
    result.wavesMessage = '';
  }
  return result;
}
