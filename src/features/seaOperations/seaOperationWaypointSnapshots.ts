import type { SeaOperationPayload, SeaOperationWaypoint, SeaOperationWaypointRadio } from './seaOperationModel';
import { seaWaypointPosition } from './seaOperationNavigation';
import { SEA_RADIO_VERIFIED_ON, seaOperationRadioContacts } from './seaOperationRadio';
import { isSeaOperationWaypointWeather, seaOperationEtaUtc, type SeaOperationWaypointWeather } from './seaOperationWeatherModel';

export interface SeaOperationWeatherCaptureContext {
  projectId: string;
  pointId: string;
  latitude: string;
  longitude: string;
  eta: string;
}

const sameCoordinate = (a: number, b: number) => Math.abs(a - b) < 1e-8;
const text = (value: unknown) => typeof value === 'string' && value.length <= 2048;
const timestamp = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  && Number(value.slice(0, 4)) >= 1000 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
const https = (value: unknown) => {
  if (!text(value) || [...value as string].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)) return false;
  return /^https:\/\/[^/?#@]+([/?#].*)?$/.test(value as string);
};

/** Read a capture only while it still identifies this point, coordinates and Paris ETA. */
export function waypointWeatherSnapshot(point: SeaOperationWaypoint): SeaOperationWaypointWeather | undefined {
  const weather = point.weather;
  if (!isSeaOperationWaypointWeather(weather) || weather.pointId !== point.id || !text(weather.pointId)
    || !text(weather.windMessage) || !text(weather.wavesMessage) || !timestamp(weather.etaUtc) || !timestamp(weather.fetchedAt)
    || (weather.wind && !timestamp(weather.wind.time)) || (weather.waves && !timestamp(weather.waves.time))
    || (weather.model && (!text(weather.model.name) || !timestamp(weather.model.referenceTime)))) return undefined;
  const position = seaWaypointPosition(point);
  if (!position || !sameCoordinate(position.latitude, weather.latitude) || !sameCoordinate(position.longitude, weather.longitude)) return undefined;
  try { if (Date.parse(weather.etaUtc) !== Date.parse(seaOperationEtaUtc(point.eta))) return undefined; } catch { return undefined; }
  return weather;
}

/** An unavailable refresh must not erase the forecast already consulted for this exact ETA. */
export function preservedWaypointWeather(point: SeaOperationWaypoint, incoming: SeaOperationWaypointWeather): SeaOperationWaypointWeather | undefined {
  const candidate = waypointWeatherSnapshot({ ...point, weather: incoming });
  if (!candidate) return undefined;
  const stored = waypointWeatherSnapshot(point);
  return !candidate.wind && !candidate.waves && stored && (stored.wind || stored.waves) ? stored : candidate;
}

/** Radio contacts are an indicative directory capture, never a VTS/SAR boundary. */
export function waypointRadioSnapshot(point: SeaOperationWaypoint): SeaOperationWaypointRadio | undefined {
  const radio = point.radio;
  if (!radio || radio.version !== 1 || !Number.isFinite(radio.latitude) || !Number.isFinite(radio.longitude)
    || !timestamp(radio.capturedAt) || typeof radio.verifiedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(radio.verifiedOn)
    || Number(radio.verifiedOn.slice(0, 4)) < 1000 || !Number.isFinite(Date.parse(radio.verifiedOn)) || new Date(radio.verifiedOn).toISOString().slice(0, 10) !== radio.verifiedOn
    || !Array.isArray(radio.contacts) || radio.contacts.length > 64
    || radio.contacts.some((contact) => !contact || !['rescue', 'port'].includes(contact.kind)
      || !['id', 'name', 'area', 'vhf', 'sourceLabel'].every((field) => text(contact[field as keyof typeof contact]))
      || !https(contact.source) || (contact.phone !== undefined && !text(contact.phone)) || (contact.mmsi !== undefined && !text(contact.mmsi))
      || !Number.isFinite(contact.distanceNm) || contact.distanceNm < 0)) return undefined;
  const position = seaWaypointPosition(point);
  return position && sameCoordinate(position.latitude, radio.latitude) && sameCoordinate(position.longitude, radio.longitude) ? radio : undefined;
}

/** Preserve all concurrent form edits; responses from another mission/input are ignored. */
export function retainSeaOperationWeather(payload: SeaOperationPayload, weather: SeaOperationWaypointWeather, context: SeaOperationWeatherCaptureContext): SeaOperationPayload {
  if (payload.planning?.projectId !== context.projectId) return payload;
  let changed = false;
  const waypoints = payload.waypoints.map((point) => {
    if (point.id !== context.pointId || point.latitude !== context.latitude || point.longitude !== context.longitude || point.eta !== context.eta) return point;
    const retained = preservedWaypointWeather(point, weather);
    if (!retained || JSON.stringify(point.weather) === JSON.stringify(retained)) return point;
    changed = true;
    return { ...point, weather: structuredClone(retained) };
  });
  return changed ? { ...payload, waypoints } : payload;
}

/** Coordinate/ETA edits invalidate only the captures that no longer match. */
export function updateSeaOperationWaypoint(point: SeaOperationWaypoint, patch: Partial<SeaOperationWaypoint>): SeaOperationWaypoint {
  const next = { ...point, ...patch };
  if (next.weather && !waypointWeatherSnapshot(next)) delete next.weather;
  if (next.radio && !waypointRadioSnapshot(next)) delete next.radio;
  return next;
}

/** Capture the current static directory at save; no remote request and no manual UKC change. */
export function captureSeaOperationRadios(payload: SeaOperationPayload, capturedAt = new Date().toISOString()): SeaOperationPayload {
  return { ...payload, waypoints: payload.waypoints.map((point) => {
    const next = updateSeaOperationWaypoint(point, {});
    const position = seaWaypointPosition(point);
    if (!position) return next;
    const contacts = seaOperationRadioContacts([point]).contacts.map(({ id, kind, name, area, vhf, phone, mmsi, source, sourceLabel, distanceNm }) =>
      ({ id, kind, name, area, vhf, ...(phone === undefined ? {} : { phone }), ...(mmsi === undefined ? {} : { mmsi }), source, sourceLabel, distanceNm }));
    return { ...next, radio: { version: 1, ...position, capturedAt, verifiedOn: SEA_RADIO_VERIFIED_ON, contacts } };
  }) };
}
