import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProcedureFileStore, procedureDriveFilename } from './procedureDriveFiles';
import type { ProcedureInput, ProcedureRecord, PublishedProcedureRecord } from './procedureQueries';

const bridge = vi.hoisted(() => ({ connect: vi.fn(), request: vi.fn() }));
vi.mock('../documents/localDriveLauncher', async importOriginal => ({
  ...await importOriginal<typeof import('../documents/localDriveLauncher')>(),
  connectLocalDrive: bridge.connect, localDriveRequest: bridge.request,
}));
const input = { theme: 'URG', documentNumber: '01', versionLabel: 'a', title: 'Essai : sécurité' } as ProcedureInput;
const session = { version: '2.3.0', url: 'http://127.0.0.1:50000/session', expiresAt: 0 };
const client = {} as never;
const hash = createHash('sha256').update('source').digest('hex');
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); bridge.connect.mockReset().mockResolvedValue(session); bridge.request.mockReset(); });
afterEach(() => vi.unstubAllGlobals());

describe('synchronized procedure files', () => {
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
});
