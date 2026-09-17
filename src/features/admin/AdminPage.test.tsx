import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { previewSupabaseClient } from '../preview/previewSupabaseClient';
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

function createPeopleQuery(data: unknown[] = []) {
  return { select: () => ({ order: () => ({ range: async () => ({ data, error: null }) }) }) };
}

function createAdminClient(options: { profiles?: unknown[]; sources?: unknown[]; people?: unknown[] } = {}) {
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

      if (table === 'people') {
        return createPeopleQuery(options.people);
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

function renderAdminPage(client: unknown, section = 'users') {
  return render(
    <MemoryRouter initialEntries={[`/modules/admin?preview=1&section=${section}`]}>
      <AdminPage client={client as never} />
    </MemoryRouter>,
  );
}

describe('AdminPage', () => {
  it('hides departed people in both tables by default and permits explicit deletion from the former filter', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const invoke = vi.fn().mockResolvedValue({ data: { message: 'Utilisateur supprimé.' }, error: null });
    const client = {
      ...createAdminClient({
        profiles: [
          { id: 'current', display_name: 'En Poste', email: 'current@example.test', user_roles: [] },
          { id: 'former', display_name: 'Ancienne Collègue', email: 'former@example.test', user_roles: [{ role_key: 'marin' }] },
        ],
        people: [
          { id: 1, user_id: 'current', first_name: 'En', last_name: 'Poste', email: 'current@example.test', active: true, hired_on: '2020-01-01', departed_on: null },
          { id: 2, user_id: 'former', first_name: 'Ancienne', last_name: 'Collègue', email: 'former@example.test', active: true, hired_on: '2020-01-01', departed_on: '2025-12-18' },
        ],
      }),
      functions: { invoke },
    };
    renderAdminPage(client);
    const filter = await screen.findByRole('combobox', { name: 'Collaborateurs affichés' });
    expect(filter).toHaveValue('current');
    expect(screen.queryByText('Ancienne Collègue')).not.toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Comptes SeaPilot' })).getByText('En Poste')).toBeVisible();
    expect(screen.getByLabelText("Nombre d'utilisateurs")).toHaveTextContent('1');
    await user.selectOptions(filter, 'former');
    const accounts = screen.getByRole('table', { name: 'Comptes SeaPilot' });
    expect(within(accounts).getByText('Ancienne Collègue')).toBeVisible();
    expect(within(screen.getByRole('table', { name: 'Collaborateurs sans compte ou sans adresse BBTM' })).getByText('Ancienne Collègue')).toBeVisible();
    expect(screen.queryByText('En Poste')).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
    await user.selectOptions(filter, 'all');
    expect(screen.getByLabelText("Nombre d'utilisateurs")).toHaveTextContent('2');
    await user.selectOptions(filter, 'former');
    await user.click(screen.getByRole('button', { name: 'Supprimer former@example.test' }));
    expect(invoke).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Supprimer former@example.test' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('admin-manage-user', { body: { action: 'delete', userId: 'former' } }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Supprimer former@example.test' })).not.toBeInTheDocument());
    expect(screen.getByText('Ancienne Collègue')).toBeVisible();
    expect(screen.getByText('Sans compte')).toBeVisible();
    expect(filter).toHaveValue('former');
    confirm.mockRestore();
  });

  it('does not show an unfiltered account list when HR data cannot load', async () => {
    const base = createAdminClient();
    const client = { from: (table: string) => table === 'people'
      ? { select: () => ({ order: () => ({ range: async () => ({ data: null, error: new Error('Denied') }) }) }) }
      : base.from(table) };
    renderAdminPage(client);
    expect(await screen.findByText('Impossible de charger les utilisateurs.')).toBeVisible();
    expect(screen.queryByRole('table', { name: 'Comptes SeaPilot' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Collaborateurs affichés' })).not.toBeInTheDocument();
  });

  it('loads administration with the isolated preview fixtures', async () => {
    const user = userEvent.setup();
    renderAdminPage(previewSupabaseClient);

    expect(await screen.findByRole('heading', { name: 'Gestion des utilisateurs' })).toBeVisible();
    expect(screen.getByText('admin@example.invalid')).toBeVisible();
    expect(await screen.findByRole('table', { name: 'Collaborateurs sans compte ou sans adresse BBTM' })).toBeVisible();
    expect(screen.queryByText('Impossible de charger les utilisateurs.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Imports et migration' }));
    expect(screen.getByText('Procédures — démonstration')).toBeVisible();
  });

  it('opens Drive setup from the section menu and preserves the other URL parameters', async () => {
    const user = userEvent.setup();
    renderAdminPage(createAdminClient());

    await screen.findByRole('heading', { name: 'Gestion des utilisateurs' });
    const documentsLink = screen.getByRole('link', { name: 'Documents et Google Drive' });
    expect(documentsLink).toHaveAttribute('href', '/modules/admin?preview=1&section=documents');
    await user.click(documentsLink);

    expect(documentsLink).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: 'Un seul dossier SeaPilot pour ce PC' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Gestion des utilisateurs' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Installer le lanceur Windows' })).toHaveAttribute('href', '/connectors/seapilot-drive-windows.zip?v=2.1.0');
    expect(screen.getByRole('link', { name: 'Installer le lanceur Windows' })).toHaveAttribute('download');
    expect(screen.getByLabelText('Chemin du dossier SeaPilot sur ce PC')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Configurer le dossier disciplinaire sur ce PC' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Utilisateurs' }));
    expect(screen.getByRole('checkbox', { name: 'Admin pour admin@example.test' })).toBeChecked();
    expect(screen.queryByRole('heading', { name: 'Un seul dossier SeaPilot pour ce PC' })).not.toBeInTheDocument();
  });

  it('keeps the bookmarked Drive instructions available while administrative data is loading', () => {
    const baseClient = createAdminClient();
    const client = {
      from: vi.fn().mockImplementation((table: string) => table === 'profiles'
        ? { select: () => ({ order: () => new Promise(() => {}) }) }
        : baseClient.from(table)),
    };
    renderAdminPage(client, 'documents');

    expect(screen.getByRole('button', { name: 'Vérifier ce PC' })).toBeVisible();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('falls back to the users section for an unknown section URL', async () => {
    renderAdminPage(createAdminClient(), 'unknown');

    expect(await screen.findByRole('heading', { name: 'Gestion des utilisateurs' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Utilisateurs' })).toHaveAttribute('aria-current', 'page');
  });

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
              order: () => ({ range: async () => ({ data: [], error: null }) }),
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

        if (table === 'people') return createPeopleQuery();
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    renderAdminPage(client);

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
    const user = userEvent.setup();
    const client = createAdminClient();

    renderAdminPage(client);

    expect(await screen.findByRole('heading', { name: 'Gestion des utilisateurs' })).toBeInTheDocument();
    expect(screen.getByText('admin@example.test')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Admin pour admin@example.test' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Direction pour admin@example.test' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Marin pour admin@example.test' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Renvoyer le lien à admin@example.test' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Supprimer admin@example.test' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Accès et rôles' }));
    expect(screen.getByRole('checkbox', { name: 'Suivi du Temps de travail visible pour Marin' })).toBeChecked();
  });

  it('resends an access link from the user row', async () => {
    const user = userEvent.setup();
    const invoke = vi.fn().mockResolvedValue({
      data: { message: 'Une nouvelle invitation a été envoyée.' },
      error: null,
    });
    const client = {
      ...createAdminClient(),
      functions: { invoke },
    };

    renderAdminPage(client);

    await user.click(await screen.findByRole('button', { name: 'Renvoyer le lien à admin@example.test' }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('admin-manage-user', {
      body: { action: 'resend_access', userId: 'user-1' },
    }));
    expect(screen.getByText('Une nouvelle invitation a été envoyée.')).toBeInTheDocument();
  });

  it('deletes an account after confirmation and removes its row', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const invoke = vi.fn().mockResolvedValue({
      data: { message: 'Utilisateur supprimé. Sa fiche RH et son historique sont conservés.' },
      error: null,
    });
    const client = {
      ...createAdminClient(),
      functions: { invoke },
    };

    renderAdminPage(client);

    await user.click(await screen.findByRole('button', { name: 'Supprimer admin@example.test' }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Sa fiche RH et son historique métier seront conservés.'));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('admin-manage-user', {
      body: { action: 'delete', userId: 'user-1' },
    }));
    expect(screen.queryByText('admin@example.test')).not.toBeInTheDocument();
    expect(screen.getByText(/Utilisateur supprimé/)).toBeInTheDocument();
    confirm.mockRestore();
  });

  it('renders SharePoint import monitoring sources', async () => {
    const client = createAdminClient();

    renderAdminPage(client, 'imports');

    expect(await screen.findByRole('heading', { name: 'Suivi import SharePoint' })).toBeInTheDocument();
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

        if (table === 'people') return createPeopleQuery();
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    renderAdminPage(client);

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

        if (table === 'people') return createPeopleQuery();
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    renderAdminPage(client);

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

        if (table === 'people') return createPeopleQuery();
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    renderAdminPage(client, 'access');

    const projectsForSailor = await screen.findByRole('checkbox', { name: 'Projets visible pour Marin' });
    expect(screen.getByRole('checkbox', { name: 'Navires visible pour Admin' })).toBeChecked();
    expect(screen.getByText('Navires')).toBeInTheDocument();
    expect(projectsForSailor).not.toBeChecked();
    for (const profile of ['Armement', 'Capitaine', 'Marin']) {
      const restricted = screen.getByRole('checkbox', { name: `Sanctions Disciplinaires visible pour ${profile}` });
      expect(restricted).not.toBeChecked(); expect(restricted).toBeDisabled();
    }
    expect(screen.getByRole('checkbox', { name: 'Sanctions Disciplinaires visible pour Direction' })).toBeEnabled();

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

  it("can hide the Action Plan correction button from Administration", async () => {
    const user = userEvent.setup();
    const baseClient = createAdminClient();
    const rpc = vi.fn().mockResolvedValue({ data: { edit_button_enabled: false }, error: null });
    const client = {
      ...baseClient,
      rpc,
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'action_plan_settings') {
          return { select: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { edit_button_enabled: true }, error: null }) }) };
        }
        return baseClient.from(table);
      }),
    };

    renderAdminPage(client, 'action-plan');
    const toggle = await screen.findByRole('checkbox', { name: 'Afficher Modifier la fiche' });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('action_plan_save_settings', {
      p_edit_button_enabled: false,
    }));
    expect(toggle).not.toBeChecked();
    expect(screen.getByText('Le bouton « Modifier la fiche » est maintenant masqué.')).toBeInTheDocument();
  });
});
