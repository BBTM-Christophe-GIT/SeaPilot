import { createClient } from '@supabase/supabase-js';
import { findShomCharts } from '../server/seaOperationShomCharts.js';

export interface ChartInput { projectId: string; pointId: string; latitude: number; longitude: number }
interface Backend { user: () => Promise<string | null>; authorize: (projectId: string) => Promise<void> }
interface Dependencies { getEnv: (name: string) => string | undefined; backend: (jwt: string) => Backend; lookup?: typeof findShomCharts; now?: () => number }
const HEADERS = { 'Cache-Control': 'private, no-store', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff' };
class ChartError extends Error {
  status: number;
  constructor(status: number, code: string) { super(code); this.status = status; }
}

async function requestBody(request: Request): Promise<unknown> {
  if (!request.body) throw new ChartError(400, 'CHARTS_INVALID_REQUEST');
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let body = '';
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new ChartError(413, 'CHARTS_INVALID_REQUEST'); }
      body += decoder.decode(part.value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body);
  } catch (error) {
    if (error instanceof ChartError) throw error;
    throw new ChartError(400, 'CHARTS_INVALID_REQUEST');
  } finally { reader.releaseLock(); }
}

export function validateChartInput(value: unknown): ChartInput {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (typeof input.projectId !== 'string' || !/^[1-9][0-9]{0,18}$/.test(input.projectId) || BigInt(input.projectId) > 9223372036854775807n
    || typeof input.pointId !== 'string' || !/^[a-zA-Z0-9._:-]{1,100}$/.test(input.pointId)
    || typeof input.latitude !== 'number' || !Number.isFinite(input.latitude) || Math.abs(input.latitude) > 90
    || typeof input.longitude !== 'number' || !Number.isFinite(input.longitude) || Math.abs(input.longitude) > 180) throw new ChartError(400, 'CHARTS_INVALID_REQUEST');
  return { projectId: input.projectId, pointId: input.pointId, latitude: input.latitude, longitude: input.longitude };
}

export function createSeaOperationChartsGateway(deps: Dependencies) {
  const rates = new Map<string, { expires: number; count: number }>();
  const now = deps.now ?? Date.now;
  let running = 0;
  return async (request: Request): Promise<Response> => {
    const response = (value: unknown, status = 200) => Response.json(value, { status, headers: HEADERS });
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...HEADERS, Allow: 'POST' } });
    try {
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new ChartError(403, 'CHARTS_ACCESS_DENIED');
      const demo = deps.getEnv('VERCEL_ENV') === 'preview' && new URL(request.url).searchParams.get('preview') === '1';
      const jwt = /^Bearer ([^\s]{1,16384})$/.exec(request.headers.get('authorization') || '')?.[1];
      if (!jwt && !demo) throw new ChartError(401, 'CHARTS_AUTHENTICATION_REQUIRED');
      if (!/^application\/json(;|$)/i.test(request.headers.get('content-type') || '')) throw new ChartError(400, 'CHARTS_INVALID_REQUEST');
      if (Number(request.headers.get('content-length')) > 4096) throw new ChartError(413, 'CHARTS_INVALID_REQUEST');
      const body = await requestBody(request);
      let input: ChartInput;
      try { input = validateChartInput(body); } catch { throw new ChartError(400, 'CHARTS_INVALID_REQUEST'); }
      let userId = 'public-preview';
      if (!demo) {
        const backend = deps.backend(jwt!);
        const actor = await backend.user();
        if (!actor) throw new ChartError(401, 'CHARTS_AUTHENTICATION_REQUIRED');
        userId = actor;
        await backend.authorize(input.projectId);
      }
      for (const [key, rate] of rates) if (rate.expires <= now()) rates.delete(key);
      const rate = rates.get(userId) ?? { count: 0, expires: now() + 60_000 };
      if (rate.count++ >= 30) throw new ChartError(429, 'CHARTS_RATE_LIMIT');
      rates.set(userId, rate);
      if (rates.size > 512) rates.delete(rates.keys().next().value!);
      if (running >= 4) throw new ChartError(503, 'CHARTS_BUSY');
      running += 1;
      try {
        const result = await (deps.lookup ?? findShomCharts)({ latitude: input.latitude, longitude: input.longitude }, { signal: request.signal });
        return response({ ...input, ...result });
      } finally { running -= 1; }
    } catch (error) {
      return response({ error: error instanceof ChartError ? error.message : 'CHARTS_SERVICE_UNAVAILABLE' }, error instanceof ChartError ? error.status : 502);
    }
  };
}

const handler = createSeaOperationChartsGateway({ getEnv: (name) => process.env[name], backend: (jwt) => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new ChartError(503, 'CHARTS_AUTH_NOT_CONFIGURED');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${jwt}` } } });
  return {
    user: async () => {
      const response = await fetch(`${url.replace(/\/+$/, '')}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${jwt}` }, redirect: 'error', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return null;
      const user = await response.json() as Record<string, unknown>;
      return typeof user.id === 'string' && /^[a-f0-9-]{36}$/i.test(user.id) ? user.id : null;
    },
    authorize: async (projectId) => {
      const result = await client.rpc('sea_operation_project_documents', { p_project_id: projectId }).abortSignal(AbortSignal.timeout(10_000));
      if (result.error || !Array.isArray(result.data)) throw new ChartError(result.error?.code === '42501' ? 403 : 502, result.error?.code === '42501' ? 'CHARTS_ACCESS_DENIED' : 'CHARTS_SERVICE_UNAVAILABLE');
    },
  };
} });
export const config = { maxDuration: 60 };
export default { fetch: handler };
