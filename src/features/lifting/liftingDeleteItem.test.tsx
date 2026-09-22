import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ROLE_KEYS } from '../permissions/roles';
import { LiftingPage } from './LiftingPage';
import { createLiftingPreviewClient, demoVessel } from './liftingPreview';
import { fetchLiftingRegister, setLiftingItemActive } from './liftingQueries';

describe('inventory removal by profile', () => {
  it.each(ROLE_KEYS.flatMap((role) => (['lifting', 'towing'] as const).map((kind) => ({ role, kind }))))(
    '$role can remove $kind equipment unless the profile is Marin', async ({ role, kind }) => {
      const client = createLiftingPreviewClient({ roles: [role] });
      const user = userEvent.setup();
      const original = (await fetchLiftingRegister(client, demoVessel.id, kind)).items;
      const rpc = vi.spyOn(client, 'rpc');
      render(<MemoryRouter><LiftingPage client={client} roles={[role]} /></MemoryRouter>);
      await screen.findByText('ÉLINGUE TEXTILE RONDE — 3 M');
      if (kind === 'towing') await user.click(screen.getByRole('button', { name: 'Remorques' }));
      await screen.findByText(original[0].description);
      const removeButtons = screen.queryAllByRole('button', { name: /^Supprimer \d+$/ });
      if (role === 'marin') {
        expect(removeButtons).toHaveLength(0);
        await expect(setLiftingItemActive(client, original[0].id, false)).rejects.toMatchObject({ message: 'Accès refusé.' });
        expect((await fetchLiftingRegister(client, demoVessel.id, kind)).items).toEqual(original);
        return;
      }
      expect(removeButtons).toHaveLength(original.length);
      if (role === 'capitaine') {
        expect(screen.queryByRole('button', { name: /^Modifier / })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Remplacer / })).not.toBeInTheDocument();
      }
      await user.click(screen.getByRole('button', { name: `Supprimer ${original[0].reference}` }));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Annuler' }));
      expect(rpc).not.toHaveBeenCalledWith('set_lifting_item_active', expect.anything());
      await user.click(screen.getByRole('button', { name: `Supprimer ${original[0].reference}` }));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Supprimer de l’inventaire' }));
      await screen.findByText('Matériel retiré de l’inventaire actif.');
      expect(rpc).toHaveBeenCalledWith('set_lifting_item_active', { p_id: original[0].id, p_active: false });
      expect(screen.queryByText(original[0].description)).not.toBeInTheDocument();
      const items = (await fetchLiftingRegister(client, demoVessel.id, kind)).items;
      expect(items).toEqual(original.map((item, index) => index === 0 ? { ...item, active: false } : item));
      if (role === 'capitaine') {
        await user.click(screen.getByRole('checkbox', { name: /supprimés/ }));
        await screen.findByText(original[0].description);
        expect(screen.queryByRole('button', { name: /^Restaurer / })).not.toBeInTheDocument();
        await expect(setLiftingItemActive(client, original[0].id, true)).rejects.toMatchObject({ message: 'Accès refusé.' });
      }
    },
  );

  it('keeps equipment visible and shows the server error when removal is refused', async () => {
    const client = createLiftingPreviewClient({ roles: ['capitaine'] });
    const rpc = client.rpc.bind(client);
    vi.spyOn(client, 'rpc').mockImplementation((name, args) => name === 'set_lifting_item_active'
      ? Promise.resolve({ data: null, error: { message: 'Matériel introuvable ou accès refusé.' } }) as unknown as ReturnType<typeof client.rpc>
      : rpc(name, args));
    const user = userEvent.setup();
    render(<MemoryRouter><LiftingPage client={client} roles={['capitaine']} /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: 'Supprimer 1' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Supprimer de l’inventaire' }));
    await waitFor(() => expect(dialog.getByRole('alert')).toHaveTextContent('Matériel introuvable ou accès refusé.'));
    expect(screen.getByText('ÉLINGUE TEXTILE RONDE — 3 M')).toBeInTheDocument();
    expect((await fetchLiftingRegister(client, demoVessel.id, 'lifting')).items.every((item) => item.active)).toBe(true);
  });
});
