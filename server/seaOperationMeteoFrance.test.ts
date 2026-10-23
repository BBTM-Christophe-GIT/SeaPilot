// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeMfwamPoint } from './seaOperationGrib.js';
import { loadMeteoFranceForecast } from './seaOperationMeteoFrance.js';

vi.mock('./seaOperationGrib.js', () => ({ decodeMfwamPoint: vi.fn() }));
const decode = vi.mocked(decodeMfwamPoint);
const CATALOGUE = 'https://www.data.gouv.fr/api/1/datasets/paquets-de-modele-de-vagues-mfwam-resolution-0-025deg/';
const RUN = '2026-10-22T12:00:00Z';
const NOW = Date.parse(RUN);
const point = { projectId: '42', pointId: 'wp1', latitude: 48.36, longitude: -4.53, eta: '2026-10-22T15:00' };
function resource(hour = 1, run = RUN) {
  return { id: `resource-${hour}`, title: `vague-surcote-MFWAM__0025__SP1__${String(hour).padStart(3, '0')}H__${run}.grib2`,
    format: 'grib2', url: `https://meteofrance-pnt.s3.rbx.io.cloud.ovh.net/pnt/${run}/vague-surcote/MFWAM/0025/SP1/vague-surcote-MFWAM__0025__SP1__${String(hour).padStart(3, '0')}H__${run}.grib2`,
    filesize: 32, last_modified: '2026-10-22T13:15:40+02:00', checksum: { type: 'sha256', value: `hash-${hour}` } };
}
function decoded() {
  return { referenceTime: '2026-10-22T12:00:00.000Z', validTime: '2026-10-22T13:00:00.000Z', latitude: 48.35, longitude: -4.525,
    windSpeedMps: 6.830078125, windDirectionDegrees: 203.2440185546875,
    heightMeters: 0.22821044921875, periodSeconds: 8.188232421875, swellDirectionDegrees: 236.431640625 };
}
function grib() { const bytes = new Uint8Array(32); bytes.set([71, 82, 73, 66]); return bytes; }
function fixture(resources: unknown[] = [resource()]) {
  return vi.fn<typeof fetch>(async (url) => url === CATALOGUE ? Response.json({ resources }) : new Response(grib()));
}
beforeEach(() => { vi.resetAllMocks(); decode.mockResolvedValue(decoded()); });

