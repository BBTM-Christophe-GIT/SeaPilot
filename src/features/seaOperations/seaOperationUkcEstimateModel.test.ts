// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { calculateSeaOperationUkcEstimate, interpolateSeaOperationUkcWaterLevel, isSeaOperationUkcEstimate,
  isSeaOperationUkcBathymetry, isSeaOperationUkcWaterLevelSample,
  validateSeaOperationUkcEstimateInput, type SeaOperationUkcBathymetry, type SeaOperationUkcEstimateInput,
  type SeaOperationUkcEstimateSources, type SeaOperationUkcVerticalTransformation, type SeaOperationUkcWaterLevelSample } from './seaOperationUkcEstimateModel';

const input: SeaOperationUkcEstimateInput = { projectId: '2', pointId: 'wp-1', vesselId: '1', latitude: 49.65, longitude: -1.62,
  eta: '2026-10-24T12:00', draftMeters: 2 };
const fetchedAt = '2026-10-24T08:00:00Z';
const bathymetry: SeaOperationUkcBathymetry = { datasetId: 'bathymetry_dtm_2024', datum: 'LAT',
  sourceUrl: 'https://erddap.emodnet.eu/erddap/info/bathymetry_dtm_2024/index.html', latitude: 49.6505, longitude: -1.6205,
  cellBounds: { west: -1.6211, east: -1.6199, south: 49.6499, north: 49.6511 },
  resolutionMeters: 115, depthMeanMeters: 20, depthMinMeters: 19, depthMaxMeters: 21, dispersionMeters: .52,
  sampleCount: 7, interpolated: false, standardUncertaintyMeters: null };
const sample = (timeUtc = '2026-10-24T10:00:00Z', heightMeters = 3): SeaOperationUkcWaterLevelSample => ({
  model: 'TOLOSA test fixture', sourceUrl: 'https://www.shom.fr/fr/copernicus', datum: 'HYCOM_NM',
  referenceTimeUtc: '2026-10-24T00:00:00Z', latitude: input.latitude, longitude: input.longitude, resolutionMeters: 200,
  cellBounds: { west: -1.622, east: -1.618, south: 49.648, north: 49.652 },
  timeUtc, heightMeters, standardUncertaintyMeters: null,
});
const transformation: SeaOperationUkcVerticalTransformation = { fromDatum: 'HYCOM_NM', toDatum: 'LAT',
  offsetMeters: 4, standardUncertaintyMeters: null, qualified: true, reference: 'Synthetic qualified offset for arithmetic tests only',
  sourceUrl: 'https://services.data.shom.fr/static/help/fr/Notice_CRV.pdf', latitude: input.latitude, longitude: input.longitude };
function sources(): SeaOperationUkcEstimateSources {
  return { bathymetry: structuredClone(bathymetry), waterLevel: interpolateSeaOperationUkcWaterLevel(sample(), sample(), '2026-10-24T10:00:00Z'),
    transformation: structuredClone(transformation) };
}

