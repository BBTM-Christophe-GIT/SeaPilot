import type { SeaOperationPayload, SeaOperationWaypoint, SeaOperationWaypointRadio } from './seaOperationModel';
import { seaWaypointPosition } from './seaOperationNavigation';
import { SEA_RADIO_VERIFIED_ON, seaOperationRadioContacts } from './seaOperationRadio';
import { isSeaOperationWaypointWeather, seaOperationEtaUtc, type SeaOperationWaypointWeather } from './seaOperationWeatherModel';
import { isSeaOperationCopernicusEstimate, type SeaOperationCopernicusEstimate } from './seaOperationCopernicusModel';

export interface SeaOperationWeatherCaptureContext {
  projectId: string;
  pointId: string;
  latitude: string;
  longitude: string;
  eta: string;
}

export interface SeaOperationUkcReference {
  projectId?: string;
  vesselId: string;
  draftMeters?: number | null;
}

export interface SeaOperationUkcCaptureContext extends SeaOperationWeatherCaptureContext {
  vesselId: string;
  draftMeters: number;
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

/** Older responses and unavailable refreshes must not erase a newer forecast for this exact ETA. */
export function preservedWaypointWeather(point: SeaOperationWaypoint, incoming: SeaOperationWaypointWeather): SeaOperationWaypointWeather | undefined {
  const candidate = waypointWeatherSnapshot({ ...point, weather: incoming });
  if (!candidate) return undefined;
  const stored = waypointWeatherSnapshot(point);
  if (stored && Date.parse(candidate.fetchedAt) < Date.parse(stored.fetchedAt)) return stored;
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
  if (patch.ukc !== undefined && patch.ukc !== point.ukc && patch.ukcMode === undefined) next.ukcMode = 'manual';
  if (next.weather && !waypointWeatherSnapshot(next)) delete next.weather;
  if (next.radio && !waypointRadioSnapshot(next)) delete next.radio;
  if (next.ukcForecast && (next.ukcMode !== 'automatic' || !waypointUkcIdentity(next))) delete next.ukcForecast;
  return next;
}

/** Position and ETA checks also work while a waypoint is edited without its parent payload. */
function waypointUkcIdentity(point: SeaOperationWaypoint): SeaOperationCopernicusEstimate | undefined {
  const forecast = point.ukcForecast;
  if (!isSeaOperationCopernicusEstimate(forecast) || forecast.pointId !== point.id) return undefined;
  const position = seaWaypointPosition(point);
  if (!position || !sameCoordinate(position.latitude, forecast.latitude) || !sameCoordinate(position.longitude, forecast.longitude)) return undefined;
  try { if (Date.parse(forecast.etaUtc) !== Date.parse(seaOperationEtaUtc(point.eta))) return undefined; } catch { return undefined; }
  return forecast;
}

/** A draft change cannot silently reuse a calculation made for another project, vessel or draught. */
export function waypointUkcSnapshot(point: SeaOperationWaypoint, reference: SeaOperationUkcReference): SeaOperationCopernicusEstimate | undefined {
  const forecast = waypointUkcIdentity(point);
  return forecast && point.ukcMode === 'automatic' && forecast.projectId === reference.projectId
    && forecast.vesselId === reference.vesselId && forecast.draftMeters === reference.draftMeters ? forecast : undefined;
}

export function seaOperationUkcReference(payload: SeaOperationPayload): SeaOperationUkcReference {
  return { projectId: payload.planning?.projectId, vesselId: payload.vessel.id, draftMeters: payload.vessel.draftMeters };
}

/** Manual text is used only in manual mode; an unavailable automatic calculation has no fallback. */
export function effectiveSeaOperationUkc(payload: SeaOperationPayload, point: SeaOperationWaypoint): string {
  if (point.ukcMode !== 'automatic') return point.ukc;
  const forecast = waypointUkcSnapshot(point, seaOperationUkcReference(payload));
  return forecast?.status === 'available' && forecast.estimate ? String(forecast.estimate.ukcMeters) : '';
}

/** Remove only stale automatic captures after a mission/vessel/draught edit or server canonisation. */
export function invalidateSeaOperationUkc(payload: SeaOperationPayload): SeaOperationPayload {
  let changed = false;
  const reference = seaOperationUkcReference(payload);
  const waypoints = payload.waypoints.map(point => {
    if (!point.ukcForecast || waypointUkcSnapshot(point, reference)) return point;
    const next = { ...point }; delete next.ukcForecast; changed = true;
    return next;
  });
  return changed ? { ...payload, waypoints } : payload;
}

/** Retain a response only while every request field and the real reference draught still match. */
export function retainSeaOperationUkc(payload: SeaOperationPayload, incoming: SeaOperationCopernicusEstimate,
  context: SeaOperationUkcCaptureContext): SeaOperationPayload {
  if (payload.planning?.projectId !== context.projectId || payload.vessel.id !== context.vesselId
    || payload.vessel.draftMeters !== context.draftMeters) return payload;
  let changed = false;
  const reference = seaOperationUkcReference(payload);
  const waypoints = payload.waypoints.map(point => {
    if (point.ukcMode !== 'automatic' || point.id !== context.pointId || point.latitude !== context.latitude
      || point.longitude !== context.longitude || point.eta !== context.eta) return point;
    const candidate = waypointUkcSnapshot({ ...point, ukcForecast: incoming }, reference);
    if (!candidate) return point;
    const existing = waypointUkcSnapshot(point, reference);
    if (existing && (Date.parse(existing.fetchedAt) > Date.parse(candidate.fetchedAt)
      || existing.status === 'available' && candidate.status !== 'available')) return point;
    if (JSON.stringify(existing) === JSON.stringify(candidate)) return point;
    changed = true;
    return { ...point, ukcForecast: structuredClone(candidate) };
  });
  return changed ? { ...payload, waypoints } : payload;
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
