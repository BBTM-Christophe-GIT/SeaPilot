// @vitest-environment node
import { createHash } from 'node:crypto';
import type { GetBlobResult, HeadBlobResult } from '@vercel/blob';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api, { createDocumentBlobGateway } from '../../api/documents';

const providers = vi.hoisted(() => ({
  createClient: vi.fn(),
  get: vi.fn(),
  head: vi.fn(),
  issueSignedToken: vi.fn(),
  presignUrl: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: providers.createClient }));
vi.mock('@vercel/blob', async (importOriginal) => ({
  ...await importOriginal<typeof import('@vercel/blob')>(),
  get: providers.get,
  head: providers.head,
  issueSignedToken: providers.issueSignedToken,
  presignUrl: providers.presignUrl,
}));

type Dependencies = Parameters<typeof createDocumentBlobGateway>[0];
type Backend = ReturnType<Dependencies['backend']>;
const USER = '92100000-0000-0000-0000-000000000001';
const OTHER_USER = '92100000-0000-0000-0000-000000000002';
const UPLOAD = '92200000-0000-0000-0000-000000000001';
const NOW = Date.parse('2026-10-14T12:00:00Z');
const PATHNAME = 'documents/uploads/' + UPLOAD;
const CONTENT = new TextEncoder().encode('%PDF-fixture-document');
const HASH = createHash('sha256').update(CONTENT).digest('hex');
const KEY = { bucket: 'fleet-certificates', path: '1/fixture/document.pdf' };
const DOCUMENT = {
  blob_pathname: 'documents/imports/fixture.pdf',
  bytes: CONTENT.byteLength,
  sha256: HASH,
  mime_type: 'application/pdf',
  file_name: 'document.pdf',
};
const SCOPE = {
  upload_id: UPLOAD, uploader_id: USER, expires_at: new Date(NOW + 30 * 60_000).toISOString(),
  source_bucket: KEY.bucket, source_path: KEY.path,
  bytes: CONTENT.byteLength, sha256: HASH, mime_type: 'application/pdf', file_name: 'document.pdf',
};
const TOKEN = { delegationToken: 'fixture-object-delegation', clientSigningToken: 'fixture-signing-material', validUntil: NOW + 15 * 60_000 };
const SIGNED_URL = 'https://fixture.private.blob.vercel-storage.com/documents/fixture.pdf?signature=fixture';

