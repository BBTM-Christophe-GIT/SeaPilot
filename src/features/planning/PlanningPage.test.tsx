import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlanningPage } from './PlanningPage';

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

const secondVesselRow = {
  id: 2,
  name: 'SUROIT',
  acronym: 'SRT',
  active: true,
};

const secondCrewRow = {
  id: 12,
  first_name: 'Luc',
  last_name: 'MOREL',
  function_label: 'Mecanicien',
  active: true,
};

const secondAssignmentOverviewRow = {
  ...assignmentOverviewRow,
  id: 101,
  vessel_id: 2,
  crew_person_id: 12,
  vessel_name: 'SUROIT',
  crew_name: 'Luc MOREL',
  starts_on: '2026-08-01',
  ends_on: '2026-08-07',
  assignment_role: 'Machine',
};

const secondPlanningDayRow = {
  ...planningDayRow,
  id: 201,
  crew_name: 'Luc MOREL',
  vessel_name: 'SUROIT',
  work_date: '2026-08-03',
  disembark_on: '2026-08-07',
  sailor_status: 'Debarque',
  day_status: 'Repos',
  function_label: 'Machine',
  slot365: 'SLOT-456',
};

const secondPlanningPeriodRow = {
  ...planningPeriodRow,
  id: 301,
  crew_name: 'Luc MOREL',
  vessel_name: 'SUROIT',
  sailor_status: 'Debarque',
  function_label: 'Machine',
  starts_on: '2026-08-01',
  ends_on: '2026-08-07',
  slot365_source_key: 'SLOT-456',
};

function createSelectClient(options: {
  vessels?: unknown[];
  people?: unknown[];
  assignments?: unknown[];
  days?: unknown[];
  periods?: unknown[];
  createdVessel?: unknown;
  createdAssignment?: unknown;
}) {
  const insertVessel = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: options.createdVessel || vesselRow, error: null }),
    }),
  });
  const insertAssignment = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: options.createdAssignment || assignmentRow, error: null }),
    }),
  });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'vessels') {
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: options.vessels ?? [vesselRow], error: null }),
        }),
        insert: insertVessel,
      };
    }

    if (table === 'people') {
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: options.people ?? [captainRow, crewRow], error: null }),
          }),
        }),
      };
    }

    if (table === 'planning_assignments') {
      return {
        insert: insertAssignment,
      };
    }

    if (table === 'planning_days') {
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: options.days ?? [], error: null }),
          }),
        }),
      };
    }

    if (table === 'planning_periods') {
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: options.periods ?? [], error: null }),
          }),
        }),
      };
    }

    throw new Error(`Unexpected table ${table}`);
  });
  const rpc = vi.fn().mockImplementation((functionName: string) => {
    if (functionName === 'planning_assignment_overview') {
      return Promise.resolve({ data: options.assignments ?? [assignmentOverviewRow], error: null });
    }

    throw new Error(`Unexpected RPC ${functionName}`);
  });

  return { client: { from, rpc }, insertVessel, insertAssignment };
}

