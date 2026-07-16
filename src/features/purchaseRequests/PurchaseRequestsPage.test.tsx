import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PurchaseRequestsPage } from './PurchaseRequestsPage';

const capteursRequestRow = {
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
};

const piecesRequestRow = {
  id: 701,
  request_number: 'DA-2026-002',
  title: 'DA-2026-002',
  requested_on: '2026-08-03',
  requester_name: 'Arthur MAREST',
  supplier_name: 'Marine Supplies',
  project_id: 881,
  project_sharepoint_item_id: '881',
  project_code: 'P-2026-015',
  project_title: 'Campagne Manche 2026',
  amount_ht: 4200,
  currency: 'EUR',
  status: 'Recu',
  description: 'Pieces machine',
  source_label: 'SharePoint',
};

function createClient(requests: unknown[] = [capteursRequestRow, piecesRequestRow]) {
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: capteursRequestRow, error: null }),
    }),
  });
  const client = {
    rpc: vi.fn().mockResolvedValue({ data: [{ id: 880, project_code: 'P-2026-014', title: 'Campagne Atlantique 2026' }], error: null }),
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'purchase_requests') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: requests, error: null }),
            }),
          }),
          insert,
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { client, insert };
}

function createClientWithCreatedRequest(createdRequest: unknown) {
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: createdRequest, error: null }),
    }),
  });
  const client = {
    rpc: vi.fn().mockResolvedValue({ data: [{ id: 880, project_code: 'P-2026-014', title: 'Campagne Atlantique 2026' }], error: null }),
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'purchase_requests') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
          insert,
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { client, insert };
}

describe('PurchaseRequestsPage', () => {
  it('filters purchase requests by status, project, supplier, dates and search text', async () => {
    const user = userEvent.setup();
    const { client } = createClient();

    render(<PurchaseRequestsPage client={client as never} roles={['direction']} />);

    expect(await screen.findByRole('heading', { name: "Demandes d'achat" })).toBeInTheDocument();
    expect(screen.getByText('Pieces machine')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filtre statut achat'), 'En cours');
    await user.selectOptions(screen.getByLabelText('Filtre projet achat'), 'P-2026-014');
    await user.selectOptions(screen.getByLabelText('Filtre fournisseur achat'), 'Chantier Naval Manche');
    fireEvent.change(screen.getByLabelText('Achat depuis'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText("Achat jusqu'au"), { target: { value: '2026-07-31' } });
    fireEvent.change(screen.getByLabelText('Recherche achats'), { target: { value: 'capteurs' } });

    expect(screen.getByText('Achat capteurs')).toBeInTheDocument();
    expect(screen.queryByText('Pieces machine')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Demandes achat')).toHaveTextContent('1');
    expect(screen.getByLabelText('Demandes en cours')).toHaveTextContent('1');
    expect(screen.getByLabelText('Montant HT')).toHaveTextContent('12');
  });

  it('creates a purchase request for office roles', async () => {
    const user = userEvent.setup();
    const createdRequest = {
      ...capteursRequestRow,
      id: 710,
      request_number: 'DA-2026-010',
      title: 'DA-2026-010',
      requested_on: '2026-09-05',
      requester_name: 'Julien LECOCQ',
      supplier_name: 'Chantier Naval Manche',
      project_code: 'P-2026-014',
      project_title: 'Campagne Atlantique 2026',
      amount_ht: 9800.75,
      currency: 'EUR',
      status: 'A valider',
      description: 'Treuil remplacement',
      source_label: 'seapilot',
    };
    const { client, insert } = createClientWithCreatedRequest(createdRequest);

    render(<PurchaseRequestsPage client={client as never} roles={['armement']} />);

    await screen.findByRole('heading', { name: "Demandes d'achat" });
    fireEvent.change(screen.getByLabelText('Numero demande'), { target: { value: 'DA-2026-010' } });
    fireEvent.change(screen.getByLabelText('Titre demande'), { target: { value: 'DA-2026-010' } });
    fireEvent.change(screen.getByLabelText('Date demande'), { target: { value: '2026-09-05' } });
    fireEvent.change(screen.getByLabelText('Demandeur'), { target: { value: 'Julien LECOCQ' } });
    fireEvent.change(screen.getByLabelText('Fournisseur'), { target: { value: 'Chantier Naval Manche' } });
    await user.selectOptions(screen.getByLabelText('Projet du catalogue achat'), '880');
    fireEvent.change(screen.getByLabelText('Montant HT demande'), { target: { value: '9800,75' } });
    fireEvent.change(screen.getByLabelText('Devise demande'), { target: { value: 'EUR' } });
    await user.selectOptions(screen.getByLabelText('Statut achat'), 'A valider');
    fireEvent.change(screen.getByLabelText('Objet achat'), { target: { value: 'Treuil remplacement' } });
    await user.click(screen.getByRole('button', { name: 'Ajouter demande' }));

    expect(insert).toHaveBeenCalledWith({
      request_number: 'DA-2026-010',
      title: 'DA-2026-010',
      requested_on: '2026-09-05',
      requester_name: 'Julien LECOCQ',
      supplier_name: 'Chantier Naval Manche',
      project_id: 880,
      project_code: 'P-2026-014',
      project_title: 'Campagne Atlantique 2026',
      amount_ht: 9800.75,
      currency: 'EUR',
      status: 'A valider',
      description: 'Treuil remplacement',
      source_label: 'seapilot',
    });
    expect(await screen.findByText('Demande ajoutee.')).toBeInTheDocument();
    expect(screen.getByText('Treuil remplacement')).toBeInTheDocument();
  });
});
