import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { APP_VERSION_LABEL } from '../../config/appVersion';
import { AuthProvider } from '../auth/AuthProvider';
import { ModulePage } from '../modules/ModulePage';
import { APP_MODULES } from '../permissions/moduleAccess';
import { AppShell } from './AppShell';

describe('AppShell', () => {
  it('renders the private application navigation', async () => {
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({
          data: { subscription: { unsubscribe: vi.fn() } },
        }),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
      },
    };

    render(
      <AuthProvider client={client as never}>
        <MemoryRouter>
          <Routes>
            <Route element={<AppShell rolesOverride={['admin']} />}>
              <Route index element={<div>Accueil prive</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText('SeaPilot')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'BBTM' })).toHaveAttribute('src', '/bbtm-logo.png');
    expect(screen.getByText('Projets')).toBeInTheDocument();
    const qhseButton = screen.getByRole('button', { name: 'QHSE' });
    expect(qhseButton).toBeInTheDocument();
    expect(qhseButton.closest('section')).toHaveAttribute('data-family-theme', 'qhse');
    expect(screen.getByRole('link', { name: 'KPI' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Planning' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Planning' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Suivi du Temps de travail' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Levage' })).toBeInTheDocument();
    expect(screen.getByText(APP_VERSION_LABEL)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réduire le menu' })).toBeInTheDocument();
  });

  it('marks the current direct module as active', async () => {
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({
          data: { subscription: { unsubscribe: vi.fn() } },
        }),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
      },
    };
    const planningModule = APP_MODULES.find((module) => module.key === 'planning');

    if (!planningModule) {
      throw new Error('Planning module is missing');
    }

    render(
      <AuthProvider client={client as never}>
        <MemoryRouter initialEntries={['/modules/planning']}>
          <Routes>
            <Route element={<AppShell rolesOverride={['admin']} />}>
              <Route path="modules/planning" element={<ModulePage module={planningModule} />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByRole('link', { name: 'Planning' })).toHaveClass('active');
    expect(screen.getByRole('link', { name: 'Planning' }).closest('section')).toHaveAttribute(
      'data-family-theme',
      'planning',
    );
  });

  it('loads roles from Supabase when no override is provided', async () => {
    const authClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({
          data: { subscription: { unsubscribe: vi.fn() } },
        }),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
      },
    };
    const roleSelect = vi.fn().mockResolvedValue({ data: [{ role_key: 'direction' }], error: null });
    const permissionIn = vi.fn().mockResolvedValue({
      data: APP_MODULES.filter((module) => module.allowedRoles.includes('direction')).map((module) => ({
        role_key: 'direction',
        module_key: module.key,
        is_visible: true,
      })),
      error: null,
    });
    const roleClient = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'user_roles') {
          return { select: roleSelect };
        }

        if (table === 'role_module_permissions') {
          return { select: vi.fn().mockReturnValue({ in: permissionIn }) };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    render(
      <AuthProvider client={authClient as never}>
        <MemoryRouter>
          <Routes>
            <Route element={<AppShell client={roleClient as never} />}>
              <Route index element={<div>Accueil prive</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(screen.getByText('Chargement des droits...')).toBeInTheDocument();
    expect(await screen.findByText('Projets')).toBeInTheDocument();
    expect(roleClient.from).toHaveBeenCalledWith('user_roles');
    expect(roleSelect).toHaveBeenCalledWith('role_key');
    expect(permissionIn).toHaveBeenCalledWith('role_key', ['direction']);
  });

  it('shows an empty access message when no modules are visible', async () => {
    const authClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({
          data: { subscription: { unsubscribe: vi.fn() } },
        }),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
      },
    };

    render(
      <AuthProvider client={authClient as never}>
        <MemoryRouter>
          <Routes>
            <Route element={<AppShell rolesOverride={[]} />}>
              <Route index element={<div>Accueil prive</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText('Aucun module autorise pour ce compte.')).toBeInTheDocument();
  });

  it('blocks direct module URLs for unauthorized roles', async () => {
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({
          data: { subscription: { unsubscribe: vi.fn() } },
        }),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
      },
    };
    const projectsModule = APP_MODULES.find((module) => module.key === 'projects');

    if (!projectsModule) {
      throw new Error('Projects module is missing');
    }

    render(
      <AuthProvider client={client as never}>
        <MemoryRouter initialEntries={['/modules/projects']}>
          <Routes>
            <Route element={<AppShell rolesOverride={['marin']} />}>
              <Route path="modules/projects" element={<ModulePage module={projectsModule} />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText('Acces refuse pour ce module.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Projets' })).not.toBeInTheDocument();
  });

  it.each(['/modules/projects/', '/modules/PROJECTS'])(
    'blocks equivalent direct module URL %s for unauthorized roles',
    async (initialEntry) => {
      const client = {
        auth: {
          getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null }),
          onAuthStateChange: vi.fn().mockReturnValue({
            data: { subscription: { unsubscribe: vi.fn() } },
          }),
          signInWithPassword: vi.fn(),
          signOut: vi.fn(),
        },
      };
      const projectsModule = APP_MODULES.find((module) => module.key === 'projects');

      if (!projectsModule) {
        throw new Error('Projects module is missing');
      }

      render(
        <AuthProvider client={client as never}>
          <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
              <Route element={<AppShell rolesOverride={['marin']} />}>
                <Route path="modules/projects" element={<ModulePage module={projectsModule} />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>,
      );

      expect(await screen.findByText('Acces refuse pour ce module.')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Projets' })).not.toBeInTheDocument();
    },
  );

  it('shows a distinct error state when roles cannot be loaded', async () => {
    const authClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({
          data: { subscription: { unsubscribe: vi.fn() } },
        }),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
      },
    };
    const roleClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: null, error: new Error('RLS denied') }),
      }),
    };

    render(
      <AuthProvider client={authClient as never}>
        <MemoryRouter>
          <Routes>
            <Route element={<AppShell client={roleClient as never} />}>
              <Route index element={<div>Accueil prive</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText("Impossible de charger vos droits d'acces.")).toBeInTheDocument();
    expect(screen.queryByText('Aucun module autorise pour ce compte.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Deconnexion/i })).toBeInTheDocument();
  });

  it('reloads roles when the authenticated user changes', async () => {
    let authStateChange: ((session: { user: { id: string } }) => void) | undefined;
    const authClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null }),
        onAuthStateChange: vi.fn().mockImplementation((callback) => {
          authStateChange = (session) => callback('SIGNED_IN', session);

          return {
            data: { subscription: { unsubscribe: vi.fn() } },
          };
        }),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
      },
    };
    const roleSelect = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ role_key: 'marin' }], error: null })
      .mockResolvedValueOnce({ data: [{ role_key: 'direction' }], error: null });
    const permissionIn = vi.fn().mockImplementation((_column: string, requestedRoles: string[]) => {
      const role = requestedRoles[0];

      return Promise.resolve({
        data: APP_MODULES.filter((module) => module.allowedRoles.includes(role as never)).map((module) => ({
          role_key: role,
          module_key: module.key,
          is_visible: true,
        })),
        error: null,
      });
    });
    const roleClient = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'user_roles') {
          return { select: roleSelect };
        }

        if (table === 'role_module_permissions') {
          return { select: vi.fn().mockReturnValue({ in: permissionIn }) };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    render(
      <AuthProvider client={authClient as never}>
        <MemoryRouter>
          <Routes>
            <Route element={<AppShell client={roleClient as never} />}>
              <Route index element={<div>Accueil prive</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByRole('link', { name: 'Accueil' })).toBeInTheDocument();
    expect(screen.queryByText('Projets')).not.toBeInTheDocument();

    await act(async () => {
      authStateChange?.({ user: { id: 'user-2' } });
    });

    expect(await screen.findByText('Projets')).toBeInTheDocument();
    expect(roleSelect).toHaveBeenCalledTimes(2);
    expect(permissionIn).toHaveBeenCalledTimes(2);
  });
});
