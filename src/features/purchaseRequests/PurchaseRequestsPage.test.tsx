import { fireEvent, render as renderUi, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { Link, MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { isCaptainScopedPurchaseView, PurchaseRequestsPage } from './PurchaseRequestsPage';
import { derivePurchaseRequestStage } from './purchaseRequestQueries';

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
  status: 'À traiter',
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

const completedUrgentRequest = {
  ...urgentRequest,
  id: 87,
  request_number: '87',
  title: 'Ancienne commande urgente soldée',
  status: 'Commandes traitées',
  received_on: '2026-08-26',
};

const approvedRequest = {
  ...baseRequest,
  approval_status: 'Demande acceptée',
  approver_name: 'Responsable Armement',
};

const linkedOrderedRequest = {
  ...approvedRequest,
  id: 274,
  request_number: '274',
  title: 'Dyneema petit treuil',
  vessel_id: 2,
  vessel_name: 'LE ROZEL',
  status: 'Commande en cours',
  ordered_on: '2026-09-20',
};

function render(ui: ReactNode, entry = '/purchase-requests') {
  return renderUi(<MemoryRouter initialEntries={[entry]}>{ui}</MemoryRouter>);
}

function mockDetailScrolling() {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
  const scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
  return {
    scrollIntoView,
    restore: () => original
      ? Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', original)
      : Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView'),
  };
}

function orderedResult(data: unknown[], pendingResult?: Promise<{ data: unknown[]; error: null }>) {
  return {
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockImplementation(() => ({
        order: vi.fn().mockReturnValue(pendingResult || Promise.resolve({ data, error: null })),
        then: (resolve: (value: unknown) => unknown) => resolve({ data, error: null }),
      })),
    }),
  };
}

function createClient(requests: unknown[] = [baseRequest, urgentRequest], options: {
  pendingResult?: Promise<{ data: unknown[]; error: null }>;
  assignedVessel?: { id: number; name: string };
} = {}) {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  const client = {
    rpc,
    storage: { from: vi.fn() },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'purchase_requests') return orderedResult(requests, options.pendingResult);
      if (table === 'purchase_request_attachments' || table === 'purchase_request_events') {
        return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      }
      if (table === 'vessels') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [{ id: 1, name: 'GOURY' }, { id: 2, name: 'LE ROZEL' }, { id: 3, name: 'NAVIRE CANONIQUE' }], error: null }) }),
          }),
        };
      }
      if (table === 'planning_assignments') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: options.assignedVessel ? { vessel_id: options.assignedVessel.id, vessels: { name: options.assignedVessel.name } } : null,
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
  return { client, rpc };
}

