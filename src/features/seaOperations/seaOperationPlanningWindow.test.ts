import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { fetchSeaOperationPlanningWindow, seaOperationPlanningChoiceKey, seaOperationPlanningChoiceLabel, seaOperationPlanningWindowDates } from './seaOperationPlanningWindow';

const start = '2026-10-27';
const dates = ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'];
function choice(operationId = '21:7', name = 'GOURY', lengthOverall = '24 m', captain = 'Capitaine titulaire', canSign = false) {
  return { operationId, projectId: '21', project: 'P21 – Travaux maritimes', client: 'Client du projet', clientContact: 'Contact conservé', description: 'Mission du jour',
    vessel: { id: operationId.split(':')[1], name, lengthOverall, registrationImo: 'IMO123', departurePort: 'Cherbourg', arrivalPort: 'Caen', etd: '', eta: '' },
    captains: [{ personId: captain, name: captain, functionLabel: captain.includes('temporaire') ? 'Capitaine temporaire' : 'Capitaine', hasSignature: true, canSign }], canSign };
}
const asClient = (rpc: ReturnType<typeof vi.fn>) => ({ rpc }) as unknown as SupabaseClient;
function emptyRpc() {
  return vi.fn((_name: string, args: { p_date: string }) => Promise.resolve({ data: { date: args.p_date, choices: [] }, error: null }));
}

