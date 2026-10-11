import { serializePlanningCalendar } from './ics.ts';
import type { PlanningCalendarFeed } from './ics.ts';

export interface PlanningCalendarDependencies {
  /** Only the SHA-256 digest is sent to the service-only database RPC. */
  getFeed: (tokenHash: string) => Promise<PlanningCalendarFeed | null>;
}

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

function unavailable(status: number): Response {
  return new Response(status === 404 ? 'Calendrier indisponible.' : 'Service temporairement indisponible.', {
    status,
    headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export function createPlanningCalendarHandler(dependencies: PlanningCalendarDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET') {
      return new Response('Méthode non autorisée.', { status: 405, headers: { ...headers, Allow: 'GET, OPTIONS' } });
    }

    // Supabase Cloud and the local gateway use these two equivalent path prefixes.
    const match = /^\/(?:functions\/v1\/)?planning-calendar\/([a-f0-9]{64})\/planning\.ics$/.exec(new URL(request.url).pathname);
    if (!match) return unavailable(404);

    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(match[1]));
      const tokenHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      const feed = await dependencies.getFeed(tokenHash);
      if (!feed) return unavailable(404);
      return new Response(serializePlanningCalendar(feed), {
        headers: {
          ...headers,
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': 'attachment; filename="planning.ics"',
        },
      });
    } catch {
      // Do not log request URLs, capability tokens, RPC errors or personal planning.
      return unavailable(503);
    }
  };
}
