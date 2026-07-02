import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { AuthProvider } from './features/auth/AuthProvider';

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('./lib/supabaseClient', () => ({
  getSupabaseClient: vi.fn(() => supabaseMock),
  supabase: supabaseMock,
}));

function createAuthClient(session: { user: { id: string } } | null = null) {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  };
}

describe('App', () => {
  it('redirects private routes to the login page', async () => {
    const client = createAuthClient();

    render(
      <AuthProvider client={client as never}>
        <MemoryRouter initialEntries={['/modules/projects']}>
          <App />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Connexion a SeaPilot' })).toBeInTheDocument();
  });

  it('renders the fleet certificates module with imported certificate data', async () => {
    vi.stubEnv('VITE_APP_BASE_URL', 'https://sea-pilot-ten.vercel.app');
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'user_roles') {
        return {
          select: vi.fn().mockResolvedValue({ data: [{ role_key: 'admin' }], error: null }),
        };
      }

      if (table === 'fleet_certificates') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 42,
                    vessel_id: 1,
                    vessel_name: 'COTENTIN',
                    category_key: 'navigation',
                    title: 'Permis de navigation COTENTIN',
                    status: 'valid',
                    issued_on: '2025-01-10',
                    expires_on: '2026-09-15',
                    source_label: 'SharePoint',
                    file_url: 'https://sharepoint.test/certificat.pdf',
                    notes: 'Archive flotte',
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });
    const client = createAuthClient({ user: { id: 'user-1' } });

    render(
      <AuthProvider client={client as never}>
        <MemoryRouter initialEntries={['/modules/certificates']}>
          <App />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Certificats flotte' })).toBeInTheDocument();
    expect(screen.getByLabelText('Certificats valides')).toHaveTextContent('1');
    expect(screen.getByText('Permis de navigation COTENTIN')).toBeInTheDocument();
    expect(screen.getAllByText('COTENTIN').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Ouvrir le fichier Permis de navigation COTENTIN' })).toHaveAttribute(
      'href',
      'https://sharepoint.test/certificat.pdf',
    );
    expect(screen.queryByText('Module pret pour migration depuis le Dashboard BBTM.')).not.toBeInTheDocument();
  });
});
