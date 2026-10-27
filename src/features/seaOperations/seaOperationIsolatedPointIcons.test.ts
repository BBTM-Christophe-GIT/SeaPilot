import { describe, expect, it } from 'vitest';
import { isSeaOperationIsolatedPointIconName, SEA_OPERATION_ISOLATED_POINT_ICONS, seaOperationIsolatedPointIcon, seaOperationIsolatedPointLabel } from './seaOperationIsolatedPointIcons';

describe('shared isolated-point vector symbols', () => {
  it('exposes exactly the six supported symbols and rejects unknown or non-string values', () => {
    expect(SEA_OPERATION_ISOLATED_POINT_ICONS.map(icon => icon.value)).toEqual(['buoy', 'pin', 'platform', 'wind-farm', 'mooring', 'anchor']);
    for (const icon of SEA_OPERATION_ISOLATED_POINT_ICONS) {
      expect(isSeaOperationIsolatedPointIconName(icon.value)).toBe(true); expect(seaOperationIsolatedPointIcon(icon.value)).toBe(icon);
    }
    for (const invalid of [undefined, null, '', 'vessel', 'BUOY', {}, 1]) {
      expect(isSeaOperationIsolatedPointIconName(invalid)).toBe(false); expect(seaOperationIsolatedPointIcon(invalid)).toBeUndefined();
    }
  });
  it('keeps every drawing within the common absolute 24×24 M/L/C/Z vocabulary supported by the PDF renderer', () => {
    for (const icon of SEA_OPERATION_ISOLATED_POINT_ICONS) {
      expect(icon.paths.length).toBeGreaterThan(0);
      for (const path of icon.paths) {
        expect(path.d).toMatch(/^M/); expect(path.d.match(/[A-Za-z]/g)!.every(command => ['M', 'L', 'C', 'Z'].includes(command))).toBe(true);
        expect(path.d.match(/-?\d+(?:\.\d+)?/g)!.map(Number).every(value => Number.isFinite(value) && value >= 0 && value <= 24)).toBe(true);
      }
    }
  });
  it('retains the full custom number and uses the original one-based ordinal only when it is blank', () => {
    const point = { number: '  B04  ' }; expect(seaOperationIsolatedPointLabel(point, 3)).toBe('B04'); expect(point.number).toBe('  B04  ');
    expect(seaOperationIsolatedPointLabel({ number: '  ' }, 3)).toBe('P3');
    expect(seaOperationIsolatedPointLabel({ number: 'B'.repeat(80) }, 1)).toHaveLength(80);
  });
});
