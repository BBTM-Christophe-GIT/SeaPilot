import { isVesselDraftMeters } from './seaOperationUkc';
import { seaOperationEtaUtc, validateSeaOperationWeatherInput } from './seaOperationWeatherModel';

export interface SeaOperationUkcEstimateInput {
  projectId: string; pointId: string; vesselId: string;
  latitude: number; longitude: number; eta: string; draftMeters: number;
}

/** Actual geographic footprint supplied by the dataset, never inferred from resolution. */
export interface SeaOperationUkcCellBounds {
  /** west > east identifies a cell crossing the antimeridian. */
  west: number; east: number; south: number; north: number;
}

export interface SeaOperationUkcBathymetry {
  datasetId: string; sourceUrl: string; datum: 'LAT';
  latitude: number; longitude: number; resolutionMeters: number; cellBounds: SeaOperationUkcCellBounds;
  depthMeanMeters: number; depthMinMeters: number | null; depthMaxMeters: number | null;
  /** Dispersion of cell values, deliberately not a measurement uncertainty. */
  dispersionMeters: number | null; sampleCount: number | null; interpolated: boolean | null;
  standardUncertaintyMeters: number | null;
}

export interface SeaOperationUkcWaterLevelSample {
  model: string; sourceUrl: string; datum: string; referenceTimeUtc: string;
  latitude: number; longitude: number; resolutionMeters: number; cellBounds: SeaOperationUkcCellBounds;
  timeUtc: string; heightMeters: number; standardUncertaintyMeters: number | null;
}

export interface SeaOperationUkcWaterLevel extends SeaOperationUkcWaterLevelSample {
  method: 'exact' | 'linear';
  timeBeforeUtc: string; timeAfterUtc: string;
  heightBeforeMeters: number; heightAfterMeters: number;
}

export interface SeaOperationUkcVerticalTransformation {
  fromDatum: string; toDatum: 'LAT';
  /** Add this separation to the source water level to express it above LAT. */
  offsetMeters: number;
  standardUncertaintyMeters: number | null;
  qualified: boolean; reference: string; sourceUrl: string;
  latitude: number; longitude: number;
}

export type SeaOperationUkcUncertaintyComponent = 'bathymetryVertical' | 'waterLevel' | 'verticalTransformation' | 'draft' | 'positionEffect' | 'temporalInterpolation';
export interface SeaOperationUkcUncertainty {
  method: 'sum-known-standard-uncertainties';
  /** Sum of explicitly quantified components, not a 95% confidence interval. */
  quantifiedMeters: number | null;
  complete: boolean; confidenceLevel: null;
  components: Array<{ id: SeaOperationUkcUncertaintyComponent; standardUncertaintyMeters: number | null }>;
  missingComponents: SeaOperationUkcUncertaintyComponent[];
}

export interface SeaOperationUkcStaticEstimate {
  kind: 'static'; datum: 'LAT'; waterLevelLatMeters: number; ukcMeters: number;
  /** UKC on the shallowest/deepest represented cell values, not a certified bound. */
  cellVariability: { lowerMeters: number; upperMeters: number } | null;
  uncertainty: SeaOperationUkcUncertainty;
  dynamicCorrectionsApplied: false;
}

export interface SeaOperationUkcEstimate {
  version: 1; projectId: string; pointId: string; vesselId: string;
  latitude: number; longitude: number; etaUtc: string; draftMeters: number; fetchedAt: string;
  status: 'available' | 'unavailable'; message: string;
  bathymetry: SeaOperationUkcBathymetry | null;
  waterLevel: SeaOperationUkcWaterLevel | null;
  transformation: SeaOperationUkcVerticalTransformation | null;
  estimate: SeaOperationUkcStaticEstimate | null;
}

export interface SeaOperationUkcEstimateSources {
  bathymetry?: SeaOperationUkcBathymetry | null;
  waterLevel?: SeaOperationUkcWaterLevel | null;
  transformation?: SeaOperationUkcVerticalTransformation | null;
  draftStandardUncertaintyMeters?: number | null;
  /** Vertical effect of position uncertainty, not raw horizontal GNSS accuracy. */
  positionEffectStandardUncertaintyMeters?: number | null;
  temporalInterpolationStandardUncertaintyMeters?: number | null;
  unavailableReason?: string;
}

