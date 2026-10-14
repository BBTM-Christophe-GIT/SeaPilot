// @vitest-environment node
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readExpenseBlobPdf } from '../functions/expense-note-send/blobPdf';

const API = 'https://sea-pilot-ten.vercel.app/api/documents';
const AUTH = 'Bearer fixture-caller-jwt';
const PDF = new TextEncoder().encode('%PDF-1.7\nsynthetic accounting fixture');
const SHA = createHash('sha256').update(PDF).digest('hex');
const PATHNAME = 'documents/migrations/fixture/document.pdf';
const URL = `https://fixture.private.blob.vercel-storage.com/${PATHNAME}`;
function setup() {
  const info = { id: 'aa100000-0000-4000-8000-000000000002', provider: 'vercel-blob', blob_pathname: PATHNAME,
    blob_url: URL, file_name: 'fixture.pdf', mime_type: 'application/pdf', bytes: PDF.length, sha256: SHA, source_sha256: SHA, verified_at: '2026-10-14T00:00:00Z' };
  const data = { document: info, signedUrl: `${URL}?token=synthetic`, expiresAt: Date.now() + 120_000 };
  const api = vi.fn().mockImplementation(async () => Response.json(data));
  const get = vi.fn().mockImplementation(async () => new Response(PDF, { headers: { 'Content-Type': 'application/pdf; charset=binary', 'Content-Length': String(PDF.length) } }));
  const send = vi.fn().mockImplementation((url, options) => url === API ? api(url, options) : get(url, options));
  return { data, info, api, get, send, read: () => readExpenseBlobPdf(send, AUTH, '1/owner/note.pdf') };
}
afterEach(() => vi.restoreAllMocks());

