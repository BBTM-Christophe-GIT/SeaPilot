import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { fetchPlanningAbsenceBalanceContext, savePlanningLeaveCounterPeriod, savePlanningLeaveRightsPeriod } from './planningAbsenceBalanceQueries';
import { getPlanningRequestCrewBalance } from './planningAbsenceBalance';
import { buildPlanningCrewBalanceDays } from './planningCrewBalance';
import { EMPTY_PLANNING_OVERVIEW } from './usePlanningOverview';

function rpcClient(data: unknown, error: unknown = null) { const rpc = vi.fn().mockResolvedValue({ data, error }); return { client: { rpc } as unknown as SupabaseClient, rpc }; }
const raw = { kind: 'leave_rtt', person: { id: 15, first_name: 'Christophe', last_name: 'MINASSIAN', hired_on: '2020-01-01', departed_on: null, active: true }, counter_periods: [{ id: 1, counter_type: 'leave', starts_on: '2026-01-01', ends_on: '2026-12-31', entitlement: '0.00' }], absences: [{ id: 10, absence_type: 'rtt', starts_at: '2026-10-01T06:00:00Z', ends_at: '2026-10-01T22:00:00Z', status: 'approved', updated_at: '2026-09-01T00:00:00Z' }], crew_checkpoints: [], crew_sources: { assignments: [], periods: [], days: [] } };
const draft = { personId: 15, counterType: 'rtt' as const, startsOn: '2026-01-01', endsOn: '2026-12-31', entitlement: 10.5 };

