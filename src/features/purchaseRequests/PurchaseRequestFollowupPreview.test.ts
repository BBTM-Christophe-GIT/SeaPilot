import { afterEach, describe, expect, it, vi } from 'vitest';
import { previewSupabaseClient } from '../preview/previewSupabaseClient';
import { addPurchaseRequestComment, fetchPurchaseRequests } from './purchaseRequestQueries';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('purchase follow-up preview fixture', () => {
  it('keeps new comments in the local preview history without changing purchase workflow data', async () => {
    const now = '2026-10-08T14:45:00.000Z';
    vi.useFakeTimers({ now: new Date(now) });
    const before = await fetchPurchaseRequests(previewSupabaseClient);
    const target = before.find((request) => request.id === 9951)!;
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    const comment = 'Fournisseur relancé.\nExpédition prévue demain.';

    const saved = await addPurchaseRequestComment(previewSupabaseClient, target.id, `  ${comment}  `);
    const after = await fetchPurchaseRequests(previewSupabaseClient);
    const savedRequest = after.find((request) => request.id === target.id)!;

    expect(saved).toMatchObject({
      eventType: 'comment_added',
      statusLabel: 'Commentaire de suivi',
      actorName: 'Administrateur Démonstration',
      comment,
      effectiveOn: '',
      createdAt: now,
    });
    expect(savedRequest.events).toEqual([...target.events, saved]);
    expect({ ...savedRequest, events: target.events }).toEqual(target);
    expect(after.filter((request) => request.id !== target.id)).toEqual(before.filter((request) => request.id !== target.id));
    expect(storageWrite).not.toHaveBeenCalled();
  });

  it('assigns distinct event IDs to repeated comments while retaining both full texts', async () => {
    const first = await addPurchaseRequestComment(previewSupabaseClient, 9952, 'Première relance.');
    const second = await addPurchaseRequestComment(previewSupabaseClient, 9952, 'Deuxième relance.');
    const requests = await fetchPurchaseRequests(previewSupabaseClient);

    expect(second.id).toBeGreaterThan(first.id);
    expect(requests.find((request) => request.id === 9952)?.events).toEqual(expect.arrayContaining([first, second]));
  });

  it.each([
    { requestId: 9951, comment: '', code: '22023', message: 'Le commentaire est obligatoire.' },
    { requestId: 9951, comment: ' \n\t ', code: '22023', message: 'Le commentaire est obligatoire.' },
    { requestId: 9951, comment: 'a'.repeat(4001), code: '22023', message: 'Le commentaire ne peut pas dépasser 4 000 caractères.' },
    { requestId: 999999, comment: 'Suivi', code: 'P0002', message: 'Demande introuvable ou inaccessible.' },
  ])('rejects an invalid direct RPC call without adding an event: $code / $requestId', async ({ requestId, comment, code, message }) => {
    const before = await previewSupabaseClient.from('purchase_request_events').select('*');
    const eventCount = before.data?.length;

    const result = await previewSupabaseClient.rpc('purchase_request_add_comment', {
      p_request_id: requestId,
      p_comment: comment,
    });

    expect(result).toMatchObject({ data: null, error: { code, message } });
    const after = await previewSupabaseClient.from('purchase_request_events').select('*');
    expect(after.data).toHaveLength(eventCount!);
  });
});
