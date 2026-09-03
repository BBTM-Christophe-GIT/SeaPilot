import type { SupabaseClient } from '@supabase/supabase-js';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkingTimeWorkspace } from './workingTimeQueries';
import {
  discardWorkingTimeDraft,
  fetchWorkingTimeDayContext,
  getOrCreateWorkingTimeRegister,
  saveWorkingTimePhases,
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
const currentPerson = { id: 10, firstName: 'Camille', lastName: 'CAPITAINE', functionLabel: 'Capitaine', gradeLabel: '' };
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

function renderPanel(
  roles: Array<'capitaine' | 'marin' | 'armement' | 'admin' | 'direction'>,
  data: WorkingTimeWorkspace,
  person = currentPerson,
  referenceDate = '2026-09-01',
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
      id: 10,
      firstName: 'Diane',
      lastName: 'DIRECTION',
      functionLabel: 'Direction',
      gradeLabel: '',
    });

    expect(screen.queryByRole('button', { name: 'Enregistrer le brouillon' })).not.toBeInTheDocument();
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

  it('lets the assigned exact HR Captain validate a compliant sailor draft directly', async () => {
    const user = userEvent.setup();
    const data = workspace('validated', 20);
    vi.mocked(fetchWorkingTimeDayContext).mockResolvedValue({
      assignmentId: 1,
      vesselId: 7,
      watchGroup: 'Bordée 1',
      statusLabel: 'En Mer',
      approverPersonId: 10,
      captainCandidates: [{ personId: 10, firstName: 'Camille', lastName: 'CAPITAINE', name: 'Camille CAPITAINE' }],
    });
    renderPanel(['capitaine'], data);

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
});
