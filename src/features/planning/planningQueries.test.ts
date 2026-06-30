import { describe, expect, it, vi } from 'vitest';
import {
  createPlanningAssignment,
  createVessel,
  fetchPlanningOverview,
  mapPlanningAssignmentRows,
  mapPlanningAssignmentOverviewRows,
  mapPlanningPeopleRows,
  mapVesselRows,
} from './planningQueries';

const vesselRow = {
  id: 1,
  name: 'COTENTIN',
  acronym: 'CTN',
  active: true,
};

const captainRow = {
  id: 10,
  first_name: 'Jean',
  last_name: 'MARTIN',
  function_label: 'Capitaine',
  active: true,
};

const crewRow = {
  id: 11,
  first_name: 'Paul',
  last_name: 'DURAND',
  function_label: 'Matelot',
  active: true,
};

const assignmentRow = {
  id: 100,
  vessel_id: 1,
  captain_person_id: 10,
  crew_person_id: 11,
  starts_on: '2026-07-01',
  ends_on: '2026-07-14',
  assignment_role: 'Pont',
  source_label: 'seapilot',
};

const assignmentOverviewRow = {
  ...assignmentRow,
  vessel_name: 'COTENTIN',
  captain_name: 'Jean MARTIN',
  crew_name: 'Paul DURAND',
};

describe('planning mappers', () => {
  it('maps vessel rows to planning vessels', () => {
    expect(mapVesselRows([vesselRow])).toEqual([
      {
        id: 1,
        name: 'COTENTIN',
        acronym: 'CTN',
        active: true,
      },
    ]);
  });

  it('maps people rows to planning people options', () => {
    expect(mapPlanningPeopleRows([crewRow])).toEqual([
      {
        id: 11,
        firstName: 'Paul',
        lastName: 'DURAND',
        functionLabel: 'Matelot',
        active: true,
      },
    ]);
  });

  it('maps assignment rows with vessel and crew labels', () => {
    const people = mapPlanningPeopleRows([captainRow, crewRow]);
    const vessels = mapVesselRows([vesselRow]);

    expect(mapPlanningAssignmentRows([assignmentRow], people, vessels)).toEqual([
      {
        id: 100,
        vesselId: 1,
        vesselName: 'COTENTIN',
        captainPersonId: 10,
        captainName: 'Jean MARTIN',
        crewPersonId: 11,
        crewName: 'Paul DURAND',
        startsOn: '2026-07-01',
        endsOn: '2026-07-14',
        assignmentRole: 'Pont',
        sourceLabel: 'seapilot',
      },
    ]);
  });

  it('uses stable fallback labels when related rows are not visible', () => {
    expect(mapPlanningAssignmentRows([assignmentRow], [], [])).toEqual([
      expect.objectContaining({
        vesselName: 'Navire #1',
        captainName: 'Capitaine #10',
        crewName: 'Marin #11',
      }),
    ]);
  });

  it('maps planning assignment overview rows returned by Supabase RPC', () => {
    expect(mapPlanningAssignmentOverviewRows([assignmentOverviewRow])).toEqual([
      {
        id: 100,
        vesselId: 1,
        vesselName: 'COTENTIN',
        captainPersonId: 10,
        captainName: 'Jean MARTIN',
        crewPersonId: 11,
        crewName: 'Paul DURAND',
        startsOn: '2026-07-01',
        endsOn: '2026-07-14',
        assignmentRole: 'Pont',
        sourceLabel: 'seapilot',
      },
    ]);
  });
});

