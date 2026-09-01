import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectsPage } from './ProjectsPage';

const documentGenerationMocks = vi.hoisted(() => ({
  downloadGeneratedProjectDocument: vi.fn(),
  generateProjectDocument: vi.fn(),
}));

const documentStorageMocks = vi.hoisted(() => ({
  storeGeneratedProjectDocument: vi.fn(),
  storeOperationDocuments: vi.fn(),
}));

vi.mock('./projectDocumentGeneration', () => documentGenerationMocks);
vi.mock('./projectDocumentStorage', async (importOriginal) => ({
  ...await importOriginal<typeof import('./projectDocumentStorage')>(),
  ...documentStorageMocks,
}));

const atlantiqueProjectRow = {
  archived_at: null,
  charter_ends_at: '2026-07-15T18:00:00+02:00',
  charter_starts_at: '2026-07-01T08:00:00+02:00',
  client_id: 50,
  client_name: 'Ifremer',
  client_sharepoint_item_id: '50',
  contract_type: 'SUPPLYTIME 2017',
  delivery_at: '2026-07-01T08:00:00+02:00',
  delivery_port: 'Brest',
  description: 'Campagne bathymétrie',
  ends_on: '2026-07-15',
  id: 880,
  is_diving_support: false,
  is_rov_support: true,
  operation_area: 'Atlantique Nord',
  primary_vessel_id: 12,
  primary_vessel_name: 'COTENTIN',
  primary_vessel_sharepoint_item_id: '12',
  project_code: 'P1086',
  redelivery_at: '2026-07-15T18:00:00+02:00',
  redelivery_port: 'Saint-Nazaire',
  secondary_vessel_id: null,
  secondary_vessel_name: null,
  secondary_vessel_sharepoint_item_id: null,
  sharepoint_item_id: '880',
  sharepoint_list_title: 'BBTM - Projets',
  source_label: 'SharePoint',
  source_modified_at: '2026-07-14T12:00:00Z',
  starts_on: '2026-07-01',
  status: 'Contrat signé',
  title: 'Campagne Atlantique 2026',
  updated_at: '2026-07-15T10:00:00Z',
};

const mancheProjectRow = {
  ...atlantiqueProjectRow,
  charter_ends_at: '2026-08-12T18:00:00+02:00',
  charter_starts_at: '2026-08-01T08:00:00+02:00',
  client_id: 51,
  client_name: 'Cerema',
  client_sharepoint_item_id: '51',
  delivery_at: '2026-08-01T08:00:00+02:00',
  delivery_port: 'Cherbourg',
  description: 'Préparation dragage',
  ends_on: '2026-08-12',
  id: 881,
  is_rov_support: false,
  operation_area: 'Manche',
  primary_vessel_id: 13,
  primary_vessel_name: 'SUROIT',
  primary_vessel_sharepoint_item_id: '13',
  project_code: 'P1087',
  redelivery_at: '2026-08-12T18:00:00+02:00',
  redelivery_port: 'Le Havre',
  sharepoint_item_id: '881',
  starts_on: '2026-08-01',
  status: 'Offre transmise',
  title: 'Campagne Manche 2026',
};

const atlantiqueContractRow = {
  archived_at: null,
  auto_extension_period: 'Voyage',
  charter_hire: 12000,
  demobilisation_fee: 1000,
  extension_count: 1,
  extension_duration: 5,
  extension_hire: 13000,
  extension_unit: 'jours',
  fee_currency: 'EUR',
  hire_currency: 'EUR',
  hire_unit: 'jour',
  id: 10,
  max_audit_period: '30 jours',
  max_extension_days: 10,
  mobilisation_fee: 2000,
  owner_identity: 'Armateur BBTM, Brest',
  project_id: 880,
  sharepoint_item_id: '880',
  sharepoint_list_title: 'BBTM - Projets',
  source_label: 'SharePoint',
  source_modified_at: '2026-07-14T12:00:00Z',
  supplytime_data: {
    box05_cancelling_date: '30 juin 2026 à 18 h',
    box20_charter_hire: '12 000 EUR par jour',
    box34_additional_clauses: 'Clauses particulières Atlantique',
  },
  supplytime_schema_version: 'supplytime-2017-v1',
  vessel_assignment_limit: 'Europe occidentale',
};

const atlantiqueHirePeriodRow = {
  id: 101,
  project_id: 880,
  contract_id: 10,
  starts_on: '2026-07-01',
  ends_on: null,
  charter_hire: 12000,
  hire_currency: 'EUR',
  hire_unit: 'jour',
};

