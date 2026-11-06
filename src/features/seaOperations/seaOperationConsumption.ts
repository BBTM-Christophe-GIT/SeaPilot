import type { SupabaseClient } from '@supabase/supabase-js';
import { isSeaOperationConsumptionTrace, type SeaOperationConsumptionTrace } from './seaOperationConsumptionTrace';

export type SeaOperationGaugeUnit = 'percent' | 'cm';

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
  trace?: SeaOperationConsumptionTrace | null;
}

export interface SeaOperationConsumptionCalibration {
  kind: 'rozel' | 'suroit' | 'nominal' | 'unavailable';
  defaultGaugeUnit: SeaOperationGaugeUnit;
  nominalCapacityLiters: number | null;
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
  const departureLiters = gaugeVolume(inputs.departureGauge, inputs.gaugeUnit, calibration);
  const arrivalLiters = gaugeVolume(inputs.arrivalGauge, inputs.gaugeUnit, calibration);
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

const nullableFields = ['refuelLiters', 'pricePerLiter', 'departureLiters', 'arrivalLiters', 'consumedLiters',
  'litersPerHour', 'litersPerNm', 'costEuros'];

export function isSeaOperationConsumptionRecordFields(value: unknown): value is Omit<SeaOperationConsumptionRecord, 'trace'> {
  const record = object(value);
  return record !== null && number(record.version) && record.completed === true
    && typeof record.updatedAt === 'string' && typeof record.includedInReference === 'boolean'
    && gaugeUnit(record.gaugeUnit) && (record.actualArrival === null || typeof record.actualArrival === 'string')
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