describe('fetchPlanningOverview', () => {
  it('loads vessels, planning people and assignments', async () => {
    const vesselOrder = vi.fn().mockResolvedValue({ data: [vesselRow], error: null });
    const peopleOrderByFirstName = vi.fn().mockResolvedValue({ data: [captainRow, crewRow], error: null });
    const peopleOrderByLastName = vi.fn().mockReturnValue({ order: peopleOrderByFirstName });
    const rpc = vi.fn().mockResolvedValue({ data: [assignmentOverviewRow], error: null });
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'vessels') {
        return {
          select: vi.fn().mockReturnValue({ order: vesselOrder }),
        };
      }

      if (table === 'people') {
        return {
          select: vi.fn().mockReturnValue({ order: peopleOrderByLastName }),
        };
      }

      if (table === 'planning_assignments') {
        throw new Error('planning_assignments should be loaded through RPC');
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await expect(fetchPlanningOverview({ from, rpc } as never)).resolves.toEqual({
      vessels: mapVesselRows([vesselRow]),
      people: mapPlanningPeopleRows([captainRow, crewRow]),
      assignments: mapPlanningAssignmentOverviewRows([assignmentOverviewRow]),
    });

    expect(from).toHaveBeenCalledWith('vessels');
    expect(from).toHaveBeenCalledWith('people');
    expect(rpc).toHaveBeenCalledWith('planning_assignment_overview');
    expect(peopleOrderByLastName).toHaveBeenCalledWith('last_name', { ascending: true });
    expect(peopleOrderByFirstName).toHaveBeenCalledWith('first_name', { ascending: true });
  });

  it('keeps inactive people available when resolving historical assignment labels', async () => {
    const inactiveAssignmentOverviewRow = {
      ...assignmentRow,
      crew_person_id: 12,
      crew_name: 'Luc ANCIEN',
      vessel_name: 'COTENTIN',
      captain_name: 'Jean MARTIN',
    };
    const vesselOrder = vi.fn().mockResolvedValue({ data: [vesselRow], error: null });
    const peopleOrderByFirstName = vi.fn().mockResolvedValue({ data: [captainRow], error: null });
    const peopleOrderByLastName = vi.fn().mockReturnValue({ order: peopleOrderByFirstName });
    const rpc = vi.fn().mockResolvedValue({ data: [inactiveAssignmentOverviewRow], error: null });
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'vessels') {
        return {
          select: vi.fn().mockReturnValue({ order: vesselOrder }),
        };
      }

      if (table === 'people') {
        return {
          select: vi.fn().mockReturnValue({ order: peopleOrderByLastName }),
        };
      }

      if (table === 'planning_assignments') {
        throw new Error('planning_assignments should be loaded through RPC');
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await expect(fetchPlanningOverview({ from, rpc } as never)).resolves.toEqual({
      vessels: mapVesselRows([vesselRow]),
      people: mapPlanningPeopleRows([captainRow]),
      assignments: [
        expect.objectContaining({
          captainName: 'Jean MARTIN',
          crewName: 'Luc ANCIEN',
        }),
      ],
    });
  });
});

describe('planning writes', () => {
  it('inserts a trimmed vessel record', async () => {
    const single = vi.fn().mockResolvedValue({ data: vesselRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });

    await expect(createVessel({ from } as never, { name: ' COTENTIN ', acronym: ' CTN ' })).resolves.toEqual(
      mapVesselRows([vesselRow])[0],
    );
    expect(insert).toHaveBeenCalledWith({
      name: 'COTENTIN',
      acronym: 'CTN',
    });
  });

  it('rejects a blank vessel name after trimming', async () => {
    const insert = vi.fn();
    const from = vi.fn().mockReturnValue({ insert });

    await expect(createVessel({ from } as never, { name: '   ', acronym: 'VIDE' })).rejects.toThrow(
      'Le nom du navire est obligatoire.',
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it('inserts an assignment with nullable captain and default source', async () => {
    const createdRow = {
      ...assignmentRow,
      captain_person_id: null,
      assignment_role: 'crew',
    };
    const single = vi.fn().mockResolvedValue({ data: createdRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });

    await expect(
      createPlanningAssignment({ from } as never, {
        vesselId: '1',
        captainPersonId: '',
        crewPersonId: '11',
        startsOn: '2026-07-01',
        endsOn: '2026-07-14',
        assignmentRole: '',
      }),
    ).resolves.toEqual(createdRow);
    expect(insert).toHaveBeenCalledWith({
      vessel_id: 1,
      captain_person_id: null,
      crew_person_id: 11,
      starts_on: '2026-07-01',
      ends_on: '2026-07-14',
      assignment_role: 'crew',
      source_label: 'seapilot',
    });
  });
});
