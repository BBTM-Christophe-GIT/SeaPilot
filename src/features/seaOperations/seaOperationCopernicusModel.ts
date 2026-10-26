import { validateSeaOperationUkcEstimateInput, type SeaOperationUkcEstimateInput } from './seaOperationUkcEstimateModel';
import { isVesselDraftMeters } from './seaOperationUkc';
import { seaOperationEtaUtc } from './seaOperationWeatherModel';

export type SeaOperationCopernicusInput = SeaOperationUkcEstimateInput;
export type SeaOperationCopernicusModel = 'NWS' | 'IBI';
export const COPERNICUS_UKC_PRODUCTS = {
  NWS: { productId: 'NWSHELF_ANALYSISFORECAST_PHY_004_013',
    seaLevelDatasetId: 'cmems_mod_nws_phy-ssh_anfc_1.5km-2D_PT15M-i',
    bathymetryDatasetId: 'cmems_mod_nws_phy_anfc_1.5km_static', datasetVersion: '202511' },
  IBI: { productId: 'IBI_ANALYSISFORECAST_PHY_005_001',
    seaLevelDatasetId: 'cmems_mod_ibi_phy_anfc_0.027deg-2D_PT15M-i',
    bathymetryDatasetId: 'cmems_mod_ibi_phy_anfc_0.027deg-3D_static', datasetVersion: '202411' },
} as const;

/** Both variables belong to this exact product/version, never an EMODnet LAT sounding. */
export interface SeaOperationCopernicusSource {
  model: SeaOperationCopernicusModel;
  productId: string; seaLevelDatasetId: string; bathymetryDatasetId: string; datasetVersion: string;
  datum: 'model-geoid'; referenceTimeUtc: string | null; sourceUrl: string;
}
export interface SeaOperationCopernicusCell {
  latitude: number; longitude: number;
  bounds: { west: number; east: number; south: number; north: number };
  resolutionMeters: number; depthMeters: number; depthMinMeters: number | null; depthMaxMeters: number | null;
}
export interface SeaOperationCopernicusWaterLevel {
  timeBeforeUtc: string; timeAfterUtc: string; heightBeforeMeters: number; heightAfterMeters: number;
}
export type SeaOperationCopernicusUncertaintyId = 'bathymetryVertical' | 'waterLevel' | 'draft' | 'positionEffect' | 'temporalInterpolation';
export interface SeaOperationCopernicusUncertainty {
  method: 'sum-known-standard-uncertainties'; quantifiedMeters: null; complete: false; confidenceLevel: null;
  components: Array<{ id: SeaOperationCopernicusUncertaintyId; standardUncertaintyMeters: number | null }>;
  missingComponents: SeaOperationCopernicusUncertaintyId[];
}
export interface SeaOperationCopernicusStaticEstimate {
  kind: 'static'; waterLevelMeters: number; ukcMeters: number;
  /** Local depth spread, not an error bar, safe depth or 95% confidence interval. */
  cellVariability: { lowerMeters: number; upperMeters: number } | null;
  uncertainty: SeaOperationCopernicusUncertainty; dynamicCorrectionsApplied: false;
}
export interface SeaOperationCopernicusEstimate {
  version: 1; projectId: string; pointId: string; vesselId: string;
  latitude: number; longitude: number; etaUtc: string; draftMeters: number; fetchedAt: string;
  status: 'available' | 'unavailable'; message: string;
  source: SeaOperationCopernicusSource | null; cell: SeaOperationCopernicusCell | null;
  waterLevel: SeaOperationCopernicusWaterLevel | null; estimate: SeaOperationCopernicusStaticEstimate | null;
}
export interface SeaOperationCopernicusProviderResult {
  status: 'available' | 'unavailable'; message: string;
  source: SeaOperationCopernicusSource | null; cell: SeaOperationCopernicusCell | null;
  waterLevel: SeaOperationCopernicusWaterLevel | null;
}

const QUARTER_HOUR = 900_000;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const text = (value: unknown, max = 2048): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
const position = (value: Record<string, unknown>): value is Record<string, unknown> & { latitude: number; longitude: number } =>
  finite(value.latitude) && finite(value.longitude) && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180;
const utc = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  && Number(value.slice(0, 4)) >= 1000 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-8;

export const validateSeaOperationCopernicusInput = validateSeaOperationUkcEstimateInput;

export function isSeaOperationCopernicusSource(value: unknown): value is SeaOperationCopernicusSource {
  if (!object(value) || value.model !== 'NWS' && value.model !== 'IBI' || value.datum !== 'model-geoid'
    || !(value.referenceTimeUtc === null || utc(value.referenceTimeUtc))) return false;
  const product = COPERNICUS_UKC_PRODUCTS[value.model];
  return Object.entries(product).every(([key, expected]) => value[key] === expected)
    && value.sourceUrl === `https://data.marine.copernicus.eu/product/${product.productId}/description`;
}

