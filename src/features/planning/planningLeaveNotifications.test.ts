import { describe, expect, it, vi } from 'vitest';
import { fetchPlanningLeaveNotifications, markPlanningLeaveNotificationRead, PLANNING_NOTIFICATIONS_CHANGED } from './planningLeaveNotifications';

describe('leave decision bell notifications', () => {
  it('loads only unread requester decisions through recipient-scoped RLS', async () => {
    const query = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), order: vi.fn(), limit: vi.fn() };
    for (const method of ['select', 'eq', 'is', 'order'] as const) query[method].mockReturnValue(query);
    query.limit.mockResolvedValue({ data: [{ id: 1, entity_id: 23, title: 'Congés refusés', body: 'Effectif insuffisant', created_at: '2026-09-10T12:00:00Z' }], error: null });
    const client = { from: vi.fn().mockReturnValue(query) };
    expect(await fetchPlanningLeaveNotifications(client as never)).toEqual([{ id: 1, absenceId: 23, title: 'Congés refusés', body: 'Effectif insuffisant', createdAt: '2026-09-10T12:00:00Z' }]);
    expect(query.eq).toHaveBeenCalledWith('notification_type', 'absence');
    expect(query.eq).toHaveBeenCalledWith('entity_kind', 'absence_decision');
    expect(query.is).toHaveBeenCalledWith('read_at', null);
  });

  it('marks a notification read with the protected RPC and refreshes the bell', async () => {
    const changed = vi.fn();
    window.addEventListener(PLANNING_NOTIFICATIONS_CHANGED, changed);
    const client = { rpc: vi.fn().mockResolvedValue({ data: 5, error: null }) };
    try {
      await markPlanningLeaveNotificationRead(client as never, 5);
      expect(client.rpc).toHaveBeenCalledWith('mark_planning_notification_read', { p_notification_id: 5, p_read: true });
      expect(changed).toHaveBeenCalledOnce();
      client.rpc.mockResolvedValue({ data: null, error: new Error('Accès refusé') } as never);
      await expect(markPlanningLeaveNotificationRead(client as never, 6)).rejects.toThrow('Accès refusé');
      expect(changed).toHaveBeenCalledOnce();
    } finally { window.removeEventListener(PLANNING_NOTIFICATIONS_CHANGED, changed); }
  });
});
