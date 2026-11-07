import type { SupabaseClient } from '@supabase/supabase-js';
import { isSeaOperationConsumptionTrace, type SeaOperationConsumptionTrace } from './seaOperationConsumptionTrace';

export type SeaOperationGaugeUnit = 'percent' | 'cm';

export interface SeaOperationTankGaugePair {
  port: number;
  starboard: number;
}

export interface SeaOperationTankGauges {
  departure: SeaOperationTankGaugePair;
  arrival: SeaOperationTankGaugePair;
}

export interface SeaOperationConsumptionInputs {
  durationMinutes: number;
  averageSpeedKnots: number;
  gaugeUnit: SeaOperationGaugeUnit;
  departureGauge: number;
  arrivalGauge: number;
  refuelLiters: number | null;
  pricePerLiter: number | null;
  actualArrival: string | null;
  completed: true;
  tankGauges?: SeaOperationTankGauges;
  trace?: SeaOperationConsumptionTrace | null;
}

export interface SeaOperationConsumptionCalibration {
  kind: 'rozel' | 'suroit' | 'nominal' | 'unavailable';
  defaultGaugeUnit: SeaOperationGaugeUnit;
  nominalCapacityLiters: number | null;
  tankCalibration?: 'landemer-v1';
}

export interface SeaOperationConsumptionValues {
  distanceNm: number;
  departureLiters: number | null;
  arrivalLiters: number | null;
  consumedLiters: number | null;
  litersPerHour: number | null;
  litersPerNm: number | null;
  costEuros: number | null;
}

export interface SeaOperationConsumptionRecord extends SeaOperationConsumptionInputs, SeaOperationConsumptionValues {
  version: number;
  includedInReference: boolean;
  updatedAt: string;
}

export interface SeaOperationConsumptionReference {
  vesselId: number | null;
  transitLitersPerNm: number | null;
  towageLitersPerNm: number | null;
  pricePerLiter: number | null;
  priceDate: string | null;
}

export interface SeaOperationConsumption {
  operationId: string;
  canEdit: boolean;
  calibration: SeaOperationConsumptionCalibration;
  reference: SeaOperationConsumptionReference;
  record: SeaOperationConsumptionRecord | null;
}

const LANDEMER_TANK_CAPACITY_LITERS = 12_357;
// Portside and Starboard curves supplied for LANDEMER. Both tables give the same points.
const landemerTankCurve = [
  [0, 0], [1, 124], [2.902, 359], [10.601, 1310], [21.980, 2716], [34.616, 4277],
  [47.439, 5862], [60.442, 7469], [73.626, 9098], [81.593, 10082], [84.283, 10415],
  [87.072, 10759], [89.961, 11116], [92.942, 11485], [95.965, 11858], [97.900, 12097],
  [98, 12110], [98.989, 12232], [100, LANDEMER_TANK_CAPACITY_LITERS],
] as const;

export function landemerTankVolumeLiters(gaugePercent: number): number | null {
  if (!Number.isFinite(gaugePercent) || gaugePercent < 0 || gaugePercent > 100) return null;
  const upperIndex = landemerTankCurve.findIndex(([gauge]) => gauge >= gaugePercent);
  const [upperGauge, upperVolume] = landemerTankCurve[upperIndex];
  if (upperGauge === gaugePercent) return upperVolume;
  const [lowerGauge, lowerVolume] = landemerTankCurve[upperIndex - 1];
  return lowerVolume + (gaugePercent - lowerGauge) / (upperGauge - lowerGauge) * (upperVolume - lowerVolume);
}

function landemerTanksVolumeLiters(gauges: SeaOperationTankGaugePair): number | null {
  const port = landemerTankVolumeLiters(gauges.port);
  const starboard = landemerTankVolumeLiters(gauges.starboard);
  return port === null || starboard === null ? null : port + starboard;
}

export function landemerTankGaugePercent(gauges: SeaOperationTankGaugePair): number | null {
  const liters = landemerTanksVolumeLiters(gauges);
  return liters === null ? null : liters / (2 * LANDEMER_TANK_CAPACITY_LITERS) * 100;
}

function gaugeVolume(gauge: number, unit: SeaOperationGaugeUnit, calibration: SeaOperationConsumptionCalibration): number | null {
  if (!Number.isFinite(gauge) || gauge < 0) return null;
  if (unit === 'cm') return calibration.kind === 'suroit' ? 34.3 * gauge : null;
  if (gauge > 100) return null;
  const fraction = gauge / 100;
  if (calibration.kind === 'rozel') {
    return 2 * (22684 * fraction ** 4 - 58886 * fraction ** 3 + 45082 * fraction ** 2 - 1048 * fraction + 165.5);
  }
  return calibration.nominalCapacityLiters === null ? null : calibration.nominalCapacityLiters * fraction;
}

