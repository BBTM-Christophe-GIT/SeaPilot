import { describe, expect, it } from 'vitest';
import {
  estimateProjectFuel, formatProjectFuelCo2, formatProjectFuelPrice, formatProjectFuelVolume,
  isProjectFuelPrice, projectFuelCurrentDate, type ProjectFuelReference,
} from './projectFuelEstimate';

const reference: ProjectFuelReference = {
  rates: [
    { vesselId: 2, towing: false, sampleCount: 236, distanceNm: 20792.94, fuelLiters: 174611.623 },
    { vesselId: 2, towing: true, sampleCount: 80, distanceNm: 11990.71, fuelLiters: 160374.297 },
  ],
  price: { eurosPerLiter: 1.254, effectiveOn: '2026-01-02', source: 'Devis de test' },
};

describe('Project voyage fuel estimates', () => {
  it('uses the total fuel divided by total miles for the exact vessel and towing mode', () => {
    const transit = estimateProjectFuel(reference, 2, 75.2);
    expect(transit?.litersPerNm).toBeCloseTo(8.39764, 5);
    expect(transit?.fuelLiters).toBeCloseTo(631.5025, 3);
    expect(transit?.sampleCount).toBe(236);
    expect(transit?.co2Kg).toBeCloseTo(1720.9075, 3);
    expect(transit?.costEuros).toBeCloseTo(791.9042, 3);
    expect(estimateProjectFuel(reference, 2, 75.2, true)?.fuelLiters).toBeCloseTo(1005.7909, 3);
    expect(estimateProjectFuel(reference, 3, 75.2)).toBeNull();
  });

  it('keeps fuel and combustion CO₂ when no exact product price has been entered', () => {
    const estimate = estimateProjectFuel({ ...reference, price: null }, 2, 75.2);
    expect(estimate?.co2Kg).toBeGreaterThan(0);
    expect(estimate?.costEuros).toBeNull();
    expect(estimateProjectFuel(reference, 2, null)).toBeNull();
    expect(estimateProjectFuel(reference, 2, 0)).toBeNull();
  });

  it('switches units at 1,000 and selects dates in Paris', () => {
    expect(formatProjectFuelVolume(999)).toBe('999 L');
    expect(formatProjectFuelVolume(1000)).toBe('1 m³');
    expect(formatProjectFuelVolume(1234)).toBe('1,23 m³');
    expect(formatProjectFuelCo2(1600)).toBe('1,6 t');
    expect(formatProjectFuelPrice(1.2345)).toBe('1,2345 €/L HT');
    expect(projectFuelCurrentDate(new Date('2026-11-05T23:30:00Z'))).toBe('2026-11-06');
    expect(isProjectFuelPrice({ eurosPerLiter: 1.25, effectiveOn: '2026-02-30', source: 'Test' })).toBe(false);
    expect(isProjectFuelPrice({ eurosPerLiter: 1.25, effectiveOn: '2099-01-01', source: 'Test' })).toBe(false);
  });
});
