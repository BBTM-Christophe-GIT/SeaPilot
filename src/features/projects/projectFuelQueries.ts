import type { SupabaseClient } from '@supabase/supabase-js';
import { isProjectFuelPrice, type ProjectFuelPrice,
  type ProjectFuelReference, type ProjectVesselFuelPrice, type ProjectVesselFuelRate } from './projectFuelEstimate';

interface PriceRow {
  price_eur_per_liter_ht: number | string;
  price_date: string;
  source_label: string;
  recorded_at?: string;
}

interface VesselPriceRow extends PriceRow {
  vessel_id: number | string;
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
  const price = { eurosPerLiter: Number(row.price_eur_per_liter_ht), effectiveOn: row.price_date, source: row.source_label,
    ...(row.recorded_at ? { recordedAt: row.recorded_at } : {}) };
  return isProjectFuelPrice(price) ? price : null;
}

function mapRate(row: RateRow): ProjectVesselFuelRate {
  return { vesselId: Number(row.vessel_id), towing: row.towing, sampleCount: Number(row.sample_count),
    distanceNm: Number(row.distance_nm), fuelLiters: Number(row.fuel_liters) };
}

function mapVesselPrice(row: VesselPriceRow): ProjectVesselFuelPrice[] {
  const vesselId = Number(row.vessel_id);
  const price = mapPrice(row);
  return price && Number.isSafeInteger(vesselId) && vesselId > 0 ? [{ ...price, vesselId }] : [];
}

const PRICE_COLUMNS = 'price_eur_per_liter_ht,price_date,source_label';
const RECORDED_PRICE_COLUMNS = `${PRICE_COLUMNS},recorded_at`;

export async function fetchProjectFuelReference(client: SupabaseClient): Promise<ProjectFuelReference> {
  const [rates, price, vesselPrices] = await Promise.all([
    client.from('project_fuel_vessel_rates').select('vessel_id,towing,sample_count,distance_nm,fuel_liters'),
    client.from('project_fuel_latest_fallback_price').select(RECORDED_PRICE_COLUMNS).limit(1),
    client.from('project_fuel_latest_vessel_prices').select(`vessel_id,${RECORDED_PRICE_COLUMNS}`),
  ]);
  if (rates.error) throw rates.error;
  if (price.error) throw price.error;
  if (vesselPrices.error) throw vesselPrices.error;
  return { rates: (rates.data ?? []).map(mapRate), price: mapPrice(price.data?.[0]), vesselPrices: (vesselPrices.data ?? []).flatMap(mapVesselPrice) };
}

export async function saveProjectFuelPrice(client: SupabaseClient, price: ProjectFuelPrice, vesselId?: number | null): Promise<ProjectFuelPrice> {
  if (!isProjectFuelPrice(price)) throw new Error('Renseignez un prix, une date et une référence fournisseur valides.');
  const payload = { price_date: price.effectiveOn, price_eur_per_liter_ht: price.eurosPerLiter, source_label: price.source.trim() };
  const { data, error } = vesselId == null
    ? await client.from('project_fuel_price_observations').upsert(payload,
        { onConflict: 'company_id,price_date', defaultToNull: false }).select(RECORDED_PRICE_COLUMNS).single()
    : await client.from('vessel_fuel_price_observations').upsert({ ...payload, vessel_id: vesselId },
        { onConflict: 'company_id,vessel_id,price_date', defaultToNull: false }).select(RECORDED_PRICE_COLUMNS).single();
  if (error) throw error;
  const saved = mapPrice(data);
  if (!saved) throw new Error('SeaPilot n’a pas pu lire le prix enregistré.');
  return saved;
}
