// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createPlanningDocumentSignatureGateway, loadPlanningDocumentSignature } from './planning-document-signature';
import { planningPreviewSignature } from '../src/features/planning/planningDocumentSignature';

describe('private planning document signature gateway', () => {
  it('rejects anonymous, cross-origin and arbitrary-path requests before downloading', async () => {
    const download = vi.fn();
    const handler = createPlanningDocumentSignatureGateway(download);
    expect((await handler(new Request('https://sea.test/api/planning-document-signature'))).status).toBe(401);
    expect((await handler(new Request('https://sea.test/api/planning-document-signature?personId=7', { headers: { Authorization: 'Bearer jwt' } }))).status).toBe(403);
    expect((await handler(new Request('https://sea.test/api/planning-document-signature', { headers: { Authorization: 'Bearer jwt', Origin: 'https://other.test' } }))).status).toBe(403);
    expect((await handler(new Request('https://sea.test/api/planning-document-signature', { method: 'POST' }))).status).toBe(405);
    expect(download).not.toHaveBeenCalled();
  });

  it('returns authorized PNG bytes without public caching or a storage path', async () => {
    const png = planningPreviewSignature();
    const download = vi.fn().mockResolvedValue(new Blob([png.buffer as ArrayBuffer], { type: 'image/png' }));
    const response = await createPlanningDocumentSignatureGateway(download)(new Request('https://sea.test/api/planning-document-signature', { headers: { Authorization: 'Bearer valid-jwt' } }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
    expect(download).toHaveBeenCalledWith('valid-jwt');
  });

  it('checks verified identity and company role before using privileged storage', async () => {
    const privileged = vi.fn();
    const actor = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) }, rpc: vi.fn() };
    await expect(loadPlanningDocumentSignature(actor as never, privileged)).rejects.toMatchObject({ status: 401 });
    actor.auth.getUser.mockResolvedValue({ data: { user: { id: 'verified-user' } }, error: null } as never);
    actor.rpc.mockResolvedValueOnce({ data: 42, error: null }).mockResolvedValueOnce({ data: false, error: null });
    await expect(loadPlanningDocumentSignature(actor as never, privileged)).rejects.toMatchObject({ status: 403 });
    expect(actor.rpc).toHaveBeenLastCalledWith('has_company_role', { target_company_id: 42,
      required_roles: ['admin', 'direction', 'armement', 'capitaine', 'marin'] });
    expect(privileged).not.toHaveBeenCalled();
  });

  it('uses the authenticated company, exact fixed signer and latest active signature', async () => {
    const calls: unknown[][] = [];
    const people = [{ id: 19 }];
    const signature = { storage_bucket: 'working-time-signatures', storage_path: 'private-test.png', mime_type: 'image/png', file_size_bytes: 68 };
    const chain = (data: unknown) => new Proxy({}, { get(_target, key) {
      if (key === 'then') return (resolve: (v: unknown) => void) => resolve({ data, error: null });
      return (...args: unknown[]) => { calls.push([key, ...args]); return chain(data); };
    } });
    const actor = { auth: { getUser: async () => ({ data: { user: { id: 'verified-user' } } }) },
      rpc: vi.fn().mockResolvedValueOnce({ data: 42 }).mockResolvedValueOnce({ data: true }) };
    const png = new Blob([planningPreviewSignature().buffer as ArrayBuffer], { type: 'image/png' });
    const download = vi.fn().mockResolvedValue({ data: png });
    const privileged = { from: (table: string) => chain(table === 'people' ? people : table === 'working_time_profile_signatures' ? signature : null),
      storage: { from: vi.fn().mockReturnValue({ download }) } };
    expect(await loadPlanningDocumentSignature(actor as never, () => privileged as never)).toBe(png);
    expect(calls.filter(c => c[0] === 'eq' && c[1] === 'company_id')).toEqual([['eq', 'company_id', 42], ['eq', 'company_id', 42]]);
    expect(calls).toContainEqual(['ilike', 'first_name', 'Benjamin']);
    expect(calls).toContainEqual(['eq', 'person_id', 19]);
    expect(calls).toContainEqual(['is', 'valid_to', null]);
    expect(calls).toContainEqual(['order', 'version_number', { ascending: false }]);
    expect(privileged.storage.from).toHaveBeenCalledWith('working-time-signatures');
    expect(download).toHaveBeenCalledWith('private-test.png');
  });

  it.each(['admin', 'direction', 'armement', 'capitaine', 'marin'])('reads a private migrated signature for authorized %s without widening the fixed signer scope', async role => {
    const calls: unknown[][] = [];
    const bytes = planningPreviewSignature();
    const hash = createHash('sha256').update(bytes).digest('hex');
    const signature = { storage_bucket: 'working-time-signatures', storage_path: '42/19/synthetic-current.png',
      mime_type: 'image/png', file_size_bytes: bytes.length, sha256: hash };
    const mapping = { source_bucket: signature.storage_bucket, source_path: signature.storage_path,
      blob_pathname: 'documents/synthetic/signature.png', mime_type: 'image/png', bytes: bytes.length, sha256: hash };
    const chain = (table: string) => new Proxy({}, { get(_target, key) {
      if (key === 'then') return (resolve: (value: unknown) => void) => resolve({ data: table === 'people' ? [{ id: 19 }] : table === 'document_blob_files' ? mapping : signature, error: null });
      return (...args: unknown[]) => { calls.push([table, key, ...args]); return chain(table); };
    } });
    const actor = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: `synthetic-${role}` } }, error: null }) },
      rpc: vi.fn().mockResolvedValueOnce({ data: 42 }).mockResolvedValueOnce({ data: true }) };
    const legacyDownload = vi.fn();
    const privileged = { from: chain, storage: { from: vi.fn(() => ({ download: legacyDownload })) } };
    const readBlob = vi.fn().mockResolvedValue({ statusCode: 200, stream: new Blob([bytes.buffer as ArrayBuffer]).stream(),
      blob: { pathname: mapping.blob_pathname, contentType: 'image/png', size: bytes.length } });
    const image = await loadPlanningDocumentSignature(actor as never, () => privileged as never, `jwt-${role}`, readBlob as never);
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(bytes);
    expect(actor.auth.getUser).toHaveBeenCalledWith(`jwt-${role}`);
    expect(calls).toContainEqual(['people', 'eq', 'company_id', 42]);
    expect(calls).toContainEqual(['working_time_profile_signatures', 'eq', 'person_id', 19]);
    expect(calls).toContainEqual(['document_blob_files', 'eq', 'source_bucket', 'working-time-signatures']);
    expect(calls).toContainEqual(['document_blob_files', 'eq', 'source_path', signature.storage_path]);
    expect(readBlob).toHaveBeenCalledWith(mapping.blob_pathname, expect.objectContaining({ access: 'private', useCache: false }));
    expect(legacyDownload).not.toHaveBeenCalled();
  });

  it('fails closed on a mismatched migrated reference instead of using a public or stale legacy fallback', async () => {
    const bytes = planningPreviewSignature();
    const signature = { storage_bucket: 'working-time-signatures', storage_path: '42/19/current.png',
      mime_type: 'image/png', file_size_bytes: bytes.length, sha256: 'a'.repeat(64) };
    const mapping = { source_bucket: signature.storage_bucket, source_path: 'another-person/signature.png',
      blob_pathname: 'documents/synthetic/another.png', mime_type: 'image/png', bytes: bytes.length, sha256: signature.sha256 };
    const chain = (table: string) => new Proxy({}, { get(_target, key) {
      if (key === 'then') return (resolve: (value: unknown) => void) => resolve({ data: table === 'people' ? [{ id: 19 }] : table === 'document_blob_files' ? mapping : signature, error: null });
      return () => chain(table);
    } });
    const actor = { auth: { getUser: async () => ({ data: { user: { id: 'synthetic-user' } } }) },
      rpc: vi.fn().mockResolvedValueOnce({ data: 42 }).mockResolvedValueOnce({ data: true }) };
    const legacyDownload = vi.fn(), readBlob = vi.fn();
    await expect(loadPlanningDocumentSignature(actor as never, () => ({ from: chain,
      storage: { from: () => ({ download: legacyDownload }) } }) as never, 'jwt', readBlob as never)).rejects.toMatchObject({ status: 502 });
    expect(readBlob).not.toHaveBeenCalled();
    expect(legacyDownload).not.toHaveBeenCalled();
  });

  it('rejects changed private Blob bytes even when provider metadata claims the expected signature', async () => {
    const expected = planningPreviewSignature();
    const hash = createHash('sha256').update(expected).digest('hex');
    const signature = { storage_bucket: 'working-time-signatures', storage_path: '42/19/current.png',
      mime_type: 'image/png', file_size_bytes: expected.length, sha256: hash };
    const mapping = { source_bucket: signature.storage_bucket, source_path: signature.storage_path,
      blob_pathname: 'documents/synthetic/signature.png', mime_type: 'image/png', bytes: expected.length, sha256: hash };
    const chain = (table: string) => new Proxy({}, { get(_target, key) {
      if (key === 'then') return (resolve: (value: unknown) => void) => resolve({ data: table === 'people' ? [{ id: 19 }] : table === 'document_blob_files' ? mapping : signature, error: null });
      return () => chain(table);
    } });
    const actor = { auth: { getUser: async () => ({ data: { user: { id: 'synthetic-user' } } }) },
      rpc: vi.fn().mockResolvedValueOnce({ data: 42 }).mockResolvedValueOnce({ data: true }) };
    const altered = new Uint8Array(expected.length);
    const readBlob = vi.fn().mockResolvedValue({ statusCode: 200, stream: new Blob([altered.buffer]).stream(),
      blob: { pathname: mapping.blob_pathname, contentType: 'image/png', size: expected.length } });
    await expect(loadPlanningDocumentSignature(actor as never, () => ({ from: chain }) as never, 'jwt', readBlob as never))
      .rejects.toMatchObject({ status: 502 });
  });
});
