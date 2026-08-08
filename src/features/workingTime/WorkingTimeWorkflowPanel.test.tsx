import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkingTimeWorkspace } from './workingTimeQueries';
import {
  discardWorkingTimeDraft,
  getOrCreateWorkingTimeRegister,
  saveWorkingTimeDayComment,
  transitionWorkingTimeRegister,
} from './workingTimeQueries';
import { useWorkingTimeWorkspace } from './useWorkingTimeWorkspace';
import { WorkingTimeWorkflowPanel } from './WorkingTimeWorkflowPanel';

vi.mock('./useWorkingTimeWorkspace', () => ({ useWorkingTimeWorkspace: vi.fn() }));
vi.mock('./workingTimeQueries', async (importOriginal) => {
  const original = await importOriginal<typeof import('./workingTimeQueries')>();
  return {
    ...original,
    getOrCreateWorkingTimeRegister: vi.fn(),
    discardWorkingTimeDraft: vi.fn().mockResolvedValue(100),
    saveWorkingTimeInterval: vi.fn(),
    voidWorkingTimeInterval: vi.fn(),
    saveWorkingTimeDayComment: vi.fn().mockResolvedValue(1),
    transitionWorkingTimeRegister: vi.fn().mockResolvedValue(1),
  };
});

const client = {} as SupabaseClient;
const currentPerson = { id: 10, firstName: 'Camille', lastName: 'CAPITAINE', functionLabel: 'Capitaine', gradeLabel: '' };
const reload = vi.fn().mockResolvedValue(true);

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

  it('requires explicit profile-signature consent before the subject submits', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPanel(['capitaine'], workspace('awaiting_sailor_signature'));

    const submitButton = screen.getByRole('button', { name: 'Signer et soumettre' });
    expect(submitButton).toBeEnabled();
    await user.click(submitButton);

    expect(transitionWorkingTimeRegister).toHaveBeenCalledWith(client, {
      registerId: 100,
      action: 'sailor_sign',
    });
  });

  it('does not retain a hidden person id when the server exposes no editable HR person', async () => {
    const user = userEvent.setup();
    const data = workspace('draft', 20);
    data.editablePeople = [];
    renderPanel(['admin'], data);

    await user.click(screen.getByRole('button', { name: 'Ouvrir un registre' }));
    expect(screen.getByRole('combobox', { name: 'Personne du registre' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ouvrir ce mois' })).toBeDisabled();
    expect(screen.getByText(/Aucune fiche RH n’est accessible/)).toBeInTheDocument();
    expect(getOrCreateWorkingTimeRegister).not.toHaveBeenCalled();
  });

  it('lets management prepare a draft when the server exposes the HR person', async () => {
    const user = userEvent.setup();
    renderPanel(['admin'], workspace('draft', 20));

    await user.click(screen.getByRole('button', { name: 'Ouvrir un registre' }));
    expect(screen.getByRole('combobox', { name: 'Personne du registre' })).toHaveTextContent('Alex MARIN');
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

    await user.click(screen.getByRole('tab', { name: /lun03 août/ }));
    expect(screen.getByRole('gridcell', { name: /10:00, travail enregistré/ })).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: /13:30, travail enregistré/ })).toBeInTheDocument();
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

  it('shows separation of duties and never offers self-validation to a captain', () => {
    renderPanel(['capitaine'], workspace('submitted'));

    expect(screen.getByText(/Auto-validation interdite/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Contrôler et valider le registre' })).not.toBeInTheDocument();
  });

  it('keeps validation disabled until every non-compliant day has a saved captain comment', async () => {
    const user = userEvent.setup();
    const data = workspace('submitted', 20);
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

    expect(screen.getByRole('button', { name: 'Valider' })).toBeDisabled();
    expect(screen.getByText(/Réponses de non-conformité incomplètes : 2026-08-03/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Catégorie de cause'), 'safety_emergency');
    await user.type(screen.getByLabelText('Contexte opérationnel'), 'Opération de sécurité prolongée.');
    await user.type(screen.getByLabelText('Action immédiate'), 'Relève organisée.');
    await user.type(screen.getByLabelText('Repos compensateur prévu'), 'Repos planifié demain.');
    await user.type(screen.getByLabelText('Commentaire obligatoire'), 'Écart documenté par le capitaine.');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));

    expect(saveWorkingTimeDayComment).toHaveBeenCalledWith(client, {
      registerId: 100,
      localWorkDate: '2026-08-03',
      causeCategory: 'safety_emergency',
      operationalContext: 'Opération de sécurité prolongée.',
      immediateAction: 'Relève organisée.',
      compensatoryRestPlan: 'Repos planifié demain.',
      comment: 'Écart documenté par le capitaine.',
    });
  });

  it('locks validated data and requires a reason before reopening', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'prompt').mockReturnValue('Correction demandée');
    renderPanel(['armement'], workspace('validated', 20));

    expect(screen.getByText(/heures et commentaires sont verrouillés/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Corriger' })).not.toBeInTheDocument();
    const reopenButton = screen.getByRole('button', { name: 'Réouvrir' });
    await user.click(reopenButton);

    expect(transitionWorkingTimeRegister).toHaveBeenCalledWith(client, {
      registerId: 100,
      action: 'reopen',
      comment: 'Correction demandée',
    });
  });
});
