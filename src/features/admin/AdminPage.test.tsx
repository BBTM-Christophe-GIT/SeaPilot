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

function createNavigationPermissionsQuery(data: unknown[] = []) {
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

      if (table === 'role_module_permissions') {
        return createNavigationPermissionsQuery();
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

describe('AdminPage', () => {
  it('invites a new user with a role and optional sailor link', async () => {
    const user = userEvent.setup();
    const invoke = vi.fn().mockResolvedValue({ data: { invitation: { invitationId: 7 } }, error: null });
    const client = {
      functions: { invoke },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return createProfilesQuery([]);
        }

        if (table === 'sharepoint_sources') {
          return createSharePointSourcesQuery([]);
        }

        if (table === 'role_module_permissions') {
          return createNavigationPermissionsQuery();
        }

        if (table === 'people') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({
                      data: [
                        {
                          id: 42,
                          first_name: 'David',
                          last_name: 'FIDELIN',
                          email: 'david@example.test',
                          function_label: 'Matelot',
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    render(<AdminPage client={client as never} />);

    await user.click(await screen.findByRole('button', { name: 'Inviter un utilisateur' }));
    expect(screen.getByRole('dialog', { name: 'Inviter un utilisateur' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Associer à un marin (facultatif)'), '42');
    expect(screen.getByLabelText('Nom affiché')).toHaveValue('David FIDELIN');
    expect(screen.getByLabelText('Adresse email')).toHaveValue('david@example.test');
    expect(screen.getByRole('checkbox', { name: 'Marin' })).toBeChecked();

    await user.click(screen.getByRole('button', { name: "Envoyer l'invitation" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('admin-invite-user', {
      body: {
        email: 'david@example.test',
        displayName: 'David FIDELIN',
        roleKeys: ['marin'],
        personId: 42,
      },
    }));
    expect(screen.getByText(/Invitation envoyée/)).toBeInTheDocument();
  });

  it('renders users and their assigned roles', async () => {
    const client = createAdminClient();

    render(<AdminPage client={client as never} />);

    expect(await screen.findByRole('heading', { name: 'Gestion des utilisateurs' })).toBeInTheDocument();
    expect(screen.getByText('admin@example.test')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Admin pour admin@example.test' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Direction pour admin@example.test' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Marin pour admin@example.test' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Suivi du Temps de travail visible pour Marin' })).toBeChecked();
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

        if (table === 'role_module_permissions') {
          return createNavigationPermissionsQuery();
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

        if (table === 'role_module_permissions') {
          return createNavigationPermissionsQuery();
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

  it('lets an administrator configure menu visibility by role', async () => {
    const user = userEvent.setup();
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return createProfilesQuery([]);
        }

        if (table === 'sharepoint_sources') {
          return createSharePointSourcesQuery([]);
        }

        if (table === 'role_module_permissions') {
          return { ...createNavigationPermissionsQuery(), upsert };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    render(<AdminPage client={client as never} />);

    const projectsForSailor = await screen.findByRole('checkbox', { name: 'Projets visible pour Marin' });
    expect(projectsForSailor).not.toBeChecked();

    await user.click(projectsForSailor);

    await waitFor(() =>
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({ role_key: 'marin', module_key: 'projects', is_visible: true }),
        { onConflict: 'role_key,module_key' },
      ),
    );
    expect(projectsForSailor).toBeChecked();
    expect(screen.getByText('Acces de navigation mis a jour.')).toBeInTheDocument();
  });
});
