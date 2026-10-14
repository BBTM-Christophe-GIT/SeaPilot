// @vitest-environment node
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { presignUrl, put } from '@vercel/blob';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentBlobStorage } from './documentBlobStorage';

const contents = '%PDF-1.7\nprivate document';
const reference = { blob_pathname: 'documents/migrations/key/hash.pdf', bytes: contents.length,
  sha256: createHash('sha256').update(contents).digest('hex'), mime_type: 'application/pdf', file_name: 'Certificat.pdf' };
const privateUrl = 'https://test.private.blob.vercel-storage.com/documents/migrations/key/hash.pdf?signature=scoped';
const uploadId = '20000000-0000-4000-8000-000000000001';
const uploadPath = `documents/uploads/${uploadId}`;
const uploadPreparation = { uploadId, pathname: uploadPath,
  uploadUrl: `https://vercel.com/api/blob/?pathname=${encodeURIComponent(uploadPath)}&signature=scoped` };
const user = { id: '10000000-0000-4000-8000-000000000001' };
function fixture(mapping: Record<string, unknown> = {}, bucket = 'fleet-certificates') {
  const rpc = vi.fn().mockImplementation(async (name: string, args: { target_path?: string; target_paths?: string[] }) => {
    const value = (path: string) => mapping[path] ?? null;
    if (name === 'document_blob_lookup_batch') return { data: args.target_paths!.map(path => ({ path,
      document: value(path) instanceof Error ? null : value(path), error: value(path) instanceof Error ? '42501' : null })), error: null };
    const found = value(args.target_path!);
    return found instanceof Error ? { data: null, error: { code: '42501', message: found.message } } : { data: found, error: null };
  });
  const getSession = vi.fn().mockResolvedValue({ data: { session: { access_token: 'current-session', user } }, error: null });
  const legacy = {
    download: vi.fn().mockResolvedValue({ data: new Blob(['old copy']), error: null }),
    createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://old.example/file' }, error: null }),
    createSignedUrls: vi.fn().mockImplementation(async (paths: string[]) => ({ data: paths.map(path => ({ path, signedUrl: `https://old.example/${path}`, error: null })), error: null })),
    upload: vi.fn().mockResolvedValue({ data: { path: 'source.docx' }, error: null }),
    remove: vi.fn().mockResolvedValue({ data: [], error: null }), throwOnError: vi.fn(),
  };
  const fetcher = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/documents') {
      const body = JSON.parse(init?.body as string);
      if (body.operation === 'urls') return Response.json({ entries: body.paths.map((path: string) => ({ path, document: mapping[path], signedUrl: privateUrl, error: null })) });
      if (body.operation === 'prepare') return Response.json(uploadPreparation);
      if (body.operation === 'complete') return Response.json({ document: { ...reference, blob_pathname: uploadPath } });
      return Response.json({ document: reference, signedUrl: privateUrl });
    }
    if (init?.method === 'PUT') return new Response(null, { status: 200 });
    return new Response(contents, { headers: { 'Content-Type': 'application/pdf' } });
  });
  vi.stubGlobal('fetch', fetcher);
  const client = { rpc, auth: { getSession } };
  const storage = documentBlobStorage(client as never, bucket, legacy as never);
  return { storage, legacy, rpc, getSession, fetcher };
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('private Blob documents', () => {
  it('reads current private bytes through the authenticated gateway', async () => {
    const { storage, legacy, fetcher } = fixture({ 'current.pdf': reference });
    const result = await storage.download('current.pdf');
    expect(result.error).toBeNull();
    expect(await result.data?.text()).toBe(contents);
    expect(legacy.download).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/documents', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer current-session' }) }));
    expect(fetcher).toHaveBeenNthCalledWith(2, privateUrl, { credentials: 'omit' });
  });

  it('creates fresh links, forwarding expiry and download intent', async () => {
    const { storage, fetcher, legacy } = fixture({ 'current.pdf': reference });
    await storage.createSignedUrl('current.pdf', 600, { download: 'Certificat.pdf' });
    await storage.createSignedUrl('current.pdf', 600);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ expiresIn: 600, download: 'Certificat.pdf' });
    expect(legacy.createSignedUrl).not.toHaveBeenCalled();
  });

  it('preserves the old reader only when no private mapping exists', async () => {
    const { storage, legacy, fetcher } = fixture();
    const signal = new AbortController().signal;
    expect(await storage.download('old.pdf', { cacheNonce: 'fresh' }, { signal })).toBe(await legacy.download.mock.results[0].value);
    expect(legacy.download).toHaveBeenCalledWith('old.pdf', { cacheNonce: 'fresh' }, { signal });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not sign or download the old copy when access is denied', async () => {
    const { storage, legacy, fetcher } = fixture({ 'private.pdf': new Error('Document inaccessible') });
    expect((await storage.download('private.pdf')).error?.status).toBe(403);
    expect((await storage.createSignedUrl('private.pdf', 60)).error?.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
    expect(legacy.download).not.toHaveBeenCalled();
    expect(legacy.createSignedUrl).not.toHaveBeenCalled();
  });

  it.each([undefined, {}, { ...reference, sha256: 'bad' }])('rejects a malformed private mapping', async bad => {
    const { storage, legacy } = fixture({ 'current.pdf': bad === undefined ? 'invalid' : bad });
    expect((await storage.download('current.pdf')).error).not.toBeNull();
    expect(legacy.download).not.toHaveBeenCalled();
  });

  it.each(['javascript:alert(1)', 'https://test.public.blob.vercel-storage.com/file', 'https://other.example/file'])('rejects an unexpected signed destination %s', async url => {
    const { storage, fetcher, legacy } = fixture({ 'current.pdf': reference });
    fetcher.mockResolvedValueOnce(Response.json({ document: reference, signedUrl: url }));
    expect((await storage.createSignedUrl('current.pdf', 60)).error).not.toBeNull();
    expect(legacy.createSignedUrl).not.toHaveBeenCalled();
  });

  it('rejects account changes before exposing a signed URL', async () => {
    const { storage, getSession } = fixture({ 'current.pdf': reference });
    getSession.mockResolvedValueOnce({ data: { session: { access_token: 'first', user } }, error: null })
      .mockResolvedValueOnce({ data: { session: { access_token: 'second', user: { id: 'other-user' } } }, error: null });
    expect((await storage.createSignedUrl('current.pdf', 60)).error?.message).toContain('compte a changé');
  });

  it('rejects changed references and incomplete downloads', async () => {
    const { storage, fetcher, legacy } = fixture({ 'current.pdf': reference });
    fetcher.mockResolvedValueOnce(Response.json({ document: { ...reference, sha256: 'a'.repeat(64) }, signedUrl: privateUrl }));
    expect((await storage.download('current.pdf')).error?.message).toContain('document a changé');
    fetcher.mockResolvedValueOnce(Response.json({ document: reference, signedUrl: privateUrl }))
      .mockResolvedValueOnce(new Response('short', { headers: { 'Content-Type': 'application/pdf' } }));
    expect((await storage.download('current.pdf')).error?.message).toContain('incomplet');
    expect(legacy.download).not.toHaveBeenCalled();
  });

  it('keeps mixed batch order and individual refusals', async () => {
    const { storage, fetcher, legacy } = fixture({ 'current.pdf': reference, 'private.pdf': new Error('denied') });
    const result = await storage.createSignedUrls(['photo.png', 'current.pdf', 'private.pdf', 'old.pdf'], 3600, { download: true });
    expect(result.data).toEqual([
      { path: 'photo.png', signedUrl: 'https://old.example/photo.png', error: null },
      { path: 'current.pdf', signedUrl: privateUrl, error: null },
      { path: 'private.pdf', signedUrl: null, error: '42501' },
      { path: 'old.pdf', signedUrl: 'https://old.example/old.pdf', error: null },
    ]);
    expect(legacy.createSignedUrls).toHaveBeenCalledWith(['photo.png', 'old.pdf'], 3600, { download: true });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ paths: ['current.pdf'], expiresIn: 3600, download: true });
  });

  it('keeps unmapped batches on the previous provider without requiring Blob authentication', async () => {
    const { storage, fetcher, getSession, legacy } = fixture();
    expect((await storage.createSignedUrls(['old.pdf'], 60)).error).toBeNull();
    expect(legacy.createSignedUrls).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
  });

  it('does not revive an old source when a mapping disappears during a batch', async () => {
    const { storage, fetcher, legacy } = fixture({ 'current.pdf': reference });
    fetcher.mockResolvedValueOnce(Response.json({ entries: [{ path: 'current.pdf', document: null, unmapped: true }] }));
    expect((await storage.createSignedUrls(['current.pdf'], 60)).data?.[0]).toMatchObject({ signedUrl: null, error: expect.stringContaining('document a changé') });
    expect(legacy.createSignedUrls).not.toHaveBeenCalled();
  });

  it('bounds lookup and signing batches to 200 paths', async () => {
    const mapping = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`${i}.pdf`, reference]));
    const { storage, rpc, fetcher } = fixture(mapping);
    expect((await storage.createSignedUrls(Object.keys(mapping), 600)).data).toHaveLength(201);
    expect(rpc.mock.calls.map(call => call[1].target_paths.length)).toEqual([200, 1]);
    expect(fetcher.mock.calls.map(call => JSON.parse(call[1].body).paths.length)).toEqual([200, 1]);
  });

  it('bounds signature lookups to four paths while preserving mixed results and order', async () => {
    const paths = Array.from({ length: 10 }, (_, index) => `profiles/${user.id}/signature-${index}.png`);
    const mapping = { [paths[0]]: reference, [paths[1]]: new Error('denied'), [paths[3]]: reference,
      [paths[4]]: reference, [paths[6]]: new Error('denied'), [paths[7]]: reference, [paths[8]]: reference };
    const { storage, rpc, fetcher, legacy } = fixture(mapping, 'working-time-signatures');
    const result = await storage.createSignedUrls(paths, 3600);
    expect(rpc.mock.calls.map(call => call[1].target_paths)).toEqual([paths.slice(0, 4), paths.slice(4, 8), paths.slice(8)]);
    expect(fetcher.mock.calls.map(call => JSON.parse(call[1].body).paths)).toEqual([[paths[0], paths[3]], [paths[4], paths[7]], [paths[8]]]);
    expect(result.data?.map(entry => entry.path)).toEqual(paths);
    expect(result.data?.filter(entry => entry.error)).toEqual([
      { path: paths[1], signedUrl: null, error: '42501' }, { path: paths[6], signedUrl: null, error: '42501' },
    ]);
    expect(result.data?.filter(entry => entry.signedUrl === privateUrl).map(entry => entry.path)).toEqual([paths[0], paths[3], paths[4], paths[7], paths[8]]);
    expect(legacy.createSignedUrls.mock.calls.map(call => call[0])).toEqual([[paths[2]], [paths[5]], [paths[9]]]);
  });

  it('fails closed on a signature lookup timeout without using the previous provider', async () => {
    const { storage, rpc, fetcher, legacy } = fixture({ 'private.png': reference }, 'working-time-signatures');
    rpc.mockResolvedValueOnce({ data: null, error: { code: '57014', message: 'statement timeout' } });
    const result = await storage.createSignedUrls(['private.png'], 3600);
    expect(result.error?.status).toBe(502);
    expect(result.error?.message).toContain('statement timeout');
    expect(result.data).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect(legacy.createSignedUrls).not.toHaveBeenCalled();
  });

  it('uses four-path signature removal checks and retains mapped or refused originals', async () => {
    const paths = Array.from({ length: 10 }, (_, index) => `profiles/${user.id}/signature-${index}.png`);
    const mapping = { [paths[0]]: reference, [paths[1]]: new Error('retired'), [paths[3]]: reference,
      [paths[4]]: reference, [paths[6]]: new Error('retired'), [paths[7]]: reference, [paths[8]]: reference };
    const { storage, rpc, legacy, fetcher } = fixture(mapping, 'working-time-signatures');
    expect((await storage.remove(paths)).error).toBeNull();
    expect(rpc.mock.calls.map(call => call[1].target_paths.length)).toEqual([4, 4, 2]);
    expect(legacy.remove).toHaveBeenCalledWith([paths[2], paths[5], paths[9]]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uploads privately and waits for independent server verification', async () => {
    const { storage, legacy, fetcher } = fixture();
    const file = new File([contents], 'Certificat.pdf', { type: 'application/pdf' });
    expect((await storage.upload('new.pdf', file, { metadata: { person_id: 12 } })).error).toBeNull();
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ operation: 'prepare', fileName: 'Certificat.pdf', bytes: contents.length, sha256: reference.sha256, context: { person_id: 12 } });
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'PUT', credentials: 'omit', redirect: 'error', headers: { 'Content-Type': 'application/pdf', 'x-api-version': '12' } });
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({ operation: 'complete' });
    expect(legacy.upload).not.toHaveBeenCalled();
  });

  it('matches the installed SDK PUT transport version without adding provider headers to GETs', async () => {
    vi.stubEnv('VERCEL_BLOB_API_URL', undefined);
    vi.stubEnv('NEXT_PUBLIC_VERCEL_BLOB_API_URL', undefined);
    vi.stubEnv('VERCEL_BLOB_API_VERSION_OVERRIDE', undefined);
    vi.stubEnv('NEXT_PUBLIC_VERCEL_BLOB_API_VERSION_OVERRIDE', undefined);
    const require = createRequire(import.meta.url);
    const { MockAgent, getGlobalDispatcher, setGlobalDispatcher } = createRequire(require.resolve('@vercel/blob'))('undici');
    const originalDispatcher = getGlobalDispatcher();
    const mockedDispatcher = new MockAgent();
    mockedDispatcher.disableNetConnect();
    let nativeHeaders = new Headers();
    mockedDispatcher.get('https://vercel.com').intercept({ path: /^\/api\/blob\//, method: 'PUT' }).reply((request: { headers: HeadersInit | string[] }) => {
      if (Array.isArray(request.headers) && typeof request.headers[0] === 'string') {
        const headers = request.headers as string[];
        for (let index = 0; index < headers.length; index += 2) nativeHeaders.set(headers[index], headers[index + 1]);
      } else nativeHeaders = new Headers(request.headers as HeadersInit);
      return { statusCode: 200, data: JSON.stringify({ url: `https://test.private.blob.vercel-storage.com/${uploadPath}`,
        pathname: uploadPath, contentType: 'application/pdf', contentDisposition: 'inline', size: contents.length }) };
    });
    setGlobalDispatcher(mockedDispatcher);
    try {
      await put(uploadPath, contents, { token: 'vercel_blob_rw_test_synthetic', access: 'private',
        contentType: 'application/pdf', addRandomSuffix: false, allowOverwrite: false });
      mockedDispatcher.assertNoPendingInterceptors();
    } finally { setGlobalDispatcher(originalDispatcher); await mockedDispatcher.close(); }
    const sdkVersion = nativeHeaders.get('x-api-version');
    expect(sdkVersion).toBe('12');
    const { storage, fetcher } = fixture({ 'current.pdf': reference });
    expect((await storage.upload('new.pdf', new File([contents], 'Certificat.pdf', { type: 'application/pdf' }))).error).toBeNull();
    const uploadHeaders = new Headers(fetcher.mock.calls[1][1].headers);
    expect(uploadHeaders.get('x-api-version')).toBe(sdkVersion);
    expect(uploadHeaders.get('content-type')).toBe('application/pdf');
    expect(uploadHeaders.has('x-content-type')).toBe(false);
    fetcher.mockClear();
    expect((await storage.download('current.pdf')).error).toBeNull();
    expect(fetcher.mock.calls[1][0]).toBe(privateUrl);
    expect(fetcher.mock.calls[1][1]).toEqual({ credentials: 'omit' });
  });

  it('accepts the installed SDK presigned PUT and keeps its private GET separate', async () => {
    vi.stubEnv('VERCEL_BLOB_API_URL', '');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_BLOB_API_URL', '');
    const validUntil = Date.now() + 60000;
    const scope = { storeId: 'store_test', pathname: uploadPath, operations: ['get', 'put'], validUntil,
      maximumSizeInBytes: contents.length, allowedContentTypes: ['application/pdf'] };
    const delegation = { clientSigningToken: 'synthetic-local-signing-key',
      delegationToken: `${Buffer.from(JSON.stringify(scope)).toString('base64url')}.synthetic-signature` };
    const put = await presignUrl(delegation, { operation: 'put', pathname: uploadPath, access: 'private', validUntil,
      addRandomSuffix: false, allowOverwrite: false });
    const get = await presignUrl(delegation, { operation: 'get', pathname: uploadPath, access: 'private', validUntil });
    const putUrl = new URL(put.presignedUrl);
    expect(putUrl.origin).toBe('https://vercel.com');
    expect(putUrl.pathname).toBe('/api/blob/');
    expect(putUrl.searchParams.getAll('pathname')).toEqual([uploadPath]);
    expect(new URL(get.presignedUrl).hostname).toBe('test.private.blob.vercel-storage.com');
    const { storage, fetcher } = fixture({ 'current.pdf': reference });
    fetcher.mockResolvedValueOnce(Response.json({ ...uploadPreparation, uploadUrl: put.presignedUrl }));
    expect((await storage.upload('new.pdf', new File([contents], 'Certificat.pdf', { type: 'application/pdf' }))).error).toBeNull();
    expect(fetcher).toHaveBeenNthCalledWith(2, put.presignedUrl, expect.objectContaining({ method: 'PUT', redirect: 'error' }));
    fetcher.mockClear().mockResolvedValueOnce(Response.json({ ...uploadPreparation, uploadUrl: get.presignedUrl }));
    expect((await storage.upload('new.pdf', new File([contents], 'Certificat.pdf', { type: 'application/pdf' }))).error?.message).toContain('destination');
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockClear().mockResolvedValueOnce(Response.json({ document: reference, signedUrl: put.presignedUrl }));
    expect((await storage.download('current.pdf')).error?.message).toContain('lien Vercel');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(['blob.vercel-storage.com', 'blob-api.vercel-storage.com', 'test.blob.vercel-storage.com', 'test.blob-api.vercel-storage.com'])(
    'preserves the reserved upload on historical provider %s', async host => {
      const { storage, fetcher } = fixture();
      const url = `https://${host}/?pathname=${encodeURIComponent(uploadPath)}&signature=scoped`;
      fetcher.mockResolvedValueOnce(Response.json({ ...uploadPreparation, uploadUrl: url }));
      expect((await storage.upload('new.pdf', new File([contents], 'Certificat.pdf', { type: 'application/pdf' }))).error).toBeNull();
      expect(fetcher).toHaveBeenNthCalledWith(2, url, expect.objectContaining({ method: 'PUT', credentials: 'omit', redirect: 'error' }));
    },
  );

  it.each([
    `https://vercel.com.evil.example/api/blob/?pathname=${uploadPath}`,
    `https://evil-vercel.com/api/blob/?pathname=${uploadPath}`,
    `https://vercel.com/api/blob.evil/?pathname=${uploadPath}`,
    `https://vercel.com/api/blob?pathname=${uploadPath}`,
    `https://vercel.com/api/blob/other?pathname=${uploadPath}`,
    `https://blob.vercel-storage.com.evil.example/?pathname=${uploadPath}`,
    `https://blob.vercel-storage.com/other?pathname=${uploadPath}`,
    `https://test.private.blob.vercel-storage.com/${uploadPath}?signature=scoped`,
    `https://vercel.com:443/api/blob/?pathname=${uploadPath}`,
    `https://vercel.com:8443/api/blob/?pathname=${uploadPath}`,
    `https://user:pass@vercel.com/api/blob/?pathname=${uploadPath}`,
    `http://vercel.com/api/blob/?pathname=${uploadPath}`,
    `https://vercel.com/api/blob/?pathname=documents/uploads/30000000-0000-4000-8000-000000000001`,
    `https://vercel.com/api/blob/?pathname=${uploadPath}&pathname=${uploadPath}`,
    `https://vercel.com/api/blob/?pathname=${uploadPath}#fragment`,
  ])('rejects an unexpected upload destination before sending bytes: %s', async uploadUrl => {
    const { storage, fetcher, legacy } = fixture();
    fetcher.mockResolvedValueOnce(Response.json({ ...uploadPreparation, uploadUrl }));
    expect((await storage.upload('new.pdf', new File([contents], 'Certificat.pdf', { type: 'application/pdf' }))).error?.message).toContain('destination');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(legacy.upload).not.toHaveBeenCalled();
  });

  it.each([{ uploadId: 'invalid' }, { pathname: 'documents/uploads/30000000-0000-4000-8000-000000000001' }, { pathname: null }])(
    'rejects a mismatched upload reservation before sending bytes: %j', async change => {
      const { storage, fetcher } = fixture();
      fetcher.mockResolvedValueOnce(Response.json({ ...uploadPreparation, ...change }));
      expect((await storage.upload('new.pdf', new File([contents], 'Certificat.pdf', { type: 'application/pdf' }))).error?.message).toContain('destination');
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it.each([400, 409, 412])('revalidates a previous PUT after provider refusal %s without overwriting it', async status => {
    const { storage, fetcher } = fixture();
    fetcher.mockResolvedValueOnce(Response.json(uploadPreparation))
      .mockResolvedValueOnce(new Response(null, { status }));
    expect((await storage.upload('new.pdf', new File([contents], 'Certificat.pdf', { type: 'application/pdf' }))).error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('rejects unverified uploaded contents', async () => {
    const { storage, fetcher } = fixture();
    fetcher.mockResolvedValueOnce(Response.json(uploadPreparation))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(Response.json({ document: { ...reference, sha256: 'b'.repeat(64) } }));
    expect((await storage.upload('new.pdf', new File([contents], 'Certificat.pdf', { type: 'application/pdf' }))).error?.message).toContain('ne correspond pas');
  });

  it('preserves editable procedure uploads and public branding', async () => {
    const { storage, legacy, fetcher } = fixture({}, 'procedure-documents');
    await storage.upload('drafts/source.docx', new File(['word'], 'source.docx'));
    expect(legacy.upload).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
    expect(documentBlobStorage({} as never, 'application-branding', legacy as never)).toBe(legacy);
  });

  it('retains migration originals when a business document is removed', async () => {
    const { storage, legacy } = fixture({ 'current.pdf': reference });
    expect((await storage.remove(['current.pdf', 'old.pdf'])).error).toBeNull();
    expect(legacy.remove).toHaveBeenCalledWith(['old.pdf']);
  });

  it('retains an inaccessible archive after business deletion without touching its source', async () => {
    const { storage, legacy } = fixture({ 'private.pdf': new Error('denied') });
    expect(await storage.remove(['private.pdf'])).toEqual({ data: [], error: null });
    expect(legacy.remove).not.toHaveBeenCalled();
  });

  it('preserves stream and throwOnError SDK contracts', async () => {
    const { storage } = fixture({ 'current.pdf': reference, 'denied.pdf': new Error('denied') });
    expect((await storage.download('current.pdf').asStream()).data).toBeInstanceOf(ReadableStream);
    await expect(storage.throwOnError().download('denied.pdf')).rejects.toThrow('denied');
  });
});
