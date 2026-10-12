import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHrDocumentSignedUrl, downloadHrDocumentBlob, type HrDocumentRecord } from '../humanResources/peopleQueries';
import { readHrDriveFile } from '../humanResources/hrDocumentDrive';
import { createProcedureFileStore } from '../procedures/procedureDriveFiles';
import { getProcedureFileUrl, type ProcedureRecord, type PublishedProcedureRecord } from '../procedures/procedureQueries';
import { projectDriveStorage } from '../projects/projectDriveStorage';
import { connectLocalDrive, localDriveRequest } from './localDriveLauncher';
import { installDocumentDriveStorage } from './documentDriveStorage';

vi.mock('../humanResources/hrDocumentDrive', () => ({ readHrDriveFile: vi.fn(), writeHrDriveFile: vi.fn() }));
vi.mock('./localDriveLauncher', async original => ({ ...await original<typeof import('./localDriveLauncher')>(), connectLocalDrive: vi.fn(), localDriveRequest: vi.fn() }));

function fixture({ mapped = true, denied = false } = {}) {
  const rpc = vi.fn().mockResolvedValue({
    data: mapped && !denied ? { drive_file_id: 'current-drive-file', mime_type: 'application/pdf' } : null,
    error: denied ? { code: '42501', message: 'Document inaccessible' } : null,
  });
  const invoke = vi.fn().mockImplementation(async (_name: string, { body }: { body: { operation: string } }) => ({
    data: body.operation === 'url' ? { signedUrl: 'https://example.supabase.co/functions/v1/document-drive?ticket=verified' }
      : new Blob(['current file'], { type: 'application/octet-stream' }), error: null,
  }));
  const legacy = {
    download: vi.fn().mockResolvedValue({ data: new Blob(['old backup']), error: null }),
    createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://storage.example/old.pdf' }, error: null }),
  };
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'eq']) query[method] = vi.fn(() => query);
  query.maybeSingle = vi.fn().mockResolvedValue({ data: { path: 'P144/Contrat/existing.pdf', drive_file_id: 'old-drive-file' }, error: null });
  const client = { rpc, functions: { invoke }, storage: { from: vi.fn(() => legacy) }, from: vi.fn(() => query) };
  installDocumentDriveStorage(client as never);
  return { client, rpc, invoke, legacy };
}

beforeEach(() => {
  vi.mocked(readHrDriveFile).mockReset();
  vi.mocked(connectLocalDrive).mockReset();
  vi.mocked(localDriveRequest).mockReset();
});

describe('mobile readers of documents already linked to Drive', () => {
  it('opens and downloads an RH document through its authorized migration reference before the Windows reader', async () => {
    const { client, invoke, legacy } = fixture();
    const document = { drivePath: 'person/file.pdf', storageBucket: 'hr-documents', storagePath: 'old/file.pdf' } as HrDocumentRecord;
    expect(await createHrDocumentSignedUrl(client as never, document)).toContain('/document-drive?ticket=verified');
    expect((await downloadHrDocumentBlob(client as never, document)).size).toBe('current file'.length);
    expect(readHrDriveFile).not.toHaveBeenCalled();
    expect(legacy.download).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('document-drive', expect.objectContaining({ body: { operation: 'download', bucket: 'hr-documents', path: 'old/file.pdf' } }));
    expect(document.drivePath).toBe('person/file.pdf');
  });

  it('keeps the existing RH reader only when no migrated reference exists', async () => {
    const { client, invoke } = fixture({ mapped: false });
    const expected = new Blob(['desktop file']);
    vi.mocked(readHrDriveFile).mockResolvedValue(expected);
    const document = { drivePath: 'person/file.pdf', storageBucket: 'hr-documents', storagePath: 'old/file.pdf' } as HrDocumentRecord;
    expect(await downloadHrDocumentBlob(client as never, document)).toBe(expected);
    expect(readHrDriveFile).toHaveBeenCalledWith(client, document);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('opens a migrated Word procedure in the browser without constructing an Office desktop protocol', async () => {
    const { client, legacy } = fixture();
    const record = { googleDriveFileId: 'existing-source-id', googleDrivePath: 'current-source.docx', storageBucket: 'procedure-documents',
      storagePath: 'sources/old.docx', fileName: 'procedure.docx', mimeType: 'application/msword' } as ProcedureRecord;
    expect(await getProcedureFileUrl(client as never, record, 'open')).toContain('https://example.supabase.co/functions/v1/document-drive');
    expect(await getProcedureFileUrl(client as never, record, 'download')).toContain('https://example.supabase.co/functions/v1/document-drive');
    expect(legacy.createSignedUrl).not.toHaveBeenCalled();
    expect(record.googleDriveFileId).toBe('existing-source-id');
  });

  it('reads a migrated procedure source and its published PDF without connecting to the local launcher', async () => {
    const { client, legacy } = fixture();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    try {
      const store = createProcedureFileStore(client as never);
      const source = { id: 12, googleDrivePath: 'current-source.docx', storageBucket: 'procedure-documents', storagePath: 'sources/old.docx' } as ProcedureRecord;
      const publication = { id: 32, procedureId: 12, googleDrivePath: 'current-publication.pdf', storageBucket: 'procedure-documents', storagePath: 'published/12/old.pdf' } as PublishedProcedureRecord;
      await store.open(source);
      expect(open).toHaveBeenCalledWith('https://example.supabase.co/functions/v1/document-drive?ticket=verified', '_blank', 'noopener,noreferrer');
      expect((await store.read(publication)).size).toBe('current file'.length);
      expect(connectLocalDrive).not.toHaveBeenCalled();
      expect(localDriveRequest).not.toHaveBeenCalled();
      expect(legacy.download).not.toHaveBeenCalled();
    } finally { open.mockRestore(); }
  });

  it('reads a migrated project document before using an existing desktop Drive receipt', async () => {
    const { client, legacy } = fixture();
    const store = projectDriveStorage(client as never, 'project-files');
    expect((await store.download('projects/12/generated/contract/file.pdf')).data?.size).toBe('current file'.length);
    expect((await store.createSignedUrl('projects/12/generated/contract/file.pdf', 120)).data?.signedUrl).toContain('/document-drive?ticket=verified');
    expect(connectLocalDrive).not.toHaveBeenCalled();
    expect(localDriveRequest).not.toHaveBeenCalled();
    expect(legacy.download).not.toHaveBeenCalled();
    expect(legacy.createSignedUrl).not.toHaveBeenCalled();
  });

  it('does not bypass denied migration access using a retained Drive ID, path or local reader', async () => {
    const { client, invoke, legacy } = fixture({ denied: true });
    const document = { drivePath: 'person/file.pdf', storageBucket: 'hr-documents', storagePath: 'old/file.pdf' } as HrDocumentRecord;
    await expect(downloadHrDocumentBlob(client as never, document)).rejects.toMatchObject({ code: '42501' });
    const procedure = { googleDriveFileId: 'existing-source-id', storageBucket: 'procedure-documents', storagePath: 'sources/old.docx' } as ProcedureRecord;
    await expect(getProcedureFileUrl(client as never, procedure, 'open')).rejects.toMatchObject({ code: '42501' });
    await expect(projectDriveStorage(client as never, 'project-files').download('projects/12/file.pdf')).rejects.toMatchObject({ code: '42501' });
    expect(readHrDriveFile).not.toHaveBeenCalled();
    expect(connectLocalDrive).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(legacy.download).not.toHaveBeenCalled();
  });
});
