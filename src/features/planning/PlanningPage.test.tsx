import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlanningPage } from './PlanningPage';
import { todayPlanningDate } from './planningDates';

const vesselRow = { id: 1, name: 'COTENTIN', acronym: 'CTN', active: true };
const secondVesselRow = { id: 2, name: 'SUROIT', acronym: 'SRT', active: true };
const captainRow = {
  id: 10,
  first_name: 'Jean',
  last_name: 'MARTIN',
  function_label: 'Capitaine',
  grade_label: 'Officier',
  role_label: null,
  contract_type: 'CDI',
  hired_on: '2020-01-01',
  departed_on: null,
  active: true,
};
const crewRow = {
  id: 11,
  first_name: 'Paul',
  last_name: 'DURAND',
  function_label: 'Matelot',
  grade_label: 'Matelot',
  role_label: null,
  contract_type: 'CDI',
  hired_on: '2022-01-01',
  departed_on: null,
  active: true,
};
const secondCrewRow = { ...crewRow, id: 12, first_name: 'Luc', last_name: 'MOREL', function_label: 'Mécanicien' };
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
  sailor_status: 'Embarqué',
  day_status: 'Travaille',
  rhythm_label: '12h',
  watch_group: 'Bordée 1',
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
  watch_group: 'Bordée 1',
  function_label: 'Pont',
  sailor_status: 'Embarqué',
  starts_on: '2026-07-01',
  ends_on: '2026-07-14',
  year_number: 2026,
  comments: 'Rotation A',
  slot365_source_id: '200',
  slot365_source_key: 'SLOT-123',
  source_label: 'sharepoint',
};
const planningLocationRow = {
  ...planningDayRow,
  id: 201,
  person_id: null,
  vessel_id: 1,
  crew_name: '',
  captain_name: '',
  work_date: '2026-07-14',
  disembark_on: null,
  day_number: 14,
  function_label: '',
  sailor_status: '',
  day_status: 'Lieu du personnel',
  rhythm_label: '',
  watch_group: '',
  slot365: '',
  departure_on: null,
  worked_hours: null,
  rest_24h: null,
  cumulative_7d: null,
  comments: 'Cherbourg',
  source_label: 'seapilot-vessel-location',
};
const planningProjectRow = {
  id: 600,
  title: 'Transit Cherbourg',
  starts_on: '2026-07-08',
  ends_on: '2026-07-10',
  description: 'Mise en place',
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
const medicalDocumentRow = {
  id: 400,
  person_id: 11,
  person_name: 'Paul DURAND',
  category_key: 'medical',
  title: 'Visite médicale',
  status: 'expired',
  expires_on: '2026-07-15',
  requires_captain_validation: false,
  medical_restriction: null,
  medical_unfit: false,
  file_url: null,
};
const publicationRow = {
  id: 500,
  vessel_id: null,
  scope_key: 'fleet',
  starts_on: '2026-06-29',
  ends_on: '2026-08-16',
  status: 'published',
  current_version: 1,
  comment: 'Version opérationnelle',
  submitted_at: '2026-07-13T08:00:00Z',
  submitted_by: 'user-submit',
  submitted_by_name: 'Armement BBTM',
  validated_at: '2026-07-13T09:00:00Z',
  validated_by: 'user-validate',
  validated_by_name: 'Direction BBTM',
  published_at: '2026-07-13T10:00:00Z',
  published_by: 'user-publish',
  published_by_name: 'Direction BBTM',
  locked_at: '2026-07-13T08:00:00Z',
  locked_by: 'user-submit',
  locked_by_name: 'Armement BBTM',
  updated_at: '2026-07-13T10:00:00Z',
  updated_by: 'user-publish',
  updated_by_name: 'Direction BBTM',
};

function createClient(options: {
  vessels?: unknown[];
  people?: unknown[];
  assignments?: unknown[];
  days?: unknown[];
  periods?: unknown[];
  projects?: unknown[];
  certificates?: unknown[];
  hrDocuments?: unknown[];
  rules?: unknown[];
  publications?: unknown[];
  versions?: unknown[];
  history?: unknown[];
  handovers?: unknown[];
  handoverPositions?: unknown[];
  derogations?: unknown[];
  derogationHistory?: unknown[];
  createdAssignment?: unknown;
  createdProject?: unknown;
  updatedProject?: unknown;
  transitionedPublication?: unknown;
  assistantAccess?: unknown[];
  matrices?: unknown[];
  manningRequirements?: unknown[];
  vesselResponses?: Array<{ data: unknown[] | null; error: unknown }>;
} = {}) {
  const insertAssignment = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: options.createdAssignment || assignmentRow, error: null }),
    }),
  });
  const insertProjectSingle = vi.fn().mockResolvedValue({ data: options.createdProject || planningProjectRow, error: null });
  const insertProject = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: insertProjectSingle }) });
  const updateProjectSingle = vi.fn().mockResolvedValue({ data: options.updatedProject || planningProjectRow, error: null });
  const updateProjectEq = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: updateProjectSingle }) });
  const updateProject = vi.fn().mockReturnValue({ eq: updateProjectEq });
  const updateAssignmentEq = vi.fn().mockResolvedValue({ error: null });
  const updateAssignment = vi.fn().mockReturnValue({ eq: updateAssignmentEq });
  const vesselOrder = vi.fn();
  options.vesselResponses?.forEach((response) => vesselOrder.mockResolvedValueOnce(response));
  vesselOrder.mockResolvedValue({ data: options.vessels ?? [vesselRow], error: null });
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'vessels') {
      return { select: vi.fn().mockReturnValue({ order: vesselOrder }) };
    }
    if (table === 'people') {
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: options.people ?? [captainRow, crewRow], error: null }) }),
        }),
      };
    }
    if (table === 'planning_days') {
      return { select: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: options.days ?? [], error: null }) }) }) };
    }
    if (table === 'planning_periods') {
      return { select: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: options.periods ?? [], error: null }) }) }) };
    }
    if (table === 'planning_projects') {
      return {
        select: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: options.projects ?? [], error: null }) }) }),
        insert: insertProject,
        update: updateProject,
      };
    }
    if (table === 'fleet_certificates') {
      return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: options.certificates ?? [], error: null }) }) };
    }
    if (table === 'hr_documents') {
      return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: options.hrDocuments ?? [], error: null }) }) };
    }
    if (table === 'planning_rules') {
      return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: options.rules ?? [], error: null }) }) };
    }
    if (table === 'planning_publications') {
      return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: options.publications ?? [], error: null }) }) };
    }
    if (table === 'planning_versions') {
      return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: options.versions ?? [], error: null }) }) };
    }
    if (table === 'planning_handovers') {
      return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: options.handovers ?? [], error: null }) }) };
    }
    if (table === 'planning_handover_positions') {
      return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: options.handoverPositions ?? [], error: null }) }) };
    }
    if (table === 'planning_derogations') {
      return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: options.derogations ?? [], error: null }) }) };
    }
    if (table === 'planning_manning_matrices') {
      return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: options.matrices ?? [], error: null }) }) };
    }
    if (table === 'planning_manning_requirements') {
      return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: options.manningRequirements ?? [], error: null }) }) };
    }
    if (table === 'planning_change_log') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: options.derogationHistory ?? [], error: null }) }),
          order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: options.history ?? [], error: null }) }),
        }),
      };
    }
    if (table === 'planning_assignments') return { insert: insertAssignment, update: updateAssignment };
    throw new Error(`Unexpected table ${table}`);
  });
  const rpc = vi.fn().mockImplementation((functionName: string) => {
    if (functionName === 'planning_assignment_overview') {
      return Promise.resolve({ data: options.assignments ?? [assignmentOverviewRow], error: null });
    }
    if (functionName === 'transition_planning_publication') {
      return Promise.resolve({
        data: options.transitionedPublication ?? { ...publicationRow, status: 'pending_validation', current_version: 0, published_at: null },
        error: null,
      });
    }
    if (functionName === 'get_planning_assistant_access') {
      return Promise.resolve({ data: options.assistantAccess ?? [{ has_access: true, access_mode: 'administrator', expires_on: null, can_manage_pilots: true }], error: null });
    }
    if (functionName === 'save_planning_vessel_day_location') {
      return Promise.resolve({ data: 201, error: null });
    }
    if (functionName === 'save_planning_assignment_day_note') {
      return Promise.resolve({ data: 202, error: null });
    }
    if (functionName === 'save_planning_assignment_day_state') {
      return Promise.resolve({ data: 202, error: null });
    }
    if (functionName === 'apply_planning_grid_cells') {
      return Promise.resolve({ data: { savedCells: 1, createdAssignments: 1 }, error: null });
    }
    if (functionName === 'remove_planning_grid_cells') {
      return Promise.resolve({ data: { deletedCells: 1, affectedAssignments: 1, createdSplits: 0 }, error: null });
    }
    if (functionName === 'resolve_planning_grid_conflict_cells') {
      return Promise.resolve({ data: { deletedCells: 1, affectedAssignments: 1, createdSplits: 0 }, error: null });
    }
    if (functionName === 'move_planning_grid_cells') {
      return Promise.resolve({ data: { applied: { savedCells: 1, createdAssignments: 1 }, removed: { deletedCells: 1, affectedAssignments: 1, createdSplits: 0 } }, error: null });
    }
    if (functionName === 'create_planning_board_assignments') {
      return Promise.resolve({ data: [301], error: null });
    }
    throw new Error(`Unexpected RPC ${functionName}`);
  });
  return { client: { from, rpc }, from, rpc, insertAssignment, insertProject, updateProject, updateAssignment, vesselOrder };
}

