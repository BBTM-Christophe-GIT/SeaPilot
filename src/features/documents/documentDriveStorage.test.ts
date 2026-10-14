import { describe, expect, it, vi } from 'vitest';
import { documentDriveStorage, installDocumentDriveStorage } from './documentDriveStorage';

const CHUNK_BYTES = 4 * 1024 * 1024;
type DownloadRequest = { operation: string; path: string; range?: { start: number; end: number }; version?: string };
const document = { drive_file_id: 'verified-file', mime_type: 'application/pdf', file_name: 'current.pdf',
  bytes: 'latest Drive version'.length, version: '117', chunkSize: CHUNK_BYTES };

function chunkResponse(info: typeof document, start: number, end: number, data = new Blob(['latest Drive version'], { type: 'application/octet-stream' })) {
  return { data, error: null, response: new Response(null, { status: 206, headers: {
    'Content-Range': `bytes ${start}-${end}/${info.bytes}`, 'Content-Length': String(end - start + 1),
    'X-Document-Drive-Id': info.drive_file_id, 'X-Document-Drive-Version': info.version,
    'X-Document-Drive-Bytes': String(info.bytes), 'X-Document-Drive-Mime': info.mime_type,
    'X-Document-Drive-Name': encodeURIComponent(info.file_name),
  } }) };
}

function fixture(mapping: Record<string, unknown> = {}) {
  const rpc = vi.fn().mockImplementation(async (_name: string, args: { target_path: string }) => {
    const value = mapping[args.target_path];
    return value instanceof Error ? { data: null, error: value } : { data: value ?? null, error: null };
  });
  const invoke = vi.fn().mockImplementation(async (_name: string, { body }: { body: DownloadRequest }) => {
    if (body.operation === 'info') return { data: document, error: null };
    if (body.operation === 'download') return chunkResponse(document, body.range!.start, body.range!.end);
    return { data: { signedUrl: `https://example.supabase.co/functions/v1/document-drive?ticket=${body.path}`, document, chunkSize: CHUNK_BYTES }, error: null };
  });
  const legacy = {
    download: vi.fn().mockResolvedValue({ data: new Blob(['old Storage version']), error: null }),
    createSignedUrl: vi.fn().mockImplementation(async (path: string) => ({ data: { signedUrl: `https://storage.example/${path}` }, error: null })),
    createSignedUrls: vi.fn().mockImplementation(async (paths: string[]) => ({ data: paths.map(path => ({ path, signedUrl: `https://storage.example/${path}`, error: null })), error: null })),
    upload: vi.fn().mockResolvedValue({ data: { path: 'new.pdf' }, error: null }),
    remove: vi.fn().mockResolvedValue({ data: [], error: null }),
    throwOnError: vi.fn(),
  };
  const originalFrom = vi.fn<(bucket: string) => typeof legacy>(() => legacy);
  const client = { rpc, functions: { invoke }, storage: { from: originalFrom } };
  const storage = documentDriveStorage(client as never, 'fleet-certificates', legacy as never);
  return { client, storage, legacy, rpc, invoke, originalFrom };
}
const reference = { drive_file_id: 'verified-file', mime_type: 'application/pdf' };

