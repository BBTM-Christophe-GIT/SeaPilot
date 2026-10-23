import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { isSeaOperationWeatherObservation, isSeaOperationWeatherObservationInput, type ObservationResult, type SeaOperationWeatherObservationInput } from '../src/features/seaOperations/seaOperationWeatherObservationsModel.js';
import { loadSeaOperationWeatherObservations } from '../server/seaOperationWeatherObservations.js';

interface Job extends SeaOperationWeatherObservationInput { operationId: string; leaseId: string }
interface Backend {
  claim: (limit: number) => Promise<unknown>;
  complete: (job: Job, result: ObservationResult) => Promise<boolean>;
}
interface Dependencies {
  getEnv: (name: string) => string | undefined;
  backend: () => Backend;
  load?: typeof loadSeaOperationWeatherObservations;
  now?: () => number;
}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const HEADERS = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
function validJob(value: unknown): value is Job {
  if (!isSeaOperationWeatherObservationInput(value)) return false;
  const row = value as unknown as Record<string, unknown>;
  return typeof row.operationId === 'string' && UUID.test(row.operationId) && typeof row.leaseId === 'string' && UUID.test(row.leaseId);
}
function samePoint(job: Job, value: ObservationResult): boolean {
  return value.pointId === job.pointId && Math.abs(value.latitude - job.latitude) < 1e-8
    && Math.abs(value.longitude - job.longitude) < 1e-8 && Date.parse(value.etaUtc) === Date.parse(job.etaUtc);
}

/** Daily server-only collection. No user or request can choose a waypoint, provider URL or database target. */
export function createSeaOperationWeatherObservationsGateway(deps: Dependencies) {
  const now = deps.now ?? Date.now;
  return async (request: Request): Promise<Response> => {
    const response = (value: unknown, status = 200) => Response.json(value, { status, headers: HEADERS });
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { ...HEADERS, Allow: 'GET' } });
    const expected = deps.getEnv('CRON_SECRET');
    if (!expected) return response({ error: 'WEATHER_OBSERVATIONS_NOT_CONFIGURED' }, 503);
    const token = /^Bearer ([^\s]{1,4096})$/.exec(request.headers.get('authorization') || '')?.[1];
    if (!token || Buffer.byteLength(token) !== Buffer.byteLength(expected)
      || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return response({ error: 'WEATHER_OBSERVATIONS_AUTHENTICATION_REQUIRED' }, 401);
    // Vercel gives this worker 60 seconds; bound both batch size and wall-clock work.
    const deadline = now() + 45_000;
    let backend: Backend;
    let jobs: Job[];
    try {
      backend = deps.backend();
      const claimed = await backend.claim(40);
      if (!Array.isArray(claimed) || claimed.length > 40 || !claimed.every(validJob)) throw new Error('Invalid queue');
      jobs = claimed;
    } catch { return response({ error: 'WEATHER_OBSERVATIONS_QUEUE_UNAVAILABLE' }, 502); }
    const summary = { claimed: jobs.length, recorded: 0, pending: 0, unavailable: 0, failed: 0, stale: 0, deferred: 0 };
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(2, jobs.length) }, async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        if (now() >= deadline || request.signal.aborted) { summary.deferred++; continue; }
        let result: ObservationResult;
        try {
          const point = { pointId: job.pointId, latitude: job.latitude, longitude: job.longitude, etaUtc: job.etaUtc };
          result = await (deps.load ?? loadSeaOperationWeatherObservations)(point, {
            now: now(), signal: AbortSignal.any([request.signal, AbortSignal.timeout(Math.max(1, Math.min(30_000, deadline - now())))]) });
          if (!isSeaOperationWeatherObservation(result) || !samePoint(job, result)) throw new Error('Invalid official observation');
        } catch {
          summary.failed++;
          result = { pointId: job.pointId, latitude: job.latitude, longitude: job.longitude, etaUtc: job.etaUtc,
            recordedAt: new Date(now()).toISOString(), status: 'pending', wind: null, waves: null,
            message: 'Les sources de mesures officielles sont temporairement indisponibles. Une nouvelle tentative est programmée.' };
        }
        try {
          if (await backend.complete(job, result)) summary[result.status]++;
          else summary.stale++;
        } catch { summary.failed++; }
      }
    }));
    return response(summary);
  };
}

const handler = createSeaOperationWeatherObservationsGateway({ getEnv: (name) => process.env[name], backend: () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Observation queue is not configured');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    claim: async (limit) => {
      const { data, error } = await client.rpc('sea_operation_weather_observations_claim', { p_limit: limit }).abortSignal(AbortSignal.timeout(10_000));
      if (error) throw error;
      return data;
    },
    complete: async (job, result) => {
      const { data, error } = await client.rpc('sea_operation_weather_observation_complete', {
        p_operation_id: job.operationId, p_point_id: job.pointId, p_lease_id: job.leaseId, p_result: result,
      }).abortSignal(AbortSignal.timeout(10_000));
      if (error) throw error;
      return data === true;
    },
  };
} });
export const config = { maxDuration: 60 };
export default { fetch: handler };
