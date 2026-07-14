import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  markPlanningNotificationRead,
  mapPlanningDependencies,
  mapPlanningNotifications,
  mapPlanningWorkRestPolicies,
  refreshPlanningNotifications,
  savePlanningDependency,
  savePlanningWorkRestPolicy,
} from './planningP13Queries';

function rpcClient(result: unknown = 12) {
  const rpc = vi.fn().mockResolvedValue({ data: result, error: null });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe('Planning P1.3 query contracts', () => {
  it('maps numeric Postgres policy fields without adding default thresholds', () => {
    const [policy] = mapPlanningWorkRestPolicies([{
      id: 1, name: 'Interne', scope: 'company', vessel_id: null, effective_from: '2026-01-01', effective_to: null,
      max_work_24h: '13.5', min_rest_24h: '10.5', max_work_7d: '78', min_rest_7d: '90',
      min_consecutive_rest_hours: '6', max_rest_periods_24h: 2, night_starts_at: '22:00:00', night_ends_at: '06:00:00',
      max_night_work_24h: '8', include_handover: true, active: true, notes: null, updated_at: '2026-07-14T00:00:00Z',
    }]);
    expect(policy).toMatchObject({ maxWork24h: 13.5, minRest24h: 10.5, nightStartsAt: '22:00', notes: '' });
  });

  it('validates every administrator-supplied threshold before the policy RPC', async () => {
    const { client, rpc } = rpcClient(7);
    await savePlanningWorkRestPolicy(client, {
      name: 'Politique compagnie', scope: 'company', vesselId: null, effectiveFrom: '2026-08-01', effectiveTo: '',
      maxWork24h: 13, minRest24h: 11, maxWork7d: 72, minRest7d: 96, minConsecutiveRestHours: 6,
      maxRestPeriods24h: 2, nightStartsAt: '22:00', nightEndsAt: '06:00', maxNightWork24h: 8,
      includeHandover: true, active: true, notes: 'Seuils validés par la direction',
    });
    expect(rpc).toHaveBeenCalledWith('save_planning_work_rest_policy', expect.objectContaining({
      p_max_work_24h: 13, p_min_rest_7d: 96, p_night_starts_at: '22:00', p_include_handover: true,
    }));
    expect(() => savePlanningWorkRestPolicy(client, {
      name: 'Invalide', scope: 'company', vesselId: null, effectiveFrom: '2026-08-01', effectiveTo: '',
      maxWork24h: 25, minRest24h: 11, maxWork7d: 72, minRest7d: 96, minConsecutiveRestHours: 6,
      maxRestPeriods24h: 2, nightStartsAt: '22:00', nightEndsAt: '06:00', maxNightWork24h: 8,
      includeHandover: true, active: true, notes: '',
    })).toThrow('entre 0 et 24');
  });

  it('keeps notification refresh and read receipts server-authorized', async () => {
    const { client, rpc } = rpcClient(3);
    await refreshPlanningNotifications(client, '2026-08-01');
    await markPlanningNotificationRead(client, 42, true);
    expect(rpc).toHaveBeenNthCalledWith(1, 'refresh_planning_notifications', { p_reference_date: '2026-08-01' });
    expect(rpc).toHaveBeenNthCalledWith(2, 'mark_planning_notification_read', { p_notification_id: 42, p_read: true });
  });

  it('maps recipient state and typed dependencies', () => {
    expect(mapPlanningNotifications([{
      id: 2, notification_type: 'vacant_position', severity: 'critical', title: 'Poste vacant', body: 'Capitaine',
      entity_kind: 'conflict_case', entity_id: 3, person_id: null, vessel_id: 4, due_on: '2026-08-01',
      created_at: '2026-07-14T00:00:00Z', read_at: null,
    }])[0]).toMatchObject({ notificationType: 'vacant_position', readAt: '', vesselId: 4 });
    expect(mapPlanningDependencies([{
      id: 5, dependency_type: 'training_assignment', predecessor_kind: 'absence', predecessor_id: 6,
      successor_kind: 'assignment', successor_id: 7, lag_minutes: 120, vessel_id: 4, person_id: 8,
      notes: null, active: true, created_at: '', updated_at: '',
    }])[0]).toMatchObject({ dependencyType: 'training_assignment', lagMinutes: 120, notes: '' });
  });

  it('rejects self-dependencies and sends valid source/target links to the RPC', async () => {
    const { client, rpc } = rpcClient(9);
    expect(() => savePlanningDependency(client, {
      dependencyType: 'operation_sequence', predecessorKind: 'project', predecessorId: 1,
      successorKind: 'project', successorId: 1, lagMinutes: 0, notes: '', active: true,
    })).toThrow('lui-même');
    await savePlanningDependency(client, {
      dependencyType: 'delivery_operation', predecessorKind: 'project', predecessorId: 1,
      successorKind: 'project', successorId: 2, lagMinutes: 60, notes: 'Livraison préalable', active: true,
    });
    expect(rpc).toHaveBeenCalledWith('save_planning_dependency', expect.objectContaining({ p_predecessor_id: 1, p_successor_id: 2, p_lag_minutes: 60 }));
  });
});
