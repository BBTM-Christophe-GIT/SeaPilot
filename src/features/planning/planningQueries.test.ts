import { describe, expect, it, vi } from 'vitest';
import {
  createPlanningAssignment,
  createVessel,
  fetchPlanningPeople,
  fetchPlanningOverview,
  fetchVessels,
  mapPlanningDayRows,
  mapPlanningAssignmentRows,
  mapPlanningAssignmentOverviewRows,
  mapPlanningPeriodRows,
  mapPlanningPeopleRows,
  mapPlanningPublicationRows,
  mapVesselRows,
  transitionPlanningPublication,
  updatePlanningEvent,
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

const planningDayRow = {
  id: 200,
  crew_name: 'Paul DURAND',
  captain_name: 'Jean MARTIN',
  vessel_name: 'COTENTIN',
  manual_vessel_name: null,
  work_date: '2026-07-01',
  disembark_on: '2026-07-14',
  year_number: 2026,
  month_number: 7,
  month_label: 'Juillet',
  day_number: 1,
  function_label: 'Pont',
  sailor_status: 'Embarque',
  day_status: 'Travaille',
  rhythm_label: '12h',
  watch_group: 'A',
  slot365: 'SLOT-123',
  departure_on: '2026-07-01',
  worked_hours: 10.5,
  rest_24h: 14,
  cumulative_7d: 60,
  comments: 'RAS',
  source_label: 'sharepoint',
};

const planningPeriodRow = {
  id: 300,
  crew_name: 'Paul DURAND',
  vessel_name: 'COTENTIN',
  manual_vessel_name: null,
  watch_group: 'A',
  function_label: 'Pont',
  sailor_status: 'Embarque',
  starts_on: '2026-07-01',
  ends_on: '2026-07-14',
  year_number: 2026,
  comments: 'Rotation A',
  slot365_source_id: '200',
  slot365_source_key: 'SLOT-123',
  source_label: 'sharepoint',
};

const planningPublicationRow = {
  id: 500,
  vessel_id: null,
  scope_key: 'fleet',
  starts_on: '2026-07-01',
  ends_on: '2026-07-31',
  status: 'published',
  current_version: 1,
  comment: 'Version opérationnelle',
  submitted_at: '2026-07-01T08:00:00Z',
  validated_at: '2026-07-01T09:00:00Z',
  published_at: '2026-07-01T10:00:00Z',
  locked_at: '2026-07-01T08:00:00Z',
  updated_at: '2026-07-01T10:00:00Z',
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
        gradeLabel: '',
        roleLabel: '',
        contractType: '',
        hiredOn: '',
        departedOn: '',
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
        statusLabel: 'En Mer',
        watchGroup: 'Affectation',
        comments: '',
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
        statusLabel: 'En Mer',
        watchGroup: 'Affectation',
        comments: '',
        sourceLabel: 'seapilot',
      },
    ]);
  });

  it('maps imported SMTR planning day rows', () => {
    expect(mapPlanningDayRows([planningDayRow])).toEqual([
      {
        id: 200,
        personId: null,
        vesselId: null,
        crewName: 'Paul DURAND',
        captainName: 'Jean MARTIN',
        vesselName: 'COTENTIN',
        workDate: '2026-07-01',
        disembarkOn: '2026-07-14',
        yearNumber: 2026,
        monthNumber: 7,
        monthLabel: 'Juillet',
        dayNumber: 1,
        functionLabel: 'Pont',
        sailorStatus: 'Embarque',
        dayStatus: 'Travaille',
        rhythmLabel: '12h',
        watchGroup: 'A',
        slot365: 'SLOT-123',
        departureOn: '2026-07-01',
        workedHours: 10.5,
        rest24h: 14,
        cumulative7d: 60,
        comments: 'RAS',
        sourceLabel: 'sharepoint',
      },
    ]);
  });

  it('maps imported SMTR planning periods', () => {
    expect(mapPlanningPeriodRows([planningPeriodRow])).toEqual([
      {
        id: 300,
        personId: null,
        vesselId: null,
        crewName: 'Paul DURAND',
        vesselName: 'COTENTIN',
        watchGroup: 'A',
        functionLabel: 'Pont',
        sailorStatus: 'Embarque',
        startsOn: '2026-07-01',
        endsOn: '2026-07-14',
        yearNumber: 2026,
        comments: 'Rotation A',
        slot365SourceId: '200',
        slot365SourceKey: 'SLOT-123',
        sourceLabel: 'sharepoint',
      },
    ]);
  });

  it('maps the publication state and server lock', () => {
    expect(mapPlanningPublicationRows([planningPublicationRow])).toEqual([{
      id: 500,
      vesselId: null,
      scopeKey: 'fleet',
      startsOn: '2026-07-01',
      endsOn: '2026-07-31',
      status: 'published',
      currentVersion: 1,
      comment: 'Version opérationnelle',
      submittedAt: '2026-07-01T08:00:00Z',
      validatedAt: '2026-07-01T09:00:00Z',
      publishedAt: '2026-07-01T10:00:00Z',
      lockedAt: '2026-07-01T08:00:00Z',
      updatedAt: '2026-07-01T10:00:00Z',
    }]);
  });
});

