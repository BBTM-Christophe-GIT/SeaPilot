import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
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
    expect(screen.getByText('Projets')).toBeInTheDocument();
    expect(screen.getByText('app.bbtm.fr')).toBeInTheDocument();
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
    const select = vi.fn().mockResolvedValue({ data: [{ role_key: 'direction' }], error: null });
    const roleClient = {
      from: vi.fn().mockReturnValue({ select }),
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
    expect(select).toHaveBeenCalledWith('role_key');
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
});
