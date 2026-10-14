import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectDriveCategory, projectDriveStorage } from './projectDriveStorage';
import { connectLocalDrive, localDriveRequest } from '../documents/localDriveLauncher';
import { installDocumentDriveStorage } from '../documents/documentDriveStorage';
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
  const rpc = vi.fn().mockImplementation(async (name: string) => ({ data: name === 'document_drive_lookup' ? null : { directory: 'Projet', folder: 'P144 – GUARD VESSEL EMDT', company_id: 1 }, error: null }));
  const client = { from: vi.fn(() => query), rpc, storage };
  return { client, insert, download };
}
beforeEach(() => {
  vi.mocked(connectLocalDrive).mockReset().mockResolvedValue({ url: 'http://localhost', expiresAt: 1, version: '2.5.0' });
  vi.mocked(localDriveRequest).mockReset();
});
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

  it('previews and downloads a migrated project file through the gateway before consulting the older desktop receipt', async () => {
    const path = 'projects/12/generated/contract/contract.pdf';
    const content = 'Current authorized project PDF';
    const info = { drive_file_id: 'verified-current-project-file', mime_type: 'application/pdf', file_name: 'contract.pdf',
      bytes: content.length, version: '117', chunkSize: 4 * 1024 * 1024 };
    const { client, download } = fixture({ drive_file_id: 'older-project-file', path: 'Projet-12/Contrat/contract.pdf', bytes: 3, sha256: 'older-proof' });
    client.rpc.mockResolvedValue({ data: info, error: null } as never);
    const invoke = vi.fn().mockImplementation(async (_name: string, { body }: { body: { operation: string; range?: { start: number; end: number } } }) => {
      if (body.operation === 'url') return { data: { signedUrl: 'https://example.supabase.co/functions/v1/document-drive?ticket=authorized-project', document: info, chunkSize: info.chunkSize }, error: null };
      if (body.operation === 'info') return { data: info, error: null };
      const range = body.range!;
      return { data: new Blob([content], { type: 'application/octet-stream' }), error: null, response: new Response(null, { status: 206, headers: {
        'Content-Range': `bytes ${range.start}-${range.end}/${info.bytes}`, 'Content-Length': String(info.bytes),
        'X-Document-Drive-Id': info.drive_file_id, 'X-Document-Drive-Version': info.version,
        'X-Document-Drive-Bytes': String(info.bytes), 'X-Document-Drive-Mime': info.mime_type,
        'X-Document-Drive-Name': encodeURIComponent(info.file_name),
      } }) };
    });
    Object.assign(client, { functions: { invoke } });
    installDocumentDriveStorage(client as never);
    const storage = projectDriveStorage(client as never, 'project-files');
    expect((await storage.createSignedUrl(path, 120)).data?.signedUrl).toContain('/document-drive?ticket=authorized-project');
    const result = await storage.download(path);
    expect(await result.data?.text()).toBe(content);
    expect(client.rpc).toHaveBeenCalledWith('document_drive_lookup', { target_bucket: 'project-files', target_path: path });
    expect(client.from).not.toHaveBeenCalled();
    expect(connectLocalDrive).not.toHaveBeenCalled();
    expect(localDriveRequest).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it('never bypasses a migrated-file access refusal with an existing desktop receipt or Drive link', async () => {
    const { client, download } = fixture({ drive_file_id: 'older-project-file', path: 'Projet-12/Contrat/contract.pdf' });
    client.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Document inaccessible pour ce profil.' } } as never);
    const storage = projectDriveStorage(client as never, 'project-files');
    await expect(storage.createSignedUrl('projects/12/contract.pdf', 120)).rejects.toMatchObject({ code: '42501' });
    await expect(storage.download('projects/12/contract.pdf')).rejects.toMatchObject({ code: '42501' });
    expect(client.from).not.toHaveBeenCalled();
    expect(client.storage.from).not.toHaveBeenCalled();
    expect(connectLocalDrive).not.toHaveBeenCalled();
    expect(localDriveRequest).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it('returns a gateway failure without reverting to an existing desktop receipt', async () => {
    const { client, download } = fixture({ drive_file_id: 'older-project-file', path: 'Projet-12/Contrat/contract.pdf' });
    client.rpc.mockResolvedValue({ data: { drive_file_id: 'verified-current-project-file' }, error: null } as never);
    const unavailable = { data: null, error: new Error('Passerelle indisponible') };
    download.mockResolvedValue(unavailable as never);
    expect(await projectDriveStorage(client as never, 'project-files').download('projects/12/contract.pdf')).toBe(unavailable);
    expect(client.from).not.toHaveBeenCalled();
    expect(connectLocalDrive).not.toHaveBeenCalled();
    expect(localDriveRequest).not.toHaveBeenCalled();
  });
});
