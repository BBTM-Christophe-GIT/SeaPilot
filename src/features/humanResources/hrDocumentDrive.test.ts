import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectLocalDrive, localDriveRequest } from '../documents/localDriveLauncher';
import { hasDocumentBlobFile } from '../documents/documentBlobStorage';
import { connectHrDrive, readHrDriveFile, writeHrDriveFile } from './hrDocumentDrive';

vi.mock('../documents/localDriveLauncher', async original => ({ ...await original<typeof import('../documents/localDriveLauncher')>(), blobBase64: vi.fn(), connectLocalDrive: vi.fn(), localDriveRequest: vi.fn() }));
vi.mock('../documents/documentBlobStorage', async original => ({ ...await original<typeof import('../documents/documentBlobStorage')>(), hasDocumentBlobFile: vi.fn() }));
const bytes = new TextEncoder().encode('fixture');
const sha256 = Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
const doc = { id: 7, drivePath: 'Jean MARTIN - c1-p5/scan.pdf', driveSha256: sha256, fileSizeBytes: bytes.length, mimeType: 'application/pdf' };
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.mocked(connectLocalDrive).mockResolvedValue({ url: 'http://127.0.0.1:50000/test', expiresAt: Date.now()+10000, version: '2.4.0' });
  vi.mocked(hasDocumentBlobFile).mockReset().mockResolvedValue(false);
  vi.mocked(connectLocalDrive).mockClear();
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
  it.each(['Carte Vitale.pdf', 'Photo.jpg', 'Brevet.pdf'])('uploads %s to the authorized person without a Windows launcher', async fileName => {
    const rpc = vi.fn().mockResolvedValue({ data: { directory: 'Ressources Humaines', folder: 'Jean MARTIN - c1-p5' }, error: null });
    const upload = vi.fn().mockResolvedValue({ error: null });
    const file = new File([bytes], fileName, { type: fileName.endsWith('.jpg') ? 'image/jpeg' : 'application/pdf' });
    const storageFrom = vi.fn(() => ({ upload }));
    const result = await writeHrDriveFile({ rpc, storage: { from: storageFrom } } as never, 5, fileName, file);
    expect(rpc).toHaveBeenCalledWith('hr_document_drive_scope', { target_person: 5 });
    expect(result.storage_path).toMatch(/^people\/5\/[a-f0-9-]{36}-/);
    expect(result.storage_path.endsWith(`-${fileName}`)).toBe(true);
    expect(storageFrom).toHaveBeenCalledWith('hr-documents');
    expect(upload).toHaveBeenCalledWith(result.storage_path, expect.any(File), { contentType: file.type, upsert: false, metadata: { person_id: 5, file_name: fileName } });
    const uploadedFile = upload.mock.calls[0][1] as File;
    expect(uploadedFile.name).toBe(fileName);
    expect(await uploadedFile.text()).toBe('fixture');
    expect(result.drive_path).toBeNull();
    expect(result.drive_sha256).toBeNull();
    expect(connectLocalDrive).not.toHaveBeenCalled();
  });
  it('uses the generated HR filename and derives PDF MIME when a mobile file has no type', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { directory: 'Ressources Humaines', folder: 'Person' }, error: null });
    const upload = vi.fn().mockResolvedValue({ error: null });
    await writeHrDriveFile({ rpc, storage: { from: () => ({ upload }) } } as never, 5, 'Jean MARTIN - CFBS.pdf', new File([bytes], 'scan original.pdf'));
    expect(upload.mock.calls[0][1]).toMatchObject({ name: 'Jean MARTIN - CFBS.pdf', type: 'application/pdf' });
    expect(upload.mock.calls[0][2].contentType).toBe('application/pdf');
  });
  it('reads a migrated historical document by its authorized id without connecting to Windows', async () => {
    vi.mocked(hasDocumentBlobFile).mockResolvedValue(true);
    const blob = new Blob(['fixture'], { type: 'application/pdf' });
    const download = vi.fn().mockResolvedValue({ data: blob, error: null });
    const from = vi.fn(() => ({ download }));
    expect(await readHrDriveFile({ storage: { from } } as never, doc)).toBe(blob);
    expect(from).toHaveBeenCalledWith('hr-drive');
    expect(download).toHaveBeenCalledWith('7');
    expect(connectLocalDrive).not.toHaveBeenCalled();
  });
  it('does not bypass Blob authorization or download failures with the desktop copy', async () => {
    const denied = { code: '42501', message: 'Document inaccessible' };
    vi.mocked(hasDocumentBlobFile).mockRejectedValueOnce(denied);
    await expect(readHrDriveFile({} as never, doc)).rejects.toBe(denied);
    vi.mocked(hasDocumentBlobFile).mockResolvedValue(true);
    const download = vi.fn().mockResolvedValue({ data: null, error: denied });
    await expect(readHrDriveFile({ storage: { from: () => ({ download }) } } as never, doc)).rejects.toBe(denied);
    expect(connectLocalDrive).not.toHaveBeenCalled();
  });
  it('propagates a refused upload before business metadata can be registered', async () => {
    const denied = new Error('Document inaccessible');
    const rpc = vi.fn().mockResolvedValue({ data: { directory: 'Ressources Humaines', folder: 'Person' }, error: null });
    const upload = vi.fn().mockResolvedValue({ error: denied });
    await expect(writeHrDriveFile({ rpc, storage: { from: () => ({ upload }) } } as never, 5, 'scan.pdf', new File([bytes], 'scan.pdf'))).rejects.toBe(denied);
    expect(connectLocalDrive).not.toHaveBeenCalled();
  });
  it('rejects unsupported extensions and empty files before connecting', async () => {
    vi.mocked(connectLocalDrive).mockClear();
    await expect(writeHrDriveFile({} as never, 5, 'scan.docm', new File([bytes], 'scan.docm'))).rejects.toThrow('25 Mo');
    await expect(writeHrDriveFile({} as never, 5, 'scan.pdf', new File([], 'scan.pdf'))).rejects.toThrow('25 Mo');
    expect(connectLocalDrive).not.toHaveBeenCalled();
  });
});
