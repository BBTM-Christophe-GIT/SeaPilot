import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { OrganigrammePage } from './OrganigrammePage';
import { ORG_DEMO, ORG_LINKS_DEMO } from './organigrammeFixtures';
import type { RoleKey } from '../permissions/roles';

function setup(roles: RoleKey[] = ['direction'], rpc = vi.fn().mockResolvedValue({ data: ORG_DEMO, error: null })) {
  render(<MemoryRouter><Routes><Route element={<Outlet context={{ roles, client: { rpc }, previewMode: false }} />}><Route index element={<OrganigrammePage />} /></Route></Routes></MemoryRouter>);
  return rpc;
}
describe('OrganigrammePage', () => {
  it('keeps independent contact selections when switching documents and blocks their exports on refresh failure', async () => {
    const rpc = setup(); await screen.findByRole('img');
    fireEvent.click(screen.getByRole('button', { name: 'Liste du personnel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tout désélectionner' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Inclure Alice LAURENT' }));
    fireEvent.click(screen.getByRole('button', { name: 'Numéros d’urgence' }));
    expect(screen.getByRole('checkbox', { name: 'Inclure Camille DUMONT' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Inclure Alice LAURENT' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Organigramme' }));
    expect(screen.getByRole('img')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Liste du personnel' }));
    expect(screen.getByRole('checkbox', { name: 'Inclure Alice LAURENT' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Inclure Camille DUMONT' })).not.toBeChecked();
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'denied' } });
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Exporter le personnel en PDF' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Exporter les deux listes' })).toBeDisabled();
  });
  it('persists a renamed category and updates its controls and diagram after reloading', async () => {
    let data = ORG_LINKS_DEMO;
    const rpc = setup(['direction'], vi.fn().mockImplementation(async (name, args) => {
      if (name === 'save_organigramme_category') data = { ...data, categoryLabels: { external: args.p_label } };
      return { data, error: null };
    }));
    await screen.findByRole('img'); fireEvent.click(screen.getByRole('button', { name: 'Modifier la structure' }));
    fireEvent.change(screen.getByLabelText('Nouveau nom'), { target: { value: 'Partenaires' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le nom' }));
    await screen.findByRole('checkbox', { name: 'Partenaires' });
    expect(rpc).toHaveBeenCalledWith('save_organigramme_category', { p_key: 'external', p_label: 'Partenaires' });
    expect(decodeURIComponent(screen.getByRole('img').getAttribute('src')!)).toContain('Partenaires');
  });
  it.each([
    ['category', '', 'office'], ['group', 'vessel-1', '1-Bordée 1'], ['person', '', '2'],
  ])('saves a %s link with stable identity and displays it after refresh', async (kind, section, key) => {
    let data = ORG_DEMO;
    const rpc = setup(['admin'], vi.fn().mockImplementation(async (name, args) => {
      if (name === 'save_organigramme_link') data = { ...data, links: [{ id: 99, sourceCategory: args.p_source, targetKind: args.p_kind, targetKey: args.p_key, targetSection: args.p_section, label: args.p_label }] };
      return { data, error: null };
    }));
    await screen.findByRole('img'); fireEvent.click(screen.getByRole('button', { name: 'Modifier la structure' }));
    fireEvent.change(screen.getByLabelText('Type de cible'), { target: { value: kind } });
    fireEvent.change(screen.getByLabelText('Cible du lien'), { target: { value: JSON.stringify([kind, section, key]) } });
    fireEvent.change(screen.getByLabelText('Libellé du lien (facultatif)'), { target: { value: 'Accompagnement' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter le lien' }));
    await screen.findByRole('button', { name: /^Modifier le lien vers/ });
    expect(rpc).toHaveBeenCalledWith('save_organigramme_link', { p_id: null, p_source: 'external', p_kind: kind, p_key: key, p_section: section, p_label: 'Accompagnement' });
    expect(decodeURIComponent(screen.getByRole('img').getAttribute('src')!)).toContain('Accompagnement');
    fireEvent.click(screen.getByRole('button', { name: /^Modifier le lien vers/ }));
    fireEvent.change(screen.getByLabelText('Libellé du lien (facultatif)'), { target: { value: 'Conseil' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le lien' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('save_organigramme_link', expect.objectContaining({ p_id: 99, p_label: 'Conseil' })));
  });
  it('retains the draft and shows a save error without reporting success', async () => {
    setup(['direction'], vi.fn().mockImplementation(async (name) => name === 'organigramme_snapshot' ? { data: ORG_DEMO, error: null } : { data: null, error: { message: 'denied' } }));
    await screen.findByRole('img'); fireEvent.click(screen.getByRole('button', { name: 'Modifier la structure' }));
    fireEvent.change(screen.getByLabelText('Nouveau nom'), { target: { value: 'Partenaires' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le nom' }));
    await screen.findByRole('alert'); expect(screen.getByLabelText('Nouveau nom')).toHaveValue('Partenaires');
    expect(screen.queryByText('Nom de catégorie enregistré.')).not.toBeInTheDocument();
  });
  it.each(['armement', 'capitaine', 'marin'] as const)('never requests data for an actual %s role fixture', (role) => {
    const rpc = setup([role]); expect(screen.getByRole('alert')).toHaveTextContent('réservé'); expect(rpc).not.toHaveBeenCalled();
  });
  it('switches views and hides vessel names in the displayed export source', async () => {
    setup();
    await screen.findByRole('img', { name: 'Organigramme par navire et bordée' });
    fireEvent.click(screen.getByRole('button', { name: 'Par fonction' }));
    expect(screen.getByRole('img', { name: 'Organigramme par fonction' })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Afficher les navires'));
    const img = screen.getByRole('img', { name: 'Organigramme par fonction, sans navires' });
    expect(decodeURIComponent(img.getAttribute('src')!)).not.toContain('GOURY');
    expect(screen.getByRole('button', { name: 'Exporter le PDF' })).toBeEnabled();
  });
  it('reports RPC errors, blocks export and recovers with retry', async () => {
    const rpc = setup(['admin'], vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'denied' } }).mockResolvedValue({ data: ORG_DEMO, error: null }));
    await screen.findByRole('alert'); expect(screen.getByRole('button', { name: 'Exporter le PDF' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await screen.findByRole('img'); expect(rpc).toHaveBeenCalledTimes(2);
  });
  it('reloads on date changes and when returning to the page', async () => {
    const rpc = setup(); await screen.findByRole('img');
    fireEvent.change(screen.getByLabelText('Date de situation'), { target: { value: '2026-08-01' } });
    await waitFor(() => expect(rpc).toHaveBeenLastCalledWith('organigramme_snapshot', { p_as_of: '2026-08-01' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Exporter le PDF' })).toBeEnabled());
    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(3));
  });
  it('saves external-party responsibilities through the authorized RPC', async () => {
    const rpc = setup(); await screen.findByRole('img');
    fireEvent.click(screen.getByRole('button', { name: 'Modifier la structure' }));
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Cabinet test' } });
    fireEvent.change(screen.getByLabelText('Fonction ou accompagnement'), { target: { value: 'Assistance technique' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('save_organigramme_support', expect.objectContaining({ p_name: 'Cabinet test', p_function_label: 'Assistance technique', p_category: 'external' })));
  });
});