describe('PlanningPage', () => {
  it('renders planning assignments from Supabase data', async () => {
    const { client } = createSelectClient({});

    render(<PlanningPage client={client as never} roles={['admin']} />);

    expect(await screen.findByRole('heading', { name: 'Planning' })).toBeInTheDocument();
    expect(screen.getAllByText('COTENTIN').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Paul DURAND').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Jean MARTIN').length).toBeGreaterThan(0);
    expect(screen.getByText('2026-07-01 au 2026-07-14')).toBeInTheDocument();
    expect(screen.getByLabelText('Affectations planning')).toHaveTextContent('1');
  });

  it('renders imported SMTR planning days and periods', async () => {
    const { client } = createSelectClient({
      assignments: [],
      days: [planningDayRow],
      periods: [planningPeriodRow],
    });

    render(<PlanningPage client={client as never} roles={['direction']} />);

    expect(await screen.findByRole('heading', { name: 'Planning' })).toBeInTheDocument();
    expect(screen.getByLabelText('Journees SMTR')).toHaveTextContent('1');
    expect(screen.getByLabelText('Periodes SMTR')).toHaveTextContent('1');
    expect(screen.getByRole('region', { name: 'Planning importe SharePoint' })).toBeInTheDocument();
    expect(screen.getAllByText('SLOT-123').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Paul DURAND').length).toBeGreaterThan(0);
    expect(screen.getAllByText('COTENTIN').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Travaille').length).toBeGreaterThan(0);
    expect(screen.getByText('2026-07-01')).toBeInTheDocument();
    expect(screen.getByText('2026-07-01 au 2026-07-14')).toBeInTheDocument();
  });

  it('filters planning by vessel, sailor, period and status', async () => {
    const user = userEvent.setup();
    const { client } = createSelectClient({
      vessels: [vesselRow, secondVesselRow],
      people: [captainRow, crewRow, secondCrewRow],
      assignments: [assignmentOverviewRow, secondAssignmentOverviewRow],
      days: [planningDayRow, secondPlanningDayRow],
      periods: [planningPeriodRow, secondPlanningPeriodRow],
    });

    render(<PlanningPage client={client as never} roles={['direction']} />);

    expect((await screen.findAllByText('Luc MOREL')).length).toBeGreaterThan(0);

    await user.selectOptions(screen.getByLabelText('Filtre navire'), 'COTENTIN');
    await user.selectOptions(screen.getByLabelText('Filtre marin'), 'Paul DURAND');
    fireEvent.change(screen.getByLabelText('Debut filtre'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('Fin filtre'), { target: { value: '2026-07-31' } });
    await user.selectOptions(screen.getByLabelText('Filtre statut'), 'Embarque');

    expect(screen.getAllByText('COTENTIN').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Paul DURAND').length).toBeGreaterThan(0);
    expect(screen.queryByText('SLOT-456')).not.toBeInTheDocument();
    expect(screen.queryByText('2026-08-03')).not.toBeInTheDocument();
    expect(screen.queryByText('Machine')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Affectations planning')).toHaveTextContent('0');
    expect(screen.getByLabelText('Journees SMTR')).toHaveTextContent('1');
    expect(screen.getByLabelText('Periodes SMTR')).toHaveTextContent('1');
  });

  it('creates a vessel for office roles', async () => {
    const user = userEvent.setup();
    const createdVessel = {
      id: 2,
      name: 'SUROIT',
      acronym: 'SRT',
      active: true,
    };
    const { client, insertVessel } = createSelectClient({
      vessels: [vesselRow],
      assignments: [],
      createdVessel,
    });

    render(<PlanningPage client={client as never} roles={['armement']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    fireEvent.change(screen.getByLabelText('Nom navire'), { target: { value: 'SUROIT' } });
    fireEvent.change(screen.getByLabelText('Acronyme'), { target: { value: 'SRT' } });
    await user.click(screen.getByRole('button', { name: 'Ajouter navire' }));

    await waitFor(() =>
      expect(insertVessel).toHaveBeenCalledWith({
        name: 'SUROIT',
        acronym: 'SRT',
      }),
    );
    expect(await screen.findByText('Navire ajoute.')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'SUROIT (SRT)' })).toBeInTheDocument();
  });

  it('creates a planning assignment for office roles', async () => {
    const user = userEvent.setup();
    const createdAssignment = {
      id: 101,
      vessel_id: 1,
      captain_person_id: 10,
      crew_person_id: 11,
      starts_on: '2026-08-01',
      ends_on: '2026-08-07',
      assignment_role: 'Quart',
      source_label: 'seapilot',
    };
    const { client, insertAssignment } = createSelectClient({
      assignments: [],
      createdAssignment,
    });

    render(<PlanningPage client={client as never} roles={['direction']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    await user.selectOptions(screen.getByLabelText('Navire'), '1');
    await user.selectOptions(screen.getByLabelText('Marin'), '11');
    await user.selectOptions(screen.getByLabelText('Capitaine'), '10');
    fireEvent.change(screen.getByLabelText('Debut'), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText('Fin'), { target: { value: '2026-08-07' } });
    fireEvent.change(screen.getByLabelText('Fonction'), { target: { value: 'Quart' } });
    await user.click(screen.getByRole('button', { name: 'Ajouter affectation' }));

    await waitFor(() =>
      expect(insertAssignment).toHaveBeenCalledWith({
        vessel_id: 1,
        captain_person_id: 10,
        crew_person_id: 11,
        starts_on: '2026-08-01',
        ends_on: '2026-08-07',
        assignment_role: 'Quart',
        source_label: 'seapilot',
      }),
    );
    expect(await screen.findByText('Affectation ajoutee.')).toBeInTheDocument();
    expect(screen.getByText('2026-08-01 au 2026-08-07')).toBeInTheDocument();
  });

  it('keeps marins in read-only mode', async () => {
    const { client } = createSelectClient({});

    render(<PlanningPage client={client as never} roles={['marin']} />);

    expect((await screen.findAllByText('Paul DURAND')).length).toBeGreaterThan(0);
    expect(screen.getByText('Lecture seule')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter navire' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter affectation' })).not.toBeInTheDocument();
  });
});
