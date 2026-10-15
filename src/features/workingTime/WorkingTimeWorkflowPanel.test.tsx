import { deferred } from './workingTimeTestHelpers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkingTimeEntryRecommendation, WorkingTimeWorkspace } from './workingTimeQueries';
import {
  discardWorkingTimeDraft,
  fetchWorkingTimeDayContext,
  fetchWorkingTimeAssignmentAnalysis,
  getOrCreateWorkingTimeRegister,
  saveWorkingTimePhases,
  saveWorkingTimeInterval,
  submitWorkingTimeDay,
  validateWorkingTimeDay,
  validateWorkingTimeDayWithComment,
} from './workingTimeQueries';
import { useWorkingTimeWorkspace } from './useWorkingTimeWorkspace';
import { WorkingTimeWorkflowPanel, workingTimeInitialDay } from './WorkingTimeWorkflowPanel';

vi.mock('./useWorkingTimeWorkspace', () => ({ useWorkingTimeWorkspace: vi.fn() }));
vi.mock('./workingTimeQueries', async (importOriginal) => {
  const original = await importOriginal<typeof import('./workingTimeQueries')>();
  return {
    ...original,
    fetchWorkingTimeAssignmentAnalysis: vi.fn().mockResolvedValue({
      status: 'conforme', policyId: 1, policyName: 'Accords Collectifs du 27/06/2025',
      alreadyNonCompliant: false, available24hSeconds: 14400, available7dSeconds: 180000,
      work24hSeconds: 28800, work7dSeconds: 79200, rest24hSeconds: 57600,
      longestRest24hSeconds: 43200, restImpactSeconds: -14400, consecutiveRestImpactSeconds: -3600,
      maxAdditionalSeconds: 14400, latestEndAt: '2026-08-03T16:00:00Z',
      nextResumeAt: '2026-08-03T22:00:00Z', violationCodes: [],
    }),
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

function analysisResult(value: Partial<WorkingTimeEntryRecommendation>): WorkingTimeEntryRecommendation {
  return { status: 'conforme', policyId: 1, policyName: 'Politique compagnie', alreadyNonCompliant: false,
    available24hSeconds: 0, available7dSeconds: 0, work24hSeconds: 0, work7dSeconds: 0,
    rest24hSeconds: 0, longestRest24hSeconds: 0, restImpactSeconds: 0, consecutiveRestImpactSeconds: 0,
    maxAdditionalSeconds: 0, latestEndAt: null, nextResumeAt: null, violationCodes: [], ...value };
}

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

function renderPanel(
  roles: Array<'capitaine' | 'marin' | 'armement' | 'admin' | 'direction'>,
  data: WorkingTimeWorkspace,
  person = currentPerson,
  referenceDate = '2026-09-01',
  navigationTarget?: { personId: number; date: string },
) {
  vi.mocked(useWorkingTimeWorkspace).mockReturnValue({
    workspace: data,
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
    reload.mockResolvedValue(true);
    vi.mocked(fetchWorkingTimeDayContext).mockResolvedValue(defaultDayContext);
  });

  it.each(['amplitude', 'rest_interval', 'future_server_rule'].flatMap((code) => (
    ['search', 'click'].map((action) => ({ code, action }))
  )))('keeps the workspace visible when $action selects a person with $code', async ({ code, action }) => {
    const user = userEvent.setup();
    const data = workspace('draft');
    data.registers.push({ ...data.registers[0], id: 101, personId: 20, personName: 'Alex MARIN', functionLabel: 'Matelot' });
    data.intervals.push({ ...data.intervals[0], id: 201, registerId: 101, personId: 20 });
    data.calculations.push({
      id: 301, companyId: 1, personId: 20, windowEnd: '2026-08-03T14:00:00Z',
      localWindowEndDate: '2026-08-03', timezoneName: 'Europe/Paris', vesselId: 7,
      workRestPolicyId: 1, work24hSeconds: 28800, rest24hSeconds: 57600,
      longestRest24hSeconds: 43200, restPeriodCount24h: 2, work7dSeconds: 28800,
      rest7dSeconds: 576000, nightWork24hSeconds: 0, isCompliant: false,
      violationCodes: [code], calculationVersion: 4, calculatedAt: '2026-08-03T14:00:01Z',
    });
    renderPanel(['admin'], data, currentPerson, '2026-08-03');
    await screen.findByRole('heading', { name: /Camille CAPITAINE/ });
    if (action === 'search') {
      await user.type(screen.getByRole('searchbox', { name: 'Rechercher un marin' }), 'Alex');
    } else {
      await user.click(screen.getByRole('button', { name: /^Matelot/ }));
      await user.click(screen.getByRole('button', { name: /Alex MARIN/ }));
    }
    expect(await screen.findByRole('heading', { name: /Alex MARIN/ })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Conformité' })).toBeVisible();
    expect(screen.getAllByText(/Amplitude de travail|Intervalle entre deux repos|Alerte de conformité/).length).toBeGreaterThan(0);
    await user.clear(screen.getByRole('searchbox', { name: 'Rechercher un marin' }));
    await user.click(screen.getByRole('button', { name: /Camille CAPITAINE/ }));
    expect(screen.getByRole('heading', { name: /Camille CAPITAINE/ })).toBeVisible();
    expect(saveWorkingTimePhases).not.toHaveBeenCalled();
    expect(submitWorkingTimeDay).not.toHaveBeenCalled();
    expect(validateWorkingTimeDay).not.toHaveBeenCalled();
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
      registerId: 101,
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
    vi.mocked(useWorkingTimeWorkspace).mockReturnValue({ workspace: null, isLoading: true, errorMessage: null, reload });
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

    vi.mocked(useWorkingTimeWorkspace).mockReturnValue({ workspace: workspace('draft', 20), isLoading: false, errorMessage: null, reload });
    view.rerender(<WorkingTimeWorkflowPanel {...props} roles={[...props.roles]} />);
    expect(await screen.findByRole('heading', { name: 'Mercredi 19 août 2026' })).toBeInTheDocument();
    await waitFor(() => expect(fetchWorkingTimeDayContext).toHaveBeenCalledWith(client, {
      personId: 20, localWorkDate: '2026-08-19',
      registerId: 100,
    }));
  });

  it('lets an unlinked administrator browse the catalogue while keeping mutations protected', () => {
    vi.mocked(useWorkingTimeWorkspace).mockReturnValue({ workspace: null, isLoading: false, errorMessage: null, reload });
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

    expect(screen.getByText('Chargement de l’affectation Planning…')).toHaveAttribute('role', 'status');
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
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeEnabled());
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
  it('persists a keyboard range as a draft without requiring Enter to commit the selection', async () => {
    const user = userEvent.setup();
    const data = workspace('draft'); data.intervals = [];
    renderPanel(['marin'], data, { ...currentPerson, functionLabel: 'Matelot' });
    await user.click(screen.getByRole('tab', { name: /lun 03 août/ }));
    await screen.findByText(/Affectation Planning appliquée/);
    screen.getAllByRole('gridcell')[16].focus();
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(screen.queryByLabelText('Périodes à enregistrer')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    await waitFor(() => expect(saveWorkingTimePhases).toHaveBeenCalledWith(client, expect.objectContaining({
      registerId: 100,
      phases: [{ startsAt: new Date('2026-08-03T08:00').toISOString(), endsAt: new Date('2026-08-03T09:00').toISOString() }],
    })));
    expect(submitWorkingTimeDay).not.toHaveBeenCalled();
  });
  it.each([true, false])('awaits keyboard phase persistence before submitting (save succeeds: %s) and ignores a second click', async (succeeds) => {
    const user = userEvent.setup(); const pending = deferred<number[]>();
    vi.mocked(saveWorkingTimePhases).mockReturnValueOnce(pending.promise);
    const data = workspace('draft'); data.intervals = [];
    renderPanel(['marin'], data, { ...currentPerson, functionLabel: 'Matelot' });
    await user.click(screen.getByRole('tab', { name: /lun 03 août/ }));
    await screen.findByText(/Affectation Planning appliquée/);
    screen.getAllByRole('gridcell')[16].focus();
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    const button = screen.getByRole('button', { name: 'Valider' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.dblClick(button);
    expect(saveWorkingTimePhases).toHaveBeenCalledOnce();
    expect(saveWorkingTimePhases).toHaveBeenCalledWith(client, expect.objectContaining({
      phases: [{ startsAt: new Date('2026-08-03T08:00').toISOString(), endsAt: new Date('2026-08-03T09:00').toISOString() }],
    }));
    expect(submitWorkingTimeDay).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
    if (succeeds) {
      await act(async () => { pending.resolve([301]); await pending.promise; });
      await waitFor(() => expect(submitWorkingTimeDay).toHaveBeenCalledExactlyOnceWith(client, { registerId: 100, localWorkDate: '2026-08-03' }));
    } else {
      await act(async () => { pending.reject(new Error('Enregistrement indisponible.')); });
      expect(await screen.findByText('Enregistrement indisponible.')).toBeInTheDocument();
      expect(submitWorkingTimeDay).not.toHaveBeenCalled();
      expect(reload).toHaveBeenCalledOnce();
    }
  });
  it('persists the revised keyboard range when correcting a recorded interval', async () => {
    const user = userEvent.setup();
    const data = workspace('draft');
    data.intervals[0].startsAt = new Date('2026-08-03T08:00').toISOString();
    data.intervals[0].endsAt = new Date('2026-08-03T16:00').toISOString();
    renderPanel(['marin'], data, { ...currentPerson, functionLabel: 'Matelot' });
    await user.click(screen.getByRole('tab', { name: /lun 03 août/ }));
    await screen.findByText(/Affectation Planning appliquée/);
    await user.click(screen.getByRole('gridcell', { name: /08:00, travail enregistré/ }));
    await user.click(screen.getByRole('button', { name: 'Corriger' }));
    screen.getAllByRole('gridcell')[16].focus();
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer la correction' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Enregistrer la correction' }));
    await waitFor(() => expect(saveWorkingTimeInterval).toHaveBeenCalledWith(client, expect.objectContaining({
      registerId: 100, intervalId: 200,
      startsAt: new Date('2026-08-03T08:00').toISOString(), endsAt: new Date('2026-08-03T09:00').toISOString(),
    })));
    expect(saveWorkingTimePhases).not.toHaveBeenCalled();
    expect(submitWorkingTimeDay).not.toHaveBeenCalled();
  });
  it('keeps a confirmed submission distinct from an unavailable refresh', async () => {
    const user = userEvent.setup(); reload.mockResolvedValueOnce(false);
    renderPanel(['marin'], workspace('draft'), { ...currentPerson, functionLabel: 'Matelot' });
    await user.click(screen.getByRole('tab', { name: /lun 03 août/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Valider' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Valider' }));
    expect(await screen.findByText(/La journée a été signée.*L’actualisation est indisponible/)).toBeInTheDocument();
    expect(submitWorkingTimeDay).toHaveBeenCalledOnce();
  });
  it('does not display an old submission result after the selected day changes', async () => {
    const user = userEvent.setup(); const pending = deferred<number>();
    vi.mocked(submitWorkingTimeDay).mockReturnValueOnce(pending.promise);
    renderPanel(['marin'], workspace('draft'), { ...currentPerson, functionLabel: 'Matelot' });
    await user.click(screen.getByRole('tab', { name: /lun 03 août/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Valider' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Valider' }));
    await user.click(screen.getByRole('tab', { name: /mar 04 août/ }));
    await act(async () => { pending.resolve(1); await pending.promise; });
    expect(screen.queryByText(/La journée a été signée/)).not.toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled(); expect(submitWorkingTimeDay).toHaveBeenCalledOnce();
  });
  it('does not submit a day after the module closes during its first save', async () => {
    const user = userEvent.setup(); const pending = deferred<number[]>();
    vi.mocked(saveWorkingTimePhases).mockReturnValueOnce(pending.promise);
    const data = workspace('draft'); data.intervals = [];
    const view = renderPanel(['marin'], data, { ...currentPerson, functionLabel: 'Matelot' });
    await user.click(screen.getByRole('tab', { name: /lun 03 août/ }));
    await screen.findByText(/Affectation Planning appliquée/);
    const cells = screen.getAllByRole('gridcell'); fireEvent.pointerDown(cells[32]); fireEvent.pointerUp(cells[32]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Valider' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Valider' }));
    expect(saveWorkingTimePhases).toHaveBeenCalledOnce(); view.unmount();
    await act(async () => { pending.resolve([301]); await pending.promise; });
    expect(submitWorkingTimeDay).not.toHaveBeenCalled(); expect(reload).not.toHaveBeenCalled();
  });
  it('does not retain a removal confirmation after the selected day changes', async () => {
    const user = userEvent.setup(); renderPanel(['marin'], workspace('draft'), { ...currentPerson, functionLabel: 'Matelot' });
    await user.click(screen.getByRole('tab', { name: /lun 03 août/ }));
    await screen.findByText(/Affectation Planning appliquée/);
    await user.click(screen.getByRole('gridcell', { name: /08:00, travail enregistré/ }));
    await user.click(screen.getByRole('button', { name: 'Retirer' }));
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /mar 04 août/ }));
    expect(screen.queryByRole('button', { name: 'Confirmer' })).not.toBeInTheDocument();
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
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeEnabled());
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

    expect(await screen.findByRole('button', { name: 'Enregistrer le brouillon' })).toBeInTheDocument();
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
  it.each([true, false, undefined])('uses explicit daily server editing permission %s for an historical admin register', async (canEdit) => {
    vi.mocked(fetchWorkingTimeDayContext).mockResolvedValue({ ...defaultDayContext, ...(canEdit === undefined ? {} : { canEdit }) });
    renderPanel(['admin'], workspace('draft', 20), currentPerson, '2026-10-14');
    await waitFor(() => expect(fetchWorkingTimeDayContext).toHaveBeenCalled());
    if (canEdit === true) expect(await screen.findByRole('button', { name: 'Enregistrer le brouillon' })).toBeInTheDocument();
    else { await screen.findByText('Cette journée est en lecture seule pour son statut actuel.'); expect(screen.queryByRole('button', { name: 'Enregistrer le brouillon' })).not.toBeInTheDocument(); }
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

  it('lets a Marin analyse and save disjoint morning and afternoon periods without Planning', async () => {
    const user = userEvent.setup();
    const data = workspace('draft', 20);
    data.currentPersonId = 20;
    data.readablePeople = data.readablePeople.filter((person) => person.personId === 20);
    data.editablePeople = data.editablePeople.filter((person) => person.personId === 20);
    data.intervals = [];
    vi.mocked(fetchWorkingTimeDayContext).mockResolvedValue({
      assignmentId: null, vesselId: null, watchGroup: null, statusLabel: null,
      approverPersonId: null, captainCandidates: [],
    });
    renderPanel(['marin'], data, { ...currentPerson, id: 20, firstName: 'Alex', lastName: 'MARIN', functionLabel: 'Matelot', gradeLabel: '' });

    await user.click(screen.getByRole('tab', { name: /lun 03 août/ }));
    await screen.findByText(/Aucune affectation Planning/);
    const cells = screen.getAllByRole('gridcell');
    fireEvent.pointerDown(cells[15]);
    fireEvent.pointerEnter(cells[23]);
    fireEvent.pointerUp(cells[23]);
    fireEvent.pointerDown(cells[25]);
    fireEvent.pointerEnter(cells[29]);
    fireEvent.pointerUp(cells[29]);
    const phases = [
      { startsAt: '2026-08-03T07:30', endsAt: '2026-08-03T12:00' },
      { startsAt: '2026-08-03T12:30', endsAt: '2026-08-03T15:00' },
    ];
    const isoPhases = phases.map((phase) => ({ startsAt: new Date(phase.startsAt).toISOString(), endsAt: new Date(phase.endsAt).toISOString() }));
    await waitFor(() => expect(fetchWorkingTimeAssignmentAnalysis).toHaveBeenCalledWith(client, expect.objectContaining({
      personId: 20, vesselId: null, watchGroup: null,
      phases: isoPhases,
    })));
    expect(screen.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    await waitFor(() => expect(saveWorkingTimePhases).toHaveBeenCalledWith(client, expect.objectContaining({ registerId: 100, vesselId: null, watchGroup: null, phases: isoPhases })));
    expect(submitWorkingTimeDay).not.toHaveBeenCalled();
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

    const nonCompliantDay = await screen.findByRole('tab', { name: /lun 03 août, journée non conforme/ });
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
    expect(alarmRow).toHaveTextContent('Travail depuis le dernier repos de 6 h : 13 h / maximum 12 h');
    expect(alarmRow).not.toHaveTextContent('Compteur remis à zéro après chaque repos continu d’au moins 6 h.');
    expect(impactRow).not.toHaveClass('is-non-compliant');
    expect(impactRow).toHaveTextContent('Conforme');
    expect(impactRow).toHaveTextContent('15 h 00');
    expect(impactRow).toHaveTextContent('22 h 00');
    expect(impactRow).not.toHaveTextContent('Non conforme');

    await user.click(screen.getByRole('button', { name: /mar 18 août/ }));
    const rollingWindow = screen.getByRole('status', { name: 'Impact des 24 heures glissantes' });
    expect(rollingWindow).toHaveTextContent('Travail depuis le dernier repos de 6 h : 13 h / maximum 12 h');
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
    const pending = deferred<number>();
    vi.mocked(validateWorkingTimeDayWithComment).mockReturnValueOnce(pending.promise);
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
    await user.dblClick(screen.getByRole('button', { name: 'Valider la saisie des heures et la justification' }));

    expect(validateWorkingTimeDayWithComment).toHaveBeenCalledOnce();
    expect(validateWorkingTimeDayWithComment).toHaveBeenCalledWith(client, 502, {
      causeCategory: 'safety_emergency',
      operationalContext: 'Opération de sécurité prolongée.',
      immediateAction: 'Relève organisée.',
      compensatoryRestPlan: 'Repos planifié demain.',
      comment: 'Écart documenté par le capitaine.',
    });
    expect(validateWorkingTimeDay).not.toHaveBeenCalledWith(client, 502);
    for (const label of ['Catégorie de cause', 'Contexte opérationnel', 'Action immédiate', 'Repos compensateur prévu', 'Commentaire obligatoire']) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
    await user.type(screen.getByLabelText('Commentaire obligatoire'), 'Modification tardive');
    expect(screen.getByLabelText('Commentaire obligatoire')).toHaveValue('Écart documenté par le capitaine.');
    await act(async () => { pending.resolve(1); await pending.promise; });
    await waitFor(() => expect(screen.getByLabelText('Contexte opérationnel')).toBeEnabled());
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

  it('preserves separate day drafts across the graphical month view without writing or changing official totals', async () => {
    const user = userEvent.setup();
    renderPanel(['marin'], workspace('draft'), { ...currentPerson, functionLabel: 'Matelot' }, '2026-08-03');
    await waitFor(() => expect(screen.getAllByRole('gridcell')[36]).toBeEnabled());
    fireEvent.keyDown(screen.getAllByRole('gridcell')[36], { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Ajuster le début de la période 1, 18:00' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mois' }));
    expect(screen.getByRole('img', { name: /lun 03 août.*à enregistrer : 18:00–18:30/ })).toBeInTheDocument();
    expect(screen.getByText('8 h 00 sur le mois')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'mar 04 août' }));
    await waitFor(() => expect(screen.getAllByRole('gridcell')[20]).toBeEnabled());
    expect(screen.queryByRole('group', { name: 'Ajuster les périodes à enregistrer' })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getAllByRole('gridcell')[20], { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Ajuster le début de la période 1, 10:00' })).toBeInTheDocument();
    await waitFor(() => expect(fetchWorkingTimeAssignmentAnalysis).toHaveBeenLastCalledWith(client, expect.objectContaining({
      phases: [
        { startsAt: new Date('2026-08-03T18:00').toISOString(), endsAt: new Date('2026-08-03T18:30').toISOString() },
        { startsAt: new Date('2026-08-04T10:00').toISOString(), endsAt: new Date('2026-08-04T10:30').toISOString() },
      ], excludeIntervalIds: [],
    })));
    await user.click(screen.getByRole('tab', { name: /lun 03 août/ }));
    expect(screen.getByRole('button', { name: 'Ajuster le début de la période 1, 18:00' })).toBeInTheDocument();
    expect(saveWorkingTimePhases).not.toHaveBeenCalled();
    expect(saveWorkingTimeInterval).not.toHaveBeenCalled();
  });

  it('opens the persisted threshold editor only from an administrator profile', async () => {
    const user = userEvent.setup();
    renderPanel(['admin'], workspace('draft'), currentPerson, '2026-08-03');
    await user.click(screen.getByRole('button', { name: 'Modifier les seuils' }));
    expect(onOpenWorkRest).toHaveBeenCalledWith(1);
  });

  it.each(['marin', 'capitaine', 'armement', 'direction'] as const)('gives a real %s fixture read-only access to its policy thresholds', async (role) => {
    const user = userEvent.setup();
    renderPanel([role], workspace('draft'), { ...currentPerson, functionLabel: role === 'capitaine' ? 'Capitaine' : 'Matelot' }, '2026-08-03');
    expect(screen.queryByRole('button', { name: 'Modifier les seuils' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Consulter les seuils' }));
    expect(onOpenWorkRest).toHaveBeenCalledWith(1);
  });

  it('uses a continuous assignment cover instead of a failed legacy rolling calculation in both views', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchWorkingTimeAssignmentAnalysis).mockResolvedValueOnce(analysisResult({ status: 'conforme', assignmentCoverage: [{
      assignmentId: 1, scopeStartsAt: new Date('2026-08-03T00:00').toISOString(), scopeEndsAt: new Date('2026-08-04T00:00').toISOString(),
      status: 'covered', windows: [{ startsAt: new Date('2026-08-03T00:00').toISOString(), endsAt: new Date('2026-08-04T00:00').toISOString() }],
      uncoveredRanges: [],
    }] }));
    const data = workspace('draft');
    data.calculations = [{
      id: 401, companyId: 1, personId: 10, windowEnd: '2026-08-03T18:00:00Z', localWindowEndDate: '2026-08-03',
      timezoneName: 'Europe/Paris', vesselId: 7, workRestPolicyId: 1, work24hSeconds: 28800, rest24hSeconds: 27000,
      longestRest24hSeconds: 21600, restPeriodCount24h: 2, work7dSeconds: 120000, rest7dSeconds: 484800,
      nightWork24hSeconds: 0, isCompliant: false, violationCodes: ['rest_24h'], calculationVersion: 4,
      calculatedAt: '2026-08-03T18:00:01Z',
    }];
    renderPanel(['marin'], data, { ...currentPerson, functionLabel: 'Matelot' }, '2026-08-03');
    await screen.findByText('Affectation couverte sans interruption');
    expect(screen.getByRole('tab', { name: /lun 03 août/ })).not.toHaveClass('is-non-compliant');
    expect(screen.queryByRole('region', { name: 'Journées non conformes' })).not.toBeInTheDocument();
    expect(screen.queryByText('Repos sur 24 h : 7,5 h / minimum 10 h')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mois' }));
    expect(screen.getByRole('table')).toHaveTextContent('Couvert');
    expect(screen.getByRole('table')).not.toHaveTextContent('Non conforme');
  });

  it('ignores an old coverage response after the authenticated client changes', async () => {
    const oldResponse = deferred<WorkingTimeEntryRecommendation>();
    const scope = { assignmentId: 1, scopeStartsAt: new Date('2026-08-03T00:00').toISOString(),
      scopeEndsAt: new Date('2026-08-04T00:00').toISOString(), windows: [], uncoveredRanges: [] };
    vi.mocked(fetchWorkingTimeAssignmentAnalysis).mockReturnValueOnce(oldResponse.promise)
      .mockResolvedValueOnce(analysisResult({ status: 'conforme', assignmentCoverage: [{ ...scope, status: 'covered' }] }));
    const data = workspace('draft');
    const person = { ...currentPerson, functionLabel: 'Matelot' };
    const { rerender } = renderPanel(['marin'], data, person, '2026-08-03');
    await waitFor(() => expect(fetchWorkingTimeAssignmentAnalysis).toHaveBeenCalledTimes(1));
    rerender(<WorkingTimeWorkflowPanel client={{} as SupabaseClient} currentPerson={person} roles={['marin']}
      previewMode range={{ start: '2026-08-01', end: '2026-08-31' }} referenceDate="2026-08-03" />);
    await screen.findByText('Affectation couverte sans interruption');
    await act(async () => oldResponse.resolve(analysisResult({ status: 'non_conforme', assignmentCoverage: [{ ...scope,
      status: 'uncovered', uncoveredRanges: [{ startsAt: scope.scopeStartsAt, endsAt: scope.scopeEndsAt }],
    }] })));
    expect(screen.getByText('Affectation couverte sans interruption')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /lun 03 août/ })).not.toHaveClass('is-non-compliant');
    expect(saveWorkingTimePhases).not.toHaveBeenCalled();
  });

  it('preserves another month’s draft without sending it to the current month analysis', async () => {
    const person = { ...currentPerson, functionLabel: 'Matelot' };
    const { rerender } = renderPanel(['marin'], workspace('draft'), person, '2026-08-03');
    await waitFor(() => expect(screen.getAllByRole('gridcell')[36]).toBeEnabled());
    fireEvent.keyDown(screen.getAllByRole('gridcell')[36], { key: 'Enter' });
    await waitFor(() => expect(fetchWorkingTimeAssignmentAnalysis).toHaveBeenLastCalledWith(client, expect.objectContaining({ phases: [
      { startsAt: new Date('2026-08-03T18:00').toISOString(), endsAt: new Date('2026-08-03T18:30').toISOString() },
    ] })));
    const september = workspace('draft');
    september.registers[0] = { ...september.registers[0], id: 101, periodStart: '2026-09-01', periodEnd: '2026-09-30' };
    september.intervals = [];
    vi.mocked(useWorkingTimeWorkspace).mockReturnValue({ workspace: september, isLoading: false, errorMessage: null, reload });
    rerender(<WorkingTimeWorkflowPanel client={client} currentPerson={person} roles={['marin']} previewMode
      range={{ start: '2026-09-01', end: '2026-09-30' }} referenceDate="2026-09-03" />);
    await waitFor(() => expect(fetchWorkingTimeAssignmentAnalysis).toHaveBeenLastCalledWith(client, expect.objectContaining({
      periodStart: '2026-09-01', periodEnd: '2026-09-30', phases: [], excludeIntervalIds: [],
    })));
    expect(screen.queryByRole('group', { name: 'Ajuster les périodes à enregistrer' })).not.toBeInTheDocument();
    expect(saveWorkingTimePhases).not.toHaveBeenCalled();
  });

  it('shows the effective vessel policy instead of an older policy stored on the register', async () => {
    const data = workspace('draft');
    const legacy = data.policies[0];
    data.policies = [
      { ...legacy, effectiveFrom: '2026-01-01', effectiveTo: null, scope: 'company', vesselId: null, active: true },
      { ...legacy, id: 2, name: 'Seuils du navire actualisés', maxWork24h: 11, effectiveFrom: '2026-08-01', effectiveTo: null, scope: 'vessel', vesselId: 7, active: true },
      { ...legacy, id: 3, name: 'Politique future', effectiveFrom: '2026-09-01', effectiveTo: null, scope: 'vessel', vesselId: 7, active: true },
    ];
    renderPanel(['marin'], data, { ...currentPerson, functionLabel: 'Matelot' }, '2026-08-03');
    expect(await screen.findByText('Seuils du navire actualisés')).toBeInTheDocument();
    expect(screen.getByText('11 h')).toBeInTheDocument();
    expect(screen.queryByText('Politique future')).not.toBeInTheDocument();
  });
});
