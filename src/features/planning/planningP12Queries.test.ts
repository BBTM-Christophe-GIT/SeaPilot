import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  deletePlanningAbsence,
  ensurePlanningConflictCase,
  mapPlanningAbsenceRows,
  reviewPlanningAbsence,
  savePlanningAbsence,
  updatePlanningConflictCase,
} from './planningP12Queries';

function rpcClient(result: unknown = 42) {
  const rpc = vi.fn().mockResolvedValue({ data: result, error: null });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe('planning P1.2 absence query contracts', () => {
  it('maps UTC timestamps to Europe/Paris calendar dates', () => {
    const [absence] = mapPlanningAbsenceRows([{
      id: 1, person_id: 2, absence_type: 'leave', starts_at: '2026-10-24T22:30:00Z', ends_at: '2026-10-25T23:30:00Z', reason: 'Congés', status: 'requested', requested_by: 'user', reviewed_by: null, reviewed_at: null, review_comment: null, created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
    }]);
    expect(absence).toMatchObject({ startsOn: '2026-10-25', endsOn: '2026-10-26', reviewedBy: '', reviewComment: '' });
  });

  it('treats an end at local midnight as the exclusive boundary of the previous day', () => {
    const [absence] = mapPlanningAbsenceRows([{
      id: 2, person_id: 2, absence_type: 'leave', starts_at: '2026-08-01T06:00:00Z', ends_at: '2026-08-01T22:00:00Z', reason: 'Congés', status: 'approved', requested_by: 'user', reviewed_by: 'manager', reviewed_at: '2026-07-01T00:00:00Z', review_comment: null, created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
    }]);
    expect(absence).toMatchObject({ startsOn: '2026-08-01', endsOn: '2026-08-01' });
  });

  it('validates a local multi-day absence and sends UTC to the server RPC', async () => {
    const { client, rpc } = rpcClient(5);
    await expect(savePlanningAbsence(client, { personId: 2, absenceType: 'training', startsAt: '2026-10-24T08:00', endsAt: '2026-10-26T18:00', reason: 'Formation sécurité' })).resolves.toBe(5);
    expect(rpc).toHaveBeenCalledWith('save_planning_absence', expect.objectContaining({
      p_person_id: 2,
      p_absence_type: 'training',
      p_starts_at: '2026-10-24T06:00:00.000Z',
      p_ends_at: '2026-10-26T17:00:00.000Z',
    }));
  });

  it('accepts a leave request without an optional reason', async () => {
    const { client, rpc } = rpcClient(6);
    await expect(savePlanningAbsence(client, {
      personId: 2,
      absenceType: 'leave',
      startsAt: '2026-11-02T08:00',
      endsAt: '2026-11-05T18:00',
      reason: '',
    })).resolves.toBe(6);
    expect(rpc).toHaveBeenCalledWith('save_planning_absence', expect.objectContaining({ p_reason: '' }));
  });

  it('rejects incoherent absence dates before any network call', () => {
    const { client, rpc } = rpcClient();
    expect(() => savePlanningAbsence(client, { personId: 2, absenceType: 'leave', startsAt: '2026-08-02T08:00', endsAt: '2026-08-01T18:00', reason: 'Congés' })).toThrow('strictement postérieure');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('makes approval, refusal and cancellation explicit', async () => {
    const { client, rpc } = rpcClient(9);
    await reviewPlanningAbsence(client, 9, 'approve', 'Compatible avec la relève');
    await reviewPlanningAbsence(client, 9, 'reject', 'Effectif insuffisant');
    await reviewPlanningAbsence(client, 9, 'cancel', 'Demande retirée');
    expect(rpc).toHaveBeenNthCalledWith(1, 'review_planning_absence', expect.objectContaining({ p_action: 'approve' }));
    expect(rpc).toHaveBeenNthCalledWith(2, 'review_planning_absence', expect.objectContaining({ p_action: 'reject' }));
    expect(rpc).toHaveBeenNthCalledWith(3, 'review_planning_absence', expect.objectContaining({ p_action: 'cancel' }));
  });

  it('uses the administrator-only RPC to delete any absence request', async () => {
    const { client, rpc } = rpcClient(9);
    await expect(deletePlanningAbsence(client, 9)).resolves.toBe(9);
    expect(rpc).toHaveBeenCalledWith('delete_planning_absence', { p_absence_id: 9 });
  });
});

describe('planning P1.2 conflict treatment contracts', () => {
  const detected = {
    key: 'absence:1:assignment:2', type: 'absence' as const, severity: 'blocking' as const,
    title: 'Absence validée', detail: 'Une affectation est concernée.', personId: 3, vesselId: 4,
    assignmentId: 2, projectId: null, handoverId: null, absenceId: 1,
    startsOn: '2026-08-01', endsOn: '2026-08-04', functionLabel: 'Matelot',
  };

  it('persists a deterministic source link before manual treatment', async () => {
    const { client, rpc } = rpcClient(11);
    await ensurePlanningConflictCase(client, detected);
    expect(rpc).toHaveBeenCalledWith('ensure_planning_conflict_case', expect.objectContaining({
      p_conflict_key: detected.key,
      p_assignment_id: 2,
      p_absence_id: 1,
      p_vessel_id: 4,
    }));
  });

  it('requires a comment for resolution and rejects the retired exception status', async () => {
    const { client, rpc } = rpcClient(11);
    expect(() => updatePlanningConflictCase(client, { caseId: 11, assignToMe: true, priority: 'high', status: 'resolved', comment: '' })).toThrow('commentaire');
    expect(() => updatePlanningConflictCase(client, { caseId: 11, assignToMe: true, priority: 'high', status: 'derogated', comment: 'Accepté' })).toThrow('plus disponible');
    expect(rpc).not.toHaveBeenCalled();
    await updatePlanningConflictCase(client, { caseId: 11, assignToMe: true, priority: 'high', status: 'resolved', comment: 'Traité' });
    expect(rpc).toHaveBeenCalledWith('update_planning_conflict_case', expect.objectContaining({ p_assign_to_me: true, p_derogation_id: null }));
  });
});