function contains(bounds: SeaOperationCopernicusCell['bounds'], point: { latitude: number; longitude: number }): boolean {
  if (point.latitude < bounds.south || point.latitude > bounds.north) return false;
  const longitudes = Math.abs(point.longitude) === 180 ? [-180, 180] : [point.longitude];
  return longitudes.some(longitude => bounds.west < bounds.east
    ? longitude >= bounds.west && longitude <= bounds.east : longitude >= bounds.west || longitude <= bounds.east);
}

export function isSeaOperationCopernicusCell(value: unknown): value is SeaOperationCopernicusCell {
  if (!object(value) || !position(value) || !object(value.bounds)
    || !finite(value.resolutionMeters) || value.resolutionMeters <= 0 || !finite(value.depthMeters) || value.depthMeters <= 0) return false;
  const bounds = value.bounds;
  if (!finite(bounds.west) || !finite(bounds.east) || !finite(bounds.south) || !finite(bounds.north)
    || Math.abs(bounds.west) > 180 || Math.abs(bounds.east) > 180 || bounds.south < -90 || bounds.north > 90
    || bounds.south >= bounds.north || bounds.west === bounds.east || bounds.west === 180 && bounds.east === -180
    || !contains(bounds as SeaOperationCopernicusCell['bounds'], value)) return false;
  return (value.depthMinMeters === null || finite(value.depthMinMeters) && value.depthMinMeters >= 0 && value.depthMinMeters <= value.depthMeters)
    && (value.depthMaxMeters === null || finite(value.depthMaxMeters) && value.depthMaxMeters >= value.depthMeters);
}

export function isSeaOperationCopernicusWaterLevel(value: unknown): value is SeaOperationCopernicusWaterLevel {
  if (!object(value) || !utc(value.timeBeforeUtc) || !utc(value.timeAfterUtc)
    || !finite(value.heightBeforeMeters) || !finite(value.heightAfterMeters)) return false;
  const before = Date.parse(value.timeBeforeUtc), after = Date.parse(value.timeAfterUtc);
  return before % QUARTER_HOUR === 0 && after % QUARTER_HOUR === 0 && after >= before && after - before <= QUARTER_HOUR
    && (after > before || value.heightBeforeMeters === value.heightAfterMeters);
}

function calculate(etaUtc: string, draftMeters: number, source: SeaOperationCopernicusSource, cell: SeaOperationCopernicusCell,
  waterLevel: SeaOperationCopernicusWaterLevel): SeaOperationCopernicusStaticEstimate | null {
  const before = Date.parse(waterLevel.timeBeforeUtc), after = Date.parse(waterLevel.timeAfterUtc), eta = Date.parse(etaUtc);
  if (eta < before || eta > after || cell.depthMeters <= 10
    || source.referenceTimeUtc !== null && Date.parse(source.referenceTimeUtc) > before) return null;
  const weight = after === before ? 0 : (eta - before) / (after - before);
  // Select an exact endpoint before arithmetic so an adjacent overflowing value cannot contaminate it.
  const waterLevelMeters = eta === before ? waterLevel.heightBeforeMeters : eta === after ? waterLevel.heightAfterMeters
    : waterLevel.heightBeforeMeters + (waterLevel.heightAfterMeters - waterLevel.heightBeforeMeters) * weight;
  const ukcMeters = cell.depthMeters + waterLevelMeters - draftMeters;
  const cellVariability = cell.depthMinMeters === null || cell.depthMaxMeters === null ? null : {
    lowerMeters: cell.depthMinMeters + waterLevelMeters - draftMeters, upperMeters: cell.depthMaxMeters + waterLevelMeters - draftMeters,
  };
  if (!finite(waterLevelMeters) || !finite(ukcMeters) || cellVariability && (!finite(cellVariability.lowerMeters) || !finite(cellVariability.upperMeters))) return null;
  const ids: SeaOperationCopernicusUncertaintyId[] = ['bathymetryVertical', 'waterLevel', 'draft', 'positionEffect', 'temporalInterpolation'];
  const exact = eta === before || eta === after;
  const components = ids.map(id => ({ id, standardUncertaintyMeters: id === 'temporalInterpolation' && exact ? 0 : null }));
  return { kind: 'static', waterLevelMeters, ukcMeters, cellVariability,
    uncertainty: { method: 'sum-known-standard-uncertainties', quantifiedMeters: null, complete: false, confidenceLevel: null,
      components, missingComponents: components.filter(component => component.standardUncertaintyMeters === null).map(component => component.id) },
    dynamicCorrectionsApplied: false };
}

