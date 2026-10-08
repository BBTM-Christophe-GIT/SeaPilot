import { BBTM_FLEET_PHOTOS, fleetCatalogThumbnailPath } from './fleetPhotoCatalog';

export type FleetAssetKind = 'vessel' | 'quay' | 'office';
export interface FleetDisplayAsset {
  name: string;
  assetKind?: FleetAssetKind;
  lengthOverall?: string | number | null;
  asset_kind?: FleetAssetKind;
  length_overall?: string | number | null;
}

export function normalizeFleetName(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/[–—-]/g, ' ').replace(/\s+/g, ' ');
}

// Fallbacks for imported records without dimensions. Source: BBTM fleet brochures.
// A length entered in the vessel record always takes precedence.
const BBTM_LENGTHS: Record<string, number> = {
  GOURY: 30.62, LANDEMER: 19.5, 'LE ROZEL': 19.2, SUROIT: 18.6,
  KROKDUR: 15, 'HIRONDELLE DE LA MANCHE': 11.98, 'HOLENN EUSA': 6.9,
};

export function fleetAssetKind(asset: FleetDisplayAsset): FleetAssetKind {
  if (asset.assetKind || asset.asset_kind) return (asset.assetKind || asset.asset_kind)!;
  const name = normalizeFleetName(asset.name);
  if (/^(YARD|QUAI)\b/.test(name)) return 'quay';
  if (/^(BUREAU|BUREAUX|ARMEMENT)\b/.test(name)) return 'office';
  return 'vessel';
}

export function fleetDisplayName(asset: FleetDisplayAsset): string {
  return normalizeFleetName(asset.name) === 'YARD LE HAVRE' ? 'Yard - LE HAVRE' : asset.name;
}

export function fleetLength(asset: FleetDisplayAsset): number {
  const parsed = Number.parseFloat(String(asset.lengthOverall ?? asset.length_overall ?? '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : BBTM_LENGTHS[normalizeFleetName(asset.name)] ?? 0;
}

export function compareFleetAssets(a: FleetDisplayAsset, b: FleetDisplayAsset): number {
  const order = { vessel: 0, quay: 1, office: 2 };
  return order[fleetAssetKind(a)] - order[fleetAssetKind(b)]
    || fleetLength(b) - fleetLength(a)
    || a.name.localeCompare(b.name, 'fr', { numeric: true });
}

export function compareFleetNames(a: string, b: string): number {
  return compareFleetAssets({ name: a }, { name: b });
}

export function fleetIllustration(asset: FleetDisplayAsset, thumbnail?: string): string {
  if (thumbnail) return thumbnail;
  if (fleetAssetKind(asset) === 'office') return '/action-plan/offices.png';
  const photo = BBTM_FLEET_PHOTOS.find((item) => normalizeFleetName(item.name) === normalizeFleetName(asset.name));
  return photo ? fleetCatalogThumbnailPath(photo) : '';
}
