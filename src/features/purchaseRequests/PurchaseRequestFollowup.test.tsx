import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PurchaseRequestFollowup } from './PurchaseRequestFollowup';
import type { PurchaseRequestEvent, PurchaseRequestRecord } from './purchaseRequestQueries';

const createdAt = '2026-10-05T09:05:00Z';
const firstCommentAt = '2026-10-08T12:30:00Z';
const latestCommentAt = '2026-10-08T14:45:00Z';

const request: PurchaseRequestRecord = {
  id: 298,
  requestNumber: '298',
  title: 'Patte d’oie dyneema',
  requestedOn: '2026-10-05',
  requesterName: 'Arthur MAREST',
  supplierName: 'Marlev',
  projectId: null,
  projectSharePointItemId: '',
  projectCode: '',
  projectTitle: '',
  vesselId: 2,
  vesselSharePointItemId: '2',
  vesselName: 'LE ROZEL',
  reference: 'Élingue cordage Dynalight',
  quantity: 2,
  unitLabel: 'Unité',
  unitPriceHt: 0,
  amountHt: 0,
  currency: 'EUR',
  status: 'À traiter',
  stage: 'to_process',
  description: 'Prévoir une patte d’oie de rechange.',
  urgent: false,
  urgencyReason: '',
  ownerName: 'Christophe MINASSIAN',
  orderedOn: '',
  expectedDeliveryOn: '',
  receivedOn: '',
  deliveryLocation: 'A bord',
  deliveryDetails: '',
  rebillingLabel: '',
  categoryLabel: 'Fourniture',
  processingComment: '',
  approvalStatus: 'En attente',
  approvalReason: '',
  approverName: '',
  approvalHistory: '',
  websiteUrl: '',
  sourceLabel: 'SeaPilot',
  sharePointUrl: '',
  createdAt,
  updatedAt: createdAt,
  attachments: [],
  events: [],
};

function event(overrides: Partial<PurchaseRequestEvent> = {}): PurchaseRequestEvent {
  return {
    id: 501,
    eventType: 'comment_added',
    statusLabel: 'En commande',
    actorName: 'Christophe MINASSIAN',
    comment: 'Le fournisseur confirme une expédition demain.',
    effectiveOn: '',
    createdAt: latestCommentAt,
    ...overrides,
  };
}

