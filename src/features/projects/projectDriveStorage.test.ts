import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectDriveCategory, projectDriveStorage } from './projectDriveStorage';
import { connectLocalDrive, localDriveRequest } from '../documents/localDriveLauncher';
vi.mock('../documents/localDriveLauncher', async original => ({ ...await original<typeof import('../documents/localDriveLauncher')>(), connectLocalDrive: vi.fn(), localDriveRequest: vi.fn(), blobBase64: vi.fn().mockResolvedValue('cGRm') }));
const hash = async (blob: Blob) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), (byte) => byte.toString(16).padStart(2, '0')).join('');
function fixture(mapping: unknown = null) {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'eq']) query[method] = vi.fn(() => query);
  query.single = vi.fn().mockResolvedValue({ data: { company_id: 1 }, error: null });
  query.maybeSingle = vi.fn().mockResolvedValue({ data: mapping, error: null });
  query.insert = insert;
  const download = vi.fn().mockResolvedValue({ data: new Blob(['legacy']), error: null });
  const storage = { from: vi.fn(() => ({ download, remove: vi.fn() })) };
  const rpc = vi.fn().mockResolvedValue({ data: { directory: 'Projet', folder: 'P144 – GUARD VESSEL EMDT', company_id: 1 }, error: null });
  const client = { from: vi.fn(() => query), rpc, storage };
  return { client, insert, download };
}
beforeEach(() => { vi.mocked(connectLocalDrive).mockResolvedValue({ url: 'http://localhost', expiresAt: 1, version: '2.5.0' }); });
describe('project Drive routing', () => {
  it.each(['2.5.0', '2.6.0', '2.6.1', '2.10.0'])('exports P144 billing with compatible launcher %s', async version => {
    vi.mocked(connectLocalDrive).mockResolvedValue({ url: 'http://localhost', expiresAt: 1, version });
    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    const sha256 = await hash(blob);
    const path = 'P144 – GUARD VESSEL EMDT/Facturation/releve.pdf';
    vi.mocked(localDriveRequest).mockResolvedValue({ path, bytes: blob.size, sha256 });
    const { client, insert } = fixture();
    expect(await projectDriveStorage(client as never, 'project-files').upload('projects/12/9/export/releve.pdf', blob, {})).toEqual({ error: null });
    expect(localDriveRequest).toHaveBeenLastCalledWith(client, expect.objectContaining({ version }), expect.objectContaining({ action: 'write', module: 'projects', path }));
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ path, sha256 }));
  });
  it.each(['2.4.0', '3.0.0', undefined])('refuses unsupported launcher %s before authorizing or writing a billing export', async version => {
    vi.mocked(connectLocalDrive).mockResolvedValue({ url: 'http://localhost', expiresAt: 1, version });
    vi.mocked(localDriveRequest).mockClear();
    const { client, insert } = fixture();
    const result = await projectDriveStorage(client as never, 'project-files').upload('projects/12/9/export/releve.pdf', new Blob(['pdf']), {});
    expect(result.error?.message).toContain('2.5 ou ultérieur');
    expect(client.rpc).not.toHaveBeenCalled();
    expect(localDriveRequest).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
  it('writes a verified copy and its receipt without uploading another Storage object', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    const sha256 = await hash(blob);
    vi.mocked(localDriveRequest).mockResolvedValue({ path: 'P144 – GUARD VESSEL EMDT/Contrat/file.pdf', bytes: 3, sha256 });
    const { client, insert } = fixture();
    expect(await projectDriveStorage(client as never, 'project-files').upload('projects/12/generated/towage_contract/file.pdf', blob, {})).toEqual({ error: null });
    expect(client.rpc).toHaveBeenCalledWith('projects_drive_scope', { target_project: 12 });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ project_id: 12, path: 'P144 – GUARD VESSEL EMDT/Contrat/file.pdf', source_path: 'projects/12/generated/towage_contract/file.pdf', sha256, bytes: 3 }));
    expect(client.storage.from).not.toHaveBeenCalled();
  });
  it('does not register an incomplete transfer', async () => {
    vi.mocked(localDriveRequest).mockResolvedValue({ path: 'Projet-12/Contrat/file.pdf', bytes: 2, sha256: 'wrong' });
    const { client, insert } = fixture();
    const result = await projectDriveStorage(client as never, 'project-files').upload('projects/12/generated/towage_contract/file.pdf', new Blob(['pdf']), {});
    expect(result.error?.message).toContain('confirmée');
    expect(insert).not.toHaveBeenCalled();
  });
  it('keeps the legacy read fallback only when no Drive copy is registered', async () => {
    const { client, download } = fixture();
    await projectDriveStorage(client as never, 'project-files').download('old.pdf');
    expect(download).toHaveBeenCalledWith('old.pdf');
  });
  it.each([
    { data: null, error: { message: 'Projet inaccessible' } },
    { data: { directory: 'Projet', folder: '../other', company_id: 1 }, error: null },
  ])('refuses a failed or unsafe folder authorization without writing elsewhere', async (scope) => {
    const { client, insert } = fixture();
    client.rpc.mockResolvedValue(scope as never);
    vi.mocked(localDriveRequest).mockClear();
    const result = await projectDriveStorage(client as never, 'project-files').upload('projects/12/generated/offer/file.pdf', new Blob(['pdf']), {});
    expect(result.error).toBeInstanceOf(Error);
    expect(localDriveRequest).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(client.storage.from).not.toHaveBeenCalled();
  });
  it('reads Drive bytes and rejects corruption without silently reverting to an old version', async () => {
    const sha256 = await hash(new Blob(['pdf']));
    const mapping = { path: 'P144 – GUARD VESSEL EMDT/Contrat/file.pdf', bytes: 3, sha256, mime_type: 'application/pdf' };
    const { client, download } = fixture(mapping);
    vi.mocked(localDriveRequest).mockResolvedValue({ ...mapping, base64: 'cGRm' });
    expect((await projectDriveStorage(client as never, 'project-files').download('old.pdf')).data?.size).toBe(3);
    vi.mocked(localDriveRequest).mockResolvedValue({ ...mapping, base64: 'YmFk' });
    await expect(projectDriveStorage(client as never, 'project-files').download('old.pdf')).rejects.toThrow('modifié');
    expect(download).not.toHaveBeenCalled();
  });
  it('classifies project attachments, contracts, services and operational files', () => {
    expect(projectDriveCategory('projects/1/attachments/hse/procedure/file.pdf')).toBe('HSE');
    expect(projectDriveCategory('projects/1/operations/3/file.pdf')).toBe('Operations');
    expect(projectDriveCategory('projects/1/9/export/file.zip')).toBe('Facturation');
  });
  it('opens a verified historical Drive file in the browser without requiring the Windows launcher', async () => {
    const { client } = fixture({ drive_file_id: 'verified-drive-file', path: 'Projet-12/Contrat/file.pdf' });
    vi.mocked(connectLocalDrive).mockClear();
    expect(await projectDriveStorage(client as never, 'sharepoint').createSignedUrl('legacy-url', 120)).toEqual({ data: { signedUrl: 'https://drive.google.com/file/d/verified-drive-file/view' }, error: null });
    expect(connectLocalDrive).not.toHaveBeenCalled();
  });
});
