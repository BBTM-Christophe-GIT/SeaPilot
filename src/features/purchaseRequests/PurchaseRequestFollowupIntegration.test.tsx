import { act, fireEvent, render as renderUi, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PurchaseRequestsPage } from './PurchaseRequestsPage';

const createdAt = '2026-10-05T09:05:00Z';
const latestCommentAt = '2026-10-08T14:45:00Z';
const request = {
  title: 'Patte d’oie dyneema',
  requestedOn: '2026-10-05',
  requesterName: 'Arthur MAREST',
  vesselId: 2,
  vesselName: 'LE ROZEL',
};

function render(ui: ReactNode) {
  return renderUi(<MemoryRouter initialEntries={['/purchase-requests']}>{ui}</MemoryRouter>);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

function pageClient(requestCount = 2) {
  const rows = Array.from({ length: requestCount }, (_, index) => index + 298).map((id) => ({
    id,
    request_number: String(id),
    title: id === 298 ? request.title : 'Autre demande',
    status: 'À traiter',
    requested_on: request.requestedOn,
    requester_name: request.requesterName,
    vessel_id: request.vesselId,
    vessel_name: request.vesselName,
    created_at: createdAt,
    updated_at: createdAt,
  }));
  const rpc = vi.fn().mockImplementation((_function: string, args: { p_request_id: number; p_comment: string }) => Promise.resolve({
    data: {
      id: 502,
      purchase_request_id: args.p_request_id,
      event_type: 'comment_added',
      status_label: 'À traiter',
      actor_name: 'Utilisateur authentifié',
      comment: args.p_comment,
      effective_on: null,
      created_at: latestCommentAt,
    },
    error: null,
  }));
  const client = {
    rpc,
    storage: { from: vi.fn() },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'purchase_requests') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: rows, error: null }) }),
          }),
        };
      }
      if (table === 'purchase_request_events' || table === 'purchase_request_attachments') {
        return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      }
      if (table === 'vessels') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [{ id: 2, name: 'LE ROZEL' }], error: null }) }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
  return { client, rpc };
}

