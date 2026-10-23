// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import gateway, { createSeaOperationWeatherObservationsGateway } from '../../../api/sea-operation-weather-observations';
import type { ObservationResult } from './seaOperationWeatherObservationsModel';

const now = Date.parse('2026-10-23T09:30:00Z');
const job = { operationId: 'aa630000-0000-0000-0000-000000000001', leaseId: 'aa630000-0000-0000-0000-000000000002',
  pointId: 'wp-1', latitude: 49.65, longitude: -1.62, etaUtc: '2026-10-22T10:00:00.000Z' };
const observation = (point: Pick<typeof job, 'pointId' | 'latitude' | 'longitude' | 'etaUtc'> = job): ObservationResult => ({ pointId: point.pointId, latitude: point.latitude, longitude: point.longitude,
  etaUtc: point.etaUtc, recordedAt: new Date(now).toISOString(), wind: null, waves: null, status: 'pending', message: 'Mesures non encore publiées.' });
const request = (headers: Record<string, string> = { authorization: 'Bearer cron-test-secret' }, method = 'GET') =>
  new Request('https://app.example/api/sea-operation-weather-observations?pointId=ignored', { method, headers });
function fixture(options: { jobs?: unknown; secret?: string; time?: () => number } = {}) {
  const claim = vi.fn().mockResolvedValue(options.jobs ?? [job]);
  const complete = vi.fn().mockResolvedValue(true);
  const backend = vi.fn(() => ({ claim, complete }));
  const load = vi.fn().mockResolvedValue(observation());
  const handler = createSeaOperationWeatherObservationsGateway({ getEnv: () => options.secret ?? 'cron-test-secret', backend, load, now: options.time ?? (() => now) });
  return { handler, claim, complete, backend, load };
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('server-only official weather observation collection', () => {
  it('requires GET and the exact cron secret before accessing the queue or providers', async () => {
    const f = fixture();
    const authenticationCases: Record<string, string>[] = [{}, { authorization: 'Bearer real-captain-jwt' }, { authorization: 'Bearer cron-test-secreu' }];
    for (const headers of authenticationCases) {
      expect((await f.handler(request(headers))).status).toBe(401);
    }
    expect((await f.handler(request(undefined, 'POST'))).status).toBe(405);
    expect(f.backend).not.toHaveBeenCalled();
    expect(f.load).not.toHaveBeenCalled();
  });
  it('fails closed if the server secret is absent, including preview URLs', async () => {
    const f = fixture({ secret: '' });
    expect((await f.handler(request())).status).toBe(503);
    expect(f.backend).not.toHaveBeenCalled();
    vi.stubEnv('CRON_SECRET', '');
    expect((await gateway.fetch(request())).status).toBe(503);
  });
  it('uses only claimed signed waypoint identities and completes the current lease', async () => {
    const f = fixture();
    const response = await f.handler(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(f.claim).toHaveBeenCalledWith(40);
    expect(f.load).toHaveBeenCalledWith({ pointId: job.pointId, latitude: job.latitude, longitude: job.longitude, etaUtc: job.etaUtc }, expect.objectContaining({ now, signal: expect.any(AbortSignal) }));
    expect(f.load.mock.calls[0][0]).not.toHaveProperty('leaseId');
    expect(f.load.mock.calls[0][0]).not.toHaveProperty('operationId');
    expect(f.complete).toHaveBeenCalledWith(job, observation());
    expect(await response.json()).toMatchObject({ claimed: 1, pending: 1, failed: 0, stale: 0 });
  });
  it('does not accept oversized or malformed queue responses', async () => {
    for (const jobs of [{}, Array.from({ length: 41 }, () => job), [{ ...job, leaseId: 'forged' }], [{ ...job, latitude: 91 }]]) {
      const f = fixture({ jobs });
      expect((await f.handler(request())).status).toBe(502);
      expect(f.load).not.toHaveBeenCalled();
      expect(f.complete).not.toHaveBeenCalled();
    }
  });
  it('retries provider failures without inventing measurements or exposing upstream details', async () => {
    const f = fixture();
    f.load.mockRejectedValue(new Error('private upstream credentials should never leak'));
    const response = await f.handler(request());
    expect(await response.json()).toMatchObject({ pending: 1, failed: 1 });
    const stored = f.complete.mock.calls[0][1] as ObservationResult;
    expect(stored).toMatchObject({ wind: null, waves: null, status: 'pending' });
    expect(stored.message).not.toContain('credentials');
  });
  it('rejects a response for a different point, time, coordinates or malformed source', async () => {
    for (const patch of [{ pointId: 'different' }, { etaUtc: '2026-10-22T11:00:00Z' }, { latitude: 49.7 }, { recordedAt: 'not-a-date' }]) {
      const f = fixture();
      f.load.mockResolvedValue({ ...observation(), ...patch });
      await f.handler(request());
      expect(f.complete.mock.calls[0][1]).toMatchObject({ pointId: job.pointId, etaUtc: job.etaUtc, status: 'pending', wind: null, waves: null });
      expect(f.complete.mock.calls[0][1].message).toContain('temporairement indisponibles');
    }
  });
  it('counts obsolete leases separately and does not overwrite them', async () => {
    const f = fixture();
    f.complete.mockResolvedValue(false);
    expect(await (await f.handler(request())).json()).toMatchObject({ stale: 1, pending: 0 });
    expect(f.complete).toHaveBeenCalledTimes(1);
  });
  it('stores an official measured component with its source and station instead of a model forecast', async () => {
    const f = fixture();
    const measured: ObservationResult = { ...observation(), status: 'recorded', wind: {
      observedAt: job.etaUtc, speedKnots: 12, directionDegrees: 245, instrumentHeightMeters: null,
      station: { id: 'buoy-1', name: 'Official buoy', latitude: job.latitude, longitude: job.longitude, distanceKm: 0 },
      source: { provider: 'Météo-France', sourceUrl: 'https://www.data.gouv.fr/datasets/archives-annuelles-des-observations-bouees',
        license: 'Licence Ouverte 2.0', licenseUrl: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/', quality: 'not_provided' },
    } };
    f.load.mockResolvedValue(measured);
    expect(await (await f.handler(request())).json()).toMatchObject({ recorded: 1, failed: 0 });
    expect(f.complete).toHaveBeenCalledWith(job, measured);
  });
  it('continues after a persistence failure and defers jobs once the wall-clock budget is exhausted', async () => {
    const next = { ...job, pointId: 'wp-2' };
    const f = fixture({ jobs: [job, next] });
    f.load.mockImplementation(async (point) => observation(point));
    f.complete.mockRejectedValueOnce(new Error('database unavailable'));
    expect(await (await f.handler(request())).json()).toMatchObject({ failed: 1, pending: 1 });
    let checks = 0;
    const timed = fixture({ jobs: [job, next], time: () => now + (checks++ > 0 ? 45_000 : 0) });
    expect(await (await timed.handler(request())).json()).toMatchObject({ deferred: 2 });
    expect(timed.load).not.toHaveBeenCalled();
  });
  it('bounds concurrent provider work to two requests across the whole batch', async () => {
    const jobs = Array.from({ length: 5 }, (_, index) => ({ ...job, pointId: `wp-${index}` }));
    const f = fixture({ jobs });
    let running = 0; let maximum = 0;
    f.load.mockImplementation(async (point) => {
      running++; maximum = Math.max(maximum, running);
      await new Promise((resolve) => setTimeout(resolve, 1)); running--;
      return observation(point);
    });
    expect(await (await f.handler(request())).json()).toMatchObject({ pending: 5, failed: 0 });
    expect(maximum).toBe(2);
  });
});
