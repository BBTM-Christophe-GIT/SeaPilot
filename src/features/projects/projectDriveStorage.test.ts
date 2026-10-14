import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectDriveCategory, projectDriveStorage } from './projectDriveStorage';
import { connectLocalDrive, localDriveRequest } from '../documents/localDriveLauncher';
import { hasDocumentBlobFile } from '../documents/documentBlobStorage';
import { installDocumentDriveStorage } from '../documents/documentDriveStorage';
vi.mock('../documents/localDriveLauncher', async original => ({ ...await original<typeof import('../documents/localDriveLauncher')>(), connectLocalDrive: vi.fn(), localDriveRequest: vi.fn(), blobBase64: vi.fn().mockResolvedValue('cGRm') }));
vi.mock('../documents/documentBlobStorage', async original => ({ ...await original<typeof import('../documents/documentBlobStorage')>(), hasDocumentBlobFile: vi.fn().mockResolvedValue(false) }));
const hash = async (blob: Blob) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), (byte) => byte.toString(16).padStart(2, '0')).join('');
function fixture(mapping: unknown = null) {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'eq']) query[method] = vi.fn(() => query);
  query.single = vi.fn().mockResolvedValue({ data: { company_id: 1 }, error: null });
  query.maybeSingle = vi.fn().mockResolvedValue({ data: mapping, error: null });
  query.insert = insert;
  const download = vi.fn().mockResolvedValue({ data: new Blob(['legacy']), error: null });
  const upload = vi.fn().mockResolvedValue({ data: { path: 'uploaded' }, error: null });
  const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://seapilot.example/fresh' }, error: null });
  const storage = { from: vi.fn(() => ({ download, upload, createSignedUrl, remove: vi.fn() })) };
  const rpc = vi.fn().mockImplementation(async (name: string) => ({ data: ['document_blob_lookup', 'document_drive_lookup'].includes(name) ? null : { directory: 'Projet', folder: 'P144 – GUARD VESSEL EMDT', company_id: 1 }, error: null }));
  const client = { from: vi.fn(() => query), rpc, storage };
  return { client, insert, download, upload, createSignedUrl };
}
beforeEach(() => {
  vi.mocked(hasDocumentBlobFile).mockReset().mockResolvedValue(false);
  vi.mocked(connectLocalDrive).mockReset().mockResolvedValue({ url: 'http://localhost', expiresAt: 1, version: '2.5.0' });
  vi.mocked(localDriveRequest).mockReset();
});
describe('project Drive routing', () => {
  it.each(['application/pdf', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])('uploads a project document of type %s without Windows', async contentType => {
    const blob = new Blob(['document'], { type: contentType });
    const { client, upload, insert } = fixture();
    const path = 'projects/12/generated/towage_contract/file.pdf';
    expect((await projectDriveStorage(client as never, 'project-files').upload(path, blob, { contentType })).error).toBeNull();
    expect(upload).toHaveBeenCalledWith(path, blob, { contentType, upsert: false, metadata: { project_id: 12, file_name: 'file.pdf' } });
    expect(connectLocalDrive).not.toHaveBeenCalled();
    expect(localDriveRequest).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
  it('propagates the verified upload failure without creating a desktop receipt', async () => {
    const { client, upload, insert } = fixture();
    const denied = new Error('Projet inaccessible');
    upload.mockResolvedValue({ data: null, error: denied } as never);
    expect((await projectDriveStorage(client as never, 'project-files').upload('projects/12/attachments/hse/file.pdf', new Blob(['pdf']), {})).error).toBe(denied);
    expect(insert).not.toHaveBeenCalled();
    expect(connectLocalDrive).not.toHaveBeenCalled();
  });
  it.each([['other/file.pdf', 'project-files', {}], ['projects/12/file.pdf', 'other', {}], ['projects/12/file.pdf', 'project-files', { upsert: true }]])('rejects an invalid destination %s/%s before upload', async (path, bucket, options) => {
    const { client, upload } = fixture();
    expect((await projectDriveStorage(client as never, String(bucket)).upload(String(path), new Blob(['pdf']), options as never)).error?.message).toContain('invalide');
    expect(upload).not.toHaveBeenCalled();
  });
  it('keeps the legacy read fallback only when no Drive copy is registered', async () => {
    const { client, download } = fixture();
    await projectDriveStorage(client as never, 'project-files').download('old.pdf');
    expect(download).toHaveBeenCalledWith('old.pdf');
  });
  it('reads and signs a migrated desktop receipt using its registry id before opening the local copy', async () => {
    vi.mocked(hasDocumentBlobFile).mockImplementation(async (_client, bucket, path) => bucket === 'project-drive' && path === '71');
    const { client, download, createSignedUrl } = fixture({ id: 71, path: 'Projet/Contrat/file.pdf', bytes: 3, sha256: 'old' });
    const storage = projectDriveStorage(client as never, 'project-files');
    await storage.download('projects/12/contract.pdf');
    await storage.createSignedUrl('projects/12/contract.pdf', 120);
    expect(client.storage.from).toHaveBeenCalledWith('project-drive');
    expect(download).toHaveBeenCalledWith('71');
    expect(createSignedUrl).toHaveBeenCalledWith('71', 120);
    expect(connectLocalDrive).not.toHaveBeenCalled();
  });
  it('never falls back to the desktop receipt after a Blob scope refusal', async () => {
    vi.mocked(hasDocumentBlobFile).mockRejectedValue({ code: '42501', message: 'Document inaccessible' });
    const { client } = fixture({ id: 71, path: 'Projet/file.pdf' });
    await expect(projectDriveStorage(client as never, 'project-files').download('projects/12/file.pdf')).rejects.toMatchObject({ code: '42501' });
    expect(client.from).not.toHaveBeenCalled();
    expect(connectLocalDrive).not.toHaveBeenCalled();
  });
  it('reads Drive bytes and rejects corruption without silently reverting to an old version', async () => {
    const sha256 = await hash(new Blob(['pdf']));
    const mapping = { id: 71, path: 'P144 – GUARD VESSEL EMDT/Contrat/file.pdf', bytes: 3, sha256, mime_type: 'application/pdf' };
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
    const { client } = fixture({ id: 71, drive_file_id: 'verified-drive-file', path: 'Projet-12/Contrat/file.pdf' });
    vi.mocked(connectLocalDrive).mockClear();
    expect(await projectDriveStorage(client as never, 'sharepoint').createSignedUrl('legacy-url', 120)).toEqual({ data: { signedUrl: 'https://drive.google.com/file/d/verified-drive-file/view' }, error: null });
    expect(connectLocalDrive).not.toHaveBeenCalled();
  });

  it('previews and downloads a migrated project file through the gateway before consulting the older desktop receipt', async () => {
    const path = 'projects/12/generated/contract/contract.pdf';
    const content = 'Current authorized project PDF';
    const info = { drive_file_id: 'verified-current-project-file', mime_type: 'application/pdf', file_name: 'contract.pdf',
      bytes: content.length, version: '117', chunkSize: 4 * 1024 * 1024 };
    const { client, download } = fixture({ id: 71, drive_file_id: 'older-project-file', path: 'Projet-12/Contrat/contract.pdf', bytes: 3, sha256: 'older-proof' });
    client.rpc.mockImplementation(async (name: string) => ({ data: name === 'document_blob_lookup' ? null : info, error: null } as never));
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
    const { client, download } = fixture({ id: 71, drive_file_id: 'older-project-file', path: 'Projet-12/Contrat/contract.pdf' });
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
    const { client, download } = fixture({ id: 71, drive_file_id: 'older-project-file', path: 'Projet-12/Contrat/contract.pdf' });
    client.rpc.mockResolvedValue({ data: { drive_file_id: 'verified-current-project-file' }, error: null } as never);
    const unavailable = { data: null, error: new Error('Passerelle indisponible') };
    download.mockResolvedValue(unavailable as never);
    expect(await projectDriveStorage(client as never, 'project-files').download('projects/12/contract.pdf')).toBe(unavailable);
    expect(client.from).not.toHaveBeenCalled();
    expect(connectLocalDrive).not.toHaveBeenCalled();
    expect(localDriveRequest).not.toHaveBeenCalled();
  });
});