describe('PurchaseRequestFollowup', () => {
  it('shows every event newest first with its author, complete multiline comment and Paris timestamp', () => {
    const comment = 'Première ligne\nDeuxième ligne <img src=x onerror=alert(1)>';
    const events = [
      event({ id: 499, eventType: 'created', actorName: request.requesterName, comment: 'Demande créée à bord.', createdAt }),
      event({ id: 500, actorName: 'Julien LECOCQ', comment: 'Premier contact fournisseur.', createdAt: firstCommentAt }),
      event({ comment }),
    ];
    const { container } = render(<PurchaseRequestFollowup request={{ ...request, events }} canComment onAddComment={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Suivi de la demande' })).toBeInTheDocument();
    expect(screen.getByText('Christophe MINASSIAN')).toBeInTheDocument();
    expect(screen.getByText('Julien LECOCQ')).toBeInTheDocument();
    expect(screen.getByText('Arthur MAREST')).toBeInTheDocument();
    expect(screen.getAllByText('Commentaire')).toHaveLength(2);
    expect(screen.getByText((_, node) => node?.textContent === comment)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    const times = Array.from(container.querySelectorAll('time'));
    expect(times.map((time) => time.getAttribute('datetime'))).toEqual([latestCommentAt, firstCommentAt, createdAt]);
    expect(times[0]).toHaveTextContent('08/10/2026');
    expect(times[0]).toHaveTextContent('16:45');
    expect(times[2]).toHaveTextContent('05/10/2026');
    expect(times[2]).toHaveTextContent('11:05');
  });

  it('includes the request creation when no persisted events exist', () => {
    const { container } = render(<PurchaseRequestFollowup request={request} canComment={false} onAddComment={vi.fn()} />);

    expect(screen.getByText('Arthur MAREST')).toBeInTheDocument();
    expect(container.querySelector('time')).toHaveAttribute('datetime', createdAt);
    expect(container.querySelector('time')).toHaveTextContent('11:05');
  });

  it('orders timestamps by the actual instant when server events use different UTC offsets', () => {
    const events = [
      event({ id: 500, comment: 'Événement ancien.', createdAt: '2026-10-08T15:00:00+02:00' }),
      event({ id: 501, comment: 'Événement récent.', createdAt: '2026-10-08T14:00:00Z' }),
    ];
    const { container } = render(<PurchaseRequestFollowup request={{ ...request, events }} canComment={false} onAddComment={vi.fn()} />);

    expect(Array.from(container.querySelectorAll('time')).map((time) => time.getAttribute('datetime'))).toEqual([
      '2026-10-08T14:00:00Z', '2026-10-08T15:00:00+02:00', createdAt,
    ]);
  });

  it('retains imported approval history when the first new follow-up comment is added', () => {
    const importedRequest = {
      ...request,
      approvalHistory: 'Acceptée par l’armement le 06/10/2026.',
      approverName: 'Responsable Armement historique',
      approvalReason: 'Besoin validé.',
    };
    const { rerender } = render(<PurchaseRequestFollowup request={importedRequest} canComment={false} onAddComment={vi.fn()} />);
    expect(screen.getByText(/Acceptée par l’armement le 06\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/Responsable Armement historique/)).toBeInTheDocument();

    rerender(<PurchaseRequestFollowup request={{ ...importedRequest, events: [event()] }} canComment={false} onAddComment={vi.fn()} />);

    expect(screen.getByText(/Acceptée par l’armement le 06\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/Responsable Armement historique/)).toBeInTheDocument();
    expect(screen.getByText(/Besoin validé/)).toBeInTheDocument();
    expect(screen.getByText('Le fournisseur confirme une expédition demain.')).toBeInTheDocument();
  });

  it('limits the draft to 4000 characters and rejects empty or whitespace-only submissions', () => {
    const onAddComment = vi.fn();
    render(<PurchaseRequestFollowup request={request} canComment onAddComment={onAddComment} />);
    const draft = screen.getByRole('textbox', { name: 'Commentaire de suivi' });
    const submit = screen.getByRole('button', { name: 'Ajouter le commentaire' });

    expect(draft).toHaveAttribute('maxlength', '4000');
    expect(submit).toBeDisabled();
    fireEvent.change(draft, { target: { value: ' \n\t ' } });
    expect(submit).toBeDisabled();
    fireEvent.submit(draft.closest('form')!);
    expect(onAddComment).not.toHaveBeenCalled();
  });

  it('trims the submitted comment, preserves internal newlines and clears the draft only after success', async () => {
    const user = userEvent.setup();
    const onAddComment = vi.fn().mockResolvedValue(undefined);
    render(<PurchaseRequestFollowup request={request} canComment onAddComment={onAddComment} />);
    const draft = screen.getByRole('textbox', { name: 'Commentaire de suivi' });

    fireEvent.change(draft, { target: { value: '  Fournisseur relancé.\nLivraison prévue vendredi.  ' } });
    await user.click(screen.getByRole('button', { name: 'Ajouter le commentaire' }));

    expect(onAddComment).toHaveBeenCalledExactlyOnceWith('Fournisseur relancé.\nLivraison prévue vendredi.');
    expect(await screen.findByText('Commentaire ajouté au suivi.')).toBeInTheDocument();
    expect(draft).toHaveValue('');
  });

  it('disables editing during a save and prevents a second submission before the first resolves', async () => {
    let finishSave!: () => void;
    const onAddComment = vi.fn(() => new Promise<void>((resolve) => { finishSave = resolve; }));
    const user = userEvent.setup();
    render(<PurchaseRequestFollowup request={request} canComment onAddComment={onAddComment} />);
    const draft = screen.getByRole('textbox', { name: 'Commentaire de suivi' });
    fireEvent.change(draft, { target: { value: 'Commande confirmée.' } });
    await user.click(screen.getByRole('button', { name: 'Ajouter le commentaire' }));

    expect(draft).toBeDisabled();
    expect(screen.getByRole('button')).toBeDisabled();
    fireEvent.submit(draft.closest('form')!);
    expect(onAddComment).toHaveBeenCalledTimes(1);
    expect(draft).toHaveValue('Commande confirmée.');

    await act(async () => finishSave());
    expect(await screen.findByText('Commentaire ajouté au suivi.')).toBeInTheDocument();
    expect(draft).toBeEnabled();
    expect(draft).toHaveValue('');
  });

  it.each([
    { error: new Error('Droits insuffisants.'), message: 'Droits insuffisants.' },
    { error: null, message: 'Impossible d’enregistrer le commentaire.' },
  ])('keeps the draft and displays the save error: $message', async ({ error, message }) => {
    const user = userEvent.setup();
    const onAddComment = vi.fn().mockRejectedValue(error);
    render(<PurchaseRequestFollowup request={request} canComment onAddComment={onAddComment} />);
    const draft = screen.getByRole('textbox', { name: 'Commentaire de suivi' });
    fireEvent.change(draft, { target: { value: 'Rappeler le fournisseur.' } });
    await user.click(screen.getByRole('button', { name: 'Ajouter le commentaire' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(draft).toHaveValue('Rappeler le fournisseur.');
    expect(draft).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Ajouter le commentaire' })).toBeEnabled();
  });

  it('blocks comment submission while another request action is pending', () => {
    const onAddComment = vi.fn();
    const { rerender } = render(<PurchaseRequestFollowup request={request} canComment onAddComment={onAddComment} />);
    const draft = screen.getByRole('textbox', { name: 'Commentaire de suivi' });
    fireEvent.change(draft, { target: { value: 'Suivi de livraison.' } });
    rerender(<PurchaseRequestFollowup request={request} canComment isBusy onAddComment={onAddComment} />);

    expect(draft).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ajouter le commentaire' })).toBeDisabled();
    fireEvent.submit(draft.closest('form')!);
    expect(onAddComment).not.toHaveBeenCalled();
    expect(draft).toHaveValue('Suivi de livraison.');
  });

  it('keeps history visible in read-only mode without exposing the comment form', () => {
    render(<PurchaseRequestFollowup request={{ ...request, events: [event()] }} canComment={false} onAddComment={vi.fn()} />);

    expect(screen.getByText('Le fournisseur confirme une expédition demain.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Commentaire de suivi' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter le commentaire' })).not.toBeInTheDocument();
  });
});
