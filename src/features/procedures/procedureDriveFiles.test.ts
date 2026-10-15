import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProcedureFileStore, procedureDriveFilename } from './procedureDriveFiles';
import type { ProcedureInput, ProcedureRecord, PublishedProcedureRecord } from './procedureQueries';
import { hasDocumentBlobFile } from '../documents/documentBlobStorage';
import { installDocumentDriveStorage } from '../documents/documentDriveStorage';

const bridge = vi.hoisted(() => ({ connect: vi.fn(), request: vi.fn() }));
vi.mock('../documents/localDriveLauncher', async importOriginal => ({
  ...await importOriginal<typeof import('../documents/localDriveLauncher')>(),
  connectLocalDrive: bridge.connect, localDriveRequest: bridge.request,
}));
vi.mock('../documents/documentBlobStorage', async original => ({ ...await original<typeof import('../documents/documentBlobStorage')>(), hasDocumentBlobFile: vi.fn().mockResolvedValue(false) }));
const input = { theme: 'URG', documentNumber: '01', versionLabel: 'a', title: 'Essai : sécurité' } as ProcedureInput;
const session = { version: '2.3.0', url: 'http://127.0.0.1:50000/session', expiresAt: 0 };
const client = {} as never;
const hash = createHash('sha256').update('source').digest('hex');
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); bridge.connect.mockReset().mockResolvedValue(session); bridge.request.mockReset(); vi.mocked(hasDocumentBlobFile).mockReset().mockResolvedValue(false); });
afterEach(() => vi.unstubAllGlobals());

function cloudSourceFixture(migrated: boolean, denied = false) {
  const mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.template';
  const blob = new Blob(['current cloud template'], { type: mimeType });
  const document = { drive_file_id: 'current-drive-template', mime_type: mimeType, file_name: 'Trame de base BBTM.dotx',
    bytes: blob.size, version: '7', chunkSize: 4 * 1024 * 1024 };
  const rpc = vi.fn(async (name: string) => name === 'document_drive_lookup'
    ? { data: migrated ? { drive_file_id: document.drive_file_id, mime_type: mimeType } : null,
      error: denied ? { code: '42501', message: 'Document inaccessible' } : null }
    : { data: null, error: null });
  const invoke = vi.fn(async (_name: string, { body }: { body: { operation: string } }) => body.operation === 'info'
    ? { data: document, error: null }
    : { data: blob, error: null, response: new Response(null, { status: 206, headers: {
      'Content-Range': `bytes 0-${blob.size - 1}/${blob.size}`, 'Content-Length': String(blob.size),
      'X-Document-Drive-Id': document.drive_file_id, 'X-Document-Drive-Version': document.version,
      'X-Document-Drive-Bytes': String(blob.size), 'X-Document-Drive-Mime': mimeType,
      'X-Document-Drive-Name': encodeURIComponent(document.file_name),
    } }) });
  const download = vi.fn().mockResolvedValue({ data: blob, error: null });
  const client = { rpc, functions: { invoke }, storage: { from: vi.fn(() => ({ download })) } };
  installDocumentDriveStorage(client as never);
  const record = { id: 125, fileName: document.file_name, mimeType, googleDrivePath: '',
    storageBucket: 'procedure-documents', storagePath: 'sources/sharepoint/listitem-69-Trame-de-base-BBTM.dotx' } as ProcedureRecord;
  return { client, record, blob, download, invoke, rpc };
}