const atlantiqueProjectDocumentRow = {
  category_key: 'planning',
  file_extension: 'pdf',
  file_name: 'Plan projet Atlantique.pdf',
  file_size_bytes: 2048,
  file_url: 'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Projets/P1086/plan-atlantique.pdf',
  folder_path: '/sites/QHSE/Documents Projets/P1086',
  id: 882,
  is_folder: false,
  mime_type: 'application/pdf',
  notes: '',
  project_code: 'P1086',
  project_id: 880,
  project_sharepoint_item_id: '880',
  project_title: 'Campagne Atlantique 2026',
  sharepoint_item_id: '882',
  sharepoint_drive_id: 'drive-projects',
  sharepoint_drive_item_id: 'item-882',
  sharepoint_list_id: 'list-projects',
  sharepoint_list_title: 'Documents Projets',
  source_label: 'SharePoint',
  source_modified_at: '2026-07-14T12:00:00Z',
  source_sharepoint_id: '882',
  title: 'Plan projet Atlantique.pdf',
};

const mancheProjectDocumentRow = {
  ...atlantiqueProjectDocumentRow,
  file_name: 'Plan projet Manche.pdf',
  file_url: 'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Projets/P1087/plan-manche.pdf',
  id: 883,
  project_code: 'P1087',
  project_id: 881,
  project_sharepoint_item_id: '881',
  project_title: 'Campagne Manche 2026',
  sharepoint_drive_item_id: 'item-883',
  sharepoint_item_id: '883',
  title: 'Plan projet Manche.pdf',
};

const atlantiqueContractDocumentRow = {
  ...atlantiqueProjectDocumentRow,
  category_key: 'contract',
  file_name: 'Contrat Atlantique signé.pdf',
  file_url: 'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Contractuels/P1086/contrat-atlantique.pdf',
  folder_path: '/sites/QHSE/Documents Contractuels/P1086',
  id: 884,
  sharepoint_item_id: '884',
  sharepoint_drive_id: 'drive-contracts',
  sharepoint_drive_item_id: 'item-884',
  sharepoint_list_id: 'list-contracts',
  sharepoint_list_title: 'Documents Contractuels',
  storage_bucket: 'project-files',
  storage_migrated_at: '2026-08-29T06:45:00Z',
  storage_path: 'projects/880/contract-documents/884-Contrat-Atlantique-signe.pdf',
  storage_sha256: 'a'.repeat(64),
  title: 'Contrat Atlantique signé.pdf',
};

const ifremerClientRow = {
  active: true,
  address: '',
  archived_at: null,
  city: 'Brest',
  code: 'IFR',
  country: 'France',
  email: 'contact@ifremer.test',
  id: 50,
  name: 'Ifremer',
  phone: '',
  postal_code: '29200',
  sharepoint_item_id: '50',
  sharepoint_list_title: 'BBTM - Clients',
  source_label: 'SharePoint',
  source_modified_at: '2026-07-14T12:00:00Z',
  updated_at: '2026-07-15T10:00:00Z',
};

const ceremaClientRow = { ...ifremerClientRow, city: 'Rouen', code: 'CER', email: '', id: 51, name: 'Cerema' };

const atlantiquePlanningOccurrenceRows = [
  {
    catalog_project_id: 880,
    created_at: '2026-06-01T08:00:00Z',
    description: 'Rotation 1',
    charter_hire: 12000,
    hire_currency: 'EUR',
    hire_unit: 'jour',
    ends_on: '2026-07-03',
    id: 1201,
    primary_vessel_id: 12,
    primary_vessel_name: 'COTENTIN',
    source_label: 'SeaPilot',
    starts_on: '2026-07-01',
    status: 'Planifié',
  },
  {
    catalog_project_id: 880,
    created_at: '2026-06-05T08:00:00Z',
    description: 'Rotation 2',
    charter_hire: 13500,
    hire_currency: 'EUR',
    hire_unit: 'jour',
    ends_on: '2026-07-10',
    id: 1202,
    primary_vessel_id: 12,
    primary_vessel_name: 'COTENTIN',
    source_label: 'SeaPilot',
    starts_on: '2026-07-08',
    status: 'À planifier',
  },
];

interface MockSource {
  data: unknown[] | null;
  error: unknown;
}

