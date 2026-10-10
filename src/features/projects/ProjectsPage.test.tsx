import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectsPage } from './ProjectsPage';

const documentGenerationMocks = vi.hoisted(() => ({
  downloadGeneratedProjectDocument: vi.fn(),
  generateProjectDocument: vi.fn(),
}));

const documentStorageMocks = vi.hoisted(() => ({
  createProjectDocumentBundle: vi.fn(),
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
    source_label: 'BBTM',
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
    source_label: 'BBTM',
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
    data: { id: 990, project_code: 'P1196', title: 'Projet BBTM', updated_at: '2026-07-16T08:00:00Z' },
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
    query.gte = vi.fn(() => query);
    query.in = vi.fn(() => query);
    query.range = vi.fn(() => query);
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
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));
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
    documentStorageMocks.createProjectDocumentBundle.mockResolvedValue({
      blob: new Blob(['zip'], { type: 'application/zip' }),
      fileName: 'P1086 - BIMCO - R1 - avec pièces jointes.zip',
      mimeType: 'application/zip',
    });
    documentStorageMocks.storeOperationDocuments.mockResolvedValue({ failed: [], stored: [] });
  });

  afterEach(() => vi.useRealTimers());

  it('starts with a compact fleet summary and expands only the eligible vessels', async () => {
    const user = userEvent.setup();
    const { client } = createClient({ vessels: { data: ['COTENTIN', 'BBTM 2710', 'TAMARIS', 'ECREHOUEL'].map((name, index) => ({ id: index + 12, name, active: true, asset_kind: 'vessel' })), error: null } });
    render(<ProjectsPage client={client as never} roles={['direction']} />);
    const insights = within(await screen.findByRole('region', { name: 'Activité de la flotte' }));
    await waitFor(() => expect(insights.getByText('1 navire suivi')).toBeInTheDocument());
    expect(insights.getByRole('button', { name: 'Voir les détails' })).toHaveAttribute('aria-expanded', 'false');
    expect(insights.queryByRole('heading', { name: 'Utilisation par navire' })).not.toBeInTheDocument();
    await user.click(insights.getByRole('button', { name: 'Voir les détails' }));
    expect(insights.getByRole('heading', { name: 'Utilisation par navire' })).toBeVisible();
    expect(insights.getByText('COTENTIN')).toBeVisible();
    for (const name of ['BBTM 2710', 'TAMARIS', 'ECREHOUEL']) expect(insights.queryByText(name)).not.toBeInTheDocument();
    fireEvent.change(insights.getByLabelText('Période'), { target: { value: '2024-02' } });
    expect(insights.getAllByText('Année 2024')).toHaveLength(2);
    expect(insights.queryByText('BBTM 2710')).not.toBeInTheDocument();
    await user.click(insights.getByRole('button', { name: 'Réduire' }));
    expect(insights.queryByRole('heading', { name: 'Utilisation par navire' })).not.toBeInTheDocument();
    expect(insights.getByLabelText('Période')).toHaveValue('2024-02');
  });

  it('shows berth and transit DPRs under operation types without adding utilization days', async () => {
    const { client } = createClient({ dpr_reports: { data: [
      { id: 1, report_date: '2026-07-01', vessel_id: 12, project_id: null, unlisted_project_name: 'Navire à quai' },
      { id: 2, report_date: '2026-07-02', vessel_id: 12, project_id: null, unlisted_project_name: 'Navire en transit' },
      { id: 3, report_date: '2026-07-03', vessel_id: 12, project_id: 880, unlisted_project_name: null },
    ], error: null } });
    render(<ProjectsPage client={client as never} roles={['direction']} />);
    const insights = within(await screen.findByRole('region', { name: 'Activité de la flotte' }));
    fireEvent.click(insights.getByRole('button', { name: 'Voir les détails' }));
    expect(await insights.findByText('3 DPR soumis ou validés sur le mois')).toBeVisible();
    expect(insights.getByText('Navire à quai')).toBeVisible();
    expect(insights.getByText('Navire en transit')).toBeVisible();
    expect(insights.getByLabelText('COTENTIN, 2026-07 : prévu 19 %, réalisé 3 %')).toBeVisible();
    fireEvent.click(insights.getByRole('button', { name: 'Prévu · planning' }));
    expect(insights.getByText('2 opération(s) planifiée(s) sur le mois')).toBeVisible();
    expect(insights.queryByText('Navire à quai')).not.toBeInTheDocument();
  });

  it('adds and removes a personal favorite without changing the selected dossier, and restores it on reload', async () => {
    const stored: { project_id: number }[] = [];
    const { client, rpc } = createClient({ project_favorites: { data: stored, error: null } });
    rpc.mockImplementation(async (_name: string, args?: { target_project: number; favorite: boolean }) => {
      if (_name === 'projects_set_favorite' && args) {
        if (args.favorite) stored.push({ project_id: args.target_project }); else stored.splice(0);
      }
      return { data: true, error: null };
    });
    const view = render(<ProjectsPage client={client as never} roles={['direction']} />);
    const star = await screen.findByRole('button', { name: 'Ajouter aux favoris : P1086' });
    await waitFor(() => expect(star).toBeEnabled());
    const initialDossierTitle = within(screen.getByRole('article', { name: /Détails du contrat/ })).getByRole('heading', { level: 2 }).textContent!;
    fireEvent.click(star);
    await screen.findByRole('button', { name: 'Retirer des favoris : P1086' });
    expect(screen.getByRole('heading', { name: 'Portefeuille projet' })).toBeVisible();
    expect(screen.getByRole('heading', { name: initialDossierTitle })).toBeVisible();
    expect(rpc).toHaveBeenCalledWith('projects_set_favorite', { target_project: 880, favorite: true });
    view.unmount();
    render(<ProjectsPage client={client as never} roles={['direction']} />);
    await screen.findByRole('button', { name: 'Retirer des favoris : P1086' });
    fireEvent.click(screen.getByRole('button', { name: /Mes favoris 1/ }));
    expect(screen.getByRole('button', { name: 'P1086 Campagne Atlantique 2026' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'P1087 Campagne Manche 2026' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retirer des favoris : P1086' }));
    expect(await screen.findByText(/Aucun projet favori/)).toBeVisible();
    expect(stored).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Afficher tous les projets' }));
    expect(screen.getByRole('button', { name: 'P1087 Campagne Manche 2026' })).toBeVisible();
  });

  it('keeps the existing favorite when saving is rejected', async () => {
    const { client, rpc } = createClient({ project_favorites: { data: [{ project_id: 880 }], error: null } });
    rpc.mockResolvedValue({ data: null, error: { message: 'denied' } });
    render(<ProjectsPage client={client as never} roles={['direction']} />);
    const star = await screen.findByRole('button', { name: 'Retirer des favoris : P1086' });
    fireEvent.click(star);
    expect(await screen.findByText(/Le favori n’a pas pu être enregistré/)).toBeVisible();
    expect(star).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches between current-month/future projects and the complete history independently of the KPI period', async () => {
    vi.setSystemTime(new Date('2026-09-28T12:00:00Z'));
    const dated = (id: number, start: string, end: string) => ({ ...atlantiqueProjectRow, id, project_code: `P${id}`, title: `Projet ${id}`, delivery_at: null, redelivery_at: null, charter_starts_at: null, charter_ends_at: null, starts_on: start || null, ends_on: end || null });
    const { client } = createClient({ projects: { data: [dated(1, '2026-08-01', '2026-08-31'), dated(2, '2026-08-30', '2026-09-01'), { ...dated(3, '2027-01-01', '2027-01-15'), archived_at: '2026-09-01' }, dated(4, '', '')], error: null } });
    const user = userEvent.setup();
    render(<ProjectsPage client={client as never} roles={['direction']} />);
    expect(await screen.findByRole('button', { name: /P2 Projet 2/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /Projets actuels 1/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /P3 Projet 3/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /P1 Projet 1/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Archives/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Période'), { target: { value: '2026-08' } });
    expect(screen.queryByRole('button', { name: /P1 Projet 1/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Tous les projets 3/ }));
    expect(screen.getByRole('button', { name: /P1 Projet 1/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /P4 Projet 4/ })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Filtres' }));
    await user.click(screen.getByLabelText('Afficher les projets clôturés'));
    expect(screen.getByRole('button', { name: /Tous les projets 4/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /P3 Projet 3/ })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /P3 Projet 3/ }));
    await user.click(screen.getByRole('button', { name: 'Liste des projets' }));
    expect(screen.getByRole('button', { name: /Tous les projets 4/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('edits the exact portfolio card while preserving the displayed dossier', async () => {
    const user = userEvent.setup();
    const { client, rpc } = createClient({}, { data: { id: 881, project_code: 'P1087', title: 'Manche modifiée', updated_at: '2026-07-16T08:00:00Z' }, error: null });
    const page = render(<ProjectsPage client={client as never} roles={['direction']} />);
    await user.click(await screen.findByRole('button', { name: 'P1086 Campagne Atlantique 2026' }));
    await user.click(screen.getByRole('button', { name: 'Liste des projets' }));
    expect(screen.getByRole('button', { name: 'P1086 Campagne Atlantique 2026' })).toHaveAttribute('aria-pressed', 'true');
    expect(page.container.querySelector('button button')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Modifier P1087' }));
    const editor = within(screen.getByRole('dialog', { name: 'Modifier le projet' }));
    expect(editor.getByLabelText('Nom du projet *')).toHaveValue('Campagne Manche 2026');
    await user.clear(editor.getByLabelText('Nom du projet *'));
    await user.type(editor.getByLabelText('Nom du projet *'), 'Manche modifiée');
    await user.click(editor.getByRole('button', { name: 'Enregistrer le projet' }));
    expect(await screen.findByText('P1087 enregistré dans Supabase.')).toBeVisible();
    expect(rpc).toHaveBeenCalledWith('projects_save', expect.objectContaining({ target_project_id: 881, target_title: 'Manche modifiée', target_primary_vessel_id: 13, target_client_id: 51 }));
    expect(screen.getByRole('heading', { name: 'Portefeuille projet' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'P1086 Campagne Atlantique 2026' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'Campagne Atlantique 2026' })).toBeVisible();
  });

  it.each(['marin', 'capitaine'] as const)('keeps project lifecycle actions read-only for the real %s role fixture', async (role) => {
    const user = userEvent.setup();
    const { client, rpc } = createClient();
    const page = render(<ProjectsPage client={client as never} roles={[role]} />);
    await screen.findByRole('button', { name: 'P1086 Campagne Atlantique 2026' });
    expect(screen.queryByRole('button', { name: 'Modifier P1086' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier le statut de P1086' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier le statut du dossier P1086' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nouveau projet' })).toBeDisabled();
    expect(page.container.querySelector('button button')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'P1086 Campagne Atlantique 2026' }));
    expect(screen.queryByRole('button', { name: 'Modifier le statut de P1086' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nouvelle opération' })).toBeDisabled();
    expect(rpc.mock.calls.map(([name]) => name)).not.toContain('projects_archive');
    expect(rpc.mock.calls.map(([name]) => name)).not.toContain('projects_reactivate');
    expect(rpc.mock.calls.map(([name]) => name)).not.toContain('projects_set_status');
  });

  it('hides closed favorites and reactivates a filtered historical project through its status pill', async () => {
    const user = userEvent.setup();
    const rows = [{ ...atlantiqueProjectRow, archived_at: '2026-07-15T10:00:00Z' as string | null }, mancheProjectRow];
    const { client, rpc } = createClient({ projects: { data: rows, error: null }, project_favorites: { data: [{ project_id: 880 }, { project_id: 881 }], error: null } });
    const previousRpc = rpc.getMockImplementation()!;
    rpc.mockImplementation((name: string) => {
      if (name === 'projects_reactivate') { rows[0].archived_at = null; return Promise.resolve({ data: null, error: null }); }
      return previousRpc(name);
    });
    render(<ProjectsPage client={client as never} roles={['direction']} />);
    await screen.findByRole('button', { name: 'P1087 Campagne Manche 2026' });
    await waitFor(() => expect(screen.getByRole('button', { name: /Mes favoris 1/ })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: /Mes favoris 1/ }));
    expect(screen.queryByRole('button', { name: 'P1086 Campagne Atlantique 2026' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Tous les projets 1/ }));
    expect(screen.queryByRole('button', { name: 'P1086 Campagne Atlantique 2026' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Filtres' }));
    await user.click(screen.getByLabelText('Afficher les projets clôturés'));
    const row = screen.getByRole('button', { name: 'P1086 Campagne Atlantique 2026' }).closest('li')!;
    expect(within(row).getByRole('button', { name: 'Modifier P1086' })).toBeDisabled();
    expect(within(row).getByRole('button', { name: 'Modifier le statut de P1086' })).toHaveTextContent('Clôturé');
    await user.click(screen.getByRole('button', { name: 'P1086 Campagne Atlantique 2026' }));
    expect(within(screen.getByLabelText('Changer de projet')).getByRole('option', { name: /P1086.*Clôturé/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Modifier le statut de P1086' }));
    await user.click(screen.getByRole('button', { name: 'Réactiver le projet' }));
    expect(await screen.findByText('P1086 réactivé.')).toBeVisible();
    expect(rpc).toHaveBeenCalledWith('projects_reactivate', { target_project_id: 880 });
    expect(screen.getByRole('button', { name: 'Modifier le statut de P1086' })).not.toHaveTextContent('Clôturé');
    await user.click(screen.getByRole('tab', { name: /Opérations/ }));
    expect(screen.getByText('Rotation 1')).toBeVisible();
    expect(screen.getByText('Rotation 2')).toBeVisible();
  });

  it('updates only the status and keeps a failed closure visible with its data unchanged', async () => {
    const user = userEvent.setup();
    const rows = [{ ...atlantiqueProjectRow }, mancheProjectRow];
    const { client, rpc } = createClient({ projects: { data: rows, error: null } });
    const previousRpc = rpc.getMockImplementation()!;
    rpc.mockImplementation((name: string, args?: { target_status?: string }) => {
      if (name === 'projects_set_status') { rows[0].status = args!.target_status!; return Promise.resolve({ data: null, error: null }); }
      if (name === 'projects_archive') return Promise.resolve({ data: null, error: { message: 'Clôture refusée' } });
      return previousRpc(name);
    });
    render(<ProjectsPage client={client as never} roles={['direction']} />);
    await screen.findByRole('button', { name: 'Modifier le statut de P1086' });
    await user.click(screen.getByRole('button', { name: 'Modifier le statut de P1086' }));
    await user.click(screen.getByRole('button', { name: 'Stand-by météo' }));
    expect(await screen.findByText('P1086 mis à jour : Stand-by météo.')).toBeVisible();
    expect(rpc).toHaveBeenCalledWith('projects_set_status', { target_project_id: 880, target_status: 'Stand-by météo' });
    expect(screen.getByRole('button', { name: 'Modifier le statut de P1086' })).toHaveTextContent('Stand-by météo');
    await user.click(screen.getByRole('button', { name: 'Modifier le statut de P1086' }));
    await user.click(screen.getByRole('button', { name: 'Clôturer' }));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(rpc).not.toHaveBeenCalledWith('projects_archive', expect.anything());
    await user.click(screen.getByRole('button', { name: 'Modifier le statut de P1086' }));
    await user.click(screen.getByRole('button', { name: 'Clôturer' }));
    const confirmation = within(screen.getByRole('dialog', { name: 'Clôturer le projet' }));
    await user.click(confirmation.getByRole('button', { name: 'Clôturer' }));
    expect(await confirmation.findByRole('alert')).toHaveTextContent('Clôture refusée');
    expect(screen.getByRole('button', { name: 'Modifier le statut de P1086' })).toHaveTextContent('Stand-by météo');
    expect(rows[0].archived_at).toBeNull();
    expect(rpc).toHaveBeenCalledWith('projects_archive', { target_project_id: 880 });
  });

  it('keeps the dossier history when its last active project is closed and removes it from selection lists', async () => {
    const user = userEvent.setup();
    const row = { ...atlantiqueProjectRow, archived_at: null as string | null };
    const { client, rpc } = createClient({ projects: { data: [row], error: null } });
    const previousRpc = rpc.getMockImplementation()!;
    rpc.mockImplementation((name: string) => {
      if (name === 'projects_archive') { row.archived_at = '2026-07-15T12:00:00Z'; return Promise.resolve({ data: null, error: null }); }
      return previousRpc(name);
    });
    render(<ProjectsPage client={client as never} roles={['direction']} />);
    await user.click(await screen.findByRole('button', { name: 'P1086 Campagne Atlantique 2026' }));
    await user.click(screen.getByRole('button', { name: 'Modifier le statut de P1086' }));
    await user.click(screen.getByRole('button', { name: 'Clôturer' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Clôturer le projet' })).getByRole('button', { name: 'Clôturer' }));
    expect(await screen.findByRole('heading', { name: 'Campagne Atlantique 2026' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Modifier le statut du dossier P1086' })).toHaveTextContent('Clôturé');
    expect(screen.getByRole('button', { name: 'Nouvelle opération' })).toBeDisabled();
    expect(within(screen.getByLabelText('Changer de projet')).getByRole('option', { name: /Clôturé/ })).toBeDisabled();
    await user.click(screen.getByRole('tab', { name: /Opérations/ }));
    expect(screen.getByText('Rotation 1')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Liste des projets' }));
    expect(screen.queryByRole('button', { name: 'P1086 Campagne Atlantique 2026' })).not.toBeInTheDocument();
    expect(screen.getByText('Aucun projet ne correspond aux filtres.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Filtres' }));
    await user.click(screen.getByLabelText('Afficher les projets clôturés'));
    expect(screen.getByRole('button', { name: 'P1086 Campagne Atlantique 2026' })).toBeVisible();
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

  it('exposes the searchable project catalogues from the command ribbon', async () => {
    const user = userEvent.setup();
    const { client } = createClient();

    render(<ProjectsPage client={client as never} roles={['direction']} />);

    await screen.findByRole('heading', { name: 'Projets' });
    const ribbon = within(screen.getByRole('navigation', { name: 'Commandes du module Projets' }));
    expect(ribbon.getAllByRole('group').map((group) => group.getAttribute('aria-label'))).toEqual(['Projet', 'Catalogue', 'Documents']);
    expect(within(ribbon.getByRole('group', { name: 'Projet' })).getByRole('button', { name: 'Nouveau projet' })).toBeEnabled();
    expect(within(ribbon.getByRole('group', { name: 'Catalogue' })).getByRole('button', { name: 'Clients' })).toBeEnabled();
    expect(screen.getByRole('heading', { name: 'Portefeuille projet' })).toBeVisible();
    expect(screen.getByRole('article', { name: /Détails du contrat/ })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Éléments de facturation' }))
      .toHaveAttribute('href', '/modules/billingElements');
    expect(screen.getByRole('button', { name: 'Catalogue de prestations' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actualiser' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nouveau client' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier le client' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clients' }));
    expect(screen.getByRole('dialog', { name: 'Liste des clients' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Rechercher un client' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.getByRole('button', { name: 'Remorqués' })).toBeInTheDocument();
  });

  it('selects a project and exposes contract-aware read-only sections as accessible tabs', async () => {
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

    expect(projectButton).toBeVisible();
    expect(projectButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('tablist', { name: 'Sections du projet' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-label'))).toEqual([
      'Identité',
      'Opérations',
      'Facturation',
      'Offre & contrat',
      'Documents',
      'Historique',
    ]);
    expect(screen.queryByRole('tab', { name: 'Document contractuel' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Identité' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Opérations' }));
    expect(screen.getByText('Rotation 1')).toBeInTheDocument();
    expect(screen.getAllByText(/12.000 EUR \/ jour/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('tab', { name: 'Offre & contrat' }));
    await user.click(screen.getByRole('button', { name: 'Clauses & responsabilités' }));
    expect(screen.getByText('Clauses particulières Atlantique')).toBeInTheDocument();
    expect(screen.queryByText('Données structurées consultées dans Supabase')).not.toBeInTheDocument();
    expect(screen.queryByText('Source structurée · Supabase')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nouvelle opération' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Identité' }));
    expect(screen.getAllByText('Armateur BBTM, Brest').length).toBeGreaterThan(0);
    expect(screen.queryByText('Clauses particulières Atlantique')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Documents' }));
    expect(screen.getByText('Attestation Expert BV.pdf')).toBeInTheDocument();
    expect(screen.getByText(/Toilette de Mer · Attestation Expert\/BV/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Ouvrir le document.*Attestation Expert BV.pdf/ }));
    await waitFor(() => expect(createSignedUrl).toHaveBeenCalledWith('projects/880/attachments/toilette_de_mer/attestation.pdf', 300));
    expect(screen.getByRole('button', { name: /Ouvrir le document.*Plan projet Atlantique.pdf/ })).toBeInTheDocument();
    screen.getByRole('tab', { name: 'Opérations' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Facturation' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Inclure les frais et leurs pièces dans l’export')).toBeInTheDocument();
    expect(screen.getByLabelText('Inclure les prestations BBTM')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /^Prestations BBTM/ }).closest('article')!).queryAllByRole('checkbox')).toHaveLength(0);
    expect(within(screen.getByRole('group', { name: 'Contenu du PDF' })).getAllByRole('checkbox')).toHaveLength(4);
    expect(screen.getByLabelText('Inclure la saisie brute')).toBeInTheDocument();
    expect(screen.queryByLabelText('Inclure cette prestation dans le PDF')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Inclure les loyers')).toBeInTheDocument();
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
          'project_billing_raw_lines',
          'project_service_catalog',
          'project_chargeable_expenses',
          'project_billing_documents',
          'service_providers',
        ]),
      );
    });
  });

  it('preserves billing drafts when independently folding sections and keeps export options together', async () => {
    const user = userEvent.setup();
    const { client } = createClient({
      project_billing_periods: { data: [{ id: 501, project_id: 880, period_month: '2026-07-01', invoice_number: 'F-2026-07', include_operations_in_pdf: true, include_expenses_in_pdf: true, include_bbtm_in_pdf: true }], error: null },
      project_billing_services: { data: [{ id: 601, project_id: 880, billing_period_id: 501, category: 'Assistance', unit_amount_ht: 250, quantity: 3 }], error: null },
    });
    render(<ProjectsPage client={client as never} roles={['direction']} />);
    await user.click(await screen.findByRole('button', { name: /P1086 Campagne Atlantique 2026/ }));
    await user.click(screen.getByRole('tab', { name: 'Facturation' }));
    expect(screen.getByRole('button', { name: /^Loyers d’affrètement/ })).toHaveAttribute('aria-expanded', 'true');
    const expenseSection = within(screen.getByRole('button', { name: /^Services refacturables/ }).closest('article')!);
    expect(expenseSection.getByRole('button', { name: 'Ajouter' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Suivi de la facture et pièces/ }));
    await waitFor(() => expect(screen.getByLabelText('Numéro de facture')).toHaveValue('F-2026-07'));
    await user.clear(screen.getByLabelText('Numéro de facture'));
    await user.type(screen.getByLabelText('Numéro de facture'), 'F-2026-07-CORR');
    await user.click(screen.getByRole('button', { name: /^Prestations BBTM/ }));
    const quantity = screen.getByLabelText('Nombre d’unités');
    fireEvent.change(quantity, { target: { value: '7' } });
    expect(quantity).toHaveValue(7);
    expect(screen.getByLabelText('Totaux sélectionnés pour l’export')).toHaveTextContent(/1\s?750,00/);
    const exportPanel = screen.getByRole('article', { name: 'Export du relevé mensuel' });
    expect(within(exportPanel).getAllByRole('checkbox')).toHaveLength(4);
    await user.clear(within(exportPanel).getByLabelText('Référence client'));
    await user.type(within(exportPanel).getByLabelText('Référence client'), 'COMMANDE-007');
    await user.selectOptions(within(exportPanel).getByLabelText('Fichier'), 'zip');
    await user.click(screen.getByRole('button', { name: /^Prestations BBTM/ }));
    expect(screen.getByRole('button', { name: /^Prestations BBTM/ })).toHaveAttribute('aria-expanded', 'false');
    await user.click(screen.getByRole('button', { name: /^Services refacturables/ }));
    expect(expenseSection.getByRole('button', { name: 'Ajouter' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^Suivi de la facture et pièces/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Numéro de facture')).toHaveValue('F-2026-07-CORR');
    await user.click(screen.getByRole('button', { name: /^Suivi de la facture et pièces/ }));
    await user.click(screen.getByRole('button', { name: /^Suivi de la facture et pièces/ }));
    expect(screen.getByLabelText('Numéro de facture')).toHaveValue('F-2026-07-CORR');
    await user.click(screen.getByRole('button', { name: /^Prestations BBTM/ }));
    expect(screen.getByLabelText('Nombre d’unités')).toHaveValue(7);
    expect(within(exportPanel).getByLabelText('Référence client')).toHaveValue('COMMANDE-007');
    expect(within(exportPanel).getByLabelText('Fichier')).toHaveValue('zip');
  });

  it('opens a different project without losing the portfolio search', async () => {
    const user = userEvent.setup();
    const { client } = createClient();
    render(<ProjectsPage client={client as never} roles={['direction']} />);
    await screen.findByRole('button', { name: /P1086 Campagne Atlantique 2026/ });
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher un contrat' }), 'Atlantique');
    await user.click(screen.getByRole('button', { name: /P1086 Campagne Atlantique 2026/ }));
    await user.selectOptions(screen.getByLabelText('Changer de projet'), '881');
    expect(screen.getByRole('heading', { name: 'Campagne Manche 2026' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Documents' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Liste des projets' }));
    expect(screen.getByRole('searchbox', { name: 'Rechercher un contrat' })).toHaveValue('Atlantique');
    expect(screen.queryByRole('button', { name: /P1087 Campagne Manche/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Campagne Manche 2026' })).toBeVisible();
  });

  it('searches suppliers by specialty and opens the Supabase company dialog', async () => {
    const user = userEvent.setup();
    const { client } = createClient({
      project_billing_periods: {
        data: [{
          id: 501,
          company_id: 1,
          project_id: 880,
          period_month: '2026-07-01',
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
    await user.click(screen.getByRole('button', { name: /^Services refacturables/ }));
    const expenseSection = within(screen.getByRole('button', { name: /^Services refacturables/ }).closest('article')!);
    const addExpenseButton = expenseSection.getByRole('button', { name: 'Ajouter' });
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
    await userEvent.click(screen.getByRole('button', { name: /P1086 Campagne Atlantique 2026/ }));
    expect(screen.getByRole('tab', { name: 'Identité' })).toHaveAttribute('aria-selected', 'true');
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

    expect(screen.getByText('URL SharePoint absente')).toBeInTheDocument();
    expect(screen.getAllByText(/sources historiques restent conservées/).length).toBeGreaterThan(0);
  });

  it('changes the contextual navigation when another contract family is selected', async () => {
    const user = userEvent.setup();
    const { client } = createClient();

    render(<ProjectsPage client={client as never} roles={['admin']} />);

    await user.click(await screen.findByRole('button', { name: /P1086 Campagne Atlantique 2026/ }));
    await user.click(screen.getByRole('tab', { name: 'Offre & contrat' }));
    await user.click(screen.getByRole('radio', { name: 'Contrat de remorquage' }));

    expect(screen.getByRole('button', { name: 'Parties & convoi' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Itinéraire & délais' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Cases 1–12' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Parties & convoi' }));
    expect(screen.getByRole('heading', { name: 'Parties & convoi' })).toBeInTheDocument();
    expect(screen.getAllByText('Armateur BBTM, Brest').length).toBeGreaterThan(0);
  });

  it('keeps every explicit P144 field accessible through business sections', async () => {
    const user = userEvent.setup();
    const { client } = createClient({
      projects: { data: [{ ...atlantiqueProjectRow, id: 144, project_code: 'P144', title: 'EMDT - GOURY', contract_type: 'BIMCO' }], error: null },
      project_contracts: { data: [{ ...atlantiqueContractRow, project_id: 144, supplytime_data: {
        p144_box02_owners: 'Armateur P144 enregistré',
        p144_box14_termination_notice: 'Préavis P144 de 21 jours',
        p144_box18_specialist_operations: 'Intervention ROV P144',
        p144_box20_charter_hire: 'Tarifs P144 par période\nStand-by spécifique',
        p144_box34_additional_clauses: 'Clause P144 conservée',
        p144_signature_owners: 'Signataire P144',
        p144_annexes: 'Annexe P144 conservée',
      } }], error: null },
    });
    render(<ProjectsPage client={client as never} roles={['direction']} />);
    await user.click(await screen.findByRole('button', { name: 'P144 EMDT - GOURY' }));
    await screen.findByRole('heading', { name: 'EMDT - GOURY' });
    expect(screen.getByRole('article', { name: 'Détails du contrat P144' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Client' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Navires & affectation' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Offre & contrat' }));
    expect(screen.queryByText(/Cases \d/)).not.toBeInTheDocument();
    for (const [section, value] of [
      ['Parties & navire', 'Armateur P144 enregistré'],
      ['Période & livraison', 'Préavis P144 de 21 jours'],
      ['Exploitation', 'Intervention ROV P144'],
      ['Tarifs & paiement', /Tarifs P144 par période/],
      ['Clauses & responsabilités', 'Clause P144 conservée'],
      ['Signatures & annexes', 'Annexe P144 conservée'],
    ] as const) {
      await user.click(screen.getByRole('button', { name: section }));
      expect(screen.getByRole('heading', { name: section })).toBeInTheDocument();
      expect(screen.getByText(value)).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Offre & contrat' })).toHaveAttribute('aria-selected', 'true');
    }
    await user.click(screen.getByRole('tab', { name: 'Identité' }));
    expect(screen.queryByText('Annexe P144 conservée')).not.toBeInTheDocument();
  });

  it('opens a migrated contractual document from private Supabase Storage', async () => {
    const user = userEvent.setup();
    const { client, createSignedUrl } = createClient();

    render(<ProjectsPage client={client as never} />);

    await user.click(await screen.findByRole('button', { name: /P1086 Campagne Atlantique 2026/ }));
    await user.click(screen.getByRole('tab', { name: 'Documents' }));
    const link = await screen.findByRole('button', { name: /Contrat Atlantique signé.pdf/ });
    await user.click(link);
    await waitFor(() => expect(createSignedUrl).toHaveBeenCalled());

    expect(link).toBeEnabled();
    expect(link).toHaveTextContent('Ouvrir le document');
    expect(screen.getAllByText(/Document du projet/).length).toBeGreaterThan(0);
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
    await user.type(screen.getByLabelText('Nom du projet *'), 'Projet BBTM');
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
    await user.click(screen.getByRole('button', { name: /Offre Commerciale/ }));
    await user.selectOptions(screen.getByLabelText('Navire principal *'), '12');
    await user.click(screen.getByRole('button', { name: 'Créer le projet' }));

    expect(await screen.findByText('P1196 enregistré dans Supabase.')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('projects_save', expect.objectContaining({
      target_delivery_port: 'Port de Brest',
      target_project_id: null,
      target_title: 'Projet BBTM',
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
        data: { id: 990, project_code: 'P1196', title: 'Projet BBTM', updated_at: '2026-07-16T08:00:00Z' },
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
    await user.click(screen.getByRole('button', { name: /Offre Commerciale/ }));
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

  it('confirms and removes a planning operation while preserving its BBTM documents', async () => {
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

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Les documents déjà classés resteront conservés dans BBTM'));
    expect(rpc).toHaveBeenCalledWith('projects_delete_planning_occurrence', {
      target_occurrence_id: 1201,
      target_project_id: 880,
    });
    expect(await screen.findByText(/Opération supprimée du Planning/)).toBeInTheDocument();
    expect(screen.queryByText('Rotation 1')).not.toBeInTheDocument();
    confirm.mockRestore();
  });

  it('offers the document-only download for the contract type and stores the issued file in BBTM', async () => {
    const user = userEvent.setup();
    const { client, from, rpc } = createClient();
    render(<ProjectsPage client={client as never} roles={['admin']} />);

    await user.click(await screen.findByRole('button', { name: /P1086 Campagne Atlantique 2026/ }));
    await user.click(screen.getByRole('tab', { name: 'Offre & contrat' }));
    expect(screen.getByRole('radio', { name: 'BIMCO' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Émettre le contrat' }));
    expect(screen.getByRole('dialog', { name: 'Émettre : BIMCO' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Document seul/ })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Émettre et télécharger' }));

    await waitFor(() => expect(documentGenerationMocks.generateProjectDocument).toHaveBeenCalledWith(
      'bimco_supplytime',
      expect.objectContaining({ contract: expect.objectContaining({ projectId: 880 }) }),
    ));
    expect(documentStorageMocks.storeGeneratedProjectDocument).toHaveBeenCalledTimes(1);
    expect(documentGenerationMocks.downloadGeneratedProjectDocument).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'P1086 - Offre - R1.pdf' }),
    );
    expect(from.mock.calls.map(([table]) => table)).not.toContain('storage');
    expect(rpc.mock.calls.map(([functionName]) => functionName)).toEqual(
      expect.not.arrayContaining(['projects_save_planning_occurrence', 'projects_delete_planning_occurrence']),
    );
  });

  it('lets the issuer choose the English commercial-offer template', async () => {
    const user = userEvent.setup();
    const { client } = createClient({
      projects: {
        data: [{ ...atlantiqueProjectRow, contract_type: 'Offre Commerciale' }],
        error: null,
      },
    });
    render(<ProjectsPage client={client as never} roles={['admin']} />);

    await user.click(await screen.findByRole('button', { name: /P1086 Campagne Atlantique 2026/ }));
    await user.click(screen.getByRole('tab', { name: 'Offre & contrat' }));
    await user.click(within(screen.getByRole('region', { name: 'Offre et contrat' })).getByRole('button', { name: 'Émettre le document' }));
    expect(screen.getByRole('radio', { name: /Français/ })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: /English/ }));
    await user.click(screen.getByRole('button', { name: 'Émettre et télécharger' }));

    await waitFor(() => expect(documentGenerationMocks.generateProjectDocument).toHaveBeenCalledWith(
      'offer',
      expect.objectContaining({ language: 'en' }),
    ));
  });

  it.each([
    ["Contrat d'Affrètement", "Contrat d'Affrètement à Temps"],
    ["Contrat d'Affrètement à Temps", "Contrat d'Affrètement à Temps"],
    ["Contrat d'Affrètement Coque Nue", "Contrat d'Affrètement Coque Nue"],
  ])('emits %s with the shared charter model and its own title', async (contractType, expectedLabel) => {
    const user = userEvent.setup();
    const { client } = createClient({
      projects: {
        data: [{ ...atlantiqueProjectRow, contract_type: contractType }],
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
    await user.click(screen.getByRole('tab', { name: 'Offre & contrat' }));
    expect(screen.getByRole('radio', { name: expectedLabel })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Émettre le contrat' }));
    expect(screen.getByRole('heading', { name: `Émettre : ${expectedLabel}` })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Émettre et télécharger' }));

    await waitFor(() => expect(documentGenerationMocks.generateProjectDocument).toHaveBeenCalledWith(
      'bareboat_charter',
      expect.objectContaining({
        contract: expect.objectContaining({ projectId: 880 }),
        project: expect.objectContaining({ contractType: expectedLabel }),
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

  it('downloads the issued document with the saved project attachments when requested', async () => {
    const user = userEvent.setup();
    const attachmentRow = {
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
    };
    const { client } = createClient({
      project_generated_documents: { data: [attachmentRow], error: null },
    });
    render(<ProjectsPage client={client as never} roles={['admin']} />);

    await user.click(await screen.findByRole('button', { name: /P1086 Campagne Atlantique 2026/ }));
    await user.click(screen.getByRole('tab', { name: 'Offre & contrat' }));
    await user.click(screen.getByRole('button', { name: 'Émettre le contrat' }));
    await user.click(screen.getByRole('radio', { name: /Document \+ pièces jointes/ }));
    await user.click(screen.getByRole('button', { name: 'Émettre et télécharger' }));

    await waitFor(() => expect(documentStorageMocks.createProjectDocumentBundle).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        attachments: [expect.objectContaining({
          fileName: 'Attestation Expert BV.pdf',
          storagePath: 'projects/880/attachments/toilette_de_mer/attestation.pdf',
        })],
      }),
    ));
    expect(documentGenerationMocks.downloadGeneratedProjectDocument).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'application/zip' }),
    );
  });
});