describe('public Météo-France MFWAM provider', () => {
  it('uses the official public catalogue, same-cell swell and wind, and actual model provenance', async () => {
    const fetcher = fixture();
    const result = await loadMeteoFranceForecast(point, { fetcher, now: NOW });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe(CATALOGUE);
    expect(fetcher.mock.calls[1][0]).toBe(resource().url);
    expect(fetcher.mock.calls.every(([, options]) => options?.redirect === 'error' && options.credentials === 'omit')).toBe(true);
    expect(decode).toHaveBeenCalledWith(expect.any(Uint8Array), { latitude: point.latitude, longitude: point.longitude }, Date.parse('2026-10-22T13:00:00Z'));
    expect(result.wind?.speedKnots).toBeCloseTo(13.2766, 3);
    expect(result.wind?.gustKnots).toBeNull();
    expect(result.windMessage).toBe('');
    expect(result.waves).toMatchObject({ heightMeters: decoded().heightMeters, periodSeconds: decoded().periodSeconds, directionDegrees: decoded().swellDirectionDegrees, component: 'swell' });
    expect(result).toMatchObject({ attribution: 'Météo-France', model: { referenceTime: decoded().referenceTime, latitude: 48.35, longitude: -4.525 } });
  });

  it('chooses the latest available run and its closest hour rather than metadata row order', async () => {
    const fetcher = fixture([resource(7, '2026-10-22T06:00:00Z'), resource(2), resource(1)]);
    await loadMeteoFranceForecast(point, { fetcher, now: NOW });
    expect(fetcher.mock.calls[1][0]).toBe(resource(1).url);
  });

  it('keeps the earlier model hour on a half-hour tie and exposes its real timestamp', async () => {
    const fetcher = fixture([resource(2), resource(1)]);
    const result = await loadMeteoFranceForecast({ ...point, eta: '2026-10-22T15:30' }, { fetcher, now: NOW });
    expect(fetcher.mock.calls[1][0]).toBe(resource(1).url);
    expect(result.wind?.time).toBe('2026-10-22T13:00:00.000Z');
  });

  it.each([
    ['past ETA', { eta: '2026-10-22T13:59' }],
    ['north of domain', { latitude: 53.001 }],
    ['south of domain', { latitude: 37.999 }],
    ['west of domain', { longitude: -8.001 }],
    ['east of domain', { longitude: 12.001 }],
  ])('returns explicit missing data without network for %s', async (_name, change) => {
    const fetcher = fixture();
    const result = await loadMeteoFranceForecast({ ...point, ...change }, { fetcher, now: NOW });
    expect(result.wind).toBeNull(); expect(result.waves).toBeNull();
    expect(result.windMessage).not.toBe(''); expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses the published horizon instead of inventing data beyond its final hour', async () => {
    const fetcher = fixture([resource(1), resource(2)]);
    const result = await loadMeteoFranceForecast({ ...point, eta: '2026-10-22T16:31' }, { fetcher, now: NOW });
    expect(result.wind).toBeNull(); expect(result.waves).toBeNull();
    expect(result.windMessage).toContain('horizon');
    expect(result.windMessage).toContain('dernière échéance disponible le 22/10/2026 à 14:00 UTC');
    expect(result.wavesMessage).toBe(result.windMessage);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(decode).not.toHaveBeenCalled();
  });

  it('reports the latest actual deadline across available runs without relying on catalogue order', async () => {
    const fetcher = fixture([resource(2), resource(60, '2026-10-22T06:00:00Z'), resource(1)]);
    const result = await loadMeteoFranceForecast({ ...point, eta: '2026-10-25T12:00' }, { fetcher, now: NOW });
    expect(result.wind).toBeNull(); expect(result.waves).toBeNull();
    expect(result.windMessage).toContain('dernière échéance disponible le 24/10/2026 à 18:00 UTC');
    expect(result.wavesMessage).toBe(result.windMessage);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(decode).not.toHaveBeenCalled();
  });

  it('distinguishes an ETA before the first published deadline from one beyond the horizon', async () => {
    const fetcher = fixture([resource(3), resource(2)]);
    const result = await loadMeteoFranceForecast({ ...point, eta: '2026-10-22T14:00' }, { fetcher, now: NOW });
    expect(result.windMessage).toContain('précède la première échéance');
    expect(result.windMessage).toContain('22/10/2026 à 14:00 UTC');
    expect(result.windMessage).not.toContain('hors horizon');
    expect(result.wavesMessage).toBe(result.windMessage);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(decode).not.toHaveBeenCalled();
  });

  it('explains an unpublished hour inside the available window instead of reporting an upstream outage', async () => {
    const fetcher = fixture([resource(3), resource(1)]);
    const result = await loadMeteoFranceForecast({ ...point, eta: '2026-10-22T16:00' }, { fetcher, now: NOW });
    expect(result.windMessage).toContain('Une échéance Météo-France manque pour cette heure');
    expect(result.windMessage).toContain('du 22/10/2026 à 13:00 UTC au 22/10/2026 à 15:00 UTC');
    expect(result.windMessage).not.toMatch(/hors horizon|temporairement indisponibles/);
    expect(result.wavesMessage).toBe(result.windMessage);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(decode).not.toHaveBeenCalled();
  });

  it('reports an empty exploitable catalogue separately from a network or malformed-catalogue failure', async () => {
    const result = await loadMeteoFranceForecast(point, { fetcher: fixture([]), now: NOW });
    expect(result.windMessage).toContain('Aucune échéance Météo-France exploitable');
    expect(result.windMessage).not.toContain('hors horizon');
    expect(result.wavesMessage).toBe(result.windMessage);
    const malformed = vi.fn<typeof fetch>(async () => Response.json({}));
    await expect(loadMeteoFranceForecast(point, { fetcher: malformed, now: NOW })).rejects.toThrow('catalogue Météo-France est invalide');
    const offline = vi.fn<typeof fetch>().mockRejectedValue(new Error('Network unavailable'));
    await expect(loadMeteoFranceForecast(point, { fetcher: offline, now: NOW })).rejects.toThrow('Network unavailable');
  });

  it.each([
    ['external host', { url: resource().url.replace('meteofrance-pnt.s3.rbx.io.cloud.ovh.net', 'example.com') }],
    ['suffix host', { url: resource().url.replace('.net/', '.net.example.com/') }],
    ['wrong product', { url: resource().url.replace('/MFWAM/', '/AROME/') }],
    ['query parameter', { url: `${resource().url}?redirect=https://example.com` }],
    ['different run in filename', { url: resource().url.replace('__2026-10-22T12:00:00Z.grib2', '__2026-10-22T06:00:00Z.grib2') }],
    ['oversized metadata file', { filesize: 21 * 1024 * 1024 }],
  ])('never fetches a catalogue resource with %s', async (_name, change) => {
    const fetcher = fixture([{ ...resource(), ...change }]);
    const result = await loadMeteoFranceForecast(point, { fetcher, now: NOW });
    expect(result.wind).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1); expect(decode).not.toHaveBeenCalled();
  });

  it('ignores future runs, stale runs and rolled-over invalid calendar dates', async () => {
    const fetcher = fixture([resource(1, '2026-10-22T13:00:00Z'), resource(1, '2026-10-20T12:00:00Z'), resource(1, '2026-02-30T12:00:00Z')]);
    expect((await loadMeteoFranceForecast(point, { fetcher, now: NOW })).wind).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('expires a run after 24 hours even while its catalogue entry remains cached', async () => {
    const previousRun = '2026-10-21T12:00:00Z';
    const fetcher = fixture([resource(25, previousRun)]);
    decode.mockResolvedValue({ ...decoded(), referenceTime: previousRun });
    expect((await loadMeteoFranceForecast(point, { fetcher, now: NOW })).wind).not.toBeNull();
    expect((await loadMeteoFranceForecast(point, { fetcher, now: NOW + 60_000 })).wind).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it('keeps bitmap-masked land missing without moving the position or replacing it by zero', async () => {
    decode.mockResolvedValue({ ...decoded(), windSpeedMps: null, windDirectionDegrees: null, heightMeters: null, periodSeconds: null, swellDirectionDegrees: null });
    const result = await loadMeteoFranceForecast(point, { fetcher: fixture(), now: NOW });
    expect(result.wind).toBeNull(); expect(result.waves).toBeNull();
    expect(result.wavesMessage).toContain('terrestre');
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it('accepts only a decoder-confirmed marine fallback within ten kilometres and retains the requested coordinates', async () => {
    decode.mockResolvedValue({ ...decoded(), latitude: point.latitude + 0.05, longitude: point.longitude, marineFallback: true });
    const result = await loadMeteoFranceForecast(point, { fetcher: fixture(), now: NOW });
    expect(result).toMatchObject({ latitude: point.latitude, longitude: point.longitude,
      model: { latitude: point.latitude + 0.05, longitude: point.longitude, referenceTime: decoded().referenceTime } });
    expect(result.waves?.heightMeters).toBe(decoded().heightMeters);
    expect(result).not.toHaveProperty('marineFallback');
  });

  it.each([
    ['beyond the geodesic radius', { latitude: point.latitude + 0.09 }],
    ['only land wind without marine height/period', { heightMeters: null, periodSeconds: null }],
    ['a different run', { referenceTime: '2026-10-22T06:00:00Z' }],
    ['a different hour', { validTime: '2026-10-22T14:00:00Z' }],
  ])('refuses a marked marine fallback with %s', async (_label, change) => {
    decode.mockResolvedValue({ ...decoded(), latitude: point.latitude + 0.05, longitude: point.longitude, marineFallback: true, ...change });
    await expect(loadMeteoFranceForecast(point, { fetcher: fixture(), now: NOW })).rejects.toThrow('ne correspond pas');
  });

  it('does not enlarge the ordinary half-cell guard for an unmarked result', async () => {
    decode.mockResolvedValue({ ...decoded(), latitude: point.latitude + 0.05, longitude: point.longitude });
    await expect(loadMeteoFranceForecast(point, { fetcher: fixture(), now: NOW })).rejects.toThrow('ne correspond pas');
  });

  it('preserves valid zero values and leaves individual invalid fields missing', async () => {
    decode.mockResolvedValue({ ...decoded(), windSpeedMps: 0, windDirectionDegrees: NaN, heightMeters: 0, periodSeconds: -1, swellDirectionDegrees: Infinity });
    const result = await loadMeteoFranceForecast(point, { fetcher: fixture(), now: NOW });
    expect(result.wind).toMatchObject({ speedKnots: 0, directionDegrees: null, gustKnots: null });
    expect(result.waves).toMatchObject({ heightMeters: 0, periodSeconds: null, directionDegrees: null });
  });

  it.each([
    ['wrong run', { referenceTime: '2026-10-22T06:00:00Z' }],
    ['wrong valid time', { validTime: '2026-10-22T14:00:00Z' }],
    ['invalid valid time', { validTime: 'invalid' }],
    ['distant latitude', { latitude: 48.3 }],
    ['distant longitude', { longitude: -4.6 }],
  ])('rejects decoded data for %s', async (_name, change) => {
    decode.mockResolvedValue({ ...decoded(), ...change });
    await expect(loadMeteoFranceForecast(point, { fetcher: fixture(), now: NOW })).rejects.toThrow('ne correspond pas');
  });

  it('reuses the bounded catalogue/file cache across points and refreshes both after five minutes', async () => {
    const fetcher = fixture();
    await loadMeteoFranceForecast(point, { fetcher, now: NOW });
    await loadMeteoFranceForecast({ ...point, pointId: 'wp2' }, { fetcher, now: NOW + 1_000 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await loadMeteoFranceForecast(point, { fetcher, now: NOW + 301_000 });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('evicts the oldest downloaded file when a fifth distinct forecast hour is requested', async () => {
    const fetcher = fixture([1, 2, 3, 4, 5].map((hour) => resource(hour)));
    decode.mockImplementation(async (_bytes, _point, targetTime) => ({ ...decoded(), validTime: new Date(targetTime).toISOString() }));
    for (let hour = 15; hour <= 19; hour++) await loadMeteoFranceForecast({ ...point, eta: `2026-10-22T${hour}:00` }, { fetcher, now: NOW });
    await loadMeteoFranceForecast(point, { fetcher, now: NOW });
    expect(fetcher).toHaveBeenCalledTimes(7);
    expect(fetcher.mock.calls.filter(([url]) => url === resource(1).url)).toHaveLength(2);
  });

  it('shares concurrent catalogue, file and same-point decoding work', async () => {
    const fetcher = fixture();
    const results = await Promise.all([loadMeteoFranceForecast(point, { fetcher, now: NOW }),
      loadMeteoFranceForecast({ ...point, pointId: 'other-point' }, { fetcher, now: NOW })]);
    expect(fetcher).toHaveBeenCalledTimes(2); expect(decode).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.pointId)).toEqual(['wp1', 'other-point']);
  });

  it('cancels a caller without cancelling a shared request needed by the next caller', async () => {
    let release!: (value: Response) => void;
    const gate = new Promise<Response>((resolve) => { release = resolve; });
    const fetcher = vi.fn<typeof fetch>(async (url) => url === CATALOGUE ? gate : new Response(grib()));
    const controller = new AbortController();
    const first = loadMeteoFranceForecast(point, { fetcher, now: NOW, signal: controller.signal });
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const second = loadMeteoFranceForecast(point, { fetcher, now: NOW });
    controller.abort(); await rejected;
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(false);
    release(Response.json({ resources: [resource()] }));
    expect((await second).waves?.heightMeters).toBe(decoded().heightMeters);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does no network work for an already aborted caller', async () => {
    const fetcher = fixture(); const controller = new AbortController(); controller.abort();
    await expect(loadMeteoFranceForecast(point, { fetcher, now: NOW, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('refuses oversized catalogue bodies and malformed catalogue shapes', async () => {
    for (const body of [' '.repeat(2 * 1024 * 1024 + 1), JSON.stringify({ resources: {} })]) {
      const fetcher = vi.fn<typeof fetch>(async () => new Response(body));
      await expect(loadMeteoFranceForecast(point, { fetcher, now: NOW })).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
    expect(decode).not.toHaveBeenCalled();
  });

  it('refuses oversized binary responses before reading their content', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => url === CATALOGUE ? Response.json({ resources: [resource()] })
      : new Response(grib(), { headers: { 'content-length': String(20 * 1024 * 1024 + 1) } }));
    await expect(loadMeteoFranceForecast(point, { fetcher, now: NOW })).rejects.toThrow('taille autorisée');
    expect(decode).not.toHaveBeenCalled();
  });

  it('enforces the binary stream size limit even when content-length is absent', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => url === CATALOGUE ? Response.json({ resources: [resource()] })
      : new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(20 * 1024 * 1024 + 1)); controller.close(); } })));
    await expect(loadMeteoFranceForecast(point, { fetcher, now: NOW })).rejects.toThrow('taille autorisée');
    expect(decode).not.toHaveBeenCalled();
  });

  it('does not cache a failed download, and rejects non-GRIB files before decoding', async () => {
    let downloads = 0;
    const cancelled = vi.fn();
    const failed = new Response(new ReadableStream({ cancel: cancelled }), { status: 503 });
    const fetcher = vi.fn<typeof fetch>(async (url) => url === CATALOGUE ? Response.json({ resources: [resource()] })
      : ++downloads === 1 ? failed : new Response('this is not a GRIB2 forecast at all'));
    await expect(loadMeteoFranceForecast(point, { fetcher, now: NOW })).rejects.toThrow('indisponibles');
    await expect(loadMeteoFranceForecast(point, { fetcher, now: NOW })).rejects.toThrow('fichier');
    expect(downloads).toBe(2); expect(cancelled).toHaveBeenCalledTimes(1); expect(decode).not.toHaveBeenCalled();
  });
});