function createClient(
  overrides: Partial<Record<string, MockSource>> = {},
  rpcResult: { data: unknown; error: unknown } = {
    data: { id: 990, project_code: 'P1196', title: 'Projet SeaPilot', updated_at: '2026-07-16T08:00:00Z' },
    error: null,
  },
) {
  const sources: Record<string, MockSource> = {
    clients: { data: [ifremerClientRow, ceremaClientRow], error: null },
    contract_documents: { data: [atlantiqueContractDocumentRow], error: null },
    planning_projects: { data: atlantiquePlanningOccurrenceRows, error: null },
    project_contracts: { data: [atlantiqueContractRow], error: null },
    project_contract_hire_periods: { data: [atlantiqueHirePeriodRow], error: null },
    project_documents: { data: [atlantiqueProjectDocumentRow, mancheProjectDocumentRow], error: null },
    project_generated_documents: { data: [], error: null },
    projects: { data: [atlantiqueProjectRow, mancheProjectRow], error: null },
    vessels: {
      data: [
        { id: 12, name: 'COTENTIN', acronym: 'COT', active: true, fleet_exit_on: null, sharepoint_item_id: '12' },
        { id: 13, name: 'SUROIT', acronym: 'SUR', active: true, fleet_exit_on: null, sharepoint_item_id: '13' },
      ],
      error: null,
    },
    ...overrides,
  };
  const from = vi.fn((table: string) => {
    const result = sources[table] || { data: [], error: null };
    const promise = Promise.resolve(result);
    const query: Record<string, unknown> = {
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
    };
    query.select = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.is = vi.fn(() => query);
    query.lte = vi.fn(() => query);
    query.or = vi.fn(() => query);
    query.order = vi.fn(() => query);
    query.gt = vi.fn(() => query);
    query.limit = vi.fn(() => query);
    query.maybeSingle = vi.fn(() => Promise.resolve({
      data: Array.isArray(result.data) ? result.data[0] || null : result.data,
      error: result.error,
    }));
    return query;
  });

  const rpc = vi.fn().mockImplementation((functionName: string) => (
    functionName === 'projects_planning_occurrences'
      ? Promise.resolve({ data: atlantiquePlanningOccurrenceRows, error: null })
      : functionName === 'projects_contracts'
        ? Promise.resolve(sources.project_contracts)
      : Promise.resolve(rpcResult)
  ));
  const createSignedUrl = vi.fn().mockResolvedValue({
    data: { signedUrl: 'https://storage.example/project-attachment-signed' },
    error: null,
  });
  const storage = { from: vi.fn(() => ({ createSignedUrl })) };
  return { client: { from, rpc, storage }, createSignedUrl, from, rpc };
}

