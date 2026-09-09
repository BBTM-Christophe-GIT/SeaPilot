import { itemDefinition } from './liftingControls';
import type { LiftingItem } from './liftingModel';

export const accessoryLabel = (item: LiftingItem) => itemDefinition(item)?.fr || item.material_type;
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
export function matchesLiftingItem(item: LiftingItem, query: string, type = '', observations = '') {
  if (type && accessoryLabel(item) !== type) return false;
  const text = normalize([item.reference, item.legacy_reference, item.description, accessoryLabel(item), item.serial_number,
    item.location, item.notes, observations, itemDefinition(item)?.code, itemDefinition(item)?.en].filter(Boolean).join(' '));
  return normalize(query).trim().split(/\s+/).every((word) => text.includes(word));
}
