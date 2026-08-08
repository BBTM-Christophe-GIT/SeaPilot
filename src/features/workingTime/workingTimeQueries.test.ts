import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  fetchWorkingTimeEntryRecommendation,
  fetchWorkingTimePhasesRecommendation,
  fetchWorkingTimeWorkspace,
  getOrCreateWorkingTimeRegister,
  saveWorkingTimeDayComment,
  saveWorkingTimeInterval,
  saveWorkingTimePhases,
  transitionWorkingTimeRegister,
  workingTimeErrorMessage,
} from './workingTimeQueries';

function queryResult(data: unknown) {
  const result = { data, error: null };
  const query = new Proxy({}, {
    get(_target, property) {
      if (property === 'then') {
        return (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
      }
      return () => query;
    },
  });
  return query;
}

function workspaceClient() {
  const rows: Record<string, unknown[]> = {
    working_time_registers: [{
      id: 10, company_id: 1, person_id: 42, period_kind: 'weekly',
      period_start: '2026-08-03', period_end: '2026-08-09', status: 'draft',
      work_rest_policy_id: 5,
      people: { first_name: 'Alex', last_name: 'MARIN', function_label: 'Matelot' },
    }],
    working_time_intervals: [{
      id: 20, register_id: 10, company_id: 1, person_id: 42,
      local_work_date: '2026-08-03', starts_at: '2026-08-03T06:00:00Z', ends_at: '2026-08-03T14:00:00Z',
      timezone_name: 'Europe/Paris', utc_offset_minutes: 120, vessel_id: 7,
      watch_group: 'Bordée 1', comment: null, author_user_id: 'user', author_person_id: 42,
      source_type: 'manual', source_reference: null, source_record_key: null,
    }],
    working_time_calculation_windows: [{
      id: 30, company_id: 1, person_id: 42, window_end: '2026-08-03T16:00:00Z',
      local_window_end_date: '2026-08-03', timezone_name: 'Europe/Paris', vessel_id: 7,
      work_rest_policy_id: 5, work_24h_seconds: 28800, rest_24h_seconds: 57600,
      longest_rest_24h_seconds: 57600, rest_period_count_24h: 1,
      work_7d_seconds: 28800, rest_7d_seconds: 576000, night_work_24h_seconds: 0,
      is_compliant: false, violation_codes: ['work_24h'], calculation_version: 1,
      calculated_at: '2026-08-03T16:00:01Z',
    }],
    working_time_day_comments: [{
      id: 40, register_id: 10, person_id: 42, local_work_date: '2026-08-03',
      cause_category: 'unexpected_operation', operational_context: 'Opération pont prolongée',
      immediate_action: 'Relève organisée', compensatory_rest_plan: 'Repos le lendemain',
      comment: 'Opération urgente', authored_by: 'captain', authored_by_person_id: 9,
      updated_at: '2026-08-03T17:00:00Z',
    }],
    working_time_profile_signatures: [{
      id: 50, person_id: 42, version_number: 2, storage_bucket: 'working-time-signatures',
      storage_path: '1/42/signature.png', mime_type: 'image/png', file_size_bytes: 1234,
      sha256: 'a'.repeat(64), valid_from: '2026-01-01T00:00:00Z',
    }],
    working_time_validations: [{
      id: 60, register_id: 10, event_type: 'sailor_signed', previous_status: 'awaiting_sailor_signature', new_status: 'submitted',
      actor_identity_snapshot: { first_name: 'Alex', last_name: 'MARIN', roles: ['marin'] },
      signature_snapshot: { signature_id: 50, signer_person_id: 42, signer_name: 'Alex MARIN', signer_roles: ['marin'], signed_at: '2026-08-03T18:00:00Z', version_number: 2, storage_bucket: 'working-time-signatures', storage_path: '1/42/signature.png', mime_type: 'image/png', file_size_bytes: 1234, sha256: 'a'.repeat(64) },
      interval_snapshot: [], non_compliance_snapshot: [], comment: 'Signature explicite', occurred_at: '2026-08-03T18:00:00Z',
    }],
    vessels: [{ id: 7, name: 'Navire Test', acronym: 'NT' }],
  };
  return {
    from: vi.fn((table: string) => queryResult(rows[table] || [])),
    rpc: vi.fn().mockResolvedValue({
      data: {
        current_person_id: 42,
        readable_people: [{ person_id: 42, first_name: 'Alex', last_name: 'MARIN', function_label: 'Matelot', is_self: true }],
        editable_people: [{ person_id: 42, first_name: 'Alex', last_name: 'MARIN', function_label: 'Matelot', is_self: true }],
      },
      error: null,
    }),
  } as unknown as SupabaseClient;
}

describe('working-time workflow queries', () => {
  it('loads and maps all read-only workflow sources in one workspace request', async () => {
    const client = workspaceClient();
    const workspace = await fetchWorkingTimeWorkspace(client, { start: '2026-08-01', end: '2026-08-31' });

    expect(workspace.currentPersonId).toBe(42);
    expect(workspace.readablePeople[0]).toMatchObject({ personId: 42, isSelf: true });
    expect(workspace.editablePeople[0]).toMatchObject({ personId: 42, isSelf: true });
    expect(workspace.registers[0]).toMatchObject({ id: 10, personName: 'Alex MARIN', status: 'draft' });
    expect(workspace.intervals[0]).toMatchObject({ id: 20, timezoneName: 'Europe/Paris' });
    expect(workspace.calculations[0]).toMatchObject({ isCompliant: false, violationCodes: ['work_24h'] });
    expect(workspace.dayComments[0].comment).toBe('Opération urgente');
    expect(workspace.dayComments[0].causeCategory).toBe('unexpected_operation');
    expect(workspace.signatures[0]).toMatchObject({ personId: 42, versionNumber: 2 });
    expect(workspace.validations[0].signatureSnapshot).toMatchObject({ signerName: 'Alex MARIN', versionNumber: 2 });
  });

  it('sends only raw timestamps and interval context to the authoritative RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 20, error: null });
    const client = { rpc } as unknown as SupabaseClient;

    await saveWorkingTimeInterval(client, {
      registerId: 10,
      startsAt: '2026-08-03T06:00:00Z',
      endsAt: '2026-08-03T14:00:00Z',
      timezoneName: 'Europe/Paris',
      vesselId: 7,
      watchGroup: 'Bordée 1',
      comment: 'Quart',
      intervalId: null,
    });

    expect(rpc).toHaveBeenCalledWith('save_working_time_interval', {
      p_register_id: 10,
      p_starts_at: '2026-08-03T06:00:00Z',
      p_ends_at: '2026-08-03T14:00:00Z',
      p_timezone_name: 'Europe/Paris',
      p_vessel_id: 7,
      p_watch_group: 'Bordée 1',
      p_comment: 'Quart',
      p_interval_id: null,
    });
  });

  it('maps the authoritative entry guidance without calculating quotas in the browser', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        status: 'conforme', policy_id: 5, policy_name: 'Politique datée', already_non_compliant: false,
        available_24h_seconds: 14400, available_7d_seconds: 180000,
        work_24h_seconds: 28800, work_7d_seconds: 79200,
        rest_24h_seconds: 57600, longest_rest_24h_seconds: 43200,
        rest_impact_seconds: -14400, consecutive_rest_impact_seconds: -3600,
        max_additional_seconds: 14400, latest_end_at: '2026-08-03T16:00:00Z',
        next_resume_at: '2026-08-03T22:00:00Z', violation_codes: [],
      },
      error: null,
    });
    const client = { rpc } as unknown as SupabaseClient;

    const result = await fetchWorkingTimeEntryRecommendation(client, {
      personId: 42,
      proposedStart: '2026-08-03T08:00:00Z',
      proposedEnd: '2026-08-03T12:00:00Z',
      timezoneName: 'Europe/Paris',
      vesselId: 7,
      watchGroup: 'Bordée 1',
      excludeIntervalId: 20,
    });

    expect(rpc).toHaveBeenCalledWith('working_time_interval_recommendation', {
      p_person_id: 42,
      p_proposed_start: '2026-08-03T08:00:00Z',
      p_proposed_end: '2026-08-03T12:00:00Z',
      p_timezone_name: 'Europe/Paris',
      p_vessel_id: 7,
      p_watch_group: 'Bordée 1',
      p_exclude_interval_id: 20,
    });
    expect(result).toMatchObject({
      status: 'conforme',
      available24hSeconds: 14400,
      maxAdditionalSeconds: 14400,
      latestEndAt: '2026-08-03T16:00:00Z',
    });
  });

  it('sends disjoint phases as one authoritative recommendation and one atomic save', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { status: 'conforme', phase_count: 2 }, error: null });
    const client = { rpc } as unknown as SupabaseClient;
    const phases = [
      { startsAt: '2026-08-03T08:00:00Z', endsAt: '2026-08-03T10:00:00Z' },
      { startsAt: '2026-08-03T14:00:00Z', endsAt: '2026-08-03T16:00:00Z' },
    ];

    await fetchWorkingTimePhasesRecommendation(client, { personId: 42, phases, timezoneName: 'Europe/Paris', vesselId: 7, watchGroup: 'A' });
    rpc.mockResolvedValueOnce({ data: [31, 32], error: null });
    await expect(saveWorkingTimePhases(client, { registerId: 10, phases, timezoneName: 'Europe/Paris', vesselId: 7, watchGroup: 'A', comment: null })).resolves.toEqual([31, 32]);

    expect(rpc).toHaveBeenNthCalledWith(1, 'working_time_phases_recommendation', expect.objectContaining({
      p_person_id: 42,
      p_phases: [{ starts_at: phases[0].startsAt, ends_at: phases[0].endsAt }, { starts_at: phases[1].startsAt, ends_at: phases[1].endsAt }],
    }));
    expect(rpc).toHaveBeenNthCalledWith(2, 'save_working_time_phases', expect.objectContaining({ p_register_id: 10 }));
  });

  it('uses explicit RPCs for register creation, captain comments and workflow transitions', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 99, error: null });
    const client = { rpc } as unknown as SupabaseClient;

    await getOrCreateWorkingTimeRegister(client, { personId: 42, periodKind: 'weekly', periodStart: '2026-08-03' });
    await saveWorkingTimeDayComment(client, {
      registerId: 99,
      localWorkDate: '2026-08-04',
      causeCategory: 'unexpected_operation',
      operationalContext: 'Opération prolongée',
      immediateAction: 'Relève organisée',
      compensatoryRestPlan: 'Repos le lendemain',
      comment: 'Dépassement expliqué',
    });
    await transitionWorkingTimeRegister(client, { registerId: 99, action: 'captain_validate' });

    expect(rpc).toHaveBeenNthCalledWith(1, 'get_or_create_working_time_register', {
      p_person_id: 42, p_period_kind: 'weekly', p_period_start: '2026-08-03',
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'save_working_time_day_comment', {
      p_register_id: 99,
      p_local_work_date: '2026-08-04',
      p_cause_category: 'unexpected_operation',
      p_operational_context: 'Opération prolongée',
      p_immediate_action: 'Relève organisée',
      p_compensatory_rest_plan: 'Repos le lendemain',
      p_comment: 'Dépassement expliqué',
    });
    expect(rpc).toHaveBeenNthCalledWith(3, 'transition_working_time_register', {
      p_register_id: 99, p_action: 'captain_validate', p_comment: null,
    });
  });

  it('translates server authorization failures into actionable interface messages', () => {
    expect(workingTimeErrorMessage(new Error('WORKING_TIME_SELF_VALIDATION_FORBIDDEN.')))
      .toBe('Un capitaine ne peut pas valider son propre registre.');
    expect(workingTimeErrorMessage(new Error('WORKING_TIME_NON_COMPLIANCE_DETAILS_REQUIRED.')))
      .toBe('Chaque journée non conforme exige une cause, un contexte, une action immédiate, un repos compensateur et un commentaire capitaine.');
    expect(workingTimeErrorMessage(new Error('canceling statement due to statement timeout')))
      .toBe('La validation de l’import a dépassé le délai serveur. Aucune journée n’a été importée : relancez la validation.');
  });
});
