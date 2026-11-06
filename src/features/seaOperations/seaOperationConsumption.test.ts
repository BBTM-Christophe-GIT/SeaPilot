import { describe, expect, it } from 'vitest';
import { calculateSeaOperationConsumption, type SeaOperationConsumptionInputs } from './seaOperationConsumption';

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

  it('keeps duration and distance usable when capacity or a valid gauge conversion is missing', () => {
    expect(calculateSeaOperationConsumption(inputs, {
      kind: 'unavailable', defaultGaugeUnit: 'percent', nominalCapacityLiters: null,
    })).toMatchObject({ distanceNm: 70, consumedLiters: null, costEuros: null });
    expect(calculateSeaOperationConsumption({ ...inputs, departureGauge: 1, arrivalGauge: 0 }, {
      kind: 'rozel', defaultGaugeUnit: 'percent', nominalCapacityLiters: 18000,
    }).consumedLiters).toBeNull();
  });
});
