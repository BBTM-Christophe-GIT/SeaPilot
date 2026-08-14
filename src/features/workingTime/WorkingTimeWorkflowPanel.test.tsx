import type { SupabaseClient } from '@supabase/supabase-js';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkingTimeWorkspace } from './workingTimeQueries';
import {
  discardWorkingTimeDraft,
  getOrCreateWorkingTimeRegister,
  saveWorkingTimeDayComment,
  submitWorkingTimeDay,
  validateWorkingTimeDay,
} from './workingTimeQueries';
import { useWorkingTimeWorkspace } from './useWorkingTimeWorkspace';
import { WorkingTimeWorkflowPanel } from './WorkingTimeWorkflowPanel';

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
    discardWorkingTimeDraft: vi.fn().mockResolvedValue(100),
    saveWorkingTimeInterval: vi.fn(),
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
  };
}

function renderPanel(roles: Array<'capitaine' | 'marin' | 'armement' | 'admin'>, data: WorkingTimeWorkspace) {
  vi.mocked(useWorkingTimeWorkspace).mockReturnValue({
    workspace: data,
    isLoading: false,
    errorMessage: null,
    reload,
  });
  return render(
    <WorkingTimeWorkflowPanel
      client={client}
      currentPerson={currentPerson}
      previewMode
      range={{ start: '2026-08-01', end: '2026-08-31' }}
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

  it('lets a captain submit their own day to another Planning captain', async () => {
    const user = userEvent.setup();
    renderPanel(['capitaine'], workspace('draft'));

    await user.click(screen.getByRole('tab', { name: /lun 03 août/ }));
    const submitButton = screen.getByRole('button', { name: 'Soumettre au Capitaine' });
    expect(submitButton).toBeEnabled();
    await user.click(submitButton);

    expect(submitWorkingTimeDay).toHaveBeenCalledWith(client, {
      registerId: 100,
      localWorkDate: '2026-08-03',
    });
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

  it('lets management prepare a draft when the server exposes the HR person', () => {
    renderPanel(['admin'], workspace('draft', 20));

    expect(screen.getByText('Saisie assistée')).toBeInTheDocument();
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

    expect(screen.getAllByRole('button', { name: /Alex MARIN/ })).toHaveLength(2);
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
      longestRest24hSeconds: 36_000, restPeriodCount24h: 2, work7dSeconds: 120_000, rest7dSeconds: 484_800,
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
  });

  it('does not flag an empty day because of a rolling-window breach inherited from the previous day', () => {
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
  });

  it('discards an unsigned draft from its card without saving its changes', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPanel(['admin'], workspace('draft', 20));

    await user.click(screen.getByRole('button', { name: /Supprimer le brouillon de Alex MARIN/ }));

    expect(discardWorkingTimeDraft).toHaveBeenCalledWith(client, 100);
    expect(reload).toHaveBeenCalled();
    expect(screen.getByText(/retiré sans enregistrer ses modifications/)).toBeInTheDocument();
  });

  it('shows the approval badge and lets the assigned captain validate one sailor day', async () => {
    const user = userEvent.setup();
    const data = workspace('validated', 20);
    data.dayApprovals = [{
      id: 501, companyId: 1, registerId: 100, personId: 20,
      localWorkDate: '2026-08-03', status: 'submitted', planningAssignmentId: 1,
      vesselId: 7, watchGroup: 'Bordée 1', approverPersonId: 10,
      submittedAt: '2026-08-03T16:00:00Z', validatedAt: null, validatedByPersonId: null,
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

  it('keeps validation disabled until every non-compliant day has a saved captain comment', async () => {
    const user = userEvent.setup();
    const data = workspace('submitted', 20);
    data.dayApprovals = [{
      id: 502, companyId: 1, registerId: 100, personId: 20,
      localWorkDate: '2026-08-03', status: 'submitted', planningAssignmentId: 1,
      vesselId: 7, watchGroup: 'Bordée 1', approverPersonId: 10,
      submittedAt: '2026-08-03T16:00:00Z', validatedAt: null, validatedByPersonId: null,
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

    expect(screen.getByRole('button', { name: 'Valider la journée' })).toBeDisabled();
    expect(screen.getByText(/Justification de non-conformité incomplète/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Catégorie de cause'), { target: { value: 'safety_emergency' } });
    fireEvent.change(screen.getByLabelText('Contexte opérationnel'), { target: { value: 'Opération de sécurité prolongée.' } });
    fireEvent.change(screen.getByLabelText('Action immédiate'), { target: { value: 'Relève organisée.' } });
    fireEvent.change(screen.getByLabelText('Repos compensateur prévu'), { target: { value: 'Repos planifié demain.' } });
    fireEvent.change(screen.getByLabelText('Commentaire obligatoire'), { target: { value: 'Écart documenté par le capitaine.' } });
    await user.click(screen.getByRole('button', { name: 'Valider la journée' }));

    expect(saveWorkingTimeDayComment).toHaveBeenCalledWith(client, {
      registerId: 100,
      localWorkDate: '2026-08-03',
      causeCategory: 'safety_emergency',
      operationalContext: 'Opération de sécurité prolongée.',
      immediateAction: 'Relève organisée.',
      compensatoryRestPlan: 'Repos planifié demain.',
      comment: 'Écart documenté par le capitaine.',
    });
    expect(validateWorkingTimeDay).toHaveBeenCalledWith(client, 502);
  });

  it('locks only the validated day without offering a month-level reopen action', async () => {
    const user = userEvent.setup();
    const data = workspace('validated', 20);
    data.dayApprovals = [{
      id: 503, companyId: 1, registerId: 100, personId: 20,
      localWorkDate: '2026-08-03', status: 'validated', planningAssignmentId: 1,
      vesselId: 7, watchGroup: 'Bordée 1', approverPersonId: 10,
      submittedAt: '2026-08-03T16:00:00Z', validatedAt: '2026-08-03T17:00:00Z', validatedByPersonId: 10,
    }];
    renderPanel(['armement'], data);
    await user.click(screen.getByRole('tab', { name: /lun 03 août/ }));

    expect(screen.getByText(/Journée validée et clôturée/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Corriger' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réouvrir' })).not.toBeInTheDocument();
  });
});
