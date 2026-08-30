import { describe, expect, it, vi } from 'vitest';
import {
  fetchFrenchCitiesByPostalCode,
  inferClientCountry,
  isFrenchClientLocation,
  normalizeClientPostalCode,
  resolveClientCountry,
} from './clientLocation';

describe('clientLocation', () => {
  it('normalizes postal codes and sorts official commune suggestions by population', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { nom: 'Le Rozel', population: 249 },
        { nom: 'Les Pieux', population: 3290 },
        { nom: 'Le Rozel', population: 200 },
      ],
    });

    expect(normalizeClientPostalCode(' 50 340 ')).toBe('50340');
    await expect(fetchFrenchCitiesByPostalCode('50340', { fetcher })).resolves.toEqual([
      { name: 'Les Pieux', population: 3290 },
      { name: 'Le Rozel', population: 249 },
    ]);
    expect(String(fetcher.mock.calls[0][0])).toContain('codePostal=50340');
  });

  it('detects explicit foreign countries and common maritime cities without a visible country field', () => {
    expect(inferClientCountry({ address: 'Kattendijkdok-Westkaai 21, Belgium', city: 'Antwerp' })).toBe('Belgique');
    expect(inferClientCountry({ address: '', city: 'Rotterdam' })).toBe('Pays-Bas');
    expect(inferClientCountry({ address: '', city: 'Le Rozel' }, true)).toBe('France');
  });

  it('recognizes a French address through the Géoplateforme response', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{ properties: { city: 'Le Rozel', postcode: '50340', score: 0.93 } }],
      }),
    });
    await expect(isFrenchClientLocation({
      address: '15 impasse du Pou',
      city: 'Le Rozel',
      postalCode: '50340',
    }, { fetcher })).resolves.toBe(true);
  });

  it('keeps saving possible when geocoding is unavailable', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(resolveClientCountry({
      address: 'Unknown street',
      city: 'Unknown city',
      country: 'Pays existant',
      postalCode: '00000',
    }, { fetcher })).resolves.toBe('Pays existant');
  });
});