describe('static UKC computation and auditable captures', () => {
  it('adds the qualified source-to-LAT offset, then subtracts the retained draught', () => {
    const before = sources();
    const result = calculateSeaOperationUkcEstimate(input, before, fetchedAt);
    expect(result.status).toBe('available');
    expect(result.estimate).toMatchObject({ kind: 'static', datum: 'LAT', waterLevelLatMeters: 7, ukcMeters: 25,
      cellVariability: { lowerMeters: 24, upperMeters: 26 }, dynamicCorrectionsApplied: false });
    expect(result.latitude).toBe(input.latitude); expect(result.longitude).toBe(input.longitude);
    expect(result.bathymetry?.latitude).toBe(bathymetry.latitude);
    expect(before).toEqual(sources());
    expect(isSeaOperationUkcEstimate(result)).toBe(true);
  });

  it('handles a negative separation, a negative water level and a negative UKC without clamping to zero', () => {
    const parts = sources();
    parts.bathymetry = { ...bathymetry, depthMeanMeters: 1, depthMinMeters: .5, depthMaxMeters: 1.5 };
    parts.waterLevel = interpolateSeaOperationUkcWaterLevel(sample(undefined, -1), sample(undefined, -1), '2026-10-24T10:00:00Z');
    parts.transformation!.offsetMeters = -.5;
    const result = calculateSeaOperationUkcEstimate(input, parts, fetchedAt);
    expect(result.estimate?.waterLevelLatMeters).toBe(-1.5);
    expect(result.estimate?.ukcMeters).toBe(-2.5);
    expect(isSeaOperationUkcEstimate(result)).toBe(true);
  });

  it.each(['absent', 'unqualified', 'wrong-datum', 'wrong-position'] as const)('does not manufacture a harmonized level with a %s conversion', kind => {
    const parts = sources();
    if (kind === 'absent') parts.transformation = null;
    else if (kind === 'unqualified') parts.transformation!.qualified = false;
    else if (kind === 'wrong-datum') parts.transformation!.fromDatum = 'OTHER_NM';
    else parts.transformation!.latitude += .001;
    const result = calculateSeaOperationUkcEstimate(input, parts, fetchedAt);
    expect(result.status).toBe('unavailable'); expect(result.estimate).toBeNull();
    expect(result.message).toMatch(/verticale|références/);
    expect(result.bathymetry).toBeTruthy();
    expect(isSeaOperationUkcEstimate(result)).toBe(true);
  });

  it('does not mislabel cell dispersion as a standard uncertainty or fill unknown errors with zero', () => {
    const result = calculateSeaOperationUkcEstimate(input, sources(), fetchedAt);
    expect(result.bathymetry?.dispersionMeters).toBe(.52);
    expect(result.estimate?.uncertainty).toMatchObject({ complete: false, quantifiedMeters: null, confidenceLevel: null,
      missingComponents: ['bathymetryVertical', 'waterLevel', 'verticalTransformation', 'draft', 'positionEffect'] });
    expect(result.estimate?.uncertainty.components[0].standardUncertaintyMeters).toBeNull();
    expect(result.message).toContain('partiellement');
  });

  it('sums only declared standard-uncertainty components, without assuming independence or a 95% interval', () => {
    const parts = sources();
    parts.bathymetry!.standardUncertaintyMeters = .1; parts.waterLevel!.standardUncertaintyMeters = .2;
    parts.transformation!.standardUncertaintyMeters = .3;
    parts.draftStandardUncertaintyMeters = .4; parts.positionEffectStandardUncertaintyMeters = .5;
    const result = calculateSeaOperationUkcEstimate(input, parts, fetchedAt);
    expect(result.estimate?.uncertainty).toMatchObject({ method: 'sum-known-standard-uncertainties', complete: true,
      quantifiedMeters: 1.5, confidenceLevel: null, missingComponents: [] });
    expect(isSeaOperationUkcEstimate(result)).toBe(true);
    parts.draftStandardUncertaintyMeters = null;
    const partial = calculateSeaOperationUkcEstimate(input, parts, fetchedAt);
    expect(partial.estimate?.uncertainty.complete).toBe(false);
    expect(partial.estimate?.uncertainty.quantifiedMeters).toBeCloseTo(1.1);
    expect(partial.estimate?.uncertainty.missingComponents).toEqual(['draft']);
  });

  it('retains an unavailable variability range when the source has no min/max values', () => {
    const parts = sources(); parts.bathymetry!.depthMinMeters = parts.bathymetry!.depthMaxMeters = null;
    const result = calculateSeaOperationUkcEstimate(input, parts, fetchedAt);
    expect(result.status).toBe('available'); expect(result.estimate?.cellVariability).toBeNull();
    expect(isSeaOperationUkcEstimate(result)).toBe(true);
  });

  it('rejects malformed source values and does not relocate the bathymetric sounding to a nearby sea point', () => {
    const distant = sources(); distant.bathymetry!.latitude += .01;
    distant.bathymetry!.cellBounds.south += .01; distant.bathymetry!.cellBounds.north += .01;
    expect(calculateSeaOperationUkcEstimate(input, distant, fetchedAt).message).toContain('ne couvre pas');
    const wrong = sources(); wrong.waterLevel!.timeUtc = '2026-10-24T11:00:00Z';
    expect(calculateSeaOperationUkcEstimate(input, wrong, fetchedAt).estimate).toBeNull();
    const nan = sources(); nan.bathymetry!.depthMeanMeters = NaN;
    expect(calculateSeaOperationUkcEstimate(input, nan, fetchedAt).estimate).toBeNull();
    const source = sources(); source.transformation!.sourceUrl = 'https://services.data.shom.fr.evil.example/test';
    expect(calculateSeaOperationUkcEstimate(input, source, fetchedAt).estimate).toBeNull();
    const overflow = sources(); overflow.waterLevel!.heightMeters = overflow.waterLevel!.heightBeforeMeters = overflow.waterLevel!.heightAfterMeters = Number.MAX_VALUE;
    overflow.transformation!.offsetMeters = Number.MAX_VALUE;
    expect(calculateSeaOperationUkcEstimate(input, overflow, fetchedAt).estimate).toBeNull();
  });

  it('rejects tampered arithmetic/budgets while accepting jsonb object-key reordering', () => {
    const result = calculateSeaOperationUkcEstimate(input, sources(), fetchedAt);
    const reverse = (value: unknown): unknown => Array.isArray(value) ? value.map(reverse) : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverse(item)])) : value;
    expect(isSeaOperationUkcEstimate(reverse(result))).toBe(true);
    const ukc = structuredClone(result); ukc.estimate!.ukcMeters += 1;
    expect(isSeaOperationUkcEstimate(ukc)).toBe(false);
    const uncertainty = structuredClone(result); uncertainty.estimate!.uncertainty.quantifiedMeters = 0;
    expect(isSeaOperationUkcEstimate(uncertainty)).toBe(false);
    const level = structuredClone(result); level.estimate!.waterLevelLatMeters += 1;
    expect(isSeaOperationUkcEstimate(level)).toBe(false);
  });

  it('validates complete Paris ETA and retained vessel identifiers/draughts before calculations', () => {
    expect(validateSeaOperationUkcEstimateInput(input)).toEqual(input);
    for (const patch of [{ vesselId: '1e2' }, { draftMeters: 0 }, { eta: '12:00' }, { eta: '2026-10-25T02:30' }, { latitude: 91 }]) {
      expect(() => validateSeaOperationUkcEstimateInput({ ...input, ...patch })).toThrow();
    }
  });
});

