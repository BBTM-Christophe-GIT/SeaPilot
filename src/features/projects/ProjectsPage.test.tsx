import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProjectsPage } from './ProjectsPage';

const atlantiqueProjectRow = {
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
};

const mancheProjectRow = {
  id: 881,
  title: 'Campagne Manche 2026',
  project_code: 'P-2026-015',
  client_id: 51,
  client_sharepoint_item_id: '51',
  client_name: 'Cerema',
  primary_vessel_id: 13,
  primary_vessel_sharepoint_item_id: '13',
  primary_vessel_name: 'SUROIT',
  secondary_vessel_id: null,
  secondary_vessel_sharepoint_item_id: null,
  secondary_vessel_name: null,
  starts_on: '2026-08-01',
  ends_on: '2026-08-12',
  status: 'Offre Transmise',
  description: 'Preparation dragage',
  source_label: 'SharePoint',
};

const atlantiqueProjectDocumentRow = {
  id: 882,
  project_id: 880,
  project_sharepoint_item_id: '880',
  project_code: 'P-2026-014',
  project_title: 'Campagne Atlantique 2026',
  category_key: 'planning',
  title: 'Plan projet Atlantique.pdf',
  source_label: 'SharePoint',
  source_sharepoint_id: '882',
  file_url: 'https://sharepoint.test/projets/plan-atlantique.pdf',
  notes: '/sites/QHSE/Documents Projets/P-2026-014/plan-atlantique.pdf',
};

const mancheProjectDocumentRow = {
  id: 883,
  project_id: 881,
  project_sharepoint_item_id: '881',
  project_code: 'P-2026-015',
  project_title: 'Campagne Manche 2026',
  category_key: 'planning',
  title: 'Plan projet Manche.pdf',
  source_label: 'SharePoint',
  source_sharepoint_id: '883',
  file_url: 'https://sharepoint.test/projets/plan-manche.pdf',
  notes: '/sites/QHSE/Documents Projets/P-2026-015/plan-manche.pdf',
};

const atlantiqueContractDocumentRow = {
  id: 884,
  project_id: 880,
  project_sharepoint_item_id: '880',
  project_code: 'P-2026-014',
  project_title: 'Campagne Atlantique 2026',
  category_key: 'contract',
  title: 'Contrat Atlantique signe.pdf',
  source_label: 'SharePoint',
  source_sharepoint_id: '884',
  file_url: 'https://sharepoint.test/contrats/contrat-atlantique.pdf',
  notes: '/sites/QHSE/Documents Contractuels/P-2026-014/contrat-atlantique.pdf',
};

const ifremerClientRow = {
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
};

const ceremaClientRow = {
  id: 51,
  name: 'Cerema',
  code: 'CER',
  email: '',
  phone: '',
  address: '',
  city: 'Rouen',
  country: 'France',
  active: true,
  source_label: 'SharePoint',
};

function createClient(
  projects: unknown[] = [atlantiqueProjectRow, mancheProjectRow],
  projectDocuments: unknown[] = [atlantiqueProjectDocumentRow, mancheProjectDocumentRow],
  contractDocuments: unknown[] = [atlantiqueContractDocumentRow],
  clients: unknown[] = [ifremerClientRow, ceremaClientRow],
) {
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: atlantiqueProjectRow, error: null }),
    }),
  });
  const client = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'projects') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: projects, error: null }),
            }),
          }),
          insert,
        };
      }

      if (table === 'project_documents') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: projectDocuments, error: null }),
            }),
          }),
        };
      }

      if (table === 'contract_documents') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: contractDocuments, error: null }),
            }),
          }),
        };
      }

      if (table === 'clients') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: clients, error: null }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { client, insert };
}

function createClientWithCreatedProject(createdProject: unknown) {
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: createdProject, error: null }),
    }),
  });
  const client = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'projects') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
          insert,
        };
      }

      if (table === 'project_documents' || table === 'contract_documents') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }

      if (table === 'clients') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [ifremerClientRow], error: null }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { client, insert };
}