describe('selected-person balance query', () => {
  it('maps the narrow RPC, retains zero and RTT, and does not populate private absence fields', async () => {
    const { client, rpc } = rpcClient(raw); const value = await fetchPlanningAbsenceBalanceContext(client, 15);
    expect(rpc).toHaveBeenCalledWith('get_planning_absence_balance_context', { p_person_id: 15 });
    expect(value.counterPeriods[0]).toMatchObject({ counterType: 'leave', entitlement: 0 });
    expect(value.absences[0]).toMatchObject({ absenceType: 'rtt', endsOn: '2026-10-01', reason: '', requestedBy: '', reviewComment: '' });
    expect(value.requestBalanceKind).toBe('leave_rtt');
  });
  it('retains configurable rights while mapping the exact crew inputs for an enrolled collaborator', async () => {
    const data = { ...raw, request_balance_kind: 'crew',
      person: { ...raw.person, first_name: 'Éléonore', last_name: 'EQUIPAGE' },
      absences: [{ ...raw.absences[0], starts_at: '2026-10-03T06:00:00Z', ends_at: '2026-10-03T22:00:00Z' }],
      crew_checkpoints: [{ person_id: 15, as_of: '2026-09-30', balance: '10.00' }, { person_id: 15, as_of: '2026-10-20', balance: 80 }],
      crew_sources: {
        assignments: [{ id: 23, vessel_id: 2, crew_person_id: 15, starts_on: '2026-10-01', ends_on: '2026-10-04', status_label: 'En Mer', confirmation_status: 'confirmed', updated_at: '2026-09-29T10:00:00Z' }],
        periods: [{ id: 40, vessel_id: 2, person_id: null, crew_name: 'EQUIPAGE Éléonore', starts_on: '2026-09-30', ends_on: '2026-10-04', sailor_status: 'En Mer' }],
        days: [{ id: 50, vessel_id: 2, person_id: 15, work_date: '2026-10-02', sailor_status: 'À Terre', source_label: 'seapilot-assignment-note', slot365: 'assignment:23' }],
      },
    };
    const context = await fetchPlanningAbsenceBalanceContext(rpcClient(data).client, 15);
    expect(context).toMatchObject({ kind: 'leave_rtt', requestBalanceKind: 'crew' });
    expect(context.counterPeriods[0].entitlement).toBe(0);
    const fullOverview = { ...EMPTY_PLANNING_OVERVIEW, people: [context.person], ...context.crewSources };
    const crewView = buildPlanningCrewBalanceDays(context.person, fullOverview, context.absences, context.crewCheckpoints, { start: '2026-09-30', end: '2026-10-04' }).get('2026-10-04');
    expect(getPlanningRequestCrewBalance(context, '2026-10-04')).toEqual(crewView);
    expect(crewView?.value).toBe(11.6);
  });
  it('trusts the persisted display choice after a name change and falls back only when the old RPC omits it', async () => {
    const context = await fetchPlanningAbsenceBalanceContext(rpcClient({ ...raw, request_balance_kind: 'leave_rtt', person: { ...raw.person, first_name: 'Prénom modifié', last_name: 'Nom modifié' } }).client, 15);
    expect(context.requestBalanceKind).toBe('leave_rtt');
    expect((await fetchPlanningAbsenceBalanceContext(rpcClient({ ...raw, kind: 'crew' }).client, 15)).requestBalanceKind).toBe('crew');
  });
  it.each([null, '', 'unknown'])('rejects an explicitly invalid request display kind %j', async (requestBalanceKind) => {
    await expect(fetchPlanningAbsenceBalanceContext(rpcClient({ ...raw, request_balance_kind: requestBalanceKind }).client, 15)).rejects.toThrow('incomplètes');
  });
  it.each([null, { ...raw, person: { ...raw.person, id: 9 } }, { ...raw, counter_periods: [{ ...raw.counter_periods[0], entitlement: null }] }, { ...raw, crew_checkpoints: [{ person_id: 9, as_of: '2026-10-01', balance: 10 }] }])('rejects incomplete or different-person data instead of displaying a zero', async (data) => await expect(fetchPlanningAbsenceBalanceContext(rpcClient(data).client, 15)).rejects.toThrow());
  it('distinguishes denied access and retryable loading failures', async () => {
    await expect(fetchPlanningAbsenceBalanceContext(rpcClient(null, { code: '42501' }).client, 15)).rejects.toThrow('ne peut pas consulter');
    await expect(fetchPlanningAbsenceBalanceContext(rpcClient(null, { code: 'network' }).client, 15)).rejects.toThrow('Réessayez');
  });
  it('does not request an invalid person id', async () => { const { client, rpc } = rpcClient(raw); await expect(fetchPlanningAbsenceBalanceContext(client, 0)).rejects.toThrow('Choisissez'); expect(rpc).not.toHaveBeenCalled(); });
});
describe('period rights save query', () => {
  it('sends the total entitlement and inclusive bounds with the selected person', async () => { const { client, rpc } = rpcClient(1); await savePlanningLeaveCounterPeriod(client, draft); expect(rpc).toHaveBeenCalledWith('save_planning_leave_counter_period', { p_person_id: 15, p_counter_type: 'rtt', p_starts_on: '2026-01-01', p_ends_on: '2026-12-31', p_entitlement: 10.5 }); });
  it('rejects invalid rights before a network write', async () => { const { client, rpc } = rpcClient(1); await expect(savePlanningLeaveCounterPeriod(client, { ...draft, entitlement: -1 })).rejects.toThrow(); expect(rpc).not.toHaveBeenCalled(); });
  it.each([['23P01', 'chevauche'], ['42501', 'ne peut pas modifier'], ['network', 'Réessayez']])('reports %s without claiming a successful save', async (code, message) => await expect(savePlanningLeaveCounterPeriod(rpcClient(null, { code }).client, draft)).rejects.toThrow(message));
});

describe('combined annual rights save query', () => {
  const annual = { personId: 15, startsOn: '2026-06-01', endsOn: '2027-05-31', leaveEntitlement: 25.5, rttEntitlement: 0 };
  it('sends both totals in one RPC so enrollment and counters cannot be partially saved', async () => {
    const { client, rpc } = rpcClient(null);
    await savePlanningLeaveRightsPeriod(client, annual);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('save_planning_leave_rights_period', { p_person_id: 15, p_starts_on: '2026-06-01', p_ends_on: '2027-05-31', p_leave_entitlement: 25.5, p_rtt_entitlement: 0 });
  });
  it.each([{ rttEntitlement: NaN }, { leaveEntitlement: -1 }, { endsOn: '2027-06-01' }])('rejects invalid values %j before enrollment or rights write', async (override) => {
    const { client, rpc } = rpcClient(null);
    await expect(savePlanningLeaveRightsPeriod(client, { ...annual, ...override })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([['23P01', 'chevauche'], ['42501', 'ne peut pas modifier'], ['22023', '1er juin'], ['network', 'Réessayez']])('reports %s without claiming successful enrollment', async (code, message) => await expect(savePlanningLeaveRightsPeriod(rpcClient(null, { code }).client, annual)).rejects.toThrow(message));
});
