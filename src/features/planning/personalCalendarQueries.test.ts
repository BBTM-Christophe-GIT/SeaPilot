import { describe, expect, it, vi } from 'vitest';
import { buildPlanningCalendarUrl, createPlanningCalendarSubscription, fetchPersonalPlanningIcs, fetchPlanningCalendarSubscription, revokePlanningCalendarSubscription } from './personalCalendarQueries';

describe('personal calendar queries', () => {
  it('uses only caller-scoped RPCs, never a supplied person identifier', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { active: true, eligible: true, created_at: null }, error: null });
    const client = { rpc } as never;
    await fetchPlanningCalendarSubscription(client);
    expect(rpc).toHaveBeenLastCalledWith('get_planning_calendar_subscription');
    rpc.mockResolvedValue({ data: { token: 'a'.repeat(64), created_at: '2026-10-11T00:00:00Z' }, error: null });
    expect((await createPlanningCalendarSubscription(client)).url).toMatch(/\/planning-calendar\/a{64}\/planning\.ics$/);
    expect(rpc).toHaveBeenLastCalledWith('create_planning_calendar_subscription');
    await revokePlanningCalendarSubscription(client);
    expect(rpc).toHaveBeenLastCalledWith('revoke_planning_calendar_subscription');
    rpc.mockResolvedValue({ data: { calendar_name: 'Mon planning', published_at: '2026-10-11T08:00:00Z', revision: 2, events: [] }, error: null });
    expect(await fetchPersonalPlanningIcs(client)).toContain('BEGIN:VCALENDAR\r\n');
    expect(rpc).toHaveBeenLastCalledWith('personal_planning_calendar');
  });

  it('builds a capability URL and rejects malformed tokens or insecure remote origins', () => {
    expect(buildPlanningCalendarUrl('b'.repeat(64), 'https://example.supabase.co/')).toBe(`https://example.supabase.co/functions/v1/planning-calendar/${'b'.repeat(64)}/planning.ics`);
    expect(() => buildPlanningCalendarUrl('../someone-else', 'https://example.supabase.co')).toThrow();
    expect(() => buildPlanningCalendarUrl('b'.repeat(64), 'http://example.com')).toThrow();
  });

  it('does not expose database error messages or token content in errors', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'secret details' } }) } as never;
    await expect(createPlanningCalendarSubscription(client)).rejects.toThrow('Impossible de créer');
    await expect(fetchPersonalPlanningIcs(client)).rejects.toThrow('Impossible de télécharger');
  });
});