/** Preview only. The database calculates and stores the authoritative result from the submitted readings. */
export function calculateSeaOperationConsumption(inputs: SeaOperationConsumptionInputs,
  calibration: SeaOperationConsumptionCalibration): SeaOperationConsumptionValues {
  const hours = inputs.durationMinutes / 60;
  const distanceNm = inputs.trace?.distanceNm ?? hours * inputs.averageSpeedKnots;
  const convert = (gauge: number, pair?: SeaOperationTankGaugePair) => pair
    ? calibration.tankCalibration === 'landemer-v1' && inputs.gaugeUnit === 'percent' ? landemerTanksVolumeLiters(pair) : null
    : gaugeVolume(gauge, inputs.gaugeUnit, calibration);
  const departureLiters = convert(inputs.departureGauge, inputs.tankGauges?.departure);
  const arrivalLiters = convert(inputs.arrivalGauge, inputs.tankGauges?.arrival);
  const consumedLiters = departureLiters === null || arrivalLiters === null || departureLiters < arrivalLiters
    ? null : departureLiters - arrivalLiters;
  return {
    distanceNm,
    departureLiters,
    arrivalLiters,
    consumedLiters,
    litersPerHour: consumedLiters === null || hours <= 0 ? null : consumedLiters / hours,
    litersPerNm: consumedLiters === null || distanceNm <= 0 ? null : consumedLiters / distanceNm,
    costEuros: consumedLiters === null || inputs.pricePerLiter === null ? null : consumedLiters * inputs.pricePerLiter,
  };
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function number(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nullableNumber(value: unknown): value is number | null {
  return value === null || number(value);
}

function gaugeUnit(value: unknown): value is SeaOperationGaugeUnit {
  return value === 'percent' || value === 'cm';
}

function isTankGaugePair(value: unknown): value is SeaOperationTankGaugePair {
  const pair = object(value);
  return pair !== null && [pair.port, pair.starboard].every(gauge => number(gauge) && gauge >= 0 && gauge <= 100
    && Math.round(gauge * 1000) / 1000 === gauge);
}

function isTankGauges(value: unknown): value is SeaOperationTankGauges {
  const gauges = object(value);
  return gauges !== null && isTankGaugePair(gauges.departure) && isTankGaugePair(gauges.arrival);
}

const nullableFields = ['refuelLiters', 'pricePerLiter', 'departureLiters', 'arrivalLiters', 'consumedLiters',
  'litersPerHour', 'litersPerNm', 'costEuros'];

export function isSeaOperationConsumptionRecordFields(value: unknown): value is Omit<SeaOperationConsumptionRecord, 'trace'> {
  const record = object(value);
  return record !== null && number(record.version) && record.completed === true
    && typeof record.updatedAt === 'string' && typeof record.includedInReference === 'boolean'
    && gaugeUnit(record.gaugeUnit) && (record.actualArrival === null || typeof record.actualArrival === 'string')
    && (record.tankGauges === undefined || record.gaugeUnit === 'percent' && isTankGauges(record.tankGauges))
    && ['durationMinutes', 'averageSpeedKnots', 'departureGauge', 'arrivalGauge', 'distanceNm'].every(key => number(record[key]))
    && nullableFields.every(key => nullableNumber(record[key]));
}

export function isSeaOperationConsumptionRecord(value: unknown): value is SeaOperationConsumptionRecord {
  if (!isSeaOperationConsumptionRecordFields(value)) return false;
  const trace = 'trace' in value ? value.trace : undefined;
  return trace == null || isSeaOperationConsumptionTrace(trace);
}

function readConsumption(value: unknown, operationId: string): SeaOperationConsumption {
  const data = object(value);
  const calibration = object(data?.calibration);
  const reference = object(data?.reference);
  if (!data || data.operationId !== operationId || typeof data.canEdit !== 'boolean' || !calibration
    || !['rozel', 'suroit', 'nominal', 'unavailable'].includes(String(calibration.kind))
    || !gaugeUnit(calibration.defaultGaugeUnit) || !nullableNumber(calibration.nominalCapacityLiters)
    || (calibration.tankCalibration !== undefined && (calibration.tankCalibration !== 'landemer-v1' || calibration.defaultGaugeUnit !== 'percent'))
    || !reference || !['vesselId', 'transitLitersPerNm', 'towageLitersPerNm', 'pricePerLiter'].every(key => nullableNumber(reference[key]))
    || (reference.priceDate !== null && typeof reference.priceDate !== 'string')
    || (data.record !== null && !isSeaOperationConsumptionRecord(data.record))) {
    throw new Error('Le relevé de consommation reçu est invalide.');
  }
  return data as unknown as SeaOperationConsumption;
}

export async function fetchSeaOperationConsumption(client: SupabaseClient, operationId: string): Promise<SeaOperationConsumption> {
  const { data, error } = await client.rpc('sea_operation_consumption', { p_id: operationId });
  if (error) throw error;
  return readConsumption(data, operationId);
}

export async function saveSeaOperationConsumption(client: SupabaseClient, operationId: string,
  expectedVersion: number | null, inputs: SeaOperationConsumptionInputs): Promise<SeaOperationConsumption> {
  const { data, error } = await client.rpc('sea_operation_save_consumption', {
    p_id: operationId,
    p_expected_version: expectedVersion,
    p_inputs: inputs,
  });
  if (error) throw error;
  return readConsumption(data, operationId);
}