describe('PurchaseRequestsPage', () => {
  it('keeps a newly created request in À traiter even when a desired delivery date is present', () => {
    expect(derivePurchaseRequestStage({
      expectedDeliveryOn: '2026-09-12',
      orderedOn: '',
      receivedOn: '',
      status: 'À traiter',
    })).toBe('to_process');
    expect(derivePurchaseRequestStage({
      expectedDeliveryOn: '2026-09-12',
      orderedOn: '2026-09-06',
      receivedOn: '',
      status: 'En commande',
    })).toBe('ordered');
    expect(derivePurchaseRequestStage({
      expectedDeliveryOn: '2026-09-12',
      orderedOn: '2026-09-06',
      receivedOn: '',
      status: 'À réception',
    })).toBe('receiving');
  });

  it('keeps office profiles company-wide when they also own a captain role', () => {
    expect(isCaptainScopedPurchaseView(['admin', 'capitaine', 'marin'])).toBe(false);
    expect(isCaptainScopedPurchaseView(['direction', 'capitaine'])).toBe(false);
    expect(isCaptainScopedPurchaseView(['armement', 'capitaine'])).toBe(false);
    expect(isCaptainScopedPurchaseView(['capitaine', 'marin'])).toBe(true);
  });

  it('opens the linked request in its workflow stage instead of the first pending request', async () => {
    const { client } = createClient([baseRequest, { ...linkedOrderedRequest, id: 273, request_number: '273', title: 'Autre commande' }, linkedOrderedRequest]);

    render(<PurchaseRequestsPage client={client as never} roles={['admin']} />, '/purchase-requests?requestId=274');

    expect(await screen.findByRole('heading', { name: '#274 · Dyneema petit treuil' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'En commande 2' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: /#274.*Dyneema petit treuil/ })).toHaveClass('is-selected');
    expect(screen.getByRole('button', { name: 'Planifier la livraison' })).toBeEnabled();
    expect(screen.queryByRole('heading', { name: /#95.*Moteur/ })).not.toBeInTheDocument();
    const detail = within(screen.getByRole('region', { name: 'Demande 274' }));
    expect(detail.getByRole('heading', { name: 'Besoin' })).toBeInTheDocument();
    expect(detail.getByRole('heading', { name: 'Livraison à bord' })).toBeInTheDocument();
    expect(detail.getByRole('heading', { name: 'Suivi de la demande' })).toBeInTheDocument();
  });

  it('selects the linked row and its page when the request is beyond the first ten rows', async () => {
    const requests = Array.from({ length: 12 }, (_, index) => ({
      ...baseRequest, id: 200 + index, request_number: String(200 + index), title: `Article ${index + 1}`,
    }));
    const { client } = createClient(requests);

    render(<PurchaseRequestsPage client={client as never} roles={['direction']} />, '/purchase-requests?requestId=210');

    expect(await screen.findByRole('heading', { name: '#210 · Article 11' })).toBeInTheDocument();
    expect(await screen.findByText('11–12 sur 12', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /#210.*Article 11/ })).toHaveClass('is-selected');
    expect(screen.getByRole('button', { name: '2' })).toHaveClass('is-active');
    expect(screen.queryByRole('button', { name: /#200.*Article 1 / })).not.toBeInTheDocument();
  });

  it('brings the resolved linked detail into view once after selecting its stage and page', async () => {
    const user = userEvent.setup();
    const scrolling = mockDetailScrolling();
    const requests = [baseRequest, ...Array.from({ length: 10 }, (_, index) => ({
      ...linkedOrderedRequest, id: 200 + index, request_number: String(200 + index), title: `Autre commande ${index + 1}`,
    })), linkedOrderedRequest];
    const { client } = createClient(requests);
    try {
      render(<PurchaseRequestsPage client={client as never} roles={['admin']} />, '/purchase-requests?requestId=274');

      await waitFor(() => expect(scrolling.scrollIntoView).toHaveBeenCalledTimes(1), { timeout: 5000 });
      expect(scrolling.scrollIntoView.mock.contexts[0]).toBe(screen.getByRole('region', { name: 'Demande 274' }));
      expect(scrolling.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
      expect(screen.getByRole('tab', { name: 'En commande 11' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByText('11–11 sur 11')).toBeInTheDocument();

      requests[11] = { ...linkedOrderedRequest, title: 'Dyneema petit treuil actualisé' };
      await user.click(screen.getByRole('button', { name: 'Actualiser' }));
      await screen.findByRole('heading', { name: '#274 · Dyneema petit treuil actualisé' });
      expect(scrolling.scrollIntoView).toHaveBeenCalledTimes(1);
      await user.type(screen.getByLabelText('Rechercher les demandes'), 'autre commande');
      expect(scrolling.scrollIntoView).toHaveBeenCalledTimes(1);
    } finally {
      scrolling.restore();
    }
  });

  it('keeps ordinary page loads and search filtering from automatically scrolling the detail', async () => {
    const user = userEvent.setup();
    const scrolling = mockDetailScrolling();
    const { client } = createClient();
    try {
      render(<PurchaseRequestsPage client={client as never} roles={['direction']} />);
      await screen.findByRole('heading', { name: /#95.*Moteur/ });
      await user.type(screen.getByLabelText('Rechercher les demandes'), 'ampoule');

      expect(screen.getByRole('heading', { name: /#86.*Ampoule/ })).toBeInTheDocument();
      expect(scrolling.scrollIntoView).not.toHaveBeenCalled();
    } finally {
      scrolling.restore();
    }
  });

  it('waits for asynchronous data before resolving an explicit selection', async () => {
    let resolveRequests!: (result: { data: unknown[]; error: null }) => void;
    const pendingResult = new Promise<{ data: unknown[]; error: null }>((resolve) => { resolveRequests = resolve; });
    const { client } = createClient([], { pendingResult });
    render(<PurchaseRequestsPage client={client as never} roles={['direction']} />, '/purchase-requests?requestId=274');

    expect(screen.getByText('Chargement des demandes d\'achat…')).toBeInTheDocument();
    resolveRequests({ data: [baseRequest, linkedOrderedRequest], error: null });

    expect(await screen.findByRole('heading', { name: '#274 · Dyneema petit treuil' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'En commande 1' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Cette demande est introuvable ou inaccessible.')).not.toBeInTheDocument();
  });

  it('resolves query navigation while mounted and allows ordinary row, stage and search navigation afterwards', async () => {
    const user = userEvent.setup();
    const secondOrderedRequest = { ...linkedOrderedRequest, id: 275, request_number: '275', title: 'Cordage de secours' };
    const { client } = createClient([baseRequest, urgentRequest, linkedOrderedRequest, secondOrderedRequest]);
    render(<>
      <Link to="/purchase-requests?requestId=274">Ouvrir le Dyneema</Link>
      <Link to="/purchase-requests?requestId=95">Ouvrir le moteur</Link>
      <PurchaseRequestsPage client={client as never} roles={['direction']} />
    </>);
    await screen.findByRole('heading', { name: /#95.*Moteur/ });
    await user.type(screen.getByLabelText('Rechercher les demandes'), 'ampoule');
    expect(screen.getByRole('heading', { name: /#86.*Ampoule/ })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Ouvrir le Dyneema' }));
    expect(await screen.findByRole('heading', { name: '#274 · Dyneema petit treuil' })).toBeInTheDocument();
    expect(screen.getByLabelText('Rechercher les demandes')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: /#275.*Cordage de secours/ }));
    expect(await screen.findByRole('heading', { name: '#275 · Cordage de secours' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Ouvrir le moteur' }));
    expect(await screen.findByRole('heading', { name: /#95.*Moteur/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'À traiter 2' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'En commande 2' }));
    expect(await screen.findByRole('heading', { name: '#274 · Dyneema petit treuil' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Rechercher les demandes'), 'cordage');
    expect(screen.getByRole('heading', { name: '#275 · Cordage de secours' })).toBeInTheDocument();
  });

  it.each(['999', '', 'abc', '-95', '95.5', '9007199254740993'])('keeps unrelated details hidden for missing or invalid requestId=%s', async (requestId) => {
    const { client } = createClient([baseRequest]);
    render(<PurchaseRequestsPage client={client as never} roles={['admin']} />, `/purchase-requests?requestId=${requestId}`);

    expect(await screen.findByText('Cette demande est introuvable ou inaccessible.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /#95.*Moteur/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approuver' })).not.toBeInTheDocument();
  });

  it('uses the internal request ID rather than matching a different request number', async () => {
    const { client } = createClient([{ ...baseRequest, request_number: '274' }, { ...linkedOrderedRequest, request_number: 'DA-2026-274' }]);
    render(<PurchaseRequestsPage client={client as never} roles={['direction']} />, '/purchase-requests?requestId=274');

    expect(await screen.findByRole('heading', { name: '#DA-2026-274 · Dyneema petit treuil' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /#274.*Moteur/ })).not.toBeInTheDocument();
  });

  it('opens refused requests in their dedicated view', async () => {
    const { client } = createClient([baseRequest, { ...linkedOrderedRequest, approval_status: 'Demande refusée' }]);
    render(<PurchaseRequestsPage client={client as never} roles={['admin']} />, '/purchase-requests?requestId=274');

    expect(await screen.findByRole('heading', { name: '#274 · Dyneema petit treuil' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Refusées 1' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('button', { name: 'Planifier la livraison' })).not.toBeInTheDocument();
  });

  it.each(['marin', 'capitaine'] as const)('keeps an inaccessible linked request empty for the real %s record fixture', async (role) => {
    const { client } = createClient([baseRequest]);
    render(<PurchaseRequestsPage client={client as never} roles={[role]} />, '/purchase-requests?requestId=274');

    expect(await screen.findByText('Cette demande est introuvable ou inaccessible.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /#95.*Moteur/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Planifier la livraison' })).not.toBeInTheDocument();
  });

  it('preserves the captain assigned-vessel filter when resolving a linked request', async () => {
    const { client } = createClient([baseRequest, linkedOrderedRequest], { assignedVessel: { id: 1, name: 'GOURY' } });
    render(<Routes>
      <Route element={<Outlet context={{ client, roles: ['capitaine'], currentPerson: { id: 44, functionLabel: 'Capitaine' } }} />}>
        <Route element={<PurchaseRequestsPage />} path="/purchase-requests" />
      </Route>
    </Routes>, '/purchase-requests?requestId=274');

    expect(await screen.findByText('Cette demande est introuvable ou inaccessible.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'À traiter 1' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /#274.*Dyneema/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approuver' })).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Filtres' }));
    expect(screen.getByLabelText('Filtrer par navire')).toHaveValue('GOURY');
  });

  it('keeps Marin permissions on a linked order detail', async () => {
    const { client } = createClient([baseRequest, linkedOrderedRequest]);
    render(<PurchaseRequestsPage client={client as never} roles={['marin']} />, '/purchase-requests?requestId=274');

    expect(await screen.findByRole('heading', { name: '#274 · Dyneema petit treuil' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Planifier la livraison' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Nouvelle demande' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refuser' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approuver' })).not.toBeInTheDocument();
  });

  it('renders the modern master-detail cockpit and filters by search and urgency', async () => {
    const user = userEvent.setup();
    const { client } = createClient();

    render(<PurchaseRequestsPage client={client as never} roles={['direction']} />);

    expect(await screen.findByRole('heading', { name: /Demandes d.achat/i })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /#95.*Moteur de commande/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /À traiter 2/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Remplacement du moteur de commande régulation GE1 défectueux.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approuver' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refuser' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Prendre en charge' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Menu des demandes d’achat' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Demandes' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Vues' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Décision' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Logistique et suivi' })).not.toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'Actions de la demande' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Rechercher les demandes'), { target: { value: 'ampoule' } });
    expect(screen.getByRole('heading', { name: /#86.*Ampoule feu de navigation/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /#95/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Filtres' }));
    expect(screen.getByLabelText('Urgences uniquement')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Urgences (1)' }));
    expect(screen.getByRole('button', { name: 'Urgences (1)' })).toHaveClass('is-active');
  });

  it('uses the ribbon views to change the workflow stage', async () => {
    const user = userEvent.setup();
    const orderedRequest = { ...approvedRequest, id: 101, request_number: '101', status: 'Commande en cours', ordered_on: '2026-08-01' };
    const { client } = createClient([baseRequest, orderedRequest]);

    render(<PurchaseRequestsPage client={client as never} roles={['direction']} />);
    await screen.findByRole('heading', { name: /#95.*Moteur de commande/i });

    await user.click(screen.getByRole('button', { name: 'En commande (1)' }));

    expect(screen.getByRole('tab', { name: /En commande 1/i })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('heading', { name: /#101.*Moteur de commande/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Planifier la livraison' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Prendre en charge' })).not.toBeInTheDocument();
  });

  it('shows rejected approvals in the Refusées tab and ribbon instead of the four workflow views', async () => {
    const user = userEvent.setup();
    const stages = [
      { id: 201, title: 'Pompe à traiter', status: 'À traiter', ordered_on: null, expected_delivery_on: null, received_on: null },
      { id: 202, title: 'Pompe commandée', status: 'En commande', ordered_on: '2026-08-01', expected_delivery_on: null, received_on: null },
      { id: 203, title: 'Pompe à réception', status: 'À réception', ordered_on: '2026-08-01', expected_delivery_on: '2026-08-30', received_on: null },
      { id: 204, title: 'Pompe reçue', status: 'Traitée', ordered_on: '2026-08-01', expected_delivery_on: '2026-08-30', received_on: '2026-08-30' },
    ];
    const accepted = stages.map((stage) => ({ ...approvedRequest, ...stage, request_number: String(stage.id) }));
    const rejected = stages.map((stage, index) => ({
      ...baseRequest, ...stage, id: stage.id + 100, request_number: String(stage.id + 100),
      title: `Demande rejetée ${index + 1}`,
      approval_status: ['Demande refusée', 'REFUSÉE', 'Demande refusee', 'Refus'][index],
      approval_reason: 'Budget non validé',
    }));
    const { client, rpc } = createClient([...accepted, ...rejected]);
    render(<PurchaseRequestsPage client={client as never} roles={['armement']} />);
    await screen.findByRole('heading', { name: /#201.*Pompe à traiter/ });
    const list = within(screen.getByRole('region', { name: "Liste des demandes d'achat" }));

    expect(screen.getByRole('tab', { name: 'Refusées 4' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('button', { name: 'Refusées (4)' })).toBeInTheDocument();
    for (const [index, label] of ['À traiter', 'En commande', 'À réception', 'Traitées'].entries()) {
      await user.click(screen.getByRole('tab', { name: `${label} 1` }));
      expect(list.getByRole('button', { name: new RegExp(stages[index].title) })).toBeInTheDocument();
      expect(list.queryByRole('button', { name: /Demande rejetée/ })).not.toBeInTheDocument();
    }

    await user.click(screen.getByRole('button', { name: 'Refusées (4)' }));
    expect(screen.getByRole('tab', { name: 'Refusées 4' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Refusées (4)' })).toHaveClass('is-active');
    expect(list.getAllByRole('button', { name: /Demande rejetée/ })).toHaveLength(4);
    expect(list.queryByRole('button', { name: /Pompe/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Demande 301' })).getByText('Budget non validé')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approuver' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refuser' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Prendre en charge' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Planifier la livraison' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reçu à bord' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'À traiter (1)' }));
    expect(screen.getByRole('button', { name: 'Prendre en charge' })).toBeEnabled();
    await user.click(screen.getByRole('tab', { name: 'Refusées 4' }));
    expect(screen.getByRole('tab', { name: 'Refusées 4' })).toHaveAttribute('aria-selected', 'true');
    expect(list.getAllByRole('button', { name: /Demande rejetée/ })).toHaveLength(4);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('combines refused approvals with search, vessel and category filters and updates both counters', async () => {
    const user = userEvent.setup();
    const rejected = [
      { id: 301, title: 'Pompe hydraulique refusée', vessel_name: 'GOURY', category_label: 'Approvisionnement' },
      { id: 302, title: 'Pompe de secours refusée', vessel_name: 'LE ROZEL', category_label: 'Approvisionnement' },
      { id: 303, title: 'Pompe révision refusée', vessel_name: 'GOURY', category_label: 'Prestataire de Service' },
      { id: 304, title: 'Filtre hydraulique refusé', vessel_name: 'GOURY', category_label: 'Approvisionnement' },
    ].map((request) => ({
      ...baseRequest, ...request, request_number: String(request.id), approval_status: 'Demande refusée',
    }));
    const pending = { ...baseRequest, title: 'Pompe encore à approuver' };
    const { client } = createClient([pending, ...rejected]);
    render(<PurchaseRequestsPage client={client as never} roles={['direction']} />);
    await screen.findByRole('heading', { name: /#95.*Pompe encore à approuver/ });
    await user.click(screen.getByRole('tab', { name: 'Refusées 4' }));
    const list = within(screen.getByRole('region', { name: "Liste des demandes d'achat" }));

    fireEvent.change(screen.getByLabelText('Rechercher les demandes'), { target: { value: 'pompe' } });
    expect(screen.getByRole('tab', { name: 'Refusées 3' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Refusées (3)' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Filtres' }));
    await user.selectOptions(screen.getByLabelText('Filtrer par navire'), 'GOURY');
    expect(screen.getByRole('tab', { name: 'Refusées 2' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Filtrer par catégorie'), 'Approvisionnement');

    expect(screen.getByRole('tab', { name: 'Refusées 1' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Refusées (1)' })).toBeInTheDocument();
    expect(list.getByRole('button', { name: /Pompe hydraulique refusée/ })).toBeInTheDocument();
    expect(list.queryByRole('button', { name: /Pompe de secours refusée|Pompe révision refusée|Filtre hydraulique refusé|Pompe encore à approuver/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Rechercher les demandes'), { target: { value: 'introuvable' } });

    expect(screen.getByRole('tab', { name: 'Refusées 0' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Refusées' })).toBeInTheDocument();
    expect(list.getByText('Aucune demande refusée pour ces filtres.')).toBeInTheDocument();
    expect(screen.getByText('0 demande')).toBeInTheDocument();
    expect(screen.getByText('Sélectionnez une demande pour afficher son suivi.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Rechercher les demandes'), { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    expect(screen.getByRole('tab', { name: 'Refusées 4' })).toHaveAttribute('aria-selected', 'true');
    expect(list.getAllByRole('button', { name: /refus/i })).toHaveLength(4);
  });

  it('recovers from an empty Refusées view without changing pending approval actions', async () => {
    const user = userEvent.setup();
    const { client, rpc } = createClient([baseRequest]);
    render(<PurchaseRequestsPage client={client as never} roles={['direction']} />);
    await screen.findByRole('heading', { name: /#95.*Moteur de commande/ });

    await user.click(screen.getByRole('button', { name: 'Refusées' }));
    expect(screen.getByRole('tab', { name: 'Refusées 0' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Aucune demande refusée pour ces filtres.')).toBeInTheDocument();
    expect(screen.getByText('Sélectionnez une demande pour afficher son suivi.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approuver' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'À traiter 1' }));

    expect(screen.getByRole('heading', { name: /#95.*Moteur de commande/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approuver' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Refuser' })).toBeEnabled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('moves a newly refused request into Refusées after the authorized refusal RPC refresh', async () => {
    const user = userEvent.setup();
    const requests = [{ ...baseRequest, approval_reason: '' }];
    const { client, rpc } = createClient(requests);
    rpc.mockImplementationOnce(async () => {
      requests[0] = { ...baseRequest, approval_status: 'Demande refusée', approval_reason: 'Budget non validé' };
      return { data: requests[0], error: null };
    });
    render(<PurchaseRequestsPage client={client as never} roles={['direction']} />);
    await user.click(await screen.findByRole('button', { name: 'Refuser' }));
    await user.type(screen.getByLabelText('Justification du refus'), 'Budget non validé');
    await user.click(screen.getByRole('button', { name: 'Confirmer' }));

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('purchase_request_transition', {
      p_request_id: 95, p_action: 'refuse', p_comment: 'Budget non validé', p_effective_date: null,
    }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'À traiter 0' })).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: 'Refusées 1' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Refusées 1' }));
    expect(screen.getByRole('heading', { name: /#95.*Moteur de commande/ })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Demande 95' })).getByText('Budget non validé')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approuver' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refuser' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Prendre en charge' })).not.toBeInTheDocument();
  });

  it('excludes sold urgent requests from the alert badge and urgency filter', async () => {
    const user = userEvent.setup();
    const { client } = createClient([urgentRequest, completedUrgentRequest]);

    render(<PurchaseRequestsPage client={client as never} roles={['direction']} />);
    await screen.findByRole('heading', { name: /#86.*Ampoule feu de navigation/i });

    expect(screen.getByText('1 demandes ouvertes · 1 urgentes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Urgences (1)' }));
    expect(screen.getByRole('tab', { name: /Traitées 0/i })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Traitées 0/i }));
    expect(screen.queryByRole('heading', { name: /Ancienne commande urgente soldée/i })).not.toBeInTheDocument();
    expect(screen.getByText('0 demande')).toBeInTheDocument();
  });

  it('runs the take-charge transition through the secured workflow RPC', async () => {
    const user = userEvent.setup();
    const { client, rpc } = createClient([approvedRequest]);

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

  it('lets administrators approve or refuse pending requests without exposing logistics first', async () => {
    const user = userEvent.setup();
    const { client } = createClient([baseRequest]);

    render(<PurchaseRequestsPage client={client as never} roles={['admin']} />);

    expect(await screen.findByRole('heading', { name: /#95.*Moteur de commande/i })).toBeInTheDocument();
    expect(screen.getAllByText('En attente')).not.toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Approuver' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Refuser' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Prendre en charge' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actions de la demande' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Refuser' }));
    const confirmButton = screen.getByRole('button', { name: 'Confirmer' });
    expect(screen.getByLabelText('Justification du refus')).toBeRequired();
    expect(confirmButton).toBeDisabled();
    await user.type(screen.getByLabelText('Justification du refus'), 'Budget non validé');
    expect(confirmButton).toBeEnabled();
  });

  it.each(['admin', 'direction', 'armement', 'marin'] as const)('lets the %s profile approve a pending request', async (role) => {
    const user = userEvent.setup();
    const { client, rpc } = createClient([baseRequest]);

    render(<PurchaseRequestsPage client={client as never} roles={[role]} />);
    await user.click(await screen.findByRole('button', { name: 'Approuver' }));

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('purchase_request_transition', {
      p_request_id: 95,
      p_action: 'approve',
      p_comment: null,
      p_effective_date: null,
    }));
  });

  it.each(['capitaine'] as const)('does not expose approval decisions to the %s profile', async (role) => {
    const { client } = createClient([baseRequest]);

    render(<PurchaseRequestsPage client={client as never} roles={[role]} />);
    await screen.findByRole('heading', { name: /#95.*Moteur de commande/i });

    expect(screen.queryByRole('button', { name: 'Approuver' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refuser' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Prendre en charge' })).not.toBeInTheDocument();
  });

  it('lets a Marin approve and refresh the request before taking charge, without refusal or creation rights', async () => {
    const user = userEvent.setup();
    const requests = [{ ...baseRequest }];
    const { client, rpc } = createClient(requests);
    rpc.mockImplementationOnce(async () => {
      requests[0] = { ...baseRequest, approval_status: 'Demande acceptée' };
      return { data: requests[0], error: null };
    });

    render(<PurchaseRequestsPage client={client as never} roles={['marin']} />);
    const approve = await screen.findByRole('button', { name: 'Approuver' });
    expect(screen.queryByRole('button', { name: 'Refuser' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nouvelle demande' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Prendre en charge' })).not.toBeInTheDocument();

    await user.click(approve);

    expect(await screen.findByRole('button', { name: 'Prendre en charge' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Approuver' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refuser' })).not.toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...baseRequest, approval_status: 'Demande refusée' },
    approvedRequest,
    { ...approvedRequest, status: 'Traitée', received_on: '2026-09-24' },
  ])('does not let a Marin approve a request with decision $approval_status and status $status', async (request) => {
    const { client, rpc } = createClient([request]);
    render(<PurchaseRequestsPage client={client as never} roles={['marin']} />);

    await screen.findByRole('heading', { name: /#95.*Moteur de commande/i });
    expect(screen.queryByRole('button', { name: 'Approuver' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refuser' })).not.toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('lets a Marin run each contextual order-processing transition without granting request creation', async () => {
    const user = userEvent.setup();
    const orderedRequest = {
      ...approvedRequest,
      id: 101,
      request_number: '101',
      status: 'Commande en cours',
      ordered_on: '2026-08-01',
    };
    const receivingRequest = {
      ...approvedRequest,
      id: 102,
      request_number: '102',
      status: 'En attente de réception',
      ordered_on: '2026-08-02',
      expected_delivery_on: '2026-08-30',
    };
    const { client, rpc } = createClient([approvedRequest, orderedRequest, receivingRequest]);

    render(<PurchaseRequestsPage client={client as never} roles={['marin']} />);

    expect(await screen.findByRole('button', { name: 'Prendre en charge' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Nouvelle demande' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actions de la demande' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Prendre en charge' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('purchase_request_transition', {
      p_request_id: 95,
      p_action: 'take_charge',
      p_comment: null,
      p_effective_date: null,
    }));

    await user.click(screen.getByRole('button', { name: 'En commande (1)' }));
    expect(await screen.findByRole('button', { name: 'Planifier la livraison' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'À réception (1)' }));
    await user.click(await screen.findByRole('button', { name: 'Reçu à bord' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('purchase_request_transition', {
      p_request_id: 102,
      p_action: 'mark_received',
      p_comment: null,
      p_effective_date: null,
    }));
  });

  it('opens the first non-empty workflow tab on initial load', async () => {
    const orderedRequest = { ...approvedRequest, status: 'Commande en cours', ordered_on: '2026-08-01' };
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
    await user.click(screen.getByRole('button', { name: /3.*Prix/i }));
    expect(screen.getByLabelText('Refacturation')).toHaveTextContent('NAVIRE CANONIQUE');
  });

  it('lets a captain reach the need step before requiring the request title', async () => {
    const user = userEvent.setup();
    const { client } = createClient();
    render(<PurchaseRequestsPage client={client as never} roles={['capitaine']} />);

    await user.click(await screen.findByRole('button', { name: 'Nouvelle demande' }));
    expect(screen.getByRole('button', { name: 'Suivant' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Suivant' }));

    expect(screen.getByLabelText('Désignation *')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Suivant' })).toBeDisabled();
    await user.type(screen.getByLabelText('Désignation *'), 'Filtre hydraulique');
    await user.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(screen.getByLabelText('Prix unitaire HT')).toBeVisible();

    await user.click(screen.getByRole('button', { name: /6.*Pièces jointes/i }));
    expect(screen.getByRole('button', { name: 'Créer la demande' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /2.*Besoin/i }));
    await user.clear(screen.getByLabelText('Désignation *'));
    await user.click(screen.getByRole('button', { name: /6.*Pièces jointes/i }));
    expect(screen.getByRole('button', { name: 'Créer la demande' })).toBeDisabled();
  });
});
