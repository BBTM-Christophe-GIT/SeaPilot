// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { COPERNICUS_UKC_PRODUCTS, calculateSeaOperationCopernicusEstimate, isSeaOperationCopernicusCell,
  isSeaOperationCopernicusEstimate, isSeaOperationCopernicusSource, isSeaOperationCopernicusWaterLevel,
  validateSeaOperationCopernicusInput, type SeaOperationCopernicusInput, type SeaOperationCopernicusProviderResult } from './seaOperationCopernicusModel';

const input: SeaOperationCopernicusInput = { projectId: '12', pointId: 'wp-1', vesselId: '2', latitude: 49.65, longitude: -1.62,
  eta: '2026-10-27T12:05', draftMeters: 3 };
const fetchedAt = '2026-10-26T08:00:00Z';
function provider(): SeaOperationCopernicusProviderResult {
  return { status: 'available', message: '',
    source: { model: 'NWS', ...COPERNICUS_UKC_PRODUCTS.NWS, datum: 'model-geoid', referenceTimeUtc: null,
      sourceUrl: 'https://data.marine.copernicus.eu/product/NWSHELF_ANALYSISFORECAST_PHY_004_013/description' },
    cell: { latitude: 49.65, longitude: -1.62, bounds: { west: -1.635, east: -1.605, south: 49.643243, north: 49.656757 },
      resolutionMeters: 2200, depthMeters: 20, depthMinMeters: 18, depthMaxMeters: 22 },
    waterLevel: { timeBeforeUtc: '2026-10-27T11:00:00Z', timeAfterUtc: '2026-10-27T11:15:00Z', heightBeforeMeters: 2, heightAfterMeters: 5 } };
}

