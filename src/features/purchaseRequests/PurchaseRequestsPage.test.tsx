import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PurchaseRequestsPage } from './PurchaseRequestsPage';

const baseRequest = {
  id: 95,
  request_number: '95',
  title: 'Moteur de commande régulation GE1',
  requested_on: '2026-07-29',
  requester_name: 'Julien LECOCQ',
  supplier_name: 'CATERPILLAR',
  project_id: null,
  project_sharepoint_item_id: null,
  project_code: null,
  project_title: null,
  vessel_id: 1,
  vessel_sharepoint_item_id: '1',
  vessel_name: 'GOURY',
  reference: '4W-7773',
  quantity: 1,
  unit_label: 'Unité',
  unit_price_ht: 0,
  amount_ht: 0,
  currency: 'EUR',
  status: 'Approbation en attente',
  description: 'Remplacement du moteur de commande régulation GE1 défectueux.',
  urgent: false,
  urgency_reason: null,
  owner_name: null,
  ordered_on: null,
  expected_delivery_on: null,
  received_on: null,
  delivery_location: 'Brest',
  delivery_details: 'Déposer à l’atelier machine.',
  rebilling_label: null,
  category_label: 'Approvisionnement',
  processing_comment: null,
  approval_status: 'En attente',
  approval_reason: null,
  approver_name: null,
  approval_history: null,
  website_url: null,
  source_label: 'SharePoint',
  sharepoint_encoded_abs_url: 'https://example.test/95',
  created_at: '2026-07-29T17:39:00Z',
  updated_at: '2026-07-29T17:39:00Z',
};

const urgentRequest = {
  ...baseRequest,
  id: 86,
  request_number: '86',
  title: 'Ampoule feu de navigation',
  urgent: true,
  urgency_reason: 'Sécurité navigation',
};

function orderedResult(data: unknown[]) {
  return {
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockImplementation(() => ({
        order: vi.fn().mockResolvedValue({ data, error: null }),
        then: (resolve: (value: unknown) => unknown) => resolve({ data, error: null }),
      })),
    }),
  };
}

function createClient(requests: unknown[] = [baseRequest, urgentRequest]) {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  const client = {
    rpc,
    storage: { from: vi.fn() },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'purchase_requests') return orderedResult(requests);
      if (table === 'purchase_request_attachments' || table === 'purchase_request_events') {
        return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      }
      if (table === 'vessels') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [{ id: 1, name: 'GOURY' }, { id: 2, name: 'LE ROZEL' }], error: null }) }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
  return { client, rpc };
}

describe('PurchaseRequestsPage', () => {
  it('renders the modern master-detail cockpit and filters by search and urgency', async () => {
    const user = userEvent.setup();
    const { client } = createClient();

    render(<PurchaseRequestsPage client={client as never} roles={['direction']} />);

    expect(await screen.findByRole('heading', { name: /Demandes d.achat/i })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /#95.*Moteur de commande/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /À traiter 2/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Remplacement du moteur de commande régulation GE1 défectueux.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prendre en charge' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Rechercher les demandes'), { target: { value: 'ampoule' } });
    expect(screen.getByRole('heading', { name: /#86.*Ampoule feu de navigation/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /#95/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Filtres' }));
    expect(screen.getByLabelText('Urgences uniquement')).toBeInTheDocument();
  });

  it('runs the take-charge transition through the secured workflow RPC', async () => {
    const user = userEvent.setup();
    const { client, rpc } = createClient([baseRequest]);

    render(<PurchaseRequestsPage client={client as never} roles={['armement']} />);
    await screen.findByRole('heading', { name: /#95.*Moteur de commande/i });
    await user.click(screen.getByRole('button', { name: 'Prendre en charge' }));

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('purchase_request_transition', {
      p_request_id: 95,
      p_action: 'take_charge',
      p_comment: null,
      p_effective_date: null,
    }));
  });

  it('opens the first non-empty workflow tab on initial load', async () => {
    const orderedRequest = { ...baseRequest, status: 'Commande en cours', ordered_on: '2026-08-01' };
    const { client } = createClient([orderedRequest]);

    render(<PurchaseRequestsPage client={client as never} roles={['direction']} />);

    await waitFor(() => expect(screen.getByRole('tab', { name: /En commande 1/i })).toHaveAttribute('aria-selected', 'true'));
    expect(await screen.findByRole('heading', { name: /#95.*Moteur de commande/i })).toBeInTheDocument();
  });

  it('opens the six-step creation wizard with vessel and attachment support', async () => {
    const user = userEvent.setup();
    const { client } = createClient();

    render(<PurchaseRequestsPage client={client as never} roles={['capitaine']} />);
    await screen.findByRole('heading', { name: /Demandes d.achat/i });
    await user.click(screen.getByRole('button', { name: 'Nouvelle demande' }));

    expect(screen.getByRole('heading', { name: /Créer une demande d.achat/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /6.*Pièces jointes/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Navire')).toHaveTextContent('GOURY');
  });
});
