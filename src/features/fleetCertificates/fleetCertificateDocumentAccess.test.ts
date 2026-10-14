import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDocumentDriveStorage } from '../documents/documentDriveStorage';
import { downloadFleetCertificateDocuments, openFleetCertificateDocument, type FleetCertificateRecord } from './fleetCertificateQueries';

const bucket = 'fleet-certificates';
const insurancePath = '1/RZL/legacy/081-B-4-RZL-ASSURANCE-P-et-I-LE-ROZEL.pdf';
const hullPath = '1/RZL/legacy/082-RZL-H-et-M-2027.pdf';
const insuranceName = 'B-4-RZL - ASSURANCE P&I - LE ROZEL.pdf';
const files: Record<string, { name: string; content: string; driveId: string }> = {
  [insurancePath]: { name: insuranceName, content: 'Current Drive insurance PDF', driveId: 'rozel-insurance' },
  [hullPath]: { name: 'RZL - H&M - 2027.pdf', content: 'Current Drive hull PDF', driveId: 'rozel-hull' },
};

function certificate(path = insurancePath): FleetCertificateRecord {
  return {
    id: path === insurancePath ? 81 : 82, companyId: 1, vesselId: 7, vesselName: 'LE ROZEL', vesselAcronym: 'RZL',
    categoryKey: '04-assurance', categoryLabel: '04 - Assurance', documentTitle: 'ASSURANCE P&I - LE ROZEL',
    title: 'ASSURANCE P&I - LE ROZEL', status: 'valid', issuedOn: '', expiresOn: '2027-01-01', plannedOn: '', alarmOn: '',
    providerName: '', visitLocation: '', workflowStatus: 'not_started', renewalNotes: '', renamingRuleKey: '',
    originalFileName: files[path]?.name || 'photo.png', fileName: files[path]?.name || 'photo.png', sourceLabel: 'sharepoint-iqy',
    fileUrl: '', storageBucket: bucket, storagePath: path, mimeType: path.endsWith('.png') ? 'image/png' : 'application/pdf',
    fileSizeBytes: 71245, currentVersionNo: 1, isActiveFleet: true, notes: '', updatedAt: '',
  };
}

function fixture({ denied = false } = {}) {
  const rpc = vi.fn().mockImplementation(async (name: string, { target_path }: { target_path: string }) => {
    if (name === 'document_blob_lookup') return { data: null, error: null };
    const file = files[target_path];
    return {
      data: file && !denied ? { drive_file_id: file.driveId, mime_type: 'application/pdf' } : null,
      error: denied ? { code: '42501', message: 'Document inaccessible pour ce profil.' } : null,
    };
  });
  const invoke = vi.fn().mockImplementation(async (_name: string, { body }: { body: { operation: string; path: string; range?: { start: number; end: number } } }) => {
    const file = files[body.path];
    const info = { drive_file_id: file.driveId, mime_type: 'application/pdf', file_name: file.name,
      bytes: file.content.length, version: '117', chunkSize: 4194304 };
    if (body.operation === 'info') return { data: info, error: null };
    if (body.operation === 'url') return { data: { signedUrl: `https://example.supabase.co/functions/v1/document-drive?ticket=${file.driveId}`,
      document: info, chunkSize: info.chunkSize }, error: null };
    const { start, end } = body.range!;
    return { data: new Blob([file.content.slice(start, end + 1)], { type: 'application/octet-stream' }), error: null,
      response: new Response(null, { status: 206, headers: {
        'Content-Range': `bytes ${start}-${end}/${info.bytes}`, 'Content-Length': String(end - start + 1),
        'X-Document-Drive-Id': info.drive_file_id, 'X-Document-Drive-Version': info.version,
        'X-Document-Drive-Bytes': String(info.bytes), 'X-Document-Drive-Mime': info.mime_type,
        'X-Document-Drive-Name': encodeURIComponent(info.file_name),
      } }) };
  });
  const legacy = {
    createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://storage.example/photo.png' }, error: null }),
    download: vi.fn().mockResolvedValue({ data: new Blob(['Stored image'], { type: 'image/png' }), error: null }),
  };
  const client = { rpc, functions: { invoke }, storage: { from: vi.fn(() => legacy) } };
  installDocumentDriveStorage(client as never);
  return { client, invoke, legacy, rpc };
}

