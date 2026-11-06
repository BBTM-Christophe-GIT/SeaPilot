// IMO MEPC.346(78) diesel/gas oil factor, with a nominal density of 0.85 kg/L.
export const PROJECT_FUEL_COMBUSTION_CO2_KG_PER_LITER = 3.206 * 0.85;

export interface ProjectVesselFuelRate {
  vesselId: number;
  towing: boolean;
  sampleCount: number;
  distanceNm: number;
  fuelLiters: number;
}

export interface ProjectFuelPrice {
  eurosPerLiter: number;
  effectiveOn: string;
  source: string;
  recordedAt?: string;
}

export interface ProjectVesselFuelPrice extends ProjectFuelPrice {
  vesselId: number;
}

export interface ProjectFuelReference {
  rates: readonly ProjectVesselFuelRate[];
  price: ProjectFuelPrice | null;
  vesselPrices?: readonly ProjectVesselFuelPrice[];
}

export function projectFuelCurrentDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
}

export function isProjectFuelPrice(price: ProjectFuelPrice): boolean {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(price.effectiveOn) ? new Date(`${price.effectiveOn}T00:00:00Z`) : null;
  return Number.isFinite(price.eurosPerLiter) && price.eurosPerLiter >= 0.0001 && price.eurosPerLiter <= 99999999.9999
    && day !== null && Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === price.effectiveOn
    && price.effectiveOn <= projectFuelCurrentDate()
    && price.source.trim().length > 0 && price.source.trim().length <= 160;
}

export function projectFuelPriceForVessel(reference: ProjectFuelReference, vesselId?: number | null): ProjectFuelPrice | null {
  const vesselPrice = reference.vesselPrices?.find(price => price.vesselId === vesselId);
  if (vesselPrice && isProjectFuelPrice(vesselPrice)) return vesselPrice;
  return reference.price && isProjectFuelPrice(reference.price) ? reference.price : null;
}

export function applyProjectFuelPrice(reference: ProjectFuelReference, saved: ProjectFuelPrice, vesselId?: number | null): ProjectFuelReference {
  const recordedTime = (price: ProjectFuelPrice) => Date.parse(price.recordedAt ?? price.effectiveOn);
  const price = !reference.price || recordedTime(saved) >= recordedTime(reference.price) ? saved : reference.price;
  if (vesselId == null) return { ...reference, price };

  const prices = reference.vesselPrices ?? [];
  const own = prices.find(entry => entry.vesselId === vesselId);
  if (own && (own.effectiveOn > saved.effectiveOn
    || (own.effectiveOn === saved.effectiveOn && recordedTime(own) > recordedTime(saved)))) return { ...reference, price };
  return { ...reference, price, vesselPrices: [...prices.filter(entry => entry.vesselId !== vesselId), { ...saved, vesselId }] };
}

export function estimateProjectFuel(reference: ProjectFuelReference | undefined, vesselId: number | undefined | null,
  distanceNm: number | null, towing = false) {
  if (!reference || !vesselId || distanceNm === null || !Number.isFinite(distanceNm) || distanceNm <= 0) return null;
  const rate = reference.rates.find(candidate => candidate.vesselId === vesselId && candidate.towing === towing);
  if (!rate || !Number.isSafeInteger(rate.sampleCount) || rate.sampleCount < 1
    || !Number.isFinite(rate.fuelLiters) || rate.fuelLiters <= 0
    || !Number.isFinite(rate.distanceNm) || rate.distanceNm <= 0) return null;

  const litersPerNm = rate.fuelLiters / rate.distanceNm;
  const fuelLiters = distanceNm * litersPerNm;
  const price = projectFuelPriceForVessel(reference, vesselId);
  return {
    fuelLiters,
    litersPerNm,
    sampleCount: rate.sampleCount,
    co2Kg: fuelLiters * PROJECT_FUEL_COMBUSTION_CO2_KG_PER_LITER,
    costEuros: price ? fuelLiters * price.eurosPerLiter : null,
    price,
  };
}

const whole = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const unitPrice = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export function formatProjectFuelVolume(liters: number): string {
  return liters >= 1000 ? `${decimal.format(liters / 1000)} m³` : `${whole.format(liters)} L`;
}

export function formatProjectFuelCo2(kg: number): string {
  return kg >= 1000 ? `${decimal.format(kg / 1000)} t` : `${whole.format(kg)} kg`;
}

export function formatProjectFuelCost(euros: number): string {
  return `${decimal.format(euros)} € HT`;
}

export function formatProjectFuelPrice(eurosPerLiter: number): string {
  return `${unitPrice.format(eurosPerLiter)} €/L HT`;
}