describe('verified document Drive routing', () => {
  it('downloads a migrated document through the authenticated gateway without reading its obsolete copy', async () => {
    const { storage, invoke, legacy, rpc } = fixture({ 'versions/certificat.pdf': reference });
    const result = await storage.download('versions/certificat.pdf');
    expect(result.error).toBeNull();
    expect(result.data?.size).toBe('latest Drive version'.length);
    expect(result.data?.type).toBe('application/pdf');
    expect(rpc).toHaveBeenCalledWith('document_drive_lookup', { target_bucket: 'fleet-certificates', target_path: 'versions/certificat.pdf' });
    expect(invoke).toHaveBeenNthCalledWith(1, 'document-drive', { body: { operation: 'info', bucket: 'fleet-certificates', path: 'versions/certificat.pdf' } });
    expect(invoke).toHaveBeenNthCalledWith(2, 'document-drive', { body: { operation: 'download', bucket: 'fleet-certificates', path: 'versions/certificat.pdf',
      range: { start: 0, end: document.bytes - 1 }, version: document.version }, timeout: 120000 });
    expect(legacy.download).not.toHaveBeenCalled();
  });

  it('preserves the native Storage response and options for a document with no Drive reference', async () => {
    const { storage, legacy, invoke } = fixture();
    const signal = new AbortController().signal;
    const result = await storage.download('unmigrated.pdf', { cacheNonce: 'refresh' }, { signal });
    expect(result).toBe(await legacy.download.mock.results[0].value);
    expect(legacy.download).toHaveBeenCalledWith('unmigrated.pdf', { cacheNonce: 'refresh' }, { signal });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('opens a migrated document with a temporary gateway URL and preserves the requested download name', async () => {
    const { storage, invoke, legacy } = fixture({ 'certificat.pdf': reference });
    const result = await storage.createSignedUrl('certificat.pdf', 300, { download: 'Certificat navire.pdf' });
    expect(result.data?.signedUrl).toContain('/document-drive?ticket=certificat.pdf');
    expect(invoke).toHaveBeenCalledWith('document-drive', { body: {
      operation: 'url', bucket: 'fleet-certificates', path: 'certificat.pdf', expiresIn: 300, download: 'Certificat navire.pdf',
    } });
    expect(legacy.createSignedUrl).not.toHaveBeenCalled();
  });

  it.each(['photo.png', 'portrait.jpg', 'signature.webp', 'notes.txt'])('leaves %s on Storage without looking up a document mapping', async path => {
    const { storage, rpc, legacy, invoke } = fixture({ [path]: reference });
    await storage.download(path);
    await storage.createSignedUrl(path, 60);
    expect(rpc).not.toHaveBeenCalled();
    expect(legacy.download).toHaveBeenCalledWith(path, undefined, undefined);
    expect(legacy.createSignedUrl).toHaveBeenCalledWith(path, 60, undefined);
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each(['source.docx', 'modele.dotx', 'registre.xlsm', 'tableur.XLSX'])('routes the audited Office document %s through Drive', async path => {
    const { storage, legacy, invoke } = fixture({ [path]: reference });
    expect((await storage.download(path)).error).toBeNull();
    expect(invoke).toHaveBeenCalled();
    expect(legacy.download).not.toHaveBeenCalled();
  });

  it('does not fall back to the old Storage version when Drive is unavailable', async () => {
    const { storage, invoke, legacy } = fixture({ 'certificat.pdf': reference });
    invoke.mockResolvedValue({ data: null, error: new Error('Drive indisponible') });
    expect((await storage.download('certificat.pdf')).error?.message).toBe('Drive indisponible');
    expect((await storage.createSignedUrl('certificat.pdf', 60)).error?.message).toBe('Drive indisponible');
    expect(legacy.download).not.toHaveBeenCalled();
    expect(legacy.createSignedUrl).not.toHaveBeenCalled();
  });

  it('fails closed on an unauthorized or failed lookup before consulting Storage', async () => {
    const { storage, invoke, legacy, rpc } = fixture();
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Document inaccessible' } });
    const result = await storage.download('private.pdf');
    expect(result.error).toMatchObject({ message: 'Document inaccessible', status: 403 });
    expect(legacy.download).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('rejects malformed or nonbinary Drive responses without reverting to Storage', async () => {
    const { storage, invoke, legacy } = fixture({ 'certificat.pdf': reference });
    invoke.mockResolvedValueOnce({ data: document, error: null }).mockResolvedValueOnce({ data: 'corrupted Office text', error: null });
    expect((await storage.download('certificat.pdf')).error?.message).toContain('fichier valide');
    invoke.mockResolvedValue({ data: { signedUrl: 'javascript:alert(1)' }, error: null });
    expect((await storage.createSignedUrl('certificat.pdf', 60)).error?.message).toContain('confirmé');
    expect(legacy.download).not.toHaveBeenCalled();
    expect(legacy.createSignedUrl).not.toHaveBeenCalled();
  });

  it('hydrates a mixed batch in request order, with failures scoped to their own document', async () => {
    const { storage, invoke, legacy } = fixture({ 'current.pdf': reference, 'private.pdf': new Error('Document inaccessible') });
    const result = await storage.createSignedUrls(['photo.png', 'current.pdf', 'private.pdf', 'unmigrated.pdf'], 3600, { download: true });
    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      { path: 'photo.png', signedUrl: 'https://storage.example/photo.png', error: null },
      { path: 'current.pdf', signedUrl: 'https://example.supabase.co/functions/v1/document-drive?ticket=current.pdf', error: null },
      { path: 'private.pdf', signedUrl: null, error: 'Document inaccessible' },
      { path: 'unmigrated.pdf', signedUrl: 'https://storage.example/unmigrated.pdf', error: null },
    ]);
    expect(legacy.createSignedUrls).toHaveBeenCalledWith(['photo.png', 'unmigrated.pdf'], 3600, { download: true });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('preserves native batching for photos and documents that have not been migrated', async () => {
    const { storage, legacy, invoke } = fixture();
    const result = await storage.createSignedUrls(['photo.png', 'unmigrated.pdf'], 120);
    expect(result).toBe(await legacy.createSignedUrls.mock.results[0].value);
    expect(legacy.createSignedUrls).toHaveBeenCalledTimes(1);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('does not sign a stale Storage copy when a mapped document fails within a batch', async () => {
    const { storage, invoke, legacy } = fixture({ 'current.pdf': reference });
    invoke.mockResolvedValue({ data: null, error: new Error('Drive indisponible') });
    expect((await storage.createSignedUrls(['current.pdf'], 120)).data).toEqual([
      { path: 'current.pdf', signedUrl: null, error: 'Drive indisponible' },
    ]);
    expect(legacy.createSignedUrls).not.toHaveBeenCalled();
  });

  it('installs once and preserves native upload and deletion methods', async () => {
    const { client, legacy, originalFrom } = fixture({ 'current.pdf': reference });
    installDocumentDriveStorage(client as never);
    installDocumentDriveStorage(client as never);
    const bucket = client.storage.from('fleet-certificates');
    await bucket.upload('new.pdf', new Blob(['new']));
    await bucket.remove(['unmigrated.pdf']);
    expect(originalFrom).toHaveBeenCalledTimes(1);
    expect(legacy.upload).toHaveBeenCalledTimes(1);
    expect(legacy.remove).toHaveBeenCalledWith(['unmigrated.pdf']);
  });

  it('retains the SDK throwOnError behavior for gateway failures', async () => {
    const { storage, invoke } = fixture({ 'current.pdf': reference });
    invoke.mockResolvedValue({ data: null, error: new Error('Drive indisponible') });
    await expect(storage.throwOnError().download('current.pdf')).rejects.toThrow('Drive indisponible');
  });

  it('assembles a 43 MiB current version in authenticated blocks and preserves their byte order', async () => {
    const { storage, invoke, legacy } = fixture({ 'large.pdf': reference });
    const info = { ...document, bytes: 43 * 1024 * 1024, file_name: 'Rapport été.pdf' };
    const signal = new AbortController().signal;
    invoke.mockImplementation(async (_name: string, { body }: { body: DownloadRequest }) => {
      if (body.operation === 'info') return { data: info, error: null };
      const { start, end } = body.range!;
      expect(body.version).toBe(info.version);
      expect(end - start + 1).toBeLessThanOrEqual(CHUNK_BYTES);
      return chunkResponse(info, start, end, new Blob([new Uint8Array(end - start + 1).fill(start / CHUNK_BYTES)]));
    });
    const result = await storage.download('large.pdf', undefined, { signal });
    expect(result.error).toBeNull();
    expect(result.data?.size).toBe(info.bytes);
    expect(result.data?.type).toBe('application/pdf');
    const bytes = new Uint8Array(await result.data!.arrayBuffer());
    for (let block = 0; block < 11; block++) expect(bytes[block * CHUNK_BYTES]).toBe(block);
    expect(bytes.at(-1)).toBe(10);
    expect(invoke).toHaveBeenCalledTimes(12);
    for (const [, options] of invoke.mock.calls) expect(options).toMatchObject({ signal });
    expect(legacy.download).not.toHaveBeenCalled();
  });

  it.each(['truncated', 'wrong-range', 'wrong-id', 'wrong-version', 'wrong-size', 'wrong-mime', 'wrong-name', 'missing-headers', 'whole-response'])(
    'rejects a %s block before returning any assembled document', async failure => {
      const { storage, invoke, legacy } = fixture({ 'large.pdf': reference });
      const info = { ...document, bytes: CHUNK_BYTES + 3 };
      invoke.mockImplementation(async (_name: string, { body }: { body: DownloadRequest }) => {
        if (body.operation === 'info') return { data: info, error: null };
        const { start, end } = body.range!;
        const result = chunkResponse(info, start, end, new Blob([new Uint8Array(end - start + 1)]));
        if (start === 0) return result;
        if (failure === 'truncated') result.data = new Blob(['xx']);
        if (failure === 'wrong-range') result.response.headers.set('Content-Range', `bytes 0-2/${info.bytes}`);
        if (failure === 'wrong-id') result.response.headers.set('X-Document-Drive-Id', 'different-file');
        if (failure === 'wrong-version') result.response.headers.set('X-Document-Drive-Version', 'edited-version');
        if (failure === 'wrong-size') result.response.headers.set('X-Document-Drive-Bytes', String(info.bytes + 1));
        if (failure === 'wrong-mime') result.response.headers.set('X-Document-Drive-Mime', 'text/html');
        if (failure === 'wrong-name') result.response.headers.set('X-Document-Drive-Name', 'another.pdf');
        if (failure === 'missing-headers') result.response = new Response(null, { status: 206 });
        if (failure === 'whole-response') result.response = new Response(null, { status: 200, headers: result.response.headers });
        return result;
      });
      const result = await storage.download('large.pdf');
      expect(result.data).toBeNull();
      expect(result.error?.message).toContain('bloc Google Drive');
      expect(invoke).toHaveBeenCalledTimes(3);
      expect(legacy.download).not.toHaveBeenCalled();
    });

  it.each([403, 409])('discards previous blocks when access or version fails with HTTP %i', async status => {
    const { storage, invoke, legacy } = fixture({ 'large.pdf': reference });
    const info = { ...document, bytes: CHUNK_BYTES + 3 };
    invoke.mockImplementation(async (_name: string, { body }: { body: DownloadRequest }) => {
      if (body.operation === 'info') return { data: info, error: null };
      if (body.range!.start > 0) return { data: null, error: { context: new Response(JSON.stringify({ error: 'Document inaccessible ou modifié' }), { status }) } };
      return chunkResponse(info, body.range!.start, body.range!.end, new Blob([new Uint8Array(CHUNK_BYTES)]));
    });
    const result = await storage.download('large.pdf');
    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({ status, message: 'Document inaccessible ou modifié' });
    expect(legacy.download).not.toHaveBeenCalled();
  });

  it('opens a large document from authenticated blocks and releases its temporary browser URL', async () => {
    vi.useFakeTimers();
    const created = vi.fn<(document: Blob) => string>(() => 'blob:https://seapilot.example/current-file'), revoked = vi.fn();
    const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = created; URL.revokeObjectURL = revoked;
    try {
      const { storage, invoke, legacy } = fixture({ 'large.pdf': reference });
      const info = { ...document, bytes: CHUNK_BYTES + 3 };
      invoke.mockImplementation(async (_name: string, { body }: { body: DownloadRequest }) => {
        if (body.operation === 'url') return { data: { signedUrl: 'https://gateway.example/ticket', document: info, chunkSize: CHUNK_BYTES }, error: null };
        return chunkResponse(info, body.range!.start, body.range!.end, new Blob([new Uint8Array(body.range!.end - body.range!.start + 1)]));
      });
      const result = await storage.createSignedUrl('large.pdf', 300);
      expect(result.data?.signedUrl).toBe('blob:https://seapilot.example/current-file');
      expect(created.mock.calls[0][0]).toMatchObject({ size: info.bytes, type: info.mime_type });
      expect(invoke).toHaveBeenCalledTimes(3);
      expect(legacy.createSignedUrl).not.toHaveBeenCalled();
      vi.advanceTimersByTime(120000);
      expect(revoked).toHaveBeenCalledWith(result.data?.signedUrl);
    } finally { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; vi.useRealTimers(); }
  });
});
