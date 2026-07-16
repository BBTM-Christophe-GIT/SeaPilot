import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanningP12Panel } from './PlanningP12Panel';
import type { PlanningOverview } from './planningQueries';
import {
  deletePlanningLeave,
  ensurePlanningConflictCase,
  fetchPlanningP12Data,
  reviewPlanningAbsence,
  savePlanningAbsence,
  updatePlanningConflictCase,
} from './planningP12Queries';
import { EMPTY_PLANNING_OVERVIEW } from './usePlanningOverview';

vi.mock('./planningP12Queries', () => ({
  deletePlanningLeave: vi.fn(),
  ensurePlanningConflictCase: vi.fn(),
  fetchPlanningP12Data: vi.fn(),
  reviewPlanningAbsence: vi.fn(),
  savePlanningAbsence: vi.fn(),
  updatePlanningConflictCase: vi.fn(),
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

function renderPanel(overrides: Partial<React.ComponentProps<typeof PlanningP12Panel>> = {}) {
  const props: React.ComponentProps<typeof PlanningP12Panel> = {
    client,
    overview,
    range: { start: '2026-08-01', end: '2026-08-31' },
    canRequestAbsences: true,
    canReviewAbsences: true,
    canDeleteLeaves: true,
    canManageConflictCases: true,
    canPrepareReplacements: true,
    canManageDerogations: true,
    onClose: vi.fn(),
    onPrepareReplacement: vi.fn(),
    onOpenSource: vi.fn(),
    onCreateDerogation: vi.fn(),
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
    vi.mocked(deletePlanningLeave).mockResolvedValue(30);
    vi.mocked(savePlanningAbsence).mockResolvedValue(32);
    vi.mocked(reviewPlanningAbsence).mockResolvedValue(31);
    vi.mocked(ensurePlanningConflictCase).mockResolvedValue(40);
    vi.mocked(updatePlanningConflictCase).mockResolvedValue(40);
  });

  it('creates and approves absence requests while showing assignment impacts', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('heading', { name: 'Congés validés' });
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

  it('lets administrators permanently delete leave after confirmation', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const props = renderPanel({ initialTab: 'absences' });

    await screen.findByText('Congés familiaux');
    await user.click(screen.getByRole('button', { name: 'Supprimer les congés de Anne MARTIN' }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Supprimer les congés de Anne MARTIN'));
    await waitFor(() => expect(deletePlanningLeave).toHaveBeenCalledWith(client, 30));
    expect(props.onAuditChange).toHaveBeenCalled();
    expect(await screen.findByText('Congés supprimés. Les impacts ont été recalculés.')).toBeInTheDocument();
  });

  it('keeps leave when the administrator cancels confirmation', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPanel({ initialTab: 'absences' });

    await screen.findByText('Congés familiaux');
    await user.click(screen.getByRole('button', { name: 'Supprimer les congés de Anne MARTIN' }));

    expect(deletePlanningLeave).not.toHaveBeenCalled();
  });

  it('does not expose leave deletion to non-administrators', async () => {
    renderPanel({ canDeleteLeaves: false, initialTab: 'absences' });
    await screen.findByText('Congés familiaux');
    expect(screen.queryByRole('button', { name: /Supprimer les congés/ })).not.toBeInTheDocument();
  });
});
