import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { AuthProvider } from './features/auth/AuthProvider';
import { APP_MODULES } from './features/permissions/moduleAccess';

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
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
      signOut: vi.fn(),
    },
  };
}

function createNavigationPermissionsQuery() {
  return {
    select: vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({
        data: APP_MODULES.map((module) => ({
          module_key: module.key,
          role_key: 'admin',
          is_visible: true,
        })),
        error: null,
      }),
    }),
  };
}

function createIdPaginatedQuery(data: unknown[]) {
  return {
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        gt: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data, error: null }),
        }),
      }),
    }),
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

    expect(await screen.findByRole('heading', { name: 'Connexion à SeaPilot' })).toBeInTheDocument();
  });

  it('opens the Planning application directly with safe demo data on a preview deployment', async () => {
    const client = createAuthClient();

    render(
      <AuthProvider client={client as never}>
        <MemoryRouter initialEntries={['/login']}>
          <App previewModeOverride />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText('Préversion · données de démonstration')).toBeInTheDocument();
    expect(document.querySelector('.content-area')).toHaveTextContent('Planning BBTM');
    expect(screen.getByRole('button', { name: 'Nouveau projet' })).toBeInTheDocument();
    expect(screen.getAllByText('GOURY').length).toBeGreaterThan(0);
    expect(screen.queryByText('NAVIRES SANS EQUIPAGE')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Connexion à SeaPilot' })).not.toBeInTheDocument();
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

      if (table === 'role_module_permissions') {
        return createNavigationPermissionsQuery();
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

      if (table === 'role_module_permissions') {
        return createNavigationPermissionsQuery();
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

  it('renders the daily progress report module with imported DPR data', async () => {
    vi.stubEnv('VITE_APP_BASE_URL', 'https://sea-pilot-ten.vercel.app');
    supabaseMock.from.mockReset();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'user_roles') {
        return {
          select: vi.fn().mockResolvedValue({ data: [{ role_key: 'admin' }], error: null }),
        };
      }

      if (table === 'role_module_permissions') {
        return createNavigationPermissionsQuery();
      }

      if (table === 'dpr_items') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 1200,
                    title: 'DPR 2026-07-01',
                    project_id: 880,
                    project_sharepoint_item_id: '880',
                    project_code: 'P-2026-014',
                    project_title: 'Campagne Atlantique 2026',
                    vessel_id: 12,
                    vessel_sharepoint_item_id: '12',
                    vessel_name: 'COTENTIN',
                    report_date: '2026-07-01',
                    report_time: '18:30',
                    description: 'Transit et mesures',
                    fuel_consumption_l: 1250.5,
                    mgo_refueling_m3: 12.5,
                    qhse_note: 'RAS',
                    radio_contact: true,
                    environment_incident_count: 1,
                    person_accident_count: 0,
                    dangerous_situation_count: 2,
                    source_label: 'SharePoint',
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'dpr_archives') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 1201,
                    dpr_item_id: 1200,
                    dpr_sharepoint_item_id: '1200',
                    project_id: 880,
                    project_sharepoint_item_id: '880',
                    project_code: 'P-2026-014',
                    project_title: 'Campagne Atlantique 2026',
                    report_date: '2026-07-01',
                    title: 'DPR P-2026-014 2026-07-01.pdf',
                    source_label: 'SharePoint',
                    source_sharepoint_id: '1201',
                    file_url: 'https://sharepoint.test/dpr.pdf',
                    notes: '/sites/QHSE/DPR/P-2026-014/DPR-2026-07-01.pdf',
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'mgo_prices') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 44,
                  price_date: '2026-07-01',
                  price_ht: 812.45,
                  currency: 'EUR',
                  supplier_name: 'TotalEnergies',
                  title: 'MGO juillet 2026',
                  notes: 'Prix mensuel',
                  source_label: 'SharePoint',
                },
              ],
              error: null,
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });
    const client = createAuthClient({ user: { id: 'user-1' } });

    render(
      <AuthProvider client={client as never}>
        <MemoryRouter initialEntries={['/modules/dpr']}>
          <App />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Daily Progress Report' })).toBeInTheDocument();
    expect(screen.getByLabelText('Rapports DPR')).toHaveTextContent('1');
    expect(screen.getByLabelText('Archives DPR importees')).toHaveTextContent('1');
    expect(screen.getAllByText('Campagne Atlantique 2026').length).toBeGreaterThan(0);
    expect(screen.getAllByText('P-2026-014').length).toBeGreaterThan(0);
    expect(screen.getByText('Transit et mesures')).toBeInTheDocument();
    expect(screen.getByText('MGO juillet 2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir le fichier DPR P-2026-014 2026-07-01.pdf' })).toHaveAttribute(
      'href',
      'https://sharepoint.test/dpr.pdf',
    );
    expect(screen.queryByText('Module pret pour migration depuis le Dashboard BBTM.')).not.toBeInTheDocument();
  });

  it('renders the projects module with imported projects and documents', async () => {
    vi.stubEnv('VITE_APP_BASE_URL', 'https://sea-pilot-ten.vercel.app');
    supabaseMock.from.mockReset();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'user_roles') {
        return {
          select: vi.fn().mockResolvedValue({ data: [{ role_key: 'admin' }], error: null }),
        };
      }

      if (table === 'role_module_permissions') {
        return createNavigationPermissionsQuery();
      }

      if (table === 'projects') {
        return createIdPaginatedQuery([
          {
            id: 880,
            title: 'Campagne Atlantique 2026',
            project_code: 'P-2026-014',
            client_id: 50,
            client_sharepoint_item_id: '50',
            client_name: 'Ifremer',
            primary_vessel_id: 12,
            primary_vessel_sharepoint_item_id: '12',
            primary_vessel_name: 'COTENTIN',
            secondary_vessel_id: null,
            secondary_vessel_sharepoint_item_id: null,
            secondary_vessel_name: null,
            starts_on: '2026-07-01',
            ends_on: '2026-07-15',
            status: 'Contrat Signe',
            description: 'Campagne bathymetrie',
            source_label: 'SharePoint',
          },
        ]);
      }

      if (table === 'project_contracts') {
        return createIdPaginatedQuery([]);
      }

      if (table === 'project_documents') {
        return createIdPaginatedQuery([
          {
            id: 881,
            project_id: 880,
            project_sharepoint_item_id: '880',
            project_code: 'P-2026-014',
            project_title: 'Campagne Atlantique 2026',
            category_key: 'planning',
            title: 'Plan projet Atlantique.pdf',
            source_label: 'SharePoint',
            source_sharepoint_id: '881',
            file_url: 'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Projets/P-2026-014/plan.pdf',
            notes: '/sites/QHSE/Documents Projets/P-2026-014/plan.pdf',
          },
        ]);
      }

      if (table === 'contract_documents') {
        return createIdPaginatedQuery([
          {
            id: 882,
            project_id: 880,
            project_sharepoint_item_id: '880',
            project_code: 'P-2026-014',
            project_title: 'Campagne Atlantique 2026',
            category_key: 'contract',
            title: 'Contrat Atlantique signe.pdf',
            source_label: 'SharePoint',
            source_sharepoint_id: '882',
            file_url: 'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Contractuels/P-2026-014/contrat.pdf',
            notes: '/sites/QHSE/Documents Contractuels/P-2026-014/contrat.pdf',
          },
        ]);
      }

      if (table === 'clients') {
        return createIdPaginatedQuery([
          {
            id: 50,
            name: 'Ifremer',
            code: 'IFR',
            email: 'contact@ifremer.test',
            phone: '',
            address: '',
            city: 'Brest',
            country: 'France',
            active: true,
            source_label: 'SharePoint',
          },
        ]);
      }

      throw new Error(`Unexpected table ${table}`);
    });
    const client = createAuthClient({ user: { id: 'user-1' } });

    render(
      <AuthProvider client={client as never}>
        <MemoryRouter initialEntries={['/modules/projects']}>
          <App />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Projets' })).toBeInTheDocument();
    expect(screen.getByLabelText('Projets actifs')).toHaveTextContent('1');
    expect(screen.getByLabelText('Documents projets')).toHaveTextContent('1');
    expect(screen.getByLabelText('Documents contractuels')).toHaveTextContent('1');
    expect(screen.getAllByText('Campagne Atlantique 2026').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Campagne Atlantique 2026P-2026-014/ })).toHaveTextContent('P-2026-014');
    expect(screen.getAllByText('Ifremer').length).toBeGreaterThan(0);
    expect(screen.getAllByText('COTENTIN').length).toBeGreaterThan(0);
    expect(screen.getByText('Contrat Atlantique signe.pdf')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Opérations' }));
    expect(screen.getByText('Plan projet Atlantique.pdf')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ouvrir dans SharePoint.*Plan projet Atlantique.pdf/ })).toHaveAttribute(
      'href',
      'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Projets/P-2026-014/plan.pdf',
    );
    expect(screen.queryByText('Module pret pour migration depuis le Dashboard BBTM.')).not.toBeInTheDocument();
  });

  it("renders the purchase requests module with imported requests", async () => {
    vi.stubEnv('VITE_APP_BASE_URL', 'https://sea-pilot-ten.vercel.app');
    supabaseMock.from.mockReset();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'user_roles') {
        return {
          select: vi.fn().mockResolvedValue({ data: [{ role_key: 'admin' }], error: null }),
        };
      }

      if (table === 'role_module_permissions') {
        return createNavigationPermissionsQuery();
      }

      if (table === 'purchase_requests') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 700,
                    request_number: 'DA-2026-001',
                    title: 'DA-2026-001',
                    requested_on: '2026-07-02',
                    requester_name: 'Julien LECOCQ',
                    supplier_name: 'Chantier Naval Manche',
                    project_id: 880,
                    project_sharepoint_item_id: '880',
                    project_code: 'P-2026-014',
                    project_title: 'Campagne Atlantique 2026',
                    amount_ht: 12500.5,
                    currency: 'EUR',
                    status: 'En cours',
                    description: 'Achat capteurs',
                    source_label: 'SharePoint',
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
        <MemoryRouter initialEntries={['/modules/purchaseRequests']}>
          <App />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByRole('heading', { name: "Demandes d'achat" })).toBeInTheDocument();
    expect(screen.getByLabelText('Demandes achat')).toHaveTextContent('1');
    expect(screen.getByLabelText('Demandes en cours')).toHaveTextContent('1');
    expect(screen.getByLabelText('Montant HT')).toHaveTextContent('12');
    expect(screen.getByLabelText('Fournisseurs achats')).toHaveTextContent('1');
    expect(screen.getAllByText('DA-2026-001').length).toBeGreaterThan(0);
    expect(screen.getByText('Achat capteurs')).toBeInTheDocument();
    expect(screen.getAllByText('Chantier Naval Manche').length).toBeGreaterThan(0);
    expect(screen.getAllByText('P-2026-014').length).toBeGreaterThan(0);
    expect(screen.queryByText('Module pret pour migration depuis le Dashboard BBTM.')).not.toBeInTheDocument();
  });

  it("renders the action plan module with imported audits and progress sheets", async () => {
    vi.stubEnv('VITE_APP_BASE_URL', 'https://sea-pilot-ten.vercel.app');
    supabaseMock.from.mockReset();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'user_roles') {
        return {
          select: vi.fn().mockResolvedValue({ data: [{ role_key: 'admin' }], error: null }),
        };
      }

      if (table === 'role_module_permissions') {
        return createNavigationPermissionsQuery();
      }

      if (table === 'action_items') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 810,
                    project_id: 880,
                    project_sharepoint_item_id: '880',
                    project_code: 'P-2026-014',
                    project_title: 'Campagne Atlantique 2026',
                    vessel_id: 12,
                    vessel_sharepoint_item_id: '12',
                    vessel_name: 'COTENTIN',
                    category_key: 'audit',
                    action_type: 'Audit',
                    audit_type: 'Interne',
                    title: 'Audit pont COTENTIN',
                    status: 'Ouvert',
                    priority_label: 'Haute',
                    opened_on: '2026-07-03',
                    due_on: '2026-07-31',
                    owner_name: 'Arthur MAREST',
                    auditor_name: 'Jean MARTIN',
                    description: 'Controle pont',
                    corrective_action: 'Remplacer garde-corps',
                    source_label: 'SharePoint',
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'action_documents') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 811,
                    action_item_id: 810,
                    action_sharepoint_item_id: '810',
                    action_title: 'Audit pont COTENTIN',
                    category_key: 'progress_sheet',
                    title: 'FP Audit pont COTENTIN.pdf',
                    source_label: 'SharePoint',
                    source_sharepoint_id: '811',
                    file_url: 'https://sharepoint.test/fiche-progres/audit-pont.pdf',
                    notes: '/sites/QHSE/Fiche de Progres/FP Audit pont COTENTIN.pdf',
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
        <MemoryRouter initialEntries={['/modules/actionPlan']}>
          <App />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByRole('heading', { name: "Plan d'action" })).toBeInTheDocument();
    expect(screen.getByLabelText('Actions ouvertes')).toHaveTextContent('1');
    expect(screen.getByLabelText('Actions haute priorite')).toHaveTextContent('1');
    expect(screen.getByLabelText('Echeances actions')).toHaveTextContent('1');
    expect(screen.getByLabelText('Fiches progres')).toHaveTextContent('1');
    expect(screen.getAllByText('Audit pont COTENTIN').length).toBeGreaterThan(0);
    expect(screen.getByText('Controle pont')).toBeInTheDocument();
    expect(screen.getByText('Remplacer garde-corps')).toBeInTheDocument();
    expect(screen.getAllByText('P-2026-014').length).toBeGreaterThan(0);
    expect(screen.getAllByText('COTENTIN').length).toBeGreaterThan(0);
    expect(screen.getByText('FP Audit pont COTENTIN.pdf')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir le fichier FP Audit pont COTENTIN.pdf' })).toHaveAttribute(
      'href',
      'https://sharepoint.test/fiche-progres/audit-pont.pdf',
    );
    expect(screen.queryByText('Module pret pour migration depuis le Dashboard BBTM.')).not.toBeInTheDocument();
  });

  it('renders the QHSE document module with imported document libraries', async () => {
    vi.stubEnv('VITE_APP_BASE_URL', 'https://sea-pilot-ten.vercel.app');
    supabaseMock.from.mockReset();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'user_roles') {
        return {
          select: vi.fn().mockResolvedValue({ data: [{ role_key: 'admin' }], error: null }),
        };
      }

      if (table === 'role_module_permissions') {
        return createNavigationPermissionsQuery();
      }

      const rowsByTable: Record<string, unknown[]> = {
        fleet_documents: [],
        lifting_reports: [],
        service_notes: [],
        shared_documents: [],
        safety_alerts: [
          {
            id: 1507,
            person_id: null,
            person_sharepoint_item_id: '',
            person_name: '',
            vessel_id: null,
            vessel_sharepoint_item_id: '',
            vessel_name: '',
            category_key: 'Pont',
            document_date: '2026-06-20',
            expires_on: '',
            revision_label: '',
            status: 'Publie',
            title: 'Alerte securite pont.pdf',
            source_label: 'SharePoint',
            source_sharepoint_id: '1507',
            file_url: 'https://sharepoint.test/alerte-securite.pdf',
            notes: '/sites/QHSE/Alerte Securite/alerte.pdf',
          },
        ],
        technical_documents: [
          {
            id: 1508,
            person_id: null,
            person_sharepoint_item_id: '',
            person_name: '',
            vessel_id: 12,
            vessel_sharepoint_item_id: '12',
            vessel_name: 'COTENTIN',
            category_key: 'Moteur',
            document_date: '2026-06-01',
            expires_on: '',
            revision_label: 'A',
            status: 'Valide',
            title: 'Notice moteur COTENTIN.pdf',
            source_label: 'SharePoint',
            source_sharepoint_id: '1508',
            file_url: 'https://sharepoint.test/notice-moteur.pdf',
            notes: '/sites/QHSE/Documentation Technique/COTENTIN/moteur.pdf',
          },
        ],
        vessel_equipment_documents: [],
        work_permits: [],
      };

      if (table in rowsByTable) {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: rowsByTable[table], error: null }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });
    const client = createAuthClient({ user: { id: 'user-1' } });

    render(
      <AuthProvider client={client as never}>
        <MemoryRouter initialEntries={['/modules/qhse']}>
          <App />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'QHSE documentaire' })).toBeInTheDocument();
    expect(screen.getByLabelText('Documents QHSE')).toHaveTextContent('2');
    expect(screen.getByLabelText('Alertes securite')).toHaveTextContent('1');
    expect(screen.getByText('Alerte securite pont.pdf')).toBeInTheDocument();
    expect(screen.getByText('Notice moteur COTENTIN.pdf')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir le fichier Alerte securite pont.pdf' })).toHaveAttribute(
      'href',
      'https://sharepoint.test/alerte-securite.pdf',
    );
    expect(screen.queryByText('Module pret pour migration depuis le Dashboard BBTM.')).not.toBeInTheDocument();
  });
});
