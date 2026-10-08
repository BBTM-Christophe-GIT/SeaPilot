import { describe, expect, it, vi } from 'vitest';
import { buildPlanningCrewRows, buildPlanningTimeline, getAllPlanningCrewEvents, type PlanningCrewEvent } from './planningModel';
import { buildPlanningCrewLanes } from './planningViews';
import type { PlanningAssignmentRecord, PlanningOverview, PlanningPerson } from './planningQueries';
import { EMPTY_PLANNING_OVERVIEW } from './usePlanningOverview';
import { planningTemporaryFunctionSegments } from './planningFunctions';
import { comparePlanningFleetFunctions, fetchPlanningFleetOrder, normalizePlanningFleetFunctionOrder, planningFleetEffectiveFunction, savePlanningFleetOrder } from './planningFleetOrder';

const person = (id: number, firstName: string, functionLabel: string): PlanningPerson => ({
  id, firstName, lastName: 'MARIN', functionLabel, gradeLabel: '', roleLabel: '', contractType: 'CDI',
  hiredOn: '2020-01-01', departedOn: '', active: true,
});
const captain = person(1, 'Zoé', 'Capitaine');
const sailor = person(2, 'Anne', 'Matelot Qualifié');
function assignment(id: number, crew: PlanningPerson, startsOn = '2026-07-01'): PlanningAssignmentRecord {
  return {
    id, vesselId: 1, vesselName: 'GOURY', captainPersonId: null, captainName: '',
    crewPersonId: crew.id, crewName: `${crew.firstName} ${crew.lastName}`, startsOn, endsOn: '2026-07-31',
    assignmentRole: crew.functionLabel, statusLabel: 'En Mer', confirmationStatus: 'confirmed',
    watchGroup: 'Bordée 1', comments: '', sourceLabel: 'seapilot',
  };
}
const overview: PlanningOverview = {
  ...EMPTY_PLANNING_OVERVIEW,
  vessels: [{ id: 1, name: 'GOURY', acronym: 'GRY', active: true }],
  people: [captain, sailor], assignments: [assignment(1, sailor), assignment(2, captain, '2026-07-10')],
};
const days = buildPlanningTimeline('2026-07-12', 'month');
const filters = { vesselName: '', personName: '' };
const crewLabels = (data: PlanningOverview, functionOrder: string[], referenceDate = '2026-07-12') => (
  buildPlanningCrewRows(data, days, filters, undefined, { functionOrder, referenceDate })
    .filter((row) => row.type === 'person').map((row) => row.label)
);

