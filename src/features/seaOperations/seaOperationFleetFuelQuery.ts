import type { SupabaseClient } from '@supabase/supabase-js';

export interface SeaOperationFleetFuelLevel {
  vesselId: number;
  vesselName: string;
  lengthOverall: string | null;
  maxSpeedKnots: number | null;
  capacityLiters: number | null;
  fuelLiters: number | null;
  measuredAt: string | null;
  source: 'baseline' | 'operation' | 'refuel' | null;
  baselineDate: string | null;
  baselineFuelLiters: number | null;
  deductedFuelLiters: number | null;
  refuelLiters: number | null;
  canSetBaseline: boolean;
  assignedToday?: boolean;
  latestTankReading?: FleetFuelLatestTankReading | null;
  rateLitersPerHour: number | null;
  rateSampleCount: number;
}

export const MAX_BASELINE_FUEL_LITERS_WITHOUT_CAPACITY = 10_000_000;

export type FleetFuelTankUnit = 'liters' | 'percent' | 'm3';

export interface FleetFuelTankInput {
  key: string;
  unit: FleetFuelTankUnit;
  value: number;
}

export interface FleetFuelTank {
  key: string;
  name: string;
  capacityLiters: number | null;
  calibration?: 'landemer-v1';
}

type MeasuredFleetFuelTank = FleetFuelTank & { liters: number };

export interface FleetFuelLatestTankReading {
  date: string;
  time: string;
  superseded: boolean;
  tanks: MeasuredFleetFuelTank[];
}

export interface SeaOperationFuelTanks {
  vesselId: number;
  date: string;
  time: string | null;
  times: string[];
  canSetBaseline: boolean;
  tanks: FleetFuelTank[];
  reading: {
    version: number;
    savedAt: string;
    mainLiters: number;
    superseded: boolean;
    tanks: Array<FleetFuelTank & FleetFuelTankInput & { liters: number }>;
  } | null;
}

export interface SeaOperationFleetFuelMonth {
  month: number;
  liters: number | null;
  costEuros: number | null;
  unpricedLiters: number;
}

export type SeaOperationFleetFuelCostSource = 'dpr' | 'billing';

interface SeaOperationFleetFuelHistory {
  years: number[];
  months: SeaOperationFleetFuelMonth[];
  costSource: SeaOperationFleetFuelCostSource;
}

const invalidResponse = 'Le niveau de carburant reçu est invalide.';
const quantity = (value: unknown): value is number | null =>
  value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0;

function fuelLevel(value: unknown): SeaOperationFleetFuelLevel {
  if (!value || typeof value !== 'object') throw new Error(invalidResponse);
  const { vesselId, vesselName, lengthOverall, maxSpeedKnots, capacityLiters, fuelLiters,
    measuredAt, source, baselineDate = null, baselineFuelLiters = null, deductedFuelLiters = null, refuelLiters = null,
    canSetBaseline, assignedToday = false, latestTankReading = null, rateLitersPerHour, rateSampleCount } = value as Record<string, unknown>;
  if (typeof vesselId !== 'number' || !Number.isSafeInteger(vesselId) || vesselId <= 0 || typeof vesselName !== 'string'
    || lengthOverall !== null && typeof lengthOverall !== 'string' || !quantity(maxSpeedKnots) || !quantity(capacityLiters)
    || !quantity(fuelLiters) || measuredAt !== null && (typeof measuredAt !== 'string' || !Number.isFinite(Date.parse(measuredAt)))
    || source !== null && source !== 'baseline' && source !== 'operation' || typeof canSetBaseline !== 'boolean' || typeof assignedToday !== 'boolean'
    || baselineDate !== null && (typeof baselineDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(baselineDate))
    || !quantity(baselineFuelLiters) || !quantity(deductedFuelLiters) || !quantity(refuelLiters)
    || !quantity(rateLitersPerHour) || typeof rateSampleCount !== 'number' || !Number.isSafeInteger(rateSampleCount) || rateSampleCount < 0) {
    throw new Error(invalidResponse);
  }
  const stockSource = source === 'operation' && refuelLiters !== null && refuelLiters > 0 ? 'refuel' : source;
  return { vesselId, vesselName, lengthOverall, maxSpeedKnots, capacityLiters, fuelLiters, measuredAt, source: stockSource,
    baselineDate, baselineFuelLiters, deductedFuelLiters, refuelLiters,
    canSetBaseline, assignedToday, latestTankReading: parseLatestTankReading(latestTankReading), rateLitersPerHour, rateSampleCount };
}

export async function fetchSeaOperationFleetFuel(client: SupabaseClient) {
  const { data, error } = await client.rpc('sea_operation_fleet_fuel');
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error(invalidResponse);
  return (data as unknown[]).map(fuelLevel);
}