const HOUR = 3_600_000;
const text = (value: unknown, limit = 512): value is string => typeof value === 'string' && value.length > 0 && value.length <= limit;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nonnegative = (value: unknown): value is number => finite(value) && value >= 0;
const nullableUncertainty = (value: unknown): value is number | null => value === null || nonnegative(value);
const utc = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && Number(value.slice(0, 4)) >= 1000 && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
const position = (value: Record<string, unknown>): value is Record<string, unknown> & { latitude: number; longitude: number } => finite(value.latitude)
  && finite(value.longitude) && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180;
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-8;

function officialSource(value: unknown): value is string {
  if (!text(value, 2048) || /\s/u.test(value) || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && ['erddap.emodnet.eu', 'emodnet.ec.europa.eu', 'services.data.shom.fr', 'diffusion.shom.fr', 'www.shom.fr'].includes(url.hostname);
  } catch { return false; }
}

function cellBounds(value: unknown): value is SeaOperationUkcCellBounds {
  return object(value) && finite(value.west) && finite(value.east) && finite(value.south) && finite(value.north)
    && Math.abs(value.west) <= 180 && Math.abs(value.east) <= 180 && value.south >= -90 && value.north <= 90
    && value.south < value.north && value.west !== value.east && !(value.west === 180 && value.east === -180);
}

function cellContains(bounds: SeaOperationUkcCellBounds, point: { latitude: number; longitude: number }): boolean {
  if (point.latitude < bounds.south || point.latitude > bounds.north) return false;
  // +180 and -180 denote the same meridian, including at a non-crossing boundary.
  const longitudes = Math.abs(point.longitude) === 180 ? [-180, 180] : [point.longitude];
  return longitudes.some(longitude => bounds.west < bounds.east
    ? longitude >= bounds.west && longitude <= bounds.east : longitude >= bounds.west || longitude <= bounds.east);
}

export function validateSeaOperationUkcEstimateInput(value: unknown): SeaOperationUkcEstimateInput {
  const point = validateSeaOperationWeatherInput(value);
  const input = value as Record<string, unknown>;
  if (!identifier(input.vesselId) || !isVesselDraftMeters(input.draftMeters)) throw new Error('Le navire ou son tirant d’eau de référence est invalide.');
  return { ...point, vesselId: input.vesselId, draftMeters: input.draftMeters };
}

export function isSeaOperationUkcBathymetry(value: unknown): value is SeaOperationUkcBathymetry {
  if (!object(value) || !position(value) || !text(value.datasetId) || !officialSource(value.sourceUrl) || value.datum !== 'LAT'
    || !cellBounds(value.cellBounds) || !cellContains(value.cellBounds, value)
    || !finite(value.resolutionMeters) || value.resolutionMeters <= 0 || !finite(value.depthMeanMeters)
    || !nullableUncertainty(value.dispersionMeters) || !nullableUncertainty(value.standardUncertaintyMeters)
    || !(value.sampleCount === null || Number.isSafeInteger(value.sampleCount) && Number(value.sampleCount) >= 0)
    || !(value.interpolated === null || typeof value.interpolated === 'boolean')) return false;
  return (value.depthMinMeters === null || finite(value.depthMinMeters) && value.depthMinMeters <= value.depthMeanMeters)
    && (value.depthMaxMeters === null || finite(value.depthMaxMeters) && value.depthMaxMeters >= value.depthMeanMeters);
}

export function isSeaOperationUkcWaterLevelSample(value: unknown): value is SeaOperationUkcWaterLevelSample {
  return object(value) && position(value) && text(value.model) && text(value.datum, 128) && officialSource(value.sourceUrl)
    && cellBounds(value.cellBounds) && cellContains(value.cellBounds, value)
    && utc(value.referenceTimeUtc) && utc(value.timeUtc) && Date.parse(value.referenceTimeUtc) <= Date.parse(value.timeUtc)
    && finite(value.resolutionMeters) && value.resolutionMeters > 0 && finite(value.heightMeters) && nullableUncertainty(value.standardUncertaintyMeters);
}

