import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHrDocumentSignedUrl, downloadHrDocumentBlob, type HrDocumentRecord } from '../humanResources/peopleQueries';
import { readHrDriveFile } from '../humanResources/hrDocumentDrive';
import { createProcedureFileStore } from '../procedures/procedureDriveFiles';
import { buildGoogleDriveDesktopUri } from '../procedures/procedureGoogleDrive';
import { getProcedureFileUrl, type ProcedureRecord, type PublishedProcedureRecord } from '../procedures/procedureQueries';
import { connectLocalDrive, localDriveRequest } from './localDriveLauncher';
import { installDocumentDriveStorage } from './documentDriveStorage';

vi.mock('../humanResources/hrDocumentDrive', () => ({ readHrDriveFile: vi.fn(), writeHrDriveFile: vi.fn() }));
vi.mock('./localDriveLauncher', async original => ({ ...await original<typeof import('./localDriveLauncher')>(), connectLocalDrive: vi.fn(), localDriveRequest: vi.fn() }));

const gatewayUrl = 'https://example.supabase.co/functions/v1/document-drive?ticket=verified';
const currentContent = 'Current authorized Drive file';
const wordMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function fixture({ mapped = true, denied = false, gatewayFailure = false } = {}) {
  const documentInfo = (path: string) => ({ drive_file_id: 'current-drive-file', mime_type: path.endsWith('.docx') ? wordMime : 'application/pdf',
    file_name: path.endsWith('.docx') ? 'current.docx' : 'current.pdf', bytes: currentContent.length, version: '117', chunkSize: 4194304 });
  const rpc = vi.fn().mockImplementation(async (_name: string, { target_path }: { target_path: string }) => {
    const info = documentInfo(target_path);
    return {
      data: mapped && !denied ? { drive_file_id: info.drive_file_id, mime_type: info.mime_type } : null,
      error: denied ? { code: '42501', message: 'Document inaccessible pour ce profil.' } : null,
    };
  });
  const invoke = vi.fn().mockImplementation(async (_name: string, { body }: { body: { operation: string; path: string; range?: { start: number; end: number } } }) => {
    const info = documentInfo(body.path);
    if (gatewayFailure) return { data: null, error: new Error('Le document Google Drive est indisponible.') };
    if (body.operation === 'info') return { data: info, error: null };
    if (body.operation === 'url') return { data: { signedUrl: gatewayUrl, document: info, chunkSize: info.chunkSize }, error: null };
    const { start, end } = body.range!;
    return { data: new Blob([currentContent.slice(start, end + 1)], { type: 'application/octet-stream' }), error: null,
      response: new Response(null, { status: 206, headers: {
        'Content-Range': `bytes ${start}-${end}/${info.bytes}`, 'Content-Length': String(end - start + 1),
        'X-Document-Drive-Id': info.drive_file_id, 'X-Document-Drive-Version': info.version,
        'X-Document-Drive-Bytes': String(info.bytes), 'X-Document-Drive-Mime': info.mime_type,
        'X-Document-Drive-Name': encodeURIComponent(info.file_name),
      } }) };
  });
  const legacy = {
    download: vi.fn().mockResolvedValue({ data: new Blob(['Deleted Storage copy']), error: null }),
    createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://storage.example/old.pdf' }, error: null }),
  };
  const client = { rpc, functions: { invoke }, storage: { from: vi.fn(() => legacy) } };
  installDocumentDriveStorage(client as never);
  return { client, rpc, invoke, legacy };
}

const hrDocument = { id: 17, drivePath: 'person/current.pdf', storageBucket: 'hr-documents', storagePath: 'old/file.pdf' } as HrDocumentRecord;
const source = { id: 31, googleDriveFileId: 'existing-source-id', googleDrivePath: 'URG/current-source.docx',
  storageBucket: 'procedure-documents', storagePath: 'sources/old.docx', fileName: 'procedure.docx', mimeType: wordMime } as ProcedureRecord;
const publication = { id: 42, procedureId: 31, status: 'published', googleDrivePath: 'Version D/current.pdf',
  storageBucket: 'procedure-documents', storagePath: 'published/old.pdf', fileName: 'published.pdf', mimeType: 'application/pdf' } as PublishedProcedureRecord;

beforeEach(() => {
  vi.mocked(readHrDriveFile).mockReset();
  vi.mocked(connectLocalDrive).mockReset();
  vi.mocked(localDriveRequest).mockReset();
});

