import type { SupabaseClient } from '@supabase/supabase-js';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanningP12Panel } from './PlanningP12Panel';
import type { PlanningAbsenceBalanceContext } from './planningAbsenceBalance';
import { fetchPlanningAbsenceBalanceContext, savePlanningLeaveCounterPeriod, savePlanningLeaveRightsPeriod } from './planningAbsenceBalanceQueries';
import type { PlanningAbsenceRecord, PlanningP12Data } from './planningP12';
import type { PlanningOverview } from './planningQueries';
import {
  deletePlanningAbsence,
  ensurePlanningConflictCase,
  fetchPlanningP12Data,
  reviewPlanningAbsence,
  savePlanningAbsence,
  updatePlanningConflictCase,
} from './planningP12Queries';
import { EMPTY_PLANNING_OVERVIEW } from './usePlanningOverview';

vi.mock('./planningP12Queries', () => ({
  deletePlanningAbsence: vi.fn(),
  ensurePlanningConflictCase: vi.fn(),
  fetchPlanningP12Data: vi.fn(),
  reviewPlanningAbsence: vi.fn(),
  savePlanningAbsence: vi.fn(),
  updatePlanningConflictCase: vi.fn(),
}));
vi.mock('./planningAbsenceBalanceQueries', () => ({
  fetchPlanningAbsenceBalanceContext: vi.fn(),
  savePlanningLeaveCounterPeriod: vi.fn(),
  savePlanningLeaveRightsPeriod: vi.fn(),
}));

