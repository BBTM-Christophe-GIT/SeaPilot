import type { SupabaseClient } from '@supabase/supabase-js';
import { isProjectFuelPrice, projectFuelCurrentDate, type ProjectFuelPrice,
  type ProjectFuelReference, type ProjectVesselFuelRate } from './projectFuelEstimate';

interface PriceRow {
  price_eur_per_liter_ht: number | string;
  price_date: string;
  source_label: string;
}

interface RateRow {
  vessel_id: number | string;
  towing: boolean;
  sample_count: number | string;
  distance_nm: number | string;
  fuel_liters: number | string;
}

function mapPrice(row: PriceRow | undefined): ProjectFuelPrice | null {
  if (!row) return null;
  const price = { eurosPerLiter: Number(row.price_eur_per_liter_ht), effectiveOn: row.price_date, source: row.source_label };
  return isProjectFuelPrice(price) ? price : null;
}

function mapRate(row: RateRow): ProjectVesselFuelRate {
  return { vesselId: Number(row.vessel_id), towing: row.towing, sampleCount: Number(row.sample_count),
    distanceNm: Number(row.distance_nm), fuelLiters: Number(row.fuel_liters) };
}

const PRICE_COLUMNS = 'price_eur_per_liter_ht,price_date,source_label';

export async function fetchProjectFuelReference(client: SupabaseClient): Promise<ProjectFuelReference> {
  const [rates, price] = await Promise.all([
    client.from('project_fuel_vessel_rates').select('vessel_id,towing,sample_count,distance_nm,fuel_liters'),
    client.from('project_fuel_price_observations').select(PRICE_COLUMNS)
      .lte('price_date', projectFuelCurrentDate()).order('price_date', { ascending: false }).limit(1),
  ]);
  if (rates.error) throw rates.error;
  if (price.error) throw price.error;
  return { rates: (rates.data ?? []).map(mapRate), price: mapPrice(price.data?.[0]) };
}

export async function saveProjectFuelPrice(client: SupabaseClient, price: ProjectFuelPrice): Promise<ProjectFuelPrice> {
  if (!isProjectFuelPrice(price)) throw new Error('Renseignez un prix, une date et une référence fournisseur valides.');
  const { data, error } = await client.from('project_fuel_price_observations')
    .upsert({ price_date: price.effectiveOn, price_eur_per_liter_ht: price.eurosPerLiter, source_label: price.source.trim() },
      { onConflict: 'company_id,price_date', defaultToNull: false }).select(PRICE_COLUMNS).single();
  if (error) throw error;
  const saved = mapPrice(data);
  if (!saved) throw new Error('SeaPilot n’a pas pu lire le prix enregistré.');
  return saved;
}