const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:https://seapilot.example/download');

beforeEach(() => {
  createObjectURL.mockClear();
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = vi.fn();
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fleet certificate access after the verified Drive migration', () => {
  it('opens the LE ROZEL insurance PDF through the gateway using its historical certificate reference', async () => {
    const { client, invoke, legacy, rpc } = fixture();
    await expect(openFleetCertificateDocument(client as never, certificate())).resolves.toBe(
      'https://example.supabase.co/functions/v1/document-drive?ticket=rozel-insurance',
    );
    expect(rpc).toHaveBeenCalledWith('document_drive_lookup', { target_bucket: bucket, target_path: insurancePath });
    expect(invoke).toHaveBeenCalledWith('document-drive', { body: { operation: 'url', bucket, path: insurancePath, expiresIn: 300 } });
    expect(legacy.createSignedUrl).not.toHaveBeenCalled();
  });

  it('downloads the migrated current PDF rather than requesting the deleted Storage object', async () => {
    const { client, invoke, legacy } = fixture();
    await downloadFleetCertificateDocuments(client as never, [certificate()]);
    const blob = createObjectURL.mock.calls[0][0];
    expect(await blob.text()).toBe(files[insurancePath].content);
    expect(blob.type).toBe('application/pdf');
    expect(invoke).toHaveBeenCalledWith('document-drive', expect.objectContaining({ body: {
      operation: 'download', bucket, path: insurancePath,
      range: { start: 0, end: files[insurancePath].content.length - 1 }, version: '117',
    } }));
    expect(legacy.download).not.toHaveBeenCalled();
  });

  it('includes both current Drive PDFs and their certificate filenames in a selected-document ZIP', async () => {
    const { client, legacy } = fixture();
    await downloadFleetCertificateDocuments(client as never, [certificate(), certificate(hullPath)]);
    const archive = await JSZip.loadAsync(await createObjectURL.mock.calls[0][0].arrayBuffer());
    expect(Object.keys(archive.files)).toEqual([insuranceName, files[hullPath].name]);
    expect(await archive.file(insuranceName)!.async('string')).toBe(files[insurancePath].content);
    expect(await archive.file(files[hullPath].name)!.async('string')).toBe(files[hullPath].content);
    expect(legacy.download).not.toHaveBeenCalled();
  });

  it('keeps an unmigrated certificate image on its native Storage reader', async () => {
    const { client, legacy, rpc, invoke } = fixture();
    const image = certificate('1/RZL/documents/photo.png');
    await expect(openFleetCertificateDocument(client as never, image)).resolves.toBe('https://storage.example/photo.png');
    await downloadFleetCertificateDocuments(client as never, [image]);
    expect(legacy.createSignedUrl).toHaveBeenCalledWith(image.storagePath, 300, undefined);
    expect(legacy.download).toHaveBeenCalledWith(image.storagePath, undefined, undefined);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.every(([name]) => name === 'document_blob_lookup')).toBe(true);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('preserves the mapped-file access refusal for preview and download without falling back to Storage', async () => {
    const { client, legacy, invoke } = fixture({ denied: true });
    await expect(openFleetCertificateDocument(client as never, certificate())).rejects.toThrow('Document inaccessible pour ce profil.');
    await expect(downloadFleetCertificateDocuments(client as never, [certificate()])).rejects.toThrow('Document inaccessible pour ce profil.');
    expect(legacy.createSignedUrl).not.toHaveBeenCalled();
    expect(legacy.download).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
