import { createClient } from '@supabase/supabase-js';
import { loadSeaOperationForecast, validateSeaOperationWeatherInput, type SeaOperationWaypointWeather } from '../src/features/seaOperations/seaOperationWeatherModel';

type Json = Record<string, unknown>;
interface Backend { user: () => Promise<string | null>; authorize: (projectId: string) => Promise<void> }
interface Dependencies { getEnv: (name: string) => string | undefined; backend: (jwt: string) => Backend; fetcher?: typeof fetch; now?: () => number }
const HEADERS = { 'Cache-Control': 'private, no-store', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
class WeatherError extends Error {
  status: number;
  constructor(status: number, code: string) { super(code); this.status = status; }
}

/** Per-instance limits bound cost; no caller may supply provider hosts or API credentials. */
export function createSeaOperationWeatherGateway(deps: Dependencies) {
  const now = deps.now ?? Date.now;
  const cache = new Map<string, { expires: number; result: SeaOperationWaypointWeather }>();
  const users = new Map<string, { expires: number; count: number }>();
  let running = 0;
  return async (request: Request): Promise<Response> => {
    const response = (value: unknown, status = 200) => Response.json(value, { status, headers: HEADERS });
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...HEADERS, Allow: 'POST' } });
    try {
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new WeatherError(403, 'WEATHER_ACCESS_DENIED');
      const jwt = /^Bearer ([^\s]{1,16384})$/.exec(request.headers.get('authorization') || '')?.[1];
      if (!jwt) throw new WeatherError(401, 'WEATHER_AUTHENTICATION_REQUIRED');
      if (!/^(application\/json)(;|$)/i.test(request.headers.get('content-type') || '')) throw new WeatherError(400, 'WEATHER_INVALID_REQUEST');
      if (Number(request.headers.get('content-length')) > 4096) throw new WeatherError(413, 'WEATHER_INVALID_REQUEST');
      const text = await request.text();
      if (text.length > 4096) throw new WeatherError(413, 'WEATHER_INVALID_REQUEST');
      let point;
      try { point = validateSeaOperationWeatherInput(JSON.parse(text)); } catch { throw new WeatherError(400, 'WEATHER_INVALID_REQUEST'); }
      const backend = deps.backend(jwt);
      const userId = await backend.user();
      if (!userId) throw new WeatherError(401, 'WEATHER_AUTHENTICATION_REQUIRED');
      await backend.authorize(point.projectId);
      const key = deps.getEnv('OPEN_METEO_API_KEY')?.trim();
      if (!key) throw new WeatherError(503, 'WEATHER_NOT_CONFIGURED');
      for (const [id, entry] of users) if (entry.expires <= now()) users.delete(id);
      const rate = users.get(userId) ?? { expires: now() + 60_000, count: 0 };
      if (rate.count++ >= 30) throw new WeatherError(429, 'WEATHER_RATE_LIMIT');
      users.set(userId, rate);
      if (users.size > 512) users.delete(users.keys().next().value!);
      const cacheKey = `${point.latitude},${point.longitude},${point.eta}`;
      for (const [id, entry] of cache) if (entry.expires <= now()) cache.delete(id);
      const cached = cache.get(cacheKey);
      if (cached) return response({ ...cached.result, pointId: point.pointId });
      if (running >= 4) throw new WeatherError(503, 'WEATHER_BUSY');
      running += 1;
      let result: SeaOperationWaypointWeather;
      try { result = await loadSeaOperationForecast(point, { key, fetcher: deps.fetcher, now: now(), signal: request.signal }); }
      finally { running -= 1; }
      if (result.wind || result.waves) {
        cache.set(cacheKey, { expires: Math.min(now() + 15 * 60_000, Date.parse(result.etaUtc)), result });
        if (cache.size > 128) cache.delete(cache.keys().next().value!);
      }
      return response(result);
    } catch (error) {
      return response({ error: error instanceof WeatherError ? error.message : 'WEATHER_SERVICE_UNAVAILABLE' }, error instanceof WeatherError ? error.status : 502);
    }
  };
}

const handler = createSeaOperationWeatherGateway({ getEnv: (name) => process.env[name], backend: (jwt) => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new WeatherError(503, 'WEATHER_AUTH_NOT_CONFIGURED');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${jwt}` } } });
  return {
    user: async () => {
      const result = await fetch(`${url.replace(/\/+$/, '')}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${jwt}` },
        redirect: 'error', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(10_000) });
      if (!result.ok) return null;
      const user = await result.json() as Json;
      return typeof user.id === 'string' && /^[a-f0-9-]{36}$/i.test(user.id) ? user.id : null;
    },
    authorize: async (projectId) => {
      const result = await client.rpc('sea_operation_project_documents', { p_project_id: projectId }).abortSignal(AbortSignal.timeout(10_000));
      if (result.error) throw new WeatherError(result.error.code === '42501' ? 403 : 502, result.error.code === '42501' ? 'WEATHER_ACCESS_DENIED' : 'WEATHER_SERVICE_UNAVAILABLE');
      if (!Array.isArray(result.data)) throw new WeatherError(403, 'WEATHER_ACCESS_DENIED');
    },
  };
} });
export const config = { maxDuration: 45 };
export default { fetch: handler };