function downloaded(content = CONTENT): Extract<GetBlobResult, { statusCode: 200 }> {
  return {
    statusCode: 200,
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(content.slice(0, 5));
        controller.enqueue(content.slice(5));
        controller.close();
      },
    }),
    headers: new Headers(),
    blob: {
      pathname: PATHNAME, url: 'https://fixture.private.blob.vercel-storage.com/' + PATHNAME,
      downloadUrl: 'https://fixture.private.blob.vercel-storage.com/' + PATHNAME + '?download=1',
      contentType: 'application/pdf', size: CONTENT.byteLength, etag: '"fixture-etag"',
      contentDisposition: 'inline; filename="document.pdf"', cacheControl: 'private, max-age=60',
      uploadedAt: new Date(NOW),
    },
  };
}
function metadata(): HeadBlobResult { return { ...downloaded().blob }; }
function setup() {
  const user = vi.fn<Backend['user']>().mockResolvedValue(USER);
  const rpc = vi.fn<Backend['rpc']>().mockImplementation(async (name) => {
    if (name === 'document_blob_lookup') return DOCUMENT;
    if (name === 'document_blob_upload_scope' || name === 'document_blob_upload_revalidate') return SCOPE;
    throw new Error('Unexpected fixture RPC: ' + name);
  });
  const deps: Dependencies = {
    getEnv: vi.fn((name: string) => name === 'BLOB_STORE_ID' ? 'fixture-store-id' : undefined),
    backend: vi.fn(() => ({ user, rpc })),
    register: vi.fn<Dependencies['register']>().mockResolvedValue(DOCUMENT),
    sign: vi.fn<Dependencies['sign']>().mockResolvedValue(TOKEN),
    presign: vi.fn<Dependencies['presign']>().mockResolvedValue({ presignedUrl: SIGNED_URL }),
    read: vi.fn<Dependencies['read']>().mockImplementation(async () => downloaded()),
    metadata: vi.fn<Dependencies['metadata']>().mockResolvedValue(metadata()),
    now: () => NOW,
  };
  return { handler: createDocumentBlobGateway(deps), deps, user, rpc };
}
function request(body: unknown, options: { authorization?: string | null; origin?: string; fetchSite?: string; method?: string; contentType?: string } = {}) {
  const headers = new Headers({ 'content-type': options.contentType ?? 'application/json' });
  if (options.authorization !== null) headers.set('authorization', options.authorization ?? 'Bearer fixture.valid.jwt');
  if (options.origin) headers.set('origin', options.origin);
  if (options.fetchSite) headers.set('sec-fetch-site', options.fetchSite);
  const method = options.method ?? 'POST';
  return new Request('https://app.example.invalid/api/documents', { method, headers, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
}
const prepare = { operation: 'prepare', ...KEY, fileName: 'document.pdf', mimeType: 'application/pdf', bytes: CONTENT.byteLength, sha256: HASH };
const complete = { operation: 'complete', uploadId: UPLOAD };

describe('private document Blob gateway', () => {
  it.each([null, 'Basic fixture', 'Bearer invalid token'])('rejects absent or malformed authorization (%s)', async (authorization) => {
    const { handler, deps } = setup();
    const result = await handler(request({ operation: 'url', ...KEY }, { authorization }));
    expect(result.status).toBe(401);
    expect(await result.json()).toEqual({ error: 'DOCUMENT_AUTHENTICATION_REQUIRED' });
    expect(deps.backend).not.toHaveBeenCalled();
    expect(deps.sign).not.toHaveBeenCalled();
  });

  it.each([null, 'not-a-user-uuid'])('rejects an invalid JWT identity (%s)', async (identity) => {
    const { handler, deps, user, rpc } = setup();
    user.mockResolvedValue(identity);
    const result = await handler(request({ operation: 'url', ...KEY }));
    expect(result.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    expect(deps.sign).not.toHaveBeenCalled();
  });

  it.each([{ origin: 'https://attacker.example.invalid' }, { fetchSite: 'cross-site' }])('rejects cross-origin requests before authentication (%j)', async (headers) => {
    const { handler, deps } = setup();
    const result = await handler(request({ operation: 'url', ...KEY }, headers));
    expect(result.status).toBe(403);
    expect(await result.json()).toEqual({ error: 'DOCUMENT_ORIGIN_DENIED' });
    expect(deps.backend).not.toHaveBeenCalled();
  });

  it('permits same-origin JSON only and requires POST', async () => {
    const { handler, deps } = setup();
    const method = await handler(request(null, { method: 'GET' }));
    expect(method.status).toBe(405);
    expect(method.headers.get('allow')).toBe('POST');
    const contentType = await handler(request({ operation: 'url', ...KEY }, { contentType: 'text/plain' }));
    expect(contentType.status).toBe(400);
    expect(deps.backend).not.toHaveBeenCalled();
    const result = await handler(request({ operation: 'url', ...KEY }, { origin: 'https://app.example.invalid' }));
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('private, no-store');
    expect(result.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it.each(['/absolute.pdf', '../document.pdf', '1/../document.pdf', '1/./document.pdf', '1\\document.pdf', '1/\u0000document.pdf'])('rejects unsafe source path %j', async (path) => {
    const { handler, rpc, deps } = setup();
    const result = await handler(request({ operation: 'url', bucket: KEY.bucket, path }));
    expect(result.status).toBe(400);
    expect(await result.json()).toEqual({ error: 'INVALID_DOCUMENT_LOCATION' });
    expect(rpc).not.toHaveBeenCalled();
    expect(deps.sign).not.toHaveBeenCalled();
  });

  it('signs only the authorized mapped private object with a bounded expiry', async () => {
    const { handler, rpc, deps } = setup();
    const result = await handler(request({ operation: 'url', ...KEY, expiresIn: 90.8 }));
    expect(result.status).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('document_blob_lookup', { target_bucket: KEY.bucket, target_path: KEY.path });
    expect(deps.sign).toHaveBeenCalledExactlyOnceWith({ pathname: DOCUMENT.blob_pathname, operations: ['get'], validUntil: NOW + 90_000 });
    expect(deps.presign).toHaveBeenCalledExactlyOnceWith(TOKEN, { operation: 'get', pathname: DOCUMENT.blob_pathname, access: 'private', validUntil: NOW + 90_000 });
    expect(await result.json()).toEqual({ signedUrl: SIGNED_URL, document: DOCUMENT, expiresAt: NOW + 90_000 });
    expect(deps.read).not.toHaveBeenCalled();
  });

  it('reports an unmapped object without reading a legacy store', async () => {
    const { handler, rpc, deps } = setup();
    rpc.mockResolvedValue(null);
    const result = await handler(request({ operation: 'url', ...KEY }));
    expect(result.status).toBe(404);
    expect(await result.json()).toEqual({ error: 'DOCUMENT_NOT_FOUND' });
    expect(deps.sign).not.toHaveBeenCalled();
    expect(deps.read).not.toHaveBeenCalled();
  });

  it('keeps batch denial distinct from an unmapped object and signs only allowed entries', async () => {
    const { handler, rpc, deps } = setup();
    const paths = ['1/denied.pdf', '1/unmapped.pdf', KEY.path];
    rpc.mockResolvedValue([
      { path: paths[0], error: 'DOCUMENT_ACCESS_DENIED', document: null },
      { path: paths[1], error: null, document: null },
      { path: paths[2], error: null, document: DOCUMENT },
    ]);
    const result = await handler(request({ operation: 'urls', bucket: KEY.bucket, paths, expiresIn: 300 }));
    expect(result.status).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('document_blob_lookup_batch', { target_bucket: KEY.bucket, target_paths: paths });
    expect(await result.json()).toEqual({ entries: [
      { path: paths[0], signedUrl: null, error: 'DOCUMENT_ACCESS_DENIED' },
      { path: paths[1], signedUrl: null, error: null, unmapped: true },
      { path: paths[2], signedUrl: SIGNED_URL, document: DOCUMENT, expiresAt: NOW + 300_000, error: null },
    ] });
    expect(deps.sign).toHaveBeenCalledTimes(1);
    expect(deps.read).not.toHaveBeenCalled();
    expect(deps.register).not.toHaveBeenCalled();
  });

  it('rejects mismatched batch paths without signing the wrong object', async () => {
    const { handler, rpc, deps } = setup();
    rpc.mockResolvedValue([{ path: '1/somebody-else.pdf', error: null, document: DOCUMENT }]);
    const result = await handler(request({ operation: 'urls', bucket: KEY.bucket, paths: [KEY.path] }));
    expect(result.status).toBe(502);
    expect(await result.json()).toEqual({ error: 'INVALID_DOCUMENT_BATCH' });
    expect(deps.sign).not.toHaveBeenCalled();
    expect(deps.read).not.toHaveBeenCalled();
  });

  it('delegates a private PUT only to the server-created upload, with no overwrite', async () => {
    const { handler, rpc, deps } = setup();
    const context = { vesselId: 7 };
    const result = await handler(request({ ...prepare, context }));
    expect(result.status).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('document_blob_upload_scope', {
      target_bucket: KEY.bucket, target_path: KEY.path, target_file_name: 'document.pdf',
      target_mime_type: 'application/pdf', target_bytes: CONTENT.byteLength, target_sha256: HASH, target_context: context,
    });
    expect(deps.sign).toHaveBeenCalledExactlyOnceWith({
      pathname: PATHNAME, operations: ['put'], validUntil: NOW + 15 * 60_000,
      allowedContentTypes: ['application/pdf'], maximumSizeInBytes: CONTENT.byteLength,
    });
    expect(deps.presign).toHaveBeenCalledExactlyOnceWith(TOKEN, {
      operation: 'put', pathname: PATHNAME, access: 'private', validUntil: NOW + 15 * 60_000,
      allowedContentTypes: ['application/pdf'], maximumSizeInBytes: CONTENT.byteLength,
      addRandomSuffix: false, allowOverwrite: false, cacheControlMaxAge: 60,
    });
    expect(await result.json()).toEqual({ uploadId: UPLOAD, uploadUrl: SIGNED_URL, pathname: PATHNAME, expiresAt: NOW + 15 * 60_000 });
    expect(deps.register).not.toHaveBeenCalled();
  });

  it.each([{ bytes: 0 }, { bytes: 100 * 1024 * 1024 + 1 }, { sha256: 'bad-hash' }, { fileName: '../document.pdf' }])('rejects an invalid upload before delegating a PUT (%j)', async (invalid) => {
    const { handler, rpc, deps } = setup();
    const result = await handler(request({ ...prepare, ...invalid }));
    expect(result.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect(deps.sign).not.toHaveBeenCalled();
  });

  it.each([{ uploader_id: OTHER_USER }, { upload_id: 'invalid-upload' }])('rejects an untrusted upload scope (%j)', async (invalid) => {
    const { handler, rpc, deps } = setup();
    rpc.mockResolvedValue({ ...SCOPE, ...invalid });
    const result = await handler(request(prepare));
    expect(result.status).toBe(502);
    expect(deps.sign).not.toHaveBeenCalled();
  });

  it('refuses an expired upload scope', async () => {
    const { handler, rpc, deps } = setup();
    rpc.mockResolvedValue({ ...SCOPE, expires_at: new Date(NOW).toISOString() });
    const result = await handler(request(prepare));
    expect(result.status).toBe(409);
    expect(await result.json()).toEqual({ error: 'DOCUMENT_UPLOAD_EXPIRED' });
    expect(deps.sign).not.toHaveBeenCalled();
  });

  it('reads uncached private bytes, verifies the hash and ETag, and revalidates access before registration', async () => {
    const { handler, rpc, deps } = setup();
    const result = await handler(request(complete));
    expect(result.status).toBe(200);
    expect(rpc).toHaveBeenNthCalledWith(1, 'document_blob_upload_revalidate', { target_upload_id: UPLOAD });
    expect(rpc).toHaveBeenNthCalledWith(2, 'document_blob_upload_revalidate', { target_upload_id: UPLOAD });
    expect(deps.read).toHaveBeenCalledExactlyOnceWith(PATHNAME, expect.objectContaining({ access: 'private', useCache: false, abortSignal: expect.any(AbortSignal) }));
    expect(deps.metadata).toHaveBeenCalledExactlyOnceWith(PATHNAME);
    expect(deps.register).toHaveBeenCalledExactlyOnceWith({
      source_bucket: KEY.bucket, source_path: KEY.path, blob_pathname: PATHNAME,
      blob_url: 'https://fixture.private.blob.vercel-storage.com/' + PATHNAME,
      file_name: 'document.pdf', mime_type: 'application/pdf', bytes: CONTENT.byteLength, sha256: HASH,
      verified_bytes: CONTENT.byteLength, verified_sha256: HASH, verified_mime_type: 'application/pdf',
      upload_id: UPLOAD, uploader_id: USER,
    });
    expect(await result.json()).toEqual({ document: DOCUMENT });
  });

  it('refuses registration when the actual stream hash differs from the declared hash', async () => {
    const { handler, deps } = setup();
    const tampered = CONTENT.slice();
    tampered[5] ^= 1;
    vi.mocked(deps.read).mockResolvedValue(downloaded(tampered));
    const result = await handler(request(complete));
    expect(result.status).toBe(409);
    expect(await result.json()).toEqual({ error: 'DOCUMENT_UPLOAD_MISMATCH' });
    expect(deps.metadata).not.toHaveBeenCalled();
    expect(deps.register).not.toHaveBeenCalled();
  });

  it.each([{ etag: '"replaced"' }, { size: CONTENT.byteLength + 1 }, { contentType: 'text/plain' }])('refuses changed Blob metadata after reading the stream (%j)', async (changed) => {
    const { handler, deps } = setup();
    vi.mocked(deps.metadata).mockResolvedValue({ ...metadata(), ...changed });
    const result = await handler(request(complete));
    expect(result.status).toBe(409);
    expect(await result.json()).toEqual({ error: 'DOCUMENT_UPLOAD_CHANGED' });
    expect(deps.register).not.toHaveBeenCalled();
  });

  it('refuses registration if ownership changes after the verified read', async () => {
    const { handler, rpc, deps } = setup();
    rpc.mockResolvedValueOnce(SCOPE).mockResolvedValueOnce({ ...SCOPE, uploader_id: OTHER_USER });
    const result = await handler(request(complete));
    expect(result.status).toBe(403);
    expect(await result.json()).toEqual({ error: 'DOCUMENT_ACCESS_DENIED' });
    expect(deps.register).not.toHaveBeenCalled();
  });

  it('refuses a different uploader before reading any private bytes', async () => {
    const { handler, rpc, deps } = setup();
    rpc.mockResolvedValue({ ...SCOPE, uploader_id: OTHER_USER });
    const result = await handler(request(complete));
    expect(result.status).toBe(403);
    expect(deps.read).not.toHaveBeenCalled();
    expect(deps.register).not.toHaveBeenCalled();
  });
});

describe('document gateway Supabase adapters', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('SUPABASE_URL', 'https://fixture.supabase.co');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'fixture-publishable-key');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'fixture-verifier-service-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', undefined);
    vi.stubEnv('BLOB_STORE_ID', 'fixture-store-id');
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  function adapters() {
    const authenticate = vi.fn().mockResolvedValue(Response.json({ id: USER }));
    vi.stubGlobal('fetch', authenticate);
    const callerRpc = vi.fn().mockResolvedValue({ data: SCOPE, error: null });
    const serviceRpc = vi.fn().mockResolvedValue({ data: DOCUMENT, error: null });
    providers.createClient.mockImplementation((_url, key) => key === 'fixture-verifier-service-key'
      ? { rpc: serviceRpc }
      : { rpc: callerRpc });
    providers.get.mockImplementation(async () => downloaded());
    providers.head.mockResolvedValue(metadata());
    return { authenticate, callerRpc, serviceRpc };
  }

  it('validates the caller JWT and uses the server service client only to register verified bytes', async () => {
    const { authenticate, callerRpc, serviceRpc } = adapters();
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const result = await api.fetch(request(complete));
    expect(result.status).toBe(200);
    expect(authenticate).toHaveBeenCalledExactlyOnceWith('https://fixture.supabase.co/auth/v1/user', {
      method: 'GET', headers: { apikey: 'fixture-publishable-key', Authorization: 'Bearer fixture.valid.jwt' },
      cache: 'no-store', credentials: 'omit', redirect: 'error', signal: expect.any(AbortSignal),
    });
    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(providers.createClient).toHaveBeenNthCalledWith(1, 'https://fixture.supabase.co', 'fixture-publishable-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: 'Bearer fixture.valid.jwt' } },
    });
    expect(callerRpc).toHaveBeenCalledTimes(2);
    expect(providers.createClient).toHaveBeenNthCalledWith(2, 'https://fixture.supabase.co', 'fixture-verifier-service-key', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect(serviceRpc).toHaveBeenCalledExactlyOnceWith('document_blob_register_verified', {
      p_record: expect.objectContaining({ uploader_id: USER, verified_sha256: HASH, verified_bytes: CONTENT.byteLength, blob_pathname: PATHNAME }),
    });
    const body = await result.text();
    expect(JSON.parse(body)).toEqual({ document: DOCUMENT });
    expect(body).not.toContain('fixture-verifier-service-key');
  });

  it('rejects an invalid JWT from Auth before calling any RPC or Blob reader', async () => {
    const { authenticate, callerRpc, serviceRpc } = adapters();
    authenticate.mockResolvedValue(Response.json({ message: 'Invalid JWT' }, { status: 401 }));
    const result = await api.fetch(request(complete));
    expect(result.status).toBe(401);
    expect(callerRpc).not.toHaveBeenCalled();
    expect(providers.get).not.toHaveBeenCalled();
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it.each([403, 500, 302])('refuses an unsuccessful Auth response (%s)', async (status) => {
    const { authenticate, callerRpc, serviceRpc } = adapters();
    authenticate.mockResolvedValue(Response.json({ id: USER }, { status }));
    const result = await api.fetch(request(complete));
    expect(result.status).toBe(401);
    expect(await result.json()).toEqual({ error: 'DOCUMENT_AUTHENTICATION_REQUIRED' });
    expect(callerRpc).not.toHaveBeenCalled();
    expect(providers.get).not.toHaveBeenCalled();
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it.each([null, [], {}, { id: 123 }, { id: 'not-a-user-uuid' }, { user: { id: USER } }, { user_metadata: { id: USER } }])
  ('refuses malformed Auth identities (%j)', async (identity) => {
    const { authenticate, callerRpc, serviceRpc } = adapters();
    authenticate.mockResolvedValue(Response.json(identity));
    const result = await api.fetch(request(complete));
    expect(result.status).toBe(401);
    expect(callerRpc).not.toHaveBeenCalled();
    expect(providers.get).not.toHaveBeenCalled();
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it('refuses invalid Auth JSON without disclosing its response body', async () => {
    const { authenticate, callerRpc, serviceRpc } = adapters();
    authenticate.mockResolvedValue(new Response('private upstream details', { status: 200 }));
    const result = await api.fetch(request(complete));
    expect(result.status).toBe(401);
    expect(await result.json()).toEqual({ error: 'DOCUMENT_AUTHENTICATION_REQUIRED' });
    expect(callerRpc).not.toHaveBeenCalled();
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it.each([new TypeError('private connection details'), new DOMException('private timeout details', 'TimeoutError')])
  ('refuses an Auth network failure without a fallback (%j)', async (failure) => {
    const { authenticate, callerRpc, serviceRpc } = adapters();
    authenticate.mockRejectedValue(failure);
    const result = await api.fetch(request(complete));
    expect(result.status).toBe(401);
    expect(await result.json()).toEqual({ error: 'DOCUMENT_AUTHENTICATION_REQUIRED' });
    expect(authenticate).toHaveBeenCalledOnce();
    expect(callerRpc).not.toHaveBeenCalled();
    expect(providers.get).not.toHaveBeenCalled();
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it('maps a permission revocation during completion to 403 without invoking the privileged verifier', async () => {
    const { callerRpc, serviceRpc } = adapters();
    callerRpc.mockResolvedValueOnce({ data: SCOPE, error: null }).mockResolvedValueOnce({ data: null, error: { code: '42501' } });
    const result = await api.fetch(request(complete));
    expect(result.status).toBe(403);
    expect(await result.json()).toEqual({ error: 'DOCUMENT_ACCESS_DENIED' });
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(providers.createClient).toHaveBeenCalledTimes(1);
  });
});
