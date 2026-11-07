import type { SupabaseClient } from '@supabase/supabase-js';

export interface SeaOperationConsumptionMonthRates {
  litersPerNm: number | null;
  costPerNm: number | null;
}

export interface SeaOperationConsumptionMonthlyComparison {
  current: SeaOperationConsumptionMonthRates;
  previous: SeaOperationConsumptionMonthRates;
}

export interface SeaOperationVesselConsumptionMonthly {
  currentMonth: string;
  previousMonth: string;
  towage: SeaOperationConsumptionMonthlyComparison;
  other: SeaOperationConsumptionMonthlyComparison;
}

export interface SeaOperationVesselConsumptionAverage {
  towageLitersPerNm: number | null;
  otherLitersPerNm: number | null;
  pricePerLiter: number | null;
  monthly: SeaOperationVesselConsumptionMonthly | null;
}

export interface SeaOperationRegisterConsumption {
  recordedOperationIds: ReadonlySet<string>;
  vesselAverages: ReadonlyMap<number, SeaOperationVesselConsumptionAverage>;
}

const BATCH_SIZE = 200;
const INVALID_RESPONSE = 'Les données de consommation reçues pour le registre sont invalides.';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(INVALID_RESPONSE);
  return value as Record<string, unknown>;
}

function rate(value: unknown): value is number | null {
  return value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function monthRates(value: unknown): SeaOperationConsumptionMonthRates {
  const { litersPerNm, costPerNm } = object(value);
  if (!rate(litersPerNm) || !rate(costPerNm)) throw new Error(INVALID_RESPONSE);
  return { litersPerNm, costPerNm };
}

function monthComparison(value: unknown): SeaOperationConsumptionMonthlyComparison {
  const { current, previous } = object(value);
  return { current: monthRates(current), previous: monthRates(previous) };
}

function monthKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value);
}

function monthlyRates(value: unknown): SeaOperationVesselConsumptionMonthly | null {
  if (value == null) return null;
  const { currentMonth, previousMonth, towage, other } = object(value);
  if (!monthKey(currentMonth) || !monthKey(previousMonth)) throw new Error(INVALID_RESPONSE);
  return { currentMonth, previousMonth, towage: monthComparison(towage), other: monthComparison(other) };
}

export async function fetchSeaOperationRegisterConsumption(client: SupabaseClient,
  operationIds: readonly string[]): Promise<SeaOperationRegisterConsumption> {
  const ids = Array.from(new Set(operationIds));
  const recordedOperationIds = new Set<string>();
  const vesselAverages = new Map<number, SeaOperationVesselConsumptionAverage>();

  for (let offset = 0; offset === 0 || offset < ids.length; offset += BATCH_SIZE) {
    const batch = ids.slice(offset, offset + BATCH_SIZE);
    const { data, error } = await client.rpc('sea_operation_register_consumption', {
      p_ids: batch, p_include_vessel_averages: offset === 0,
    });
    if (error) throw error;
    const result = object(data);
    if (!Array.isArray(result.recordedOperationIds) || !Array.isArray(result.vesselAverages)) throw new Error(INVALID_RESPONSE);

    const expected = new Set(batch);
    for (const id of result.recordedOperationIds as unknown[]) {
      if (typeof id !== 'string' || !expected.delete(id)) throw new Error(INVALID_RESPONSE);
      recordedOperationIds.add(id);
    }

    for (const value of result.vesselAverages as unknown[]) {
      const { vesselId, towageLitersPerNm, otherLitersPerNm, pricePerLiter = null, monthly } = object(value);
      if (typeof vesselId !== 'number' || !Number.isSafeInteger(vesselId) || vesselId <= 0 || vesselAverages.has(vesselId)
        || !rate(towageLitersPerNm) || !rate(otherLitersPerNm) || !rate(pricePerLiter) || pricePerLiter === 0) throw new Error(INVALID_RESPONSE);
      vesselAverages.set(vesselId, { towageLitersPerNm, otherLitersPerNm, pricePerLiter, monthly: monthlyRates(monthly) });
    }
  }

  return { recordedOperationIds, vesselAverages };
}
