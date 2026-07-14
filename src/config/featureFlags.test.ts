import { describe, expect, it } from 'vitest';
import { featureFlagEnabled } from './featureFlags';

describe('featureFlagEnabled', () => {
  it.each(['1', 'true', 'TRUE', 'yes', 'on'])('enables a supported value: %s', (value) => {
    expect(featureFlagEnabled(value)).toBe(true);
  });

  it.each([undefined, false, '', '0', 'false', 'disabled'])('keeps other values disabled: %s', (value) => {
    expect(featureFlagEnabled(value)).toBe(false);
  });

  it('keeps Planning feature flags independently opt-in', () => {
    expect(featureFlagEnabled('false')).toBe(false);
    expect(featureFlagEnabled('true')).toBe(true);
  });
});