describe('purchase follow-up profile integration', () => {
  it.each(['admin', 'direction', 'armement', 'capitaine', 'marin'] as const)('lets the %s profile save through the secured RPC', async (role) => {
    const user = userEvent.setup();
    const { client, rpc } = pageClient();
    render(<PurchaseRequestsPage client={client as never} roles={[role]} />);
    const draft = await screen.findByRole('textbox', { name: 'Commentaire de suivi' });
    fireEvent.change(draft, { target: { value: 'Suivi depuis le profil réel' } });
    await user.click(screen.getByRole('button', { name: 'Ajouter le commentaire' }));

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('purchase_request_add_comment', {
      p_request_id: 298,
      p_comment: 'Suivi depuis le profil réel',
    }));
  });

  it.each([
    { roles: [] },
    { roles: ['qhse'] },
    { roles: ['comptable'] },
  ])('does not expose the form to an account without a permitted role: $roles', async ({ roles }) => {
    const { client } = pageClient();
    render(<PurchaseRequestsPage client={client as never} roles={roles as never} />);

    expect(await screen.findByRole('heading', { name: 'Suivi de la demande' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Commentaire de suivi' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter le commentaire' })).not.toBeInTheDocument();
  });

  it('clears an unsaved draft when the selected request changes', async () => {
    const user = userEvent.setup();
    const { client } = pageClient();
    render(<PurchaseRequestsPage client={client as never} roles={['marin']} />);
    const draft = await screen.findByRole('textbox', { name: 'Commentaire de suivi' });
    fireEvent.change(draft, { target: { value: 'Brouillon pour la demande 298.' } });
    await user.click(screen.getByRole('button', { name: /299.*Autre demande/ }));

    expect(await screen.findByRole('textbox', { name: 'Commentaire de suivi' })).toHaveValue('');
    expect(screen.getByRole('heading', { name: /#299/ })).toBeInTheDocument();
  });

  it('shows the saved event immediately on the selected second request without resetting selection', async () => {
    const user = userEvent.setup();
    const { client, rpc } = pageClient();
    render(<PurchaseRequestsPage client={client as never} roles={['capitaine']} />);
    await screen.findByRole('heading', { name: /#298/ });
    await user.click(screen.getByRole('button', { name: /299.*Autre demande/ }));
    const draft = screen.getByRole('textbox', { name: 'Commentaire de suivi' });
    fireEvent.change(draft, { target: { value: 'La livraison est prévue vendredi.' } });
    await user.click(screen.getByRole('button', { name: 'Ajouter le commentaire' }));

    expect(await screen.findByText('La livraison est prévue vendredi.')).toBeInTheDocument();
    expect(screen.getByText('Utilisateur authentifié')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /#299/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /299.*Autre demande/ })).toHaveClass('is-selected');
    expect(draft).toHaveValue('');
    expect(rpc).toHaveBeenCalledWith('purchase_request_add_comment', {
      p_request_id: 299,
      p_comment: 'La livraison est prévue vendredi.',
    });
    expect(client.from.mock.calls.filter(([table]) => table === 'purchase_requests')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /298.*Patte d’oie/ }));
    expect(screen.queryByText('La livraison est prévue vendredi.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /299.*Autre demande/ }));
    expect(screen.getByText('La livraison est prévue vendredi.')).toBeInTheDocument();
  });

  it('keeps the selected request and workflow view on page two after saving a comment', async () => {
    const user = userEvent.setup();
    const { client, rpc } = pageClient(12);
    render(<PurchaseRequestsPage client={client as never} roles={['marin']} />);
    await screen.findByRole('heading', { name: /#298/ });
    await user.click(screen.getByRole('button', { name: 'Page suivante' }));
    await user.click(screen.getByRole('button', { name: /308.*Autre demande/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Commentaire de suivi' }), {
      target: { value: 'Suivi de la demande sur la deuxième page.' },
    });
    await user.click(screen.getByRole('button', { name: 'Ajouter le commentaire' }));

    expect(await screen.findByText('Suivi de la demande sur la deuxième page.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page précédente' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /308.*Autre demande/ })).toHaveClass('is-selected');
    expect(screen.getByRole('heading', { name: /#308/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /À traiter 12/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('11–12 sur 12')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('purchase_request_add_comment', {
      p_request_id: 308,
      p_comment: 'Suivi de la demande sur la deuxième page.',
    });
  });

  it('restores page actions after a failed save and preserves a successful retry when an older refresh resolves', async () => {
    const user = userEvent.setup();
    const { client, rpc } = pageClient();
    const comment = 'Commentaire conservé malgré une actualisation ancienne.';
    const savedResponse = await rpc.getMockImplementation()!('purchase_request_add_comment', { p_request_id: 298, p_comment: comment });
    const failedSave = deferred<never>();
    const successfulSave = deferred<typeof savedResponse>();
    const oldRefresh = deferred<{ data: unknown[]; error: null }>();
    rpc.mockImplementationOnce(() => failedSave.promise).mockImplementationOnce(() => successfulSave.promise);
    const initialFrom = client.from.getMockImplementation()!;
    const fetchEvents = vi.fn()
      .mockResolvedValueOnce({ data: [], error: null })
      .mockImplementationOnce(() => oldRefresh.promise);
    client.from.mockImplementation((table: string) => table === 'purchase_request_events'
      ? { select: vi.fn().mockReturnValue({ order: fetchEvents }) } : initialFrom(table));

    render(<PurchaseRequestsPage client={client as never} roles={['admin']} />);
    const draft = await screen.findByRole('textbox', { name: 'Commentaire de suivi' });
    const refresh = screen.getByRole('button', { name: 'Actualiser' });
    const approve = screen.getByRole('button', { name: 'Approuver' });
    fireEvent.change(draft, { target: { value: comment } });
    await user.click(screen.getByRole('button', { name: 'Ajouter le commentaire' }));
    expect(refresh).toBeDisabled();
    expect(approve).toBeDisabled();

    await act(async () => failedSave.reject(new Error('Échec temporaire du suivi.')));
    expect(await screen.findByText('Échec temporaire du suivi.')).toBeInTheDocument();
    expect(draft).toHaveValue(comment);
    expect(refresh).toBeEnabled();
    expect(approve).toBeEnabled();

    await user.click(refresh);
    expect(fetchEvents).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('button', { name: 'Ajouter le commentaire' }));
    expect(refresh).toBeDisabled();
    expect(approve).toBeDisabled();
    await act(async () => successfulSave.resolve(savedResponse));
    expect(await screen.findByText(comment)).toBeInTheDocument();
    expect(draft).toHaveValue('');
    expect(refresh).toBeEnabled();
    expect(approve).toBeEnabled();

    await act(async () => oldRefresh.resolve({ data: [], error: null }));
    expect(screen.getByText(comment)).toBeInTheDocument();
    expect(screen.getByText('Commentaire ajouté au suivi.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /#298/ })).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