describe('synchronized procedure files', () => {
  it.each(['2.6.0', '2.10.0'])('keeps procedure operations available with launcher %s', async version => {
    bridge.connect.mockResolvedValueOnce({ ...session, version });
    expect((await createProcedureFileStore(client).connect()).version).toBe(version);
  });
  it('uses the requested filename and validates each identity field', () => {
    expect(procedureDriveFilename(input)).toBe('URG 01 A - Essai - sécurité.docx');
    expect(procedureDriveFilename(input, '.XLSX')).toBe('URG 01 A - Essai - sécurité.xlsx');
    for (const field of ['theme', 'documentNumber', 'versionLabel', 'title']) expect(() => procedureDriveFilename({ ...input, [field]: '' })).toThrow('Renseignez');
    expect(() => procedureDriveFilename(input, '.exe')).toThrow('Format');
  });
  it('requires the launcher version supporting procedure operations', async () => {
    bridge.connect.mockResolvedValue({ ...session, version: '2.2.0' });
    await expect(createProcedureFileStore(client).connect()).rejects.toThrow('2.3');
    expect(bridge.request).not.toHaveBeenCalled();
  });
  it('writes exact bytes then validates the native receipt before returning metadata', async () => {
    const file = new File(['source'], 'original.docx', { type: 'application/msword' });
    const path = procedureDriveFilename(input);
    bridge.request.mockResolvedValue({ path, bytes: 6, sha256: hash });
    await expect(createProcedureFileStore(client).write(input, file, session)).resolves.toEqual({ path, bytes: 6, sha256: hash, mimeType: 'application/msword' });
    expect(bridge.request).toHaveBeenCalledWith(client, session, { action: 'write', module: 'procedures', path, base64: btoa('source') });
    for (const corrupt of [{ path: '../other.docx' }, { bytes: 5 }, { sha256: '0'.repeat(64) }]) {
      bridge.request.mockResolvedValue({ path, bytes: 6, sha256: hash, ...corrupt });
      await expect(createProcedureFileStore(client).write(input, file, session)).rejects.toThrow('ne correspond');
    }
  });
  it('rejects empty and oversized imports before contacting the bridge', async () => {
    const store = createProcedureFileStore(client);
    await expect(store.write(input, new File([], 'empty.docx'), session)).rejects.toThrow('25 Mo');
    const large = new File(['large'], 'large.docx');
    Object.defineProperty(large, 'size', { value: 26 * 1024 * 1024 });
    await expect(store.write(input, large, session)).rejects.toThrow('25 Mo');
    expect(bridge.request).not.toHaveBeenCalled();
  });
  it('requests conversion by procedure ID and requires the expected PDF receipt', async () => {
    const record = { ...input, id: 42 } as ProcedureRecord;
    bridge.request.mockResolvedValue({ path: procedureDriveFilename(input, '.pdf'), bytes: 20, sha256: hash });
    await createProcedureFileStore(client).publish(record);
    expect(bridge.request).toHaveBeenCalledWith(client, session, { action: 'publish', module: 'procedures', procedureId: 42 });
    bridge.request.mockResolvedValue({ path: 'unexpected.pdf', bytes: 20, sha256: hash });
    await expect(createProcedureFileStore(client).publish(record)).rejects.toThrow('vérifiée');
  });
  it('reads a publication using its ID and verifies the returned bytes', async () => {
    const record = { id: 51, procedureId: 42, googleDrivePath: 'published.pdf', mimeType: 'application/pdf' } as PublishedProcedureRecord;
    bridge.request.mockResolvedValue({ path: 'published.pdf', bytes: 6, sha256: hash, base64: btoa('source') });
    const blob = await createProcedureFileStore(client).read(record);
    expect(blob.size).toBe(6);
    expect(bridge.request).toHaveBeenCalledWith(client, session, { action: 'read', module: 'procedures', publicationId: 51 });
    bridge.request.mockResolvedValue({ path: 'published.pdf', bytes: 6, sha256: hash, base64: btoa('broken') });
    await expect(createProcedureFileStore(client).read(record)).rejects.toThrow('vérifié');
  });
  it('reads a migrated published PDF by its publication id without the Office launcher', async () => {
    vi.mocked(hasDocumentBlobFile).mockResolvedValue(true);
    const blob = new Blob(['published PDF'], { type: 'application/pdf' });
    const download = vi.fn().mockResolvedValue({ data: blob, error: null });
    const from = vi.fn(() => ({ download }));
    const record = { id: 51, procedureId: 42, googleDrivePath: 'published.pdf', mimeType: 'application/pdf' } as PublishedProcedureRecord;
    expect(await createProcedureFileStore({ storage: { from } } as never).read(record)).toBe(blob);
    expect(from).toHaveBeenCalledWith('procedure-publications-drive');
    expect(download).toHaveBeenCalledWith('51');
    expect(bridge.connect).not.toHaveBeenCalled();
  });
  it('does not bypass a Blob refusal with a retained PDF on Windows', async () => {
    const denied = { code: '42501', message: 'Document inaccessible' };
    vi.mocked(hasDocumentBlobFile).mockRejectedValue(denied);
    await expect(createProcedureFileStore(client).read({ id: 51, procedureId: 42 } as PublishedProcedureRecord)).rejects.toBe(denied);
    expect(bridge.connect).not.toHaveBeenCalled();
  });

  it.each([false, true])('reads a cloud DOTX with the real authorized storage adapter (migrated: %s) without the Windows launcher', async migrated => {
    const { client, record, blob, download, invoke, rpc } = cloudSourceFixture(migrated);
    const read = await createProcedureFileStore(client as never).read(record);
    expect(read.size).toBe(blob.size);
    expect(read.type).toBe(blob.type);
    expect(rpc).toHaveBeenCalledWith('document_drive_lookup', { target_bucket: record.storageBucket, target_path: record.storagePath });
    if (migrated) {
      expect(invoke).toHaveBeenCalledWith('document-drive', expect.objectContaining({ body: expect.objectContaining({ operation: 'download', path: record.storagePath }) }));
      expect(download).not.toHaveBeenCalled();
    } else {
      expect(download).toHaveBeenCalledWith(record.storagePath, undefined, undefined);
      expect(invoke).not.toHaveBeenCalled();
    }
    expect(bridge.connect).not.toHaveBeenCalled();
    expect(bridge.request).not.toHaveBeenCalled();
  });

  it('does not bypass a cloud authorization refusal with the legacy copy or Windows launcher', async () => {
    const { client, record, download, invoke } = cloudSourceFixture(true, true);
    await expect(createProcedureFileStore(client as never).read(record)).rejects.toMatchObject({ message: 'Document inaccessible', status: 403 });
    expect(download).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(bridge.connect).not.toHaveBeenCalled();
    expect(bridge.request).not.toHaveBeenCalled();
  });
});
