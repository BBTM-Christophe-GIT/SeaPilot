import { compareFleetAssets, fleetAssetKind, fleetDisplayName, fleetIllustration, normalizeFleetName, type FleetAssetKind } from '../fleet/fleetDisplay';
import type { ActionItemRecord, ActionTypeCatalogRecord, VesselOption } from './actionPlanQueries';

export const ACTION_CATEGORIES = [
  { key: 'audit', label: 'Audits' },
  { key: 'action', label: 'Actions' },
  { key: 'visit', label: 'Visites' },
  { key: 'event', label: 'Événements HSE' },
] as const;
export type ActionCategory = typeof ACTION_CATEGORIES[number]['key'];
export interface ActionAssetGroup {
  key: string;
  name: string;
  assetKind: FleetAssetKind;
  lengthOverall?: string;
  image: string;
  actions: ActionItemRecord[];
}

export function actionCategory(action: ActionItemRecord, types: ActionTypeCatalogRecord[]): ActionCategory {
  const catalogType = types.find((type) => type.key === action.actionTypeKey);
  if (catalogType) return catalogType.family;
  if (action.categoryKey === 'audit') return 'audit';
  if (action.categoryKey === 'hse_visit' || action.categoryKey === 'visit') return 'visit';
  if (action.categoryKey === 'hse_event' || action.categoryKey === 'event') return 'event';
  return 'action';
}

function resolveVessel(action: ActionItemRecord, vessels: VesselOption[]): VesselOption | undefined {
  return vessels.find((vessel) => vessel.id === action.vesselId)
    || vessels.find((vessel) => normalizeFleetName(vessel.name) === normalizeFleetName(action.vesselName));
}

export function actionAssetKey(action: ActionItemRecord, vessels: VesselOption[]): string {
  const vessel = resolveVessel(action, vessels);
  return vessel ? `vessel:${vessel.id}` : action.vesselId ? `vessel:${action.vesselId}`
    : action.vesselName.trim() ? `name:${normalizeFleetName(action.vesselName)}` : 'unassigned';
}

// Only accessible reports populate the navigator: empty/unauthorised assets never leak counts.
export function buildActionAssetGroups(actions: ActionItemRecord[], vessels: VesselOption[]): ActionAssetGroup[] {
  const groups = new Map<string, ActionAssetGroup>();
  for (const action of actions) {
    const key = actionAssetKey(action, vessels);
    let group = groups.get(key);
    if (!group) {
      const vessel = resolveVessel(action, vessels);
      const asset = vessel || { name: action.vesselName.trim() || 'Sans navire / lieu' };
      group = { key, name: fleetDisplayName(asset), assetKind: fleetAssetKind(asset),
        lengthOverall: vessel?.lengthOverall, image: fleetIllustration(asset, vessel?.illustrationThumbnailUrl), actions: [] };
      groups.set(key, group);
    }
    group.actions.push(action);
  }
  return [...groups.values()].sort((a, b) => a.key === 'unassigned' ? 1 : b.key === 'unassigned' ? -1 : compareFleetAssets(a, b));
}
