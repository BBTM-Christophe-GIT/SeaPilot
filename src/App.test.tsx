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
    supabaseMock.from.mockReset();
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

  it('renders the procedures module with imported QHSE procedures and publications', async () => {
    vi.stubEnv('VITE_APP_BASE_URL', 'https://sea-pilot-ten.vercel.app');
    supabaseMock.from.mockReset();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'user_roles') {
        return {
          select: vi.fn().mockResolvedValue({ data: [{ role_key: 'admin' }], error: null }),
        };
      }

      if (table === 'procedures') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 12,
                    procedure_code: 'QSMS-OPS-01',
                    title: 'Procedure embarquement ROZEL',
                    status: 'approved',
                    revision_label: 'Rev. 4',
                    published_on: '2026-03-15',
                    source_label: 'SharePoint',
                    file_url: 'https://sharepoint.test/procedure.docx',
                    notes: 'Document source QSMS',
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'published_procedures') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 32,
                    procedure_id: 12,
                    procedure_sharepoint_item_id: '12',
                    procedure_code: 'QSMS-OPS-01',
                    title: 'Procedure embarquement ROZEL PDF',
                    status: 'approved',
                    revision_label: 'Rev. 4',
                    published_on: '2026-03-20',
                    source_label: 'SharePoint PDF',
                    file_url: 'https://sharepoint.test/procedure.pdf',
                    notes: 'Publication signee',
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
        <MemoryRouter initialEntries={['/modules/procedures']}>
          <App />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Procedures QHSE' })).toBeInTheDocument();
    expect(screen.getByLabelText('Procedures approuvees')).toHaveTextContent('1');
    expect(screen.getByText('Procedure embarquement ROZEL')).toBeInTheDocument();
    expect(screen.getAllByText('QSMS-OPS-01').length).toBeGreaterThan(0);
    expect(screen.getByText('Procedure embarquement ROZEL PDF')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir le fichier Procedure embarquement ROZEL PDF' })).toHaveAttribute(
      'href',
      'https://sharepoint.test/procedure.pdf',
    );
    expect(screen.queryByText('Module pret pour migration depuis le Dashboard BBTM.')).not.toBeInTheDocument();
  });
});
