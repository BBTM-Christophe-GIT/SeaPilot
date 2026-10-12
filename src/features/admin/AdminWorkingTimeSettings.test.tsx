import type { SupabaseClient } from '@supabase/supabase-js';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWorkingTimeEditSettings, saveWorkingTimeEditSettings, type WorkingTimeEditSettings } from '../workingTime/workingTimeSettings';
import { AdminWorkingTimeSettings } from './AdminWorkingTimeSettings';

vi.mock('../workingTime/workingTimeSettings', () => ({
  fetchWorkingTimeEditSettings: vi.fn(),
  saveWorkingTimeEditSettings: vi.fn(),
}));

const client = {} as SupabaseClient;
const disabled = { unrestrictedEditingEnabled: false, canUseUnrestrictedEditing: false };
const enabled = { unrestrictedEditingEnabled: true, canUseUnrestrictedEditing: true };
const switchName = 'Modification libre du suivi du temps de travail';

function deferredSettings() {
  let resolve!: (settings: WorkingTimeEditSettings) => void;
  const promise = new Promise<WorkingTimeEditSettings>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.mocked(fetchWorkingTimeEditSettings).mockReset().mockResolvedValue(disabled);
  vi.mocked(saveWorkingTimeEditSettings).mockReset().mockResolvedValue(enabled);
});

describe('AdminWorkingTimeSettings', () => {
  it('disables the switch until its authenticated company setting loads', async () => {
    const loading = deferredSettings();
    vi.mocked(fetchWorkingTimeEditSettings).mockReturnValueOnce(loading.promise);
    render(<AdminWorkingTimeSettings client={client} />);
    const toggle = screen.getByRole('switch', { name: switchName });
    expect(toggle).toBeDisabled();
    expect(toggle).not.toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('Chargement');
    await act(async () => { loading.resolve(disabled); });
    expect(toggle).toBeEnabled();
    expect(toggle).toHaveAccessibleDescription(expect.stringContaining('Christophe MINASSIAN'));
    expect(screen.getByText(/Commentaires et motifs de correction facultatifs/)).toBeInTheDocument();
  });

  it('shows a persisted enabled setting for another Admin without changing the account capability', async () => {
    vi.mocked(fetchWorkingTimeEditSettings).mockResolvedValue({ ...enabled, canUseUnrestrictedEditing: false });
    render(<AdminWorkingTimeSettings client={client} />);
    const toggle = screen.getByRole('switch', { name: switchName });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toBeChecked();
    expect(saveWorkingTimeEditSettings).not.toHaveBeenCalled();
    expect(screen.getByText(/Autorise uniquement Christophe MINASSIAN/)).toBeVisible();
  });

  it('waits for the saved flag, prevents duplicate writes and preserves persistence after remounting', async () => {
    const saving = deferredSettings();
    vi.mocked(saveWorkingTimeEditSettings).mockReturnValueOnce(saving.promise);
    const view = render(<AdminWorkingTimeSettings client={client} />);
    const user = userEvent.setup();
    const toggle = screen.getByRole('switch', { name: switchName });
    await waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle);
    expect(saveWorkingTimeEditSettings).toHaveBeenCalledWith(client, { unrestrictedEditingEnabled: true });
    expect(toggle).toBeDisabled();
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(saveWorkingTimeEditSettings).toHaveBeenCalledTimes(1);
    await act(async () => { saving.resolve(enabled); });
    expect(toggle).toBeChecked();
    expect(toggle).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('uniquement pour Christophe MINASSIAN');
    view.unmount();
    vi.mocked(fetchWorkingTimeEditSettings).mockResolvedValue(enabled);
    render(<AdminWorkingTimeSettings client={client} />);
    await waitFor(() => expect(screen.getByRole('switch', { name: switchName })).toBeEnabled());
    expect(screen.getByRole('switch', { name: switchName })).toBeChecked();
  });

  it('keeps the previously confirmed setting when saving fails', async () => {
    vi.mocked(fetchWorkingTimeEditSettings).mockResolvedValue(enabled);
    vi.mocked(saveWorkingTimeEditSettings).mockRejectedValue(new Error('Denied'));
    render(<AdminWorkingTimeSettings client={client} />);
    const toggle = screen.getByRole('switch', { name: switchName });
    await waitFor(() => expect(toggle).toBeEnabled());
    await userEvent.setup().click(toggle);
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible d’enregistrer');
    expect(toggle).toBeChecked();
    expect(toggle).toBeEnabled();
    expect(screen.queryByText('Les règles habituelles de modification sont rétablies.')).not.toBeInTheDocument();
  });

  it('blocks changes after a read failure and supports a fresh authenticated retry', async () => {
    vi.mocked(fetchWorkingTimeEditSettings).mockRejectedValueOnce(new Error('Unavailable'));
    render(<AdminWorkingTimeSettings client={client} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('indisponible');
    const toggle = screen.getByRole('switch', { name: switchName });
    expect(toggle).toBeDisabled();
    expect(toggle).not.toBeChecked();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Réessayer le chargement' }));
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchWorkingTimeEditSettings).toHaveBeenCalledTimes(2);
    expect(saveWorkingTimeEditSettings).not.toHaveBeenCalled();
  });

  it('restores the usual rules when the switch is disabled', async () => {
    vi.mocked(fetchWorkingTimeEditSettings).mockResolvedValue(enabled);
    vi.mocked(saveWorkingTimeEditSettings).mockResolvedValue(disabled);
    render(<AdminWorkingTimeSettings client={client} />);
    const toggle = screen.getByRole('switch', { name: switchName });
    await waitFor(() => expect(toggle).toBeEnabled());
    await userEvent.setup().click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(saveWorkingTimeEditSettings).toHaveBeenCalledWith(client, { unrestrictedEditingEnabled: false });
    expect(screen.getByRole('status')).toHaveTextContent('Les règles habituelles');
  });
});
