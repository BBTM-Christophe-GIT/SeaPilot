import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlanningPage } from './PlanningPage';
import { formatPlanningDate, startOfPlanningWeek, todayPlanningDate } from './planningDates';
import { buildPlanningTimeline, timelineRange } from './planningModel';

vi.mock('./planningDates', async (importOriginal) => ({
  ...await importOriginal(),
  todayPlanningDate: () => '2026-06-29',
}));

const assignmentFunctionOptions = [
  'Capitaine',
  'Chef Mécanicien',
  '2nd Capitaine',
  '2nd Mécanicien',
  "Maître d'Equipage",
  'Matelot polyvalent',
  'Matelot Qualifié',
  'Stagiaire',
];

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
const departedCrewRow = {
  ...crewRow,
  id: 13,
  first_name: 'Alain',
  last_name: 'ANCIEN',
  departed_on: null,
  active: false,
};
const futureDepartureCrewRow = {
  ...crewRow,
  id: 14,
  first_name: 'Camille',
  last_name: 'FUTURE',
  departed_on: '2099-12-31',
  active: false,
};
const pastDepartureCrewRow = {
  ...crewRow,
  id: 15,
  first_name: 'Étienne',
  last_name: 'PASSÉ',
  departed_on: '2000-01-01',
  active: false,
};
const todayDepartureCrewRow = {
  ...crewRow,
  id: 16,
  first_name: 'Aline',
  last_name: 'AUJOURD’HUI',
  departed_on: todayPlanningDate(),
  active: false,
};
const emptyBoardRow = {
  id: 900,
  vessel_id: 1,
  person_id: 13,
  watch_group: 'Affectation',
  function_label: 'Matelot',
  created_at: '2026-07-17T08:00:00Z',
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
const requestedLeaveRow = {
  id: 700,
  person_id: 11,
  absence_type: 'leave',
  starts_at: '2026-07-06T06:00:00Z',
  ends_at: '2026-07-09T16:00:00Z',
  reason: '',
  status: 'requested',
  requested_by: 'user-sailor',
  reviewed_by: null,
  reviewed_at: null,
  review_comment: null,
  created_at: '2026-07-01T08:00:00Z',
  updated_at: '2026-07-01T08:00:00Z',
};
const approvedLeaveRow = {
  ...requestedLeaveRow,
  id: 701,
  starts_at: '2026-07-06T06:00:00Z',
  ends_at: '2026-07-09T16:00:00Z',
  status: 'approved',
  reviewed_by: 'user-admin',
  reviewed_at: '2026-07-02T08:00:00Z',
};
const rejectedLeaveRow = {
  ...requestedLeaveRow,
  id: 702,
  status: 'rejected',
  reviewed_by: 'user-admin',
  reviewed_at: '2026-07-02T08:00:00Z',
  review_comment: 'Effectif insuffisant',
};
const cancelledLeaveRow = {
  ...requestedLeaveRow,
  id: 703,
  status: 'cancelled',
  reviewed_by: 'user-sailor',
  reviewed_at: '2026-07-02T08:00:00Z',
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
  boardRows?: unknown[];
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
  absences?: unknown[];
  publishedSnapshot?: Record<string, unknown>;
  createdAssignment?: unknown;
  createdProject?: unknown;
  updatedProject?: unknown;
  transitionedPublication?: unknown;
  assistantAccess?: unknown[];
  operationDocuments?: unknown[];
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
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                range: vi.fn().mockResolvedValue({ data: options.periods ?? [], error: null }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === 'planning_board_rows') {
      return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: options.boardRows ?? [], error: null }) }) };
    }
    if (table === 'planning_operations_view') {
      return {
        select: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: options.projects ?? [], error: null }) }) }),
      };
    }
    if (table === 'planning_projects') {
      return {
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
    if (table === 'planning_absences') {
      return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: options.absences ?? [], error: null }) }) };
    }
    if (table === 'planning_conflict_cases' || table === 'planning_conflict_case_history') {
      return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
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
    if (table === 'project_generated_documents') {
      const order = vi.fn().mockResolvedValue({ data: options.operationDocuments ?? [], error: null });
      const documentTypeEq = vi.fn().mockReturnValue({ order });
      const occurrenceEq = vi.fn().mockReturnValue({ eq: documentTypeEq });
      return { select: vi.fn().mockReturnValue({ eq: occurrenceEq }) };
    }
    if (table === 'planning_assignments') return { insert: insertAssignment, update: updateAssignment };
    throw new Error(`Unexpected table ${table}`);
  });
  const rpc = vi.fn().mockImplementation((functionName: string) => {
    if (functionName === 'planning_assignment_overview') {
      return Promise.resolve({ data: options.assignments ?? [assignmentOverviewRow], error: null });
    }
    if (functionName === 'planning_release_history') {
      return Promise.resolve({ data: options.versions ?? [], error: null });
    }
    if (functionName === 'latest_planning_release') {
      return Promise.resolve({
        data: options.publishedSnapshot ? {
          release: options.versions?.[0] ?? {
            id: 1,
            publication_id: 1,
            version_number: 1,
            comment: '',
            created_at: '2026-07-13T10:00:00Z',
            created_by: 'user-publish',
            created_by_name: 'Direction BBTM',
          },
          snapshot: options.publishedSnapshot,
        } : null,
        error: null,
      });
    }
    if (functionName === 'publish_planning_release') {
      return Promise.resolve({
        data: options.versions?.[0] ?? {
          id: 1,
          publication_id: 1,
          version_number: 1,
          comment: '',
          created_at: '2026-07-13T10:00:00Z',
          created_by: 'user-publish',
          created_by_name: 'Direction BBTM',
        },
        error: null,
      });
    }
    if (functionName === 'review_planning_absence' || functionName === 'save_planning_absence' || functionName === 'move_planning_approved_absence') {
      return Promise.resolve({ data: 1, error: null });
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
    if (functionName === 'add_planning_board_row_for_month') {
      return Promise.resolve({ data: 901, error: null });
    }
    if (functionName === 'delete_planning_board_row') {
      return Promise.resolve({ data: 900, error: null });
    }
    if (functionName === 'planning_project_catalog') {
      return Promise.resolve({
        data: [{
          id: 701,
          project_code: 'P267',
          title: 'Remorquage Cherbourg',
          client_name: 'Cherbourg Port',
          status: 'Confirmé',
          description: 'Mission portuaire',
          starts_on: '2026-07-18',
          ends_on: '2026-07-19',
        }],
        error: null,
      });
    }
    if (functionName === 'planning_project_clients') {
      return Promise.resolve({ data: [{ id: 50, name: 'Cherbourg Port', active: true }], error: null });
    }
    throw new Error(`Unexpected RPC ${functionName}`);
  });
  return { client: { from, rpc }, from, rpc, insertAssignment, insertProject, updateProject, updateAssignment, vesselOrder };
}

