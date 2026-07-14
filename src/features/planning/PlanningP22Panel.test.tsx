import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanningP22Panel } from './PlanningP22Panel';
import type { PlanningP13Data } from './planningP13';
import { fetchPlanningP13Data } from './planningP13Queries';
import type { PlanningOverview } from './planningQueries';
import { EMPTY_PLANNING_OVERVIEW } from './usePlanningOverview';

vi.mock('./planningP13Queries', () => ({ fetchPlanningP13Data: vi.fn() }));

const client = {} as SupabaseClient;
const range = { start: '2026-08-01', end: '2026-08-31' };
const access = { hasAccess: true, accessMode: 'administrator' as const, expiresOn: '', canManagePilots: true };
const overview: PlanningOverview = {
  ...EMPTY_PLANNING_OVERVIEW,
  vessels: [{ id: 10, name: 'COTENTIN', acronym: 'CTN', active: true }, { id: 11, name: 'SUROÎT', acronym: 'SRT', active: true }],
  people: [{ id: 1, firstName: 'Alice', lastName: 'MARTIN', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', active: true }],
  assignments: [{ id: 1, vesselId: 10, vesselName: 'COTENTIN', captainPersonId: null, captainName: '', crewPersonId: 1, crewName: 'Alice MARTIN', startsOn: '2026-08-02', endsOn: '2026-08-10', startsAt: '', endsAt: '', assignmentRole: 'Capitaine', statusLabel: 'Embarqué', confirmationStatus: 'confirmed', watchGroup: 'A', comments: '', sourceLabel: 'test' }],
  projects: [
    { id: 20, title: 'Campagne A', startsOn: '2026-08-01', endsOn: '2026-08-05', description: '', clientName: '', primaryVesselId: 10, primaryVesselName: 'COTENTIN', secondaryVesselId: null, secondaryVesselName: '', eventType: 'operation', responsibleName: '', status: 'Confirmé', sourceLabel: 'test' },
    { id: 21, title: 'Maintenance', startsOn: '2026-08-04', endsOn: '2026-08-06', description: '', clientName: '', primaryVesselId: 10, primaryVesselName: 'COTENTIN', secondaryVesselId: null, secondaryVesselName: '', eventType: 'maintenance', responsibleName: '', status: 'Confirmé', sourceLabel: 'test' },
  ],
};
const data: PlanningP13Data = { policies: [], notifications: [], dependencies: [], p12: { absences: [], conflictCases: [], conflictHistory: [], matrices: [] } };

function renderPanel() {
  const props: React.ComponentProps<typeof PlanningP22Panel> = { client, overview, range, access, onClose: vi.fn() };
  render(<PlanningP22Panel {...props} />);
  return props;
}

describe('Planning P2.2 projections panel', () => {
  beforeEach(() => vi.mocked(fetchPlanningP13Data).mockResolvedValue(data));

  it('renders bounded projections and separates the quality gate', async () => {
    const user = userEvent.setup();
    renderPanel();
    expect(await screen.findByRole('heading', { name: 'Prévisions et scénarios P2.2' })).toBeInTheDocument();
    expect(screen.getByText('Modèles bornés aux données fiables.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Charge planifiée par navire' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Qualité des données' }));
    expect(screen.getByRole('heading', { name: 'Contrôles de qualité' })).toBeInTheDocument();
    const underStaffing = screen.getByText('Prévision des sous-effectifs').closest('article')!;
    expect(within(underStaffing).getByText('Insuffisant')).toBeInTheDocument();
    expect(within(underStaffing).getByText(/matrice/i)).toBeInTheDocument();
  });

  it('compares an absence scenario without exposing an apply action', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('heading', { name: 'Charge planifiée par navire' });
    await user.click(screen.getByRole('button', { name: 'Scénarios' }));
    expect(screen.getByRole('heading', { name: 'Simulation d’absence · Alice MARTIN' })).toBeInTheDocument();
    expect(screen.getByText('Faits observés')).toBeInTheDocument();
    expect(screen.getByText('Règles appliquées')).toBeInTheDocument();
    expect(screen.getByText('Estimations')).toBeInTheDocument();
    expect(screen.getByText('Hypothèses')).toBeInTheDocument();
    expect(screen.getByText('Limites')).toBeInTheDocument();
    expect(screen.getByText('Aucun plan n’a été appliqué.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /appliquer/i })).not.toBeInTheDocument();
  });

  it('switches to a vessel immobilisation and lists integration limits', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('heading', { name: 'Charge planifiée par navire' });
    await user.click(screen.getByRole('button', { name: 'Scénarios' }));
    await user.selectOptions(screen.getByLabelText('Type de scénario'), 'vessel_unavailability');
    expect(screen.getByRole('heading', { name: 'Simulation d’immobilisation · COTENTIN' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Intégrations' }));
    expect(screen.getByRole('heading', { name: 'Calendrier sortant' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hors connexion persistant' })).toBeInTheDocument();
    expect(screen.getByText(/Aucun abonnement bidirectionnel/)).toBeInTheDocument();
  });
});