describe('ProjectsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    documentGenerationMocks.generateProjectDocument.mockResolvedValue({
      blob: new Blob(['pdf'], { type: 'application/pdf' }),
      fileName: 'P1086 - Offre - R1.pdf',
      mimeType: 'application/pdf',
    });
    documentStorageMocks.storeGeneratedProjectDocument.mockResolvedValue({
      fileName: 'P1086 - Offre - R1.pdf',
      folderPath: 'projects/880/generated/bimco_supplytime/r1',
      id: 1,
      storageBucket: 'project-files',
      storagePath: 'projects/880/generated/bimco_supplytime/r1/P1086-BIMCO-R1.pdf',
      webUrl: '',
    });
    documentStorageMocks.storeOperationDocuments.mockResolvedValue({ failed: [], stored: [] });
  });

  it('filters projects and associated indicators by status, client, vessel, period and search', async () => {
    const user = userEvent.setup();
    const { client } = createClient();

    render(<ProjectsPage client={client as never} roles={['direction']} />);

    expect(await screen.findByRole('heading', { name: 'Projets' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Filtres' }));
    await user.selectOptions(screen.getByLabelText('Filtre statut projet'), 'Non validé');
    await user.selectOptions(screen.getByLabelText('Filtre client projet'), 'Ifremer');
    await user.selectOptions(screen.getByLabelText('Filtre navire projet'), 'COTENTIN');
    fireEvent.change(screen.getByLabelText('Projet depuis'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('Projet jusqu’au'), { target: { value: '2026-07-31' } });
    await user.type(screen.getByLabelText('Rechercher un contrat'), 'bathymetrie');

    await waitFor(() => expect(screen.queryByText('Préparation dragage')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Indicateurs des contrats')).toHaveTextContent('1 actifs');
    expect(screen.getByLabelText('Indicateurs des contrats')).toHaveTextContent('1 contrats');
  });

  it('replaces direct client commands with the two searchable catalogues', async () => {
    const user = userEvent.setup();
    const { client } = createClient();

    render(<ProjectsPage client={client as never} roles={['direction']} />);

    await screen.findByRole('heading', { name: 'Projets' });
    expect(screen.getByRole('link', { name: 'Éléments de facturation' }))
      .toHaveAttribute('href', '/modules/billingElements');
    expect(screen.queryByRole('button', { name: 'Nouveau client' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier le client' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Liste des clients' }));
    expect(screen.getByRole('dialog', { name: 'Liste des clients' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Rechercher un client' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.getByRole('button', { name: 'Liste des remorqués' })).toBeInTheDocument();
  });

  it('selects a project and exposes its six read-only sections as accessible tabs', async () => {
    const user = userEvent.setup();
    const { client, createSignedUrl, from } = createClient({
      project_generated_documents: {
        data: [{
          id: 73,
          project_id: 880,
          planning_occurrence_id: null,
          document_type: 'project_attachment',
          category_key: 'toilette_de_mer',
          subcategory_key: 'toilette_de_mer_attestation_expert_bv',
          expires_on: null,
          file_name: 'Attestation Expert BV.pdf',
          mime_type: 'application/pdf',
          file_size_bytes: 512,
          sharepoint_web_url: null,
          sharepoint_folder_path: null,
          storage_bucket: 'project-files',
          storage_path: 'projects/880/attachments/toilette_de_mer/attestation.pdf',
          created_at: '2026-08-29T06:00:00Z',
        }],
        error: null,
      },
    });

    render(<ProjectsPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Projets' });
    const projectButton = screen.getByRole('button', { name: /P1086 Campagne Atlantique 2026/ });
    await user.click(projectButton);

    expect(projectButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('tablist', { name: 'Sections du projet' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Identité & contrat',
      'Opérations',
      'Facturation',
      'Conditions commerciales',
      'Document contractuel',
      'Documents',
    ]);
    expect(screen.getByRole('tab', { name: 'Identité & contrat' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Opérations' }));
    expect(screen.getByText('Rotation 1')).toBeInTheDocument();
    expect(screen.getAllByText(/12.000 EUR \/ jour/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('tab', { name: 'Document contractuel' }));
    expect(screen.getByText('Clauses particulières Atlantique')).toBeInTheDocument();
    expect(screen.queryByText('Données structurées consultées dans Supabase')).not.toBeInTheDocument();
    expect(screen.queryByText('Source structurée · Supabase')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nouvelle opération' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Identité & contrat' }));
    expect(screen.getAllByText('Armateur BBTM, Brest').length).toBeGreaterThan(0);
    expect(screen.queryByText('Clauses particulières Atlantique')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Documents' }));
    expect(screen.getByText('Attestation Expert BV.pdf')).toBeInTheDocument();
    expect(screen.getByText(/Toilette de Mer · Attestation Expert\/BV/)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Ouvrir le document.*Attestation Expert BV.pdf/ })).toHaveAttribute(
      'href',
      'https://storage.example/project-attachment-signed',
    );
    expect(createSignedUrl).toHaveBeenCalledWith('projects/880/attachments/toilette_de_mer/attestation.pdf', 300);
    expect(screen.getByRole('link', { name: /Ouvrir dans SharePoint.*Plan projet Atlantique.pdf/ })).toHaveAttribute(
      'href',
      'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Projets/P1086/plan-atlantique.pdf',
    );
    screen.getByRole('tab', { name: 'Opérations' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Facturation' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Inclure les services refacturables dans le PDF')).toBeInTheDocument();
    expect(screen.getByLabelText('Inclure la prestation BBTM dans le PDF')).toBeInTheDocument();
    expect(within(screen.getByText('Prestation BBTM').closest('article')!).getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.queryByLabelText('Inclure cette prestation dans le PDF')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Inclure les loyers dans le PDF')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Affich.*PDF/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ajouter projet/i })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(from.mock.calls.map(([table]) => table)).toEqual(
        expect.arrayContaining([
          'projects',
          'project_contract_hire_periods',
          'project_documents',
          'contract_documents',
          'project_generated_documents',
          'clients',
          'project_billing_periods',
          'project_billing_services',
          'project_chargeable_expenses',
          'project_billing_documents',
          'service_providers',
        ]),
      );
    });
  });

  it('searches suppliers by specialty and opens the Supabase company dialog', async () => {
    const user = userEvent.setup();
    const { client } = createClient({
      project_billing_periods: {
        data: [{
          id: 501,
          company_id: 1,
          project_id: 880,
          period_month: '2026-09-01',
          amount_ht: 0,
          include_operations_in_pdf: true,
          include_expenses_in_pdf: true,
          include_bbtm_in_pdf: true,
          excluded_operation_keys: [],
        }],
        error: null,
      },
      service_providers: {
        data: [{
          id: 701,
          company_id: 1,
          name: 'Würth',
          category: 'Approvisionnement',
          service_type: 'Matériel et fournitures',
          active: true,
          merged_into_provider_id: null,
          specialties: [],
          contacts: [],
        }, {
          id: 702,
          company_id: 1,
          name: 'SERVAUX',
          category: 'Prestataire de Service',
          service_type: 'Radeaux',
          active: true,
          merged_into_provider_id: null,
          specialties: [],
          contacts: [],
        }],
        error: null,
      },
    });

    render(<ProjectsPage client={client as never} roles={['direction']} />);
    await user.click(await screen.findByRole('button', { name: /P1086 Campagne Atlantique 2026/ }));
    await user.click(screen.getByRole('tab', { name: 'Facturation' }));
    const addExpenseButton = await screen.findByRole('button', { name: 'Ajouter un frais' });
    await waitFor(() => expect(addExpenseButton).toBeEnabled());
    await user.click(addExpenseButton);

    const expenseDialog = screen.getByRole('dialog', { name: 'Ajouter un frais imputable' });
    const supplier = within(expenseDialog).getByLabelText('Fournisseur');
    await user.click(supplier);
    expect(within(expenseDialog).getByRole('group', { name: 'Matériel et fournitures' })).toHaveTextContent('Würth');
    expect(within(expenseDialog).getByRole('group', { name: 'Radeaux' })).toHaveTextContent('SERVAUX');
    await user.type(supplier, 'radeaux');
    await user.click(within(expenseDialog).getByRole('option', { name: /SERVAUX/ }));
    expect(within(expenseDialog).getByLabelText('Spécialités')).toHaveValue('Radeaux');
    expect(within(expenseDialog).queryByLabelText('Catégorie')).not.toBeInTheDocument();
    expect(within(expenseDialog).queryByText(/Saisir une nouvelle société/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Refacturable au client')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Inclus à la facture client')).not.toBeInTheDocument();

    const amount = screen.getByLabelText('Montant HT');
    await user.click(amount);
    await user.type(amount, '125.50');
    expect(amount).toHaveValue(125.5);
    expect(screen.getByLabelText('Unité')).toHaveAttribute('list', 'project-billing-units');
    expect(document.querySelectorAll('#project-billing-units option')).toHaveLength(4);

    await user.click(within(expenseDialog).getByRole('button', { name: 'Ajouter' }));
    const companyDialog = await screen.findByRole('dialog', { name: 'Ajouter une société' });
    expect(within(companyDialog).getByLabelText('Nom de la société *')).toBeInTheDocument();
    expect(within(companyDialog).getByText(/référentiel Supabase/)).toBeInTheDocument();
    const serviceType = within(companyDialog).getByLabelText('Type de service');
    const serviceTypeList = document.getElementById(serviceType.getAttribute('list') || '');
    expect(Array.from(serviceTypeList?.querySelectorAll('option') || []).map((option) => option.value)).toEqual([
      'Matériel et fournitures',
      'Radeaux',
    ]);
  });

  it('shows an explicit technical error and retry action when the projects query fails', async () => {
    const { client } = createClient({ projects: { data: null, error: new Error('connexion refusée') } });

    render(<ProjectsPage client={client as never} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Impossible de charger les projets depuis Supabase. connexion refusée');
    expect(within(alert).getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.queryByText('Aucun projet n’est disponible dans Supabase.')).not.toBeInTheDocument();
  });

  it('keeps the portfolio visible and identifies partial contract data', async () => {
    const { client } = createClient({
      project_contracts: { data: null, error: new Error('contrats indisponibles') },
    });

    render(<ProjectsPage client={client as never} />);

    expect(await screen.findByText(/Consultation partielle/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Identité & contrat' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/informations contractuelles et BIMCO sont temporairement indisponibles/)).toBeInTheDocument();
  });

  it('blocks invalid links and explains missing links and Microsoft 365 authentication', async () => {
    const user = userEvent.setup();
    const { client } = createClient({
      contract_documents: {
        data: [{
          ...atlantiqueContractDocumentRow,
          file_url: '',
          storage_bucket: null,
          storage_migrated_at: null,
          storage_path: null,
          storage_sha256: null,
        }],
        error: null,
      },
      project_documents: {
        data: [{ ...atlantiqueProjectDocumentRow, file_url: 'https://evil.example/public/plan.pdf' }],
        error: null,
      },
    });

    render(<ProjectsPage client={client as never} />);

    await user.click(await screen.findByRole('button', { name: /P1086 Campagne Atlantique 2026/ }));
    await user.click(screen.getByRole('tab', { name: 'Documents' }));
    expect(await screen.findByText('URL SharePoint invalide ou non autorisée')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Plan projet Atlantique.pdf/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Document contractuel' }));
    expect(screen.getByText('URL SharePoint absente')).toBeInTheDocument();
    expect(screen.getByText(/authentification Microsoft 365/)).toBeInTheDocument();
  });

  it('opens a migrated contractual document from private Supabase Storage', async () => {
    const user = userEvent.setup();
    const { client, createSignedUrl } = createClient();

    render(<ProjectsPage client={client as never} />);

    await user.click(await screen.findByRole('button', { name: /P1086 Campagne Atlantique 2026/ }));
    await user.click(screen.getByRole('tab', { name: 'Documents' }));
    const link = await screen.findByRole('link', { name: /Contrat Atlantique signé.pdf/ });

    expect(link).toHaveAttribute('href', 'https://storage.example/project-attachment-signed');
    expect(link).toHaveTextContent('Ouvrir le document');
    expect(screen.getByText(/Stockage Supabase/)).toBeInTheDocument();
    expect(createSignedUrl).toHaveBeenCalledWith(
      'projects/880/contract-documents/884-Contrat-Atlantique-signe.pdf',
      300,
    );
  });

  it('reports unresolved relations and hides duplicate metadata without hiding the document', async () => {
    const user = userEvent.setup();
    const duplicate = {
      ...atlantiqueProjectDocumentRow,
      id: 999,
      source_modified_at: '2026-07-13T12:00:00Z',
    };
    const unresolved = {
      ...mancheProjectDocumentRow,
      id: 998,
      project_id: null,
      project_sharepoint_item_id: null,
      project_code: '',
      project_title: '',
      sharepoint_drive_item_id: 'item-unresolved',
      sharepoint_item_id: '998',
      source_sharepoint_id: '998',
    };
    const { client } = createClient({
      project_documents: { data: [atlantiqueProjectDocumentRow, duplicate, unresolved], error: null },
    });

    render(<ProjectsPage client={client as never} />);

    expect(await screen.findByText('Métadonnées documentaires à contrôler')).toBeInTheDocument();
    expect(screen.getByText('1 document(s) sans rattachement Supabase résolu.')).toBeInTheDocument();
    expect(screen.getByText('1 doublon(s) de métadonnées masqué(s) dans la consultation.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /P1086 Campagne Atlantique 2026/ }));
    await user.click(screen.getByRole('tab', { name: 'Documents' }));
    expect(screen.getAllByText('Plan projet Atlantique.pdf')).toHaveLength(1);
  });

  it('distinguishes a valid empty Supabase result from a loading or error state', async () => {
    const { client } = createClient({ projects: { data: [], error: null } });

    render(<ProjectsPage client={client as never} />);

    expect(await screen.findByText('Aucun projet n’est disponible dans Supabase.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('creates a project through the atomic Supabase RPC and displays the server number', async () => {
    const user = userEvent.setup();
    const { client, rpc } = createClient();
    render(<ProjectsPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Projets' });
    await user.click(screen.getByRole('button', { name: 'Nouveau projet' }));
    expect(screen.getByRole('group', { name: /Identification/ })).toBeVisible();
    expect(screen.getByLabelText('Début du projet')).not.toBeVisible();
    await user.type(screen.getByLabelText('Nom du projet *'), 'Projet SeaPilot');
    await user.selectOptions(screen.getByLabelText('Client / affréteur'), '50');
    await user.click(screen.getByRole('button', { name: /Opérations/ }));
    fireEvent.input(screen.getByLabelText('Début du projet'), { target: { value: '2026-09-04' } });
    fireEvent.input(screen.getByLabelText('Fin du projet'), { target: { value: '2026-09-11' } });
    const deliveryPort = screen.getByLabelText('Port de livraison');
    await user.click(deliveryPort);
    expect(screen.getByRole('group', { name: 'Finistère' })).toHaveTextContent('Brest');
    expect(screen.getByRole('group', { name: 'Charente-Maritime (17)' })).toHaveTextContent(
      "Port de Boyardville",
    );
    await user.type(deliveryPort, 'Brest');
    await user.click(screen.getByRole('option', { name: /^Port de BrestBrest – FR BES$/ }));

    const redeliveryPort = screen.getByLabelText('Port de restitution');
    await user.click(redeliveryPort);
    expect(screen.getByRole('group', { name: 'Bouches-du-Rhône (13)' }))
      .toHaveTextContent('Port des Goudes');
    await user.type(redeliveryPort, 'Cherbourg');
    await user.click(screen.getByRole('option', { name: /^Port de CherbourgCherbourg-en-Cotentin – FR CER$/ }));
    await user.click(screen.getByRole('button', { name: /Facturation/ }));
    await user.selectOptions(screen.getByLabelText('Navire principal *'), '12');
    await user.click(screen.getByRole('button', { name: 'Créer le projet' }));

    expect(await screen.findByText('P1196 enregistré dans Supabase.')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('projects_save', expect.objectContaining({
      target_delivery_port: 'Port de Brest',
      target_project_id: null,
      target_title: 'Projet SeaPilot',
      target_client_id: 50,
      target_primary_vessel_id: 12,
      target_redelivery_port: 'Port de Cherbourg',
    }));
    expect(rpc).toHaveBeenCalledWith('projects_save_planning_occurrence', expect.objectContaining({
      target_ends_on: '2026-09-11',
      target_project_id: 990,
      target_starts_on: '2026-09-04',
      target_status: 'Non validé',
      target_vessel_ids: [12],
    }));
  });

  it('creates a client from the project identification step and selects it immediately', async () => {
    const user = userEvent.setup();
    const { client, rpc } = createClient();
    rpc.mockImplementation(async (functionName: string) => {
      if (functionName === 'clients_save') return { data: { id: 77 }, error: null };
      if (functionName === 'projects_peek_next_code') return { data: 'P1196', error: null };
      return {
        data: { id: 990, project_code: 'P1196', title: 'Projet SeaPilot', updated_at: '2026-07-16T08:00:00Z' },
        error: null,
      };
    });

    render(<ProjectsPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Projets' });
    await user.click(screen.getByRole('button', { name: 'Nouveau projet' }));
    await user.click(screen.getByRole('button', { name: 'Ajouter un client ou affréteur' }));
    await user.type(screen.getByLabelText('Nom du client *'), 'Nouveau Affréteur');
    await user.click(screen.getByRole('button', { name: 'Enregistrer dans Supabase' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Créer un client' })).not.toBeInTheDocument());
    expect(screen.getByLabelText('Client / affréteur')).toHaveValue('77');
    expect(screen.getByRole('option', { name: 'Nouveau Affréteur' })).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('clients_save', expect.objectContaining({
      target_client_id: null,
      target_name: 'Nouveau Affréteur',
    }));
  });

  it('keeps the project form open and exposes a Supabase network error', async () => {
    const user = userEvent.setup();
    const { client } = createClient({}, { data: null, error: { message: 'Failed to fetch' } });
    render(<ProjectsPage client={client as never} roles={['direction']} />);

    await screen.findByRole('heading', { name: 'Projets' });
    await user.click(screen.getByRole('button', { name: 'Nouveau projet' }));
    await user.type(screen.getByLabelText('Nom du projet *'), 'Projet hors ligne');
    await user.click(screen.getByRole('button', { name: /Opérations/ }));
    fireEvent.input(screen.getByLabelText('Début du projet'), { target: { value: '2026-09-04' } });
    fireEvent.input(screen.getByLabelText('Fin du projet'), { target: { value: '2026-09-11' } });
    await user.click(screen.getByRole('button', { name: /Facturation/ }));
    await user.selectOptions(screen.getByLabelText('Navire principal *'), '12');
    await user.click(screen.getByRole('button', { name: 'Créer le projet' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to fetch');
    expect(screen.getByRole('dialog', { name: 'Créer un projet' })).toBeInTheDocument();
  });

  it('adds independent planning occurrences to the selected project through the secure RPC', async () => {
    const user = userEvent.setup();
    const { client, rpc } = createClient({}, { data: [{ id: 1301 }], error: null });
    render(<ProjectsPage client={client as never} roles={['direction']} />);

    await user.click(await screen.findByRole('button', { name: /P1086 Campagne Atlantique 2026/ }));
    await user.click(screen.getByRole('button', { name: 'Nouvelle opération' }));
    fireEvent.change(screen.getByLabelText('Début *'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Fin *'), { target: { value: '2026-09-05' } });
    await user.clear(screen.getByLabelText('Description / mission'));
    await user.type(screen.getByLabelText('Description / mission'), 'Rotation septembre');
    await user.click(screen.getByRole('button', { name: 'Ajouter au planning' }));

    expect(rpc).toHaveBeenCalledWith('projects_save_planning_occurrence', {
      target_occurrence_id: null,
      target_charter_hire: 12000,
      target_description: 'Rotation septembre',
      target_ends_on: '2026-09-05',
      target_hire_currency: 'EUR',
      target_hire_unit: 'jour',
      target_vessel_ids: [12],
      target_project_id: 880,
      target_starts_on: '2026-09-01',
      target_status: 'Non validé',
    });
    expect(await screen.findByText('Opération ajoutée au Planning.')).toBeInTheDocument();
  });

  it('confirms and removes a planning operation while preserving its SeaPilot documents', async () => {
    const user = userEvent.setup();
    const { client, rpc } = createClient();
    rpc.mockImplementation(async (functionName: string) => {
      if (functionName === 'projects_planning_occurrences') {
        return { data: atlantiquePlanningOccurrenceRows, error: null };
      }
      if (functionName === 'projects_delete_planning_occurrence') {
        return { data: 1201, error: null };
      }
      return { data: null, error: null };
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<ProjectsPage client={client as never} roles={['direction']} />);

    await user.click(await screen.findByRole('button', { name: /P1086 Campagne Atlantique 2026/ }));
    await user.click(screen.getByRole('tab', { name: 'Opérations' }));
    const operationRow = screen.getByText('Rotation 1').closest('tr');
    await user.click(within(operationRow as HTMLElement).getByRole('button', { name: /Supprimer l’opération Rotation 1/ }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Les documents déjà classés resteront conservés dans SeaPilot'));
    expect(rpc).toHaveBeenCalledWith('projects_delete_planning_occurrence', {
      target_occurrence_id: 1201,
      target_project_id: 880,
    });
    expect(await screen.findByText(/Opération supprimée du Planning/)).toBeInTheDocument();
    expect(screen.queryByText('Rotation 1')).not.toBeInTheDocument();
    confirm.mockRestore();
  });

  it('generates only the document selected by the contract type and stores it in SeaPilot', async () => {
    const user = userEvent.setup();
    const { client, from, rpc } = createClient();
    render(<ProjectsPage client={client as never} roles={['admin']} />);

    await user.click(await screen.findByRole('button', { name: /P1086 Campagne Atlantique 2026/ }));
    await user.click(screen.getByRole('tab', { name: 'Documents' }));
    expect(screen.queryByText('Offre commerciale', { selector: 'strong' })).not.toBeInTheDocument();
    const bimcoCard = screen.getByText('BIMCO', { selector: 'strong' }).closest('article');
    await user.click(within(bimcoCard as HTMLElement).getByRole('button', { name: 'Générer et classer' }));

    await waitFor(() => expect(documentGenerationMocks.generateProjectDocument).toHaveBeenCalledWith(
      'bimco_supplytime',
      expect.objectContaining({ contract: expect.objectContaining({ projectId: 880 }) }),
    ));
    expect(documentStorageMocks.storeGeneratedProjectDocument).toHaveBeenCalledTimes(1);
    expect(documentGenerationMocks.downloadGeneratedProjectDocument).not.toHaveBeenCalled();
    expect(from.mock.calls.map(([table]) => table)).not.toContain('storage');
    expect(rpc.mock.calls.map(([functionName]) => functionName)).toEqual(
      expect.not.arrayContaining(['projects_save_planning_occurrence', 'projects_delete_planning_occurrence']),
    );
  });

  it('maps a bareboat charter project to the dedicated generated document type', async () => {
    const user = userEvent.setup();
    const { client } = createClient({
      projects: {
        data: [{ ...atlantiqueProjectRow, contract_type: "Contrat d'Affrètement" }],
        error: null,
      },
      fleet_certificates: {
        data: [{
          id: 127,
          vessel_id: 12,
          document_title: 'Certificat de Classification',
          title: 'Certificat de Classification',
          status: 'valid',
          issued_on: '2026-08-12',
          expires_on: '2028-08-16',
          updated_at: '2026-08-18T14:59:43Z',
        }],
        error: null,
      },
    });
    render(<ProjectsPage client={client as never} roles={['admin']} />);

    await user.click(await screen.findByRole('button', { name: /P1086 Campagne Atlantique 2026/ }));
    await user.click(screen.getByRole('tab', { name: 'Documents' }));
    const bareboatCard = screen.getByText("Contrat d'affrètement", { selector: 'strong' }).closest('article');
    await user.click(within(bareboatCard as HTMLElement).getByRole('button', { name: 'Générer et classer' }));

    await waitFor(() => expect(documentGenerationMocks.generateProjectDocument).toHaveBeenCalledWith(
      'bareboat_charter',
      expect.objectContaining({
        contract: expect.objectContaining({ projectId: 880 }),
        vesselCertificates: [expect.objectContaining({
          documentTitle: 'Certificat de Classification',
          issuedOn: '2026-08-12',
        })],
      }),
    ));
    expect(documentStorageMocks.storeGeneratedProjectDocument).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ documentType: 'bareboat_charter', projectId: 880 }),
    );
  });
});