describe('authenticated access to migrated HR and procedure files', () => {
  it('opens and downloads a migrated HR document through the gateway before consulting its Windows Drive path', async () => {
    const { client, invoke, legacy, rpc } = fixture();
    expect(await createHrDocumentSignedUrl(client as never, hrDocument)).toBe(gatewayUrl);
    expect(await (await downloadHrDocumentBlob(client as never, hrDocument)).text()).toBe(currentContent);
    expect(rpc).toHaveBeenCalledWith('document_drive_lookup', { target_bucket: 'hr-documents', target_path: hrDocument.storagePath });
    expect(invoke).toHaveBeenCalledWith('document-drive', expect.objectContaining({ body: {
      operation: 'download', bucket: 'hr-documents', path: hrDocument.storagePath,
      range: { start: 0, end: currentContent.length - 1 }, version: '117',
    } }));
    expect(readHrDriveFile).not.toHaveBeenCalled();
    expect(legacy.download).not.toHaveBeenCalled();
    expect(legacy.createSignedUrl).not.toHaveBeenCalled();
  });

  it('preserves the existing Windows reader for HR files without a verified migration mapping', async () => {
    const { client, invoke, legacy } = fixture({ mapped: false });
    const localContent = new Blob(['Verified local HR file']);
    vi.mocked(readHrDriveFile).mockResolvedValue(localContent);
    expect(await downloadHrDocumentBlob(client as never, hrDocument)).toBe(localContent);
    expect(readHrDriveFile).toHaveBeenCalledWith(client, hrDocument);
    expect(invoke).not.toHaveBeenCalled();
    expect(legacy.download).not.toHaveBeenCalled();
  });

  it.each([['source', source], ['published PDF', publication]] as const)(
    'reads a migrated procedure %s from the gateway without a Windows connection', async (_label, record) => {
      const { client, legacy } = fixture();
      const blob = await createProcedureFileStore(client as never).read(record);
      expect(await blob.text()).toBe(currentContent);
      expect(blob.type).toBe(record.mimeType);
      expect(connectLocalDrive).not.toHaveBeenCalled();
      expect(localDriveRequest).not.toHaveBeenCalled();
      expect(legacy.download).not.toHaveBeenCalled();
    },
  );

  it('routes migrated source download and preview through SeaPilot while preserving its desktop opening URI', async () => {
    const { client, invoke, legacy } = fixture();
    expect(await getProcedureFileUrl(client as never, source, 'download')).toBe(gatewayUrl);
    expect(await getProcedureFileUrl(client as never, source, 'preview')).toBe(gatewayUrl);
    expect(invoke).toHaveBeenCalledWith('document-drive', { body: {
      operation: 'url', bucket: 'procedure-documents', path: source.storagePath, expiresIn: 300, download: source.fileName,
    } });
    expect(await getProcedureFileUrl(client as never, source, 'open')).toBe(buildGoogleDriveDesktopUri(source.googleDrivePath!));
    expect(legacy.createSignedUrl).not.toHaveBeenCalled();
  });

  it('keeps source desktop opening on the existing native procedure command', async () => {
    const { client, invoke, rpc } = fixture();
    const connection = { version: '2.7.0', url: 'http://127.0.0.1/session', expiresAt: Date.now() + 60000 };
    vi.mocked(connectLocalDrive).mockResolvedValue(connection);
    vi.mocked(localDriveRequest).mockResolvedValue({});
    await createProcedureFileStore(client as never).open(source);
    expect(localDriveRequest).toHaveBeenCalledWith(client, connection, { action: 'open', module: 'procedures', procedureId: source.id });
    expect(rpc).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([
    ['denied', { denied: true }, 'Document inaccessible pour ce profil.'],
    ['gateway unavailable', { gatewayFailure: true }, 'Le document Google Drive est indisponible.'],
  ] as const)(
    'refuses migrated reader failures (%s) without reading a local file or historical Storage copy', async (_label, options, message) => {
      const { client, legacy } = fixture(options);
      await expect(createHrDocumentSignedUrl(client as never, hrDocument)).rejects.toMatchObject({ message });
      await expect(downloadHrDocumentBlob(client as never, hrDocument)).rejects.toMatchObject({ message });
      await expect(createProcedureFileStore(client as never).read(publication)).rejects.toMatchObject({ message });
      await expect(getProcedureFileUrl(client as never, source, 'download')).rejects.toMatchObject({ message });
      expect(readHrDriveFile).not.toHaveBeenCalled();
      expect(connectLocalDrive).not.toHaveBeenCalled();
      expect(localDriveRequest).not.toHaveBeenCalled();
      expect(legacy.createSignedUrl).not.toHaveBeenCalled();
      expect(legacy.download).not.toHaveBeenCalled();
    },
  );
});