describe('PlanningPage cockpit', () => {
  it('keeps P2.2 hidden by default and exposes it only after the flag and server access agree', async () => {
    const user = userEvent.setup();
    const { client, rpc } = createClient({ projects: [planningProjectRow] });
    const { rerender } = render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('button', { name: 'Outils' }));
    expect(screen.queryByRole('button', { name: /Prévisions et scénarios/ })).not.toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith('get_planning_assistant_access');

    rerender(<PlanningPage client={client as never} predictionsFeatureEnabled roles={['admin']} />);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('get_planning_assistant_access'));
    if (screen.getByRole('button', { name: 'Outils' }).getAttribute('aria-expanded') !== 'true') {
      await user.click(screen.getByRole('button', { name: 'Outils' }));
    }
    expect(await screen.findByRole('button', { name: /Prévisions et scénarios/ })).toBeInTheDocument();
  });

  it('renders the monthly crew view and the imported assignment', async () => {
    const user = userEvent.setup();
    const { client } = createClient({ assignments: [assignmentOverviewRow], periods: [planningPeriodRow] });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    expect(await screen.findByRole('heading', { name: 'Planning' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Équipages' }));
    expect(screen.getByRole('button', { name: 'Mois' })).toHaveClass('is-active');
    expect(screen.getAllByText('COTENTIN').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Paul DURAND').length).toBeGreaterThan(0);
    expect(screen.getByRole('tab', { name: 'Équipages' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('button', { name: /Paul DURAND, En Mer/ }).length).toBeGreaterThan(0);
  });

  it('keeps the current planning visible when a refresh fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { client } = createClient({
      periods: [planningPeriodRow],
      vesselResponses: [
        { data: [vesselRow], error: null },
        { data: null, error: { code: 'PGRST001', message: 'timeout' } },
      ],
    });
    const user = userEvent.setup();
    render(<PlanningPage client={client as never} roles={['admin']} />);

    expect(await screen.findByRole('heading', { name: 'Planning' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Actualiser' }));
    expect(await screen.findByText('Impossible de charger les navires.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Planning' })).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('does not load Supabase data without a Planning read role', () => {
    const { client, from } = createClient();
    render(<PlanningPage client={client as never} roles={[]} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Vous n’avez pas accès au module Planning.');
    expect(from).not.toHaveBeenCalled();
  });

  it('opens a detailed imported SMTR period', async () => {
    const user = userEvent.setup();
    const { client } = createClient({ assignments: [], days: [planningDayRow], periods: [planningPeriodRow] });
    render(<PlanningPage client={client as never} roles={['direction']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('tab', { name: 'Équipages' }));
    const periodButton = screen.getByRole('button', { name: /Paul DURAND, En Mer/ });
    await user.dblClick(periodButton);
    expect(screen.getByRole('dialog')).toHaveTextContent('Rotation A');
    expect(screen.getByRole('dialog')).toHaveTextContent('sharepoint');
  });

  it('filters the hierarchy by vessel and sailor', async () => {
    const user = userEvent.setup();
    const secondPeriod = { ...planningPeriodRow, id: 301, crew_name: 'Luc MOREL', vessel_name: 'SUROIT' };
    const { client } = createClient({
      vessels: [vesselRow, secondVesselRow],
      people: [captainRow, crewRow, secondCrewRow],
      assignments: [],
      periods: [planningPeriodRow, secondPeriod],
    });
    render(<PlanningPage client={client as never} roles={['direction']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('tab', { name: 'Équipages' }));
    expect((await screen.findAllByText('Luc MOREL')).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Filtres' }));
    await user.selectOptions(screen.getByLabelText('Filtre navire'), 'COTENTIN');
    await user.selectOptions(screen.getByLabelText('Filtre marin'), 'Paul DURAND');
    const calendar = screen.getByRole('region', { name: 'Calendrier des affectations' });
    const calendarBody = calendar.querySelector('.planning-calendar-body') as HTMLElement;
    expect(within(calendarBody).getByText('Paul DURAND')).toBeInTheDocument();
    expect(within(calendarBody).queryByText('Luc MOREL')).not.toBeInTheDocument();
    expect(within(calendarBody).queryByText('SUROIT')).not.toBeInTheDocument();
  });

  it('switches between fleet and crew lanes with all P0.2 time scales', async () => {
    const user = userEvent.setup();
    const { client } = createClient({ vessels: [vesselRow, secondVesselRow], periods: [planningPeriodRow], projects: [planningProjectRow] });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    expect(screen.getByRole('tab', { name: 'Flotte' })).toHaveAttribute('aria-selected', 'true');
    expect(document.querySelector('.planning-board-titlebar')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Légende et gestes du planning')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Conflits planning')).not.toBeInTheDocument();
    expect(screen.getByText('Navires · Bordées · Marins')).toBeInTheDocument();
    expect(screen.getByText('Bordée 1')).toBeInTheDocument();
    expect(screen.getAllByText('Paul DURAND').length).toBeGreaterThan(0);
    expect(screen.queryByText('SUROIT')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Transit Transit Cherbourg/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Replier COTENTIN' }));
    expect(screen.queryByText('Bordée 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Paul DURAND')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Déplier COTENTIN' }));
    for (const label of ['Jour', 'Semaine', '2 sem.', 'Mois', 'An']) {
      const scaleButton = screen.getByRole('button', { name: label });
      expect(scaleButton).toBeInTheDocument();
      await user.click(scaleButton);
      expect(document.querySelector('.planning-calendar-scroll')).toHaveAttribute('data-planning-view-mode');
    }
    await user.click(screen.getByRole('tab', { name: 'Équipages' }));
    expect(screen.getByRole('button', { name: 'Marins' })).toHaveClass('is-active');
    await user.click(screen.getByRole('button', { name: 'Équipes' }));
    expect(screen.getByRole('button', { name: 'Équipes' })).toHaveClass('is-active');
    expect(screen.queryByRole('tab', { name: 'Navire' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Marin' })).not.toBeInTheDocument();
  }, 30_000);

  it('creates a fleet event from the complete side panel', async () => {
    const user = userEvent.setup();
    const createdProject = { ...planningProjectRow, id: 601, title: 'Maintenance annuelle', event_type: 'maintenance', status: 'A planifier' };
    const { client, insertProject } = createClient({ projects: [], createdProject });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('button', { name: 'Nouveau projet' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Titre'), 'Maintenance annuelle');
    await user.selectOptions(within(dialog).getByLabelText('Navire'), '1');
    await user.selectOptions(within(dialog).getByLabelText('Type'), 'maintenance');
    fireEvent.change(within(dialog).getByLabelText('Début'), { target: { value: '2026-07-20' } });
    fireEvent.change(within(dialog).getByLabelText('Fin'), { target: { value: '2026-07-22' } });
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(insertProject).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Maintenance annuelle',
      event_type: 'maintenance',
      primary_vessel_id: 1,
      starts_on: '2026-07-20',
      ends_on: '2026-07-22',
    })));
    expect(await screen.findByText('Événement flotte créé.')).toBeInTheDocument();
  }, 20_000);

  it('keeps fleet filters active and avoids a full reload after an event update', async () => {
    const user = userEvent.setup();
    const updatedProject = { ...planningProjectRow, title: 'Transit Barfleur' };
    const { client, updateProject, vesselOrder } = createClient({ projects: [planningProjectRow], updatedProject });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('button', { name: 'Filtres' }));
    await user.selectOptions(screen.getByLabelText('Filtre type d’événement'), 'transit');
    await user.selectOptions(screen.getByLabelText('Filtre statut'), 'Confirmé');
    await user.dblClick(screen.getByRole('button', { name: /Transit Transit Cherbourg/ }));
    const dialog = screen.getByRole('dialog');
    await user.clear(within(dialog).getByLabelText('Titre'));
    await user.type(within(dialog).getByLabelText('Titre'), 'Transit Barfleur');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(updateProject).toHaveBeenCalled());
    expect(screen.getByLabelText('Filtre type d’événement')).toHaveValue('transit');
    expect(screen.getByLabelText('Filtre statut')).toHaveValue('Confirmé');
    expect(vesselOrder).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Événement flotte mis à jour sans rechargement.')).toBeInTheDocument();
  }, 20_000);

  it('switches to the yearly view and exposes zoom/fullscreen controls', async () => {
    const user = userEvent.setup();
    const { client } = createClient();
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('button', { name: 'An' }));
    expect(screen.getByRole('button', { name: 'An' })).toHaveClass('is-active');
    expect(screen.getByRole('button', { name: 'Zoom avant' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Outils' }));
    expect(screen.getByRole('button', { name: 'Afficher le planning en plein écran' })).toBeInTheDocument();
  });

  it('creates a native SeaPilot assignment for administrators', async () => {
    const user = userEvent.setup();
    const createdAssignment = { ...assignmentRow, id: 101, starts_on: '2026-07-20', ends_on: '2026-07-26' };
    const { client, insertAssignment } = createClient({ assignments: [], createdAssignment });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('tab', { name: 'Équipages' }));
    await user.click(screen.getByRole('button', { name: 'Créer une affectation' }));
    await user.selectOptions(screen.getByLabelText('Navire'), '1');
    await user.selectOptions(screen.getByLabelText('Marin'), '11');
    await user.selectOptions(screen.getByLabelText('Capitaine'), '10');
    fireEvent.change(screen.getByLabelText('Debut'), { target: { value: '2026-07-20T08:00' } });
    fireEvent.change(screen.getByLabelText('Fin'), { target: { value: '2026-07-26T20:00' } });
    fireEvent.change(screen.getByLabelText('Fonction'), { target: { value: 'Quart' } });
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ajouter' }));

    await waitFor(() => expect(insertAssignment).toHaveBeenCalledWith({
      vessel_id: 1,
      captain_person_id: 10,
      crew_person_id: 11,
      starts_on: '2026-07-20',
      ends_on: '2026-07-26',
      starts_at: '2026-07-20T06:00:00.000Z',
      ends_at: '2026-07-26T18:00:00.000Z',
      assignment_role: 'Quart',
      status_label: 'En Mer',
      confirmation_status: 'confirmed',
      watch_group: 'Affectation',
      comments: null,
      source_label: 'seapilot',
    }));
    expect(await screen.findByText('Affectation ajoutée au planning.')).toBeInTheDocument();
  });

  it('submits and locks the visible period for validation', async () => {
    const user = userEvent.setup();
    const { client } = createClient({ assignments: [] });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    expect(screen.getByRole('region', { name: 'Pilotage de publication' })).toHaveTextContent('En préparation');
    await user.type(screen.getByLabelText('Commentaire de publication'), 'Préparation planning été');
    await user.click(screen.getByRole('button', { name: 'Soumettre à validation' }));

    expect(await screen.findByText('Période soumise et verrouillée pour validation.')).toBeInTheDocument();
    expect(client.rpc).toHaveBeenCalledWith('transition_planning_publication', expect.objectContaining({
      p_action: 'submit',
      p_starts_on: '2026-06-29',
      p_ends_on: '2026-08-16',
      p_comment: 'Préparation planning été',
    }));
    expect(screen.getByText('Verrouillé')).toBeInTheDocument();
  });

  it('keeps editing locked while exposing a direct action to modify a published planning again', async () => {
    const user = userEvent.setup();
    const { client } = createClient({ publications: [publicationRow] });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    const publicationPanel = screen.getByRole('region', { name: 'Pilotage de publication' });
    expect(publicationPanel).toHaveTextContent('Publié');
    expect(publicationPanel).toHaveTextContent('Version 1');
    expect(publicationPanel).toHaveTextContent('Publié par Direction BBTM');
    expect(screen.getByText('Verrouillé')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nouveau projet' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifier à nouveau' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Afficher 1 autre action de publication/ }));
    expect(screen.getByRole('group', { name: 'Autres actions de publication' })).toHaveTextContent('Le rôle de chaque action est détaillé');
    expect(screen.getByRole('button', { name: 'Archiver' })).toBeInTheDocument();
  });

  it('reopens an archived planning so events can be modified again', async () => {
    const user = userEvent.setup();
    const archivedPublication = {
      ...publicationRow,
      status: 'archived',
      current_version: 2,
      comment: 'Fin de période archivée',
    };
    const reopenedPublication = {
      ...archivedPublication,
      status: 'modified_after_publication',
      comment: 'Correction des affectations validées',
      locked_at: null,
      locked_by: null,
      locked_by_name: null,
    };
    const { client } = createClient({
      publications: [archivedPublication],
      transitionedPublication: reopenedPublication,
    });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    expect(screen.getByRole('region', { name: 'Pilotage de publication' })).toHaveTextContent('Archivé');
    await user.type(screen.getByLabelText('Commentaire de publication'), 'Correction des affectations validées');
    await user.click(screen.getByRole('button', { name: 'Modifier à nouveau' }));

    expect(await screen.findByText('Planning déverrouillé. Vous pouvez le modifier à nouveau.')).toBeInTheDocument();
    expect(client.rpc).toHaveBeenCalledWith('transition_planning_publication', expect.objectContaining({
      p_action: 'reopen',
      p_publication_id: 500,
      p_comment: 'Correction des affectations validées',
    }));
    expect(screen.queryByText('Verrouillé')).not.toBeInTheDocument();
    expect(screen.getByText('Modification')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nouveau projet' })).toBeInTheDocument();
  });

  it('shows immutable versions and the semantic Planning history', async () => {
    const user = userEvent.setup();
    const { client } = createClient({
      publications: [publicationRow],
      versions: [{
        id: 1,
        publication_id: 500,
        version_number: 1,
        comment: 'Version opérationnelle',
        created_at: '2026-07-13T10:00:00Z',
        created_by: 'user-publish',
        created_by_name: 'Direction BBTM',
      }],
      history: [{
        id: 99,
        entity_kind: 'publication',
        entity_id: 500,
        action: 'publish',
        payload: { version: 1 },
        changed_by: 'user-publish',
        changed_by_name: 'Direction BBTM',
        changed_at: '2026-07-13T10:00:00Z',
        vessel_id: null,
        starts_on: '2026-06-29',
        ends_on: '2026-08-16',
        summary: 'Planning publié en version 1',
      }],
    });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('button', { name: 'Outils' }));
    await user.click(screen.getByRole('button', { name: /Historique/ }));
    expect(screen.getByText('Version publiée 1')).toBeInTheDocument();
    expect(screen.getByText('Planning publié en version 1')).toBeInTheDocument();
    expect(screen.getAllByText(/Direction BBTM/).length).toBeGreaterThan(0);
  });

  it('blocks an assignment when the medical validity ends before disembarkation', async () => {
    const user = userEvent.setup();
    const { client, insertAssignment } = createClient({ assignments: [], hrDocuments: [medicalDocumentRow] });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('tab', { name: 'Équipages' }));
    await user.click(screen.getByRole('button', { name: 'Créer une affectation' }));
    await user.selectOptions(screen.getByLabelText('Navire'), '1');
    await user.selectOptions(screen.getByLabelText('Marin'), '11');
    fireEvent.change(screen.getByLabelText('Debut'), { target: { value: '2026-07-20T08:00' } });
    fireEvent.change(screen.getByLabelText('Fin'), { target: { value: '2026-07-26T20:00' } });

    expect(screen.getByLabelText('Contrôles avant enregistrement')).toHaveTextContent('Aptitude médicale non valide');
    expect(screen.getByLabelText('Contrôles avant enregistrement')).toHaveTextContent('Blocage');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ajouter' }));
    expect(insertAssignment).not.toHaveBeenCalled();
    expect(screen.getAllByText(/Aptitude médicale non valide/).length).toBeGreaterThan(1);
  });

  it('adds a one-day sea assignment by double-clicking an empty sailor cell', async () => {
    const user = userEvent.setup();
    const createdAssignment = { ...assignmentRow, id: 102, starts_on: '2026-07-20', ends_on: '2026-07-20', watch_group: 'Bordée 1', status_label: 'En Mer' };
    const { client, insertAssignment } = createClient({ assignments: [], periods: [planningPeriodRow], createdAssignment });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('tab', { name: 'Équipages' }));
    await user.dblClick(screen.getByRole('button', { name: /Sélectionner la case vide de Paul DURAND le 20\/07\/2026/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Formulaire complet');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ajouter' }));

    await waitFor(() => expect(insertAssignment).toHaveBeenCalledWith(expect.objectContaining({
      crew_person_id: 11,
      vessel_id: 1,
      starts_on: '2026-07-20',
      ends_on: '2026-07-20',
      status_label: 'En Mer',
      watch_group: 'Bordée 1',
    })));
  });

  it('defaults sedentary collaborators to the yellow shore status', async () => {
    const user = userEvent.setup();
    const sedentaryPerson = { ...crewRow, function_label: 'Directeur QHSE / Chef de Projet' };
    const sedentaryPeriod = { ...planningPeriodRow, function_label: 'Directeur QHSE / Chef de Projet' };
    const createdAssignment = { ...assignmentRow, id: 103, starts_on: '2026-07-20', ends_on: '2026-07-20', watch_group: 'Bordée 1', status_label: 'A Terre' };
    const { client, insertAssignment } = createClient({ people: [captainRow, sedentaryPerson], assignments: [], periods: [sedentaryPeriod], createdAssignment });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('tab', { name: 'Équipages' }));
    await user.dblClick(screen.getByRole('button', { name: /Sélectionner la case vide de Paul DURAND le 20\/07\/2026/ }));
    expect(screen.getByLabelText('Statut')).toHaveValue('A Terre');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(insertAssignment).toHaveBeenCalledWith(expect.objectContaining({ status_label: 'A Terre' })));
  });

  it('renders cross-vessel conflicts in red and exposes watch groups as a select', async () => {
    const user = userEvent.setup();
    const conflictPeriod = { ...planningPeriodRow, id: 301, vessel_id: 2, vessel_name: 'SUROIT', starts_on: '2026-07-10', ends_on: '2026-07-12' };
    const { client } = createClient({ vessels: [vesselRow, secondVesselRow], assignments: [], periods: [planningPeriodRow, conflictPeriod] });
    const { container } = render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('tab', { name: 'Équipages' }));
    expect(container.querySelectorAll('.planning-crew-bar.has-conflict')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Outils' }));
    await user.click(screen.getByRole('button', { name: /Conflits/ }));
    expect(screen.getByText('Double affectation')).toBeInTheDocument();
    await user.dblClick(screen.getAllByRole('button', { name: /Paul DURAND, En Mer/ })[0]);
    expect(screen.getByLabelText('Bordée / groupe').tagName).toBe('SELECT');
    expect(screen.getByLabelText('Bordée / groupe')).toHaveValue('Bordée 1');
  });

  it('keeps marins in read-only mode', async () => {
    const user = userEvent.setup();
    const { client } = createClient({ periods: [planningPeriodRow] });
    render(<PlanningPage client={client as never} roles={['marin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('tab', { name: 'Équipages' }));
    expect(screen.getAllByText('Paul DURAND').length).toBeGreaterThan(0);
    expect(screen.getByText('Lecture seule')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Créer une affectation' })).not.toBeInTheDocument();
  });

  it('allows office direction to edit while keeping vessel administration restricted', async () => {
    const user = userEvent.setup();
    const { client } = createClient({ periods: [planningPeriodRow] });
    render(<PlanningPage client={client as never} roles={['direction']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    expect(screen.getByText('Modification')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Équipages' }));
    expect(screen.getByRole('button', { name: 'Créer une affectation' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Outils' }));
    expect(screen.queryByRole('button', { name: 'Gérer les navires' })).not.toBeInTheDocument();
  });

  it('assigns an unassigned sailor by dropping the card on a board without reloading', async () => {
    const existingCaptainPeriod = { ...planningPeriodRow, id: 302, crew_name: 'Jean MARTIN', function_label: 'Capitaine' };
    const { client, insertAssignment, vesselOrder } = createClient({ assignments: [], people: [captainRow, crewRow], periods: [existingCaptainPeriod] });
    const { container } = render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });

    const sailor = screen.getByRole('article', { name: /Paul DURAND.*Glisser pour affecter/ });
    const target = container.querySelector<HTMLElement>('[data-planning-person-drop-vessel-id="1"][data-planning-person-drop-watch-group="Bordée 1"]')!;
    const payloads = new Map<string, string>();
    const dataTransfer = {
      dropEffect: 'none',
      effectAllowed: 'none',
      types: [] as string[],
      setData(type: string, value: string) { payloads.set(type, value); this.types = [...payloads.keys()]; },
      getData(type: string) { return payloads.get(type) || ''; },
    };

    fireEvent.dragStart(sailor, { dataTransfer });
    fireEvent.dragEnter(target, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    await waitFor(() => expect(insertAssignment).toHaveBeenCalledWith(expect.objectContaining({
      vessel_id: 1,
      crew_person_id: 11,
      starts_on: '2026-06-29',
      ends_on: '2026-08-16',
      confirmation_status: 'provisional',
      watch_group: 'Bordée 1',
    })));
    expect(await screen.findByText(/Paul DURAND est affecté provisoirement à COTENTIN/)).toBeInTheDocument();
    expect(vesselOrder).toHaveBeenCalledTimes(1);
  });

  it('shows the fleet hierarchy without sailor functions or the former Armement location editor', async () => {
    const armementVessel = { ...vesselRow, name: 'ARMEMENT - CHERBOURG', acronym: 'ARM' };
    const armementAssignment = { ...assignmentOverviewRow, vessel_name: 'ARMEMENT - CHERBOURG' };
    const armementLocation = { ...planningLocationRow, vessel_name: 'ARMEMENT - CHERBOURG' };
    const { client } = createClient({ vessels: [armementVessel], assignments: [armementAssignment], days: [armementLocation] });
    const { container } = render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });

    const calendarBody = container.querySelector('.planning-calendar-body') as HTMLElement;
    expect(within(calendarBody).getByText('Paul DURAND')).toBeInTheDocument();
    expect(within(calendarBody).queryByText('Pont')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /lieu du personnel/i })).not.toBeInTheDocument();
    expect(within(calendarBody).queryByText('Cherbourg')).not.toBeInTheDocument();
  });

  it('edits a different short text on each colored assignment day', async () => {
    const user = userEvent.setup();
    const assignmentNoteRow = {
      ...planningDayRow,
      id: 202,
      person_id: 11,
      vessel_id: 1,
      work_date: '2026-07-14',
      day_number: 14,
      slot365: 'assignment:100',
      comments: 'Cherbourg',
      source_label: 'seapilot-assignment-note',
    };
    const { client, rpc } = createClient({ assignments: [assignmentOverviewRow], periods: [], days: [assignmentNoteRow] });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });

    expect(screen.getByRole('button', { name: 'Ouvrir la fiche de COTENTIN' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter une bordée à COTENTIN' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter un marin à Affectation de COTENTIN' })).toBeInTheDocument();
    const dayCell = screen.getByRole('button', { name: 'Modifier le statut et le commentaire du 14/07/2026 pour Paul DURAND' });
    const previousDayCell = screen.getByRole('button', { name: 'Modifier le statut et le commentaire du 13/07/2026 pour Paul DURAND' });
    expect(previousDayCell).toHaveClass('is-segment-end');
    expect(dayCell).toHaveClass('is-segment-start');
    expect(dayCell).not.toHaveTextContent(/En mer|À terre|Embarqué/i);
    await user.click(dayCell);
    expect(screen.queryByRole('dialog', { name: 'Statut et commentaire' })).not.toBeInTheDocument();
    fireEvent.contextMenu(dayCell);
    const dialog = await screen.findByRole('dialog', { name: 'Statut et commentaire' });
    await user.click(within(dialog).getByText('Repos'));
    const noteInput = within(dialog).getByLabelText('Commentaire');
    await user.clear(noteInput);
    await user.type(noteInput, 'Le Havre');
    await user.click(within(dialog).getByRole('button', { name: 'Appliquer à ce jour' }));

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('save_planning_assignment_day_state', {
      p_assignment_id: 100,
      p_work_date: '2026-07-14',
      p_status: 'Repos',
      p_note: 'Le Havre',
    }));
  });

  it('creates a board from the vessel staffing decision and proposes compatible available sailors', async () => {
    const user = userEvent.setup();
    const { client, rpc } = createClient({
      assignments: [assignmentOverviewRow],
      matrices: [{ id: 5, vessel_id: 1, name: 'Situation 1', effective_from: '2026-01-01', effective_to: null, status: 'active', notes: null, version: 1 }],
      manningRequirements: [{ id: 9, matrix_id: 5, function_label: 'Capitaine', minimum_count: 1, target_count: 1, required_certificates: [], required_qualifications: [], required_authorizations: [], required_trainings: [], restrictions: [], display_order: 0 }],
    });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('button', { name: 'Ajouter une bordée à COTENTIN' }));

    const dialog = await screen.findByRole('dialog', { name: 'Créer Bordée 1' });
    expect(within(dialog).getByText('Capitaine')).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Marin pour Capitaine'), '10');
    await user.click(within(dialog).getByRole('button', { name: 'Créer la bordée' }));

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('create_planning_board_assignments', {
      p_vessel_id: 1,
      p_watch_group: 'Bordée 1',
      p_starts_on: '2026-06-29',
      p_ends_on: '2026-08-16',
      p_positions: [{ personId: 10, functionLabel: 'Capitaine' }],
    }));
  });

  it('selects an empty fleet cell with a green marker and opens the full form only on double-click', async () => {
    const user = userEvent.setup();
    const { client, rpc } = createClient({ assignments: [assignmentOverviewRow], periods: [] });
    const { container } = render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });

    const emptyCell = screen.getByRole('button', { name: /Sélectionner la case vide de Paul DURAND le 15\/07\/2026/ });
    await user.click(emptyCell);
    expect(emptyCell.querySelector('.planning-empty-cell-marker.is-default')).toBeInTheDocument();
    expect(screen.queryByText('Formulaire complet')).not.toBeInTheDocument();
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('apply_planning_grid_cells', {
      p_cells: [expect.objectContaining({
        personId: 11,
        vesselId: 1,
        workDate: '2026-07-15',
        status: 'En Mer',
      })],
    }));

    await user.dblClick(emptyCell);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Formulaire complet')).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Nouvelle affectation' })).toBeInTheDocument();
    expect(container.querySelector('.planning-empty-cell-marker.is-default')).toBeInTheDocument();
  });

  it('keeps a legacy fleet period visible when no daily assignment id exists', async () => {
    const { client } = createClient({ assignments: [], periods: [planningPeriodRow] });
    const { container } = render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });

    const periodBar = container.querySelector('.planning-crew-bar.is-fleet-tree.is-sea');
    expect(periodBar).toBeInTheDocument();
    expect(periodBar).not.toHaveClass('has-daily-grid');
    expect(container.querySelectorAll('.planning-assignment-note-cell')).toHaveLength(0);
  });

  it('uses an amber empty-cell marker for Armement - Cherbourg personnel', async () => {
    const user = userEvent.setup();
    const armementVessel = { ...vesselRow, name: 'ARMEMENT - CHERBOURG', acronym: 'ARM' };
    const armementAssignment = { ...assignmentOverviewRow, vessel_name: 'ARMEMENT - CHERBOURG' };
    const { client } = createClient({ vessels: [armementVessel], assignments: [armementAssignment], periods: [] });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });

    const emptyCell = screen.getByRole('button', { name: /Sélectionner la case vide de Paul DURAND le 15\/07\/2026/ });
    await user.click(emptyCell);
    expect(emptyCell.querySelector('.planning-empty-cell-marker.is-armement')).toBeInTheDocument();
  });

  it('paints adjacent empty days and persists them in one batch on pointer release', async () => {
    const { client, rpc } = createClient({ assignments: [assignmentOverviewRow], periods: [] });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    const first = screen.getByRole('button', { name: /case vide de Paul DURAND le 15\/07\/2026/ });
    const second = screen.getByRole('button', { name: /case vide de Paul DURAND le 16\/07\/2026/ });

    fireEvent.pointerDown(first, { button: 0, buttons: 1 });
    fireEvent.pointerEnter(second, { buttons: 1 });
    fireEvent.pointerUp(window, { button: 0 });

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('apply_planning_grid_cells', {
      p_cells: [
        expect.objectContaining({ workDate: '2026-07-15', status: 'En Mer' }),
        expect.objectContaining({ workDate: '2026-07-16', status: 'En Mer' }),
      ],
    }));
  });

  it('supports Ctrl+X and Ctrl+V between grid dates through the atomic move RPC', async () => {
    const { client, rpc } = createClient({ assignments: [assignmentOverviewRow], periods: [] });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    const source = screen.getByRole('button', { name: 'Modifier le statut et le commentaire du 14/07/2026 pour Paul DURAND' });
    const target = screen.getByRole('button', { name: /case vide de Paul DURAND le 18\/07\/2026/ });

    fireEvent.pointerDown(source, { button: 0, ctrlKey: true });
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
    await screen.findByText(/1 case copiée/);
    fireEvent.keyDown(window, { key: 'x', ctrlKey: true });
    await screen.findByText(/1 case coupée/);
    fireEvent.pointerDown(target, { button: 0 });
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('move_planning_grid_cells', expect.objectContaining({
      p_source_cells: [expect.objectContaining({ assignmentId: 100, workDate: '2026-07-14' })],
      p_target_cells: [expect.objectContaining({ personId: 11, vesselId: 1, workDate: '2026-07-18' })],
      p_reason: 'Déplacement par couper-coller depuis la grille',
    })));
  });

  it('deletes selected persisted cells with Delete and records an explicit reason', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { client, rpc } = createClient({ assignments: [assignmentOverviewRow], periods: [] });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    const source = screen.getByRole('button', { name: 'Modifier le statut et le commentaire du 14/07/2026 pour Paul DURAND' });
    fireEvent.pointerDown(source, { button: 0, ctrlKey: true });
    fireEvent.keyDown(window, { key: 'Delete' });

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('remove_planning_grid_cells', {
      p_cells: [expect.objectContaining({ assignmentId: 100, workDate: '2026-07-14' })],
      p_reason: 'Suppression manuelle depuis la grille',
    }));
    expect(confirm).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });

  it('resolves a visible conflict by removing only the overlap after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const conflictAssignment = {
      ...assignmentOverviewRow,
      id: 101,
      vessel_id: 2,
      vessel_name: 'SUROIT',
      starts_on: '2026-07-10',
      ends_on: '2026-07-12',
    };
    const { client, rpc } = createClient({ vessels: [vesselRow, secondVesselRow], assignments: [assignmentOverviewRow, conflictAssignment], periods: [] });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    const conflictCells = screen.getAllByRole('button', { name: /Conflit.*11\/07\/2026 pour Paul DURAND/ });

    await userEvent.setup().click(conflictCells[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Résoudre le conflit d’affectation' });
    await userEvent.setup().click(within(dialog).getAllByRole('button', { name: /COTENTIN.*Garder cette ligne/ })[0]);

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('resolve_planning_grid_conflict_cells', expect.objectContaining({
      p_cells: [
        expect.objectContaining({ assignmentId: 101, eventKind: 'assignment', eventId: 101, workDate: '2026-07-10' }),
        expect.objectContaining({ assignmentId: 101, eventKind: 'assignment', eventId: 101, workDate: '2026-07-11' }),
        expect.objectContaining({ assignmentId: 101, eventKind: 'assignment', eventId: 101, workDate: '2026-07-12' }),
      ],
      p_reason: 'Résolution de conflit : priorité à COTENTIN / Affectation',
    })));
    expect(confirm).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });

  it('opens and resolves a conflict against a historical period without an assignment id', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const historicalPeriod = {
      ...planningPeriodRow,
      id: 301,
      person_id: 11,
      vessel_id: 2,
      vessel_name: 'SUROIT',
      starts_on: '2026-07-10',
      ends_on: '2026-07-12',
      slot365_source_id: '301',
      slot365_source_key: 'SLOT-301',
    };
    const { client, rpc } = createClient({
      vessels: [vesselRow, secondVesselRow],
      assignments: [assignmentOverviewRow],
      periods: [historicalPeriod],
    });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    const conflictCell = screen.getByRole('button', { name: /Conflit.*11\/07\/2026 pour Paul DURAND/ });

    await userEvent.setup().click(conflictCell);
    const dialog = await screen.findByRole('dialog', { name: 'Résoudre le conflit d’affectation' });
    await userEvent.setup().click(within(dialog).getByRole('button', { name: /COTENTIN.*Garder cette ligne/ }));

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('resolve_planning_grid_conflict_cells', expect.objectContaining({
      p_cells: [
        expect.objectContaining({ assignmentId: null, eventKind: 'period', eventId: 301, workDate: '2026-07-10' }),
        expect.objectContaining({ assignmentId: null, eventKind: 'period', eventId: 301, workDate: '2026-07-11' }),
        expect.objectContaining({ assignmentId: null, eventKind: 'period', eventId: 301, workDate: '2026-07-12' }),
      ],
      p_reason: 'Résolution de conflit : priorité à COTENTIN / Affectation',
    })));
    expect(confirm).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });

  it('waits for one completed left click before opening conflict prioritization', async () => {
    const conflictAssignment = {
      ...assignmentOverviewRow,
      id: 101,
      vessel_id: 2,
      vessel_name: 'SUROIT',
      starts_on: '2026-07-10',
      ends_on: '2026-07-12',
    };
    const { client } = createClient({
      vessels: [vesselRow, secondVesselRow],
      assignments: [assignmentOverviewRow, conflictAssignment],
      periods: [],
    });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    const conflictCell = screen.getAllByRole('button', { name: /Conflit.*11\/07\/2026 pour Paul DURAND/ })[0];

    fireEvent.pointerDown(conflictCell, { button: 0 });
    expect(screen.queryByRole('dialog', { name: 'Résoudre le conflit d’affectation' })).not.toBeInTheDocument();
    fireEvent.pointerUp(conflictCell, { button: 0 });
    fireEvent.click(conflictCell.querySelector('.planning-grid-conflict-icon')!, { button: 0, detail: 1 });

    expect(await screen.findByRole('dialog', { name: 'Résoudre le conflit d’affectation' })).toBeInTheDocument();
    expect(screen.getAllByRole('dialog', { name: 'Résoudre le conflit d’affectation' })).toHaveLength(1);
  });

  it('opens conflict prioritization even when grid cells were copied previously', async () => {
    const conflictAssignment = {
      ...assignmentOverviewRow,
      id: 101,
      vessel_id: 2,
      vessel_name: 'SUROIT',
      starts_on: '2026-07-10',
      ends_on: '2026-07-12',
    };
    const { client } = createClient({
      vessels: [vesselRow, secondVesselRow],
      assignments: [assignmentOverviewRow, conflictAssignment],
      periods: [],
    });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    const conflictCell = screen.getAllByRole('button', { name: /Conflit.*11\/07\/2026 pour Paul DURAND/ })[0];

    fireEvent.pointerDown(conflictCell, { button: 0, ctrlKey: true });
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
    fireEvent.click(conflictCell, { button: 0, detail: 1 });

    expect(await screen.findByRole('dialog', { name: 'Résoudre le conflit d’affectation' })).toBeInTheDocument();
    expect(screen.getAllByRole('dialog', { name: 'Résoudre le conflit d’affectation' })).toHaveLength(1);
  });

  it('keeps right-click and double-click workflows on conflict cells', async () => {
    const user = userEvent.setup();
    const conflictAssignment = {
      ...assignmentOverviewRow,
      id: 101,
      vessel_id: 2,
      vessel_name: 'SUROIT',
      starts_on: '2026-07-10',
      ends_on: '2026-07-12',
    };
    const { client } = createClient({
      vessels: [vesselRow, secondVesselRow],
      assignments: [assignmentOverviewRow, conflictAssignment],
      periods: [],
    });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    const conflictCell = screen.getAllByRole('button', { name: /Conflit.*11\/07\/2026 pour Paul DURAND/ })[0];

    fireEvent.contextMenu(conflictCell);
    const statusDialog = await screen.findByRole('dialog', { name: 'Statut et commentaire' });
    expect(screen.queryByRole('dialog', { name: 'Résoudre le conflit d’affectation' })).not.toBeInTheDocument();
    await user.click(within(statusDialog).getByRole('button', { name: 'Fermer' }));

    await user.dblClick(conflictCell);
    const fullForm = await screen.findByRole('dialog');
    expect(within(fullForm).getByText('Formulaire complet')).toBeInTheDocument();
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    expect(screen.queryByRole('dialog', { name: 'Résoudre le conflit d’affectation' })).not.toBeInTheDocument();
  });

  it('opens daily status on right-click and the full assignment form only on double-click', async () => {
    const user = userEvent.setup();
    const { client } = createClient({ assignments: [assignmentOverviewRow], periods: [] });
    const { container } = render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    const bar = container.querySelector<HTMLButtonElement>('.planning-crew-bar')!;

    await user.click(bar);
    expect(bar).toHaveClass('is-selected');
    expect(screen.queryByRole('dialog', { name: 'Statut et commentaire' })).not.toBeInTheDocument();
    fireEvent.contextMenu(bar);
    const statusDialog = await screen.findByRole('dialog', { name: 'Statut et commentaire' });
    expect(within(statusDialog).getByText('Tout le groupe de cases')).toBeInTheDocument();
    await user.click(within(statusDialog).getByRole('button', { name: 'Fermer' }));

    await user.dblClick(bar);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Formulaire complet')).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: /Modifier · Paul DURAND/ })).toBeInTheDocument();
  });

  it('offers a date, vessel, board and Excel/PDF format for the crew list', async () => {
    const user = userEvent.setup();
    const crewListAssignment = { ...assignmentOverviewRow, starts_on: todayPlanningDate(), ends_on: todayPlanningDate() };
    const { client } = createClient({ assignments: [crewListAssignment], periods: [] });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('button', { name: 'Outils' }));
    await user.click(screen.getByRole('button', { name: 'Générer une crew list' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Date de la crew list')).toHaveValue(todayPlanningDate());
    expect(within(dialog).getByLabelText('Navire de la crew list')).toHaveValue('1');
    expect(within(dialog).getByLabelText('Navire de la crew list')).not.toHaveTextContent('NAVIRES SANS EQUIPAGE');
    expect(within(dialog).getByLabelText('Bordée de la crew list')).toHaveValue('Affectation');
    expect(within(dialog).getByLabelText('Format de la crew list')).toHaveValue('xlsx');
    await user.selectOptions(within(dialog).getByLabelText('Format de la crew list'), 'pdf');
    expect(within(dialog).getByRole('button', { name: 'Générer PDF' })).toBeEnabled();
  });

  it('pins every weekend background cell to its calendar column', async () => {
    const { client } = createClient({ periods: [planningPeriodRow] });
    const { container } = render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    const cells = [...container.querySelectorAll<HTMLElement>('.planning-timeline-row .planning-day-cell.is-weekend')];
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((cell) => Boolean(cell.style.gridColumn))).toBe(true);
    expect(cells.every((cell) => cell.style.gridRow === '1')).toBe(true);
  });

  it('previews the colored period continuously while an administrator resizes it', async () => {
    const user = userEvent.setup();
    const { client } = createClient({ assignments: [], periods: [planningPeriodRow] });
    const { container } = render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('tab', { name: 'Équipages' }));
    const bar = container.querySelector<HTMLElement>('.planning-crew-bar')!;
    const endHandle = bar.querySelector<HTMLElement>('.planning-resize-handle.is-end')!;
    const initialPlacement = bar.style.gridColumn;

    fireEvent.pointerDown(endHandle, { clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 168 });

    await waitFor(() => expect(bar).toHaveClass('is-resize-preview'));
    expect(bar.style.gridColumn).not.toBe(initialPlacement);
    fireEvent.pointerCancel(window);
  });

  it('highlights the full destination span while a colored assignment is moving', async () => {
    const { client } = createClient({ assignments: [assignmentOverviewRow], periods: [] });
    const { container } = render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    const bar = container.querySelector<HTMLElement>('.planning-crew-bar')!;
    const target = container.querySelector<HTMLElement>('.planning-timeline-row.is-fleet-person [data-planning-drop-date="2026-07-20"]')!;
    const payloads = new Map<string, string>();
    const dataTransfer = {
      dropEffect: 'none',
      effectAllowed: 'none',
      types: [] as string[],
      setData(type: string, value: string) { payloads.set(type, value); this.types = [...payloads.keys()]; },
      getData(type: string) { return payloads.get(type) || ''; },
    };

    fireEvent.dragStart(bar, { dataTransfer });
    fireEvent.dragEnter(target, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });

    await waitFor(() => expect(container.querySelector('.planning-move-preview.is-crew')).toBeInTheDocument());
    expect(bar).toHaveClass('is-dragging');
  });
});
