// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createPlanningCalendarHandler } from './handler.ts';
import type { PlanningCalendarFeed } from './ics.ts';

const token = 'a'.repeat(64);
const feedUrl = `https://example.supabase.co/functions/v1/planning-calendar/${token}/planning.ics`;
const feed: PlanningCalendarFeed = {
  calendar_name: 'SeaPilot — Mon planning',
  published_at: '2026-10-11T08:00:00Z',
  revision: 2,
  events: [{ uid: 'stable-date-id@seapilot', start_date: '2026-10-12', end_date: '2026-10-13', summary: 'Repos', status: 'confirmed' }],
};

describe('personal planning read-only feed handler', () => {
  it('hashes the capability before fetching the feed and serves an uncached calendar download', async () => {
    const getFeed = vi.fn().mockResolvedValue(feed);
    const response = await createPlanningCalendarHandler({ getFeed })(new Request(feedUrl));
    expect(response.status).toBe(200);
    expect(getFeed).toHaveBeenCalledExactlyOnceWith(createHash('sha256').update(token).digest('hex'));
    expect(response.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="planning.ics"');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    const content = await response.text();
    expect(content).toContain('BEGIN:VCALENDAR\r\n');
    expect(content).not.toContain(token);
  });

  it('accepts the local gateway path as well as the Supabase Cloud path', async () => {
    const getFeed = vi.fn().mockResolvedValue(feed);
    const response = await createPlanningCalendarHandler({ getFeed })(new Request(`http://127.0.0.1:54321/planning-calendar/${token}/planning.ics`));
    expect(response.status).toBe(200);
    expect(getFeed).toHaveBeenCalledOnce();
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('blocks %s without consulting the database', async (method) => {
    const getFeed = vi.fn();
    const response = await createPlanningCalendarHandler({ getFeed })(new Request(feedUrl, { method }));
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, OPTIONS');
    expect(getFeed).not.toHaveBeenCalled();
  });

  it('allows browser preflight without consulting the database', async () => {
    const getFeed = vi.fn();
    const response = await createPlanningCalendarHandler({ getFeed })(new Request(feedUrl, { method: 'OPTIONS' }));
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS');
    expect(getFeed).not.toHaveBeenCalled();
  });

  it.each([
    'https://example.supabase.co/functions/v1/planning-calendar/planning.ics?token=secret',
    'https://example.supabase.co/functions/v1/planning-calendar/short-token/planning.ics',
    `https://example.supabase.co/functions/v1/other/${token}/planning.ics`,
  ])('rejects malformed capability paths before querying the database', async (url) => {
    const getFeed = vi.fn();
    const response = await createPlanningCalendarHandler({ getFeed })(new Request(url));
    expect(response.status).toBe(404);
    expect(getFeed).not.toHaveBeenCalled();
  });

  it('returns the same unavailable response for a revoked token without leaking it', async () => {
    const getFeed = vi.fn().mockResolvedValue(null);
    const response = await createPlanningCalendarHandler({ getFeed })(new Request(feedUrl));
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Calendrier indisponible.');
  });

  it('hides database failures and malformed payloads without logging sensitive values', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warningLog = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      for (const getFeed of [
        vi.fn().mockRejectedValue(new Error(`RPC error: private user ${token}`)),
        vi.fn().mockResolvedValue({ ...feed, published_at: null }),
      ]) {
        const response = await createPlanningCalendarHandler({ getFeed })(new Request(feedUrl));
        expect(response.status).toBe(503);
        expect(await response.text()).toBe('Service temporairement indisponible.');
      }
      expect(errorLog).not.toHaveBeenCalled();
      expect(warningLog).not.toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
      warningLog.mockRestore();
    }
  });
});