export async function fetchSeaOperationFleetFuelHistory(client: SupabaseClient, vesselId: number, year: number): Promise<SeaOperationFleetFuelHistory> {
  const { data, error } = await client.rpc('sea_operation_fleet_fuel_history', { p_vessel_id: vesselId, p_year: year, p_include_billing: true });
  if (error) throw error;
  const invalidHistory = 'L’historique annuel de carburant reçu est invalide.';
  if (!data || typeof data !== 'object') throw new Error(invalidHistory);
  const { years, months, costSource = 'dpr' } = data as Record<string, unknown>;
  if (!Array.isArray(years) || !years.every((value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 1900 && value <= 9999)
    || !Array.isArray(months) || months.length !== 12 || costSource !== 'dpr' && costSource !== 'billing') throw new Error(invalidHistory);
  return { years: years as number[], costSource, months: months.map((value: unknown, index) => {
    if (!value || typeof value !== 'object') throw new Error(invalidHistory);
    const { month, liters, costEuros, unpricedLiters } = value as Record<string, unknown>;
    if (month !== index + 1 || !quantity(liters) || !quantity(costEuros) || !quantity(unpricedLiters)
      || unpricedLiters === null || unpricedLiters > (liters ?? 0)) throw new Error(invalidHistory);
    return { month, liters, costEuros, unpricedLiters };
  }) };
}

const invalidTanks = 'Le relevé des soutes reçu est invalide.';
export function isFleetFuelReadingTime(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function fuelTank(value: unknown): FleetFuelTank {
  if (!value || typeof value !== 'object') throw new Error(invalidTanks);
  const { key, name, capacityLiters, calibration } = value as Record<string, unknown>;
  if (typeof key !== 'string' || !/^(main-[1-9]\d*|day)$/.test(key) || typeof name !== 'string' || !name.trim()
    || !quantity(capacityLiters) || capacityLiters === 0 || calibration != null && calibration !== 'landemer-v1') {
    throw new Error(invalidTanks);
  }
  return { key, name, capacityLiters, calibration: calibration ?? undefined };
}

function measuredFuelTank(value: unknown): MeasuredFleetFuelTank {
  const tank = fuelTank(value);
  const { liters } = value as Record<string, unknown>;
  if (!quantity(liters) || liters === null) throw new Error(invalidTanks);
  return { ...tank, liters };
}

function parseLatestTankReading(value: unknown): FleetFuelLatestTankReading | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object') throw new Error(invalidTanks);
  const { date, time = '00:00', superseded, tanks } = value as Record<string, unknown>;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !isFleetFuelReadingTime(time) || typeof superseded !== 'boolean'
    || !Array.isArray(tanks) || !tanks.length) throw new Error(invalidTanks);
  return { date, time, superseded, tanks: tanks.map(measuredFuelTank) };
}

function fuelTankReading(data: unknown, vesselId: number, date: string, time: string | null): SeaOperationFuelTanks {
  if (!data || typeof data !== 'object') throw new Error(invalidTanks);
  const result = data as Record<string, unknown>;
  const { times } = result;
  if (result.vesselId !== vesselId || result.date !== date || result.time !== time || typeof result.canSetBaseline !== 'boolean'
    || !Array.isArray(result.tanks) || !Array.isArray(times) || !times.every(isFleetFuelReadingTime)) {
    throw new Error(invalidTanks);
  }
  const tanks = result.tanks.map(fuelTank);
  const response = { vesselId, date, time, times, canSetBaseline: result.canSetBaseline, tanks };
  if (result.reading === null) return { ...response, reading: null };
  if (time === null || !times.includes(time) || !result.reading || typeof result.reading !== 'object') throw new Error(invalidTanks);
  const { version, savedAt, mainLiters, superseded, tanks: recorded } = result.reading as Record<string, unknown>;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1
    || typeof savedAt !== 'string' || !Number.isFinite(Date.parse(savedAt)) || !quantity(mainLiters) || mainLiters === null
    || typeof superseded !== 'boolean' || !Array.isArray(recorded)) throw new Error(invalidTanks);
  return { ...response, reading: { version, savedAt, mainLiters, superseded, tanks: recorded.map((item: unknown) => {
    const tank = measuredFuelTank(item);
    const { unit, value } = item as Record<string, unknown>;
    if (unit !== 'percent' && unit !== 'liters' && unit !== 'm3'
      || !quantity(value) || value === null) throw new Error(invalidTanks);
    return { ...tank, unit, value };
  }) } };
}

export async function fetchSeaOperationFuelTanks(client: SupabaseClient, vesselId: number, date: string, time: string | null) {
  const { data, error } = await client.rpc('sea_operation_fuel_tanks', { p_vessel_id: vesselId, p_date: date, p_time: time });
  if (error) throw error;
  return fuelTankReading(data, vesselId, date, time);
}

export async function saveSeaOperationFuelTanks(client: SupabaseClient, vesselId: number, date: string, time: string,
  version: number | null, readings: readonly FleetFuelTankInput[]) {
  const { error } = await client.rpc('sea_operation_save_fuel_tanks', {
    p_vessel_id: vesselId, p_date: date, p_time: time, p_expected_version: version, p_readings: readings,
  });
  if (error) throw error;
}
