import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProjectsPage } from './ProjectsPage';

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

const atlantiqueProjectDocumentRow = {
  category_key: 'planning',
  file_extension: 'pdf',
  file_name: 'Plan projet Atlantique.pdf',
  file_size_bytes: 2048,
  file_url: 'https://sharepoint.test/projets/plan-atlantique.pdf',
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
  sharepoint_list_title: 'Documents Projets',
  source_label: 'SharePoint',
  source_modified_at: '2026-07-14T12:00:00Z',
  source_sharepoint_id: '882',
  title: 'Plan projet Atlantique.pdf',
};

const mancheProjectDocumentRow = {
  ...atlantiqueProjectDocumentRow,
  file_name: 'Plan projet Manche.pdf',
  file_url: 'https://sharepoint.test/projets/plan-manche.pdf',
  id: 883,
  project_code: 'P1087',
  project_id: 881,
  project_sharepoint_item_id: '881',
  project_title: 'Campagne Manche 2026',
  sharepoint_item_id: '883',
  title: 'Plan projet Manche.pdf',
};

const atlantiqueContractDocumentRow = {
  ...atlantiqueProjectDocumentRow,
  category_key: 'contract',
  file_name: 'Contrat Atlantique signé.pdf',
  file_url: 'https://sharepoint.test/contrats/contrat-atlantique.pdf',
  folder_path: '/sites/QHSE/Documents Contractuels/P1086',
  id: 884,
  sharepoint_item_id: '884',
  sharepoint_list_title: 'Documents Contractuels',
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
  sharepoint_item_id: '50',
  sharepoint_list_title: 'BBTM - Clients',
  source_label: 'SharePoint',
  source_modified_at: '2026-07-14T12:00:00Z',
};

const ceremaClientRow = { ...ifremerClientRow, city: 'Rouen', code: 'CER', email: '', id: 51, name: 'Cerema' };

interface MockSource {
  data: unknown[] | null;
  error: unknown;
}

function createClient(overrides: Partial<Record<string, MockSource>> = {}) {
  const sources: Record<string, MockSource> = {
    clients: { data: [ifremerClientRow, ceremaClientRow], error: null },
    contract_documents: { data: [atlantiqueContractDocumentRow], error: null },
    project_contracts: { data: [atlantiqueContractRow], error: null },
    project_documents: { data: [atlantiqueProjectDocumentRow, mancheProjectDocumentRow], error: null },
    projects: { data: [atlantiqueProjectRow, mancheProjectRow], error: null },
    ...overrides,
  };
  const from = vi.fn((table: string) => ({
    select: vi.fn(() => ({
      order: vi.fn(() => ({
        gt: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue(sources[table]),
        })),
      })),
    })),
  }));

  return { client: { from }, from };
}

describe('ProjectsPage', () => {
  it('filters projects and associated indicators by status, client, vessel, period and search', async () => {
    const user = userEvent.setup();
    const { client } = createClient();

    render(<ProjectsPage client={client as never} roles={['direction']} />);

    expect(await screen.findByRole('heading', { name: 'Projets' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Filtre statut projet'), 'Contrat signé');
    await user.selectOptions(screen.getByLabelText('Filtre client projet'), 'Ifremer');
    await user.selectOptions(screen.getByLabelText('Filtre navire projet'), 'COTENTIN');
    fireEvent.change(screen.getByLabelText('Projet depuis'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('Projet jusqu’au'), { target: { value: '2026-07-31' } });
    await user.type(screen.getByLabelText('Recherche projets'), 'bathymetrie');

    await waitFor(() => expect(screen.queryByText('Préparation dragage')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Projets actifs')).toHaveTextContent('1');
    expect(screen.getByLabelText('Documents projets')).toHaveTextContent('1');
    expect(screen.getByLabelText('Documents contractuels')).toHaveTextContent('1');
    expect(screen.getByLabelText('Clients représentés')).toHaveTextContent('1');
  });

  it('selects a project with an accessible button and renders the full read-only detail', async () => {
    const user = userEvent.setup();
    const { client, from } = createClient();

    render(<ProjectsPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Projets' });
    const projectButton = screen.getByRole('button', { name: /Campagne Atlantique 2026P1086/ });
    await user.click(projectButton);

    expect(projectButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'Identification' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Planning' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Offre commerciale' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Opérations' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Contrat' })).toBeInTheDocument();
    expect(screen.getAllByText('Armateur BBTM, Brest').length).toBeGreaterThan(0);
    expect(screen.getByText('Clauses particulières Atlantique')).toBeInTheDocument();
    expect(screen.getByText('Projet repris depuis SharePoint · BBTM - Projets · 880.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ouvrir dans SharePoint.*Plan projet Atlantique.pdf/ })).toHaveAttribute(
      'href',
      'https://sharepoint.test/projets/plan-atlantique.pdf',
    );
    expect(screen.queryByRole('button', { name: /Ajouter projet/i })).not.toBeInTheDocument();
    expect(from.mock.calls.map(([table]) => table)).toEqual(
      expect.arrayContaining(['projects', 'project_contracts', 'project_documents', 'contract_documents', 'clients']),
    );
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
    expect(screen.getAllByText('Campagne Manche 2026').length).toBeGreaterThan(0);
    expect(screen.getByText(/informations contractuelles et SUPPLYTIME sont temporairement indisponibles/)).toBeInTheDocument();
  });

  it('distinguishes a valid empty Supabase result from a loading or error state', async () => {
    const { client } = createClient({ projects: { data: [], error: null } });

    render(<ProjectsPage client={client as never} />);

    expect(await screen.findByText('Aucun projet n’est disponible dans Supabase.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