describe('explicit source cell footprints', () => {
  it.each(['bathymetry', 'waterLevel'] as const)('rejects a %s cell whose side excludes the waypoint even inside the old circumcircle', field => {
    const parts = sources();
    Object.assign(parts[field]!, { latitude: 49.6506, longitude: input.longitude, resolutionMeters: 115,
      cellBounds: { west: -1.6208, east: -1.6192, south: 49.65008, north: 49.65112 } });
    // Centre-to-point distance is about 67 m: less than 115 * sqrt(2) / 2,
    // yet the waypoint lies south of the actual cell footprint.
    const result = calculateSeaOperationUkcEstimate(input, parts, fetchedAt);
    expect(result.status).toBe('unavailable'); expect(result.message).toContain('ne couvre pas');
    expect(isSeaOperationUkcEstimate(result)).toBe(true);
    parts[field]!.resolutionMeters = 1_000_000;
    expect(calculateSeaOperationUkcEstimate(input, parts, fetchedAt).status).toBe('unavailable');
  });

  it('checks latitude and longitude independently for an asymmetric angular cell', () => {
    const parts = sources();
    Object.assign(parts.bathymetry!, { latitude: input.latitude, longitude: input.longitude,
      cellBounds: { west: -1.62005, east: -1.61995, south: 49.64949, north: 49.65051 } });
    const inside = { ...input, latitude: 49.6505 };
    parts.transformation!.latitude = inside.latitude;
    expect(calculateSeaOperationUkcEstimate(inside, parts, fetchedAt).status).toBe('available');
    const outside = { ...input, longitude: -1.6199 };
    Object.assign(parts.transformation!, { latitude: outside.latitude, longitude: outside.longitude });
    expect(calculateSeaOperationUkcEstimate(outside, parts, fetchedAt).message).toContain('ne couvre pas');
  });

  it('supports cells crossing the antimeridian and the equivalent +180/-180 boundary', () => {
    for (const longitude of [179.9999, -179.9999, 180, -180]) {
      const target = { ...input, latitude: 0, longitude };
      const parts = sources();
      const cellBounds = { west: 179.9995, east: -179.9995, south: -.0005, north: .0005 };
      Object.assign(parts.bathymetry!, { latitude: 0, longitude: 180, cellBounds });
      Object.assign(parts.waterLevel!, { latitude: 0, longitude: -180, cellBounds });
      Object.assign(parts.transformation!, { latitude: 0, longitude });
      const result = calculateSeaOperationUkcEstimate(target, parts, fetchedAt);
      expect(result.status).toBe('available'); expect(isSeaOperationUkcEstimate(result)).toBe(true);
      parts.bathymetry!.cellBounds = { ...cellBounds, east: 180 };
      if (Math.abs(longitude) === 180) expect(calculateSeaOperationUkcEstimate(target, parts, fetchedAt).status).toBe('available');
    }
  });

  it('requires finite nonempty geographic bounds and a source centre inside its footprint', () => {
    const valid = bathymetry.cellBounds;
    for (const bounds of [undefined, { ...valid, west: NaN }, { ...valid, west: -181 }, { ...valid, east: 181 },
      { ...valid, south: -91 }, { ...valid, north: 91 }, { ...valid, south: valid.north },
      { ...valid, west: valid.east }, { ...valid, west: 180, east: -180 }, { ...valid, west: -1.6198, east: -1.6197 }]) {
      expect(isSeaOperationUkcBathymetry({ ...bathymetry, cellBounds: bounds })).toBe(false);
      expect(isSeaOperationUkcWaterLevelSample({ ...sample(), cellBounds: bounds })).toBe(false);
    }
  });
});