/** Arithmetic within a common model geoid; no fabricated LAT conversion or total error bar. */
export function calculateSeaOperationCopernicusEstimate(inputValue: SeaOperationCopernicusInput, provider: SeaOperationCopernicusProviderResult,
  fetchedAt = new Date().toISOString()): SeaOperationCopernicusEstimate {
  const input = validateSeaOperationCopernicusInput(inputValue);
  if (!utc(fetchedAt)) throw new Error('La date de consultation UKC est invalide.');
  const source = isSeaOperationCopernicusSource(provider.source) ? provider.source : null;
  const cell = isSeaOperationCopernicusCell(provider.cell) ? provider.cell : null;
  const waterLevel = isSeaOperationCopernicusWaterLevel(provider.waterLevel) ? provider.waterLevel : null;
  const result: SeaOperationCopernicusEstimate = { version: 1, projectId: input.projectId, pointId: input.pointId, vesselId: input.vesselId,
    latitude: input.latitude, longitude: input.longitude, etaUtc: seaOperationEtaUtc(input.eta), draftMeters: input.draftMeters, fetchedAt,
    status: 'unavailable', message: '', source, cell, waterLevel, estimate: null };
  if (provider.status !== 'available') return { ...result, message: text(provider.message) ? provider.message : 'Données Copernicus indisponibles à cette position et cette ETA.' };
  if (!source || !cell || !waterLevel) return { ...result, message: 'Les données du modèle Copernicus sont incomplètes ou incompatibles.' };
  if (!contains(cell.bounds, input)) return { ...result, message: 'La maille du modèle ne couvre pas ce waypoint.' };
  if (Date.parse(fetchedAt) > Date.parse(result.etaUtc)) return { ...result, message: 'L’ETA est passée : une nouvelle analyse ne remplace pas la prévision conservée.' };
  if (cell.depthMeters <= 10) return { ...result, message: 'Petits fonds : SeaPilot ne calcule pas l’UKC automatique pour une profondeur modélisée inférieure ou égale à 10 m.' };
  const estimate = calculate(result.etaUtc, input.draftMeters, source, cell, waterLevel);
  return estimate ? { ...result, status: 'available', message: 'Estimation statique du modèle ; incertitude totale non quantifiée.', estimate }
    : { ...result, message: 'Le modèle ne fournit pas de valeurs compatibles encadrant cette ETA.' };
}

/** Validate the provenance and recompute arithmetic rather than trusting a recorded number. */
export function isSeaOperationCopernicusEstimate(value: unknown): value is SeaOperationCopernicusEstimate {
  if (!object(value) || value.version !== 1 || !identifier(value.projectId) || !identifier(value.vesselId)
    || typeof value.pointId !== 'string' || !/^[A-Za-z0-9._:-]{1,100}$/.test(value.pointId)
    || !position(value) || !utc(value.etaUtc) || !utc(value.fetchedAt) || !isVesselDraftMeters(value.draftMeters) || !text(value.message)
    || !(value.source === null || isSeaOperationCopernicusSource(value.source))
    || !(value.cell === null || isSeaOperationCopernicusCell(value.cell))
    || !(value.waterLevel === null || isSeaOperationCopernicusWaterLevel(value.waterLevel))) return false;
  if (value.status === 'unavailable') return value.estimate === null;
  if (value.status !== 'available' || !value.source || !value.cell || !value.waterLevel || !object(value.estimate)
    || Date.parse(value.fetchedAt) > Date.parse(value.etaUtc)
    || !contains(value.cell.bounds, value)) return false;
  const expected = calculate(value.etaUtc, value.draftMeters, value.source, value.cell, value.waterLevel);
  if (!expected || !finite(value.estimate.ukcMeters) || !finite(value.estimate.waterLevelMeters)
    || !near(expected.ukcMeters, value.estimate.ukcMeters) || !near(expected.waterLevelMeters, value.estimate.waterLevelMeters)) return false;
  const variability = value.estimate.cellVariability;
  if (expected.cellVariability === null ? variability !== null : !object(variability)
    || !finite(variability.lowerMeters) || !finite(variability.upperMeters)
    || !near(expected.cellVariability.lowerMeters, variability.lowerMeters) || !near(expected.cellVariability.upperMeters, variability.upperMeters)) return false;
  // Python and JavaScript may differ in their final floating bit; every other field must agree exactly.
  return stableJson({ ...value.estimate, ukcMeters: expected.ukcMeters, waterLevelMeters: expected.waterLevelMeters,
    cellVariability: expected.cellVariability }) === stableJson(expected);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
}
