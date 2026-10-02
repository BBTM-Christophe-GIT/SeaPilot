import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdminFleetOrder } from './AdminFleetOrder';

function createClient(order: string[] = [], readError: unknown = null) {
  return {
    from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({
      data: { function_order: order }, error: readError,
    }) }) }),
    rpc: vi.fn().mockImplementation((_name, args) => Promise.resolve({ data: { function_order: args.p_function_order }, error: null })),
  };
}

function displayedFunctions() {
  return within(screen.getByRole('list', { name: 'Ordre des fonctions' })).getAllByRole('listitem').map((row) => row.querySelector('strong')?.textContent);
}

describe('AdminFleetOrder', () => {
  it('reorders, adds a temporary function and saves the shared fleet setting', async () => {
    const user = userEvent.setup();
    const client = createClient(['Capitaine', 'Matelot']);
    render(<AdminFleetOrder client={client as never} />);
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeEnabled());
    expect(displayedFunctions()).toEqual(['Capitaine', 'Matelot']);
    expect(screen.getByRole('button', { name: 'Monter Capitaine' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Monter Matelot' }));
    expect(displayedFunctions()).toEqual(['Matelot', 'Capitaine']);
    await user.type(screen.getByLabelText('Ajouter une fonction, habituelle ou temporaire'), 'Chef de quart');
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer l’ordre de la Flotte' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Ordre des fonctions enregistré');
    expect(client.rpc).toHaveBeenCalledWith('save_planning_fleet_display_settings', { p_function_order: ['Matelot', 'Capitaine', 'Chef de quart'] });
    expect(client.from).toHaveBeenCalledWith('planning_fleet_display_settings');
  });

  it('activates a default order only after an explicit save and can restore the usual sort', async () => {
    const user = userEvent.setup();
    const client = createClient();
    render(<AdminFleetOrder client={client as never} />);
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeEnabled());
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(client.rpc).not.toHaveBeenCalled();
    await user.click(screen.getByRole('checkbox'));
    expect(displayedFunctions()).toContain('Capitaine');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Enregistrer l’ordre de la Flotte' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Tri habituel rétabli');
    expect(client.rpc).toHaveBeenCalledWith('save_planning_fleet_display_settings', { p_function_order: [] });
  });

  it('rejects duplicate functions regardless of accents and case', async () => {
    const user = userEvent.setup();
    const client = createClient(['Chef Mécanicien']);
    render(<AdminFleetOrder client={client as never} />);
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeEnabled());
    await user.type(screen.getByLabelText('Ajouter une fonction, habituelle ou temporaire'), 'chef mecanicien');
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(screen.getByRole('alert')).toHaveTextContent('déjà présente');
    expect(displayedFunctions()).toEqual(['Chef Mécanicien']);
  });

  it('keeps the edited order available for retry when saving fails', async () => {
    const client = createClient(['Capitaine', 'Matelot']);
    client.rpc.mockResolvedValue({ data: null, error: new Error('Forbidden') } as never);
    render(<AdminFleetOrder client={client as never} />);
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Descendre Capitaine' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer l’ordre de la Flotte' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible d’enregistrer');
    expect(displayedFunctions()).toEqual(['Matelot', 'Capitaine']);
    expect(screen.getByRole('button', { name: 'Enregistrer l’ordre de la Flotte' })).toBeEnabled();
  });

  it('prevents an unknown saved order from being overwritten after a read error', async () => {
    const client = createClient([], new Error('offline'));
    render(<AdminFleetOrder client={client as never} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger');
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enregistrer l’ordre de la Flotte' })).toBeDisabled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('requires a function when the custom order is enabled', async () => {
    const client = createClient(['Capitaine']);
    render(<AdminFleetOrder client={client as never} />);
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Retirer Capitaine' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer l’ordre de la Flotte' }));
    expect(screen.getByRole('alert')).toHaveTextContent('au moins une fonction');
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