describe('fleet function display order', () => {
  it('keeps the existing posting order until an administrator saves a function order', () => {
    expect(crewLabels(overview, [])).toEqual(['Anne MARIN', 'Zoé MARIN']);
    expect(crewLabels(overview, ['Capitaine', 'Matelot Qualifié'])).toEqual(['Zoé MARIN', 'Anne MARIN']);
    expect(crewLabels(overview, ['Matelot Qualifié', 'Capitaine'])).toEqual(['Anne MARIN', 'Zoé MARIN']);
  });

  it('sorts by the temporary daily function on the selected date, then returns to the ordinary function', () => {
    const data = { ...overview, assignments: [assignment(1, captain), assignment(2, sailor)] };
    const events = getAllPlanningCrewEvents(data).map((event) => event.personId === sailor.id
      ? { ...event, dailyFunctionLabels: { '2026-07-12': 'Chef Mécanicien' } } : event);
    const rowsOn = (referenceDate: string) => buildPlanningCrewRows(data, days, filters, events, {
      functionOrder: ['Chef Mécanicien', 'Capitaine', 'Matelot Qualifié'], referenceDate,
    }).filter((row) => row.type === 'person');
    expect(rowsOn('2026-07-12').map((row) => [row.label, row.functionLabel])).toEqual([
      ['Anne MARIN', 'Matelot Qualifié'], ['Zoé MARIN', 'Capitaine'],
    ]);
    expect(rowsOn('2026-07-13').map((row) => row.label)).toEqual(['Zoé MARIN', 'Anne MARIN']);
    expect(events.find((event) => event.personId === sailor.id)?.functionLabel).toBe('Matelot Qualifié');
    expect(data.people[1].functionLabel).toBe('Matelot Qualifié');
  });

  it('applies assignment functions and ignores cancelled or expired temporary functions', () => {
    const [base] = getAllPlanningCrewEvents(overview);
    const event: PlanningCrewEvent = { ...base, functionLabel: 'Chef Mécanicien', dailyFunctionLabels: { '2026-07-12': 'Capitaine' } };
    expect(planningFleetEffectiveFunction([event], '2026-07-12', 'Matelot Qualifié')).toBe('Capitaine');
    expect(planningFleetEffectiveFunction([event], '2026-07-13', 'Matelot Qualifié')).toBe('Chef Mécanicien');
    expect(planningFleetEffectiveFunction([event], '2026-08-01', 'Matelot Qualifié')).toBe('Matelot Qualifié');
    expect(planningFleetEffectiveFunction([event], '2026-08-01', '')).toBe('');
    expect(planningFleetEffectiveFunction([{ ...event, confirmationStatus: 'cancelled' }], '2026-07-12', 'Matelot Qualifié')).toBe('Matelot Qualifié');
    expect(planningFleetEffectiveFunction([{ ...event, functionLabel: 'Pont', dailyFunctionLabels: {} }], '2026-07-12', 'Matelot Qualifié')).toBe('Matelot Qualifié');
  });

  it.each(['period', 'day'] as const)('sorts by the active %s function shown as temporary in the fleet timeline', (kind) => {
    const data = { ...overview, assignments: [assignment(1, captain), assignment(2, sailor)] };
    const events = getAllPlanningCrewEvents(data).map((event) => event.personId === sailor.id
      ? { ...event, kind, assignmentId: undefined, functionLabel: 'Chef Mécanicien', startsOn: '2026-07-12', endsOn: '2026-07-12' }
      : event);
    const temporary = events.find((event) => event.personId === sailor.id)!;
    expect(planningTemporaryFunctionSegments(temporary, sailor.functionLabel)).toEqual([
      expect.objectContaining({ functionLabel: 'Chef Mécanicien', startsOn: '2026-07-12', endsOn: '2026-07-12' }),
    ]);
    const rows = buildPlanningCrewRows(data, days, filters, events, {
      functionOrder: ['Chef Mécanicien', 'Capitaine', 'Matelot Qualifié'], referenceDate: '2026-07-12',
    }).filter((row) => row.type === 'person');
    expect(rows.map((row) => row.label)).toEqual(['Anne MARIN', 'Zoé MARIN']);
    expect(planningFleetEffectiveFunction([temporary], '2026-07-13', sailor.functionLabel)).toBe(sailor.functionLabel);
    expect(planningFleetEffectiveFunction([{ ...temporary, functionLabel: 'Pont' }], '2026-07-12', sailor.functionLabel)).toBe(sailor.functionLabel);
    expect(planningFleetEffectiveFunction([{ ...temporary, functionLabel: 'Machine' }], '2026-07-12', '')).toBe('');
    const actualAssignment = { ...temporary, kind: 'assignment' as const, assignmentId: 99, functionLabel: 'Capitaine' };
    expect(planningFleetEffectiveFunction([temporary, actualAssignment], '2026-07-12', sailor.functionLabel)).toBe('Capitaine');
  });

  it('uses the latest saved role when assignments overlap in the same watch', () => {
    const [base] = getAllPlanningCrewEvents(overview);
    const old = { ...base, assignmentId: 4, functionLabel: 'Capitaine', updatedAt: '2026-07-01T00:00:00Z' };
    const recent = { ...base, assignmentId: 5, functionLabel: 'Chef Mécanicien', updatedAt: '2026-07-02T00:00:00Z' };
    expect(planningFleetEffectiveFunction([old, recent], '2026-07-12', 'Matelot Qualifié')).toBe('Chef Mécanicien');
  });

  it('leaves crew-view preferences and HR functions unchanged', () => {
    const range = { start: '2026-07-01', end: '2026-07-31' };
    const initial = buildPlanningCrewLanes(overview, range, filters, 'people');
    const configured = buildPlanningCrewLanes({ ...overview, fleetFunctionOrder: ['Capitaine', 'Matelot Qualifié'] }, range, filters, 'people');
    expect(configured).toEqual(initial);
  });

  it('matches function spellings and puts unspecified functions after the configured list', () => {
    expect(normalizePlanningFleetFunctionOrder([' Capitaine ', 'capitaine', 'Bosco', "Maître d’Équipage", '', null])).toEqual(['Capitaine', 'Bosco']);
    expect(comparePlanningFleetFunctions('Second Capitaine', 'Matelot Qualifié', ['2nd Capitaine'])).toBeLessThan(0);
    expect(comparePlanningFleetFunctions('Bosco', "Maître d'Equipage", ["Maître d'Equipage"])).toBe(0);
    expect(comparePlanningFleetFunctions('Inconnu', 'Autre', ['Capitaine'])).toBe(0);
  });
});

describe('shared fleet display settings', () => {
  it('loads the company setting and supplies an empty default when it is absent', async () => {
    const maybeSingle = vi.fn().mockResolvedValueOnce({ data: { function_order: [' Stagiaire ', 'Capitaine'] }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const from = vi.fn().mockReturnValue({ select });
    expect(await fetchPlanningFleetOrder({ from } as never)).toEqual(['Stagiaire', 'Capitaine']);
    expect(await fetchPlanningFleetOrder({ from } as never)).toEqual([]);
    expect(from).toHaveBeenCalledWith('planning_fleet_display_settings');
    expect(select).toHaveBeenCalledWith('function_order');
  });

  it('saves and resets the shared setting through the authorized RPC', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [{ function_order: ['Stagiaire', 'Capitaine'] }], error: null })
      .mockResolvedValueOnce({ data: { function_order: [] }, error: null });
    expect(await savePlanningFleetOrder({ rpc } as never, [' Stagiaire ', 'Capitaine'])).toEqual(['Stagiaire', 'Capitaine']);
    expect(rpc).toHaveBeenNthCalledWith(1, 'save_planning_fleet_display_settings', { p_function_order: ['Stagiaire', 'Capitaine'] });
    expect(await savePlanningFleetOrder({ rpc } as never, [])).toEqual([]);
  });

  it('reports read and write failures without pretending that a setting was saved', async () => {
    const from = vi.fn().mockReturnValue({ select: () => ({ maybeSingle: async () => ({ data: null, error: { code: '42501' } }) }) });
    await expect(fetchPlanningFleetOrder({ from } as never)).rejects.toThrow('Impossible de charger');
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: { code: '42501' } })
      .mockResolvedValueOnce({ data: null, error: null });
    await expect(savePlanningFleetOrder({ rpc } as never, ['Capitaine'])).rejects.toThrow('Impossible d’enregistrer');
    await expect(savePlanningFleetOrder({ rpc } as never, ['Capitaine'])).rejects.toThrow('n’a pas été renvoyé');
  });
});
