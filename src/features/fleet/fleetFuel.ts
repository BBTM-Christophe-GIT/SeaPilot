export const MAX_FLEET_FUEL_TANKS = 20;
export const MAX_FLEET_FUEL_TANK_CAPACITY_LITERS = 10_000_000;
export const MAX_FLEET_FUEL_TANK_NAME_LENGTH = 80;
export const FLEET_FUEL_TANK_NAMES_ERROR = `Renseignez un nom différent pour chaque cuve, de 1 à ${MAX_FLEET_FUEL_TANK_NAME_LENGTH} caractères.`;
export const DEFAULT_FLEET_DAILY_FUEL_TANK_NAME = 'Caisse journalière';
export const FLEET_DAILY_FUEL_TANK_NAME_ERROR = `Le nom de la caisse journalière doit contenir au maximum ${MAX_FLEET_FUEL_TANK_NAME_LENGTH} caractères.`;

export interface FleetFuelCapacity {
  /** Legacy nominal capacity used when the main tanks have not been configured. */
  fuelCapacityM3: number | null;
  fuelTankCapacitiesLiters?: number[] | null;
  fuelTankNames?: string[] | null;
  dailyFuelTankCapacityLiters?: number | null;
  dailyFuelTankName?: string | null;
}

export function isFleetFuelTankCapacity(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && value <= MAX_FLEET_FUEL_TANK_CAPACITY_LITERS
    && Math.round(value * 1000) / 1000 === value;
}

export function isFleetFuelTankList(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.length <= MAX_FLEET_FUEL_TANKS
    && Array.from(value).every(isFleetFuelTankCapacity);
}

export function isFleetFuelTankName(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
    && Array.from(value).length <= MAX_FLEET_FUEL_TANK_NAME_LENGTH;
}

export function isFleetFuelTankNames(value: unknown, tankCount: number): value is string[] {
  if (!Array.isArray(value) || tankCount <= 2 || tankCount > MAX_FLEET_FUEL_TANKS || value.length !== tankCount) return false;
  const names: unknown[] = Array.from(value);
  return names.every(isFleetFuelTankName)
    && new Set(names.map(name => name.toLocaleLowerCase('fr'))).size === tankCount;
}

export function fleetFuelTankLabel(tankCount: number, index: number, names?: readonly string[] | null): string {
  if (tankCount === 1) return 'Cuve';
  if (tankCount === 2) return index === 0 ? 'Cuve Bâbord' : 'Cuve Tribord';
  return names?.[index]?.trim() || `Cuve ${index + 1}`;
}

export function fleetDailyFuelTankLabel(name?: string | null): string {
  return name?.trim() || DEFAULT_FLEET_DAILY_FUEL_TANK_NAME;
}

export function fleetMainFuelCapacityLiters({ fuelTankCapacitiesLiters, fuelCapacityM3 }: FleetFuelCapacity): number | null {
  if (fuelTankCapacitiesLiters?.length) {
    return fuelTankCapacitiesLiters.reduce((total, capacity) => total + Math.round(capacity * 1000), 0) / 1000;
  }
  return fuelCapacityM3 != null && Number.isFinite(fuelCapacityM3) && fuelCapacityM3 > 0
    ? Math.round(fuelCapacityM3 * 1_000_000) / 1000 : null;
}