const client = {} as SupabaseClient;
const overview: PlanningOverview = {
  ...EMPTY_PLANNING_OVERVIEW,
  vessels: [{ id: 1, name: 'COTENTIN', acronym: 'CTN', active: true }],
  people: [
    { id: 10, firstName: 'Anne', lastName: 'MARTIN', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', active: true },
    { id: 11, firstName: 'Paul', lastName: 'DURAND', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', active: true },
  ],
  assignments: [{ id: 20, vesselId: 1, vesselName: 'COTENTIN', captainPersonId: null, captainName: '', crewPersonId: 10, crewName: 'Anne MARTIN', startsOn: '2026-08-01', endsOn: '2026-08-14', startsAt: '2026-08-01T06:00:00Z', endsAt: '2026-08-14T18:00:00Z', assignmentRole: 'Capitaine', statusLabel: 'Embarqué', confirmationStatus: 'confirmed', watchGroup: 'A', comments: '', sourceLabel: 'seapilot' }],
};

const data = {
  absences: [
    { id: 30, personId: 10, absenceType: 'leave' as const, startsAt: '2026-08-04T06:00:00Z', endsAt: '2026-08-07T16:00:00Z', startsOn: '2026-08-04', endsOn: '2026-08-07', reason: 'Congés familiaux', status: 'approved' as const, requestedBy: 'anne', reviewedBy: 'manager', reviewedAt: '2026-07-10T10:00:00Z', reviewComment: 'Validé', createdAt: '', updatedAt: '' },
    { id: 31, personId: 11, absenceType: 'training' as const, startsAt: '2026-08-20T06:00:00Z', endsAt: '2026-08-20T16:00:00Z', startsOn: '2026-08-20', endsOn: '2026-08-20', reason: 'Formation sécurité', status: 'requested' as const, requestedBy: 'paul', reviewedBy: '', reviewedAt: '', reviewComment: '', createdAt: '', updatedAt: '' },
  ],
  conflictCases: [],
  conflictHistory: [],
  matrices: [],
};

const staffPerson = { ...overview.people[1], firstName: 'Sophie', lastName: 'HAMEL', functionLabel: 'Gestionnaire' };
const staffOverview: PlanningOverview = { ...overview, people: [overview.people[0], staffPerson] };
const rttRequests: PlanningAbsenceRecord[] = [
  { ...data.absences[1], id: 40, absenceType: 'rtt', status: 'requested', startsAt: '2026-08-03T06:00:00Z', endsAt: '2026-08-05T16:00:00Z', startsOn: '2026-08-03', endsOn: '2026-08-05', reason: 'RTT de rentrée' },
  { ...data.absences[1], id: 41, absenceType: 'rtt', status: 'approved', startsAt: '2026-08-10T06:00:00Z', endsAt: '2026-08-12T16:00:00Z', startsOn: '2026-08-10', endsOn: '2026-08-12', reason: 'RTT approuvés' },
  { ...data.absences[1], id: 42, absenceType: 'rtt', status: 'rejected', startsAt: '2026-08-17T06:00:00Z', endsAt: '2026-08-18T16:00:00Z', startsOn: '2026-08-17', endsOn: '2026-08-18', reason: 'RTT refusés' },
  { ...data.absences[1], id: 43, absenceType: 'rtt', status: 'cancelled', startsAt: '2026-08-20T06:00:00Z', endsAt: '2026-08-21T16:00:00Z', startsOn: '2026-08-20', endsOn: '2026-08-21', reason: 'RTT annulés' },
];
const rttData: PlanningP12Data = { ...data, absences: rttRequests };

function staffBalances(entitlement = 8): PlanningAbsenceBalanceContext {
  return { kind: 'leave_rtt', person: staffPerson, counterPeriods: [
    { id: 1, counterType: 'leave', startsOn: '2026-06-01', endsOn: '2027-05-31', entitlement: 25 },
    { id: 2, counterType: 'rtt', startsOn: '2026-06-01', endsOn: '2027-05-31', entitlement },
  ], absences: rttRequests, crewCheckpoints: [], crewSources: { assignments: [], periods: [], days: [] } };
}

function balanceMetric(counter: 'Congés' | 'RTT', label: string): HTMLElement {
  const term = within(screen.getByLabelText(`Compteur ${counter}`)).getByText(label, { selector: 'dt' });
  return term.nextElementSibling as HTMLElement;
}

function renderPanel(overrides: Partial<React.ComponentProps<typeof PlanningP12Panel>> = {}) {
  const props: React.ComponentProps<typeof PlanningP12Panel> = {
    client,
    overview,
    range: { start: '2026-08-01', end: '2026-08-31' },
    canRequestAbsences: true,
    canReviewAbsences: true,
    canDeleteAbsences: true,
    canManageConflictCases: true,
    canPrepareReplacements: true,
    onClose: vi.fn(),
    onPrepareReplacement: vi.fn(),
    onOpenSource: vi.fn(),
    onAuditChange: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<PlanningP12Panel {...props} />);
  return props;
}

describe('Planning P1.2 panel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.mocked(fetchPlanningP12Data).mockResolvedValue(data);
    vi.mocked(deletePlanningAbsence).mockResolvedValue(30);
    vi.mocked(savePlanningAbsence).mockResolvedValue(32);
    vi.mocked(reviewPlanningAbsence).mockResolvedValue(31);
    vi.mocked(ensurePlanningConflictCase).mockResolvedValue(40);
    vi.mocked(updatePlanningConflictCase).mockResolvedValue(40);
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockImplementation(async (_client, personId) => ({
      kind: 'crew', person: overview.people.find((person) => person.id === personId)!, counterPeriods: [],
      absences: data.absences.filter((absence) => absence.personId === personId), crewCheckpoints: [],
      crewSources: {
        assignments: overview.assignments.filter((assignment) => assignment.crewPersonId === personId),
        periods: overview.periods.filter((period) => period.personId === personId),
        days: overview.days.filter((day) => day.personId === personId),
      },
    }));
    vi.mocked(savePlanningLeaveCounterPeriod).mockResolvedValue(undefined);
    vi.mocked(savePlanningLeaveRightsPeriod).mockResolvedValue(undefined);
  });

  it('keeps keyboard focus in the absence dialog and closes with Escape', async () => {
    const user = userEvent.setup();
    const props = renderPanel({ initialTab: 'absences' });
    await screen.findByText('Formation sécurité');
    const dialog = screen.getByRole('dialog', { name: 'Absences et conflits' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const close = within(dialog).getByRole('button', { name: 'Fermer' });
    close.focus();
    await user.tab({ shift: true });
    expect(within(dialog).getByRole('button', { name: 'Supprimer la demande de Paul DURAND' })).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('prevents dismissal and duplicate actions while an absence decision is saving', async () => {
    const user = userEvent.setup();
    let finishReview!: (id: number) => void;
    vi.mocked(reviewPlanningAbsence).mockReturnValue(new Promise((resolve) => { finishReview = resolve; }));
    const props = renderPanel({ initialTab: 'absences' });
    await screen.findByText('Formation sécurité');
    await user.click(screen.getByRole('button', { name: 'Refuser' }));
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Valider' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Actualiser les absences et conflits' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(props.onClose).not.toHaveBeenCalled();
    finishReview(31);
    expect(await screen.findByText('Demande refusée.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeEnabled();
  });

  it('creates and approves absence requests while showing assignment impacts', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('heading', { name: 'Congés validés' });
    expect(screen.queryByRole('option', { name: 'Dérogation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nouvelle dérogation' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Absences/ }));
    const approvedCard = screen.getByText('Anne MARTIN').closest('article')!;
    expect(approvedCard).toHaveTextContent(/1\s*affectation\(s\) concernée\(s\) · 1 poste\(s\) vacant\(s\)/);
    await user.click(screen.getByRole('button', { name: 'Nouvelle demande' }));
    const form = screen.getByRole('button', { name: 'Envoyer la demande' }).closest('form')!;
    await user.selectOptions(within(form).getByLabelText('Marin'), '11');
    await user.type(within(form).getByLabelText('Motif'), 'Récupération planifiée');
    await user.click(within(form).getByRole('button', { name: 'Envoyer la demande' }));
    await waitFor(() => expect(savePlanningAbsence).toHaveBeenCalledWith(client, expect.objectContaining({ personId: 11, reason: 'Récupération planifiée' })));
    await user.click(screen.getByRole('button', { name: 'Valider' }));
    await waitFor(() => expect(reviewPlanningAbsence).toHaveBeenCalledWith(client, 31, 'approve', ''));
  });

  it('keeps conflict treatment and replacement selection manual', async () => {
    const user = userEvent.setup();
    const onPrepareReplacement = vi.fn();
    renderPanel({ onPrepareReplacement });
    await screen.findByRole('heading', { name: 'Congés validés' });
    await user.selectOptions(screen.getByLabelText('Priorité'), 'high');
    await user.selectOptions(screen.getByLabelText('Statut'), 'in_progress');
    await user.type(screen.getByLabelText('Commentaire'), 'Recherche en cours');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le traitement' }));
    await waitFor(() => expect(ensurePlanningConflictCase).toHaveBeenCalledWith(client, expect.objectContaining({ type: 'absence', assignmentId: 20 })));
    expect(updatePlanningConflictCase).toHaveBeenCalledWith(client, expect.objectContaining({ caseId: 40, priority: 'high', status: 'in_progress', assignToMe: true }));

    await user.click(screen.getByRole('button', { name: 'Rechercher un remplaçant' }));
    const candidate = await screen.findByText('Paul DURAND');
    const card = candidate.closest('article')!;
    expect(within(card).getByText('Compatible')).toBeInTheDocument();
    expect(onPrepareReplacement).not.toHaveBeenCalled();
    await user.click(within(card).getByRole('button', { name: 'Préparer l’affectation manuelle' }));
    expect(onPrepareReplacement).toHaveBeenCalledWith(expect.objectContaining({ id: 11 }), expect.objectContaining({ assignmentId: 20 }));
  });

  it('lets administrators permanently delete any absence after confirmation', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const props = renderPanel({ initialTab: 'absences' });

    await screen.findByText('Congés familiaux');
    await user.click(screen.getByRole('button', { name: 'Supprimer la demande de Anne MARTIN' }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Supprimer la demande « Congés » de Anne MARTIN'));
    await waitFor(() => expect(deletePlanningAbsence).toHaveBeenCalledWith(client, 30));
    expect(props.onAuditChange).toHaveBeenCalled();
    expect(await screen.findByText('Demande supprimée. Les impacts ont été recalculés.')).toBeInTheDocument();
  });

  it('keeps leave when the administrator cancels confirmation', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPanel({ initialTab: 'absences' });

    await screen.findByText('Congés familiaux');
    await user.click(screen.getByRole('button', { name: 'Supprimer la demande de Anne MARTIN' }));

    expect(deletePlanningAbsence).not.toHaveBeenCalled();
  });

  it('does not expose absence deletion to non-administrators', async () => {
    renderPanel({ canDeleteAbsences: false, initialTab: 'absences' });
    await screen.findByText('Congés familiaux');
    expect(screen.queryByRole('button', { name: /Supprimer la demande/ })).not.toBeInTheDocument();
  });

  it('shows plural RTT decision labels and preserves the type and correct balances when a request is edited', async () => {
    vi.mocked(fetchPlanningP12Data).mockResolvedValue(rttData);
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockResolvedValue(staffBalances());
    const user = userEvent.setup();
    const props = renderPanel({ overview: staffOverview, initialTab: 'absences' });
    await screen.findByText('RTT de rentrée');
    for (const [request, status] of rttRequests.map((request, index) => [request, ['Demandés', 'Validés', 'Refusés', 'Annulés'][index]] as const)) {
      const card = screen.getByText(request.reason).closest('article')!;
      expect(within(card).getByText(status)).toBeVisible();
      expect(within(card).getByText(/^RTT ·/)).toBeVisible();
    }
    const requestedCard = screen.getByText('RTT de rentrée').closest('article')!;
    await user.click(within(requestedCard).getByRole('button', { name: 'Modifier' }));
    const form = screen.getByRole('button', { name: 'Mettre à jour' }).closest('form')!;
    expect(within(form).getByLabelText('Marin')).toHaveValue('11');
    expect(within(form).getByLabelText('Type')).toHaveValue('rtt');
    expect(within(form).getByLabelText('Début')).toHaveValue('2026-08-03T08:00');
    expect(within(form).getByLabelText('Fin')).toHaveValue('2026-08-05T18:00');
    await screen.findByLabelText('Compteur RTT');
    expect(fetchPlanningAbsenceBalanceContext).toHaveBeenCalledWith(client, staffPerson.id);
    expect(balanceMetric('RTT', 'Droits')).toHaveTextContent('8 j');
    expect(balanceMetric('RTT', 'Jours validés')).toHaveTextContent('3 j');
    expect(balanceMetric('RTT', 'En attente')).toHaveTextContent('0 j');
    expect(balanceMetric('RTT', 'Solde disponible')).toHaveTextContent('5 j');
    expect(balanceMetric('RTT', 'Cette demande')).toHaveTextContent('3 j');
    expect(balanceMetric('RTT', 'Après validation')).toHaveTextContent('2 j');
    expect(balanceMetric('Congés', 'Solde disponible')).toHaveTextContent('25 j');
    fireEvent.change(within(form).getByLabelText('Fin'), { target: { value: '2026-08-04T18:00' } });
    await user.clear(within(form).getByLabelText('Motif'));
    await user.type(within(form).getByLabelText('Motif'), 'RTT réorganisés');
    expect(balanceMetric('RTT', 'Cette demande')).toHaveTextContent('2 j');
    expect(balanceMetric('RTT', 'Après validation')).toHaveTextContent('3 j');
    await user.click(within(form).getByRole('button', { name: 'Mettre à jour' }));
    await waitFor(() => expect(savePlanningAbsence).toHaveBeenCalledExactlyOnceWith(client, {
      id: 40, personId: 11, absenceType: 'rtt', startsAt: '2026-08-03T08:00', endsAt: '2026-08-04T18:00', reason: 'RTT réorganisés',
    }));
    expect(props.onAuditChange).toHaveBeenCalledOnce();
    expect(await screen.findByText('Demande d’absence enregistrée. Les impacts sont recalculés.')).toBeVisible();
    expect(savePlanningLeaveCounterPeriod).not.toHaveBeenCalled();
  });

  it('isolates the rights editor from the absence form and cancels only the rights edit on Escape', async () => {
    vi.mocked(fetchPlanningP12Data).mockResolvedValue(rttData);
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockResolvedValueOnce(staffBalances()).mockResolvedValueOnce(staffBalances(9.5));
    const user = userEvent.setup();
    const props = renderPanel({ overview: staffOverview, initialTab: 'absences', range: { start: '2026-08-03', end: '2026-08-31' } });
    await user.click(await screen.findByRole('button', { name: 'Nouvelle demande' }));
    const form = screen.getByRole('button', { name: 'Envoyer la demande' }).closest('form')!;
    await user.selectOptions(within(form).getByLabelText('Marin'), '11');
    await user.selectOptions(within(form).getByLabelText('Type'), 'rtt');
    await user.type(within(form).getByLabelText('Motif'), 'RTT à conserver');
    await user.click(await screen.findByRole('button', { name: 'Périodes de Droits Congés' }));
    const editor = screen.getByRole('dialog', { name: 'Périodes de Droits Congés' });
    expect(editor.closest('form')).toBeNull();
    expect(editor.querySelector('form')).not.toBeNull();
    expect(form).not.toContainElement(editor);
    expect(form.querySelector('form')).toBeNull();
    expect(within(screen.getByRole('dialog', { name: 'Absences et conflits' })).getAllByRole('button', { name: 'Fermer' })[0]).toBeDisabled();
    for (const tab of screen.getAllByRole('tab')) expect(tab).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Actualiser les absences et conflits' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Nouvelle demande' })).toBeDisabled();
    const requestedCard = screen.getByText('RTT de rentrée').closest('article')!;
    for (const action of ['Modifier', 'Valider', 'Refuser', 'Annuler la demande']) {
      expect(within(requestedCard).getByRole('button', { name: action })).toBeDisabled();
    }
    for (const deletion of screen.getAllByRole('button', { name: 'Supprimer la demande de Sophie HAMEL' })) expect(deletion).toBeDisabled();
    expect(within(form).getByLabelText('Marin')).toBeDisabled();
    expect(within(form).getByLabelText('Type')).toBeDisabled();
    expect(within(form).getByLabelText('Début')).toBeDisabled();
    expect(within(form).getByLabelText('Fin')).toBeDisabled();
    expect(within(form).getByLabelText('Motif')).toBeDisabled();
    expect(within(form).getByRole('button', { name: 'Envoyer la demande' })).toBeDisabled();
    const amount = within(editor).getByLabelText('Total RTT (jours)');
    await user.clear(amount);
    await user.type(amount, '9,5');
    // An external submit event must also honor the parent form's edit guard.
    fireEvent.submit(form);
    expect(savePlanningAbsence).not.toHaveBeenCalled();
    expect(savePlanningLeaveCounterPeriod).not.toHaveBeenCalled();
    expect(savePlanningLeaveRightsPeriod).not.toHaveBeenCalled();
    expect(amount).toHaveValue('9,5');
    expect(editor).toBeVisible();
    await user.keyboard('{Escape}');
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Périodes de Droits Congés' })).not.toBeInTheDocument();
    for (const tab of screen.getAllByRole('tab')) expect(tab).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Actualiser les absences et conflits' })).toBeEnabled();
    expect(within(requestedCard).getByRole('button', { name: 'Modifier' })).toBeEnabled();
    expect(within(form).getByRole('button', { name: 'Envoyer la demande' })).toBeEnabled();
    expect(within(form).getByLabelText('Marin')).toHaveValue('11');
    expect(within(form).getByLabelText('Type')).toHaveValue('rtt');
    expect(within(form).getByLabelText('Motif')).toHaveValue('RTT à conserver');
    expect(balanceMetric('RTT', 'Droits')).toHaveTextContent('8 j');
    await user.click(screen.getByRole('button', { name: 'Périodes de Droits Congés' }));
    const nextEditor = screen.getByRole('dialog', { name: 'Périodes de Droits Congés' });
    await user.clear(within(nextEditor).getByLabelText('Total RTT (jours)'));
    await user.type(within(nextEditor).getByLabelText('Total RTT (jours)'), '9,5');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(balanceMetric('RTT', 'Droits')).toHaveTextContent('9,5 j'));
    expect(savePlanningLeaveRightsPeriod).toHaveBeenCalledExactlyOnceWith(client, {
      personId: 11, startsOn: '2026-06-01', endsOn: '2027-05-31', leaveEntitlement: 25, rttEntitlement: 9.5,
    });
    expect(savePlanningAbsence).not.toHaveBeenCalled();
    expect(props.onAuditChange).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(savePlanningLeaveCounterPeriod).not.toHaveBeenCalled();
    expect(nextEditor).toBeVisible();
    expect(within(nextEditor).getByRole('status')).toHaveTextContent(/Droits enregistrés/);
    expect(within(form).getByRole('button', { name: 'Envoyer la demande' })).toBeDisabled();
    await user.click(within(nextEditor).getByRole('button', { name: 'Fermer la fenêtre' }));
    await user.click(within(form).getByRole('button', { name: 'Envoyer la demande' }));
    await waitFor(() => expect(savePlanningAbsence).toHaveBeenCalledExactlyOnceWith(client, {
      id: undefined, personId: 11, absenceType: 'rtt', startsAt: '2026-08-03T08:00', endsAt: '2026-08-03T18:00', reason: 'RTT à conserver',
    }));
  });
});
