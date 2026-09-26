import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { OrganigrammePage } from './OrganigrammePage';
import { ORG_DEMO, ORG_LINKS_DEMO, ORG_VESSEL_FILTER_DEMO } from './organigrammeFixtures';
import type { RoleKey } from '../permissions/roles';

function setup(roles: RoleKey[] = ['direction'], rpc = vi.fn().mockResolvedValue({ data: ORG_DEMO, error: null })) {
  render(<MemoryRouter><Routes><Route element={<Outlet context={{ roles, client: { rpc }, previewMode: false }} />}><Route index element={<OrganigrammePage />} /></Route></Routes></MemoryRouter>);
  return rpc;
}
describe('OrganigrammePage', () => {
  it('selects several ships, retains the selection across views and refreshes, and distinguishes none from all', async () => {
    const rpc = setup(['direction'], vi.fn().mockResolvedValue({ data: ORG_VESSEL_FILTER_DEMO, error: null }));
    await screen.findByRole('img');
    const filter = within(screen.getByRole('group', { name: /Navires à afficher/ }));
    expect(filter.getAllByRole('checkbox').map((input) => input.closest('label')!.textContent)).toEqual(['GOURY', 'NAVIRE CÔTIER', 'LE ROZEL']);
    const svg = () => decodeURIComponent(screen.getByRole('img').getAttribute('src')!);
    expect(svg()).not.toContain('NAVIRE VIDE');
    fireEvent.click(filter.getByRole('button', { name: 'Aucun navire' }));
    expect(filter.getAllByRole('checkbox').every((input) => !(input as HTMLInputElement).checked)).toBe(true);
    fireEvent.click(filter.getByRole('checkbox', { name: 'GOURY' }));
    fireEvent.click(filter.getByRole('checkbox', { name: 'LE ROZEL' }));
    for (const view of ['Par navire et bordée', 'Par bordée', 'Par fonction']) {
      fireEvent.click(screen.getByRole('button', { name: view }));
      expect(svg()).toContain('GOURY'); expect(svg()).toContain('LE ROZEL'); expect(svg()).not.toContain('NAVIRE CÔTIER');
    }
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(filter.getByRole('checkbox', { name: 'GOURY' })).toBeEnabled());
    expect(filter.getByRole('checkbox', { name: 'GOURY' })).toBeChecked();
    expect(filter.getByRole('checkbox', { name: 'LE ROZEL' })).toBeChecked();
    expect(filter.getByRole('checkbox', { name: 'NAVIRE CÔTIER' })).not.toBeChecked();
    fireEvent.click(filter.getByRole('checkbox', { name: 'GOURY' }));
    fireEvent.click(filter.getByRole('checkbox', { name: 'LE ROZEL' }));
    expect(svg()).not.toContain('GOURY'); expect(svg()).not.toContain('LE ROZEL');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Direction & Administration' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Intervenants externes' }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exporter le PDF' })).toBeDisabled();
    fireEvent.click(filter.getByRole('button', { name: 'Tous les navires' }));
    expect(svg()).toContain('NAVIRE CÔTIER'); expect(svg()).not.toContain('NAVIRE VIDE');
    expect(screen.getByRole('checkbox', { name: 'Sans affectation' })).toBeEnabled();
  });
  it('removes an emptied ship on refresh and lets its crew be composed again', async () => {
    const rpc = setup(); await screen.findByRole('img');
    const emptied = { ...ORG_DEMO, memberships: ORG_DEMO.memberships.filter((row) => row.vesselId !== 2) };
    rpc.mockResolvedValue({ data: emptied, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'LE ROZEL' })).not.toBeInTheDocument());
    expect(decodeURIComponent(screen.getByRole('img').getAttribute('src')!)).not.toContain('LE ROZEL');
    fireEvent.click(screen.getByRole('button', { name: 'Composer les bordées' }));
    expect(within(screen.getByRole('combobox', { name: 'Navire de la bordée' })).getByRole('option', { name: 'LE ROZEL' })).toBeInTheDocument();
    rpc.mockResolvedValue({ data: ORG_DEMO, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    expect(await screen.findByRole('checkbox', { name: 'LE ROZEL' })).toBeChecked();
    expect(decodeURIComponent(screen.getByRole('img').getAttribute('src')!)).toContain('LE ROZEL');
  });
  it('edits a hierarchy rank independently from display order and renders the saved level', async () => {
    let data = ORG_DEMO;
    const rpc = setup(['direction'], vi.fn().mockImplementation(async (name, args) => {
      if (name === 'save_organigramme_responsibility') data = { ...data, support: data.support.map((entry) => entry.id === args.p_id ? { ...entry, rank: args.p_rank } : entry) };
      return { data, error: null };
    }));
    await screen.findByRole('img'); fireEvent.click(screen.getByRole('button', { name: 'Modifier la structure' }));
    fireEvent.click(screen.getByRole('button', { name: 'Modifier Jules ROUX' }));
    fireEvent.change(screen.getByLabelText('Rang hiérarchique'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('save_organigramme_responsibility', expect.objectContaining({ p_rank: '4', p_position: 1 })));
    await waitFor(() => expect(decodeURIComponent(screen.getByRole('img').getAttribute('src')!)).toContain('Rang 4'));
  });
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
    setup(['direction'], vi.fn().mockImplementation(async (name) => name === 'organigramme_snapshot_v2' ? { data: ORG_DEMO, error: null } : { data: null, error: { message: 'denied' } }));
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
    await waitFor(() => expect(rpc).toHaveBeenLastCalledWith('organigramme_snapshot_v2', { p_as_of: '2026-08-01' }));
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
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('save_organigramme_responsibility', expect.objectContaining({ p_name: 'Cabinet test', p_function_label: 'Assistance technique', p_category: 'external' })));
  });
});
