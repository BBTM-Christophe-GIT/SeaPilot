import { describe, expect, it } from 'vitest';
import { compareFleetAssets, compareFleetNames, fleetLength } from './fleetDisplay';

describe('vessel filter order', () => {
  it('orders the fleet by decreasing length, then unknown vessels and shore locations', () => {
    const names = ['YARD - Le Havre', 'HOLENN EUSA', 'SUROIT', 'LANDEMER', 'BBTM TENDER 1',
      'HIRONDELLE DE LA MANCHE', 'GOURY', 'KROKDUR', 'LE ROZEL', 'Bureau - LE HAVRE'];
    expect(names.sort(compareFleetNames)).toEqual(['GOURY', 'LANDEMER', 'LE ROZEL', 'SUROIT', 'KROKDUR',
      'HIRONDELLE DE LA MANCHE', 'HOLENN EUSA', 'BBTM TENDER 1', 'YARD - Le Havre', 'Bureau - LE HAVRE']);
  });

  it('uses recorded dimensions from both API shapes before catalog fallbacks', () => {
    const vessels = [
      { name: 'GOURY', length_overall: '12,5 m' },
      { name: 'Nouveau navire', lengthOverall: '45.2 m' },
      { name: 'SUROIT', length_overall: null },
      { name: 'Site', asset_kind: 'quay' as const, length_overall: '100' },
    ];
    expect([...vessels].sort(compareFleetAssets).map((v) => v.name)).toEqual(['Nouveau navire', 'SUROIT', 'GOURY', 'Site']);
    expect(fleetLength({ name: 'GOURY', length_overall: 'inconnue' })).toBe(30.62);
    expect(fleetLength({ name: 'Inconnu', lengthOverall: -3 })).toBe(0);
  });
});
