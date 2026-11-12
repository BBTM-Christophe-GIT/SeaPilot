import {
  isFleetFuelTankCapacity, isFleetFuelTankName, isFleetFuelTankNames, MAX_FLEET_FUEL_TANKS,
} from './fleetFuel';

export const MAX_FLEET_CAPACITY_SECTIONS = 20;

export interface FleetCapacitySection {
  name: string;
  tanks: { id: string; name: string; capacityLiters: number; showInSoutes: boolean }[];
}

export interface FleetCapacitySectionDraft {
  id: string;
  name: string;
  tanks: (Omit<FleetCapacitySection['tanks'][number], 'capacityLiters'> & { capacityLiters: number | null })[];
}

const reservedNames = new Set(['carburant', 'plans']);
const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseFleetCapacitySections(value: unknown):
  { sections: FleetCapacitySection[]; error: null } | { sections: null; error: string } {
  if (!Array.isArray(value) || value.length > MAX_FLEET_CAPACITY_SECTIONS) {
    return { sections: null, error: `Ajoutez au maximum ${MAX_FLEET_CAPACITY_SECTIONS} sous-sections.` };
  }
  const names = new Set(reservedNames);
  const tankIds = new Set<string>();
  const sections: FleetCapacitySection[] = [];
  for (const entry of value as unknown[]) {
    const name = isRecord(entry) && typeof entry.name === 'string' ? entry.name.trim() : '';
    const nameKey = name.toLocaleLowerCase('fr');
    if (!isFleetFuelTankName(name) || names.has(nameKey)) {
      return { sections: null, error: 'Saisissez un nom distinct pour chaque sous-section (80 caractères maximum). Carburant et Plans sont réservés.' };
    }
    if (!isRecord(entry) || !Array.isArray(entry.tanks) || entry.tanks.length > MAX_FLEET_FUEL_TANKS) {
      return { sections: null, error: `Ajoutez au maximum ${MAX_FLEET_FUEL_TANKS} cuves par sous-section.` };
    }
    const tanks: FleetCapacitySection['tanks'] = [];
    for (const tank of entry.tanks as unknown[]) {
      if (!isRecord(tank) || !isFleetFuelTankCapacity(tank.capacityLiters)) {
        return { sections: null, error: 'Renseignez une capacité en litres valide pour chaque cuve.' };
      }
      const id = typeof tank.id === 'string' ? tank.id.toLowerCase() : '';
      if (!uuidPattern.test(id) || tankIds.has(id) || typeof tank.showInSoutes !== 'boolean') {
        return { sections: null, error: 'La configuration des cuves pour Soutes est invalide.' };
      }
      tankIds.add(id);
      tanks.push({ id, name: typeof tank.name === 'string' ? tank.name.trim() : '',
        capacityLiters: tank.capacityLiters, showInSoutes: tank.showInSoutes });
    }
    if (tanks.length && !isFleetFuelTankNames(tanks.map(tank => tank.name), tanks.length)) {
      return { sections: null, error: 'Saisissez un nom distinct pour chaque cuve de la sous-section (80 caractères maximum).' };
    }
    names.add(nameKey);
    sections.push({ name, tanks });
  }
  return { sections, error: null };
}

export function createFleetCapacitySectionDrafts(sections: FleetCapacitySection[]): FleetCapacitySectionDraft[] {
  return sections.map(section => ({
    id: crypto.randomUUID(),
    name: section.name,
    tanks: section.tanks,
  }));
}
