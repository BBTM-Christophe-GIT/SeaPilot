import { describe, expect, it, vi } from 'vitest';
import {
  applyPlanningGridCells,
  createPlanningAssignment,
  createPlanningBoardAssignments,
  createPlanningDerogation,
  createPlanningProject,
  createVessel,
  fetchPlanningPeople,
  fetchPlanningOverview,
  fetchVessels,
  mapPlanningDayRows,
  mapPlanningAssignmentRows,
  mapPlanningAssignmentOverviewRows,
  mapPlanningPeriodRows,
  mapPlanningPeopleRows,
  mapPlanningHistoryRows,
  mapPlanningPublicationRows,
  mapPlanningVersionRows,
  mapVesselRows,
  movePlanningGridCells,
  savePlanningHandover,
  savePlanningAssignmentDayNote,
  savePlanningAssignmentDayState,
  savePlanningVesselDayLocation,
  removePlanningGridCells,
  transitionPlanningPublication,
  updatePlanningEvent,
  updatePlanningProject,
  updatePlanningVessel,
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
  confirmation_status: 'confirmed',
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

const planningProjectRow = {
  id: 600,
  title: 'Transit Cherbourg',
  starts_on: '2026-07-08',
  ends_on: '2026-07-10',
  description: null,
  client_name: 'BBTM',
  primary_vessel_id: 1,
  primary_vessel_name: 'COTENTIN',
  secondary_vessel_id: null,
  secondary_vessel_name: null,
  event_type: 'transit',
  responsible_name: 'Jean MARTIN',
  status: 'Confirmé',
  source_label: 'seapilot',
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
  submitted_by: 'user-submit',
  submitted_by_name: 'Armement',
  validated_at: '2026-07-01T09:00:00Z',
  validated_by: 'user-validate',
  validated_by_name: 'Direction',
  published_at: '2026-07-01T10:00:00Z',
  published_by: 'user-publish',
  published_by_name: 'Direction',
  locked_at: '2026-07-01T08:00:00Z',
  locked_by: 'user-submit',
  locked_by_name: 'Armement',
  updated_at: '2026-07-01T10:00:00Z',
  updated_by: 'user-publish',
  updated_by_name: 'Direction',
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
        birthDate: '',
        birthPlace: '',
        identityDocumentNumber: '',
        identityDocumentType: '',
        deckCertificateLabel: '',
        engineCertificateLabel: '',
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
        startsAt: '2026-06-30T22:00:00.000Z',
        endsAt: '2026-07-14T21:59:00.000Z',
        assignmentRole: 'Pont',
        statusLabel: 'En Mer',
        confirmationStatus: 'confirmed',
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
        startsAt: '2026-06-30T22:00:00.000Z',
        endsAt: '2026-07-14T21:59:00.000Z',
        assignmentRole: 'Pont',
        statusLabel: 'En Mer',
        confirmationStatus: 'confirmed',
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
        consecutiveRestHours: null,
        restPeriodCount: null,
        nightWorkHours: null,
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
      submittedBy: 'user-submit',
      submittedByName: 'Armement',
      validatedAt: '2026-07-01T09:00:00Z',
      validatedBy: 'user-validate',
      validatedByName: 'Direction',
      publishedAt: '2026-07-01T10:00:00Z',
      publishedBy: 'user-publish',
      publishedByName: 'Direction',
      lockedAt: '2026-07-01T08:00:00Z',
      lockedBy: 'user-submit',
      lockedByName: 'Armement',
      updatedAt: '2026-07-01T10:00:00Z',
      updatedBy: 'user-publish',
      updatedByName: 'Direction',
    }]);
  });

  it('maps immutable versions and semantic history metadata', () => {
    expect(mapPlanningVersionRows([{
      id: 9,
      publication_id: 500,
      version_number: 2,
      comment: 'Relève intégrée',
      created_at: '2026-07-14T10:00:00Z',
      created_by: 'user-id',
      created_by_name: 'Direction BBTM',
    }])).toEqual([expect.objectContaining({
      publicationId: 500,
      versionNumber: 2,
      createdByName: 'Direction BBTM',
    })]);

    expect(mapPlanningHistoryRows([{
      id: 12,
      entity_kind: 'assignment',
      entity_id: 100,
      action: 'move',
      payload: { before: {}, after: {} },
      changed_by: 'user-id',
      changed_by_name: 'Armement BBTM',
      changed_at: '2026-07-14T09:00:00Z',
      vessel_id: 1,
      starts_on: '2026-07-15',
      ends_on: '2026-07-21',
      summary: 'Événement déplacé ou redimensionné',
    }])).toEqual([expect.objectContaining({
      action: 'move',
      vesselId: 1,
      changedByName: 'Armement BBTM',
    })]);
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

      if (table === 'planning_versions') {
        return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      }

      if (table === 'planning_handovers' || table === 'planning_handover_positions' || table === 'planning_derogations') {
        return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      }

      if (table === 'planning_change_log') {
        return { select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }),
          order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }),
        }) };
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
      versions: [],
      history: [],
      handovers: [],
      derogations: [],
      derogationHistory: [],
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

      if (table === 'planning_versions') {
        return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      }

      if (table === 'planning_handovers' || table === 'planning_handover_positions' || table === 'planning_derogations') {
        return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      }

      if (table === 'planning_change_log') {
        return { select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }),
          order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }),
        }) };
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
      versions: [],
      history: [],
      handovers: [],
      derogations: [],
      derogationHistory: [],
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

  it('updates a vessel sheet and records its audit metadata', async () => {
    const single = vi.fn().mockResolvedValue({ data: { ...vesselRow, name: 'COTENTIN II' }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    const auditInsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockImplementation((table: string) => table === 'vessels' ? { update } : { insert: auditInsert });

    await expect(updatePlanningVessel({ from } as never, { id: 1, name: ' COTENTIN II ', acronym: ' CT2 ' })).resolves.toMatchObject({ name: 'COTENTIN II' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ name: 'COTENTIN II', acronym: 'CT2' }));
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({ entity_kind: 'vessel', entity_id: 1, action: 'update' }));
  });

  it('inserts an assignment with nullable captain and default source', async () => {
    const createdRow = {
      ...assignmentRow,
      captain_person_id: null,
      assignment_role: 'crew',
      status_label: 'En Mer',
      confirmation_status: 'confirmed',
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
      confirmation_status: 'confirmed',
      watch_group: 'Affectation',
      comments: null,
      source_label: 'seapilot',
    });
  });

  it('stores an assignment spanning midnight as UTC instants and two civil dates', async () => {
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
      startsAt: '2026-10-24T22:00',
      endsAt: '2026-10-25T06:00',
      assignmentRole: 'Pont',
    });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      starts_on: '2026-10-24',
      ends_on: '2026-10-25',
      starts_at: '2026-10-24T20:00:00.000Z',
      ends_at: '2026-10-25T05:00:00.000Z',
    }));
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

  it('saves a trimmed fleet location through the protected daily RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 201, error: null });

    await expect(savePlanningVesselDayLocation({ rpc } as never, {
      vesselId: 1,
      workDate: '2026-07-14',
      location: '  Cherbourg  ',
    })).resolves.toBe(201);
    expect(rpc).toHaveBeenCalledWith('save_planning_vessel_day_location', {
      p_vessel_id: 1,
      p_work_date: '2026-07-14',
      p_location: 'Cherbourg',
    });

    await expect(savePlanningVesselDayLocation({ rpc } as never, {
      vesselId: 1,
      workDate: '14/07/2026',
      location: 'Cherbourg',
    })).rejects.toThrow('Les dates doivent être valides et utiliser le format YYYY-MM-DD.');
  });

  it('saves a short per-day assignment text through the protected RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 901, error: null });

    await expect(savePlanningAssignmentDayNote({ rpc } as never, {
      assignmentId: 100,
      workDate: '2026-07-14',
      note: ' Port Chantereyne ',
    })).resolves.toBe(901);
    expect(rpc).toHaveBeenCalledWith('save_planning_assignment_day_note', {
      p_assignment_id: 100,
      p_work_date: '2026-07-14',
      p_note: 'Port Chantereyne',
    });
  });

  it('rejects an overlong per-day assignment text before Supabase', async () => {
    const rpc = vi.fn();
    await expect(savePlanningAssignmentDayNote({ rpc } as never, {
      assignmentId: 100,
      workDate: '2026-07-14',
      note: 'x'.repeat(33),
    })).rejects.toThrow('32 caractères');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('creates a typed fleet event and returns the normalized Supabase row', async () => {
    const single = vi.fn().mockResolvedValue({ data: planningProjectRow, error: null });
    const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
    const from = vi.fn().mockReturnValue({ insert });

    await expect(createPlanningProject({ from } as never, {
      title: ' Transit Cherbourg ',
      startsOn: '2026-07-08',
      endsOn: '2026-07-10',
      status: 'Confirmé',
      eventType: 'transit',
      vesselId: 1,
      vesselName: 'COTENTIN',
      responsibleName: ' Jean MARTIN ',
      clientName: 'BBTM',
      description: '',
    })).resolves.toEqual(expect.objectContaining({ id: 600, eventType: 'transit', responsibleName: 'Jean MARTIN' }));

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Transit Cherbourg',
      event_type: 'transit',
      responsible_name: 'Jean MARTIN',
      primary_vessel_id: 1,
      primary_vessel_name: 'COTENTIN',
    }));
  });

  it('updates a fleet event and rejects an incoherent range before Supabase', async () => {
    const single = vi.fn().mockResolvedValue({ data: { ...planningProjectRow, title: 'Transit Barfleur' }, error: null });
    const eq = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    const input = {
      id: 600,
      title: 'Transit Barfleur',
      startsOn: '2026-07-09',
      endsOn: '2026-07-11',
      status: 'Confirmé',
      eventType: 'transit' as const,
      vesselId: 1,
      vesselName: 'COTENTIN',
      responsibleName: 'Jean MARTIN',
      clientName: 'BBTM',
      description: 'Mise en place',
    };
    await expect(updatePlanningProject({ from } as never, input)).resolves.toEqual(expect.objectContaining({ title: 'Transit Barfleur' }));
    expect(eq).toHaveBeenCalledWith('id', 600);

    await expect(updatePlanningProject({ from: vi.fn() } as never, { ...input, startsOn: '2026-07-12', endsOn: '2026-07-11' })).rejects.toThrow('La date de fin doit être postérieure');
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

  it('saves a complete handover transaction through the protected RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 77, error: null });

    await expect(savePlanningHandover({ rpc } as never, {
      vesselId: '1',
      handoverAt: '2026-07-15T12:00',
      location: 'Cherbourg',
      durationMinutes: 90,
      responsiblePersonId: '10',
      comments: 'Passation à quai',
      status: 'confirmed',
      positions: [{
        functionLabel: 'Capitaine',
        outgoingPersonId: '10',
        incomingPersonId: '11',
        outgoingAssignmentId: '100',
        incomingAssignmentId: '101',
        comments: 'Dossiers transmis',
      }],
    })).resolves.toBe(77);

    expect(rpc).toHaveBeenCalledWith('save_planning_handover', expect.objectContaining({
      p_vessel_id: 1,
      p_handover_at: '2026-07-15T10:00:00.000Z',
      p_location: 'Cherbourg',
      p_duration_minutes: 90,
      p_responsible_person_id: 10,
      p_status: 'confirmed',
      p_positions: [{
        function_label: 'Capitaine',
        outgoing_person_id: 10,
        incoming_person_id: 11,
        outgoing_assignment_id: 100,
        incoming_assignment_id: 101,
        comments: 'Dossiers transmis',
      }],
    }));
  });

  it('saves one of the four visible daily states with its short comment', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 8, error: null });
    await expect(savePlanningAssignmentDayState({ rpc } as never, {
      assignmentId: 12,
      workDate: '2026-07-14',
      status: 'Repos',
      note: 'Passation',
    })).resolves.toBe(8);
    expect(rpc).toHaveBeenCalledWith('save_planning_assignment_day_state', {
      p_assignment_id: 12,
      p_work_date: '2026-07-14',
      p_status: 'Repos',
      p_note: 'Passation',
    });
  });

  it('persists painted cells through one batch RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { savedCells: 2, createdAssignments: 1 }, error: null });
    await expect(applyPlanningGridCells({ rpc } as never, [{
      personId: 12, vesselId: 4, assignmentId: null, workDate: '2026-07-14',
      status: 'En Mer', note: 'Cherbourg', watchGroup: 'Bordée 1', functionLabel: 'Capitaine',
    }])).resolves.toEqual({ savedCells: 2, createdAssignments: 1 });
    expect(rpc).toHaveBeenCalledWith('apply_planning_grid_cells', { p_cells: [{
      personId: 12, vesselId: 4, assignmentId: null, workDate: '2026-07-14',
      status: 'En Mer', note: 'Cherbourg', watchGroup: 'Bordée 1', functionLabel: 'Capitaine',
    }] });
  });

  it('removes selected dates with an explicit history reason', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { deletedCells: 2, affectedAssignments: 1, createdSplits: 1 }, error: null });
    const cells = [{
      personId: 12, vesselId: 4, assignmentId: 9, workDate: '2026-07-14',
      status: 'En Mer' as const, note: '', watchGroup: 'Bordée 1', functionLabel: 'Capitaine',
    }];
    await expect(removePlanningGridCells({ rpc } as never, cells, 'Conflit résolu')).resolves.toEqual({ deletedCells: 2, affectedAssignments: 1, createdSplits: 1 });
    expect(rpc).toHaveBeenCalledWith('remove_planning_grid_cells', {
      p_cells: [expect.objectContaining({ assignmentId: 9, workDate: '2026-07-14' })],
      p_reason: 'Conflit résolu',
    });
  });

  it('moves cut cells through one transactional RPC', async () => {
    const result = {
      applied: { savedCells: 1, createdAssignments: 1 },
      removed: { deletedCells: 1, affectedAssignments: 1, createdSplits: 0 },
    };
    const rpc = vi.fn().mockResolvedValue({ data: result, error: null });
    const source = [{ personId: 12, vesselId: 4, assignmentId: 9, workDate: '2026-07-14', status: 'En Mer' as const, note: '', watchGroup: 'Bordée 1', functionLabel: 'Capitaine' }];
    const target = [{ ...source[0], vesselId: 5, assignmentId: null, workDate: '2026-07-18' }];
    await expect(movePlanningGridCells({ rpc } as never, source, target, 'Couper-coller')).resolves.toEqual(result);
    expect(rpc).toHaveBeenCalledWith('move_planning_grid_cells', expect.objectContaining({
      p_source_cells: [expect.objectContaining({ vesselId: 4, workDate: '2026-07-14' })],
      p_target_cells: [expect.objectContaining({ vesselId: 5, workDate: '2026-07-18' })],
      p_reason: 'Couper-coller',
    }));
  });

  it('creates selected board positions through the atomic RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [21, 22], error: null });
    await expect(createPlanningBoardAssignments({ rpc } as never, {
      vesselId: 3,
      watchGroup: 'Bordée 2',
      startsOn: '2026-07-14',
      endsOn: '2026-07-28',
      positions: [{ personId: 5, functionLabel: 'Capitaine' }, { personId: 6, functionLabel: 'Matelot' }],
    })).resolves.toEqual([21, 22]);
    expect(rpc).toHaveBeenCalledWith('create_planning_board_assignments', expect.objectContaining({
      p_vessel_id: 3,
      p_watch_group: 'Bordée 2',
      p_positions: [{ personId: 5, functionLabel: 'Capitaine' }, { personId: 6, functionLabel: 'Matelot' }],
    }));
  });

  it('creates an attributed and bounded derogation payload', async () => {
    const row = {
      id: 88,
      rule_id: 4,
      assignment_id: 100,
      person_id: 11,
      vessel_id: 1,
      reason: 'Dérogation validée par la direction maritime',
      starts_at: '2026-07-20T06:00:00.000Z',
      ends_at: '2026-07-26T18:00:00.000Z',
      evidence_url: null,
      status: 'active',
      author_id: '00000000-0000-0000-0000-000000000001',
      author_name: 'Admin SeaPilot',
      created_at: '2026-07-13T20:00:00.000Z',
      updated_at: '2026-07-13T20:00:00.000Z',
    };
    const single = vi.fn().mockResolvedValue({ data: row, error: null });
    const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
    const from = vi.fn().mockReturnValue({ insert });

    await expect(createPlanningDerogation({ from } as never, {
      ruleId: '4',
      assignmentId: 100,
      personId: '11',
      vesselId: '1',
      reason: ' Dérogation validée par la direction maritime ',
      startsAt: '2026-07-20T08:00',
      endsAt: '2026-07-26T20:00',
    })).resolves.toEqual(expect.objectContaining({ id: 88, authorName: 'Admin SeaPilot', status: 'active' }));

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      rule_id: 4,
      assignment_id: 100,
      person_id: 11,
      vessel_id: 1,
      reason: 'Dérogation validée par la direction maritime',
      starts_at: '2026-07-20T06:00:00.000Z',
      ends_at: '2026-07-26T18:00:00.000Z',
      status: 'active',
    }));
  });
});