describe('ProjectsPage', () => {
  it('filters projects and their documents by status, client, vessel, dates and search text', async () => {
    const user = userEvent.setup();
    const { client } = createClient();

    render(<ProjectsPage client={client as never} roles={['direction']} />);

    expect(await screen.findByRole('heading', { name: 'Projets' })).toBeInTheDocument();
    expect(screen.getByText('Preparation dragage')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filtre statut projet'), 'Contrat Signe');
    await user.selectOptions(screen.getByLabelText('Filtre client projet'), 'Ifremer');
    await user.selectOptions(screen.getByLabelText('Filtre navire projet'), 'COTENTIN');
    fireEvent.change(screen.getByLabelText('Projet depuis'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText("Projet jusqu'au"), { target: { value: '2026-07-31' } });
    fireEvent.change(screen.getByLabelText('Recherche projets'), { target: { value: 'bathymetrie' } });

    expect(screen.getByText('Campagne bathymetrie')).toBeInTheDocument();
    expect(screen.getByText('Plan projet Atlantique.pdf')).toBeInTheDocument();
    expect(screen.getByText('Contrat Atlantique signe.pdf')).toBeInTheDocument();
    expect(screen.queryByText('Preparation dragage')).not.toBeInTheDocument();
    expect(screen.queryByText('Plan projet Manche.pdf')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Projets actifs')).toHaveTextContent('1');
    expect(screen.getByLabelText('Documents projets')).toHaveTextContent('1');
    expect(screen.getByLabelText('Documents contractuels')).toHaveTextContent('1');
  });

  it('creates a project for office roles', async () => {
    const user = userEvent.setup();
    const createdProject = {
      ...atlantiqueProjectRow,
      id: 900,
      title: 'Mission portuaire 2026',
      project_code: 'P-2026-020',
      client_name: 'Ifremer',
      primary_vessel_name: 'COTENTIN',
      secondary_vessel_name: 'SUROIT',
      starts_on: '2026-09-01',
      ends_on: '2026-09-08',
      status: 'A planifier',
      description: 'Inspection quai',
      source_label: 'seapilot',
    };
    const { client, insert } = createClientWithCreatedProject(createdProject);

    render(<ProjectsPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Projets' });
    fireEvent.change(screen.getByLabelText('Numero projet'), { target: { value: 'P-2026-020' } });
    fireEvent.change(screen.getByLabelText('Titre projet'), { target: { value: 'Mission portuaire 2026' } });
    fireEvent.change(screen.getByLabelText('Client projet'), { target: { value: 'Ifremer' } });
    fireEvent.change(screen.getByLabelText('Navire principal projet'), { target: { value: 'COTENTIN' } });
    fireEvent.change(screen.getByLabelText('Navire secondaire projet'), { target: { value: 'SUROIT' } });
    fireEvent.change(screen.getByLabelText('Debut projet'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Fin projet'), { target: { value: '2026-09-08' } });
    fireEvent.change(screen.getByLabelText('Statut projet'), { target: { value: 'A planifier' } });
    fireEvent.change(screen.getByLabelText('Description projet'), { target: { value: 'Inspection quai' } });
    await user.click(screen.getByRole('button', { name: 'Ajouter projet' }));

    expect(insert).toHaveBeenCalledWith({
      project_code: 'P-2026-020',
      title: 'Mission portuaire 2026',
      client_name: 'Ifremer',
      primary_vessel_name: 'COTENTIN',
      secondary_vessel_name: 'SUROIT',
      starts_on: '2026-09-01',
      ends_on: '2026-09-08',
      status: 'A planifier',
      description: 'Inspection quai',
      source_label: 'seapilot',
    });
    expect(await screen.findByText('Projet ajoute.')).toBeInTheDocument();
    expect(screen.getByText('Mission portuaire 2026')).toBeInTheDocument();
  });
});
