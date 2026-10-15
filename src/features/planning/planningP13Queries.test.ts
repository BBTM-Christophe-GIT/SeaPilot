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
  filterPlanningWorkingTimeNotifications,
} from './planningP13Queries';

function rpcClient(result: unknown = 12) {
  const rpc = vi.fn().mockResolvedValue({ data: result, error: null });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe('Planning P1.3 query contracts', () => {
  it('filters obsolete work-time notifications using one current coverage batch and leaves stored history untouched', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: 900, person_id: 10, vessel_id: 7,
      local_window_end_date: '2026-10-14', timezone_name: 'Europe/Paris', violation_codes: ['assignment_coverage'],
      coverage_starts_at: '2026-10-13T22:00:00Z', coverage_ends_at: '2026-10-14T22:00:00Z',
    }], error: null });
    const base = { notification_type: 'working_time_non_compliance' as const, severity: 'warning' as const,
      title: 'Repos insuffisant', body: 'Ancien calcul brut', entity_kind: 'working_time_calculation', entity_id: 1,
      person_id: 10, vessel_id: 7, created_at: '2026-10-14T12:00:00Z', read_at: null };
    const rows = [{ ...base, id: 1, due_on: '2026-10-13' }, { ...base, id: 2, due_on: '2026-10-14' },
      { ...base, id: 3, due_on: '2026-10-14' }];
    const result = await filterPlanningWorkingTimeNotifications({ rpc } as unknown as SupabaseClient, rows);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 2, title: 'Couverture de l’affectation interrompue' });
    expect(rows[1].body).toBe('Ancien calcul brut');
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('working_time_coverage_alerts', { p_starts_on: '2026-10-13', p_ends_on: '2026-10-14', p_person_ids: [10] });
  });

  it('does not request working-time analysis when notifications contain only other business events', async () => {
    const { client, rpc } = rpcClient([]);
    const rows = [{ id: 2, notification_type: 'vacant_position' as const, severity: 'critical' as const,
      title: 'Poste vacant', body: 'Capitaine', entity_kind: 'conflict_case', entity_id: 3,
      person_id: null, vessel_id: 4, due_on: '2026-08-01', created_at: '2026-07-14T00:00:00Z', read_at: null }];
    expect(await filterPlanningWorkingTimeNotifications(client, rows)).toEqual(rows);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('maps numeric Postgres policy fields without adding default thresholds', () => {
    const [policy] = mapPlanningWorkRestPolicies([{
      id: 1, name: 'Interne', scope: 'company', vessel_id: null, effective_from: '2026-01-01', effective_to: null,
      max_work_24h: '13.5', min_rest_24h: '10.5', max_work_7d: '78', min_rest_7d: '90',
      min_consecutive_rest_hours: '6', max_rest_periods_24h: 2, night_starts_at: '22:00:00', night_ends_at: '06:00:00',
      max_night_work_24h: '8', include_handover: true, active: true, notes: null, updated_at: '2026-07-14T00:00:00Z',
      max_amplitude_hours: '13.25', max_interval_between_rests_hours: '12.5',
    }]);
    expect(policy).toMatchObject({ maxWork24h: 13.5, minRest24h: 10.5, nightStartsAt: '22:00', notes: '', maxAmplitudeHours: 13.25, maxIntervalBetweenRestsHours: 12.5 });
  });

  it('validates every administrator-supplied threshold before the policy RPC', async () => {
    const { client, rpc } = rpcClient(7);
    await savePlanningWorkRestPolicy(client, {
      name: 'Politique compagnie', scope: 'company', vesselId: null, effectiveFrom: '2026-08-01', effectiveTo: '',
      maxWork24h: 13, minRest24h: 11, maxWork7d: 72, minRest7d: 96, minConsecutiveRestHours: 6,
      maxRestPeriods24h: 2, nightStartsAt: '22:00', nightEndsAt: '06:00', maxNightWork24h: 8,
      maxAmplitudeHours: 13.25, maxIntervalBetweenRestsHours: 12.5,
      includeHandover: true, active: true, notes: 'Seuils validés par la direction',
    });
    expect(rpc).toHaveBeenCalledWith('save_planning_work_rest_policy', expect.objectContaining({
      p_max_work_24h: 13, p_min_rest_7d: 96, p_night_starts_at: '22:00', p_include_handover: true,
      p_max_amplitude_hours: 13.25, p_max_interval_between_rests_hours: 12.5,
    }));
    expect(() => savePlanningWorkRestPolicy(client, {
      name: 'Invalide', scope: 'company', vesselId: null, effectiveFrom: '2026-08-01', effectiveTo: '',
      maxWork24h: 25, minRest24h: 11, maxWork7d: 72, minRest7d: 96, minConsecutiveRestHours: 6,
      maxRestPeriods24h: 2, nightStartsAt: '22:00', nightEndsAt: '06:00', maxNightWork24h: 8,
      includeHandover: true, active: true, notes: '',
    })).toThrow('entre 0 et 24');
  });

  it.each(['maxAmplitudeHours', 'maxIntervalBetweenRestsHours'] as const)('rejects an invalid %s before writing a policy', (field) => {
    const { client, rpc } = rpcClient();
    expect(() => savePlanningWorkRestPolicy(client, {
      name: 'Seuil invalide', scope: 'company', vesselId: null, effectiveFrom: '2026-08-01', effectiveTo: '',
      maxWork24h: 12, minRest24h: 10, maxWork7d: 84, minRest7d: 52, minConsecutiveRestHours: 6,
      maxRestPeriods24h: 6, nightStartsAt: '20:00', nightEndsAt: '06:00', maxNightWork24h: 10,
      maxAmplitudeHours: 14, maxIntervalBetweenRestsHours: 14,
      includeHandover: true, active: true, notes: '', [field]: 25,
    })).toThrow('entre 0 et 24');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('keeps notification refresh and read receipts server-authorized', async () => {
    const { client, rpc } = rpcClient(3);
    await refreshPlanningNotifications(client, '2026-08-01');
    await markPlanningNotificationRead(client, 42, true);
    expect(rpc).toHaveBeenNthCalledWith(1, 'refresh_planning_notifications', { p_reference_date: '2026-08-01' });
    expect(rpc).toHaveBeenNthCalledWith(2, 'refresh_working_time_notifications', { p_reference_date: '2026-08-01' });
    expect(rpc).toHaveBeenNthCalledWith(3, 'mark_planning_notification_read', { p_notification_id: 42, p_read: true });
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