describe('PlanningPage cockpit', () => {
  it('keeps P2.2 hidden by default and exposes it only after the flag and server access agree', async () => {
    const { client, rpc } = createClient({ projects: [planningProjectRow] });
    const { rerender } = render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    expect(screen.queryByRole('button', { name: /Prévisions et scénarios/ })).not.toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith('get_planning_assistant_access');

    rerender(<PlanningPage client={client as never} predictionsFeatureEnabled roles={['admin']} />);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('get_planning_assistant_access'));
    expect(await screen.findByRole('button', { name: /Prévisions et scénarios/ })).toBeInTheDocument();
  });

  it('renders the monthly crew view and the imported assignment', async () => {
    const user = userEvent.setup();
    const { client } = createClient({ assignments: [assignmentOverviewRow], periods: [planningPeriodRow] });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    expect(await screen.findByRole('heading', { name: 'Planning' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Équipages' }));
    expect(screen.getByLabelText('Mois de référence')).toHaveValue(todayPlanningDate().slice(0, 7));
    expect(document.querySelector('.planning-calendar-scroll')).toHaveAttribute('data-planning-view-mode', 'month');
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

  it('switches between fleet and crew lanes without period presets', async () => {
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
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
    expect(screen.getByLabelText('Mois de référence')).toBeInTheDocument();
    expect(document.querySelector('.planning-calendar-scroll')).toHaveAttribute('data-planning-view-mode', 'month');
    await user.click(screen.getByRole('tab', { name: 'Équipages' }));
    expect(screen.getByRole('button', { name: 'Marins' })).toHaveClass('is-active');
    await user.click(screen.getByRole('button', { name: 'Équipes' }));
    expect(screen.getByRole('button', { name: 'Équipes' })).toHaveClass('is-active');
    expect(screen.queryByRole('tab', { name: 'Navire' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Marin' })).not.toBeInTheDocument();
  }, 30_000);

  it('keeps fleet project selection and double-click editing after the compact visual redesign', async () => {
    const user = userEvent.setup();
    const { client } = createClient({ assignments: [assignmentOverviewRow], projects: [planningProjectRow] });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });

    const projectButton = screen.getByRole('button', { name: /Transit Transit Cherbourg/ });
    expect(projectButton.querySelector('.planning-project-title')).toHaveTextContent('Transit Cherbourg');
    await user.click(projectButton);
    expect(projectButton).toHaveClass('is-selected');
    expect(screen.queryByRole('heading', { name: 'Modifier l’événement' })).not.toBeInTheDocument();

    await user.dblClick(projectButton);
    expect(await screen.findByRole('heading', { name: 'Modifier l’événement' })).toBeInTheDocument();
  });

  it('opens billing by default, separates pending absences and updates a project status from its card', async () => {
    const user = userEvent.setup();
    const { client, updateProject } = createClient({
      absences: [requestedLeaveRow, approvedLeaveRow],
      projects: [
        { ...planningProjectRow, id: 600, title: 'Mission facturable', status: 'Validé' },
        { ...planningProjectRow, id: 601, title: 'Mission en attente', status: 'Non validé' },
        { ...planningProjectRow, id: 602, title: 'Mission météo', status: 'Stand-by météo' },
        { ...planningProjectRow, id: 603, title: 'Mission terminée', status: 'Facturé' },
      ],
      updatedProject: { ...planningProjectRow, id: 600, title: 'Mission facturable', status: 'Facturé' },
    });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    const billingPanel = screen.getByLabelText('Suivi opérationnel du planning');
    expect(within(billingPanel).getByText('Facturation')).toBeInTheDocument();
    expect(await within(billingPanel).findByText('Mission facturable')).toBeInTheDocument();
    expect(within(billingPanel).getByText('À facturer', { selector: '.planning-side-badge' })).toBeInTheDocument();
    expect(within(billingPanel).getByRole('tab', { name: 'À facturer, 1 projet' })).toHaveAttribute('aria-selected', 'true');
    expect(within(billingPanel).queryByText('Mission en attente')).not.toBeInTheDocument();
    expect(within(billingPanel).queryByText('Mission météo')).not.toBeInTheDocument();
    expect(within(billingPanel).queryByText('Mission terminée')).not.toBeInTheDocument();
    expect(within(billingPanel).getByText('Période')).toBeInTheDocument();
    expect(within(billingPanel).getByText('08/07/2026 – 10/07/2026')).toBeInTheDocument();
    expect(within(billingPanel).getByText('Navire')).toBeInTheDocument();
    expect(within(billingPanel).getByText('COTENTIN')).toBeInTheDocument();

    await user.click(within(billingPanel).getByRole('tab', { name: 'Demandes en attente, 1 demande' }));
    expect(within(billingPanel).getByText('Paul DURAND')).toBeInTheDocument();
    expect(within(billingPanel).getByText('À valider')).toBeInTheDocument();
    expect(within(billingPanel).queryByText('Mission en attente')).not.toBeInTheDocument();

    await user.click(within(billingPanel).getByRole('tab', { name: 'À facturer, 1 projet' }));
    await user.click(within(billingPanel).getByRole('button', { name: /Mission facturable/ }));
    const statusSelect = within(billingPanel).getByLabelText('Statut de Mission facturable');
    expect(within(statusSelect).getAllByRole('option').map((option) => option.textContent)).toEqual(['Non validé', 'Validé', 'Stand-by météo', 'Facturé']);
    await user.selectOptions(statusSelect, 'Facturé');
    await waitFor(() => expect(updateProject).toHaveBeenCalledWith(expect.objectContaining({ status: 'Facturé' })));
    expect(await within(billingPanel).findByText('Aucun projet à facturer.')).toBeInTheDocument();
    expect(within(billingPanel).getByRole('tab', { name: 'À facturer, 0 projet' })).toBeInTheDocument();

    await user.click(within(billingPanel).getByRole('tab', { name: 'Demandes en attente, 1 demande' }));
    await user.click(within(billingPanel).getByRole('button', { name: /Paul DURAND.*À valider/ }));
    expect(await screen.findByRole('dialog', { name: 'Absences, remplacements et centre de conflits' })).toBeInTheDocument();

    const planningMenu = screen.getByRole('navigation', { name: 'Menu du planning' });
    for (const removedButton of ['Facturation', 'Demandes en attente', 'Gérer les navires', 'Conflits', 'Absences et conflits', 'Historique']) {
      expect(within(planningMenu).queryByRole('button', { name: new RegExp(`^${removedButton}`) })).not.toBeInTheDocument();
    }
  });

  it('hides former employees and empty sailor rows for the selected reference month', async () => {
    const departedBeforeAugust = { ...departedCrewRow, departed_on: '2026-07-31' };
    const departedAssignment = {
      ...assignmentOverviewRow,
      id: 101,
      crew_person_id: departedBeforeAugust.id,
      crew_name: 'Alain ANCIEN',
      starts_on: '2026-08-01',
      ends_on: '2026-08-10',
    };
    const augustAssignment = {
      ...assignmentOverviewRow,
      starts_on: '2026-08-01',
      ends_on: '2026-08-10',
    };
    const emptyActiveBoardRow = { ...emptyBoardRow, id: 901, person_id: secondCrewRow.id };
    const { client } = createClient({
      assignments: [augustAssignment, departedAssignment],
      boardRows: [emptyActiveBoardRow],
      people: [captainRow, crewRow, secondCrewRow, departedBeforeAugust],
    });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });

    fireEvent.change(screen.getByLabelText('Mois de référence'), { target: { value: '2026-08' } });

    await waitFor(() => expect(screen.getAllByText('Paul DURAND').length).toBeGreaterThan(0));
    expect(screen.queryByText('Alain ANCIEN')).not.toBeInTheDocument();
    expect(screen.queryByText('Luc MOREL')).not.toBeInTheDocument();
  });

  it('opens the searchable project catalog by double-clicking a vessel cell', async () => {
    const user = userEvent.setup();
    const { client } = createClient({ assignments: [assignmentOverviewRow], projects: [planningProjectRow] });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });

    const date = todayPlanningDate();
    await user.dblClick(screen.getByRole('button', {
      name: `Planifier un projet pour COTENTIN le ${formatPlanningDate(date)}`,
    }));

    expect(await screen.findByRole('dialog', { name: 'Rattacher l’opération à un projet' })).toBeInTheDocument();
    expect(screen.getByLabelText('Rechercher un projet par mot-clé')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /P267.*Remorquage Cherbourg/ })).toBeInTheDocument();
  });

  it('opens the full Projects assistant from the Planning toolbar', async () => {
    const user = userEvent.setup();
    const previousUrl = window.location.href;
    const { client, insertProject } = createClient({ projects: [] });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('button', { name: 'Nouveau projet' }));
    expect(window.location.pathname).toBe('/modules/projects');
    expect(new URLSearchParams(window.location.search).get('newProject')).toBe('1');
    expect(insertProject).not.toHaveBeenCalled();
    window.history.replaceState({}, '', previousUrl);
  }, 20_000);

  it('keeps fleet filters active and avoids a full reload after an event update', async () => {
    const user = userEvent.setup();
    const updatedProject = { ...planningProjectRow, title: 'Transit Barfleur' };
    const { client, updateProject, vesselOrder } = createClient({ projects: [planningProjectRow], updatedProject });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('button', { name: 'Filtres' }));
    await user.selectOptions(screen.getByLabelText('Filtre type d’événement'), 'transit');
    await user.selectOptions(screen.getByLabelText('Filtre statut'), 'Validé');
    await user.dblClick(screen.getByRole('button', { name: /Transit Transit Cherbourg/ }));
    const dialog = screen.getByRole('dialog');
    await user.clear(within(dialog).getByLabelText('Titre'));
    await user.type(within(dialog).getByLabelText('Titre'), 'Transit Barfleur');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(updateProject).toHaveBeenCalled());
    expect(screen.getByLabelText('Filtre type d’événement')).toHaveValue('transit');
    expect(screen.getByLabelText('Filtre statut')).toHaveValue('Validé');
    expect(vesselOrder).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Événement flotte mis à jour sans rechargement.')).toBeInTheDocument();
  }, 20_000);

  it('uses a rolling seven-week window from the selected month’s Monday and exposes navigation controls', async () => {
    const user = userEvent.setup();
    const { client } = createClient();
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    fireEvent.change(screen.getByLabelText('Mois de référence'), { target: { value: '2025-07' } });
    const calendar = document.querySelector('.planning-calendar-scroll');
    expect(calendar).toHaveAttribute('data-planning-range-start', '2025-06-30');
    expect(calendar).toHaveAttribute('data-planning-range-end', '2025-08-17');
    await user.click(screen.getByRole('button', { name: 'Mois suivant' }));
    expect(screen.getByLabelText('Mois de référence')).toHaveValue('2025-08');
    expect(calendar).toHaveAttribute('data-planning-range-start', '2025-07-28');
    expect(calendar).toHaveAttribute('data-planning-range-end', '2025-09-14');
    await user.click(screen.getByRole('button', { name: 'Mois précédent' }));
    expect(screen.getByLabelText('Mois de référence')).toHaveValue('2025-07');
    expect(screen.getByRole('button', { name: 'Zoom avant' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Afficher le planning en plein écran' })).toBeInTheDocument();
  });

  it('opens the rolling month on the current week’s Monday', async () => {
    const { client } = createClient();
    const { container } = render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    const calendar = container.querySelector<HTMLElement>('.planning-calendar-scroll')!;
    expect(calendar).toHaveAttribute('data-planning-range-start', startOfPlanningWeek(todayPlanningDate()));
    expect(calendar.scrollLeft).toBe(0);
  });

  it('organizes the menu as icon-and-text ribbon groups without changing the calendar controls', async () => {
    const { client } = createClient();
    const { container } = render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    const menu = screen.getByRole('navigation', { name: 'Menu du planning' });
    expect(within(menu).getByRole('group', { name: 'ARMEMENT' })).toBeInTheDocument();
    expect(within(menu).getByRole('group', { name: 'Gestion des congés' })).toHaveClass('is-centered');
    expect(within(menu).queryByRole('group', { name: 'NAVIRES' })).not.toBeInTheDocument();
    expect(within(menu).getByRole('group', { name: 'Aide à la décision' })).toBeInTheDocument();
    expect(within(menu).getByRole('group', { name: 'Documents' })).toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: 'Nouveau projet' })).toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: 'Demander des congés' })).toBeInTheDocument();
    expect(within(menu).queryByRole('button', { name: 'Demandes en attente' })).not.toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: 'Exports' })).toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: "Attestation d'armement" })).toBeInTheDocument();
    expect(within(menu).queryByRole('button', { name: 'Exporter un marin' })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('button', { name: 'Actualiser' })).not.toBeInTheDocument();
    expect(screen.queryByText('Brouillon modifiable')).not.toBeInTheDocument();
    within(menu).getAllByRole('button').forEach((button) => expect(button.querySelector('svg')).toBeInTheDocument());
    const calendar = screen.getByRole('region', { name: 'Calendrier des affectations' });
    expect(within(calendar).queryByRole('button', { name: 'Nouveau projet' })).not.toBeInTheDocument();
    const filterButton = within(calendar).getByRole('button', { name: 'Filtres' });
    const refreshButton = within(calendar).getByRole('button', { name: 'Actualiser' });
    expect(filterButton.nextElementSibling).toBe(refreshButton);
    expect(menu.parentElement).toHaveClass('planning-command-layout');
    expect(container.querySelector('.planning-command-layout + .planning-layout')).toBeInTheDocument();
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
    const functionSelect = screen.getByLabelText<HTMLSelectElement>('Fonction');
    expect(functionSelect.tagName).toBe('SELECT');
    expect(Array.from(functionSelect.options).filter((option) => !option.hidden).map((option) => option.value)).toEqual(assignmentFunctionOptions);
    await user.selectOptions(functionSelect, 'Matelot polyvalent');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ajouter' }));

    await waitFor(() => expect(insertAssignment).toHaveBeenCalledWith({
      vessel_id: 1,
      captain_person_id: 10,
      crew_person_id: 11,
      starts_on: '2026-07-20',
      ends_on: '2026-07-26',
      starts_at: '2026-07-20T06:00:00.000Z',
      ends_at: '2026-07-26T18:00:00.000Z',
      assignment_role: 'Matelot polyvalent',
      status_label: 'En Mer',
      confirmation_status: 'confirmed',
      watch_group: 'Affectation',
      comments: null,
      source_label: 'seapilot',
    }));
    expect(await screen.findByText(/Affectation ajoutée au planning\./)).toBeInTheDocument();
  });

  it('diffuses the current planning globally without locking office editing', async () => {
    const user = userEvent.setup();
    const release = {
      id: 1,
      publication_id: 1,
      version_number: 1,
      comment: '',
      created_at: '2026-07-13T10:00:00Z',
      created_by: 'user-publish',
      created_by_name: 'Direction BBTM',
    };
    const { client } = createClient({ assignments: [], versions: [release] });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    const distributionPanel = screen.getByRole('region', { name: 'Diffusion du planning' });
    expect(distributionPanel).toHaveTextContent('Version 1');
    await user.click(screen.getByRole('button', { name: 'Diffuser le Planning' }));

    expect(await screen.findByText('Planning diffusé en version 1.')).toBeInTheDocument();
    expect(client.rpc).toHaveBeenCalledWith('publish_planning_release');
    expect(screen.queryByText('Brouillon modifiable')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nouveau projet' })).toBeInTheDocument();
  });

  it('allows Armement to diffuse the planning without a validation circuit', async () => {
    const { client } = createClient();
    render(<PlanningPage client={client as never} roles={['armement']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    expect(screen.getByRole('button', { name: 'Diffuser le Planning' })).toBeInTheDocument();
    expect(screen.queryByText(/Soumettre|Valider la période|Archiver/)).not.toBeInTheDocument();
  });

  it('shows pending leave on the timeline and opens approval by clicking its period', async () => {
    const user = userEvent.setup();
    const { client, rpc } = createClient({
      assignments: [assignmentOverviewRow],
      absences: [requestedLeaveRow],
    });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    expect(await screen.findByRole('tab', { name: 'Demandes en attente, 1 demande' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Équipages' }));
    await user.click(screen.getByRole('button', { name: /Congés à valider/ }));

    expect(await screen.findByText('Aucun motif renseigné.', {}, { timeout: 5000 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Valider' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('review_planning_absence', expect.objectContaining({
      p_absence_id: 700,
      p_action: 'approve',
    })));
  });

  it('keeps semantic Planning history loaded without exposing the removed toolbar button', async () => {
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
    const menu = screen.getByRole('navigation', { name: 'Menu du planning' });
    expect(within(menu).queryByRole('button', { name: /Historique/ })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Diffusion du planning' })).toHaveTextContent('Version 1');
  });

  it('shows an expired-document icon on affected cells without blocking the assignment', async () => {
    const user = userEvent.setup();
    const { client, insertAssignment } = createClient({
      assignments: [{ ...assignmentOverviewRow, ends_on: '2026-07-26' }],
      hrDocuments: [medicalDocumentRow],
    });
    const { container } = render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    const expiredCell = screen.getByRole('button', { name: /Document échu : Visite médicale depuis le 15\/07\/2026.*16\/07\/2026 pour Paul DURAND/ });
    expect(expiredCell).toHaveClass('has-expired-document');
    expect(expiredCell.querySelector('.planning-expired-document-icon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifier le statut et le commentaire du 15/07/2026 pour Paul DURAND' })).not.toHaveClass('has-expired-document');

    await user.click(screen.getByRole('tab', { name: 'Équipages' }));
    await user.click(screen.getByRole('button', { name: 'Créer une affectation' }));
    await user.selectOptions(screen.getByLabelText('Navire'), '1');
    await user.selectOptions(screen.getByLabelText('Marin'), '11');
    fireEvent.change(screen.getByLabelText('Debut'), { target: { value: '2026-07-20T08:00' } });
    fireEvent.change(screen.getByLabelText('Fin'), { target: { value: '2026-07-26T20:00' } });

    expect(screen.queryByText('Aptitude médicale non valide')).not.toBeInTheDocument();
    expect(container.querySelector('.planning-derogation-action')).not.toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(insertAssignment).toHaveBeenCalled());
  });

  it('adds a one-day sea assignment by double-clicking an empty sailor cell', async () => {
    const user = userEvent.setup();
    const createdAssignment = { ...assignmentRow, id: 102, starts_on: '2026-07-20', ends_on: '2026-07-20', watch_group: 'Bordée 1', status_label: 'En Mer' };
    const { client, insertAssignment } = createClient({ assignments: [], periods: [planningPeriodRow], createdAssignment });
    render(<PlanningPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('tab', { name: 'Équipages' }));
    await user.dblClick(screen.getByRole('button', { name: /Case vide de Paul DURAND le 20\/07\/2026/ }));
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
    await user.dblClick(screen.getByRole('button', { name: /Case vide de Paul DURAND le 20\/07\/2026/ }));
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
    await user.dblClick(screen.getAllByRole('button', { name: /Paul DURAND, En Mer/ })[0]);
    expect(screen.getByLabelText('Bordée / groupe').tagName).toBe('SELECT');
    expect(screen.getByLabelText('Bordée / groupe')).toHaveValue('Bordée 1');
  });

  it('keeps marins in read-only mode with leave requests, crew lists and project details', async () => {
    const user = userEvent.setup();
    const release = {
      id: 1,
      publication_id: 1,
      version_number: 1,
      comment: '',
      created_at: '2026-07-13T10:00:00Z',
      created_by: 'user-publish',
      created_by_name: 'Direction BBTM',
    };
    const { client } = createClient({
      versions: [release],
      publishedSnapshot: {
        assignments: [],
        days: [],
        periods: [planningPeriodRow],
        projects: [{
          ...planningProjectRow,
          charter_hire: 9999,
          hire_currency: 'EUR',
          hire_unit: 'jour',
          charter_hire_override: true,
          mobilisation_fee: 1500,
          demobilisation_fee: 1750,
        }],
        handovers: [],
        derogations: [],
      },
    });
    render(<PlanningPage client={client as never} roles={['marin']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('tab', { name: 'Équipages' }));
    expect(screen.getAllByText('Paul DURAND').length).toBeGreaterThan(0);
    expect(screen.queryByText('Dernière version diffusée')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Demander des congés' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Générer une crew list' })).toBeInTheDocument();
    expect(screen.queryByText('Affectation rapide')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Absences et conflits' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Facturation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Créer une affectation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Diffuser le Planning' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Flotte' }));
    const projectButton = screen.getByRole('button', { name: /Transit Transit Cherbourg/ });
    fireEvent.contextMenu(projectButton);
    await user.click(screen.getByRole('menuitem', { name: 'Voir les détails' }));
    const detailDialog = await screen.findByRole('dialog');
    expect(detailDialog).toHaveTextContent('Transit Cherbourg');
    expect(detailDialog).toHaveTextContent('Mise en place');
    expect(within(detailDialog).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(detailDialog).queryByRole('button', { name: /Enregistrer|Modifier|Supprimer|Dupliquer|Annuler/ })).not.toBeInTheDocument();
    expect(detailDialog).not.toHaveTextContent('9 999');
    expect(detailDialog).not.toHaveTextContent('1 500');
    expect(detailDialog).not.toHaveTextContent('1 750');
    expect(detailDialog).not.toHaveTextContent('EUR');
  });

  it('limits captains to leave requests and crew-list generation', async () => {
    const release = {
      id: 1,
      publication_id: 1,
      version_number: 1,
      comment: '',
      created_at: '2026-07-13T10:00:00Z',
      created_by: 'user-publish',
      created_by_name: 'Direction BBTM',
    };
    const { client } = createClient({
      versions: [release],
      publishedSnapshot: {
        assignments: [assignmentOverviewRow],
        days: [],
        periods: [planningPeriodRow],
        projects: [{
          ...planningProjectRow,
          charter_hire: 9999,
          hire_currency: 'EUR',
          mobilisation_fee: 1500,
          demobilisation_fee: 1750,
        }],
        handovers: [],
        derogations: [],
      },
    });
    render(<PlanningPage client={client as never} roles={['capitaine']} />);

    await screen.findByRole('heading', { name: 'Planning' });
    expect(screen.getByRole('button', { name: 'Demander des congés' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Générer une crew list' })).toBeInTheDocument();
    expect(screen.queryByText('Affectation rapide')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Facturation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Absences et conflits' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exports' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Créer une affectation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Diffuser le Planning' })).not.toBeInTheDocument();
    const projectButton = screen.getByRole('button', { name: /Transit Transit Cherbourg/ });
    fireEvent.contextMenu(projectButton);
    expect(await screen.findByRole('menuitem', { name: 'Voir les détails' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Modifier|Supprimer|Dupliquer|Annuler/ })).not.toBeInTheDocument();
  });

  it('allows office direction to edit while keeping vessel administration restricted', async () => {
    const user = userEvent.setup();
    const { client } = createClient({ periods: [planningPeriodRow] });
    render(<PlanningPage client={client as never} roles={['direction']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    expect(screen.queryByText('Brouillon modifiable')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Équipages' }));
    expect(screen.getByRole('button', { name: 'Créer une affectation' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gérer les navires' })).not.toBeInTheDocument();
  });

  it('assigns an unassigned sailor by dropping the card on a board without reloading', async () => {
    const visibleRange = timelineRange(buildPlanningTimeline(todayPlanningDate(), 'month'));
    const existingCaptainPeriod = { ...planningPeriodRow, id: 302, crew_name: 'Jean MARTIN', function_label: 'Capitaine' };
    const { client, insertAssignment, vesselOrder } = createClient({ assignments: [], people: [captainRow, crewRow], periods: [existingCaptainPeriod] });
    const { container } = render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    fireEvent.click(screen.getByRole('button', { name: 'Fermer le suivi opérationnel' }));

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
      starts_on: visibleRange.start,
      ends_on: visibleRange.end,
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

  it('edits a health status and a different short text on each colored assignment day', async () => {
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
    const { container } = render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });

    expect(screen.getByRole('button', { name: 'Ouvrir la fiche de COTENTIN' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter une bordée à COTENTIN' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter un marin à Affectation de COTENTIN' })).toBeInTheDocument();
    const dayCell = screen.getByRole('button', { name: 'Modifier le statut et le commentaire du 14/07/2026 pour Paul DURAND' });
    const previousDayCell = screen.getByRole('button', { name: 'Modifier le statut et le commentaire du 13/07/2026 pour Paul DURAND' });
    const firstDayCell = screen.getByRole('button', { name: 'Modifier le statut et le commentaire du 01/07/2026 pour Paul DURAND' });
    expect(previousDayCell).toHaveClass('is-segment-end');
    expect(dayCell).toHaveClass('is-segment-start');
    expect(firstDayCell).toHaveClass('is-first', 'is-segment-start', 'is-sea');
    expect(dayCell).toHaveClass('is-last', 'is-segment-start', 'is-sea');
    expect(container.querySelector('.planning-fleet-assignment-label')).not.toBeInTheDocument();
    expect(dayCell).not.toHaveTextContent(/En mer|À terre|Embarqué/i);
    await user.click(dayCell);
    expect(screen.queryByRole('dialog', { name: 'Statut et commentaire' })).not.toBeInTheDocument();
    fireEvent.contextMenu(dayCell);
    const dialog = await screen.findByRole('dialog', { name: 'Statut et commentaire' });
    expect(within(dialog).getByText('Tout le groupe de cases')).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: 'Vacances' })).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: 'Arrêt Maladie' })).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: 'Accident du Travail' })).toBeInTheDocument();
    expect(within(dialog).queryByText(/^Vacance$/)).not.toBeInTheDocument();
    await user.click(within(dialog).getByText('Accident du Travail'));
    const noteInput = within(dialog).getByLabelText('Commentaire');
    await user.clear(noteInput);
    await user.type(noteInput, 'Le Havre');
    await user.click(within(dialog).getByRole('button', { name: 'Appliquer à ce jour' }));

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('save_planning_assignment_day_state', {
      p_assignment_id: 100,
      p_work_date: '2026-07-14',
      p_status: 'Accident du Travail',
      p_note: 'Le Havre',
    }));
    expect(await screen.findByText('Accident du Travail enregistré pour Paul DURAND le 14/07/2026.')).toBeInTheDocument();
  });

  it('creates a board independently from the vessel staffing decision', async () => {
    const user = userEvent.setup();
    const { client, rpc } = createClient({
      assignments: [assignmentOverviewRow],
    });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    await user.click(screen.getByRole('button', { name: 'Ajouter une bordée à COTENTIN' }));

    const dialog = await screen.findByRole('dialog', { name: 'Ajouter un marin à Bordée 1' });
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter Jean MARTIN' }));

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('add_planning_board_row_for_month', {
      p_vessel_id: 1,
      p_watch_group: 'Bordée 1',
      p_person_id: 10,
      p_reference_month: '2026-06-01',
    }));
  });

  it('lists only sailors whose employment overlaps the reference month and adds an eligible row', async () => {
    const user = userEvent.setup();
    const { client, rpc } = createClient({
      assignments: [assignmentOverviewRow],
      people: [captainRow, crewRow, departedCrewRow, futureDepartureCrewRow, pastDepartureCrewRow, todayDepartureCrewRow],
    });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });

    await user.click(screen.getByRole('button', { name: 'Ajouter un marin à Affectation de COTENTIN' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ajouter un marin à Affectation' });
    expect(within(dialog).getByText('Alain ANCIEN')).toBeInTheDocument();
    expect(within(dialog).getByText('Camille FUTURE')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Ajouter Paul DURAND' })).toBeEnabled();
    expect(within(dialog).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['Capitaine', 'Matelot']);
    const captainGroup = within(dialog).getByRole('region', { name: 'Capitaine' });
    const sailorGroup = within(dialog).getByRole('region', { name: 'Matelot' });
    expect(within(captainGroup).getByText('Jean MARTIN')).toBeInTheDocument();
    expect(within(sailorGroup).getByText('Paul DURAND')).toBeInTheDocument();
    expect(within(captainGroup).queryByText('Paul DURAND')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Étienne PASSÉ')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Aline AUJOURD’HUI')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter Camille FUTURE' }));

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('add_planning_board_row_for_month', {
      p_vessel_id: 1,
      p_watch_group: 'Affectation',
      p_person_id: 14,
      p_reference_month: '2026-06-01',
    }));
    expect(await screen.findByText('Camille FUTURE a été ajouté comme ligne vide à Affectation.')).toBeInTheDocument();
  });

  it('orders function groups, hides missing functions and only shows dated contract details', async () => {
    const user = userEvent.setup();
    const orderedPeople = [
      { ...crewRow, id: 1001, first_name: 'Benjamin', last_name: 'BON', function_label: 'Président' },
      { ...crewRow, id: 1002, first_name: 'Adrien', last_name: 'BOIS', function_label: 'Capitaine' },
      { ...crewRow, id: 1003, first_name: 'Arnaud', last_name: 'HAUTEMANIERE', function_label: 'Chef Mécanicien' },
      { ...crewRow, id: 1004, first_name: 'Boris', last_name: 'BROT', function_label: '2nd Capitaine', contract_type: 'CDD', departed_on: '2026-12-31' },
      { ...crewRow, id: 1012, first_name: 'Marine', last_name: 'MACHINE', function_label: 'Second Mécanicien' },
      { ...crewRow, id: 1005, first_name: 'Matthieu', last_name: 'DURAND', function_label: "Maître d'Equipage" },
      { ...crewRow, id: 1006, first_name: 'Alexandre', last_name: 'ROUPSARD', function_label: 'Matelot polyvalent' },
      { ...crewRow, id: 1007, first_name: 'Clément', last_name: 'DEROBERT', function_label: 'Matelot Qualifié' },
      { ...crewRow, id: 1008, first_name: 'Christophe', last_name: 'MINASSIAN', function_label: 'Directeur QHSE / Chef de Projet' },
      { ...crewRow, id: 1009, first_name: 'Sophie', last_name: 'HAMEL', function_label: 'Directrice Administrative et Financière' },
      { ...crewRow, id: 1010, first_name: 'Adam', last_name: 'DEBORDEAUX', function_label: 'Stagiaire' },
      { ...crewRow, id: 1011, first_name: 'Profil', last_name: 'SANS-FONCTION', function_label: '' },
    ];
    const { client } = createClient({ assignments: [assignmentOverviewRow], people: orderedPeople });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });

    await user.click(screen.getByRole('button', { name: 'Ajouter un marin à Affectation de COTENTIN' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ajouter un marin à Affectation' });
    expect(within(dialog).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'Président',
      'Capitaine',
      'Chef Mécanicien',
      '2nd Capitaine',
      'Second Mécanicien',
      "Maître d'Equipage",
      'Matelot polyvalent',
      'Matelot Qualifié',
      'Directeur QHSE / Chef de Projet',
      'Directrice Administrative et Financière',
      'Stagiaire',
    ]);
    expect(within(dialog).queryByText('Profil SANS-FONCTION')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Fonction non renseignée')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('CDI · Départ non renseigné')).not.toBeInTheDocument();
    const presidentCard = within(dialog).getByText('Benjamin BON').closest('article')!;
    expect(within(presidentCard).queryByText(/CDI|Départ/)).not.toBeInTheDocument();
    const cddCard = within(dialog).getByText('Boris BROT').closest('article')!;
    expect(within(cddCard).getByText('CDD · Départ 31/12/2026')).toBeInTheDocument();
  });

  it('offers a sailor employed during January 2025 when that month is selected', async () => {
    const user = userEvent.setup();
    const loicAlix = {
      ...crewRow,
      id: 1012,
      first_name: 'Loïc',
      last_name: 'ALIX',
      hired_on: '2021-04-01',
      departed_on: '2025-01-20',
      active: false,
    };
    const hiredLater = {
      ...crewRow,
      id: 1013,
      first_name: 'Après',
      last_name: 'JANVIER',
      hired_on: '2025-02-01',
    };
    const januaryAssignment = {
      ...assignmentOverviewRow,
      starts_on: '2025-01-01',
      ends_on: '2025-01-31',
    };
    const { client, rpc } = createClient({ assignments: [januaryAssignment], people: [loicAlix, hiredLater] });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });

    fireEvent.change(screen.getByLabelText('Mois de référence'), { target: { value: '2025-01' } });
    await user.click(screen.getByRole('button', { name: 'Ajouter un marin à Affectation de COTENTIN' }));

    const dialog = await screen.findByRole('dialog', { name: 'Ajouter un marin à Affectation' });
    expect(within(dialog).getByText(/mois de référence/)).toHaveTextContent('janvier 2025');
    expect(within(dialog).getByRole('button', { name: 'Ajouter Loïc ALIX' })).toBeEnabled();
    expect(within(dialog).queryByText('Après JANVIER')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter Loïc ALIX' }));

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('add_planning_board_row_for_month', {
      p_vessel_id: 1,
      p_watch_group: 'Affectation',
      p_person_id: 1012,
      p_reference_month: '2025-01-01',
    }));
  });

  it('keeps a historical sailor selectable when creating an assignment inside employment dates', async () => {
    const user = userEvent.setup();
    const loicAlix = {
      ...crewRow,
      id: 1012,
      first_name: 'Loic',
      last_name: 'ALIX',
      hired_on: '2024-07-01',
      departed_on: '2025-12-02',
      active: false,
    };
    const hiredLater = {
      ...crewRow,
      id: 1013,
      first_name: 'Après',
      last_name: 'JANVIER',
      hired_on: '2025-02-01',
      active: false,
    };
    const createdAssignment = {
      ...assignmentRow,
      id: 102,
      crew_person_id: loicAlix.id,
      starts_on: '2025-01-10',
      ends_on: '2025-01-10',
      watch_group: 'Affectation',
      status_label: 'En Mer',
    };
    const { client, insertAssignment } = createClient({
      assignments: [],
      people: [loicAlix, hiredLater],
      createdAssignment,
    });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });

    fireEvent.change(screen.getByLabelText('Mois de référence'), { target: { value: '2025-01' } });
    await user.click(screen.getByRole('tab', { name: 'Équipages' }));
    await user.click(screen.getByRole('button', { name: 'Créer une affectation' }));
    fireEvent.change(screen.getByLabelText('Debut'), { target: { value: '2025-01-10T08:00' } });
    fireEvent.change(screen.getByLabelText('Fin'), { target: { value: '2025-01-10T20:00' } });

    const sailorSelect = screen.getByLabelText<HTMLSelectElement>('Marin');
    expect(Array.from(sailorSelect.options).map((option) => option.textContent)).toContain('Loic ALIX · Matelot');
    expect(Array.from(sailorSelect.options).map((option) => option.textContent)).not.toContain('Après JANVIER · Matelot');
    await user.selectOptions(screen.getByLabelText('Navire'), '1');
    await user.selectOptions(sailorSelect, String(loicAlix.id));
    await user.selectOptions(screen.getByLabelText('Fonction'), 'Matelot polyvalent');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ajouter' }));

    await waitFor(() => expect(insertAssignment).toHaveBeenCalledWith(expect.objectContaining({
      crew_person_id: loicAlix.id,
      starts_on: '2025-01-10',
      ends_on: '2025-01-10',
    })));
  });

  it('allows adding an eligible sailor even when an existing planning record is present', async () => {
    const user = userEvent.setup();
    const departedAssignment = {
      ...assignmentOverviewRow,
      id: 101,
      crew_person_id: 13,
      crew_name: 'Alain ANCIEN',
    };
    const { client, rpc } = createClient({
      assignments: [assignmentOverviewRow, departedAssignment],
      people: [captainRow, crewRow, departedCrewRow],
    });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });

    await user.click(screen.getByRole('button', { name: 'Ajouter un marin à Affectation de COTENTIN' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ajouter un marin à Affectation' });
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter Alain ANCIEN' }));

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('add_planning_board_row_for_month', {
      p_vessel_id: 1,
      p_watch_group: 'Affectation',
      p_person_id: 13,
      p_reference_month: '2026-06-01',
    }));
  });

  it('does not render a sailor whose board row has no colored planning cell', async () => {
    const { client, rpc } = createClient({
      assignments: [assignmentOverviewRow],
      boardRows: [emptyBoardRow],
      people: [captainRow, crewRow, departedCrewRow],
    });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });

    expect(screen.queryByRole('button', { name: 'Supprimer la ligne vide de Paul DURAND' })).not.toBeInTheDocument();
    expect(screen.queryByText('Alain ANCIEN')).not.toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith('delete_planning_board_row', { p_row_id: 900 });
  });

  it('colors an empty fleet cell only on double-click without opening the full form', async () => {
    const user = userEvent.setup();
    const { client, rpc } = createClient({ assignments: [assignmentOverviewRow], periods: [] });
    const { container } = render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });

    const emptyCell = screen.getByRole('button', { name: /Case vide de Paul DURAND le 15\/07\/2026.*Double-cliquer pour colorer la case/ });
    await user.click(emptyCell);
    expect(emptyCell.querySelector('.planning-empty-cell-marker')).not.toBeInTheDocument();
    expect(screen.queryByText('Formulaire complet')).not.toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith('apply_planning_grid_cells', expect.anything());

    await user.dblClick(emptyCell);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('apply_planning_grid_cells', {
      p_cells: [expect.objectContaining({
        personId: 11,
        vesselId: 1,
        workDate: '2026-07-15',
        status: 'En Mer',
      })],
    }));
    expect(screen.queryByText('Formulaire complet')).not.toBeInTheDocument();
    expect(container.querySelector('.planning-empty-cell-marker.is-default')).toBeInTheDocument();
  });

  it('renders a continuous fleet assignment label without replacing daily interaction buttons', async () => {
    const { client } = createClient({ assignments: [assignmentOverviewRow], periods: [] });
    const { container } = render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });

    expect(container.querySelector('.planning-fleet-assignment-label')).toHaveTextContent('COTENTIN');
    expect(container.querySelectorAll('.planning-assignment-note-cell').length).toBeGreaterThan(1);
    expect(screen.getByRole('button', { name: 'Modifier le statut et le commentaire du 10/07/2026 pour Paul DURAND' })).toBeInTheDocument();
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

    const emptyCell = screen.getByRole('button', { name: /Case vide de Paul DURAND le 15\/07\/2026/ });
    await user.dblClick(emptyCell);
    expect(emptyCell.querySelector('.planning-empty-cell-marker.is-armement')).toBeInTheDocument();
  });

  it('pans the calendar horizontally and vertically while the pointer is held', async () => {
    const { client, rpc } = createClient({ assignments: [assignmentOverviewRow], periods: [] });
    const { container } = render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    const calendar = container.querySelector<HTMLElement>('.planning-calendar-scroll')!;
    const emptyCell = screen.getByRole('button', { name: /Case vide de Paul DURAND le 15\/07\/2026/ });
    calendar.scrollLeft = 120;
    calendar.scrollTop = 40;

    fireEvent.pointerDown(emptyCell, { button: 0, buttons: 1, pointerId: 7, clientX: 300, clientY: 260 });
    expect(calendar).toHaveClass('is-panning');
    fireEvent.pointerMove(window, { buttons: 1, pointerId: 7, clientX: 250, clientY: 200 });
    expect(calendar.scrollLeft).toBe(170);
    expect(calendar.scrollTop).toBe(100);
    fireEvent.pointerUp(window, { button: 0, pointerId: 7, clientX: 250, clientY: 200 });

    expect(calendar).not.toHaveClass('is-panning');
    expect(emptyCell.querySelector('.planning-empty-cell-marker')).not.toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith('apply_planning_grid_cells', expect.anything());
  });

  it('supports Ctrl+X and Ctrl+V between grid dates through the atomic move RPC', async () => {
    const { client, rpc } = createClient({ assignments: [assignmentOverviewRow], periods: [] });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    const source = screen.getByRole('button', { name: 'Modifier le statut et le commentaire du 14/07/2026 pour Paul DURAND' });
    const target = screen.getByRole('button', { name: /Case vide de Paul DURAND le 18\/07\/2026/ });

    fireEvent.click(source, { button: 0, ctrlKey: true });
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
    await screen.findByText(/1 case copiée/);
    fireEvent.keyDown(window, { key: 'x', ctrlKey: true });
    await screen.findByText(/1 case coupée/);
    fireEvent.click(target, { button: 0 });
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
    fireEvent.click(source, { button: 0, ctrlKey: true });
    fireEvent.keyDown(window, { key: 'Delete' });

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('remove_planning_grid_cells', {
      p_cells: [expect.objectContaining({ assignmentId: 100, workDate: '2026-07-14' })],
      p_reason: 'Suppression manuelle depuis la grille',
    }));
    expect(confirm).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });

  it('deletes one case or its group from the contextual menu without a native confirmation', async () => {
    const user = userEvent.setup();
    const nativeConfirm = vi.spyOn(window, 'confirm');
    const { client, rpc } = createClient({ assignments: [assignmentOverviewRow], periods: [] });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    const source = screen.getByRole('button', { name: 'Modifier le statut et le commentaire du 14/07/2026 pour Paul DURAND' });

    fireEvent.contextMenu(source);
    const dialog = await screen.findByRole('dialog', { name: 'Statut et commentaire' });
    expect(within(dialog).getByRole('button', { name: 'Supprimer cette case' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Tout le groupe de cases' }));
    expect(within(dialog).getByRole('button', { name: 'Supprimer le groupe' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Ce jour' }));
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer cette case' }));
    await user.click(within(dialog).getByRole('button', { name: 'Confirmer la suppression' }));

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('remove_planning_grid_cells', {
      p_cells: [expect.objectContaining({ assignmentId: 100, workDate: '2026-07-14' })],
      p_reason: 'Suppression depuis le menu contextuel d’une case',
    }));
    expect(nativeConfirm).not.toHaveBeenCalled();
    nativeConfirm.mockRestore();
  });

  it('keeps fullscreen active when an assignment is cancelled from its form', async () => {
    const user = userEvent.setup();
    const nativeConfirm = vi.spyOn(window, 'confirm');
    const { client, updateAssignment } = createClient({ assignments: [assignmentOverviewRow], periods: [] });
    const { container } = render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    const workspace = container.querySelector<HTMLElement>('.planning-workspace')!;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: workspace });
    fireEvent(document, new Event('fullscreenchange'));

    await user.dblClick(container.querySelector<HTMLButtonElement>('.planning-crew-bar')!);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Annuler l’affectation' }));
    expect(within(dialog).getByText(/Elle restera visible et historisée/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Confirmer' }));

    await waitFor(() => expect(updateAssignment).toHaveBeenCalled());
    expect(workspace).toHaveClass('is-fullscreen');
    expect(nativeConfirm).not.toHaveBeenCalled();
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    nativeConfirm.mockRestore();
  });

  it('lets only administrators drag approved vacations to a new date', async () => {
    const { client, rpc } = createClient({ assignments: [assignmentOverviewRow], absences: [approvedLeaveRow], periods: [] });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    const vacation = await screen.findByRole('button', { name: /Congés validés du 06\/07\/2026 au 09\/07\/2026/ });
    expect(vacation).toHaveAttribute('draggable', 'true');
    const values = new Map<string, string>();
    const dataTransfer = {
      dropEffect: 'move',
      effectAllowed: 'move',
      types: [] as string[],
      getData: (type: string) => values.get(type) || '',
      setData: (type: string, value: string) => {
        values.set(type, value);
        dataTransfer.types = [...values.keys()];
      },
    };
    fireEvent.dragStart(vacation, { dataTransfer });
    const target = vacation.closest('.planning-timeline-row')!.querySelector<HTMLElement>('[data-planning-drop-date="2026-07-16"]')!;
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('move_planning_approved_absence', {
      p_absence_id: 701,
      p_starts_at: '2026-07-16T06:00:00.000Z',
      p_ends_at: '2026-07-19T16:00:00.000Z',
    }));
  });

  it('keeps rejected requests visible on the planning timeline', async () => {
    const { client } = createClient({ assignments: [assignmentOverviewRow], absences: [rejectedLeaveRow], periods: [] });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    expect(await screen.findByRole('button', { name: /Congés refusés du 06\/07\/2026 au 09\/07\/2026/ })).toBeInTheDocument();
  });

  it('keeps cancelled requests visible until they are permanently deleted', async () => {
    const { client } = createClient({ assignments: [assignmentOverviewRow], absences: [cancelledLeaveRow], periods: [] });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
    expect(await screen.findByRole('button', { name: /Congés annulés du 06\/07\/2026 au 09\/07\/2026/ })).toBeInTheDocument();
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

    fireEvent.click(conflictCell, { button: 0, ctrlKey: true });
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
    const historicalAssignment = { ...assignmentOverviewRow, assignment_role: 'Second capitaine' };
    const { client } = createClient({ assignments: [historicalAssignment], periods: [] });
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
    const functionSelect = within(dialog).getByLabelText<HTMLSelectElement>('Fonction');
    expect(functionSelect.tagName).toBe('SELECT');
    expect(functionSelect).toHaveValue('2nd Capitaine');
    expect(Array.from(functionSelect.options).filter((option) => !option.hidden).map((option) => option.value)).toEqual(assignmentFunctionOptions);
    await user.selectOptions(functionSelect, 'Stagiaire');
    expect(functionSelect).toHaveValue('Stagiaire');
  });

  it('offers a date, vessel, board and Excel/PDF format for the crew list', async () => {
    const user = userEvent.setup();
    const crewListAssignment = { ...assignmentOverviewRow, starts_on: todayPlanningDate(), ends_on: todayPlanningDate() };
    const { client } = createClient({ assignments: [crewListAssignment], periods: [] });
    render(<PlanningPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Planning' });
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
