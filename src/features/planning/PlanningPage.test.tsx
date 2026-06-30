import { render, screen, waitFor } from '@testing-library/react';
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

function createSelectClient(options: {
  vessels?: unknown[];
  people?: unknown[];
  assignments?: unknown[];
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
    expect(screen.getByText('COTENTIN')).toBeInTheDocument();
    expect(screen.getByText('Paul DURAND')).toBeInTheDocument();
    expect(screen.getByText('Jean MARTIN')).toBeInTheDocument();
    expect(screen.getByText('2026-07-01 au 2026-07-14')).toBeInTheDocument();
    expect(screen.getByLabelText('Affectations planning')).toHaveTextContent('1');
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
    await user.type(screen.getByLabelText('Nom navire'), 'SUROIT');
    await user.type(screen.getByLabelText('Acronyme'), 'SRT');
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
    await user.type(screen.getByLabelText('Debut'), '2026-08-01');
    await user.type(screen.getByLabelText('Fin'), '2026-08-07');
    await user.clear(screen.getByLabelText('Fonction'));
    await user.type(screen.getByLabelText('Fonction'), 'Quart');
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

    expect(await screen.findByText('Paul DURAND')).toBeInTheDocument();
    expect(screen.getByText('Lecture seule')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter navire' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter affectation' })).not.toBeInTheDocument();
  });
});