describe('water level at the ETA', () => {
  it('uses an exact endpoint sample without inheriting the neighbouring unknown uncertainty', () => {
    const before = { ...sample('2026-10-24T10:00:00Z', 2), standardUncertaintyMeters: .1 };
    const after = sample('2026-10-24T11:00:00Z', 4);
    const level = interpolateSeaOperationUkcWaterLevel(before, after, before.timeUtc);
    expect(level).toMatchObject({ method: 'exact', heightMeters: 2, standardUncertaintyMeters: .1,
      timeBeforeUtc: before.timeUtc, timeAfterUtc: before.timeUtc, heightBeforeMeters: 2, heightAfterMeters: 2 });
    const estimate = calculateSeaOperationUkcEstimate(input, { ...sources(), waterLevel: level }, fetchedAt);
    expect(estimate.estimate?.uncertainty.missingComponents).not.toContain('temporalInterpolation');
    expect(isSeaOperationUkcEstimate(estimate)).toBe(true);
  });

  it('does not return a typed valid level when its interpolation arithmetic overflows', () => {
    expect(interpolateSeaOperationUkcWaterLevel(sample('2026-10-24T10:00:00Z', Number.MAX_VALUE),
      sample('2026-10-24T11:00:00Z', -Number.MAX_VALUE), '2026-10-24T10:30:00Z')).toBeUndefined();
  });

  it('linearly interpolates the exact ETA and records both bracketing hourly model values', () => {
    const result = interpolateSeaOperationUkcWaterLevel(sample('2026-10-24T10:00:00Z', 2), sample('2026-10-24T11:00:00Z', 4), '2026-10-24T10:30:00Z');
    expect(result).toMatchObject({ timeUtc: '2026-10-24T10:30:00Z', heightMeters: 3, method: 'linear',
      timeBeforeUtc: '2026-10-24T10:00:00Z', timeAfterUtc: '2026-10-24T11:00:00Z', heightBeforeMeters: 2, heightAfterMeters: 4 });
    const estimate = calculateSeaOperationUkcEstimate({ ...input, eta: '2026-10-24T12:30' }, { ...sources(), waterLevel: result }, fetchedAt);
    expect(estimate.status).toBe('available');
    expect(estimate.estimate?.uncertainty.missingComponents).toContain('temporalInterpolation');
    expect(isSeaOperationUkcEstimate(estimate)).toBe(true);
  });

  it('does not bridge a missing hour, extrapolate or combine different model runs/cells/datums', () => {
    const before = sample();
    for (const after of [sample('2026-10-24T12:00:00Z', 4), { ...sample('2026-10-24T11:00:00Z'), referenceTimeUtc: '2026-10-24T01:00:00Z' },
      { ...sample('2026-10-24T11:00:00Z'), latitude: 49.7 }, { ...sample('2026-10-24T11:00:00Z'), datum: 'OTHER' },
      { ...sample('2026-10-24T11:00:00Z'), cellBounds: { ...before.cellBounds, east: -1.617 } }]) {
      expect(interpolateSeaOperationUkcWaterLevel(before, after, '2026-10-24T10:30:00Z')).toBeUndefined();
    }
    expect(interpolateSeaOperationUkcWaterLevel(before, sample('2026-10-24T11:00:00Z'), '2026-10-24T11:01:00Z')).toBeUndefined();
  });
});
