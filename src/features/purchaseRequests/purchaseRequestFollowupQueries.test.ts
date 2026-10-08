import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { addPurchaseRequestComment } from './purchaseRequestQueries';

const serverEvent = {
  id: 502,
  purchase_request_id: 298,
  event_type: 'comment_added',
  status_label: 'En commande',
  actor_name: 'Christophe MINASSIAN',
  comment: 'Le fournisseur confirme l’expédition.\nArrivée prévue vendredi.',
  effective_on: '2026-10-09',
  created_at: '2026-10-08T14:45:00Z',
};

function createClient(data: unknown = serverEvent, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe('addPurchaseRequestComment', () => {
  it.each([serverEvent, [serverEvent]])('uses the secured RPC and maps server-owned event fields', async (data) => {
    const { client, rpc } = createClient(data);
    const result = await addPurchaseRequestComment(client, 298, '  Le fournisseur confirme l’expédition.\nArrivée prévue vendredi.  ');

    expect(rpc).toHaveBeenCalledExactlyOnceWith('purchase_request_add_comment', {
      p_request_id: 298,
      p_comment: serverEvent.comment,
    });
    expect(result).toEqual({
      id: 502,
      eventType: 'comment_added',
      statusLabel: 'En commande',
      actorName: 'Christophe MINASSIAN',
      comment: serverEvent.comment,
      effectiveOn: '2026-10-09',
      createdAt: '2026-10-08T14:45:00Z',
    });
  });

  it('normalizes nullable event metadata without replacing the server timestamp', async () => {
    const { client } = createClient({ ...serverEvent, status_label: null, actor_name: null, comment: null, effective_on: null });

    await expect(addPurchaseRequestComment(client, 298, 'Suivi')).resolves.toEqual({
      id: 502,
      eventType: 'comment_added',
      statusLabel: '',
      actorName: '',
      comment: '',
      effectiveOn: '',
      createdAt: serverEvent.created_at,
    });
  });

  it.each(['', '   ', '\t\n\r\n '])('rejects an empty comment before invoking the RPC', async (comment) => {
    const { client, rpc } = createClient();

    await expect(addPurchaseRequestComment(client, 298, comment)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects comments longer than 4000 characters before invoking the RPC', async () => {
    const { client, rpc } = createClient();

    await expect(addPurchaseRequestComment(client, 298, 'a'.repeat(4001))).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('accepts a trimmed comment containing exactly 4000 characters', async () => {
    const { client, rpc } = createClient();
    const comment = 'a'.repeat(4000);

    await addPurchaseRequestComment(client, 298, `  ${comment}  `);

    expect(rpc).toHaveBeenCalledWith('purchase_request_add_comment', { p_request_id: 298, p_comment: comment });
  });

  it('passes a server permission error back to the caller without producing a local event', async () => {
    const error = { code: '42501', message: 'Accès refusé à cette demande.' };
    const { client, rpc } = createClient(null, error);

    await expect(addPurchaseRequestComment(client, 298, 'Suivi')).rejects.toBe(error);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([null, []])('does not report a saved comment when the server returns no event: %j', async (data) => {
    const { client } = createClient(data);

    await expect(addPurchaseRequestComment(client, 298, 'Suivi')).rejects.toThrow('Impossible d’enregistrer le commentaire.');
  });
});
