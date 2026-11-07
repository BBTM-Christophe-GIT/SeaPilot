import type { SupabaseClient } from '@supabase/supabase-js';

export interface SeaOperationFleetFuelLevel {
  vesselId: number;
  vesselName: string;
  lengthOverall: string | null;
  maxSpeedKnots: number | null;
  capacityLiters: number | null;
  fuelLiters: number | null;
  measuredAt: string | null;
  source: 'baseline' | 'operation' | null;
  canSetBaseline: boolean;
  rateLitersPerHour: number | null;
  rateSampleCount: number;
}

export type FleetFuelUnit = 'liters' | 'percent';
export const MAX_BASELINE_FUEL_LITERS_WITHOUT_CAPACITY = 10_000_000;

const invalidResponse = 'Le niveau de carburant reçu est invalide.';
const quantity = (value: unknown): value is number | null =>
  value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0;

function fuelLevel(value: unknown): SeaOperationFleetFuelLevel {
  if (!value || typeof value !== 'object') throw new Error(invalidResponse);
  const { vesselId, vesselName, lengthOverall, maxSpeedKnots, capacityLiters, fuelLiters,
    measuredAt, source, canSetBaseline, rateLitersPerHour, rateSampleCount } = value as Record<string, unknown>;
  if (typeof vesselId !== 'number' || !Number.isSafeInteger(vesselId) || vesselId <= 0 || typeof vesselName !== 'string'
    || lengthOverall !== null && typeof lengthOverall !== 'string' || !quantity(maxSpeedKnots) || !quantity(capacityLiters)
    || !quantity(fuelLiters) || measuredAt !== null && (typeof measuredAt !== 'string' || !Number.isFinite(Date.parse(measuredAt)))
    || source !== null && source !== 'baseline' && source !== 'operation' || typeof canSetBaseline !== 'boolean'
    || !quantity(rateLitersPerHour) || typeof rateSampleCount !== 'number' || !Number.isSafeInteger(rateSampleCount) || rateSampleCount < 0) {
    throw new Error(invalidResponse);
  }
  return { vesselId, vesselName, lengthOverall, maxSpeedKnots, capacityLiters, fuelLiters, measuredAt, source,
    canSetBaseline, rateLitersPerHour, rateSampleCount };
}

export async function fetchSeaOperationFleetFuel(client: SupabaseClient) {
  const { data, error } = await client.rpc('sea_operation_fleet_fuel');
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error(invalidResponse);
  return (data as unknown[]).map(fuelLevel);
}

export async function saveSeaOperationFuelBaseline(client: SupabaseClient, vesselId: number, unit: FleetFuelUnit, value: number) {
  const { error } = await client.rpc('sea_operation_save_fuel_baseline', { p_vessel_id: vesselId, p_unit: unit, p_value: value });
  if (error) throw error;
}