export function isSeaOperationUkcWaterLevel(value: unknown): value is SeaOperationUkcWaterLevel {
  if (!isSeaOperationUkcWaterLevelSample(value)) return false;
  const row = value as unknown as Record<string, unknown>;
  if (!utc(row.timeBeforeUtc) || !utc(row.timeAfterUtc) || !finite(row.heightBeforeMeters) || !finite(row.heightAfterMeters)) return false;
  const before = Date.parse(row.timeBeforeUtc), after = Date.parse(row.timeAfterUtc), target = Date.parse(value.timeUtc);
  if (target < before || target > after || after - before > HOUR || Date.parse(value.referenceTimeUtc) > before) return false;
  if (row.method === 'exact') return before === after && before === target && near(row.heightBeforeMeters, value.heightMeters) && near(row.heightAfterMeters, value.heightMeters);
  if (row.method !== 'linear' || before >= after) return false;
  return near(value.heightMeters, row.heightBeforeMeters + (row.heightAfterMeters - row.heightBeforeMeters) * (target - before) / (after - before));
}

/** Interpolate only two bracketing hourly values from the exact same cell/run. */
export function interpolateSeaOperationUkcWaterLevel(before: SeaOperationUkcWaterLevelSample, after: SeaOperationUkcWaterLevelSample,
  etaUtc: string): SeaOperationUkcWaterLevel | undefined {
  if (!isSeaOperationUkcWaterLevelSample(before) || !isSeaOperationUkcWaterLevelSample(after) || !utc(etaUtc)) return undefined;
  if (['model', 'sourceUrl', 'datum', 'referenceTimeUtc', 'latitude', 'longitude', 'resolutionMeters'].some(key =>
    before[key as keyof SeaOperationUkcWaterLevelSample] !== after[key as keyof SeaOperationUkcWaterLevelSample])) return undefined;
  if (['west', 'east', 'south', 'north'].some(key => before.cellBounds[key as keyof SeaOperationUkcCellBounds]
    !== after.cellBounds[key as keyof SeaOperationUkcCellBounds])) return undefined;
  const start = Date.parse(before.timeUtc), end = Date.parse(after.timeUtc), target = Date.parse(etaUtc);
  if (start > target || end < target || start > end || end - start > HOUR || start === end && before.heightMeters !== after.heightMeters) return undefined;
  // An ETA on a published instant uses that sample alone. Do not inherit an
  // unknown neighbouring uncertainty or invent an interpolation at the endpoint.
  if (target === start || target === end) {
    const exact = target === start ? before : after;
    return { ...exact, timeUtc: etaUtc, method: 'exact', timeBeforeUtc: exact.timeUtc, timeAfterUtc: exact.timeUtc,
      heightBeforeMeters: exact.heightMeters, heightAfterMeters: exact.heightMeters };
  }
  const weight = (target - start) / (end - start);
  const heightMeters = before.heightMeters + (after.heightMeters - before.heightMeters) * weight;
  if (!finite(heightMeters)) return undefined;
  const uncertainty = before.standardUncertaintyMeters === null || after.standardUncertaintyMeters === null ? null
    : Math.max(before.standardUncertaintyMeters, after.standardUncertaintyMeters);
  return { ...before, timeUtc: etaUtc, heightMeters,
    standardUncertaintyMeters: uncertainty, method: 'linear',
    timeBeforeUtc: before.timeUtc, timeAfterUtc: after.timeUtc, heightBeforeMeters: before.heightMeters, heightAfterMeters: after.heightMeters };
}

export function isSeaOperationUkcVerticalTransformation(value: unknown): value is SeaOperationUkcVerticalTransformation {
  return object(value) && position(value) && text(value.fromDatum, 128) && value.toDatum === 'LAT' && finite(value.offsetMeters)
    && (value.fromDatum !== 'LAT' || value.offsetMeters === 0)
    && nullableUncertainty(value.standardUncertaintyMeters) && typeof value.qualified === 'boolean' && text(value.reference)
    && officialSource(value.sourceUrl);
}

