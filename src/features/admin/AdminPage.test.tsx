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

function createSharePointSourcesQuery(data: unknown[]) {
  return {
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data, error: null }),
      }),
    }),
  };
}

function createAdminClient(options: { profiles?: unknown[]; sources?: unknown[] } = {}) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return createProfilesQuery(
          options.profiles ?? [
            {
              id: 'user-1',
              email: 'admin@example.test',
              display_name: 'Admin',
              user_roles: [{ role_key: 'admin' }, { role_key: 'direction' }],
            },
          ],
        );
      }

      if (table === 'sharepoint_sources') {
        return createSharePointSourcesQuery(
          options.sources ?? [
            {
              key: 'list-rh-personnel-bbtm',
              title: 'RH - Personnel BBTM',
              source_type: 'list',
              module_key: 'humanResources',
              target_table: 'people',
              import_priority: 20,
              confirmed: true,
            },
          ],
        );
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

describe('AdminPage', () => {
  it('renders users and their assigned roles', async () => {
    const client = createAdminClient();

    render(<AdminPage client={client as never} />);

    expect(await screen.findByRole('heading', { name: 'Gestion des utilisateurs' })).toBeInTheDocument();
    expect(screen.getByText('admin@example.test')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Admin pour admin@example.test' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Direction pour admin@example.test' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Marin pour admin@example.test' })).not.toBeChecked();
  });

  it('renders SharePoint import monitoring sources', async () => {
    const client = createAdminClient();

    render(<AdminPage client={client as never} />);

    expect(await screen.findByRole('heading', { name: 'Gestion des utilisateurs' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Suivi import SharePoint' })).toBeInTheDocument();
    expect(screen.getByLabelText('Sources SharePoint')).toHaveTextContent('1');
    expect(screen.getByText('RH - Personnel BBTM')).toBeInTheDocument();
    expect(screen.getByText('humanResources')).toBeInTheDocument();
    expect(screen.getByText('people')).toBeInTheDocument();
    expect(screen.getByText('Priorite 20')).toBeInTheDocument();
    expect(screen.getByText('Confirmee')).toBeInTheDocument();
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

        if (table === 'sharepoint_sources') {
          return createSharePointSourcesQuery([]);
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

        if (table === 'sharepoint_sources') {
          return createSharePointSourcesQuery([]);
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
