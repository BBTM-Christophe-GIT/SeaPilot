// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createEmptyVesselWeatherMatrix, GOURY_WEATHER_MATRIX } from '../fleet/vesselWeatherMatrix';
import { getSeaOperationAssessment, isSeaOperationPayload, newSeaOperation } from './seaOperationModel';

describe('vessel sea-state matrix retained in a preparation', () => {
  it('reads historical payloads, an explicitly unconfigured vessel and a valid capture', () => {
    const draft = newSeaOperation();
    expect(isSeaOperationPayload(draft)).toBe(true);
    draft.vessel.weatherMatrix = null;
    expect(isSeaOperationPayload(draft)).toBe(true);
    draft.vessel.weatherMatrix = GOURY_WEATHER_MATRIX;
    expect(isSeaOperationPayload(draft)).toBe(true);
  });
  it('rejects a malformed capture rather than treating it as a safe sea state', () => {
    const draft = newSeaOperation();
    expect(isSeaOperationPayload({ ...draft, vessel: { ...draft.vessel, weatherMatrix: { version: 1, levels: [['comfortable']] } } })).toBe(false);
  });
  it('never turns a sea-state category into an automatic GO or a questionnaire answer', () => {
    const draft = newSeaOperation();
    const assessment = getSeaOperationAssessment(draft);
    const checks = { ...draft.checks };
    draft.vessel.weatherMatrix = createEmptyVesselWeatherMatrix();
    expect(getSeaOperationAssessment(draft)).toEqual(assessment);
    expect(draft.checks).toEqual(checks);
    expect(draft.decision).toBe('');
  });
});