function uncertaintyBudget(sources: SeaOperationUkcEstimateSources): SeaOperationUkcUncertainty {
  const components: SeaOperationUkcUncertainty['components'] = [
    { id: 'bathymetryVertical', standardUncertaintyMeters: sources.bathymetry?.standardUncertaintyMeters ?? null },
    { id: 'waterLevel', standardUncertaintyMeters: sources.waterLevel?.standardUncertaintyMeters ?? null },
    { id: 'verticalTransformation', standardUncertaintyMeters: sources.transformation?.standardUncertaintyMeters ?? null },
    { id: 'draft', standardUncertaintyMeters: sources.draftStandardUncertaintyMeters ?? null },
    { id: 'positionEffect', standardUncertaintyMeters: sources.positionEffectStandardUncertaintyMeters ?? null },
    { id: 'temporalInterpolation', standardUncertaintyMeters: sources.waterLevel?.method === 'exact' ? 0 : sources.temporalInterpolationStandardUncertaintyMeters ?? null },
  ];
  const missingComponents = components.filter(component => component.standardUncertaintyMeters === null).map(component => component.id);
  const sum = components.reduce((total, component) => total + (component.standardUncertaintyMeters ?? 0), 0);
  return { method: 'sum-known-standard-uncertainties', quantifiedMeters: sum > 0 || !missingComponents.length ? sum : null,
    complete: !missingComponents.length, confidenceLevel: null, components, missingComponents };
}

/** Returns an auditable static estimate only after the source level is qualified in LAT. */
export function calculateSeaOperationUkcEstimate(value: SeaOperationUkcEstimateInput, sources: SeaOperationUkcEstimateSources,
  fetchedAt = new Date().toISOString()): SeaOperationUkcEstimate {
  const input = validateSeaOperationUkcEstimateInput(value);
  if (!utc(fetchedAt)) throw new Error('La date de consultation hydrographique est invalide.');
  const bathymetry = isSeaOperationUkcBathymetry(sources.bathymetry) ? sources.bathymetry : null;
  const waterLevel = isSeaOperationUkcWaterLevel(sources.waterLevel) ? sources.waterLevel : null;
  const transformation = isSeaOperationUkcVerticalTransformation(sources.transformation) ? sources.transformation : null;
  const result: SeaOperationUkcEstimate = { version: 1, projectId: input.projectId, pointId: input.pointId, vesselId: input.vesselId,
    latitude: input.latitude, longitude: input.longitude, etaUtc: seaOperationEtaUtc(input.eta), draftMeters: input.draftMeters, fetchedAt,
    status: 'unavailable', message: '', bathymetry, waterLevel, transformation, estimate: null };
  const unavailable = (message: string) => ({ ...result, message: text(sources.unavailableReason, 2048) ? sources.unavailableReason : message });
  if (!bathymetry) return unavailable('Profondeur bathymétrique indisponible à ce waypoint.');
  // No coastal relocation: a bathymetric cell must actually cover the requested point.
  if (!cellContains(bathymetry.cellBounds, input)) return unavailable('La maille bathymétrique ne couvre pas ce waypoint.');
  if (!waterLevel) return unavailable('Niveau d’eau indisponible à l’ETA de ce waypoint.');
  if (Date.parse(waterLevel.timeUtc) !== Date.parse(result.etaUtc)) return unavailable('Le niveau d’eau ne correspond pas à l’ETA du waypoint.');
  if (!cellContains(waterLevel.cellBounds, input)) return unavailable('La maille du niveau d’eau ne couvre pas ce waypoint.');
  if (!transformation?.qualified) return unavailable('Conversion verticale qualifiée vers le LAT indisponible : calcul UKC non effectué.');
  if (transformation.fromDatum !== waterLevel.datum) return unavailable('Les références du niveau d’eau et de la conversion verticale sont incompatibles.');
  if (!near(transformation.latitude, input.latitude) || !near(transformation.longitude, input.longitude)) return unavailable('La conversion verticale ne correspond pas au waypoint.');
  if (!nullableUncertainty(sources.draftStandardUncertaintyMeters ?? null) || !nullableUncertainty(sources.positionEffectStandardUncertaintyMeters ?? null)
    || !nullableUncertainty(sources.temporalInterpolationStandardUncertaintyMeters ?? null)) {
    return unavailable('Une composante du budget d’incertitude est invalide.');
  }
  const waterLevelLatMeters = waterLevel.heightMeters + transformation.offsetMeters;
  const ukcMeters = bathymetry.depthMeanMeters + waterLevelLatMeters - input.draftMeters;
  const uncertainty = uncertaintyBudget(sources);
  if (!finite(waterLevelLatMeters) || !finite(ukcMeters) || uncertainty.quantifiedMeters !== null && !finite(uncertainty.quantifiedMeters)
    || bathymetry.depthMinMeters !== null && !finite(bathymetry.depthMinMeters + waterLevelLatMeters - input.draftMeters)
    || bathymetry.depthMaxMeters !== null && !finite(bathymetry.depthMaxMeters + waterLevelLatMeters - input.draftMeters)) {
    return unavailable('Les valeurs hydrographiques ne permettent pas un calcul numérique valide.');
  }
  result.status = 'available';
  result.message = uncertainty.complete ? 'Estimation statique ; budget des composantes déclarées, sans niveau de confiance de 95 %.'
    : 'Estimation statique ; incertitude partiellement quantifiée. Les composantes inconnues ne sont pas assimilées à zéro.';
  result.estimate = { kind: 'static', datum: 'LAT', waterLevelLatMeters, ukcMeters,
    cellVariability: bathymetry.depthMinMeters === null || bathymetry.depthMaxMeters === null ? null : {
      lowerMeters: bathymetry.depthMinMeters + waterLevelLatMeters - input.draftMeters,
      upperMeters: bathymetry.depthMaxMeters + waterLevelLatMeters - input.draftMeters,
    }, uncertainty, dynamicCorrectionsApplied: false };
  return result;
}