describe('four-day sea-operation planning window', () => {
  it.each([
    ['2026-03-28', ['2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31']],
    ['2026-10-24', ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']],
    ['2026-04-29', ['2026-04-29', '2026-04-30', '2026-05-01', '2026-05-02']],
    ['2026-12-30', ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']],
    ['2028-02-28', ['2028-02-28', '2028-02-29', '2028-03-01', '2028-03-02']],
    ['2026-02-28', ['2026-02-28', '2026-03-01', '2026-03-02', '2026-03-03']],
    ['2100-02-28', ['2100-02-28', '2100-03-01', '2100-03-02', '2100-03-03']],
    ['2000-02-28', ['2000-02-28', '2000-02-29', '2000-03-01', '2000-03-02']],
    ['9999-12-28', ['9999-12-28', '9999-12-29', '9999-12-30', '9999-12-31']],
  ])('uses four complete calendar days from %s', (date, expected) => {
    expect(seaOperationPlanningWindowDates(date as string)).toEqual(expected);
  });

  it.each(['', '2026-2-01', '2026-02-30', '2027-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00',
    '2026-10-27T00:00:00Z', ' 2026-10-27', '2026-10-27 ', '0000-01-01', '0999-01-01', 'not-a-date', '9999-12-29'])('rejects invalid or overflowing start %s before any RPC', async date => {
    const rpc = emptyRpc();
    await expect(fetchSeaOperationPlanningWindow(asClient(rpc), date)).rejects.toThrow('Planning');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('starts all four authenticated day RPCs together and preserves date order when responses arrive out of order', async () => {
    const complete = new Map<string, (result: { data: { date: string; choices: ReturnType<typeof choice>[] }; error: null }) => void>();
    const rpc = vi.fn((_name: string, args: { p_date: string }) => new Promise(resolve => complete.set(args.p_date, resolve)));
    const request = fetchSeaOperationPlanningWindow(asClient(rpc), start);
    expect(rpc.mock.calls.map(call => call[1])).toEqual(dates.map(date => ({ p_date: date })));
    for (const date of [...dates].reverse()) complete.get(date)!({ data: { date, choices: [choice()] }, error: null });
    const result = await request;
    expect(result).toMatchObject({ startDate: start, endDate: '2026-10-30', selectedContext: null });
    expect(result.choices.map(item => item.date)).toEqual(dates);
    expect(rpc.mock.calls.every(call => call[0] === 'sea_operation_planning_context')).toBe(true);
  });

  it('retains repeated operation IDs and each day’s actual captain, linked fields and existing vessel order', async () => {
    const dayChoices = { [dates[0]]: [choice('21:7', 'Petit', '12 m'), choice('21:9', 'Grand', '42 m')],
      [dates[1]]: [choice('21:7', 'Petit', '12 m', 'Capitaine temporaire', true)] };
    const original = structuredClone(dayChoices);
    const rpc = vi.fn((_name: string, args: { p_date: string }) => Promise.resolve({ data: { date: args.p_date, choices: dayChoices[args.p_date] || [] }, error: null }));
    const result = await fetchSeaOperationPlanningWindow(asClient(rpc), start);
    expect(result.choices.map(item => [item.date, item.operationId, item.vessel.name, item.captains[0].name, item.canSign])).toEqual([
      [dates[0], '21:9', 'Grand', 'Capitaine titulaire', false], [dates[0], '21:7', 'Petit', 'Capitaine titulaire', false],
      [dates[1], '21:7', 'Petit', 'Capitaine temporaire', true],
    ]);
    expect(result.choices[2]).toMatchObject({ projectId: '21', client: 'Client du projet', clientContact: 'Contact conservé', description: 'Mission du jour',
      captains: [{ functionLabel: 'Capitaine temporaire', hasSignature: true, canSign: true }] });
    expect(dayChoices).toEqual(original);
    expect(seaOperationPlanningChoiceKey(result.choices[1])).toBe('2026-10-27|21:7');
    expect(seaOperationPlanningChoiceKey(result.choices[2])).toBe('2026-10-28|21:7');
    expect(seaOperationPlanningChoiceLabel(result.choices[2])).toBe('28/10/2026 · P21 – Travaux maritimes · Petit');
  });

  it.each(dates)('reuses the selected context for %s inside the window', async date => {
    const rpc = emptyRpc(); const result = await fetchSeaOperationPlanningWindow(asClient(rpc), start, date);
    expect(rpc).toHaveBeenCalledTimes(4); expect(result.selectedContext).toEqual({ date, choices: [] });
  });

  it.each(['2026-09-01', '2026-12-15'])('loads exactly one additional selected context for %s without offering it in the current window', async selected => {
    const rpc = vi.fn((_name: string, args: { p_date: string }) => Promise.resolve({ data: { date: args.p_date, choices: [choice()] }, error: null }));
    const result = await fetchSeaOperationPlanningWindow(asClient(rpc), start, selected);
    expect(rpc).toHaveBeenCalledTimes(5); expect(rpc).toHaveBeenLastCalledWith('sea_operation_planning_context', { p_date: selected });
    expect(result.selectedContext).toMatchObject({ date: selected, choices: [{ operationId: '21:7' }] });
    expect(result.choices.map(item => item.date)).toEqual(dates);
  });

  it.each([undefined, null, '', '2026-02-30', '2026-10-27T00:00Z', ' 2026-10-27'])('ignores an absent or invalid selected date %s', async selected => {
    const rpc = emptyRpc(); const result = await fetchSeaOperationPlanningWindow(asClient(rpc), start, selected);
    expect(rpc).toHaveBeenCalledTimes(4); expect(result.selectedContext).toBeNull();
  });

  it.each(['2026-10-29', '2026-09-01'])('rejects the whole result when RPC %s fails, including the selected historical context', async failing => {
    const error = { code: '42501', message: 'Accès au planning refusé pour ce profil.' };
    const rpc = vi.fn((_name: string, args: { p_date: string }) => Promise.resolve(args.p_date === failing ? { data: null, error } : { data: { date: args.p_date, choices: [choice()] }, error: null }));
    await expect(fetchSeaOperationPlanningWindow(asClient(rpc), start, '2026-09-01')).rejects.toBe(error);
  });

  it.each(['2026-10-29', '2026-09-01'])('rejects a mismatched date returned for %s instead of reassigning the day’s permissions', async failing => {
    const rpc = vi.fn((_name: string, args: { p_date: string }) => Promise.resolve({ data: { date: args.p_date === failing ? '2026-10-28' : args.p_date, choices: [choice()] }, error: null }));
    await expect(fetchSeaOperationPlanningWindow(asClient(rpc), start, '2026-09-01')).rejects.toThrow('ne correspond pas au jour demandé');
  });
});
