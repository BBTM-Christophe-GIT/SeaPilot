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
  rateLitersPerHour: number | null;
  rateSampleCount: number;
}

export type FleetFuelUnit = 'liters' | 'percent';
export const MAX_BASELINE_FUEL_LITERS_WITHOUT_CAPACITY = 10_000_000;

export interface SeaOperationFleetFuelMonth {
  month: number;
  liters: number | null;
  costEuros: number | null;
  unpricedLiters: number;
}

interface SeaOperationFleetFuelHistory {
  years: number[];
  months: SeaOperationFleetFuelMonth[];
}

const invalidResponse = 'Le niveau de carburant reçu est invalide.';
const quantity = (value: unknown): value is number | null =>
  value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0;

function fuelLevel(value: unknown): SeaOperationFleetFuelLevel {
  if (!value || typeof value !== 'object') throw new Error(invalidResponse);
  const { vesselId, vesselName, lengthOverall, maxSpeedKnots, capacityLiters, fuelLiters,
    measuredAt, source, baselineDate = null, baselineFuelLiters = null, deductedFuelLiters = null, refuelLiters = null,
    canSetBaseline, rateLitersPerHour, rateSampleCount } = value as Record<string, unknown>;
  if (typeof vesselId !== 'number' || !Number.isSafeInteger(vesselId) || vesselId <= 0 || typeof vesselName !== 'string'
    || lengthOverall !== null && typeof lengthOverall !== 'string' || !quantity(maxSpeedKnots) || !quantity(capacityLiters)
    || !quantity(fuelLiters) || measuredAt !== null && (typeof measuredAt !== 'string' || !Number.isFinite(Date.parse(measuredAt)))
    || source !== null && source !== 'baseline' && source !== 'operation' || typeof canSetBaseline !== 'boolean'
    || baselineDate !== null && (typeof baselineDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(baselineDate))
    || !quantity(baselineFuelLiters) || !quantity(deductedFuelLiters) || !quantity(refuelLiters)
    || !quantity(rateLitersPerHour) || typeof rateSampleCount !== 'number' || !Number.isSafeInteger(rateSampleCount) || rateSampleCount < 0) {
    throw new Error(invalidResponse);
  }
  const stockSource = source === 'operation' && refuelLiters !== null && refuelLiters > 0 ? 'refuel' : source;
  return { vesselId, vesselName, lengthOverall, maxSpeedKnots, capacityLiters, fuelLiters, measuredAt, source: stockSource,
    baselineDate, baselineFuelLiters, deductedFuelLiters, refuelLiters,
    canSetBaseline, rateLitersPerHour, rateSampleCount };
}

export async function fetchSeaOperationFleetFuel(client: SupabaseClient) {
  const { data, error } = await client.rpc('sea_operation_fleet_fuel');
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error(invalidResponse);
  return (data as unknown[]).map(fuelLevel);
}

export async function fetchSeaOperationFleetFuelHistory(client: SupabaseClient, vesselId: number, year: number): Promise<SeaOperationFleetFuelHistory> {
  const { data, error } = await client.rpc('sea_operation_fleet_fuel_history', { p_vessel_id: vesselId, p_year: year });
  if (error) throw error;
  const invalidHistory = 'L’historique annuel de carburant reçu est invalide.';
  if (!data || typeof data !== 'object') throw new Error(invalidHistory);
  const { years, months } = data as Record<string, unknown>;
  if (!Array.isArray(years) || !years.every((value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 1900 && value <= 9999)
    || !Array.isArray(months) || months.length !== 12) throw new Error(invalidHistory);
  return { years: years as number[], months: months.map((value: unknown, index) => {
    if (!value || typeof value !== 'object') throw new Error(invalidHistory);
    const { month, liters, costEuros, unpricedLiters } = value as Record<string, unknown>;
    if (month !== index + 1 || !quantity(liters) || !quantity(costEuros) || !quantity(unpricedLiters)
      || unpricedLiters === null || unpricedLiters > (liters ?? 0)) throw new Error(invalidHistory);
    return { month, liters, costEuros, unpricedLiters };
  }) };
}

export async function saveSeaOperationFuelBaseline(client: SupabaseClient, vesselId: number, unit: FleetFuelUnit, value: number, date: string) {
  const { error } = await client.rpc('sea_operation_save_fuel_baseline', { p_vessel_id: vesselId, p_unit: unit, p_value: value, p_date: date });
  if (error) throw error;
}
