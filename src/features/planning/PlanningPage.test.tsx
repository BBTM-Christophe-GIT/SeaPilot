import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlanningPage } from './PlanningPage';

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
  validated_at: '2026-07-13T09:00:00Z',
  published_at: '2026-07-13T10:00:00Z',
  locked_at: '2026-07-13T08:00:00Z',
  updated_at: '2026-07-13T10:00:00Z',
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
  createdAssignment?: unknown;
  createdProject?: unknown;
  updatedProject?: unknown;
  transitionedPublication?: unknown;
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
    throw new Error(`Unexpected RPC ${functionName}`);
  });
  return { client: { from, rpc }, from, insertAssignment, insertProject, updateProject, updateAssignment, vesselOrder };
}

describe('PlanningPage cockpit', () => {
  it('renders the monthly crew view and the imported assignment', async () => {
    const { client } = createClient({ assignments: [assignmentOverviewRow], periods: [planningPeriodRow] });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    expect(await screen.findByRole('heading', { name: 'Planning' })).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Actualiser le planning' }));
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
    const periodButton = screen.getByRole('button', { name: /Paul DURAND, En Mer/ });
    await user.click(periodButton);
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

    expect((await screen.findAllByText('Luc MOREL')).length).toBeGreaterThan(0);
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
    const { client } = createClient({ vessels: [vesselRow, secondVesselRow], projects: [planningProjectRow] });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('tab', { name: 'Flotte' }));
    expect(screen.getByRole('tab', { name: 'Flotte' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Navires')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Transit Transit Cherbourg/ })).toBeInTheDocument();
    for (const label of ['Jour', 'Semaine', '2 sem.', 'Mois', 'An']) expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Équipages' }));
    expect(screen.getByRole('button', { name: 'Marins' })).toHaveClass('is-active');
    await user.click(screen.getByRole('button', { name: 'Équipes' }));
    expect(screen.getByRole('button', { name: 'Équipes' })).toHaveClass('is-active');
  });

  it('creates a fleet event from the complete side panel', async () => {
    const user = userEvent.setup();
    const createdProject = { ...planningProjectRow, id: 601, title: 'Maintenance annuelle', event_type: 'maintenance', status: 'A planifier' };
    const { client, insertProject } = createClient({ projects: [], createdProject });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('tab', { name: 'Flotte' }));
    await user.click(screen.getByRole('button', { name: 'Nouvel événement flotte' }));
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
  });

  it('keeps fleet filters active and avoids a full reload after an event update', async () => {
    const user = userEvent.setup();
    const updatedProject = { ...planningProjectRow, title: 'Transit Barfleur' };
    const { client, updateProject, vesselOrder } = createClient({ projects: [planningProjectRow], updatedProject });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('tab', { name: 'Flotte' }));
    await user.selectOptions(screen.getByLabelText('Filtre type d’événement'), 'transit');
    await user.selectOptions(screen.getByLabelText('Filtre statut'), 'Confirmé');
    await user.click(screen.getByRole('button', { name: /Transit Transit Cherbourg/ }));
    const dialog = screen.getByRole('dialog');
    await user.clear(within(dialog).getByLabelText('Titre'));
    await user.type(within(dialog).getByLabelText('Titre'), 'Transit Barfleur');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(updateProject).toHaveBeenCalled());
    expect(screen.getByLabelText('Filtre type d’événement')).toHaveValue('transit');
    expect(screen.getByLabelText('Filtre statut')).toHaveValue('Confirmé');
    expect(vesselOrder).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Événement flotte mis à jour sans rechargement.')).toBeInTheDocument();
  });

  it('switches to the yearly view and exposes zoom/fullscreen controls', async () => {
    const user = userEvent.setup();
    const { client } = createClient();
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('button', { name: 'An' }));
    expect(screen.getByRole('button', { name: 'An' })).toHaveClass('is-active');
    expect(screen.getByRole('button', { name: 'Zoom avant' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Afficher en plein écran' })).toBeInTheDocument();
  });

  it('creates a native SeaPilot assignment for administrators', async () => {
    const user = userEvent.setup();
    const createdAssignment = { ...assignmentRow, id: 101, starts_on: '2026-07-20', ends_on: '2026-07-26' };
    const { client, insertAssignment } = createClient({ assignments: [], createdAssignment });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('button', { name: 'Nouvelle affectation' }));
    await user.selectOptions(screen.getByLabelText('Navire'), '1');
    await user.selectOptions(screen.getByLabelText('Marin'), '11');
    await user.selectOptions(screen.getByLabelText('Capitaine'), '10');
    fireEvent.change(screen.getByLabelText('Debut'), { target: { value: '2026-07-20' } });
    fireEvent.change(screen.getByLabelText('Fin'), { target: { value: '2026-07-26' } });
    fireEvent.change(screen.getByLabelText('Fonction'), { target: { value: 'Quart' } });
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ajouter' }));

    await waitFor(() => expect(insertAssignment).toHaveBeenCalledWith({
      vessel_id: 1,
      captain_person_id: 10,
      crew_person_id: 11,
      starts_on: '2026-07-20',
      ends_on: '2026-07-26',
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

  it('removes editing controls when the displayed planning is published', async () => {
    const { client } = createClient({ publications: [publicationRow] });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    const publicationPanel = screen.getByRole('region', { name: 'Pilotage de publication' });
    expect(publicationPanel).toHaveTextContent('Publié');
    expect(publicationPanel).toHaveTextContent('Version 1');
    expect(screen.getByText('Verrouillé')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nouvelle affectation' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réouvrir pour modification' })).toBeInTheDocument();
  });

  it('blocks an assignment when the medical validity ends before disembarkation', async () => {
    const user = userEvent.setup();
    const { client, insertAssignment } = createClient({ assignments: [], hrDocuments: [medicalDocumentRow] });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('button', { name: 'Nouvelle affectation' }));
    await user.selectOptions(screen.getByLabelText('Navire'), '1');
    await user.selectOptions(screen.getByLabelText('Marin'), '11');
    fireEvent.change(screen.getByLabelText('Debut'), { target: { value: '2026-07-20' } });
    fireEvent.change(screen.getByLabelText('Fin'), { target: { value: '2026-07-26' } });

    expect(screen.getByLabelText('Contrôles avant enregistrement')).toHaveTextContent('Aptitude médicale non valide');
    expect(screen.getByLabelText('Contrôles avant enregistrement')).toHaveTextContent('Blocage');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ajouter' }));
    expect(insertAssignment).not.toHaveBeenCalled();
    expect(screen.getAllByText(/Aptitude médicale non valide/).length).toBeGreaterThan(1);
  });

  it('adds a one-day sea assignment by clicking an empty sailor cell', async () => {
    const user = userEvent.setup();
    const createdAssignment = { ...assignmentRow, id: 102, starts_on: '2026-07-20', ends_on: '2026-07-20', watch_group: 'Bordée 1', status_label: 'En Mer' };
    const { client, insertAssignment } = createClient({ assignments: [], periods: [planningPeriodRow], createdAssignment });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('button', { name: 'Créer une affectation pour Paul DURAND le 20/07/2026' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Formulaire rapide');
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
    await user.click(screen.getByRole('button', { name: 'Créer une affectation pour Paul DURAND le 20/07/2026' }));
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
    expect(container.querySelectorAll('.planning-crew-bar.has-conflict')).toHaveLength(2);
    await user.click(screen.getByRole('tab', { name: /Conflits/ }));
    expect(screen.getByText('Double affectation')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /Paul DURAND, En Mer/ })[0]);
    expect(screen.getByLabelText('Bordée / groupe').tagName).toBe('SELECT');
    expect(screen.getByLabelText('Bordée / groupe')).toHaveValue('Bordée 1');
  });

  it('keeps marins in read-only mode', async () => {
    const { client } = createClient({ periods: [planningPeriodRow] });
    render(<PlanningPage client={client as never} roles={['marin']} />);

    expect((await screen.findAllByText('Paul DURAND')).length).toBeGreaterThan(0);
    expect(screen.getByText('Lecture seule')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nouvelle affectation' })).not.toBeInTheDocument();
  });

  it('keeps planning edition strictly reserved to administrators', async () => {
    const { client } = createClient({ periods: [planningPeriodRow] });
    render(<PlanningPage client={client as never} roles={['direction']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    expect(screen.getByText('Lecture seule')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nouvelle affectation' })).not.toBeInTheDocument();
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
    const { client } = createClient({ assignments: [], periods: [planningPeriodRow] });
    const { container } = render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    const bar = container.querySelector<HTMLElement>('.planning-crew-bar')!;
    const endHandle = bar.querySelector<HTMLElement>('.planning-resize-handle.is-end')!;
    const initialPlacement = bar.style.gridColumn;

    fireEvent.pointerDown(endHandle, { clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 168 });

    await waitFor(() => expect(bar).toHaveClass('is-resize-preview'));
    expect(bar.style.gridColumn).not.toBe(initialPlacement);
    fireEvent.pointerCancel(window);
  });
});
