// @vitest-environment node
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentBlobStorage } from './documentBlobStorage';

const contents = '%PDF-1.7\nprivate document';
const reference = { blob_pathname: 'documents/migrations/key/hash.pdf', bytes: contents.length,
  sha256: createHash('sha256').update(contents).digest('hex'), mime_type: 'application/pdf', file_name: 'Certificat.pdf' };
const privateUrl = 'https://test.private.blob.vercel-storage.com/documents/migrations/key/hash.pdf?signature=scoped';
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
      if (body.operation === 'prepare') return Response.json({ uploadId: '20000000-0000-4000-8000-000000000001', uploadUrl: 'https://blob.vercel-storage.com/?pathname=reserved' });
      if (body.operation === 'complete') return Response.json({ document: reference });
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
afterEach(() => vi.unstubAllGlobals());

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

  it('uploads privately and waits for independent server verification', async () => {
    const { storage, legacy, fetcher } = fixture();
    const file = new File([contents], 'Certificat.pdf', { type: 'application/pdf' });
    expect((await storage.upload('new.pdf', file, { metadata: { person_id: 12 } })).error).toBeNull();
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ operation: 'prepare', fileName: 'Certificat.pdf', bytes: contents.length, sha256: reference.sha256, context: { person_id: 12 } });
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'PUT', credentials: 'omit', headers: { 'Content-Type': 'application/pdf' } });
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({ operation: 'complete' });
    expect(legacy.upload).not.toHaveBeenCalled();
  });

  it.each([400, 409, 412])('revalidates a previous PUT after provider refusal %s without overwriting it', async status => {
    const { storage, fetcher } = fixture();
    fetcher.mockResolvedValueOnce(Response.json({ uploadId: '20000000-0000-4000-8000-000000000001', uploadUrl: 'https://blob.vercel-storage.com/?pathname=reserved' }))
      .mockResolvedValueOnce(new Response(null, { status }));
    expect((await storage.upload('new.pdf', new File([contents], 'Certificat.pdf', { type: 'application/pdf' }))).error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('rejects unverified uploaded contents', async () => {
    const { storage, fetcher } = fixture();
    fetcher.mockResolvedValueOnce(Response.json({ uploadId: 'id', uploadUrl: 'https://blob.vercel-storage.com/?pathname=reserved' }))
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
