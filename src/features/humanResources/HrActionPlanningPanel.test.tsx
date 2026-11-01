import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrActionPlanningPanel } from './HrActionPlanningPanel';
import { fetchHrActions, fetchHrReviewAppointments, saveHrAction } from './hrActionPlanning';

vi.mock('./hrActionPlanning', async () => {
  const actual = await vi.importActual<typeof import('./hrActionPlanning')>('./hrActionPlanning');
  return { ...actual, fetchHrActions: vi.fn(), fetchHrReviewAppointments: vi.fn(), saveHrAction: vi.fn() };
});
const client = {} as SupabaseClient;

beforeEach(() => {
  vi.mocked(fetchHrActions).mockReset().mockResolvedValue([]);
  vi.mocked(fetchHrReviewAppointments).mockReset().mockResolvedValue([]);
  vi.mocked(saveHrAction).mockReset();
});

describe('RH action planning panel', () => {
  it('saves date, place and responsible, then shows the shared appointment', async () => {
    const onChange = vi.fn();
    render(<HrActionPlanningPanel client={client} personId={2} personName="Pierre" canEdit onChange={onChange} />);
    await screen.findByText('Aucun rendez-vous renseigné');
    fireEvent.click(screen.getByRole('button', { name: 'Planifier une action' }));
    fireEvent.change(screen.getByLabelText('Intitulé'), { target: { value: 'Formation sécurité' } });
    fireEvent.change(screen.getByLabelText('Date du rendez-vous'), { target: { value: '2026-12-10' } });
    fireEvent.change(screen.getByLabelText('Lieu / organisme'), { target: { value: 'CEPS Le Havre' } });
    fireEvent.change(screen.getByLabelText('Responsable du suivi'), { target: { value: 'Claire' } });
    vi.mocked(saveHrAction).mockImplementation(async (_client, input) => ({ ...input, id: 4 }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et partager' }));
    await screen.findByText('Action enregistrée et partagée avec l’équipe autorisée.');
    expect(saveHrAction).toHaveBeenCalledWith(client, expect.objectContaining({ personId: 2, scheduledOn: '2026-12-10', location: 'CEPS Le Havre', ownerName: 'Claire' }), undefined);
    expect(screen.getByText('Formation sécurité')).toBeVisible();
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('allows a restricted profile to read existing appointments without editing controls', async () => {
    vi.mocked(fetchHrActions).mockResolvedValue([{ id: 5, personId: 2, documentId: null, kind: 'medical_visit', title: 'Visite annuelle',
      status: 'planned', dueOn: '', scheduledOn: '2026-12-10', completedOn: '', location: 'Le Havre', ownerName: '', notes: '' }]);
    render(<HrActionPlanningPanel client={client} personId={2} personName="Pierre" canEdit={false} />);
    await screen.findByText('Visite annuelle');
    expect(screen.queryByRole('button', { name: 'Planifier une action' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Modifier l’action/ })).not.toBeInTheDocument();
  });

  it('shows actual interview evidence and uses the existing module as source of truth', async () => {
    vi.mocked(fetchHrReviewAppointments).mockResolvedValue([
      { id: 1, year: 2026, status: 'awaiting_signature', startsAt: '2026-09-17T12:00:00Z', location: 'Bureau', managerValidatedAt: '2026-09-28T16:50:00Z' },
      { id: 2, year: 2025, status: 'collaborator_submitted', startsAt: '2026-11-03T08:00:00Z', location: 'A bord du GOURY', managerValidatedAt: '' },
    ]);
    render(<HrActionPlanningPanel client={client} personId={2} personName="Pierre" canEdit />);
    expect(await screen.findByText('Réalisé · signature attendue')).toBeVisible();
    expect(screen.getByText('Planifié')).toBeVisible();
    expect(screen.getAllByRole('link', { name: /Ouvrir l’entretien/ })[0]).toHaveAttribute('href', '/modules/annualReviews?review=1');
    fireEvent.click(screen.getByRole('button', { name: 'Planifier une action' }));
    expect(screen.queryByRole('option', { name: 'Entretien annuel' })).not.toBeInTheDocument();
  });

  it('keeps failed saves editable and never claims that they are shared', async () => {
    render(<HrActionPlanningPanel client={client} personId={2} personName="Pierre" canEdit />);
    await screen.findByText('Aucun rendez-vous renseigné');
    fireEvent.click(screen.getByRole('button', { name: 'Planifier une action' }));
    fireEvent.change(screen.getByLabelText('Intitulé'), { target: { value: 'Formation' } });
    fireEvent.change(screen.getByLabelText('Date du rendez-vous'), { target: { value: '2026-12-10' } });
    fireEvent.change(screen.getByLabelText('Lieu / organisme'), { target: { value: 'Le Havre' } });
    vi.mocked(saveHrAction).mockRejectedValue(new Error('denied'));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et partager' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('L’action n’a pas été enregistrée.');
    expect(screen.getByLabelText('Intitulé')).toHaveValue('Formation');
    expect(screen.queryByText('Action enregistrée et partagée avec l’équipe autorisée.')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer et partager' })).toBeEnabled());
  });
});
