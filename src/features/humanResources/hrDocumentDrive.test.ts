import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blobBase64, connectLocalDrive, localDriveRequest } from '../documents/localDriveLauncher';
import { connectHrDrive, readHrDriveFile, writeHrDriveFile } from './hrDocumentDrive';

vi.mock('../documents/localDriveLauncher', async original => ({ ...await original<typeof import('../documents/localDriveLauncher')>(), blobBase64: vi.fn(), connectLocalDrive: vi.fn(), localDriveRequest: vi.fn() }));
const bytes = new TextEncoder().encode('fixture');
const sha256 = Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
const doc = { id: 7, drivePath: 'Jean MARTIN - c1-p5/scan.pdf', driveSha256: sha256, fileSizeBytes: bytes.length, mimeType: 'application/pdf' };
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.mocked(connectLocalDrive).mockResolvedValue({ url: 'http://127.0.0.1:50000/test', expiresAt: Date.now()+10000, version: '2.4.0' });
  vi.mocked(blobBase64).mockResolvedValue(btoa('fixture'));
  vi.mocked(localDriveRequest).mockResolvedValue({ path: doc.drivePath, bytes: bytes.length, sha256, base64: btoa('fixture') });
});
describe('HR files on Google Drive', () => {
  it.each(['2.6.0', '2.10.0'])('keeps HR operations available with launcher %s', async version => {
    vi.mocked(connectLocalDrive).mockResolvedValueOnce({ url: '', expiresAt: 0, version });
    expect((await connectHrDrive()).version).toBe(version);
  });
  it.each(['2.4.0', '2.6.0'])('reads by authorized document id and verifies bytes and hash with launcher %s', async version => {
    vi.mocked(connectLocalDrive).mockResolvedValueOnce({ url: '', expiresAt: 0, version });
    const blob = await readHrDriveFile({} as never, doc);
    expect(blob.size).toBe(bytes.length);
    expect(blob.type).toBe('application/pdf');
    expect(localDriveRequest).toHaveBeenLastCalledWith({}, expect.anything(), { action: 'read', module: 'humanResources', documentId: 7 });
  });
  it.each([{ path: 'other/file.pdf' }, { bytes: 99 }, { sha256: 'b'.repeat(64) }, { base64: btoa('altered') }])('rejects changed content or reference %j', async change => {
    vi.mocked(localDriveRequest).mockResolvedValueOnce({ path: doc.drivePath, bytes: bytes.length, sha256, base64: btoa('fixture'), ...change });
    await expect(readHrDriveFile({} as never, doc)).rejects.toThrow('synchronisation');
  });
  it('gives the upgrade instruction for an older launcher', async () => {
    vi.mocked(connectLocalDrive).mockResolvedValueOnce({ url: '', expiresAt: 0, version: '2.3.0' });
    await expect(readHrDriveFile({} as never, doc)).rejects.toThrow('lanceur SeaPilot 2.4');
  });
  it.each(['Carte Vitale.pdf', 'Photo.jpg', 'Brevet.pdf'])('writes %s to the authorized person folder with the current launcher', async fileName => {
    vi.mocked(connectLocalDrive).mockResolvedValueOnce({ url: '', expiresAt: 0, version: '2.6.0' });
    const rpc = vi.fn().mockResolvedValue({ data: { directory: 'Ressources Humaines', folder: 'Jean MARTIN - c1-p5' }, error: null });
    vi.mocked(localDriveRequest).mockImplementationOnce(async (_client, _connection, data) => ({ path: data.path, bytes: bytes.length, sha256 }));
    const result = await writeHrDriveFile({ rpc } as never, 5, fileName, new File([bytes], fileName));
    expect(rpc).toHaveBeenCalledWith('hr_document_drive_scope', { target_person: 5 });
    expect(result.drive_path).toMatch(/^Jean MARTIN - c1-p5\/[a-f0-9-]{36}-/);
    expect(result.drive_path.endsWith(`-${fileName}`)).toBe(true);
    expect(result.drive_sha256).toBe(sha256);
  });
  it('rejects unsupported extensions and empty files before connecting', async () => {
    vi.mocked(connectLocalDrive).mockClear();
    await expect(writeHrDriveFile({} as never, 5, 'scan.docm', new File([bytes], 'scan.docm'))).rejects.toThrow('25 Mo');
    await expect(writeHrDriveFile({} as never, 5, 'scan.pdf', new File([], 'scan.pdf'))).rejects.toThrow('25 Mo');
    expect(connectLocalDrive).not.toHaveBeenCalled();
  });
});
