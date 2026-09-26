import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { OrganigrammePage } from './OrganigrammePage';
import { ORG_DEMO } from './organigrammeFixtures';
import type { RoleKey } from '../permissions/roles';

function setup(roles: RoleKey[] = ['direction'], rpc = vi.fn().mockResolvedValue({ data: ORG_DEMO, error: null })) {
  render(<MemoryRouter><Routes><Route element={<Outlet context={{ roles, client: { rpc }, previewMode: false }} />}><Route index element={<OrganigrammePage />} /></Route></Routes></MemoryRouter>);
  return rpc;
}
describe('OrganigrammePage', () => {
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
