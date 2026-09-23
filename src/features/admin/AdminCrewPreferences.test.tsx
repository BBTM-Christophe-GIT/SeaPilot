import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdminCrewPreferences } from './AdminCrewPreferences';

function setup(error = false) {
  let row: Record<string, string> | null = null;
  const rpc = vi.fn(async (_name: string, args: { p_name_format: string; p_sort_order: string }) => {
    if (error) return { data: null, error: new Error('Denied') };
    row = { name_format: args.p_name_format, sort_order: args.p_sort_order };
    return { data: row, error: null };
  });
  const client = { from: () => ({ select: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }), rpc } as unknown as SupabaseClient;
  return { client, rpc };
}

describe('administrator crew preferences', () => {
  it('saves both settings, previews the name and restores saved values when reopened', async () => {
    const user = userEvent.setup();
    const { client, rpc } = setup();
    const view = render(<AdminCrewPreferences client={client} />);
    const save = await screen.findByRole('button', { name: 'Enregistrer mes préférences' });
    await user.selectOptions(screen.getByLabelText('Affichage des marins'), 'last_first');
    await user.selectOptions(screen.getByLabelText('Tri préféré'), 'function');
    expect(screen.getByText('DUPONT Jean')).toBeInTheDocument();
    await user.click(save);
    expect(await screen.findByRole('status')).toHaveTextContent('sont enregistrées');
    expect(rpc).toHaveBeenCalledWith('planning_save_crew_display_preferences', { p_name_format: 'last_first', p_sort_order: 'function' });
    view.unmount();
    render(<AdminCrewPreferences client={client} />);
    await screen.findByText('DUPONT Jean');
    expect(screen.getByLabelText('Tri préféré')).toHaveValue('function');
  });

  it('retains the draft and shows an error when saving fails', async () => {
    const user = userEvent.setup();
    render(<AdminCrewPreferences client={setup(true).client} />);
    await user.selectOptions(await screen.findByLabelText('Affichage des marins'), 'last_first');
    await user.click(screen.getByRole('button', { name: 'Enregistrer mes préférences' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible d’enregistrer');
    expect(screen.getByLabelText('Affichage des marins')).toHaveValue('last_first');
    expect(screen.queryByText('Vos préférences Équipages sont enregistrées.')).not.toBeInTheDocument();
  });

  it('prevents overwriting saved settings when loading fails', async () => {
    const client = { from: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: new Error('Offline') }) }) }) } as unknown as SupabaseClient;
    render(<AdminCrewPreferences client={client} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger');
    expect(screen.getByRole('button', { name: 'Enregistrer mes préférences' })).toBeDisabled();
  });
});