describe('private expense PDF reader (all network calls simulated)', () => {
  it('uses the exact caller JWT at the fixed API, then verifies the private PDF without forwarding credentials', async () => {
    const test = setup(); expect(await test.read()).toEqual(PDF);
    expect(test.api).toHaveBeenCalledWith(API, expect.objectContaining({ method: 'POST', headers: { Authorization: AUTH, 'Content-Type': 'application/json' }, redirect: 'error' }));
    const options = test.api.mock.calls[0][1];
    expect(JSON.parse(options.body)).toEqual({ operation: 'url', bucket: 'expense-note-pdfs', path: '1/owner/note.pdf', expiresIn: 120 });
    expect(options.headers.Origin).toBeUndefined();
    expect(test.get).toHaveBeenCalledWith(test.data.signedUrl, expect.objectContaining({ method: 'GET', credentials: 'omit', redirect: 'error' }));
    expect(test.get.mock.calls[0][1].headers).toBeUndefined();
  });
  it('permits a legacy read only for the exact API unmapped response', async () => {
    const test = setup(); test.api.mockImplementation(async () => Response.json({ error: 'DOCUMENT_NOT_FOUND' }, { status: 404 }));
    expect(await test.read()).toBeNull(); expect(test.get).not.toHaveBeenCalled();
  });
  it('accepts the SDK mixed-case store hostname and fetches the canonical private destination', async () => {
    const test = setup(); test.data.signedUrl = test.data.signedUrl.replace('fixture.private', 'FiXtUrE.private');
    expect(await test.read()).toEqual(PDF);
    expect(test.get).toHaveBeenCalledWith(`${URL}?token=synthetic`, expect.objectContaining({ method: 'GET' }));
  });
  it.each([401, 403, 404, 408, 500, 503])('rejects HTTP %s without legacy permission', async (status) => {
    const test = setup(); test.api.mockImplementation(async () => Response.json({ error: status === 404 ? 'OTHER_ERROR' : 'DOCUMENT_NOT_FOUND' }, { status }));
    await expect(test.read()).rejects.toMatchObject({ status: [401, 403].includes(status) ? status : 502 }); expect(test.get).not.toHaveBeenCalled();
  });
  it.each(['html', 'json-null', 'json-array', 'bad-json', 'network', 'large-json'])('rejects a malformed or failed API: %s', async (kind) => {
    const test = setup(); test.api.mockImplementation(async () => {
      if (kind === 'network') throw new Error('synthetic timeout');
      if (kind === 'html') return new Response('<html>login</html>', { status: 404, headers: { 'Content-Type': 'text/html' } });
      if (kind === 'json-null') return Response.json(null);
      if (kind === 'json-array') return Response.json([]);
      return new Response(kind === 'large-json' ? 'x'.repeat(64_001) : '{', { headers: { 'Content-Type': 'application/json' } });
    });
    await expect(test.read()).rejects.toMatchObject({ status: 502 }); expect(test.get).not.toHaveBeenCalled();
  });
  it.each(['sha', 'source-sha', 'bytes', 'mime', 'provider', 'verified', 'id', 'expired', 'expiry-too-long'])('rejects unverified metadata: %s', async (kind) => {
    const test = setup();
    if (kind === 'sha') test.info.sha256 = 'invalid';
    if (kind === 'source-sha') test.info.source_sha256 = 'b'.repeat(64);
    if (kind === 'bytes') test.info.bytes = 0;
    if (kind === 'mime') test.info.mime_type = 'text/html';
    if (kind === 'provider') test.info.provider = 'other';
    if (kind === 'verified') test.info.verified_at = 'invalid';
    if (kind === 'id') test.info.id = 'invalid';
    if (kind === 'expired') test.data.expiresAt = Date.now() - 1;
    if (kind === 'expiry-too-long') test.data.expiresAt = Date.now() + 3_600_000;
    await expect(test.read()).rejects.toMatchObject({ status: 422 }); expect(test.get).not.toHaveBeenCalled();
  });
  it.each([
    'http://fixture.private.blob.vercel-storage.com/documents/migrations/fixture/document.pdf?token=synthetic',
    'https://fixture.private.blob.vercel-storage.com.attacker.invalid/documents/migrations/fixture/document.pdf?token=synthetic',
    'https://fixture.public.blob.vercel-storage.com/documents/migrations/fixture/document.pdf?token=synthetic',
    'https://other.private.blob.vercel-storage.com/documents/migrations/fixture/document.pdf?token=synthetic',
    'https://user:pass@fixture.private.blob.vercel-storage.com/documents/migrations/fixture/document.pdf?token=synthetic',
    'https://fixture.private.blob.vercel-storage.com:443/documents/migrations/fixture/document.pdf?token=synthetic',
    `${URL}?token=synthetic#fragment`, `${URL}/other?token=synthetic`, URL,
    'https://fixture.private.blob.vercel-storage.com/documents/%2e%2e/private.pdf?token=synthetic',
  ])('rejects an unbound private destination before sending any request: %s', async (url) => {
    const test = setup(); test.data.signedUrl = url;
    await expect(test.read()).rejects.toMatchObject({ status: 422 }); expect(test.get).not.toHaveBeenCalled();
  });
  it.each(['hash', 'short', 'mime', 'magic', 'length', 'http', 'network'])('rejects an altered or unavailable PDF: %s', async (kind) => {
    const test = setup();
    test.get.mockImplementation(async () => {
      if (kind === 'network') throw new Error('synthetic provider failure');
      const body = kind === 'short' ? PDF.subarray(0, 10) : kind === 'hash' ? new TextEncoder().encode(new TextDecoder().decode(PDF).replace('fixture', 'changed'))
        : kind === 'magic' ? new TextEncoder().encode('XXXXX' + new TextDecoder().decode(PDF).slice(5)) : PDF;
      return new Response(body, { status: kind === 'http' ? 403 : 200, headers: { 'Content-Type': kind === 'mime' ? 'text/html' : 'application/pdf',
        ...(kind === 'length' ? { 'Content-Length': '10' } : {}) } });
    });
    await expect(test.read()).rejects.toMatchObject({ status: kind === 'network' ? 502 : 422 });
  });
  it.each(['metadata', 'header', 'stream'])('preserves the 4 MB bound: %s', async (kind) => {
    const test = setup();
    if (kind === 'metadata') test.info.bytes = 4_000_001;
    else test.get.mockImplementation(async () => new Response(kind === 'stream' ? new Uint8Array(4_000_001) : PDF, {
      headers: { 'Content-Type': 'application/pdf', ...(kind === 'header' ? { 'Content-Length': '4000001' } : {}) } }));
    await expect(test.read()).rejects.toMatchObject({ status: 413 });
    if (kind === 'metadata') expect(test.get).not.toHaveBeenCalled();
  });
  it('aborts a stalled provider stream within the reader deadline', async () => {
    const test = setup(); const deadline = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    const started = Promise.withResolvers<void>(); const cancelled = vi.fn();
    test.get.mockImplementation(async () => new Response(new ReadableStream({ start() { started.resolve(); }, cancel: cancelled }), { headers: { 'Content-Type': 'application/pdf' } }));
    const read = test.read(); await started.promise; deadline.abort();
    await expect(read).rejects.toMatchObject({ status: 502 }); expect(cancelled).toHaveBeenCalled();
  });
});