/** Recompute the recorded arithmetic/budget instead of trusting a supplied UKC number. */
export function isSeaOperationUkcEstimate(value: unknown): value is SeaOperationUkcEstimate {
  if (!object(value) || value.version !== 1 || !position(value) || !identifier(value.projectId) || !identifier(value.vesselId)
    || typeof value.pointId !== 'string' || !/^[A-Za-z0-9._:-]{1,100}$/.test(value.pointId) || !isVesselDraftMeters(value.draftMeters)
    || !utc(value.etaUtc) || !utc(value.fetchedAt) || !text(value.message, 2048)
    || !(value.bathymetry === null || isSeaOperationUkcBathymetry(value.bathymetry))
    || !(value.waterLevel === null || isSeaOperationUkcWaterLevel(value.waterLevel))
    || !(value.transformation === null || isSeaOperationUkcVerticalTransformation(value.transformation))) return false;
  if (value.status === 'unavailable') return value.estimate === null;
  if (value.status !== 'available' || !object(value.estimate) || !value.bathymetry || !value.waterLevel || !value.transformation) return false;
  const estimate = value.estimate;
  if (!object(estimate.uncertainty) || !Array.isArray(estimate.uncertainty.components)) return false;
  const component = (id: SeaOperationUkcUncertaintyComponent) => (estimate.uncertainty as unknown as SeaOperationUkcUncertainty).components.find(item => item?.id === id)?.standardUncertaintyMeters;
  // Convert the UTC timestamp back to an unambiguous local input without a browser dependency.
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value.etaUtc));
  const part = (key: string) => parts.find(item => item.type === key)!.value;
  const eta = `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
  try {
    const expected = calculateSeaOperationUkcEstimate({ projectId: value.projectId, pointId: value.pointId, vesselId: value.vesselId,
      latitude: value.latitude, longitude: value.longitude, eta, draftMeters: value.draftMeters }, {
      bathymetry: value.bathymetry, waterLevel: value.waterLevel, transformation: value.transformation,
      draftStandardUncertaintyMeters: component('draft'), positionEffectStandardUncertaintyMeters: component('positionEffect'),
      temporalInterpolationStandardUncertaintyMeters: component('temporalInterpolation'),
    }, value.fetchedAt);
    return expected.status === 'available' && Date.parse(expected.etaUtc) === Date.parse(value.etaUtc)
      && stableJson(expected.estimate) === stableJson(estimate);
  } catch { return false; }
}

/** jsonb reorders object keys; semantic validation must not depend on their order. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
}