describe('planning reference loading', () => {
  it('loads vessels with the centralized select and ordering', async () => {
    const order = vi.fn().mockResolvedValue({ data: [vesselRow], error: null });
    const from = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ order }) });
    await expect(fetchVessels({ from } as never)).resolves.toEqual(mapVesselRows([vesselRow]));
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('vessels');
  });

  it('loads marins without filtering inactive historical relations', async () => {
    const orderByFirstName = vi.fn().mockResolvedValue({ data: [captainRow, crewRow], error: null });
    const orderByLastName = vi.fn().mockReturnValue({ order: orderByFirstName });
    const from = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ order: orderByLastName }) });
    await expect(fetchPlanningPeople({ from } as never)).resolves.toEqual(mapPlanningPeopleRows([captainRow, crewRow]));
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('people');
  });

  it('reports a contextual vessel loading error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST001', message: 'timeout' } }) }),
    });
    await expect(fetchVessels({ from } as never)).rejects.toThrow('Impossible de charger les navires.');
    consoleError.mockRestore();
  });
});

describe('fetchPlanningOverview', () => {
  it('loads vessels, planning people and assignments', async () => {
    const vesselOrder = vi.fn().mockResolvedValue({ data: [vesselRow], error: null });
    const peopleOrderByFirstName = vi.fn().mockResolvedValue({ data: [captainRow, crewRow], error: null });
    const peopleOrderByLastName = vi.fn().mockReturnValue({ order: peopleOrderByFirstName });
    const daysOrderByCrew = vi.fn().mockResolvedValue({ data: [planningDayRow], error: null });
    const daysOrderByDate = vi.fn().mockReturnValue({ order: daysOrderByCrew });
    const periodsOrderByCrew = vi.fn().mockResolvedValue({ data: [planningPeriodRow], error: null });
    const periodsOrderByStart = vi.fn().mockReturnValue({ order: periodsOrderByCrew });
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

      if (table === 'planning_days') {
        return {
          select: vi.fn().mockReturnValue({ order: daysOrderByDate }),
        };
      }

      if (table === 'planning_periods') {
        return {
          select: vi.fn().mockReturnValue({ order: periodsOrderByStart }),
        };
      }

      if (table === 'planning_projects') {
        return { select: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) };
      }

      if (table === 'fleet_certificates' || table === 'planning_rules') {
        return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      }

      if (table === 'hr_documents') {
        return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      }

      if (table === 'planning_publications') {
        return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [planningPublicationRow], error: null }) }) };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await expect(fetchPlanningOverview({ from, rpc } as never)).resolves.toEqual({
      vessels: mapVesselRows([vesselRow]),
      people: mapPlanningPeopleRows([captainRow, crewRow]),
      assignments: mapPlanningAssignmentOverviewRows([assignmentOverviewRow]),
      days: mapPlanningDayRows([planningDayRow]),
      periods: mapPlanningPeriodRows([planningPeriodRow]),
      projects: [],
      certificates: [],
      hrDocuments: [],
      rules: [],
      publications: mapPlanningPublicationRows([planningPublicationRow]),
    });

    expect(from).toHaveBeenCalledWith('vessels');
    expect(from).toHaveBeenCalledWith('people');
    expect(from).toHaveBeenCalledWith('planning_days');
    expect(from).toHaveBeenCalledWith('planning_periods');
    expect(rpc).toHaveBeenCalledWith('planning_assignment_overview');
    expect(peopleOrderByLastName).toHaveBeenCalledWith('last_name', { ascending: true });
    expect(peopleOrderByFirstName).toHaveBeenCalledWith('first_name', { ascending: true });
    expect(daysOrderByDate).toHaveBeenCalledWith('work_date', { ascending: true });
    expect(daysOrderByCrew).toHaveBeenCalledWith('crew_name', { ascending: true });
    expect(periodsOrderByStart).toHaveBeenCalledWith('starts_on', { ascending: true });
    expect(periodsOrderByCrew).toHaveBeenCalledWith('crew_name', { ascending: true });
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
    const daysOrderByCrew = vi.fn().mockResolvedValue({ data: [], error: null });
    const daysOrderByDate = vi.fn().mockReturnValue({ order: daysOrderByCrew });
    const periodsOrderByCrew = vi.fn().mockResolvedValue({ data: [], error: null });
    const periodsOrderByStart = vi.fn().mockReturnValue({ order: periodsOrderByCrew });
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

      if (table === 'planning_days') {
        return {
          select: vi.fn().mockReturnValue({ order: daysOrderByDate }),
        };
      }

      if (table === 'planning_periods') {
        return {
          select: vi.fn().mockReturnValue({ order: periodsOrderByStart }),
        };
      }

      if (table === 'planning_projects') {
        return { select: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) };
      }

      if (table === 'fleet_certificates' || table === 'planning_rules') {
        return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      }

      if (table === 'hr_documents') {
        return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      }

      if (table === 'planning_publications') {
        return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
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
      days: [],
      periods: [],
      projects: [],
      certificates: [],
      hrDocuments: [],
      rules: [],
      publications: [],
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
      status_label: 'En Mer',
      watch_group: 'Affectation',
      comments: null,
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
      status_label: 'En Mer',
      watch_group: 'Affectation',
      comments: null,
      source_label: 'seapilot',
    });
  });

  it('accepts an assignment spanning midnight as two civil dates', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { ...assignmentRow, starts_on: '2026-10-24', ends_on: '2026-10-25' },
      error: null,
    });
    const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
    const from = vi.fn().mockReturnValue({ insert });

    await createPlanningAssignment({ from } as never, {
      vesselId: '1',
      captainPersonId: '',
      crewPersonId: '11',
      startsOn: '2026-10-24',
      endsOn: '2026-10-25',
      assignmentRole: 'Pont',
    });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ starts_on: '2026-10-24', ends_on: '2026-10-25' }));
  });

  it('rejects incoherent dates and invalid relation identifiers before Supabase', async () => {
    const from = vi.fn();
    await expect(createPlanningAssignment({ from } as never, {
      vesselId: '1',
      captainPersonId: '',
      crewPersonId: '11',
      startsOn: '2026-07-14',
      endsOn: '2026-07-01',
      assignmentRole: 'Pont',
    })).rejects.toThrow('La date de fin doit être postérieure');
    await expect(createPlanningAssignment({ from } as never, {
      vesselId: 'inconnu',
      captainPersonId: '',
      crewPersonId: '11',
      startsOn: '2026-07-01',
      endsOn: '2026-07-14',
      assignmentRole: 'Pont',
    })).rejects.toThrow('Le navire est obligatoire');
    expect(from).not.toHaveBeenCalled();
  });

  it('keeps edited isolated-day embarkation dates coherent', async () => {
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const from = vi.fn().mockReturnValue({ update });

    await updatePlanningEvent({ from } as never, {
      id: 200,
      kind: 'day',
      vesselId: 1,
      vesselName: 'COTENTIN',
      startsOn: '2026-07-07',
      endsOn: '2026-07-07',
      statusLabel: 'En Mer',
      functionLabel: 'Pont',
      watchGroup: 'Bordée 1',
      comments: '',
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      work_date: '2026-07-07',
      departure_on: '2026-07-07',
      disembark_on: '2026-07-07',
    }));
  });

  it('transitions a displayed period through the publication RPC', async () => {
    const pendingRow = {
      ...planningPublicationRow,
      status: 'pending_validation',
      current_version: 0,
      published_at: null,
    };
    const rpc = vi.fn().mockResolvedValue({ data: pendingRow, error: null });

    await expect(transitionPlanningPublication({ rpc } as never, {
      action: 'submit',
      startsOn: '2026-07-01',
      endsOn: '2026-07-31',
      vesselId: null,
      comment: 'Préparation juillet',
    })).resolves.toEqual(expect.objectContaining({ status: 'pending_validation', currentVersion: 0 }));

    expect(rpc).toHaveBeenCalledWith('transition_planning_publication', {
      p_action: 'submit',
      p_publication_id: null,
      p_starts_on: '2026-07-01',
      p_ends_on: '2026-07-31',
      p_vessel_id: null,
      p_comment: 'Préparation juillet',
    });
  });
});
