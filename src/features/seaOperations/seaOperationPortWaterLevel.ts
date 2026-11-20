import type { SeaOperationPayload } from './seaOperationModel';
import { seaDistanceNm, type SeaPosition } from './seaOperationNavigation';
import { seaOperationEtaUtc } from './seaOperationWeatherModel';

export const PORT_WATER_LEVEL_SOURCES = {
  'copernicus-nws': { name: 'Copernicus Marine NWS', datum: 'model-geoid', url: 'https://data.marine.copernicus.eu/product/NWSHELF_ANALYSISFORECAST_PHY_004_013/description' },
  'copernicus-ibi': { name: 'Copernicus Marine IBI', datum: 'model-geoid', url: 'https://data.marine.copernicus.eu/product/IBI_ANALYSISFORECAST_PHY_005_001/description' },
  'copernicus-med': { name: 'Copernicus Marine MED', datum: 'model-geoid', url: 'https://data.marine.copernicus.eu/product/MEDSEA_ANALYSISFORECAST_PHY_006_013/description' },
  'shom-tolosa': { name: 'Shom / Météo-France · TOLOSA', datum: 'model-mean-sea-level', url: 'https://www.shom.fr/fr/copernicus' },
  'shom-hycom': { name: 'Shom / Météo-France · HYCOM', datum: 'model-mean-sea-level', url: 'https://www.shom.fr/fr/copernicus' },
} as const;

export const PORT_WATER_LEVEL_ROLES = ['departure', 'arrival'] as const;
export type PortWaterLevelRole = (typeof PORT_WATER_LEVEL_ROLES)[number];
type PortWaterLevelSource = keyof typeof PORT_WATER_LEVEL_SOURCES;
type PortWaterLevelDatum = (typeof PORT_WATER_LEVEL_SOURCES)[PortWaterLevelSource]['datum'];
type Vessel = SeaOperationPayload['vessel'];

export interface PortWaterLevel extends SeaPosition {
  portKey: string;
  etaUtc: string;
  fetchedAt: string;
  heightMeters: number;
  sampleLatitude: number;
  sampleLongitude: number;
  source: PortWaterLevelSource;
  sourceUrl: string;
  datum: PortWaterLevelDatum;
}

export interface PortWaterLevelSnapshot extends PortWaterLevel { portName: string }
export type PortWaterLevels = Partial<Record<PortWaterLevelRole, PortWaterLevelSnapshot>>;

const metres = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const finiteInRange = (value: unknown, maximum: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= maximum;

function validUtc(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false;
  const time = new Date(value);
  return Number.isFinite(time.getTime()) && time.toISOString().slice(0, 19) === value.slice(0, 19);
}

export function portWaterLevelDistanceKm(level: PortWaterLevel): number {
  return seaDistanceNm(level, { latitude: level.sampleLatitude, longitude: level.sampleLongitude }) * 1.852;
}

export function isPortWaterLevel(value: unknown): value is PortWaterLevel {
  if (!value || typeof value !== 'object') return false;
  const level = value as Record<string, unknown>;
  if (typeof level.source !== 'string' || !Object.hasOwn(PORT_WATER_LEVEL_SOURCES, level.source)) return false;
  const source = PORT_WATER_LEVEL_SOURCES[level.source as PortWaterLevelSource];
  return typeof level.portKey === 'string' && /^(sandre|wpi):[a-zA-Z0-9._-]{1,80}$/.test(level.portKey)
    && level.datum === source.datum && level.sourceUrl === source.url
    && finiteInRange(level.latitude, 90) && finiteInRange(level.longitude, 180)
    && finiteInRange(level.sampleLatitude, 90) && finiteInRange(level.sampleLongitude, 180)
    && finiteInRange(level.heightMeters, 100) && validUtc(level.etaUtc) && validUtc(level.fetchedAt)
    && Date.parse(level.fetchedAt) <= Date.parse(level.etaUtc)
    && portWaterLevelDistanceKm(level as unknown as PortWaterLevel) <= 2.001;
}

export function isPortWaterLevels(value: unknown): value is PortWaterLevels {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.entries(value).every(([role, level]) => (role === 'departure' || role === 'arrival')
      && typeof level?.portName === 'string' && Boolean(level.portName.trim()) && level.portName.length <= 300 && isPortWaterLevel(level)));
}

export function portWaterLevelInput(vessel: Pick<Vessel, 'departurePort' | 'arrivalPort' | 'etd' | 'eta'>, role: PortWaterLevelRole) {
  const portName = (role === 'departure' ? vessel.departurePort : vessel.arrivalPort).trim();
  const eta = role === 'departure' ? vessel.etd : vessel.eta;
  let etaUtc = '';
  try { etaUtc = seaOperationEtaUtc(eta); } catch { /* A port time may still be incomplete. */ }
  return { portName, eta, etaUtc };
}

export function retainPortWaterLevel(payload: SeaOperationPayload, role: PortWaterLevelRole, level: PortWaterLevelSnapshot): SeaOperationPayload {
  const { portName, etaUtc } = portWaterLevelInput(payload.vessel, role);
  if (level.portName !== portName || Date.parse(etaUtc) !== Date.parse(level.etaUtc)) return payload;
  const current = retainedPortWaterLevel(payload.vessel, role);
  if (current && Date.parse(current.fetchedAt) >= Date.parse(level.fetchedAt)) return payload;
  return { ...payload, vessel: { ...payload.vessel, portWaterLevels: { ...payload.vessel.portWaterLevels, [role]: level } } };
}

export function retainedPortWaterLevel(vessel: Vessel, role: PortWaterLevelRole): PortWaterLevelSnapshot | undefined {
  const level = vessel.portWaterLevels?.[role];
  if (!level) return;
  const { portName, etaUtc } = portWaterLevelInput(vessel, role);
  if (level.portName === portName && Date.parse(level.etaUtc) === Date.parse(etaUtc)) return level;
}

export function cleanPortWaterLevels(vessel: Vessel): Vessel {
  if (!vessel.portWaterLevels) return vessel;
  const departure = retainedPortWaterLevel(vessel, 'departure');
  const arrival = retainedPortWaterLevel(vessel, 'arrival');
  if (departure === vessel.portWaterLevels.departure && arrival === vessel.portWaterLevels.arrival) return vessel;
  const next = { ...vessel };
  if (departure || arrival) next.portWaterLevels = { ...(departure && { departure }), ...(arrival && { arrival }) };
  else delete next.portWaterLevels;
  return next;
}

export const portWaterLevelDatum = (level: PortWaterLevel) =>
  level.datum === 'model-geoid' ? 'géoïde du modèle' : 'niveau moyen du modèle';

export function portWaterLevelText(level: PortWaterLevel): string {
  return `${metres.format(level.heightMeters)} m · ${portWaterLevelDatum(level)}`;
}
