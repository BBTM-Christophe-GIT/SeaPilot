import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PersonalPlanningCalendar } from './PersonalPlanningCalendar';
import * as queries from './personalCalendarQueries';

vi.mock('./personalCalendarQueries', () => ({
  fetchPlanningCalendarSubscription: vi.fn(),
  createPlanningCalendarSubscription: vi.fn(),
  revokePlanningCalendarSubscription: vi.fn(),
}));

const client = {} as never;
const url = `https://example.supabase.co/functions/v1/planning-calendar/${'a'.repeat(64)}/planning.ics`;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(queries.fetchPlanningCalendarSubscription).mockResolvedValue({ active: false, eligible: true, created_at: null });
  vi.mocked(queries.createPlanningCalendarSubscription).mockResolvedValue({ url, createdAt: '2026-10-11T00:00:00Z' });
  vi.mocked(queries.revokePlanningCalendarSubscription).mockResolvedValue(undefined);
});

function renderDialog(previewMode = false) {
  return render(<PersonalPlanningCalendar client={client} isOpen onClose={vi.fn()} previewMode={previewMode} />);
}

describe('PersonalPlanningCalendar', () => {
  it('creates a link only on request, retains it when reopened, and copies it', async () => {
    const user = userEvent.setup();
    const view = renderDialog();
    await screen.findByRole('button', { name: 'Créer mon lien d’abonnement' });
    expect(queries.createPlanningCalendarSubscription).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Créer mon lien d’abonnement' }));
    expect(await screen.findByLabelText('Lien personnel d’abonnement')).toHaveValue(url);
    await user.click(screen.getByRole('button', { name: 'Copier le lien d’abonnement' }));
    expect(await navigator.clipboard.readText()).toBe(url);
    vi.mocked(queries.fetchPlanningCalendarSubscription).mockResolvedValue({ active: true, eligible: true, created_at: '2026-10-11T00:00:00Z' });
    view.rerender(<PersonalPlanningCalendar client={client} isOpen={false} onClose={vi.fn()} previewMode={false} />);
    view.rerender(<PersonalPlanningCalendar client={client} isOpen onClose={vi.fn()} previewMode={false} />);
    expect(await screen.findByLabelText('Lien personnel d’abonnement')).toHaveValue(url);
    expect(queries.createPlanningCalendarSubscription).toHaveBeenCalledTimes(1);
  });

  it('keeps an existing subscription active without requesting another download or replacement', async () => {
    vi.mocked(queries.fetchPlanningCalendarSubscription).mockResolvedValue({ active: true, eligible: true, created_at: '2026-10-11T00:00:00Z' });
    renderDialog();
    await screen.findByRole('button', { name: 'Remplacer le lien d’abonnement' });
    expect(screen.getByText(/vous n’avez rien à refaire/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Télécharger/ })).not.toBeInTheDocument();
    expect(queries.createPlanningCalendarSubscription).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation to replace or revoke an active subscription', async () => {
    const user = userEvent.setup();
    vi.mocked(queries.fetchPlanningCalendarSubscription).mockResolvedValue({ active: true, eligible: true, created_at: '2026-10-11T00:00:00Z' });
    renderDialog();
    await screen.findByRole('button', { name: 'Remplacer le lien d’abonnement' });
    await user.click(screen.getByRole('button', { name: 'Remplacer le lien d’abonnement' }));
    expect(queries.createPlanningCalendarSubscription).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirmer le remplacement' }));
    expect(await screen.findByLabelText('Lien personnel d’abonnement')).toHaveValue(url);
    await user.click(screen.getByRole('button', { name: 'Désactiver l’abonnement' }));
    expect(queries.revokePlanningCalendarSubscription).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirmer la désactivation' }));
    expect(await screen.findByText(/Abonnement désactivé/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Lien personnel d’abonnement')).not.toBeInTheDocument();
  });

  it('explains missing personnel access and prevents mutations in preview', async () => {
    vi.mocked(queries.fetchPlanningCalendarSubscription).mockResolvedValue({ active: false, eligible: false, created_at: null });
    const view = renderDialog();
    expect(await screen.findByText(/Ce compte doit être lié à une fiche/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer mon lien d’abonnement' })).toBeDisabled();
    view.unmount();
    vi.clearAllMocks();
    renderDialog(true);
    expect(screen.getByText(/La préversion utilise uniquement/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer mon lien d’abonnement' })).toBeDisabled();
    expect(queries.fetchPlanningCalendarSubscription).not.toHaveBeenCalled();
  });

  it('keeps actions unavailable if subscription access cannot be loaded', async () => {
    vi.mocked(queries.fetchPlanningCalendarSubscription).mockRejectedValue(new Error('Impossible de charger votre calendrier personnel. Réessayez.'));
    renderDialog();
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger');
    expect(screen.getByRole('button', { name: 'Créer mon lien d’abonnement' })).toBeDisabled();
    expect(queries.createPlanningCalendarSubscription).not.toHaveBeenCalled();
  });
});
