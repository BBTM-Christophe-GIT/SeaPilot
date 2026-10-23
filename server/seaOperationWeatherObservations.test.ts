// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { isSeaOperationWeatherObservation } from '../src/features/seaOperations/seaOperationWeatherObservationsModel.js';
import { loadSeaOperationWeatherObservations } from './seaOperationWeatherObservations.js';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const MF_RESOURCE = 'e45318b1-fe97-4ce6-af93-4575e8fd41ba';
const UK_BUCKET = 'https://met-office-marine-observations-data.s3.eu-west-2.amazonaws.com/';
const PREFIX = '202610230915_202610230800_202610230859/';
const FILE = 'channel_test_buoy_438fab93-df69-487c-a673-4a43f6661536.csv';
const ukPoint = { pointId: 'wp1', latitude: 49.91, longitude: -2.88, etaUtc: '2026-10-23T08:26:00.000Z' };
const mfPoint = { pointId: 'wp2', latitude: 45.23, longitude: -5, etaUtc: '2026-10-22T23:00:00.000Z' };
const good = '{"good": []}';

/** Actual columns/units from the Météo-France June 2026 buoy product specification. */
function mfRow(change: Record<string, unknown> = {}) {
  return { lat: 45.23, lon: -5, geo_id_wmo: 6200001, name: 'BOUEE_GASCOGNE', validity_time: '2026-10-23T01:00:00+02:00',
    ff: 16.1, dd: 260, haut_vag: 5.9, per_moy_vag: 8, dir_vag: 280, ...change };
}
/** Public producer CSV sampled at Channel Test Buoy, 23 October 2026 08:00 UTC. */
function ukRow(change: Record<string, string> = {}) {
  return { timestep: '2026-10-23T08:00:00Z', name: 'Channel Test Buoy', longitude: '-2.88', latitude: '49.91',
    wind_direction_marine: '296.4', wind_direction_marine_qc: good, wind_speed_marine: '21.55', wind_speed_marine_qc: good,
    significant_wave_height_hm_0_swell: '4.0', significant_wave_height_hm_0_swell_qc: good,
    wave_peak_period_swell: '14.2', wave_peak_period_swell_qc: good, wave_peak_direction_swell: '245.0', wave_peak_direction_swell_qc: good,
    ...change };
}
function csv(row: Record<string, string>) { return `${Object.keys(row).join('|')}\n${Object.values(row).join('|')}\n`; }
function listing(key = `${PREFIX}${FILE}`, change = '') {
  return `<ListBucketResult><Prefix>${PREFIX}</Prefix><IsTruncated>false</IsTruncated><Contents><Key>${key}</Key><Size>6130</Size></Contents>${change}</ListBucketResult>`;
}
function mfFetcher(rows: unknown[] = [mfRow()], resourceChange: Record<string, unknown> = {}) {
  return vi.fn<typeof fetch>(async (input) => String(input).includes('/datasets/') ? Response.json({ resources: [{
    id: MF_RESOURCE, title: 'marine_2026', url: 'https://meteofrance.s3.sbg.io.cloud.ovh.net/data/OBS/BOUEES/marine_2026.csv.gz', ...resourceChange,
  }] }) : Response.json({ data: rows, links: { next: null } }));
}
function ukFetcher(row = ukRow(), xml = listing()) {
  return vi.fn<typeof fetch>(async (input) => String(input).includes('?') ? new Response(xml) : new Response(csv(row)));
}

