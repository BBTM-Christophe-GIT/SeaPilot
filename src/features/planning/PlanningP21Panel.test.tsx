import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanningP21Panel } from './PlanningP21Panel';
import type { PlanningAssistantData } from './planningP21';
import type { PlanningOverview } from './planningQueries';
import {
  fetchPlanningAssistantData,
  fetchPlanningAssistantPilots,
  fetchPlanningAssistantReviews,
  recordPlanningAssistantReview,
  setPlanningAssistantPilot,
} from './planningP21Queries';
import { EMPTY_PLANNING_OVERVIEW } from './usePlanningOverview';

vi.mock('./planningP21Queries', () => ({
  fetchPlanningAssistantData: vi.fn(), fetchPlanningAssistantPilots: vi.fn(), fetchPlanningAssistantReviews: vi.fn(),
  recordPlanningAssistantReview: vi.fn(), setPlanningAssistantPilot: vi.fn(),
}));

const client = {} as SupabaseClient;
const overview: PlanningOverview = {
  ...EMPTY_PLANNING_OVERVIEW,
  history: [{ id: 1, entityKind: 'assignment', entityId: 1, action: 'update', payload: {}, changedBy: 'user', changedByName: 'Bureau', changedAt: '2026-08-03T10:00:00Z', vesselId: null, startsOn: '2026-08-01', endsOn: '2026-08-02', summary: 'Affectation modifiée' }],
};
const data: PlanningAssistantData = {
  p13: { policies: [], notifications: [], dependencies: [], p12: { absences: [], conflictCases: [], conflictHistory: [], matrices: [] } },
  reviews: [],
  pilots: [{ pilotId: null, userId: '00000000-0000-0000-0000-000000000001', displayName: 'Marie Bureau', email: 'marie@example.com', roleKeys: ['armement'], enabled: false, validUntil: '', reason: 'Accès pilote bureau', updatedAt: '' }],
};
const access = { hasAccess: true, accessMode: 'administrator' as const, expiresOn: '', canManagePilots: true };

function renderPanel() {
  const props: React.ComponentProps<typeof PlanningP21Panel> = { client, overview, range: { start: '2026-08-01', end: '2026-08-31' }, access, onClose: vi.fn(), onAuditChange: vi.fn().mockResolvedValue(undefined) };
  render(<PlanningP21Panel {...props} />);
  return props;
}

describe('Planning P2.1 assistant panel', () => {
  beforeEach(() => {
    vi.mocked(fetchPlanningAssistantData).mockResolvedValue(data);
    vi.mocked(fetchPlanningAssistantReviews).mockResolvedValue([{ id: 5, suggestionKey: 'change-summary:2026-08-01:2026-08-31', suggestionType: 'change_summary', decision: 'accepted', comment: 'Résumé validé', vesselId: null, personId: null, generatedForStart: '2026-08-01', generatedForEnd: '2026-08-31', reviewedBy: 'user', reviewedByName: 'Admin', reviewedAt: '2026-08-04T10:00:00Z' }]);
    vi.mocked(fetchPlanningAssistantPilots).mockResolvedValue([{ ...data.pilots[0], pilotId: 3, enabled: true }]);
    vi.mocked(recordPlanningAssistantReview).mockResolvedValue(5);
    vi.mocked(setPlanningAssistantPilot).mockResolvedValue(3);
  });

  it('renders guardrails and every required explanation section', async () => {
    const user = userEvent.setup();
    renderPanel();
    expect(await screen.findByRole('heading', { name: 'Assistant Planning P2.1' })).toBeInTheDocument();
    expect(screen.getByText('Aucune décision automatique.')).toBeInTheDocument();
    await user.click(screen.getByText('Afficher les critères, données et règles'));
    for (const heading of ['Critères utilisés', 'Données vérifiées', 'Règles appliquées', 'Conflits détectés', 'Données non disponibles', 'Étapes suggérées']) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    expect(screen.getByText(/Confiance Élevée/)).toBeInTheDocument();
  });

  it('journals acceptance without applying any Planning mutation', async () => {
    const user = userEvent.setup();
    const props = renderPanel();
    await screen.findByRole('heading', { name: 'Résumé des modifications', level: 3 });
    await user.type(screen.getByLabelText('Commentaire humain'), 'Décision validée par le bureau');
    await user.click(screen.getByRole('button', { name: 'Accepter sans appliquer' }));
    await waitFor(() => expect(recordPlanningAssistantReview).toHaveBeenCalledWith(client, expect.objectContaining({ decision: 'accepted', comment: 'Décision validée par le bureau' })));
    expect(await screen.findByText(/Aucun changement Planning n’a été appliqué/)).toBeInTheDocument();
    expect(props.onAuditChange).toHaveBeenCalledTimes(1);
  });

  it('lets administrators activate only an eligible office pilot through the server RPC', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('heading', { name: 'Résumé des modifications', level: 3 });
    await user.click(screen.getByRole('button', { name: 'Accès pilote' }));
    const pilotCard = screen.getByText('Marie Bureau').closest('article')!;
    expect(within(pilotCard).getByText('Non autorisé')).toBeInTheDocument();
    await user.click(within(pilotCard).getByRole('button', { name: 'Activer le pilote' }));
    await waitFor(() => expect(setPlanningAssistantPilot).toHaveBeenCalledWith(client, expect.objectContaining({ userId: data.pilots[0].userId, enabled: true, reason: 'Accès pilote bureau' })));
  });
});
