// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createEmptyVesselWeatherMatrix, evaluateVesselSeaState, GOURY_WEATHER_MATRIX, isVesselWeatherMatrix, parseVesselWeatherMatrix } from './vesselWeatherMatrix';

describe('vessel Hs / swell-period matrix', () => {
  it.each([
    [.6, 6, 'comfortable'], [1.2, 6, 'uncomfortable'], [1.6, 4, 'tiring'], [2.2, 4, 'unlivable'],
    [2.2, 5, 'twelve_hours'], [1.2, 9, 'comfortable'], [1.5, 9, 'uncomfortable'], [2.75, 11, 'twelve_hours'],
    [2.75, 13, 'tiring'], [3.5, 13, 'twelve_hours'], [3.5, 22, 'twelve_hours'],
  ] as const)('uses the supplied GOURY category for Hs %s m and period %s s', (heightMeters, periodSeconds, code) => {
    expect(evaluateVesselSeaState(GOURY_WEATHER_MATRIX, { heightMeters, periodSeconds }).code).toBe(code);
  });
  it('uses exact lower bounds and the inclusive last upper bound without rounding the forecast', () => {
    expect(evaluateVesselSeaState(GOURY_WEATHER_MATRIX, { heightMeters: .99999, periodSeconds: 6 }).code).toBe('comfortable');
    expect(evaluateVesselSeaState(GOURY_WEATHER_MATRIX, { heightMeters: 1, periodSeconds: 6 }).code).toBe('uncomfortable');
    expect(evaluateVesselSeaState(GOURY_WEATHER_MATRIX, { heightMeters: 2.2, periodSeconds: 4.99999 }).code).toBe('unlivable');
    expect(evaluateVesselSeaState(GOURY_WEATHER_MATRIX, { heightMeters: 2.2, periodSeconds: 5 }).code).toBe('twelve_hours');
    expect(evaluateVesselSeaState(GOURY_WEATHER_MATRIX, { heightMeters: 3.500001, periodSeconds: 13 }).code).toBe('outside_matrix');
  });
  it('does not invent a category when configuration, values or a cell is missing', () => {
    const waves = { heightMeters: 1.2, periodSeconds: 8 };
    expect(evaluateVesselSeaState(null, waves).code).toBe('no_matrix');
    expect(evaluateVesselSeaState(createEmptyVesselWeatherMatrix(), waves).code).toBe('not_defined');
    for (const missing of [null, { ...waves, heightMeters: null }, { ...waves, periodSeconds: null }, { ...waves, heightMeters: NaN }, { ...waves, periodSeconds: -1 }])
      expect(evaluateVesselSeaState(GOURY_WEATHER_MATRIX, missing).code).toBe('no_forecast');
  });
  it('evaluates each vessel against its own editable bounds and cells', () => {
    const custom = parseVesselWeatherMatrix(GOURY_WEATHER_MATRIX)!;
    custom.hsLowerBoundsMeters[2] = 1.1;
    custom.levels[1][1] = 'unlivable';
    expect(evaluateVesselSeaState(custom, { heightMeters: 1.05, periodSeconds: 6 })).toMatchObject({ code: 'unlivable', row: 1, column: 1 });
    expect(evaluateVesselSeaState(GOURY_WEATHER_MATRIX, { heightMeters: 1.05, periodSeconds: 6 }).code).toBe('uncomfortable');
  });
  it('validates all dimensions, allowed levels, finite values and increasing bounds', () => {
    expect(isVesselWeatherMatrix(createEmptyVesselWeatherMatrix())).toBe(true);
    for (const invalid of [null, [], {}, { ...GOURY_WEATHER_MATRIX, version: 2 },
      { ...GOURY_WEATHER_MATRIX, hsLowerBoundsMeters: [0, .5, .5, 1.5, 2, 2.5, 3] },
      { ...GOURY_WEATHER_MATRIX, hsUpperBoundMeters: 3 }, { ...GOURY_WEATHER_MATRIX, hsUpperBoundMeters: Infinity },
      { ...GOURY_WEATHER_MATRIX, hsUpperBoundMeters: 50.01 },
      { ...GOURY_WEATHER_MATRIX, periodLowerBoundsSeconds: [0, 5, 7, 9, 11, 121] },
      { ...GOURY_WEATHER_MATRIX, periodLowerBoundsSeconds: [1, 5, 7, 9, 11, 13] },
      { ...GOURY_WEATHER_MATRIX, levels: [['GO']] }, { ...GOURY_WEATHER_MATRIX, levels: GOURY_WEATHER_MATRIX.levels.slice(0, 5) },
    ]) expect(isVesselWeatherMatrix(invalid)).toBe(false);
  });
});
