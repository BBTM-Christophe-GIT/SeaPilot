import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkPermitsPage } from './WorkPermitsPage';
import type { WorkPermit } from './workPermitQueries';

const queries = vi.hoisted(() => ({
  loadWorkPermits: vi.fn(),
  saveWorkPermit: vi.fn(),
  transitionWorkPermit: vi.fn(),
}));
vi.mock('./workPermitQueries', () => queries);

const location = { id: 11, name: 'GOURY', asset_kind: 'vessel', can_sign: false };
const permit: WorkPermit = {
  id: 'permit', vessel_id: 11, status: 'open', title: 'Intervention à bord', permit_type: 'point-chaud',
  zone: 'Salle de travail', plan_key: 'pont-principal', point_x: .3, point_y: .4, exclusion_zones: [],
  starts_at: '2024-06-14T08:00:00Z', ends_at: null, paused_at: null, paused_seconds: 0, pause_history: [],
  checklist_answers: {}, closing_answers: {}, captain_signed_at: '2024-06-14T07:55:00Z',
  captain_signer_name: 'Capitaine Essai', closed_at: null, updated_at: '2024-06-14T07:55:00Z',
};

function setup() {
  return render(<MemoryRouter><Routes>
    <Route element={<Outlet context={{ client: {} }} />}><Route index element={<WorkPermitsPage />} /></Route>
  </Routes></MemoryRouter>);
}

describe('registre opérationnel des permis de travaux', () => {
  beforeEach(() => vi.resetAllMocks());

  it('conserve en frise un permis ancien et met à jour les actions après une pause', async () => {
    queries.loadWorkPermits.mockResolvedValueOnce({ locations: [location], permits: [permit] })
      .mockResolvedValueOnce({ locations: [location], permits: [{ ...permit, status: 'paused', paused_at: '2024-06-14T09:10:00Z' }] });
    setup();
    const timeline = await screen.findByRole('region', { name: /permis ouverts/i });
    fireEvent.click(within(timeline).getByRole('button', { name: /intervention à bord/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Mettre en pause' }));
    expect(await screen.findByRole('button', { name: 'Reprendre les travaux' })).toBeInTheDocument();
    expect(queries.transitionWorkPermit).toHaveBeenCalledWith(expect.anything(), permit, 'pause');
    expect(within(timeline).getByText('En pause')).toBeInTheDocument();
  });

  it('trace plusieurs zones sur des plans différents et permet de retirer le repère seul', async () => {
    queries.loadWorkPermits.mockResolvedValue({ locations: [location], permits: [permit] });
    queries.saveWorkPermit.mockResolvedValue(permit);
    setup();
    const map = await screen.findByRole('region', { name: 'Plan des travaux' });
    fireEvent.click(within(map).getByRole('button', { name: permit.title }));
    fireEvent.click(screen.getByRole('button', { name: 'Modifier la fiche et le plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le repère' }));
    function drawTriangle() {
      fireEvent.click(screen.getByRole('button', { name: 'Dessiner une zone d’exclusion' }));
      for (const [x, y] of [[20, 20], [35, 25], [30, 40]]) {
        fireEvent.change(screen.getByLabelText('Horizontal (%)'), { target: { value: x } });
        fireEvent.change(screen.getByLabelText('Vertical (%)'), { target: { value: y } });
        fireEvent.click(screen.getByRole('button', { name: 'Ajouter le sommet' }));
      }
      fireEvent.click(screen.getByRole('button', { name: 'Fermer la zone' }));
    }
    drawTriangle();
    fireEvent.change(screen.getByLabelText('Plan affiché'), { target: { value: 'pont-superieur' } });
    drawTriangle();
    expect(screen.getByText('2 zone(s) d’exclusion sur l’ensemble des plans')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le permis' }));
    expect(queries.saveWorkPermit).toHaveBeenCalledWith(expect.anything(), location.id, expect.objectContaining({
      point_x: null, point_y: null,
      exclusion_zones: [
        { planKey: 'pont-principal', points: expect.any(Array) },
        { planKey: 'pont-superieur', points: expect.any(Array) },
      ],
    }), permit);
    await screen.findByRole('region', { name: 'Permis sélectionné' });
  });
});
