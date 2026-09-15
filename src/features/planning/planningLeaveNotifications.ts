import type { SupabaseClient } from '@supabase/supabase-js';

export const PLANNING_NOTIFICATIONS_CHANGED = 'planning-notifications:changed';

export interface PlanningLeaveNotification {
  id: number;
  absenceId: number;
  title: string;
  body: string;
  createdAt: string;
}

export async function fetchPlanningLeaveNotifications(client: SupabaseClient): Promise<PlanningLeaveNotification[]> {
  const { data, error } = await client.from('planning_notifications')
    .select('id,entity_id,title,body,created_at')
    .eq('notification_type', 'absence')
    .eq('entity_kind', 'absence_decision')
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data || []).map((row) => ({
    id: Number(row.id), absenceId: Number(row.entity_id),
    title: String(row.title || ''), body: String(row.body || ''), createdAt: String(row.created_at || ''),
  }));
}

export async function markPlanningLeaveNotificationRead(client: SupabaseClient, notificationId: number): Promise<void> {
  const { error } = await client.rpc('mark_planning_notification_read', { p_notification_id: notificationId, p_read: true });
  if (error) throw error;
  window.dispatchEvent(new Event(PLANNING_NOTIFICATIONS_CHANGED));
}