describe('official measured waypoint weather', () => {
  it('reads a small filtered Météo-France tabular response without downloading a yearly archive or requiring a key', async () => {
    const fetcher = mfFetcher();
    const result = await loadSeaOperationWeatherObservations(mfPoint, { now: NOW, fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const url = new URL(String(fetcher.mock.calls[1][0]));
    expect(url.origin).toBe('https://tabular-api.data.gouv.fr');
    expect(url.pathname).toBe(`/api/resources/${MF_RESOURCE}/data/`);
    expect(url.searchParams.get('validity_time__greater')).toBe('2026-10-22T22:30:00.000Z');
    expect(url.searchParams.get('page_size')).toBe('50');
    expect(url.searchParams.get('columns')).not.toMatch(/raf|fxi/);
    expect(fetcher.mock.calls.every(([, options]) => options?.redirect === 'error' && options.credentials === 'omit' && !options.headers)).toBe(true);
    expect(result.wind?.speedKnots).toBeCloseTo(31.2959, 3);
    expect(result.wind).toMatchObject({ observedAt: mfPoint.etaUtc, directionDegrees: 260, instrumentHeightMeters: null,
      source: { provider: 'Météo-France', quality: 'not_provided' }, station: { id: '6200001', name: 'BOUEE_GASCOGNE', distanceKm: 0 } });
    expect(result.waves).toMatchObject({ heightMeters: 5.9, periodSeconds: 8, directionDegrees: 280, component: 'total', periodKind: 'mean' });
    expect(result.status).toBe('recorded');
    expect(isSeaOperationWeatherObservation(result)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/gust|rafale|rafper/);
  });

  it('reads measured Met Office swell and peak period with good quality at the actual station/time', async () => {
    const fetcher = ukFetcher();
    const result = await loadSeaOperationWeatherObservations(ukPoint, { now: NOW, fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe(UK_BUCKET);
    expect(url.searchParams.get('prefix')).toBe(PREFIX);
    expect(fetcher.mock.calls[1][0]).toBe(`${UK_BUCKET}${PREFIX}${FILE}`);
    expect(result.waves).toMatchObject({ observedAt: '2026-10-23T08:00:00.000Z', heightMeters: 4, periodSeconds: 14.2,
      directionDegrees: 245, component: 'swell', periodKind: 'peak', station: { name: 'Channel Test Buoy', distanceKm: 0 },
      source: { provider: 'Met Office', quality: 'good', license: 'CC BY-SA 4.0' } });
    expect(result.wind).toMatchObject({ speedKnots: null, directionDegrees: 296.4, instrumentHeightMeters: null });
    expect(result.message).toContain('unité non précisée');
    expect(isSeaOperationWeatherObservation(result)).toBe(true);
  });

  it('preserves the difference between total significant waves and swell and between mean and peak periods', async () => {
    const row = ukRow({ significant_wave_height_hm_0_swell: '', wave_peak_period_swell: '', wave_peak_direction_swell: '',
      significant_wave_height_heave: '2.0', significant_wave_height_heave_qc: good, wave_mean_period_heave: '6.2', wave_mean_period_heave_qc: good });
    const result = await loadSeaOperationWeatherObservations(ukPoint, { now: NOW, fetcher: ukFetcher(row) });
    expect(result.waves).toMatchObject({ component: 'total', heightMeters: 2, periodSeconds: 6.2, periodKind: 'mean', directionDegrees: null });
  });

  it.each(['{"suspect": []}', '{"erroneous": []}', '{"good":[],"suspect":[]}', '', 'not-json'])('discards a Met Office value whose quality is %s', async (quality) => {
    const row = ukRow({ significant_wave_height_hm_0_swell_qc: quality, wave_peak_period_swell_qc: quality, wave_peak_direction_swell_qc: quality,
      wind_direction_marine_qc: quality });
    const result = await loadSeaOperationWeatherObservations(ukPoint, { now: NOW, fetcher: ukFetcher(row) });
    expect(result.wind).toBeNull(); expect(result.waves).toBeNull();
    expect(result.status).toBe('unavailable');
  });

  it('keeps each field missing independently and preserves valid zero wind/height values', async () => {
    const result = await loadSeaOperationWeatherObservations(mfPoint, { now: NOW, fetcher: mfFetcher([mfRow({ ff: 0, dd: null,
      haut_vag: 0, per_moy_vag: -1, dir_vag: 999 })]) });
    expect(result.wind).toMatchObject({ speedKnots: 0, directionDegrees: null });
    expect(result.waves).toMatchObject({ heightMeters: 0, periodSeconds: null, directionDegrees: null });
  });

  it('never replaces empty or non-finite measurements by zero', async () => {
    const result = await loadSeaOperationWeatherObservations(mfPoint, { now: NOW, fetcher: mfFetcher([mfRow({ ff: '', dd: null,
      haut_vag: 'NaN', per_moy_vag: 'Infinity', dir_vag: -1 })]) });
    expect(result.wind).toBeNull(); expect(result.waves).toBeNull();
  });

  it.each([
    ['station too far', { lat: 46, lon: -5 }],
    ['measurement too old', { validity_time: '2026-10-22T22:29:59Z' }],
    ['measurement too late', { validity_time: '2026-10-22T23:30:01Z' }],
    ['missing station identity', { name: '' }],
    ['invalid station identity', { geo_id_wmo: 'bad' }],
  ])('rejects a Météo-France %s instead of interpolating', async (_name, change) => {
    const result = await loadSeaOperationWeatherObservations(mfPoint, { now: NOW, fetcher: mfFetcher([mfRow(change)]) });
    expect(result.wind).toBeNull(); expect(result.waves).toBeNull();
  });

  it('bounds Met Office lookup to the nearest hour and rejects an actual station position outside the radius', async () => {
    const result = await loadSeaOperationWeatherObservations(ukPoint, { now: NOW, fetcher: ukFetcher(ukRow({ latitude: '48' })) });
    expect(result.wind).toBeNull(); expect(result.waves).toBeNull();
  });

  it('keeps the earlier hour on an exact half-hour tie', async () => {
    const fetcher = ukFetcher();
    expect((await loadSeaOperationWeatherObservations({ ...ukPoint, etaUtc: '2026-10-23T08:30:00Z' }, { now: NOW, fetcher })).waves).not.toBeNull();
    expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get('prefix')).toBe(PREFIX);
  });

  it('waits for the official hourly publication and does not use a recent observation from another ETA', async () => {
    const fetcher = ukFetcher();
    const result = await loadSeaOperationWeatherObservations(ukPoint, { now: Date.parse('2026-10-23T09:14:59Z'), fetcher });
    expect(result.status).toBe('pending'); expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ['future', { ...ukPoint, etaUtc: '2026-10-24T08:00:00Z' }, 'pending'],
    ['outside the seven day UK window', { ...ukPoint, etaUtc: '2026-10-15T08:00:00Z' }, 'unavailable'],
    ['no station coverage', { ...ukPoint, latitude: 0, longitude: 0 }, 'unavailable'],
  ])('does not download for %s', async (_name, point, status) => {
    const fetcher = ukFetcher();
    const result = await loadSeaOperationWeatherObservations(point, { now: NOW, fetcher });
    expect(result.status).toBe(status); expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ['external resource host', { url: 'https://example.com/marine_2026.csv.gz' }],
    ['wrong resource id', { id: '../secret' }],
    ['wrong year', { title: 'marine_2025' }],
  ])('rejects Météo-France catalogue %s', async (_name, change) => {
    const fetcher = mfFetcher([mfRow()], change);
    const result = await loadSeaOperationWeatherObservations(mfPoint, { now: NOW, fetcher });
    expect(result.wind).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['foreign object', listing(`https://example.com/${FILE}`)],
    ['parent directory object', listing(`${PREFIX}../${FILE}`)],
    ['duplicated station file', listing(`${PREFIX}${FILE}`, `<Contents><Key>${PREFIX}${FILE}</Key><Size>6130</Size></Contents>`)],
    ['external entity', `<!DOCTYPE root [<!ENTITY attack SYSTEM "file:///secret">]>${listing()}`],
    ['truncated list', listing().replace('<IsTruncated>false', '<IsTruncated>true')],
  ])('does not download a Met Office %s', async (_name, xml) => {
    const fetcher = ukFetcher(ukRow(), xml);
    const result = await loadSeaOperationWeatherObservations(ukPoint, { now: NOW, fetcher });
    expect(result.wind).toBeNull(); expect(result.waves).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('bounds provider response sizes before parsing', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('x', { headers: { 'content-length': String(3 * 1024 * 1024) } }));
    const result = await loadSeaOperationWeatherObservations(mfPoint, { now: NOW, fetcher });
    expect(result.status).toBe('pending'); expect(result.wind).toBeNull();
  });

  it('coalesces the shared catalogue, hourly list and small observation responses', async () => {
    const fetcher = ukFetcher();
    await Promise.all([loadSeaOperationWeatherObservations(ukPoint, { now: NOW, fetcher }), loadSeaOperationWeatherObservations({ ...ukPoint, pointId: 'other' }, { now: NOW, fetcher })]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('allows retry after a temporary provider failure instead of caching the rejection', async () => {
    const fetcher = ukFetcher();
    fetcher.mockRejectedValueOnce(new Error('Network unavailable'));
    expect((await loadSeaOperationWeatherObservations(ukPoint, { now: NOW, fetcher })).status).toBe('pending');
    expect((await loadSeaOperationWeatherObservations(ukPoint, { now: NOW + 1, fetcher })).status).toBe('recorded');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('rejects a caller cancellation or invalid input before network work', async () => {
    const fetcher = ukFetcher();
    await expect(loadSeaOperationWeatherObservations(ukPoint, { now: NOW, fetcher, signal: AbortSignal.abort() })).rejects.toThrow();
    await expect(loadSeaOperationWeatherObservations({ ...ukPoint, etaUtc: '2026-02-30T08:00:00Z' }, { now: NOW, fetcher })).rejects.toThrow('invalide');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
