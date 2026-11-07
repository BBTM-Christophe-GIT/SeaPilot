export type FuelVolumeUnit = 'L' | 'm³';

const volume = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });
const smallVolume = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 6 });

export function fuelVolumeUnit(capacityLiters?: number | null): FuelVolumeUnit {
  return (capacityLiters ?? 0) >= 3000 ? 'm³' : 'L';
}

export function fuelVolumeAmount(liters: number, unit: FuelVolumeUnit): number {
  return unit === 'm³' ? liters / 1000 : liters;
}

export function formatFuelVolume(liters: number, unit: FuelVolumeUnit): string {
  const amount = fuelVolumeAmount(liters, unit);
  const format = amount > 0 && amount < .001 ? smallVolume : volume;
  return `${format.format(amount)} ${unit}`;
}
