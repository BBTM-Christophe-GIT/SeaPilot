import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdminPage } from './AdminPage';

function createProfilesQuery(data: unknown[]) {
  return {
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data, error: null }),
    }),
  };
}

describe('AdminPage', () => {
  it('renders users and their assigned roles', async () => {
    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return createProfilesQuery([
            {
              id: 'user-1',
              email: 'admin@example.test',
              display_name: 'Admin',
              user_roles: [{ role_key: 'admin' }, { role_key: 'direction' }],
            },
          ]);
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    render(<AdminPage client={client as never} />);

    expect(await screen.findByRole('heading', { name: 'Gestion des utilisateurs' })).toBeInTheDocument();
    expect(screen.getByText('admin@example.test')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Admin pour admin@example.test' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Direction pour admin@example.test' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Marin pour admin@example.test' })).not.toBeChecked();
  });

  it('assigns a role to a user', async () => {
    const user = userEvent.setup();
    const insert = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return createProfilesQuery([
            {
              id: 'user-1',
              email: 'admin@example.test',
              display_name: 'Admin',
              user_roles: [{ role_key: 'admin' }],
            },
          ]);
        }

        if (table === 'user_roles') {
          return { insert };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    render(<AdminPage client={client as never} />);

    const directionCheckbox = await screen.findByRole('checkbox', { name: 'Direction pour admin@example.test' });
    await user.click(directionCheckbox);

    await waitFor(() =>
      expect(insert).toHaveBeenCalledWith({ user_id: 'user-1', role_key: 'direction' }),
    );
    expect(directionCheckbox).toBeChecked();
    expect(screen.getByText('Role mis a jour.')).toBeInTheDocument();
  });

  it('removes a role from a user', async () => {
    const user = userEvent.setup();
    const eqRole = vi.fn().mockResolvedValue({ error: null });
    const eqUser = vi.fn().mockReturnValue({ eq: eqRole });
    const deleteRequest = vi.fn().mockReturnValue({ eq: eqUser });
    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return createProfilesQuery([
            {
              id: 'user-1',
              email: 'marin@example.test',
              display_name: 'Marin',
              user_roles: [{ role_key: 'marin' }],
            },
          ]);
        }

        if (table === 'user_roles') {
          return { delete: deleteRequest };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    render(<AdminPage client={client as never} />);

    const marinCheckbox = await screen.findByRole('checkbox', { name: 'Marin pour marin@example.test' });
    await user.click(marinCheckbox);

    await waitFor(() => expect(deleteRequest).toHaveBeenCalled());
    expect(eqUser).toHaveBeenCalledWith('user_id', 'user-1');
    expect(eqRole).toHaveBeenCalledWith('role_key', 'marin');
    expect(marinCheckbox).not.toBeChecked();
  });
});
