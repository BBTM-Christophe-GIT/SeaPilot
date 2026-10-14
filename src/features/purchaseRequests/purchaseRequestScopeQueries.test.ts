import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPurchaseRequestAttachmentUrl, fetchAssignedPurchaseVesselIds, fetchPurchaseRequests, type PurchaseRequestAttachment } from './purchaseRequestQueries';

describe('purchase assignment read scope', () => {
  it('gets only the connected server scope without passing a person, company or reference date', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [274, '1', 274], error: null });
    await expect(fetchAssignedPurchaseVesselIds({ rpc } as unknown as SupabaseClient)).resolves.toEqual([274, 1]);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('assigned_vessel_read_scope');
  });

  it('keeps an empty assignment scope empty', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    await expect(fetchAssignedPurchaseVesselIds({ rpc } as unknown as SupabaseClient)).resolves.toEqual([]);
  });

  it.each([null, {}, ['boat'], [0], [-1], [1.5], [Number.MAX_SAFE_INTEGER + 1]])('rejects an invalid scope instead of falling back to company access: %j', async (data) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    await expect(fetchAssignedPurchaseVesselIds({ rpc } as unknown as SupabaseClient)).rejects.toThrow('Impossible de vérifier');
  });

  it('propagates a missing server function or permission error without an alternate lookup', async () => {
    const error = { code: 'PGRST202', message: 'Function missing' };
    const rpc = vi.fn().mockResolvedValue({ data: null, error });
    await expect(fetchAssignedPurchaseVesselIds({ rpc } as unknown as SupabaseClient)).rejects.toEqual(error);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('does not fetch any request, metadata or file when no vessel is admitted', async () => {
    const from = vi.fn();
    const storage = { from: vi.fn() };
    await expect(fetchPurchaseRequests({ from, storage } as unknown as SupabaseClient, [])).resolves.toEqual([]);
    expect(from).not.toHaveBeenCalled();
    expect(storage.from).not.toHaveBeenCalled();
  });

  it('filters requests and their parent attachment addresses before any private file access', async () => {
    const requests = [
      { id: 10, vessel_id: 1, title: 'Accessible', vessel_name: 'GOURY' },
      { id: 11, vessel_id: 99, title: 'Hors affectation', vessel_name: 'Autre navire' },
    ];
    const attachments = [
      { id: 100, purchase_request_id: 10, title: 'accessible.pdf', source_kind: 'seapilot', storage_bucket: 'purchase-request-attachments', storage_path: '10/accessible.pdf', created_at: '2026-10-14T08:00:00Z' },
      { id: 101, purchase_request_id: 11, title: 'private-other.pdf', source_kind: 'seapilot', storage_bucket: 'purchase-request-attachments', storage_path: '11/private-other.pdf', created_at: '2026-10-14T08:00:00Z' },
    ];
    const events = [{ id: 200, purchase_request_id: 10, event_type: 'created' }, { id: 201, purchase_request_id: 11, event_type: 'created' }];
    const queryFilters: Array<{ table: string; column: string; values: number[] }> = [];
    const from = vi.fn().mockImplementation((table: string) => {
      const data = table === 'purchase_requests' ? requests : table === 'purchase_request_attachments' ? attachments : events;
      const query = {
        select: () => query, order: () => query,
        in: (column: string, values: number[]) => { queryFilters.push({ table, column, values }); return query; },
        then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
      };
      return query;
    });
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://private.example.test/accessible.pdf' }, error: null });
    const client = { from, storage: { from: vi.fn().mockReturnValue({ createSignedUrl }) } } as unknown as SupabaseClient;
    const result = await fetchPurchaseRequests(client, [1]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 10, title: 'Accessible', attachments: [{ id: 100, storageBucket: 'purchase-request-attachments', storagePath: '10/accessible.pdf' }], events: [{ id: 200 }] });
    expect(queryFilters).toEqual([
      { table: 'purchase_requests', column: 'vessel_id', values: [1] },
      { table: 'purchase_request_attachments', column: 'purchase_request_id', values: [10] },
      { table: 'purchase_request_events', column: 'purchase_request_id', values: [10] },
    ]);
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(client.storage.from).not.toHaveBeenCalled();
    expect(await createPurchaseRequestAttachmentUrl(client, result[0].attachments[0])).toBe('https://private.example.test/accessible.pdf');
    expect(createSignedUrl).toHaveBeenCalledExactlyOnceWith('10/accessible.pdf', 120);
  });

  it('does not fall back to a retained URL when the current attachment access is refused', async () => {
    const error = new Error('Document inaccessible pour ce profil.');
    const createSignedUrl = vi.fn().mockResolvedValue({ data: null, error });
    const client = { storage: { from: vi.fn(() => ({ createSignedUrl })) } } as unknown as SupabaseClient;
    const attachment = { storageBucket: 'purchase-request-attachments', storagePath: '10/proof.pdf', downloadUrl: 'https://old.example/proof.pdf' } as PurchaseRequestAttachment;
    await expect(createPurchaseRequestAttachmentUrl(client, attachment)).rejects.toBe(error);
    expect(createSignedUrl).toHaveBeenCalledWith('10/proof.pdf', 120);
  });

  it('preserves an external SharePoint attachment when it has no private storage address', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: null }), storage: { from: vi.fn() } } as unknown as SupabaseClient;
    const attachment = { id: 18, storageBucket: '', storagePath: '', downloadUrl: 'https://bbtm668.sharepoint.com/proof.pdf' } as PurchaseRequestAttachment;
    expect(await createPurchaseRequestAttachmentUrl(client, attachment)).toBe(attachment.downloadUrl);
    expect(client.storage.from).not.toHaveBeenCalled();
  });
});
