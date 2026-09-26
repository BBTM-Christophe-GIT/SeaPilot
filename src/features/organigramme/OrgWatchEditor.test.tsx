import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { OrgWatchEditor } from './OrgWatchEditor';
import { ORG_DEMO } from './organigrammeFixtures';
import { orgLocalDate } from './organigrammeModel';

function setup(rpc = vi.fn().mockResolvedValue({ data: 9, error: null }), asOf = orgLocalDate()) {
  const saved = vi.fn();
  render(<OrgWatchEditor client={{ rpc } as unknown as SupabaseClient} data={{ ...ORG_DEMO, asOf }} onSaved={saved} previewMode={false} disabled={false} />);
  return { rpc, saved };
}
describe('OrgWatchEditor', () => {
  it('composes a new watch independently from search results and keeps its saved id for subsequent edits', async () => {
    const { rpc, saved } = setup();
    fireEvent.change(screen.getByLabelText('Bordée à composer'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Nom de la bordée'), { target: { value: 'Renfort' } });
    fireEvent.click(screen.getByLabelText('Affecter Élodie MARTIN'));
    fireEvent.click(screen.getByLabelText('Affecter Louis BERNARD'));
    fireEvent.change(screen.getByLabelText('Fonction à bord de Louis BERNARD'), { target: { value: 'Chef Mécanicien' } });
    fireEvent.change(screen.getByLabelText('Rechercher dans les effectifs'), { target: { value: 'Élodie' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la bordée' }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith('save_organigramme_watch', { p_id: null, p_vessel_id: 1, p_name: 'Renfort', p_members: [{ personId: 2, functionLabel: '' }, { personId: 3, functionLabel: 'Chef Mécanicien' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la bordée' }));
    await waitFor(() => expect(rpc).toHaveBeenLastCalledWith('save_organigramme_watch', expect.objectContaining({ p_id: 9 })));
    expect(rpc.mock.calls.every(([name]) => name === 'save_organigramme_watch')).toBe(true);
  });
  it('keeps the draft after an error and permits an explicitly empty watch', async () => {
    const { rpc, saved } = setup(vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'denied' } }).mockResolvedValue({ data: 1, error: null }));
    fireEvent.click(screen.getByRole('button', { name: 'Vider la sélection' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la bordée' }));
    await screen.findByRole('alert'); expect(saved).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nom de la bordée')).toHaveValue('Bordée 1');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la bordée' }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(rpc).toHaveBeenLastCalledWith('save_organigramme_watch', expect.objectContaining({ p_members: [] }));
  });
  it('does not edit current compositions from a historical personnel snapshot', () => {
    setup(undefined, '2000-01-01');
    expect(screen.getByRole('button', { name: 'Enregistrer la bordée' })).toBeDisabled();
    expect(screen.getByLabelText('Affecter Élodie MARTIN')).toBeDisabled();
  });
});
