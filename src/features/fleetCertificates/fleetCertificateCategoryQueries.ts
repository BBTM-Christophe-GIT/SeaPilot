import type { SupabaseClient } from '@supabase/supabase-js';
import { compareFleetAssets, normalizeFleetName, type FleetAssetKind } from '../fleet/fleetDisplay';
import type { FleetCertificateCategoryOption } from './fleetCertificateCategories';

export type FleetCertificateVesselType = 'maritime' | 'fluvial';

export const FLEET_CERTIFICATE_VESSEL_TYPE_LABELS: Record<FleetCertificateVesselType, string> = {
  maritime: 'Navires maritimes',
  fluvial: 'Navires fluviaux',
};

export interface FleetCertificateVessel {
  id: number;
  companyId: number;
  name: string;
  acronym: string;
  lengthOverall: string | null;
  vesselType: FleetCertificateVesselType;
  assetKind: FleetAssetKind;
}

export function getFleetCertificateVesselLabel(name: string): string {
  return normalizeFleetName(name).replace('’', "'") === "L'ILE DE FRANCE" ? 'ILE DE FRANCE' : name;
}

export interface FleetCertificateCatalogCategory extends FleetCertificateCategoryOption {
  id: number;
  companyId: number;
  vesselType: FleetCertificateVesselType;
  isActive: boolean;
}

export interface SaveFleetCertificateCategoryInput {
  id?: number;
  companyId: number;
  vesselType: FleetCertificateVesselType;
  label: string;
  parentKey?: string;
  isActive: boolean;
}

interface VesselRow {
  id: number;
  company_id: number;
  name: string;
  acronym: string | null;
  overall_length_m: string | null;
  vessel_type: FleetCertificateVesselType;
  asset_kind: FleetAssetKind;
}

interface CategoryRow {
  id: number;
  company_id: number;
  vessel_type: FleetCertificateVesselType;
  category_key: string;
  category_label: string;
  parent_key: string | null;
  is_active: boolean;
}

const CATEGORY_FIELDS = 'id, company_id, vessel_type, category_key, category_label, parent_key, is_active';

function mapCategory(row: CategoryRow): FleetCertificateCatalogCategory {
  return {
    id: row.id, companyId: row.company_id, vesselType: row.vessel_type,
    key: row.category_key, label: row.category_label, parentKey: row.parent_key ?? undefined, isActive: row.is_active,
  };
}

export async function fetchFleetCertificateVessels(client: SupabaseClient): Promise<FleetCertificateVessel[]> {
  const { data, error } = await client.rpc('list_fleet_certificate_vessels');
  if (error) throw new Error(error.message);
  return ((data ?? []) as VesselRow[]).map((row) => ({
    id: row.id, companyId: row.company_id, name: row.name, acronym: row.acronym ?? '',
    lengthOverall: row.overall_length_m, vesselType: row.vessel_type, assetKind: row.asset_kind,
  })).sort(compareFleetAssets);
}

export async function fetchFleetCertificateCategories(client: SupabaseClient): Promise<FleetCertificateCatalogCategory[]> {
  const { data, error } = await client.from('fleet_certificate_categories').select(CATEGORY_FIELDS);
  if (error) throw new Error(error.message);
  return ((data ?? []) as CategoryRow[]).map(mapCategory);
}

export async function saveFleetCertificateCategory(
  client: SupabaseClient,
  input: SaveFleetCertificateCategoryInput,
): Promise<FleetCertificateCatalogCategory> {
  const table = client.from('fleet_certificate_categories');
  const fields = { category_label: input.label.trim(), parent_key: input.parentKey ?? null, is_active: input.isActive };
  const mutation = input.id
    ? table.update(fields).eq('id', input.id).eq('company_id', input.companyId).eq('vessel_type', input.vesselType)
    : table.insert({
      ...fields,
      company_id: input.companyId,
      vessel_type: input.vesselType,
      category_key: `custom-${crypto.randomUUID()}`,
    });
  const { data, error } = await mutation.select(CATEGORY_FIELDS).single();
  if (error?.code === '23505') throw new Error('Ce libellé existe déjà pour ce type de navire.');
  if (error) throw new Error(error.message);
  return mapCategory(data as CategoryRow);
}
