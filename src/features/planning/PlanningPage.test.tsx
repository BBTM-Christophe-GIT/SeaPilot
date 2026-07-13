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

function createClient(options: {
  vessels?: unknown[];
  people?: unknown[];
  assignments?: unknown[];
  days?: unknown[];
  periods?: unknown[];
  hrDocuments?: unknown[];
  createdAssignment?: unknown;
} = {}) {
  const insertAssignment = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: options.createdAssignment || assignmentRow, error: null }),
    }),
  });
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'vessels') {
      return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: options.vessels ?? [vesselRow], error: null }) }) };
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
    if (table === 'hr_documents') {
      return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: options.hrDocuments ?? [], error: null }) }) };
    }
    if (table === 'planning_assignments') return { insert: insertAssignment };
    throw new Error(`Optional table unavailable: ${table}`);
  });
  const rpc = vi.fn().mockResolvedValue({ data: options.assignments ?? [assignmentOverviewRow], error: null });
  return { client: { from, rpc }, insertAssignment };
}

describe('PlanningPage cockpit', () => {
  it('renders the monthly hierarchy and the imported assignment', async () => {
    const { client } = createClient({ assignments: [assignmentOverviewRow], periods: [planningPeriodRow] });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    expect(await screen.findByRole('heading', { name: 'Planning' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mois' })).toHaveClass('is-active');
    expect(screen.getAllByText('COTENTIN').length).toBeGreaterThan(0);
    expect(screen.getByText('Bordée 1')).toBeInTheDocument();
    expect(screen.getAllByText('Paul DURAND').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Affectations planning')).toHaveTextContent('1');
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
    expect(screen.getByLabelText('Journees SMTR')).toHaveTextContent('1');
    expect(screen.getByLabelText('Periodes SMTR')).toHaveTextContent('1');
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
    await user.click(screen.getByRole('button', { name: 'Ajouter affectation' }));

    await waitFor(() => expect(insertAssignment).toHaveBeenCalledWith({
      vessel_id: 1,
      captain_person_id: 10,
      crew_person_id: 11,
      starts_on: '2026-07-20',
      ends_on: '2026-07-26',
      assignment_role: 'Quart',
      status_label: 'En Mer',
      watch_group: 'Affectation',
      comments: null,
      source_label: 'seapilot',
    }));
    expect(await screen.findByText('Affectation ajoutée au planning.')).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Ajouter affectation' }));
    expect(insertAssignment).not.toHaveBeenCalled();
    expect(screen.getAllByText(/Aptitude médicale non valide/).length).toBeGreaterThan(1);
  });

  it('adds a one-day sea assignment by clicking an empty sailor cell', async () => {
    const user = userEvent.setup();
    const createdAssignment = { ...assignmentRow, id: 102, starts_on: '2026-07-20', ends_on: '2026-07-20', watch_group: 'Bordée 1', status_label: 'En Mer' };
    const { client, insertAssignment } = createClient({ assignments: [], periods: [planningPeriodRow], createdAssignment });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('button', { name: 'Ajouter En Mer pour Paul DURAND le 20/07/2026' }));

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
    await user.click(screen.getByRole('button', { name: 'Ajouter À Terre pour Paul DURAND le 20/07/2026' }));
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
    await user.click(screen.getAllByRole('button', { name: /Paul DURAND, Conflit/ })[0]);
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
