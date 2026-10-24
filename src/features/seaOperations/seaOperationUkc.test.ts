// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { assessSeaOperationUkc, isVesselDraftMeters, seaOperationUkcMeters } from './seaOperationUkc';
import { emptySeaOperation, getSeaOperationAssessment, isSeaOperationPayload } from './seaOperationModel';

describe('UKC display bands relative to retained vessel draft', () => {
  it.each([['-0.5', 'danger'], ['0', 'danger'], ['2', 'danger'], ['2.0001', 'warning'], ['2.5', 'warning'], ['3', 'warning'], ['4', 'warning'], ['4.0001', 'success'], ['5', 'success']])('classifies %s m at a 2 m draft as %s', (value, level) => {
    expect(assessSeaOperationUkc(value, 2)?.level).toBe(level);
  });
  it.each([['2,5 m', 2.5], [' +2.5 mètres ', 2.5], ['-.5m', -.5], ['.25', .25]])('accepts an explicit numeric value %s', (value, expected) => {
    expect(seaOperationUkcMeters(value)).toBe(expected);
  });
  it.each(['', '2 m minimum', '3/4', '3 ± 1 m', '≈ 2', '3abc', 'NaN', 'Infinity', '2e2', '1.2.3'])('does not invent a numeric UKC from %s', value => {
    expect(assessSeaOperationUkc(value, 2)).toBeUndefined();
  });
  it.each([undefined, null, '', '2', 0, -2, 51, Infinity, NaN])('keeps an unknown or invalid draft neutral (%s)', value => {
    expect(isVesselDraftMeters(value)).toBe(false);
    expect(assessSeaOperationUkc('2', value)).toBeUndefined();
  });
  it('keeps the same UKC in different bands for different vessel drafts and documents the retained reference', () => {
    expect(assessSeaOperationUkc('3', 3)?.level).toBe('danger');
    expect(assessSeaOperationUkc('3', 2)?.level).toBe('warning');
    expect(assessSeaOperationUkc('3', .5)?.level).toBe('success');
    expect(assessSeaOperationUkc('3,25m', 2)?.tooltip).toContain('tirant d’eau de référence : 2 m');
    expect(assessSeaOperationUkc('4.0000001 m', 2)).toMatchObject({ level: 'success', formattedValue: '4,0000001 m' });
  });
  it('accepts legacy payloads and an optional bounded draft snapshot without changing a GO / NO GO assessment', () => {
    const draft = emptySeaOperation();
    expect(isSeaOperationPayload(draft)).toBe(true);
    const before = getSeaOperationAssessment(draft);
    draft.vessel.draftMeters = 2;
    draft.waypoints = [{ id: 'p', number: '1', descriptionVhf: '', latitude: '', longitude: '', eta: '', ukc: '-1', denseTraffic: false }];
    assessSeaOperationUkc(draft.waypoints[0].ukc, draft.vessel.draftMeters);
    expect(getSeaOperationAssessment(draft).blockingChecks).toEqual(before.blockingChecks);
    for (const value of [null, 50, 2]) { draft.vessel.draftMeters = value; expect(isSeaOperationPayload(draft)).toBe(true); }
    for (const value of [0, -1, 51, NaN]) { draft.vessel.draftMeters = value; expect(isSeaOperationPayload(draft)).toBe(false); }
  });
});
