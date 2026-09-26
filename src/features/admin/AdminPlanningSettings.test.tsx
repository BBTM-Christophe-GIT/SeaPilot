import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdminPlanningSettings } from './AdminPlanningSettings';

function createClient(enabled = false, readError: unknown = null) {
  return {
    from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({
      data: { active_filter_enabled: enabled }, error: readError,
    }) }) }),
    rpc: vi.fn().mockImplementation((_name, args) => Promise.resolve({
      data: { active_filter_enabled: args.p_active_filter_enabled }, error: null,
    })),
  };
}

describe('Admin Planning display settings', () => {
  it('loads, enables, disables and reloads the saved setting', async () => {
    const user = userEvent.setup();
    const client = createClient();
    const { unmount } = render(<AdminPlanningSettings client={client as never} />);
    const checkbox = screen.getByRole('checkbox');
    await waitFor(() => expect(checkbox).toBeEnabled());
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    await waitFor(() => expect(checkbox).toBeChecked());
    expect(client.rpc).toHaveBeenCalledWith('planning_save_display_settings', { p_active_filter_enabled: true });
    await user.click(checkbox);
    await waitFor(() => expect(checkbox).not.toBeChecked());
    expect(client.rpc).toHaveBeenLastCalledWith('planning_save_display_settings', { p_active_filter_enabled: false });
    unmount();
    render(<AdminPlanningSettings client={createClient(true) as never} />);
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
  });

  it('keeps the saved value and reports a failed write', async () => {
    const client = createClient(true);
    client.rpc.mockResolvedValue({ data: null, error: new Error('Forbidden') } as never);
    render(<AdminPlanningSettings client={client as never} />);
    const checkbox = screen.getByRole('checkbox');
    await waitFor(() => expect(checkbox).toBeEnabled());
    await userEvent.click(checkbox);
    expect(await screen.findByRole('alert')).toHaveTextContent('Le réglage précédent est conservé');
    expect(checkbox).toBeChecked();
  });

  it('prevents overwriting an unknown setting after a read error', async () => {
    const client = createClient(false, new Error('offline'));
    render(<AdminPlanningSettings client={client as never} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger');
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
