import { describe, expect, it, vi } from 'vitest';
import {
  fetchPlanningDays,
  fetchPlanningGridPeople,
  mapPlanningAssignmentOverviewRows,
  mapPlanningDayRows,
  mapPlanningPeopleRows,
  mapVesselRows,
  mergePlanningDaysForPeople,
  mergePlanningGridPeople,
} from './planningQueries';
import { EMPTY_PLANNING_OVERVIEW } from './usePlanningOverview';

const context = {
  people: mapPlanningPeopleRows([
    { id: 10, first_name: 'Anne', last_name: 'MARTIN', function_label: 'Capitaine', active: true },
    { id: 11, first_name: 'Paul', last_name: 'DURAND', function_label: 'Matelot', active: true },
  ]),
  vessels: mapVesselRows([{ id: 1, name: 'GOURY', acronym: 'GY', active: true }]),
};
const assignment = {
  id: 100, vessel_id: 1, captain_person_id: 10, crew_person_id: 11,
  starts_on: '2024-01-01', ends_on: '2027-12-31', starts_at: '2023-12-31T23:00:00Z',
  ends_at: '2027-12-31T22:59:00Z', assignment_role: 'Matelot', status_label: 'En Mer',
  confirmation_status: 'confirmed', watch_group: 'Bordée 1', comments: 'Période conservée',
  source_label: 'seapilot', updated_at: '2026-10-16T10:00:00Z',
};
const overviewAssignment = { ...assignment, vessel_name: 'GOURY', captain_name: 'Anne MARTIN', crew_name: 'Paul DURAND' };
const day = {
  id: 200, person_id: 11, vessel_id: 1, crew_name: 'Paul DURAND', captain_name: null,
  vessel_name: 'GOURY', manual_vessel_name: null, work_date: '2024-01-01', disembark_on: null,
  year_number: 2024, month_number: 1, month_label: 'Janvier', day_number: 1, function_label: 'Matelot',
  sailor_status: 'Repos', day_status: 'État quotidien', rhythm_label: null, watch_group: 'Bordée 1',
  slot365: 'assignment:100', departure_on: null, worked_hours: null, rest_24h: null,
  cumulative_7d: null, comments: 'Note conservée', source_label: 'seapilot-assignment-note',
};

function createClient(assignmentRows = [assignment], dayRows = [day]) {
  const assignments = { select: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: assignmentRows, error: null }) };
  const days = { select: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: dayRows, error: null }) };
  const from = vi.fn((table: string) => {
    if (table === 'planning_assignments') return assignments;
    if (table === 'planning_days') return days;
    throw new Error(`Unexpected table ${table}`);
  });
  return { client: { from } as never, from, assignments, days };
}

