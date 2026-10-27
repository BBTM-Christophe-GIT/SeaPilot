// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { loadSeaOperationForecast, sameSeaOperationTransitContext, seaOperationEtaUtc, seaOperationWeatherProviderUrl, validateSeaOperationWeatherInput, type SeaOperationWeatherInput } from './seaOperationWeatherModel';

const point: SeaOperationWeatherInput = { projectId: '12', pointId: 'p1', latitude: 49.7, longitude: -1.6, eta: '2026-10-22T12:25' };
const now = Date.parse('2026-10-20T06:00:00Z');
const hour = Date.parse('2026-10-22T10:00:00Z') / 1000;
function provider(kind: 'wind' | 'waves', times = [hour, hour + 3600]): {
  utc_offset_seconds: number; hourly: Record<string, (number | null)[]>; hourly_units: Record<string, string>;
} {
  const variable = kind === 'wind' ? ['wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m'] : ['swell_wave_height', 'swell_wave_period', 'swell_wave_direction'];
  const values = kind === 'wind' ? [12, 18, 270] : [1.2, 9, 280];
  return { utc_offset_seconds: 0, hourly: { time: times, ...Object.fromEntries(variable.map((key, index) => [key, times.map(() => values[index])])) },
    hourly_units: Object.fromEntries(variable.map((key, index) => [key, (kind === 'wind' ? ['kn', 'kn', '°'] : ['m', 's', '°'])[index]])) };
}
const fetcher = () => vi.fn(async (url: URL | RequestInfo) => Response.json(provider(String(url).includes('/marine?') ? 'waves' : 'wind'))) as unknown as typeof fetch;

