import { describe, expect, it, vi } from 'vitest';
import { documentDriveStorage, installDocumentDriveStorage } from './documentDriveStorage';

function fixture(mapping: Record<string, unknown> = {}) {
  const rpc = vi.fn().mockImplementation(async (_name: string, args: { target_path: string }) => {
    const value = mapping[args.target_path];
    return value instanceof Error ? { data: null, error: value } : { data: value ?? null, error: null };
  });
  const invoke = vi.fn().mockImplementation(async (_name: string, { body }: { body: { operation: string; path: string } }) => ({
    data: body.operation === 'download' ? new Blob(['latest Drive version'], { type: 'application/octet-stream' })
      : { signedUrl: `https://example.supabase.co/functions/v1/document-drive?ticket=${body.path}` }, error: null,
  }));
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
    expect(invoke).toHaveBeenCalledWith('document-drive', { body: { operation: 'download', bucket: 'fleet-certificates', path: 'versions/certificat.pdf' } });
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
    invoke.mockResolvedValue({ data: 'corrupted Office text', error: null });
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
});
