import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkingTimeWorkspace } from './workingTimeQueries';
import {
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
      periodKind: 'weekly',
      periodStart: '2026-08-03',
      periodEnd: '2026-08-09',
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
      { id: 300, personId: 10, versionNumber: 1, storageBucket: 'working-time-signatures', storagePath: '1/10/sign.png', mimeType: 'image/png', validFrom: '2026-01-01T00:00:00Z' },
      { id: 301, personId: 20, versionNumber: 1, storageBucket: 'working-time-signatures', storagePath: '1/20/sign.png', mimeType: 'image/png', validFrom: '2026-01-01T00:00:00Z' },
    ],
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

  it('requires explicit profile-signature consent before the subject submits', async () => {
    const user = userEvent.setup();
    renderPanel(['capitaine'], workspace('awaiting_sailor_signature'));

    const submitButton = screen.getByRole('button', { name: 'Signer et soumettre' });
    expect(submitButton).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /J’appose explicitement/ }));
    expect(submitButton).toBeEnabled();
    await user.click(submitButton);

    expect(transitionWorkingTimeRegister).toHaveBeenCalledWith(client, {
      registerId: 100,
      action: 'sailor_sign',
    });
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

    expect(screen.getByRole('button', { name: 'Contrôler et valider le registre' })).toBeDisabled();
    expect(screen.getByText(/Commentaires capitaine manquants : 2026-08-03/)).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: '2026-08-03' }), 'Opération de sécurité prolongée.');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le commentaire' }));

    expect(saveWorkingTimeDayComment).toHaveBeenCalledWith(client, {
      registerId: 100,
      localWorkDate: '2026-08-03',
      comment: 'Opération de sécurité prolongée.',
    });
  });

  it('locks validated data and requires a reason before reopening', async () => {
    const user = userEvent.setup();
    renderPanel(['armement'], workspace('validated', 20));

    expect(screen.getByText(/heures et commentaires sont verrouillés/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Corriger' })).not.toBeInTheDocument();
    const reopenButton = screen.getByRole('button', { name: 'Réouvrir' });
    expect(reopenButton).toBeDisabled();
    await user.type(screen.getByLabelText('Motif obligatoire'), 'Correction demandée');
    await user.click(reopenButton);

    expect(transitionWorkingTimeRegister).toHaveBeenCalledWith(client, {
      registerId: 100,
      action: 'reopen',
      comment: 'Correction demandée',
    });
  });
});