describe('sea operation forecast time and provider model', () => {
  it('compares untrusted Transit response metadata without throwing or accepting null, primitives or extra keys', () => {
    const transit = { date: '2026-10-27', vesselId: '2' };
    expect(sameSeaOperationTransitContext(transit, { vesselId: '2', date: '2026-10-27' })).toBe(true);
    expect(sameSeaOperationTransitContext(undefined, undefined)).toBe(true);
    for (const value of [undefined, null, 2, 'transit', [], {}, { ...transit, extra: true }, { ...transit, vesselId: '3' }, { ...transit, date: '2026-10-28' }]) {
      expect(sameSeaOperationTransitContext(transit, value)).toBe(false);
      expect(sameSeaOperationTransitContext(value, transit)).toBe(false);
    }
  });
  it('requires an explicit real vessel/day when Transit has no project ID', () => {
    const transit = { date: '2026-10-27', vesselId: '2' };
    expect(validateSeaOperationWeatherInput({ ...point, projectId: '', transit })).toEqual({ ...point, projectId: '', transit });
    for (const patch of [{ projectId: '' }, { projectId: '12', transit }, { projectId: '', transit: { ...transit, vesselId: '0' } },
      { projectId: '', transit: { ...transit, date: '2026-02-30' } }, { projectId: '', transit: { ...transit, date: '0026-10-27' } },
      { projectId: '', transit: { ...transit, extra: true } }]) expect(() => validateSeaOperationWeatherInput({ ...point, ...patch })).toThrow();
  });
  it('converts explicit Paris dates using the correct winter and summer offsets', () => {
    expect(seaOperationEtaUtc('2026-01-10T12:15')).toBe('2026-01-10T11:15:00.000Z');
    expect(seaOperationEtaUtc('2026-07-10T12:15')).toBe('2026-07-10T10:15:00.000Z');
    expect(seaOperationEtaUtc('2026-10-25T03:15')).toBe('2026-10-25T02:15:00.000Z');
  });

  it.each(['12:30', '2026-02-30T12:00', '2026-10-25T02:30', '2026-03-29T02:30', '2026-10-22T24:00', '2026-10-22T12:00Z'])(
    'rejects incomplete, nonexistent and ambiguous local times: %s', (eta) => expect(() => seaOperationEtaUtc(eta)).toThrow(),
  );

  it.each([{ ...point, latitude: NaN }, { ...point, longitude: 181 }, { ...point, projectId: '0' }, { ...point, projectId: '9223372036854775808' }])(
    'rejects malformed request coordinates and project identities', (value) => expect(() => validateSeaOperationWeatherInput(value)).toThrow(),
  );

  it('uses commercial hosts only with a server key and explicit UTC, knots, swell variables and supported horizons', () => {
    const wind = seaOperationWeatherProviderUrl('wind', point, 'secret');
    const waves = seaOperationWeatherProviderUrl('waves', point, 'secret');
    expect(wind.hostname).toBe('customer-api.open-meteo.com');
    expect(waves.hostname).toBe('customer-marine-api.open-meteo.com');
    expect(wind.searchParams.get('wind_speed_unit')).toBe('kn');
    expect(wind.searchParams.get('forecast_days')).toBe('16');
    expect(waves.searchParams.get('forecast_days')).toBe('7');
    expect(waves.searchParams.get('hourly')).toBe('swell_wave_height,swell_wave_period,swell_wave_direction');
    expect(waves.searchParams.get('timeformat')).toBe('unixtime');
    expect(waves.searchParams.get('timezone')).toBe('UTC');
  });

  it('keeps ETA and nearest model hour distinct, with Hs of swell and wind in knots', async () => {
    const result = await loadSeaOperationForecast(point, { fetcher: fetcher(), now });
    expect(result.etaUtc).toBe('2026-10-22T10:25:00.000Z');
    expect(result.wind).toEqual({ time: '2026-10-22T10:00:00.000Z', speedKnots: 12, gustKnots: 18, directionDegrees: 270 });
    expect(result.waves).toEqual({ time: '2026-10-22T10:00:00.000Z', heightMeters: 1.2, periodSeconds: 9, directionDegrees: 280, component: 'swell' });
    expect(result.attribution).toBe('Open-Meteo');
    expect(JSON.stringify(result)).not.toContain('apikey');
  });

  it('selects the following hour when it is closer, without interpolating', async () => {
    const result = await loadSeaOperationForecast({ ...point, eta: '2026-10-22T12:31' }, { fetcher: fetcher(), now });
    expect(result.wind?.time).toBe('2026-10-22T11:00:00.000Z');
  });

  it('does not substitute a distant available forecast hour for the requested ETA', async () => {
    const request = vi.fn(async (url) => Response.json(provider(String(url).includes('/marine?') ? 'waves' : 'wind', [hour]))) as typeof fetch;
    const result = await loadSeaOperationForecast({ ...point, eta: '2026-10-22T12:31' }, { fetcher: request, now });
    expect(result).toMatchObject({ wind: null, waves: null });
  });

  it('preserves missing marine values instead of displaying zero swell', async () => {
    const request = vi.fn(async (url) => {
      const body = provider(String(url).includes('/marine?') ? 'waves' : 'wind');
      if (String(url).includes('/marine?')) for (const key of ['swell_wave_height', 'swell_wave_period', 'swell_wave_direction']) body.hourly[key] = [null, null];
      return Response.json(body);
    }) as typeof fetch;
    const result = await loadSeaOperationForecast(point, { fetcher: request, now });
    expect(result.wind?.speedKnots).toBe(12);
    expect(result.waves).toBeNull();
    expect(result.wavesMessage).toContain('données manquantes');
  });

  it('rejects unknown upstream units while keeping an independent valid marine forecast', async () => {
    const request = vi.fn(async (url) => {
      const body = provider(String(url).includes('/marine?') ? 'waves' : 'wind');
      if (!String(url).includes('/marine?')) body.hourly_units.wind_speed_10m = 'km/h';
      return Response.json(body);
    }) as typeof fetch;
    const result = await loadSeaOperationForecast(point, { fetcher: request, now });
    expect(result.wind).toBeNull();
    expect(result.windMessage).toContain('temporairement');
    expect(result.waves?.heightMeters).toBe(1.2);
  });

  it('does not request past or completely out-of-horizon forecasts', async () => {
    const request = vi.fn() as unknown as typeof fetch;
    expect((await loadSeaOperationForecast({ ...point, eta: '2026-10-19T12:00' }, { fetcher: request, now })).windMessage).toContain('passée');
    expect((await loadSeaOperationForecast({ ...point, eta: '2026-11-20T12:00' }, { fetcher: request, now })).wind).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it('propagates cancellation instead of producing a stale unavailable result', async () => {
    const controller = new AbortController();
    const request = vi.fn(async () => { controller.abort(); return Response.json(provider('wind')); }) as typeof fetch;
    await expect(loadSeaOperationForecast(point, { fetcher: request, now, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
