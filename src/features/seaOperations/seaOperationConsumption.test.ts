import { describe, expect, it } from 'vitest';
import {
  calculateSeaOperationConsumption, consumedFuelLitersFromQuantity, isSeaOperationConsumptionRecord,
  landemerTankVolumeLiters, type SeaOperationConsumptionInputs,
} from './seaOperationConsumption';

const inputs: SeaOperationConsumptionInputs = {
  durationMinutes: 1200,
  averageSpeedKnots: 3.5,
  gaugeUnit: 'percent',
  departureGauge: 78,
  arrivalGauge: 69,
  refuelLiters: 10000.05,
  pricePerLiter: 0.859,
  actualArrival: null,
  completed: true,
};

describe('sea operation consumption preview', () => {
  it('calculates fuel metrics directly without a gauge or capacity', () => {
    const calibration = { kind: 'unavailable', defaultGaugeUnit: 'percent', nominalCapacityLiters: null } as const;
    const direct = {
      durationMinutes: 60, averageSpeedKnots: 20, consumedFuelLiters: 400, consumedFuelUnit: 'liters',
      refuelLiters: 250, pricePerLiter: 1.2, actualArrival: null, completed: true,
    } satisfies SeaOperationConsumptionInputs;
    expect(calculateSeaOperationConsumption(direct, calibration)).toEqual({
      distanceNm: 20, departureLiters: null, arrivalLiters: null, consumedLiters: 400,
      litersPerHour: 400, litersPerNm: 20, costEuros: 480,
    });
    expect(calculateSeaOperationConsumption({ ...inputs, consumedFuelLiters: 0 }, calibration).consumedLiters).toBe(0);
    const result = calculateSeaOperationConsumption({ ...inputs, consumedFuelLiters: 0 }, {
      kind: 'nominal', defaultGaugeUnit: 'percent', nominalCapacityLiters: 10_000,
    });
    expect(result).toMatchObject({ departureLiters: 7800, consumedLiters: 0 });
    expect(result.arrivalLiters).toBeCloseTo(6900);
    expect(calculateSeaOperationConsumption({ ...direct, durationMinutes: 1, averageSpeedKnots: .02 }, calibration))
      .toMatchObject({ distanceNm: 0, litersPerHour: 24_000, litersPerNm: null });
  });

  it('converts cubic metres with milliliter precision and rejects out-of-range quantities', () => {
    expect(consumedFuelLitersFromQuantity(2.100456, 'm3')).toBe(2100.456);
    expect(consumedFuelLitersFromQuantity(.000001, 'm3')).toBe(.001);
    expect(consumedFuelLitersFromQuantity(10_000, 'm3')).toBe(10_000_000);
    expect(consumedFuelLitersFromQuantity(10_000.000001, 'm3')).toBeNull();
    expect(consumedFuelLitersFromQuantity(2.0000001, 'm3')).toBeNull();
    expect(consumedFuelLitersFromQuantity(2.0001, 'liters')).toBeNull();
    expect(consumedFuelLitersFromQuantity(-1, 'liters')).toBeNull();
  });

  it('validates direct records and continues to read legacy gauge records', () => {
    const legacy = { ...inputs, version: 1, updatedAt: '2026-11-01T00:00:00Z', includedInReference: true,
      distanceNm: 70, departureLiters: 7800, arrivalLiters: 6900, consumedLiters: 900,
      litersPerHour: 45, litersPerNm: 12.857, costEuros: 773.1 };
    const direct = { ...legacy, gaugeUnit: null, departureGauge: null, arrivalGauge: null,
      departureLiters: null, arrivalLiters: null, consumedFuelLiters: 0, consumedFuelUnit: 'm3', consumedLiters: 0 };
    expect(isSeaOperationConsumptionRecord(legacy)).toBe(true);
    expect(isSeaOperationConsumptionRecord(direct)).toBe(true);
    expect(isSeaOperationConsumptionRecord({ ...direct, consumedFuelUnit: 'cm' })).toBe(false);
    expect(isSeaOperationConsumptionRecord({ ...direct, consumedFuelLiters: null })).toBe(false);
    expect(isSeaOperationConsumptionRecord({ ...direct, consumedFuelLiters: -3 })).toBe(false);
  });

  it('reconciles the Rozel workbook without adding the pre-departure refill twice', () => {
    const result = calculateSeaOperationConsumption(inputs, {
      kind: 'rozel', defaultGaugeUnit: 'percent', nominalCapacityLiters: 18000,
    });
    expect(result.distanceNm).toBe(70);
    expect(result.departureLiters).toBeCloseTo(14455.95, 2);
    expect(result.consumedLiters).toBeCloseTo(1049.652, 3);
    expect(result.litersPerHour).toBeCloseTo(52.4826, 4);
    expect(result.litersPerNm).toBeCloseTo(14.995, 3);
    expect(result.costEuros).toBeCloseTo(901.651, 3);
  });

  it('uses the Suroît centimetre calibration and leaves the per-mile rate unavailable at rest', () => {
    const result = calculateSeaOperationConsumption({
      ...inputs, averageSpeedKnots: 0, gaugeUnit: 'cm', departureGauge: 208, arrivalGauge: 109, pricePerLiter: null,
    }, { kind: 'suroit', defaultGaugeUnit: 'cm', nominalCapacityLiters: 18000 });
    expect(result.distanceNm).toBe(0);
    expect(result.departureLiters).toBeCloseTo(7134.4);
    expect(result.consumedLiters).toBeCloseTo(3395.7);
    expect(result.litersPerHour).toBeCloseTo(169.785);
    expect(result.litersPerNm).toBeNull();
    expect(result.costEuros).toBeNull();
  });

  it('uses the supplied LANDEMER table points and interpolates between adjacent readings', () => {
    expect(landemerTankVolumeLiters(0)).toBe(0);
    expect(landemerTankVolumeLiters(98.989)).toBe(12_232);
    expect(landemerTankVolumeLiters(100)).toBe(12_357);
    expect(landemerTankVolumeLiters(53.94)).toBeCloseTo(6665.4382, 4);
    expect(landemerTankVolumeLiters(100.001)).toBeNull();
  });

  it('sums separately calibrated LANDEMER tanks and permits a transfer between tanks', () => {
    const calibration = { kind: 'nominal', defaultGaugeUnit: 'percent', nominalCapacityLiters: 24_714, tankCalibration: 'landemer-v1' } as const;
    const result = calculateSeaOperationConsumption({ ...inputs, tankGauges: {
      departure: { port: 100, starboard: 60.442 }, arrival: { port: 47.439, starboard: 34.616 },
    } }, calibration);
    expect(result).toMatchObject({ departureLiters: 19_826, arrivalLiters: 10_139, consumedLiters: 9687 });
    expect(calculateSeaOperationConsumption({ ...inputs, tankGauges: {
      departure: { port: 47.439, starboard: 100 }, arrival: { port: 60.442, starboard: 34.616 },
    } }, calibration)).toMatchObject({ departureLiters: 18_219, arrivalLiters: 11_746, consumedLiters: 6473 });
    expect(calculateSeaOperationConsumption({ ...inputs, departureGauge: 50 }, calibration).departureLiters).toBe(12_357);
  });

  it('keeps duration and distance usable when capacity or a valid gauge conversion is missing', () => {
    expect(calculateSeaOperationConsumption(inputs, {
      kind: 'unavailable', defaultGaugeUnit: 'percent', nominalCapacityLiters: null,
    })).toMatchObject({ distanceNm: 70, consumedLiters: null, costEuros: null });
    expect(calculateSeaOperationConsumption({ ...inputs, departureGauge: 1, arrivalGauge: 0 }, {
      kind: 'rozel', defaultGaugeUnit: 'percent', nominalCapacityLiters: 18000,
    }).consumedLiters).toBeNull();
  });
});
