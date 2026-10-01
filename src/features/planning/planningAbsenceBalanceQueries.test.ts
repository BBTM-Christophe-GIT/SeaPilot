import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { fetchPlanningAbsenceBalanceContext, savePlanningLeaveCounterPeriod } from './planningAbsenceBalanceQueries';

function rpcClient(data: unknown, error: unknown = null) { const rpc = vi.fn().mockResolvedValue({ data, error }); return { client: { rpc } as unknown as SupabaseClient, rpc }; }
const raw = { kind: 'leave_rtt', person: { id: 15, first_name: 'Christophe', last_name: 'MINASSIAN', hired_on: '2020-01-01', departed_on: null, active: true }, counter_periods: [{ id: 1, counter_type: 'leave', starts_on: '2026-01-01', ends_on: '2026-12-31', entitlement: '0.00' }], absences: [{ id: 10, absence_type: 'rtt', starts_at: '2026-10-01T06:00:00Z', ends_at: '2026-10-01T22:00:00Z', status: 'approved', updated_at: '2026-09-01T00:00:00Z' }], crew_checkpoints: [], crew_sources: { assignments: [], periods: [], days: [] } };
const draft = { personId: 15, counterType: 'rtt' as const, startsOn: '2026-01-01', endsOn: '2026-12-31', entitlement: 10.5 };

describe('selected-person balance query', () => {
  it('maps the narrow RPC, retains zero and RTT, and does not populate private absence fields', async () => {
    const { client, rpc } = rpcClient(raw); const value = await fetchPlanningAbsenceBalanceContext(client, 15);
    expect(rpc).toHaveBeenCalledWith('get_planning_absence_balance_context', { p_person_id: 15 });
    expect(value.counterPeriods[0]).toMatchObject({ counterType: 'leave', entitlement: 0 });
    expect(value.absences[0]).toMatchObject({ absenceType: 'rtt', endsOn: '2026-10-01', reason: '', requestedBy: '', reviewComment: '' });
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