describe('Copernicus model-geoid UKC captures', () => {
  it('agrees with the shared Python/TypeScript fixture without manufacturing uncertainty', () => {
    const fixture = JSON.parse(readFileSync(new URL('./testFixtures/copernicus-ukc.json', import.meta.url), 'utf8')) as {
      input: SeaOperationCopernicusInput; provider: SeaOperationCopernicusProviderResult; fetchedAt: string;
      expected: { etaUtc: string; waterLevelMeters: number; ukcMeters: number; missingComponents: string[] };
    };
    const result = calculateSeaOperationCopernicusEstimate(fixture.input, fixture.provider, fixture.fetchedAt);
    expect(result.status).toBe('available'); expect(result.etaUtc).toBe(fixture.expected.etaUtc);
    expect(result.estimate?.waterLevelMeters).toBeCloseTo(fixture.expected.waterLevelMeters, 8);
    expect(result.estimate?.ukcMeters).toBeCloseTo(fixture.expected.ukcMeters, 8);
    expect(result.estimate?.uncertainty.missingComponents).toEqual(fixture.expected.missingComponents);
    expect(isSeaOperationCopernicusEstimate(JSON.parse(JSON.stringify(result)))).toBe(true);
  });

  it('interpolates the exact Paris ETA within a common product and subtracts the retained draught', () => {
    const parts = provider(), original = structuredClone(parts);
    const result = calculateSeaOperationCopernicusEstimate(input, parts, fetchedAt);
    expect(result.status).toBe('available');
    expect(result.etaUtc).toBe('2026-10-27T11:05:00.000Z');
    expect(result.estimate).toMatchObject({ kind: 'static', waterLevelMeters: 3, ukcMeters: 20,
      cellVariability: { lowerMeters: 18, upperMeters: 22 }, dynamicCorrectionsApplied: false });
    expect(parts).toEqual(original);
    expect(isSeaOperationCopernicusEstimate(result)).toBe(true);
  });

  it.each(['NWS', 'IBI'] as const)('does not create an automatic value at depths of 10m or less for %s', model => {
    const parts = provider(); parts.source = { ...parts.source!, model, ...COPERNICUS_UKC_PRODUCTS[model],
      sourceUrl: `https://data.marine.copernicus.eu/product/${COPERNICUS_UKC_PRODUCTS[model].productId}/description` };
    for (const depthMeters of [9, 10]) {
      Object.assign(parts.cell!, { depthMeters, depthMinMeters: null, depthMaxMeters: null });
      const result = calculateSeaOperationCopernicusEstimate(input, parts, fetchedAt);
      expect(result.status).toBe('unavailable'); expect(result.estimate).toBeNull();
      expect(result.message).toContain('SeaPilot'); expect(isSeaOperationCopernicusEstimate(result)).toBe(true);
    }
  });

  it('allows negative levels and negative UKC without clamping them to zero', () => {
    const parts = provider();
    Object.assign(parts.cell!, { depthMeters: 12, depthMinMeters: null, depthMaxMeters: null });
    Object.assign(parts.waterLevel!, { heightBeforeMeters: -2, heightAfterMeters: -2 });
    const result = calculateSeaOperationCopernicusEstimate({ ...input, draftMeters: 20 }, parts, fetchedAt);
    expect(result.estimate?.ukcMeters).toBe(-10);
    expect(result.estimate?.cellVariability).toBeNull(); expect(isSeaOperationCopernicusEstimate(result)).toBe(true);
  });

  it('keeps unknown errors explicit and depth spread separate from uncertainty', () => {
    const result = calculateSeaOperationCopernicusEstimate(input, provider(), fetchedAt);
    expect(result.estimate?.uncertainty).toEqual({ method: 'sum-known-standard-uncertainties', quantifiedMeters: null,
      complete: false, confidenceLevel: null, components: [
        { id: 'bathymetryVertical', standardUncertaintyMeters: null }, { id: 'waterLevel', standardUncertaintyMeters: null },
        { id: 'draft', standardUncertaintyMeters: null }, { id: 'positionEffect', standardUncertaintyMeters: null },
        { id: 'temporalInterpolation', standardUncertaintyMeters: null },
      ], missingComponents: ['bathymetryVertical', 'waterLevel', 'draft', 'positionEffect', 'temporalInterpolation'] });
    expect(result.source?.datum).toBe('model-geoid');
    expect(result.source?.referenceTimeUtc).toBeNull();
    expect(result.estimate?.cellVariability).toEqual({ lowerMeters: 18, upperMeters: 22 });
  });

  it('uses an exact published instant with zero temporal interpolation, including an equal-time pair', () => {
    const parts = provider();
    const result = calculateSeaOperationCopernicusEstimate({ ...input, eta: '2026-10-27T12:00' }, parts, fetchedAt);
    expect(result.estimate?.waterLevelMeters).toBe(2);
    expect(result.estimate?.uncertainty.missingComponents).not.toContain('temporalInterpolation');
    expect(result.estimate?.uncertainty.components.at(-1)?.standardUncertaintyMeters).toBe(0);
    parts.waterLevel!.timeAfterUtc = parts.waterLevel!.timeBeforeUtc;
    parts.waterLevel!.heightAfterMeters = parts.waterLevel!.heightBeforeMeters;
    expect(calculateSeaOperationCopernicusEstimate({ ...input, eta: '2026-10-27T12:00' }, parts, fetchedAt).estimate?.ukcMeters).toBe(19);
  });

  it('does not manufacture a forecast when cells, source version, datum or temporal bracketing are invalid', () => {
    for (const mutate of [
      (parts: SeaOperationCopernicusProviderResult) => { parts.source!.datasetVersion = 'unqualified-new-version'; },
      (parts: SeaOperationCopernicusProviderResult) => { parts.source!.seaLevelDatasetId = COPERNICUS_UKC_PRODUCTS.IBI.seaLevelDatasetId; },
      (parts: SeaOperationCopernicusProviderResult) => { parts.source!.datum = 'LAT' as 'model-geoid'; },
      (parts: SeaOperationCopernicusProviderResult) => { parts.source!.sourceUrl = 'javascript:alert(1)'; },
      (parts: SeaOperationCopernicusProviderResult) => { parts.waterLevel!.timeAfterUtc = '2026-10-27T11:30:00Z'; },
      (parts: SeaOperationCopernicusProviderResult) => { parts.waterLevel!.timeBeforeUtc = '2026-10-27T10:00:00Z'; },
      (parts: SeaOperationCopernicusProviderResult) => { parts.source!.referenceTimeUtc = '2026-10-27T11:15:00Z'; },
    ]) {
      const parts = provider(); mutate(parts);
      expect(calculateSeaOperationCopernicusEstimate(input, parts, fetchedAt).estimate).toBeNull();
    }
    const outside = { ...input, latitude: 49.658 };
    expect(calculateSeaOperationCopernicusEstimate(outside, provider(), fetchedAt).message).toContain('ne couvre pas');
    expect(calculateSeaOperationCopernicusEstimate({ ...input, eta: '2026-10-27T12:16' }, provider(), fetchedAt).estimate).toBeNull();
  });

  it('does not present a newly retrieved past analysis as a forecast, while retaining historical captures', () => {
    const result = calculateSeaOperationCopernicusEstimate(input, provider(), '2026-10-27T11:06:00Z');
    expect(result.status).toBe('unavailable'); expect(result.message).toContain('ETA est passée');
    const retained = calculateSeaOperationCopernicusEstimate(input, provider(), fetchedAt);
    expect(isSeaOperationCopernicusEstimate(retained)).toBe(true);
    const forged = { ...retained, fetchedAt: '2026-10-27T11:06:00Z' };
    expect(isSeaOperationCopernicusEstimate(forged)).toBe(false);
  });

  it('rechecks arithmetic and uncertainty while tolerating JSONB property ordering', () => {
    const result = calculateSeaOperationCopernicusEstimate(input, provider(), fetchedAt);
    const reorder = (value: unknown): unknown => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorder(item)])) : value;
    expect(isSeaOperationCopernicusEstimate(reorder(result))).toBe(true);
    for (const mutate of [
      (capture: typeof result) => { capture.estimate!.ukcMeters += .01; },
      (capture: typeof result) => { capture.estimate!.waterLevelMeters += .01; },
      (capture: typeof result) => { capture.estimate!.uncertainty.complete = true as false; },
      (capture: typeof result) => { capture.estimate!.uncertainty.quantifiedMeters = 0 as unknown as null; },
      (capture: typeof result) => { capture.estimate!.cellVariability!.lowerMeters -= 1; },
    ]) {
      const forged = structuredClone(result); mutate(forged); expect(isSeaOperationCopernicusEstimate(forged)).toBe(false);
    }
  });

  it('validates cell footprints, quarter-hour samples and finite arithmetic before producing an estimate', () => {
    const parts = provider();
    expect(isSeaOperationCopernicusSource({ ...parts.source, referenceTimeUtc: '2026-02-30T00:00:00Z' })).toBe(false);
    expect(isSeaOperationCopernicusCell({ ...parts.cell, bounds: { west: 0, east: 0, south: 0, north: 0 } })).toBe(false);
    expect(isSeaOperationCopernicusWaterLevel({ ...parts.waterLevel, timeBeforeUtc: '2026-10-27T11:01:00Z' })).toBe(false);
    parts.waterLevel!.heightAfterMeters = Number.MAX_VALUE; parts.waterLevel!.heightBeforeMeters = -Number.MAX_VALUE;
    expect(calculateSeaOperationCopernicusEstimate(input, parts, fetchedAt).estimate).toBeNull();
    expect(() => validateSeaOperationCopernicusInput({ ...input, eta: '2026-10-25T02:30' })).toThrow();
    expect(() => validateSeaOperationCopernicusInput({ ...input, draftMeters: 0 })).toThrow();
  });

  it('keeps an explicit unavailable result without deriving a number from partial sources', () => {
    const result = calculateSeaOperationCopernicusEstimate(input, { ...provider(), status: 'unavailable', message: 'Maille côtière masquée.' }, fetchedAt);
    expect(result.status).toBe('unavailable'); expect(result.estimate).toBeNull();
    expect(result.message).toBe('Maille côtière masquée.'); expect(isSeaOperationCopernicusEstimate(result)).toBe(true);
  });
});
