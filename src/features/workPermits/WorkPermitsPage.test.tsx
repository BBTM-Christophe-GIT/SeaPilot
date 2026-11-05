import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkPermitsPage } from './WorkPermitsPage';
import type { RoleKey } from '../permissions/roles';
import { workPermitChecklistById } from './workPermitChecklists';
import type { WorkPermit } from './workPermitQueries';

const queries = vi.hoisted(() => ({
  loadWorkPermits: vi.fn(),
  saveWorkPermit: vi.fn(),
  transitionWorkPermit: vi.fn(),
  deleteWorkPermit: vi.fn(),
}));
vi.mock('./workPermitQueries', () => queries);

const location = { id: 11, name: 'GOURY', asset_kind: 'vessel' as const, can_sign: false };
const permit: WorkPermit = {
  id: 'permit', vessel_id: 11, status: 'open', title: 'Intervention à bord', permit_type: 'point-chaud',
  zone: 'Salle de travail', plan_key: 'pont-principal', point_x: .3, point_y: .4, exclusion_zones: [],
  starts_at: '2024-06-14T08:00:00Z', ends_at: null, paused_at: null, paused_seconds: 0, pause_history: [],
  checklist_answers: {}, closing_answers: {}, captain_signed_at: '2024-06-14T07:55:00Z',
  captain_signer_name: 'Capitaine Essai', closed_at: null, updated_at: '2024-06-14T07:55:00Z',
};

function setup(role: RoleKey = 'marin') {
  return render(<MemoryRouter><Routes>
    <Route element={<Outlet context={{ client: {}, roles: [role] }} />}><Route index element={<WorkPermitsPage />} /></Route>
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

  it('présente les navires par longueur puis le site, et sélectionne le plan depuis le bandeau', async () => {
    const yard = { ...location, id: 14, name: 'YARD LE HAVRE', asset_kind: 'quay' as const };
    const longer = { ...location, id: 12, name: 'Navire long', length_overall: '45' };
    const unknown = { ...location, id: 13, name: 'Navire sans longueur' };
    queries.loadWorkPermits.mockResolvedValue({ locations: [yard, unknown, location, longer], permits: [] });
    setup();
    const strip = await screen.findByRole('group', { name: 'Filtrer par navire' });
    expect(within(strip).getAllByRole('button').map((button) => button.getAttribute('aria-label')))
      .toEqual(['Navire long', 'GOURY', 'Navire sans longueur', 'Yard - LE HAVRE']);
    fireEvent.click(within(strip).getByRole('button', { name: 'GOURY' }));
    const map = screen.getByRole('region', { name: 'Plan des travaux' });
    expect(within(map).getByRole('img', { name: 'Pont principal' })).toBeInTheDocument();
  });

  it('conserve le format des réponses et permet de retirer le choix actif', async () => {
    const model = workPermitChecklistById[permit.permit_type]!;
    const index = model.sections.findIndex((section) => section.phase === 'opening');
    const section = model.sections[index];
    const key = `${index}-0`;
    const record = { ...permit, checklist_answers: { [key]: 'Sans objet' } };
    queries.loadWorkPermits.mockResolvedValue({ locations: [location], permits: [record] });
    queries.saveWorkPermit.mockResolvedValue(record);
    setup();
    const map = await screen.findByRole('region', { name: 'Plan des travaux' });
    fireEvent.click(within(map).getByRole('button', { name: permit.title }));
    fireEvent.click(screen.getByRole('button', { name: 'Modifier la fiche et le plan' }));
    fireEvent.click(screen.getByText(section.title, { selector: 'summary' }));
    const group = screen.getByRole('group', { name: section.items[0] });
    const withoutObject = within(group).getByRole('button', { name: 'Sans objet' });
    expect(withoutObject).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(withoutObject);
    expect(withoutObject).toHaveAttribute('aria-pressed', 'false');
    const no = within(group).getByRole('button', { name: 'Non' });
    fireEvent.click(no);
    expect(no).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le permis' }));
    expect(queries.saveWorkPermit).toHaveBeenCalledWith(expect.anything(), location.id, expect.objectContaining({
      checklist_answers: { [key]: 'Non' },
    }), record);
    await screen.findByRole('region', { name: 'Permis sélectionné' });
  });

  it.each(['marin', 'capitaine', 'direction', 'armement'] as const)('masque la suppression pour le profil %s', async (role) => {
    queries.loadWorkPermits.mockResolvedValue({ locations: [location], permits: [permit] });
    setup(role);
    const timeline = await screen.findByRole('region', { name: /permis ouverts/i });
    fireEvent.click(within(timeline).getByRole('button', { name: /intervention à bord/i }));
    expect(screen.queryByRole('button', { name: 'Supprimer le permis' })).not.toBeInTheDocument();
  });

  it('confirme la suppression du permis par Administration avant d’actualiser la frise', async () => {
    queries.loadWorkPermits.mockResolvedValueOnce({ locations: [location], permits: [permit] })
      .mockResolvedValueOnce({ locations: [location], permits: [] });
    queries.deleteWorkPermit.mockResolvedValue(undefined);
    setup('admin');
    const timeline = await screen.findByRole('region', { name: /permis ouverts/i });
    fireEvent.click(within(timeline).getByRole('button', { name: /intervention à bord/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le permis' }));
    const confirmation = screen.getByRole('dialog');
    expect(queries.deleteWorkPermit).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Supprimer définitivement' }));
    expect(queries.deleteWorkPermit).toHaveBeenCalledWith(expect.anything(), permit);
    expect(await within(timeline).findByText('Aucun permis ouvert.')).toBeInTheDocument();
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
      expect(screen.getByText('Zone d’exclusion', { selector: '.work-permits-zone-label' })).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Horizontal (%)'), { target: { value: 20 } });
      fireEvent.change(screen.getByLabelText('Vertical (%)'), { target: { value: 42 } });
      fireEvent.click(screen.getByRole('button', { name: 'Ajouter le sommet' }));
      expect(screen.queryByRole('button', { name: 'Terminer le tracé' })).not.toBeInTheDocument();
    }
    drawTriangle();
    fireEvent.change(screen.getByLabelText('Plan affiché'), { target: { value: 'pont-superieur' } });
    drawTriangle();
    expect(screen.getByText('2 zone(s) d’exclusion sur l’ensemble des plans')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le permis' }));
    expect(queries.saveWorkPermit).toHaveBeenCalledWith(expect.anything(), location.id, expect.objectContaining({
      point_x: null, point_y: null,
      exclusion_zones: [
        { planKey: 'pont-principal', points: expect.arrayContaining([{ x: .2, y: .42 }]) },
        { planKey: 'pont-superieur', points: expect.arrayContaining([{ x: .2, y: .42 }]) },
      ],
    }), permit);
    await screen.findByRole('region', { name: 'Permis sélectionné' });
  });
});
