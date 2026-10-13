import type { SupabaseClient } from '@supabase/supabase-js';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkingTimeDayApproval, WorkingTimeWorkspace } from './workingTimeQueries';
import {
  discardWorkingTimeDraft,
  fetchWorkingTimeDayContext,
  getOrCreateWorkingTimeRegister,
  saveWorkingTimeInterval,
  saveWorkingTimePhases,
  submitWorkingTimeDay,
  validateWorkingTimeDay,
  validateWorkingTimeDayWithComment,
  voidWorkingTimeInterval,
} from './workingTimeQueries';
import { useWorkingTimeWorkspace } from './useWorkingTimeWorkspace';
import { WorkingTimeWorkflowPanel, workingTimeInitialDay } from './WorkingTimeWorkflowPanel';
import { fetchWorkingTimeEditSettings } from './workingTimeSettings';

vi.mock('./useWorkingTimeWorkspace', () => ({ useWorkingTimeWorkspace: vi.fn() }));
vi.mock('./workingTimeSettings', () => ({ fetchWorkingTimeEditSettings: vi.fn() }));
vi.mock('./workingTimeQueries', async (importOriginal) => {
  const original = await importOriginal<typeof import('./workingTimeQueries')>();
  return {
    ...original,
    fetchWorkingTimePhasesRecommendation: vi.fn().mockResolvedValue({
      status: 'conforme', policyId: 1, policyName: 'Accords Collectifs du 27/06/2025',
      alreadyNonCompliant: false, available24hSeconds: 14400, available7dSeconds: 180000,
      work24hSeconds: 28800, work7dSeconds: 79200, rest24hSeconds: 57600,
      longestRest24hSeconds: 43200, restImpactSeconds: -14400, consecutiveRestImpactSeconds: -3600,
      maxAdditionalSeconds: 14400, latestEndAt: '2026-08-03T16:00:00Z',
      nextResumeAt: '2026-08-03T22:00:00Z', violationCodes: [],
    }),
    getOrCreateWorkingTimeRegister: vi.fn().mockResolvedValue(100),
    fetchWorkingTimeDayContext: vi.fn().mockResolvedValue({
      assignmentId: 1,
      vesselId: 7,
      watchGroup: 'Bordée 1',
      statusLabel: 'En Mer',
      approverPersonId: 11,
      captainCandidates: [{ personId: 11, firstName: 'Claude', lastName: 'CAPITAINE', name: 'Claude CAPITAINE' }],
    }),
    submitWorkingTimeDay: vi.fn().mockResolvedValue(1),
    validateWorkingTimeDay: vi.fn().mockResolvedValue(1),
    validateWorkingTimeDayWithComment: vi.fn().mockResolvedValue(1),
    discardWorkingTimeDraft: vi.fn().mockResolvedValue(100),
    saveWorkingTimeInterval: vi.fn(),
    saveWorkingTimePhases: vi.fn().mockResolvedValue([301]),
    voidWorkingTimeInterval: vi.fn(),
    saveWorkingTimeDayComment: vi.fn().mockResolvedValue(1),
  };
});

const client = {} as SupabaseClient;
const currentPerson = { id: 10, firstName: 'Camille', lastName: 'CAPITAINE', functionLabel: 'Capitaine', gradeLabel: '', active: true, hiredOn: '2020-01-01', departedOn: '' };
const reload = vi.fn().mockResolvedValue(true);
const onOpenHse = vi.fn();
const onOpenImport = vi.fn();
const onOpenReport = vi.fn();
const onOpenWorkRest = vi.fn();
const defaultDayContext = {
  assignmentId: 1,
  vesselId: 7,
  watchGroup: 'Bordée 1',
  statusLabel: 'En Mer',
  approverPersonId: 11,
  captainCandidates: [{ personId: 11, firstName: 'Claude', lastName: 'CAPITAINE', name: 'Claude CAPITAINE' }],
};

function workspace(status: WorkingTimeWorkspace['registers'][number]['status'], personId = 10): WorkingTimeWorkspace {
  return {
    currentPersonId: 10,
    readablePeople: [
      { personId: 10, firstName: 'Camille', lastName: 'CAPITAINE', functionLabel: 'Capitaine', isSelf: true },
      { personId: 20, firstName: 'Alex', lastName: 'MARIN', functionLabel: 'Matelot', isSelf: false },
    ],
    editablePeople: [
      { personId: 10, firstName: 'Camille', lastName: 'CAPITAINE', functionLabel: 'Capitaine', isSelf: true },
      { personId: 20, firstName: 'Alex', lastName: 'MARIN', functionLabel: 'Matelot', isSelf: false },
    ],
    registers: [{
      id: 100,
      companyId: 1,
      personId,
      personName: personId === 10 ? 'Camille CAPITAINE' : 'Alex MARIN',
      functionLabel: personId === 10 ? 'Capitaine' : 'Matelot',
      periodKind: 'monthly',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      status,
      workRestPolicyId: 1,
    }],
    intervals: [{
      id: 200,
      registerId: 100,
      companyId: 1,
      personId,
      localWorkDate: '2026-08-03',
      startsAt: '2026-08-03T06:00:00Z',
      endsAt: '2026-08-03T14:00:00Z',
      timezoneName: 'Europe/Paris',
      utcOffsetMinutes: 120,
      vesselId: 7,
      watchGroup: 'Bordée 1',
      comment: null,
      authorUserId: 'user',
      authorPersonId: 10,
      sourceType: 'manual',
      sourceReference: null,
      sourceRecordKey: null,
    }],
    calculations: [],
    dayComments: [],
    signatures: [
      { id: 300, personId: 10, versionNumber: 1, storageBucket: 'working-time-signatures', storagePath: '1/10/sign.png', mimeType: 'image/png', fileSizeBytes: 1234, sha256: 'a'.repeat(64), validFrom: '2026-01-01T00:00:00Z' },
      { id: 301, personId: 20, versionNumber: 1, storageBucket: 'working-time-signatures', storagePath: '1/20/sign.png', mimeType: 'image/png', fileSizeBytes: 1234, sha256: 'b'.repeat(64), validFrom: '2026-01-01T00:00:00Z' },
    ],
    validations: [],
    dayApprovals: [],
    vessels: [{ id: 7, name: 'Navire Test', acronym: 'NT' }],
    policies: [{
      id: 1,
      name: 'Accords Collectifs du 27/06/2025',
      maxWork24h: 12,
      minRest24h: 10,
      maxWork7d: 84,
      minRest7d: 52,
      minConsecutiveRestHours: 6,
      maxRestPeriods24h: 6,
      maxNightWork24h: 10,
    }],
  };
}

function submittedApproval(overrides: Partial<WorkingTimeDayApproval> = {}): WorkingTimeDayApproval {
  return {
    id: 501, companyId: 1, registerId: 100, personId: 20,
    localWorkDate: '2026-08-03', status: 'submitted', planningAssignmentId: 1,
    vesselId: 7, watchGroup: 'Bordée 1', approverPersonId: 10,
    submittedAt: '2026-08-03T16:00:00Z', validatedAt: null, validatedByPersonId: null,
    subjectSignatureSnapshot: null, approverSignatureSnapshot: null,
    ...overrides,
  };
}

function renderPanel(
  roles: Array<'capitaine' | 'marin' | 'armement' | 'admin' | 'direction'>,
  data: WorkingTimeWorkspace,
  person = currentPerson,
  referenceDate = '2026-09-01',
  navigationTarget?: { personId: number; date: string },
) {
  vi.mocked(useWorkingTimeWorkspace).mockReturnValue({
    workspace: data,
    loadedRange: { start: '2026-08-01', end: '2026-08-31' },
    isLoading: false,
    errorMessage: null,
    reload,
  });
  return render(
    <WorkingTimeWorkflowPanel
      client={client}
      currentPerson={person}
      navigationTarget={navigationTarget}
      previewMode
      range={{ start: '2026-08-01', end: '2026-08-31' }}
      referenceDate={referenceDate}
      onOpenHse={onOpenHse}
      onOpenImport={onOpenImport}
      onOpenReport={onOpenReport}
      onOpenWorkRest={onOpenWorkRest}
      roles={roles}
    />,
  );
}

describe('WorkingTimeWorkflowPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchWorkingTimeEditSettings).mockResolvedValue({ unrestrictedEditingEnabled: false, canUseUnrestrictedEditing: false });
    reload.mockResolvedValue(true);
    vi.mocked(fetchWorkingTimeDayContext).mockResolvedValue(defaultDayContext);
  });

  it('keeps a real Marin draft through day and month navigation and adjusts both edges', async () => {
    const user = userEvent.setup();
    const data = workspace('draft');
    renderPanel(['marin'], data, { ...currentPerson, functionLabel: 'Matelot' }, '2026-08-03');
    const grid = screen.getByRole('grid', { name: 'Grille horaire du 2026-08-03' });
    await waitFor(() => expect(grid).toHaveAttribute('aria-readonly', 'false'));
    const cells = within(grid).getAllByRole('gridcell');
    fireEvent.pointerDown(cells[36]);
    fireEvent.pointerUp(cells[36]);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Ajuster la fin de la période 1, 18:30' }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Ajuster le début de la période 1, 18:00' }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Ajuster la fin de la période 1, 19:00' }), { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'Période 1 18:30–19:30' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /mar 04 août/ }));
    expect(screen.queryByRole('group', { name: 'Périodes à enregistrer' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mois' }));
    expect(screen.getByRole('img', { name: /lun.*03 août.*à enregistrer : 18:30–19:30/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Jour' }));
    await user.click(screen.getByRole('tab', { name: /lun 03 août/ }));
    expect(screen.getByRole('button', { name: 'Période 1 18:30–19:30' })).toBeInTheDocument();
    expect(saveWorkingTimePhases).not.toHaveBeenCalled();
  });

  it('saves the active keyboard selection even before it is added to pending periods', async () => {
    const user = userEvent.setup();
    renderPanel(['marin'], workspace('draft'), { ...currentPerson, functionLabel: 'Matelot' }, '2026-08-03');
    const grid = screen.getByRole('grid', { name: 'Grille horaire du 2026-08-03' });
    await waitFor(() => expect(grid).toHaveAttribute('aria-readonly', 'false'));
    fireEvent.keyDown(within(grid).getAllByRole('gridcell')[36], { key: 'ArrowRight', shiftKey: true });
    expect(screen.queryByRole('button', { name: /Période 1/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    expect(saveWorkingTimePhases).toHaveBeenCalledWith(client, expect.objectContaining({
      phases: [{ startsAt: new Date('2026-08-03T18:00').toISOString(), endsAt: new Date('2026-08-03T19:00').toISOString() }],
    }));
  });

  it('opens the persisted policy from live compliance only for an administrator', async () => {
    const user = userEvent.setup();
    renderPanel(['admin'], workspace('draft'), currentPerson, '2026-08-03');
    await user.click(screen.getByRole('button', { name: 'Modifier les seuils' }));
    expect(onOpenWorkRest).toHaveBeenCalledWith(1);
  });

  it('shows consultation and no resize controls for a validated real Marin', async () => {
    const user = userEvent.setup();
    const data = workspace('validated');
    data.dayApprovals = [submittedApproval({ personId: 10, status: 'validated' })];
    renderPanel(['marin'], data, { ...currentPerson, functionLabel: 'Matelot' }, '2026-08-03');
    expect(screen.getByRole('grid', { name: 'Grille horaire du 2026-08-03' })).toHaveAttribute('aria-readonly', 'true');
    expect(screen.queryByRole('button', { name: 'Modifier les seuils' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Ajuster les périodes à enregistrer' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Consulter les seuils' }));
    expect(onOpenWorkRest).toHaveBeenCalledWith(1);
  });

  it('opens the linked readable sailor and day in Conformité for a real Capitaine profile', async () => {
    const user = userEvent.setup();
    const data = workspace('draft');
    data.registers.push({ ...data.registers[0], id: 101, personId: 20, personName: 'Alex MARIN', functionLabel: 'Matelot' });
    data.editablePeople = data.editablePeople.filter((person) => person.personId === 10);
    renderPanel(['capitaine'], data, currentPerson, '2026-09-01', { personId: 20, date: '2026-08-19' });

    expect(await screen.findByRole('heading', { name: /Alex MARIN/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mercredi 19 août 2026' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Conformité' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Jour' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(fetchWorkingTimeDayContext).toHaveBeenCalledWith(client, {
      personId: 20, localWorkDate: '2026-08-19',
    }));

    await user.click(screen.getByRole('tab', { name: /jeu 20 août/ }));
    expect(screen.getByRole('heading', { name: 'Jeudi 20 août 2026' })).toBeInTheDocument();
  });

  it('keeps a real Marin on their own readable register when a home target names another sailor', async () => {
    const data = workspace('draft');
    data.readablePeople[0].functionLabel = 'Matelot';
    data.registers[0].functionLabel = 'Matelot';
    data.registers.push({ ...data.registers[0], id: 101, personId: 20, personName: 'Alex MARIN' });
    renderPanel(['marin'], data, { ...currentPerson, functionLabel: 'Matelot' }, '2026-09-01', { personId: 20, date: '2026-08-19' });

    expect(await screen.findByRole('heading', { name: /Camille CAPITAINE/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Alex MARIN/ })).not.toBeInTheDocument();
    expect(fetchWorkingTimeDayContext).not.toHaveBeenCalledWith(client, expect.objectContaining({ personId: 20 }));
  });

  it('waits for loaded readable people before opening a home target', async () => {
    vi.mocked(useWorkingTimeWorkspace).mockReturnValue({ workspace: null, loadedRange: null, isLoading: true, errorMessage: null, reload });
    const props = {
      client,
      currentPerson,
      navigationTarget: { personId: 20, date: '2026-08-19' },
      previewMode: true,
      range: { start: '2026-08-01', end: '2026-08-31' },
      referenceDate: '2026-09-01',
      roles: ['capitaine'] as const,
    };
    const view = render(<WorkingTimeWorkflowPanel {...props} roles={[...props.roles]} />);
    expect(fetchWorkingTimeDayContext).not.toHaveBeenCalled();

    vi.mocked(useWorkingTimeWorkspace).mockReturnValue({ workspace: workspace('draft', 20), loadedRange: props.range, isLoading: false, errorMessage: null, reload });
    view.rerender(<WorkingTimeWorkflowPanel {...props} roles={[...props.roles]} />);
    expect(await screen.findByRole('heading', { name: 'Mercredi 19 août 2026' })).toBeInTheDocument();
    await waitFor(() => expect(fetchWorkingTimeDayContext).toHaveBeenCalledWith(client, {
      personId: 20, localWorkDate: '2026-08-19',
    }));
  });

  it('keeps a September approval target through stale October data and an incomplete loading workspace', async () => {
    const user = userEvent.setup();
    const octoberRange = { start: '2026-10-01', end: '2026-10-31' };
    const septemberRange = { start: '2026-09-01', end: '2026-09-30' };
    const october = workspace('draft');
    october.readablePeople[0] = { ...october.readablePeople[0], firstName: 'Pierre', lastName: 'LEPRETRE' };
    october.readablePeople[1] = { ...october.readablePeople[1], firstName: 'Émilien', departedOn: '2026-10-01', active: false };
    october.registers[0] = { ...october.registers[0], personName: 'Pierre LEPRETRE', periodStart: octoberRange.start, periodEnd: octoberRange.end };
    october.dayApprovals = [20, 21, 22].map((day, index) => submittedApproval({
      id: 501 + index, registerId: 101, localWorkDate: `2026-09-${day}`,
    }));
    const person = { ...currentPerson, firstName: 'Pierre', lastName: 'LEPRETRE' };
    const onNavigateDate = vi.fn();
    const props = { client, currentPerson: person, previewMode: true, referenceDate: '2026-10-11', onNavigateDate };
    vi.mocked(useWorkingTimeWorkspace).mockReturnValue({
      workspace: october, loadedRange: octoberRange, isLoading: false, errorMessage: null, reload,
    });
    const view = render(<WorkingTimeWorkflowPanel {...props} range={octoberRange} roles={['capitaine']} />);
    await user.click(screen.getByRole('tab', { name: /Approbation3/ }));
    fireEvent.change(screen.getByLabelText('Rechercher un marin'), { target: { value: 'Pierre' } });
    await user.click(screen.getByRole('button', { name: /Émilien MARIN.*2026-09-20/ }));
    expect(onNavigateDate).toHaveBeenCalledWith('2026-09-20');
    expect(screen.getByLabelText('Rechercher un marin')).toHaveValue('');

    // The parent range changes before the new request has replaced October's workspace.
    view.rerender(<WorkingTimeWorkflowPanel {...props} range={septemberRange} roles={['capitaine']} />);
    expect(screen.getByText('Chargement du registre mensuel de septembre 2026…')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Dimanche 20 septembre 2026' })).not.toBeInTheDocument();

    const september = { ...october, registers: [{ ...october.registers[0], periodStart: septemberRange.start, periodEnd: septemberRange.end }] };
    vi.mocked(useWorkingTimeWorkspace).mockReturnValue({
      workspace: september, loadedRange: octoberRange, isLoading: true, errorMessage: null, reload,
    });
    view.rerender(<WorkingTimeWorkflowPanel {...props} range={septemberRange} roles={['capitaine']} />);
    expect(screen.queryByRole('heading', { name: 'Dimanche 20 septembre 2026' })).not.toBeInTheDocument();

    const complete = {
      ...september,
      registers: [...september.registers, {
        ...september.registers[0], id: 101, personId: 20, personName: 'Émilien MARIN', functionLabel: 'Matelot',
      }],
      intervals: [{ ...september.intervals[0], personId: 20, registerId: 101,
        localWorkDate: '2026-09-20', startsAt: '2026-09-20T06:00:00Z', endsAt: '2026-09-20T14:00:00Z' }],
    };
    vi.mocked(useWorkingTimeWorkspace).mockReturnValue({
      workspace: complete, loadedRange: septemberRange, isLoading: false, errorMessage: null, reload,
    });
    view.rerender(<WorkingTimeWorkflowPanel {...props} range={septemberRange} roles={['capitaine']} />);
    expect(await screen.findByRole('heading', { name: /Émilien MARIN/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dimanche 20 septembre 2026' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Approbation3/ })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('button', { name: 'Filtrer' }));
    expect(screen.getByLabelText('Personnel ancien')).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Valider la journée' }));
    expect(validateWorkingTimeDay).toHaveBeenCalledWith(client, 501);
  });

  it('reports an unavailable approval register after loading and still allows another manual selection', async () => {
    const user = userEvent.setup();
    const data = workspace('draft');
    data.dayApprovals = [submittedApproval({ registerId: 101 })];
    renderPanel(['capitaine'], data);
    await user.click(screen.getByRole('tab', { name: /Approbation1/ }));
    await user.click(screen.getByRole('button', { name: /Alex MARIN.*2026-08-03/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Le registre demandé pour août 2026 n’est pas accessible.');
    expect(screen.getByRole('heading', { name: /Camille CAPITAINE/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Matelot/ }));
    await user.click(within(screen.getByRole('navigation', { name: 'Registres accessibles' })).getByRole('button', { name: /Alex MARIN/ }));
    expect(screen.getByRole('heading', { name: /Alex MARIN/ })).toBeInTheDocument();
    expect(screen.getByText('Aucun registre mensuel pour août 2026 n’est disponible pour ce marin.')).toBeInTheDocument();
  });

  it('reports a failed month load instead of leaving a permanent loading or creation message', () => {
    vi.mocked(useWorkingTimeWorkspace).mockReturnValue({
      workspace: workspace('draft'), loadedRange: { start: '2026-08-01', end: '2026-08-31' },
      isLoading: false, errorMessage: 'Impossible de charger le mois demandé.', reload,
    });
    render(<WorkingTimeWorkflowPanel client={client} currentPerson={currentPerson} previewMode
      range={{ start: '2026-09-01', end: '2026-09-30' }} referenceDate="2026-10-11" roles={['capitaine']} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Impossible de charger le mois demandé.');
    expect(screen.getByText('Le registre mensuel pour septembre 2026 n’a pas pu être chargé.')).toBeInTheDocument();
    expect(screen.queryByText(/Chargement du registre mensuel/)).not.toBeInTheDocument();
    expect(screen.queryByText(/en cours de création automatique/)).not.toBeInTheDocument();
  });

  it('does not claim automatic creation for another sailor whose monthly register is absent', async () => {
    renderPanel(['capitaine'], workspace('draft'), currentPerson, '2026-09-01', { personId: 20, date: '2026-08-03' });
    expect(await screen.findByRole('heading', { name: /Alex MARIN/ })).toBeInTheDocument();
    expect(screen.getByText('Aucun registre mensuel pour août 2026 n’est disponible pour ce marin.')).toBeInTheDocument();
    expect(screen.queryByText(/en cours de création automatique/)).not.toBeInTheDocument();
    expect(getOrCreateWorkingTimeRegister).not.toHaveBeenCalled();
  });

  it('announces automatic creation only while the current sailor register is being prepared', () => {
    const data = workspace('draft');
    data.registers = [];
    vi.mocked(getOrCreateWorkingTimeRegister).mockReturnValueOnce(new Promise(() => {}));
    renderPanel(['capitaine'], data);
    expect(screen.getByText(/Le registre mensuel pour août 2026 est en cours de création automatique/)).toBeInTheDocument();
    expect(getOrCreateWorkingTimeRegister).toHaveBeenCalledWith(client, {
      personId: 10, periodKind: 'monthly', periodStart: '2026-08-01',
    });
  });

  it('lets an unlinked administrator browse the catalogue while keeping mutations protected', () => {
    vi.mocked(useWorkingTimeWorkspace).mockReturnValue({ workspace: null, loadedRange: null, isLoading: false, errorMessage: null, reload });
    render(<WorkingTimeWorkflowPanel client={client} currentPerson={null} previewMode range={{ start: '2026-08-01', end: '2026-08-31' }} roles={['admin']} />);

    expect(screen.getByText(/Vous pouvez consulter et rechercher tous les registres/)).toBeInTheDocument();
  });

  it('removes the Armement section, moves personnel filters into Équipage and opens document tools', async () => {
    const user = userEvent.setup();
    renderPanel(['admin'], workspace('draft', 20));

    expect(screen.queryByRole('button', { name: 'Cockpit métier P1.3' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Historique' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registres' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Alertes' })).not.toBeInTheDocument();
    expect(screen.queryByText('Armement')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Import' }));
    await user.click(screen.getByRole('button', { name: 'Exposition HSE / IMCA' }));
    await user.click(screen.getByRole('button', { name: 'Contrôles travail et repos' }));
    await user.click(screen.getByRole('button', { name: 'Rapport de conformité' }));
    expect(onOpenImport).toHaveBeenCalledOnce();
    expect(onOpenHse).toHaveBeenCalledOnce();
    expect(onOpenWorkRest).toHaveBeenCalledOnce();
    expect(onOpenReport).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Filtrer' }));
    expect(screen.getByText('Personnel ancien')).toBeInTheDocument();
  });

  it('lets an exact HR Capitaine validate their own signed day independently of the application role', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchWorkingTimeDayContext).mockResolvedValue({
      assignmentId: 1,
      vesselId: 7,
      watchGroup: 'Bordée 1',
      statusLabel: 'En Mer',
      approverPersonId: 10,
      captainCandidates: [{ personId: 10, firstName: 'Camille', lastName: 'CAPITAINE', name: 'Camille CAPITAINE' }],
    });
    renderPanel(['marin'], workspace('draft'));

    await user.click(screen.getByRole('tab', { name: /lun 03 août/ }));
    expect(screen.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeInTheDocument();
    const submitButton = screen.getByRole('button', { name: 'Valider' });
    expect(submitButton).toBeEnabled();
    await user.click(submitButton);

    expect(submitWorkingTimeDay).toHaveBeenCalledWith(client, {
      registerId: 100,
      localWorkDate: '2026-08-03',
    });
  });

  it('shows a Planning loading state before the selected-day context resolves', () => {
    vi.mocked(fetchWorkingTimeDayContext).mockReturnValueOnce(new Promise(() => undefined));
    renderPanel(['marin'], workspace('draft'));

    expect(screen.getByRole('status')).toHaveTextContent('Chargement de l’affectation Planning');
    expect(screen.queryByText(/Aucune affectation Planning/)).not.toBeInTheDocument();
  });

  it('lets a Marin save their own periods as a draft without validating the day', async () => {
    const user = userEvent.setup();
    const data = workspace('draft');
    data.readablePeople[0].functionLabel = 'Matelot';
    data.editablePeople[0].functionLabel = 'Matelot';
    data.registers[0].functionLabel = 'Matelot';
    renderPanel(['marin'], data, {
      ...currentPerson,
      id: 10,
      firstName: 'Camille',
      lastName: 'MARIN',
      functionLabel: 'Matelot',
      gradeLabel: '',
    });

    await user.click(screen.getByRole('tab', { name: /lun 03 août/ }));
    const cells = screen.getAllByRole('gridcell');
    fireEvent.pointerDown(cells[32]);
    fireEvent.pointerUp(cells[32]);
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));

    await waitFor(() => expect(saveWorkingTimePhases).toHaveBeenCalledWith(client, expect.objectContaining({
      registerId: 100,
      vesselId: 7,
      watchGroup: 'Bordée 1',
      phases: expect.any(Array),
    })));
    expect(submitWorkingTimeDay).not.toHaveBeenCalled();
    expect(await screen.findByText('Le brouillon a été enregistré sans validation.')).toBeInTheDocument();
  });

  it('selects today when the current month opens and the first day for a historical month', () => {
    expect(workingTimeInitialDay({ start: '2026-08-01', end: '2026-08-31' }, '2026-08-21')).toBe('2026-08-21');
    expect(workingTimeInitialDay({ start: '2026-07-01', end: '2026-07-31' }, '2026-08-21')).toBe('2026-07-01');
  });

  it('removes manual register and refresh commands when no HR person is editable', () => {
    const data = workspace('draft', 20);
    data.editablePeople = [];
    renderPanel(['admin'], data);

    expect(screen.queryByRole('button', { name: 'Ouvrir un registre' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actualiser' })).not.toBeInTheDocument();
    expect(screen.queryByText('Gestion des congés')).not.toBeInTheDocument();
    expect(screen.getByText(/Aucune fiche RH n’est accessible/)).toBeInTheDocument();
    expect(getOrCreateWorkingTimeRegister).not.toHaveBeenCalled();
  });

  it.each(['admin', 'armement'] as const)('lets %s save an editable day as a draft', async (role) => {
    const user = userEvent.setup();
    renderPanel([role], workspace('draft', 20));

    expect(screen.getByText('Saisie assistée')).toBeInTheDocument();
    await user.click(await screen.findByRole('tab', { name: /lun 03 août/ }));
    const cells = screen.getAllByRole('gridcell');
    fireEvent.pointerDown(cells[32]);
    fireEvent.pointerUp(cells[32]);
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));

    await waitFor(() => expect(saveWorkingTimePhases).toHaveBeenCalledWith(client, expect.objectContaining({
      registerId: 100,
      vesselId: 7,
      watchGroup: 'Bordée 1',
      phases: expect.any(Array),
    })));
    expect(submitWorkingTimeDay).not.toHaveBeenCalled();
  });

  it.each(['2026-09-01', '2026-09-05'])('keeps August entry open on %s', async (referenceDate) => {
    renderPanel(['marin'], workspace('draft'), currentPerson, referenceDate);

    expect(screen.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeInTheDocument();
    expect(screen.getByText(/reste ouvert à la saisie jusqu’au samedi 05 septembre 2026 inclus/)).toBeInTheDocument();
    expect(await screen.findByText(/Affectation Planning appliquée/)).toBeInTheDocument();
  });

  it('locks August entry on September 6 while explaining the cutoff', async () => {
    renderPanel(['marin'], workspace('draft'), currentPerson, '2026-09-06');

    await waitFor(() => expect(fetchWorkingTimeDayContext).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Enregistrer le brouillon' })).not.toBeInTheDocument();
    expect(screen.getByText(/est clôturé pour la saisie.*samedi 05 septembre 2026 inclus/)).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: 'Grille horaire du 2026-08-01' })).toHaveAttribute('aria-readonly', 'true');
  });

  it('keeps Direction read-only when the server exposes no editable person', () => {
    const data = workspace('draft', 20);
    data.editablePeople = [];
    renderPanel(['direction'], data, {
      ...currentPerson,
      id: 10,
      firstName: 'Diane',
      lastName: 'DIRECTION',
      functionLabel: 'Direction',
      gradeLabel: '',
    });

    expect(screen.queryByRole('button', { name: 'Enregistrer le brouillon' })).not.toBeInTheDocument();
  });

  it.each([7, null])('lets a real Marin profile submit recorded hours without a captain (vessel %s)', async (vesselId) => {
    const user = userEvent.setup();
    const data = workspace('draft', 20);
    data.currentPersonId = 20;
    vi.mocked(fetchWorkingTimeDayContext).mockResolvedValue({
      assignmentId: vesselId ? 1 : null, vesselId, watchGroup: null, statusLabel: null,
      approverPersonId: null, captainCandidates: [],
    });
    renderPanel(['marin'], data, { ...currentPerson, id: 20, firstName: 'Alex', lastName: 'MARIN', functionLabel: 'Matelot', gradeLabel: '' });

    await user.click(screen.getByRole('tab', { name: /lun 03 août/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Valider' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Valider' }));
    expect(submitWorkingTimeDay).toHaveBeenCalledWith(client, { registerId: 100, localWorkDate: '2026-08-03' });
    expect(await screen.findByText(/transmise pour approbation à un Administrateur/)).toBeInTheDocument();
    expect(validateWorkingTimeDay).not.toHaveBeenCalled();
  });

  it.each(['admin', 'direction', 'armement'] as const)('lets %s find and approve a submitted day with no captain', async (role) => {
    const user = userEvent.setup();
    const data = workspace('draft', 20);
    data.editablePeople = [];
    data.dayApprovals = [{
      id: 510, companyId: 1, registerId: 100, personId: 20,
      localWorkDate: '2026-08-03', status: 'submitted', planningAssignmentId: null,
      vesselId: null, watchGroup: null, approverPersonId: null,
      submittedAt: '2026-08-03T16:00:00Z', validatedAt: null, validatedByPersonId: null,
      subjectSignatureSnapshot: null, approverSignatureSnapshot: null,
    }];
    renderPanel([role], data, { ...currentPerson, functionLabel: 'Direction' });

    await user.click(screen.getByRole('tab', { name: /Approbation1/ }));
    await user.click(screen.getAllByRole('button', { name: /Alex MARIN/ }).at(-1)!);
    await user.click(screen.getByRole('button', { name: 'Valider la journée' }));
    expect(validateWorkingTimeDay).toHaveBeenCalledWith(client, 510);
  });

  it.each(['direction', 'capitaine', 'marin'] as const)('does not let %s take an approval assigned to another captain', async (role) => {
    const user = userEvent.setup();
    const data = workspace('draft', 20);
    data.editablePeople = [];
    data.dayApprovals = [{
      id: 511, companyId: 1, registerId: 100, personId: 20,
      localWorkDate: '2026-08-03', status: 'submitted', planningAssignmentId: 1,
      vesselId: 7, watchGroup: 'Bordée 1', approverPersonId: 11,
      submittedAt: '2026-08-03T16:00:00Z', validatedAt: null, validatedByPersonId: null,
      subjectSignatureSnapshot: null, approverSignatureSnapshot: null,
    }];
    renderPanel([role], data);
    await user.click(screen.getByRole('tab', { name: /Approbation/ }));
    expect(screen.getByText('Aucune journée en attente d’approbation.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Valider la journée' })).not.toBeInTheDocument();
  });

  it('shows one catalogue card per sailor even when legacy weekly and monthly registers overlap', () => {
    const data = workspace('draft', 20);
    data.registers.push({
      ...data.registers[0],
      id: 101,
      periodKind: 'weekly',
      periodStart: '2026-08-03',
      periodEnd: '2026-08-09',
    });
    renderPanel(['admin'], data);

    expect(screen.getAllByRole('button', { name: /Alex MARIN/ })).toHaveLength(1);
    expect(screen.getByRole('navigation', { name: 'Registres accessibles' })).toHaveTextContent('Alex MARIN');
    expect(screen.getByRole('navigation', { name: 'Registres accessibles' }).textContent?.match(/Alex MARIN/g)).toHaveLength(1);
  });

  it('consolidates every imported interval for the sailor and month, including legacy registers', async () => {
    const user = userEvent.setup();
    const data = workspace('draft', 20);
    data.intervals[0] = {
      ...data.intervals[0],
      startsAt: '2026-08-03T08:00:00Z',
      endsAt: '2026-08-03T10:30:00Z',
    };
    data.intervals.push({
      ...data.intervals[0],
      id: 201,
      registerId: 101,
      startsAt: '2026-08-03T11:30:00Z',
      endsAt: '2026-08-03T16:00:00Z',
    });
    renderPanel(['admin'], data);

    await user.click(screen.getByRole('tab', { name: /lun 03 août/ }));
    expect(screen.getByRole('gridcell', { name: /10:00, travail enregistré/ })).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: /13:30, travail enregistré/ })).toBeInTheDocument();
  });

  it('opens a detailed monthly view and highlights non-compliant days in the daily strip', async () => {
    const user = userEvent.setup();
    const data = workspace('draft', 20);
    data.calculations = [{
      id: 401, companyId: 1, personId: 20, windowEnd: '2026-08-03T18:00:00Z', localWindowEndDate: '2026-08-03',
      timezoneName: 'Europe/Paris', vesselId: 7, workRestPolicyId: 1, work24hSeconds: 28_800, rest24hSeconds: 57_600,
      longestRest24hSeconds: 18_000, restPeriodCount24h: 2, work7dSeconds: 120_000, rest7dSeconds: 484_800,
      nightWork24hSeconds: 0, isCompliant: false, violationCodes: ['consecutive_rest'], calculationVersion: 1,
      calculatedAt: '2026-08-03T18:00:01Z',
    }];
    renderPanel(['admin'], data);

    const nonCompliantDay = screen.getByRole('tab', { name: /lun 03 août, journée non conforme/ });
    expect(nonCompliantDay).toHaveClass('is-non-compliant');
    expect(nonCompliantDay.querySelector('svg')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Mois' }));
    expect(screen.getByRole('heading', { name: 'Détail des heures du registre' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('08:00–16:00');
    expect(screen.getByRole('table')).toHaveTextContent('Non conforme');
    expect(screen.getByRole('table')).toHaveTextContent('Repos consécutif sur 24 h : 5 h / minimum 6 h');
  });

  it('keeps the alarm on the contributing day and shows the inherited impact on the next day', async () => {
    const user = userEvent.setup();
    const data = workspace('draft', 20);
    const interval = data.intervals[0];
    data.intervals.push(
      { ...interval, id: 210, localWorkDate: '2026-08-17', startsAt: '2026-08-17T04:30:00Z', endsAt: '2026-08-17T10:00:00Z' },
      { ...interval, id: 211, localWorkDate: '2026-08-17', startsAt: '2026-08-17T10:30:00Z', endsAt: '2026-08-17T18:00:00Z' },
      { ...interval, id: 212, localWorkDate: '2026-08-18', startsAt: '2026-08-18T06:30:00Z', endsAt: '2026-08-18T12:00:00Z' },
      { ...interval, id: 213, localWorkDate: '2026-08-18', startsAt: '2026-08-18T13:30:00Z', endsAt: '2026-08-18T17:00:00Z' },
    );
    data.calculations = [{
      id: 409, companyId: 1, personId: 20, windowEnd: '2026-08-17T18:00:00Z', localWindowEndDate: '2026-08-17',
      timezoneName: 'Europe/Paris', vesselId: 7, workRestPolicyId: 1, work24hSeconds: 46_800, rest24hSeconds: 39_600,
      longestRest24hSeconds: 37_800, restPeriodCount24h: 2, work7dSeconds: 46_800, rest7dSeconds: 558_000,
      nightWork24hSeconds: 0, isCompliant: false, violationCodes: ['work_24h'], calculationVersion: 1,
      calculatedAt: '2026-08-17T18:00:01Z',
    }, {
      id: 410, companyId: 1, personId: 20, windowEnd: '2026-08-18T04:30:00Z', localWindowEndDate: '2026-08-18',
      timezoneName: 'Europe/Paris', vesselId: 7, workRestPolicyId: 1, work24hSeconds: 46_800, rest24hSeconds: 39_600,
      longestRest24hSeconds: 37_800, restPeriodCount24h: 2, work7dSeconds: 46_800, rest7dSeconds: 558_000,
      nightWork24hSeconds: 0, isCompliant: false, violationCodes: ['work_24h'], calculationVersion: 1,
      calculatedAt: '2026-08-18T04:30:01Z',
    }, {
      id: 411, companyId: 1, personId: 20, windowEnd: '2026-08-18T18:00:00Z', localWindowEndDate: '2026-08-18',
      timezoneName: 'Europe/Paris', vesselId: 7, workRestPolicyId: 1, work24hSeconds: 32_400, rest24hSeconds: 54_000,
      longestRest24hSeconds: 45_000, restPeriodCount24h: 3, work7dSeconds: 79_200, rest7dSeconds: 525_600,
      nightWork24hSeconds: 0, isCompliant: true, violationCodes: [], calculationVersion: 1,
      calculatedAt: '2026-08-18T18:00:01Z',
    }];
    renderPanel(['admin'], data);

    await user.click(screen.getByRole('button', { name: 'Mois' }));
    const alarmRow = screen.getByRole('button', { name: /lun 17 août/ }).closest('tr');
    const impactRow = screen.getByRole('button', { name: /mar 18 août/ }).closest('tr');
    expect(alarmRow).toHaveClass('is-non-compliant');
    expect(alarmRow).toHaveTextContent('Travail maximal par journée de calcul : 13 h / maximum 12 h');
    expect(alarmRow).not.toHaveTextContent('Compteur remis à zéro après chaque repos continu d’au moins 6 h.');
    expect(impactRow).not.toHaveClass('is-non-compliant');
    expect(impactRow).toHaveTextContent('Conforme');
    expect(impactRow).toHaveTextContent('15 h 00');
    expect(impactRow).toHaveTextContent('22 h 00');
    expect(impactRow).not.toHaveTextContent('Non conforme');

    await user.click(screen.getByRole('button', { name: /mar 18 août/ }));
    const rollingWindow = screen.getByRole('status', { name: 'Impact des 24 heures glissantes' });
    expect(rollingWindow).toHaveTextContent('Travail maximal par journée de calcul : 13 h / maximum 12 h');
    expect(rollingWindow).not.toHaveTextContent('Compteur remis à zéro après chaque repos continu d’au moins 6 h.');
    expect(rollingWindow).toHaveTextContent('Fenêtre d’analyse du lun 17 août à 06:30 au mar 18 août à 06:30.');
    expect(rollingWindow).toHaveTextContent('Alarme rattachée au lun 17 août.');
    expect(screen.getByText('24 h glissantes')).toBeInTheDocument();
    expect(screen.getByText('J−1 06:30')).toBeInTheDocument();
    expect(screen.getByText('fin 06:30')).toBeInTheDocument();
    expect(rollingWindow.querySelector('.working-time-rolling-window-line')).toHaveStyle({ width: '27.083333333333332%' });
    expect(screen.getByRole('tab', { name: /mar 18 août$/ })).not.toHaveClass('is-non-compliant');
    expect(screen.queryByText('2026-08-18', { selector: '.working-time-non-compliance-card strong' })).not.toBeInTheDocument();
  });

  it.each([
    ['2026-08-03', '2026-08-04', /mar 04 août$/],
    ['2026-07-31', '2026-08-01', /sam 01 août$/],
  ])('allows the assigned Captain to approve %s carry-over on %s without a false justification', async (alarmDay, day, tabName) => {
    const user = userEvent.setup();
    const data = workspace('draft', 20);
    data.registers[0].workRestPolicyId = null;
    const interval = data.intervals[0];
    data.intervals = [
      { ...interval, localWorkDate: alarmDay, startsAt: `${alarmDay}T15:00:00Z`, endsAt: `${alarmDay}T19:30:00Z` },
      { ...interval, id: 201, localWorkDate: day, startsAt: `${day}T07:00:00Z`, endsAt: `${day}T10:30:00Z` },
      { ...interval, id: 202, localWorkDate: day, startsAt: `${day}T11:30:00Z`, endsAt: `${day}T16:30:00Z` },
    ];
    data.calculations = [{
      id: 402, companyId: 1, personId: 20, windowEnd: `${day}T01:00:00Z`, localWindowEndDate: day,
      timezoneName: 'Europe/Paris', vesselId: 7, workRestPolicyId: 1, work24hSeconds: 36_000, rest24hSeconds: 50_400,
      longestRest24hSeconds: 19_800, restPeriodCount24h: 3, work7dSeconds: 208_800, rest7dSeconds: 396_000,
      nightWork24hSeconds: 0, isCompliant: false, violationCodes: ['consecutive_rest'], calculationVersion: 1,
      calculatedAt: `${day}T01:00:01Z`,
    }, {
      id: 403, companyId: 1, personId: 20, windowEnd: `${day}T16:30:00Z`, localWindowEndDate: day,
      timezoneName: 'Europe/Paris', vesselId: 7, workRestPolicyId: 1, work24hSeconds: 30_600, rest24hSeconds: 55_800,
      longestRest24hSeconds: 41_400, restPeriodCount24h: 2, work7dSeconds: 228_600, rest7dSeconds: 376_200,
      nightWork24hSeconds: 0, isCompliant: true, violationCodes: [], calculationVersion: 1,
      calculatedAt: `${day}T16:30:01Z`,
    }];
    data.dayApprovals = [{
      id: 520, companyId: 1, registerId: 100, personId: 20, localWorkDate: day,
      status: 'submitted', planningAssignmentId: 1, vesselId: 7, watchGroup: 'Bordée 1', approverPersonId: 10,
      submittedAt: `${day}T17:00:00Z`, validatedAt: null, validatedByPersonId: null,
      subjectSignatureSnapshot: null, approverSignatureSnapshot: null,
    }];
    renderPanel(['capitaine'], data);
    await user.click(screen.getByRole('tab', { name: tabName }));
    expect(screen.getByText('Alertes').closest('article')).toHaveTextContent('0Aucune alerte détectée');
    expect(screen.getByText('Calcul serveur P1.3')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Impact des 24 heures glissantes' })).toHaveTextContent('5,5 h / minimum 6 h');
    await user.click(screen.getByRole('button', { name: 'Valider la journée' }));
    expect(validateWorkingTimeDay).toHaveBeenCalledWith(client, 520);
    expect(validateWorkingTimeDayWithComment).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Mois' }));
    expect(screen.getByText(alarmDay.startsWith('2026-07') ? '8 h 30 sur le mois' : '13 h 00 sur le mois')).toBeInTheDocument();
  });

  it('does not flag an empty day because of a rolling-window breach inherited from the previous day', async () => {
    const user = userEvent.setup();
    const data = workspace('draft', 20);
    data.calculations = [{
      id: 402, companyId: 1, personId: 20, windowEnd: '2026-08-04T01:00:00Z', localWindowEndDate: '2026-08-04',
      timezoneName: 'Europe/Paris', vesselId: 7, workRestPolicyId: 1, work24hSeconds: 50_000, rest24hSeconds: 36_400,
      longestRest24hSeconds: 20_000, restPeriodCount24h: 2, work7dSeconds: 50_000, rest7dSeconds: 554_800,
      nightWork24hSeconds: 0, isCompliant: false, violationCodes: ['work_24h'], calculationVersion: 1,
      calculatedAt: '2026-08-04T01:00:01Z',
    }];
    renderPanel(['admin'], data);

    const emptyDay = screen.getByRole('tab', { name: /mar 04 août$/ });
    expect(emptyDay).not.toHaveClass('is-non-compliant');
    expect(screen.queryByText('2026-08-04', { selector: '.working-time-non-compliance-card strong' })).not.toBeInTheDocument();
    await user.click(emptyDay);
    expect(screen.getByText('Alertes').closest('article')).toHaveTextContent('0Aucune alerte détectée');
    expect(screen.getByRole('status', { name: 'Impact des 24 heures glissantes' })).toBeInTheDocument();
  });

  it('discards an empty unsigned draft from its card', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const data = workspace('draft', 20);
    data.intervals = [];
    renderPanel(['admin'], data);

    await user.click(screen.getByRole('button', { name: /Retirer le brouillon vide de Alex MARIN/ }));

    expect(discardWorkingTimeDraft).toHaveBeenCalledWith(client, 100);
    expect(reload).toHaveBeenCalled();
    expect(screen.getByText(/brouillon vide a été retiré/)).toBeInTheDocument();
  });

  it('never offers a Captain the destructive discard action after hours are recorded and submitted', () => {
    const data = workspace('draft');
    data.dayApprovals = [{
      id: 501, companyId: 1, registerId: 100, personId: 10,
      localWorkDate: '2026-08-03', status: 'submitted', planningAssignmentId: 1,
      vesselId: 7, watchGroup: 'Bordée 1', approverPersonId: 10,
      submittedAt: '2026-08-03T16:00:00Z', validatedAt: null, validatedByPersonId: null,
      subjectSignatureSnapshot: null, approverSignatureSnapshot: null,
    }];

    renderPanel(['capitaine'], data);

    expect(screen.queryByRole('button', { name: /Retirer le brouillon/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('Camille CAPITAINE')).toHaveLength(2);
  });

  it('shows the approval badge and lets the assigned captain validate one sailor day', async () => {
    const user = userEvent.setup();
    const data = workspace('validated', 20);
    data.dayApprovals = [{
      id: 501, companyId: 1, registerId: 100, personId: 20,
      localWorkDate: '2026-08-03', status: 'submitted', planningAssignmentId: 1,
      vesselId: 7, watchGroup: 'Bordée 1', approverPersonId: 10,
      submittedAt: '2026-08-03T16:00:00Z', validatedAt: null, validatedByPersonId: null,
      subjectSignatureSnapshot: null, approverSignatureSnapshot: null,
    }];
    renderPanel(['capitaine'], data);

    const approvalTab = screen.getByRole('tab', { name: /Approbation1/ });
    await user.click(approvalTab);
    const approvalEntry = screen.getAllByRole('button', { name: /Alex MARIN/ }).at(-1)!;
    await user.click(approvalEntry);
    const validateButton = screen.getByRole('button', { name: 'Valider la journée' });
    await user.click(validateButton);
    expect(validateWorkingTimeDay).toHaveBeenCalledWith(client, 501);
  });

  it.each([
    ['2026-08-11', true],
    ['2026-08-10', false],
  ] as const)('applies the captain approval boundary to %s even after the entry cutoff', async (date, allowed) => {
    const user = userEvent.setup();
    const data = workspace('submitted', 20);
    data.dayApprovals = [submittedApproval({ localWorkDate: date })];
    data.intervals[0] = { ...data.intervals[0], localWorkDate: date, startsAt: `${date}T06:00:00Z`, endsAt: `${date}T14:00:00Z` };
    renderPanel(['capitaine'], data, currentPerson, '2026-10-11', { personId: 20, date });

    expect(screen.getByRole('grid', { name: `Grille horaire du ${date}` })).toHaveAttribute('aria-readonly', String(!allowed));
    await user.click(screen.getByRole('tab', { name: /Approbation/ }));
    if (allowed) {
      expect(screen.getByRole('tab', { name: /Approbation1/ })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Valider la journée' }));
      expect(validateWorkingTimeDay).toHaveBeenCalledWith(client, 501);
    } else {
      expect(screen.getByText('Aucune journée en attente d’approbation.')).toBeInTheDocument();
      expect(screen.getByText(/Cette journée est hors de votre période d’approbation/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Valider la journée' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Enregistrer la correction' })).not.toBeInTheDocument();
      expect(validateWorkingTimeDay).not.toHaveBeenCalled();
    }
  });

  it.each(['admin', 'direction', 'armement'] as const)('preserves %s approval permissions outside the captain date window', async (role) => {
    const user = userEvent.setup();
    const data = workspace('submitted', 20);
    data.editablePeople = [];
    data.dayApprovals = [submittedApproval({ approverPersonId: role === 'direction' ? null : 11 })];
    renderPanel([role], data, { ...currentPerson, functionLabel: 'Direction' }, '2026-10-11', { personId: 20, date: '2026-08-03' });
    await user.click(screen.getByRole('tab', { name: /Approbation1/ }));
    await user.click(screen.getByRole('button', { name: 'Valider la journée' }));
    expect(validateWorkingTimeDay).toHaveBeenCalledWith(client, 501);
  });

  it('locks the captain correction and justification for a submitted day older than two calendar months', async () => {
    const data = workspace('submitted', 20);
    data.dayApprovals = [submittedApproval()];
    data.calculations = [{
      id: 400, companyId: 1, personId: 20, windowEnd: '2026-08-03T18:00:00Z', localWindowEndDate: '2026-08-03',
      timezoneName: 'Europe/Paris', vesselId: 7, workRestPolicyId: 1, work24hSeconds: 50000, rest24hSeconds: 36400,
      longestRest24hSeconds: 20000, restPeriodCount24h: 2, work7dSeconds: 50000, rest7dSeconds: 554800,
      nightWork24hSeconds: 0, isCompliant: false, violationCodes: ['work_24h'], calculationVersion: 1,
      calculatedAt: '2026-08-03T18:00:01Z',
    }];
    renderPanel(['capitaine'], data, currentPerson, '2026-10-11', { personId: 20, date: '2026-08-03' });

    expect(screen.getByLabelText('Catégorie de cause')).toBeDisabled();
    expect(screen.getByLabelText('Contexte opérationnel')).toBeDisabled();
    expect(screen.getByLabelText('Commentaire obligatoire')).toBeDisabled();
    expect(screen.getByRole('grid', { name: 'Grille horaire du 2026-08-03' })).toHaveAttribute('aria-readonly', 'true');
    expect(screen.queryByRole('button', { name: 'Valider la saisie des heures et la justification' })).not.toBeInTheDocument();
    expect(validateWorkingTimeDayWithComment).not.toHaveBeenCalled();
  });

  it.each(['capitaine', 'marin'] as const)('lets a temporary Captain with role %s validate a compliant sailor draft', async (role) => {
    const user = userEvent.setup();
    const data = workspace('validated', 20);
    data.canActAsCaptain = true;
    vi.mocked(fetchWorkingTimeDayContext).mockResolvedValue({
      assignmentId: 1,
      vesselId: 7,
      watchGroup: 'Bordée 1',
      statusLabel: 'En Mer',
      approverPersonId: 10,
      captainCandidates: [{ personId: 10, firstName: 'Camille', lastName: 'CAPITAINE', name: 'Camille CAPITAINE' }],
    });
    renderPanel([role], data, { ...currentPerson, functionLabel: '2nd Capitaine' });

    await user.click(screen.getByRole('tab', { name: /lun 03 août/ }));
    const validateButton = screen.getByRole('button', { name: 'Valider' });
    expect(validateButton).toBeEnabled();
    await user.click(validateButton);

    expect(submitWorkingTimeDay).toHaveBeenCalledWith(client, {
      registerId: 100,
      localWorkDate: '2026-08-03',
    });
    expect(validateWorkingTimeDay).not.toHaveBeenCalled();
  });

  it('keeps validation disabled until every non-compliant day has a saved captain comment', async () => {
    const user = userEvent.setup();
    const data = workspace('submitted', 20);
    data.dayApprovals = [{
      id: 502, companyId: 1, registerId: 100, personId: 20,
      localWorkDate: '2026-08-03', status: 'submitted', planningAssignmentId: 1,
      vesselId: 7, watchGroup: 'Bordée 1', approverPersonId: 10,
      submittedAt: '2026-08-03T16:00:00Z', validatedAt: null, validatedByPersonId: null,
      subjectSignatureSnapshot: null, approverSignatureSnapshot: null,
    }];
    data.calculations = [{
      id: 400,
      companyId: 1,
      personId: 20,
      windowEnd: '2026-08-03T18:00:00Z',
      localWindowEndDate: '2026-08-03',
      timezoneName: 'Europe/Paris',
      vesselId: 7,
      workRestPolicyId: 1,
      work24hSeconds: 50000,
      rest24hSeconds: 36400,
      longestRest24hSeconds: 20000,
      restPeriodCount24h: 2,
      work7dSeconds: 50000,
      rest7dSeconds: 554800,
      nightWork24hSeconds: 0,
      isCompliant: false,
      violationCodes: ['work_24h'],
      calculationVersion: 1,
      calculatedAt: '2026-08-03T18:00:01Z',
    }];
    renderPanel(['capitaine'], data);
    await user.click(screen.getByRole('tab', { name: /lun 03 août/ }));

    expect(screen.getByRole('button', { name: 'Valider la saisie des heures et la justification' })).toBeDisabled();
    expect(screen.getByText(/Justification de non-conformité incomplète/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Catégorie de cause'), { target: { value: 'safety_emergency' } });
    fireEvent.change(screen.getByLabelText('Contexte opérationnel'), { target: { value: 'Opération de sécurité prolongée.' } });
    fireEvent.change(screen.getByLabelText('Action immédiate'), { target: { value: 'Relève organisée.' } });
    fireEvent.change(screen.getByLabelText('Repos compensateur prévu'), { target: { value: 'Repos planifié demain.' } });
    fireEvent.change(screen.getByLabelText('Commentaire obligatoire'), { target: { value: 'Écart documenté par le capitaine.' } });
    await user.click(screen.getByRole('button', { name: 'Valider la saisie des heures et la justification' }));

    expect(validateWorkingTimeDayWithComment).toHaveBeenCalledWith(client, 502, {
      causeCategory: 'safety_emergency',
      operationalContext: 'Opération de sécurité prolongée.',
      immediateAction: 'Relève organisée.',
      compensatoryRestPlan: 'Repos planifié demain.',
      comment: 'Écart documenté par le capitaine.',
    });
    expect(validateWorkingTimeDay).not.toHaveBeenCalledWith(client, 502);
  });

  it('locks only the validated day without offering a month-level reopen action', async () => {
    const user = userEvent.setup();
    const data = workspace('validated', 20);
    data.dayApprovals = [{
      id: 503, companyId: 1, registerId: 100, personId: 20,
      localWorkDate: '2026-08-03', status: 'validated', planningAssignmentId: 1,
      vesselId: 7, watchGroup: 'Bordée 1', approverPersonId: 10,
      submittedAt: '2026-08-03T16:00:00Z', validatedAt: '2026-08-03T17:00:00Z', validatedByPersonId: 10,
      subjectSignatureSnapshot: null, approverSignatureSnapshot: null,
    }];
    renderPanel(['armement'], data);
    await user.click(screen.getByRole('tab', { name: /lun 03 août/ }));

    expect(screen.getByText(/Journée validée et clôturée/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Corriger' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réouvrir' })).not.toBeInTheDocument();
  });

  it('lets an administrator correct an old validated interval with unrestricted editing enabled', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchWorkingTimeEditSettings).mockResolvedValue({ unrestrictedEditingEnabled: true, canUseUnrestrictedEditing: true });
    const data = workspace('validated', 20);
    data.dayApprovals = [submittedApproval({ status: 'validated', validatedAt: '2026-08-03T17:00:00Z' })];
    data.editablePeople = [];
    data.signatures = [];
    renderPanel(['admin'], data, currentPerson, '2026-10-11', { personId: 20, date: '2026-08-03' });

    const grid = screen.getByRole('grid', { name: 'Grille horaire du 2026-08-03' });
    await waitFor(() => expect(grid).toHaveAttribute('aria-readonly', 'false'));
    await user.click(within(grid).getByRole('gridcell', { name: /08:00, travail enregistré/ }));
    await user.click(screen.getByRole('button', { name: 'Corriger' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer la correction' }));

    expect(saveWorkingTimeInterval).toHaveBeenCalledWith(client, expect.objectContaining({
      registerId: 100, intervalId: 200, comment: null,
    }));
    expect(submitWorkingTimeDay).not.toHaveBeenCalled();
    expect(validateWorkingTimeDay).not.toHaveBeenCalled();
    expect(screen.getByText(/une modification annulera sa validation et ses signatures actuelles/)).toBeInTheDocument();
  });

  it('lets an administrator add periods on a validated day without signing or justifying', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchWorkingTimeEditSettings).mockResolvedValue({ unrestrictedEditingEnabled: true, canUseUnrestrictedEditing: true });
    const data = workspace('validated', 20);
    data.dayApprovals = [submittedApproval({ status: 'validated', validatedAt: '2026-08-03T17:00:00Z' })];
    data.signatures = [];
    renderPanel(['admin'], data, currentPerson, '2026-10-11', { personId: 20, date: '2026-08-03' });

    const grid = screen.getByRole('grid', { name: 'Grille horaire du 2026-08-03' });
    await waitFor(() => expect(grid).toHaveAttribute('aria-readonly', 'false'));
    fireEvent.pointerDown(within(grid).getAllByRole('gridcell')[36]);
    fireEvent.pointerUp(within(grid).getAllByRole('gridcell')[36]);
    await user.click(screen.getByRole('button', { name: 'Enregistrer les périodes' }));

    expect(saveWorkingTimePhases).toHaveBeenCalledWith(client, expect.objectContaining({
      registerId: 100, comment: null,
      phases: [{ startsAt: new Date('2026-08-03T18:00').toISOString(), endsAt: new Date('2026-08-03T18:30').toISOString() }],
    }));
    expect(submitWorkingTimeDay).not.toHaveBeenCalled();
    expect(validateWorkingTimeDay).not.toHaveBeenCalled();
  });

  it('requires saving free edits before validating a submitted day to avoid a partial save and failed validation', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchWorkingTimeEditSettings).mockResolvedValue({ unrestrictedEditingEnabled: true, canUseUnrestrictedEditing: true });
    const data = workspace('submitted', 20);
    data.dayApprovals = [submittedApproval()];
    renderPanel(['admin'], data, currentPerson, '2026-10-11', { personId: 20, date: '2026-08-03' });

    const grid = screen.getByRole('grid', { name: 'Grille horaire du 2026-08-03' });
    await waitFor(() => expect(screen.getByText('Modification libre activée pour Christophe MINASSIAN.')).toBeInTheDocument());
    const validateButton = screen.getByRole('button', { name: 'Valider la journée' });
    expect(validateButton).toBeEnabled();
    fireEvent.pointerDown(within(grid).getAllByRole('gridcell')[36]);
    fireEvent.pointerUp(within(grid).getAllByRole('gridcell')[36]);

    expect(validateButton).toBeDisabled();
    await user.click(validateButton);
    expect(saveWorkingTimePhases).not.toHaveBeenCalled();
    expect(validateWorkingTimeDay).not.toHaveBeenCalled();
    const saveButton = screen.getByRole('button', { name: 'Enregistrer les périodes' });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);
    expect(saveWorkingTimePhases).toHaveBeenCalledOnce();
    expect(validateWorkingTimeDay).not.toHaveBeenCalled();
  });

  it('lets an administrator retire a validated interval without a reason in unrestricted mode', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchWorkingTimeEditSettings).mockResolvedValue({ unrestrictedEditingEnabled: true, canUseUnrestrictedEditing: true });
    const data = workspace('validated', 20);
    data.dayApprovals = [submittedApproval({ status: 'validated', validatedAt: '2026-08-03T17:00:00Z' })];
    renderPanel(['admin'], data, currentPerson, '2026-10-11', { personId: 20, date: '2026-08-03' });

    const grid = screen.getByRole('grid', { name: 'Grille horaire du 2026-08-03' });
    await waitFor(() => expect(grid).toHaveAttribute('aria-readonly', 'false'));
    await user.click(within(grid).getByRole('gridcell', { name: /08:00, travail enregistré/ }));
    await user.click(screen.getByRole('button', { name: 'Retirer' }));
    expect(screen.getByLabelText('Motif du retrait (facultatif)')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Confirmer' }));

    expect(voidWorkingTimeInterval).toHaveBeenCalledWith(client, 200, '');
  });

  it.each(['marin', 'capitaine', 'armement', 'direction'] as const)('does not unlock validated days for a real %s profile when the setting is enabled', async (role) => {
    const user = userEvent.setup();
    vi.mocked(fetchWorkingTimeEditSettings).mockResolvedValue({ unrestrictedEditingEnabled: true, canUseUnrestrictedEditing: true });
    const ownRegister = role === 'marin';
    const data = workspace('validated', ownRegister ? 10 : 20);
    data.dayApprovals = [submittedApproval({
      personId: ownRegister ? 10 : 20, status: 'validated', validatedAt: '2026-08-03T17:00:00Z',
    })];
    const person = { ...currentPerson, functionLabel: role === 'capitaine' ? 'Capitaine' : 'Matelot' };
    renderPanel([role], data, person, '2026-10-11');
    await user.click(screen.getByRole('tab', { name: /lun 03 août/ }));

    expect(screen.getByRole('grid', { name: 'Grille horaire du 2026-08-03' })).toHaveAttribute('aria-readonly', 'true');
    expect(screen.queryByRole('button', { name: 'Enregistrer les périodes' })).not.toBeInTheDocument();
  });

  it('keeps an administrator locked if the setting cannot be read', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchWorkingTimeEditSettings).mockRejectedValue(new Error('Settings unavailable'));
    const data = workspace('validated', 20);
    data.dayApprovals = [submittedApproval({ status: 'validated', validatedAt: '2026-08-03T17:00:00Z' })];
    renderPanel(['admin'], data, currentPerson, '2026-10-11');
    await user.click(screen.getByRole('tab', { name: /lun 03 août/ }));

    expect(fetchWorkingTimeEditSettings).toHaveBeenCalledWith(client);
    expect(screen.getByRole('grid', { name: 'Grille horaire du 2026-08-03' })).toHaveAttribute('aria-readonly', 'true');
  });

  it('does not unlock another administrator even when their display name matches Christophe MINASSIAN', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchWorkingTimeEditSettings).mockResolvedValue({ unrestrictedEditingEnabled: true, canUseUnrestrictedEditing: false });
    const data = workspace('validated', 20);
    data.dayApprovals = [submittedApproval({ status: 'validated', validatedAt: '2026-08-03T17:00:00Z' })];
    renderPanel(['admin'], data, { ...currentPerson, firstName: 'Christophe', lastName: 'MINASSIAN' }, '2026-10-11');
    await user.click(screen.getByRole('tab', { name: /lun 03 août/ }));

    expect(screen.getByRole('grid', { name: 'Grille horaire du 2026-08-03' })).toHaveAttribute('aria-readonly', 'true');
    expect(screen.queryByText('Modification libre activée pour Christophe MINASSIAN.')).not.toBeInTheDocument();
  });

  it('restores the validated-day lock when unrestricted editing is disabled and settings refresh', async () => {
    vi.mocked(fetchWorkingTimeEditSettings).mockResolvedValueOnce({ unrestrictedEditingEnabled: true, canUseUnrestrictedEditing: true })
      .mockResolvedValue({ unrestrictedEditingEnabled: false, canUseUnrestrictedEditing: true });
    const data = workspace('validated', 20);
    data.dayApprovals = [submittedApproval({ status: 'validated', validatedAt: '2026-08-03T17:00:00Z' })];
    const target = { personId: 20, date: '2026-08-03' };
    const rendered = renderPanel(['admin'], data, currentPerson, '2026-10-11', target);
    const grid = screen.getByRole('grid', { name: 'Grille horaire du 2026-08-03' });
    await waitFor(() => expect(grid).toHaveAttribute('aria-readonly', 'false'));

    rendered.rerender(<WorkingTimeWorkflowPanel client={client} currentPerson={currentPerson}
      navigationTarget={target} previewMode range={{ start: '2026-08-01', end: '2026-08-31' }}
      referenceDate="2026-10-11" refreshToken={1} roles={['admin']} />);

    await waitFor(() => expect(grid).toHaveAttribute('aria-readonly', 'true'));
    expect(screen.queryByRole('button', { name: 'Enregistrer les périodes' })).not.toBeInTheDocument();
  });

  it('treats a reopened day approval as a draft without displaying old frozen signatures', async () => {
    const user = userEvent.setup();
    const data = workspace('reopened');
    const oldSignature = {
      signatureId: 88, signerPersonId: 10, signerName: 'Camille CAPITAINE', signerRoles: ['capitaine'],
      signedAt: '2026-08-03T16:00:00Z', versionNumber: 99, storageBucket: 'working-time-signatures',
      storagePath: '1/10/old-signature.png', mimeType: 'image/png', fileSizeBytes: 1234, sha256: 'c'.repeat(64),
    };
    data.dayApprovals = [submittedApproval({ personId: 10, status: 'draft', subjectSignatureSnapshot: oldSignature, approverSignatureSnapshot: oldSignature })];
    data.validations = [{
      id: 900, registerId: 100, eventType: 'captain_validated', previousStatus: 'submitted', newStatus: 'validated',
      actorName: 'Camille CAPITAINE', actorRoles: ['capitaine'], signatureSnapshot: oldSignature,
      intervalSnapshot: [], nonComplianceSnapshot: [], comment: '', occurredAt: '2026-08-03T17:00:00Z',
    }];
    renderPanel(['capitaine'], data);
    await user.click(screen.getByRole('tab', { name: /lun 03 août/ }));

    expect(screen.getByRole('grid', { name: 'Grille horaire du 2026-08-03' })).toHaveAttribute('aria-readonly', 'false');
    expect(screen.getByRole('button', { name: 'Valider' })).toBeInTheDocument();
    expect(screen.queryByText('Validation figée')).not.toBeInTheDocument();
    expect(screen.queryByText(/Signature de profil v99/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Valider' }));
    expect(submitWorkingTimeDay).toHaveBeenCalledWith(client, { registerId: 100, localWorkDate: '2026-08-03' });
  });
});
