export const MAX_FLEET_FUEL_TANKS = 20;
export const MAX_FLEET_FUEL_TANK_CAPACITY_LITERS = 10_000_000;

export interface FleetFuelCapacity {
  /** Legacy nominal capacity used when the main tanks have not been configured. */
  fuelCapacityM3: number | null;
  fuelTankCapacitiesLiters?: number[] | null;
  dailyFuelTankCapacityLiters?: number | null;
}

export function isFleetFuelTankCapacity(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && value <= MAX_FLEET_FUEL_TANK_CAPACITY_LITERS
    && Math.round(value * 1000) / 1000 === value;
}

export function isFleetFuelTankList(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.length <= MAX_FLEET_FUEL_TANKS
    && Array.from(value).every(isFleetFuelTankCapacity);
}

export function fleetMainFuelCapacityLiters({ fuelTankCapacitiesLiters, fuelCapacityM3 }: FleetFuelCapacity): number | null {
  if (fuelTankCapacitiesLiters?.length) {
    return fuelTankCapacitiesLiters.reduce((total, capacity) => total + Math.round(capacity * 1000), 0) / 1000;
  }
  return fuelCapacityM3 != null && Number.isFinite(fuelCapacityM3) && fuelCapacityM3 > 0
    ? Math.round(fuelCapacityM3 * 1_000_000) / 1000 : null;
}