describe('authoritative Planning refresh after grid mutations', () => {
  it('reads only affected people on every date and preserves the overview mapping and revision', async () => {
    const { client, from, assignments, days } = createClient();
    const result = await fetchPlanningGridPeople(client, [11, 11], context);
    expect(from.mock.calls.map(([table]) => table)).toEqual(['planning_assignments', 'planning_days']);
    expect(assignments.in).toHaveBeenCalledExactlyOnceWith('crew_person_id', [11]);
    expect(days.in).toHaveBeenCalledExactlyOnceWith('person_id', [11]);
    expect(assignments.select).toHaveBeenCalledWith(expect.stringContaining('updated_at'));
    expect(assignments.range).toHaveBeenCalledExactlyOnceWith(0, 999);
    expect(days.range).toHaveBeenCalledExactlyOnceWith(0, 999);
    expect(result).toEqual({ personIds: [11], assignments: mapPlanningAssignmentOverviewRows([overviewAssignment]), days: mapPlanningDayRows([day]) });
    expect(result.assignments[0]).toMatchObject({ updatedAt: assignment.updated_at,
      startsOn: '2024-01-01', endsOn: '2027-12-31', confirmationStatus: 'confirmed' });
  });

  it('continues through the response limit for both scoped datasets', async () => {
    const { client, assignments, days } = createClient();
    assignments.range.mockResolvedValue({ data: [{ ...assignment, id: 1000 }], error: null });
    days.range.mockResolvedValue({ data: [{ ...day, id: 1000 }], error: null });
    assignments.range.mockResolvedValueOnce({ data: Array.from({ length: 1000 }, (_, id) => ({ ...assignment, id })), error: null });
    days.range.mockResolvedValueOnce({ data: Array.from({ length: 1000 }, (_, id) => ({ ...day, id })), error: null });
    const result = await fetchPlanningGridPeople(client, [11], context);
    expect(result.assignments).toHaveLength(1001);
    expect(result.days).toHaveLength(1001);
    expect(assignments.range).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(days.range).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it('does not fetch an empty or invalid scope and never hides a permission failure', async () => {
    const { client, from, assignments } = createClient();
    await expect(fetchPlanningGridPeople(client, [], context)).resolves.toEqual({ personIds: [], assignments: [], days: [] });
    await expect(fetchPlanningDays(client, { personIds: [] })).resolves.toEqual([]);
    await expect(fetchPlanningGridPeople(client, [0], context)).rejects.toThrow();
    expect(from).not.toHaveBeenCalled();
    assignments.range.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' } });
    await expect(fetchPlanningGridPeople(client, [11], context)).rejects.toThrow("Vous n'avez pas l'autorisation d'effectuer cette opération.");
  });

  it('refreshes daily states without reading assignments or the audit log', async () => {
    const { client, from, days } = createClient();
    expect(await fetchPlanningDays(client, { personIds: [11] })).toEqual(mapPlanningDayRows([day]));
    expect(from).toHaveBeenCalledExactlyOnceWith('planning_days');
    expect(days.in).toHaveBeenCalledExactlyOnceWith('person_id', [11]);
  });

  it('merges server splits and deletions while preserving other people and unrelated collections', () => {
    const original = mapPlanningAssignmentOverviewRows([overviewAssignment])[0];
    const other = { ...original, id: 101, crewPersonId: 12 };
    const note = mapPlanningDayRows([day])[0];
    const unlinked = { ...note, id: 201, personId: null };
    const otherNote = { ...note, id: 202, personId: 12 };
    const current = { ...EMPTY_PLANNING_OVERVIEW, ...context, assignments: [original, other], days: [note, unlinked, otherNote] };
    const split = { ...original, id: 102, startsOn: '2026-10-17', sourceLabel: 'seapilot-grid-split', updatedAt: '2026-10-16T11:00:00Z' };
    const movedNote = { ...note, slot365: 'assignment:102' };
    const result = mergePlanningGridPeople(current, { personIds: [11], assignments: [split], days: [movedNote] });
    expect(result.assignments).toEqual([other, split]);
    expect(result.assignments[0]).toBe(other);
    expect(result.days).toEqual([movedNote, unlinked, otherNote]);
    expect(result.days[1]).toBe(unlinked);
    expect(result.days[2]).toBe(otherNote);
    expect(result.periods).toBe(current.periods);
    expect(result.history).toBe(current.history);
    const deleted = mergePlanningGridPeople(result, { personIds: [11], assignments: [], days: [] });
    expect(deleted.assignments).toEqual([other]);
    expect(deleted.days).toEqual([unlinked, otherNote]);
  });

  it('keeps references for unchanged server data and daily merges', () => {
    const assignments = mapPlanningAssignmentOverviewRows([overviewAssignment]);
    const days = mapPlanningDayRows([day]);
    const current = { ...EMPTY_PLANNING_OVERVIEW, ...context, assignments, days };
    expect(mergePlanningGridPeople(current, { personIds: [11], assignments: [{ ...assignments[0] }], days: [{ ...days[0] }] })).toBe(current);
    expect(mergePlanningDaysForPeople(days, [{ ...days[0] }], [11])).toBe(days);
    expect(mergePlanningDaysForPeople(days, [], [])).toBe(days);
  });
});
