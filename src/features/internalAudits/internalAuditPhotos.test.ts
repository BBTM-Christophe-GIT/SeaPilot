// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { AuditFinding } from './internalAuditModel';
import { addAuditFindingTreatment, saveAuditFinding } from './internalAuditQueries';
import { downloadAuditPhoto, getAuditPhotoUrl, hydrateAuditPhotoUrls, INTERNAL_AUDIT_PHOTO_BUCKET, photoReferences, uploadAuditPhotos, validateAuditPhotoFiles } from './internalAuditPhotos';

const actorId = '9c000000-0000-0000-0000-000000000001';
const scope = { companyId: 7, auditId: '9c300000-0000-0000-0000-000000000001', findingId: '9c400000-0000-0000-0000-000000000001', kind: 'finding' as const };
const png = (name = 'preuve.png') => new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], name, { type: 'image/png' });
const finding: AuditFinding = { id: scope.findingId, companyId: 7, auditId: scope.auditId, questionId: 'q1', reference: '1', severity: 'major', description: 'Écart', assigneePersonId: 42,
  assigneeRole: null, assigneeVesselId: null, assigneeLabel: 'Responsable', openedOn: '2026-10-01', dueOn: '2026-10-08', treatmentDelayValue: 1, treatmentDelayUnit: 'weeks', status: 'open', treatment: '', resolvedAt: null, closedAt: null, photos: [] };

function mockClient() {
  const upload = vi.fn().mockResolvedValue({ data: {}, error: null });
  const remove = vi.fn().mockImplementation(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null }));
  const createSignedUrls = vi.fn().mockImplementation(async (paths: string[]) => ({ data: paths.map((path) => ({ path, signedUrl: `https://signed.example/${path}` })), error: null }));
  const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.example/photo' }, error: null });
  const download = vi.fn().mockResolvedValue({ data: png(), error: null });
  const from = vi.fn().mockReturnValue({ upload, remove, createSignedUrls, createSignedUrl, download });
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: actorId } }, error: null });
  const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
  const client = { storage: { from }, auth: { getUser }, rpc } as unknown as SupabaseClient;
  return { client, upload, remove, createSignedUrls, createSignedUrl, download, from, getUser, rpc };
}

describe('private internal audit image evidence', () => {
  it('checks the image content before any upload, including a spoofed PNG', async () => {
    const mock = mockClient();
    await expect(uploadAuditPhotos(mock.client, scope, [png(), new File(['<svg></svg>'], 'faux.png', { type: 'image/png' })])).rejects.toThrow('ne correspond pas');
    expect(mock.upload).not.toHaveBeenCalled();
    expect(mock.getUser).not.toHaveBeenCalled();
  });

  it('rejects SVG, unsupported phone formats, oversized and empty files', async () => {
    await expect(validateAuditPhotoFiles([new File(['<svg/>'], 'photo.svg', { type: 'image/svg+xml' })])).rejects.toThrow('JPEG, PNG ou WebP');
    await expect(validateAuditPhotoFiles([new File(['heic'], 'photo.heic', { type: 'image/heic' })])).rejects.toThrow('JPEG, PNG ou WebP');
    await expect(validateAuditPhotoFiles([{ type: 'image/png', size: 10 * 1024 * 1024 + 1, name: 'large.png' } as File])).rejects.toThrow('10 Mo');
    await expect(validateAuditPhotoFiles([new File([], 'vide.png', { type: 'image/png' })])).rejects.toThrow('10 Mo');
    await expect(validateAuditPhotoFiles(Array.from({ length: 11 }, () => png()))).rejects.toThrow('10 photos');
  });

  it('uploads to the private audit/finding/actor path without replacing prior evidence', async () => {
    const mock = mockClient();
    const photos = await uploadAuditPhotos(mock.client, scope, [png()]);
    expect(mock.from).toHaveBeenCalledWith(INTERNAL_AUDIT_PHOTO_BUCKET);
    expect(photos[0].storagePath).toBe(`7/${scope.auditId}/${scope.findingId}/finding/${actorId}/${photos[0].id}.png`);
    expect(mock.upload).toHaveBeenCalledWith(photos[0].storagePath, expect.any(File), expect.objectContaining({ upsert: false, contentType: 'image/png' }));
    expect(photos[0].url).toBe('');
  });

  it('cleans only successful new uploads if a later upload fails', async () => {
    const mock = mockClient();
    const error = { message: 'Storage interrompu' };
    mock.upload.mockResolvedValueOnce({ data: {}, error: null }).mockResolvedValueOnce({ data: null, error });
    await expect(uploadAuditPhotos(mock.client, scope, [png('première.png'), png('seconde.png')])).rejects.toBe(error);
    expect(mock.remove).toHaveBeenCalledWith([mock.upload.mock.calls[0][0]]);
  });

  it('reports incomplete cleanup instead of hiding lost network state', async () => {
    const mock = mockClient();
    mock.upload.mockResolvedValueOnce({ data: {}, error: null }).mockResolvedValueOnce({ data: null, error: new Error('Upload interrompu') });
    mock.remove.mockResolvedValue({ data: null, error: new Error('Nettoyage refusé') });
    await expect(uploadAuditPhotos(mock.client, scope, [png(), png()])).rejects.toThrow('n’ont pas pu être nettoyées');
  });

  it('reports a possible committed RPC when RLS retains linked images without a Storage error', async () => {
    const mock = mockClient();
    mock.rpc.mockResolvedValue({ data: null, error: new Error('Réponse réseau perdue après validation') });
    mock.remove.mockResolvedValue({ data: [], error: null });
    await expect(saveAuditFinding(mock.client, finding, [png()])).rejects.toThrow('Rechargez l’audit');
    expect(mock.remove).toHaveBeenCalledWith([mock.upload.mock.calls[0][0]]);
  });

  it('cleans new finding uploads after RPC failure and preserves already saved references', async () => {
    const mock = mockClient();
    const error = { code: '42501', message: 'Écart inaccessible.' };
    mock.rpc.mockResolvedValue({ data: null, error });
    const oldPhoto = { id: 'old', fileName: 'ancien.png', storagePath: 'saved/path.png', mimeType: 'image/png', sizeBytes: 8, url: 'https://signed.example/old' };
    await expect(saveAuditFinding(mock.client, { ...finding, photos: [oldPhoto] }, [png()])).rejects.toBe(error);
    expect(mock.remove).toHaveBeenCalledWith([mock.upload.mock.calls[0][0]]);
    const sentPhotos = mock.rpc.mock.calls[0][1].p_payload.photos;
    expect(sentPhotos[0]).toEqual(photoReferences([oldPhoto])[0]);
    expect(sentPhotos[0]).not.toHaveProperty('url');
  });

  it('checks the server treatment scope before uploading for an assigned account', async () => {
    const mock = mockClient();
    const error = { code: '42501', message: 'Responsable non affecté' };
    mock.rpc.mockResolvedValue({ data: null, error });
    await expect(addAuditFindingTreatment(mock.client, scope.findingId, 'resolved', '', [png()])).rejects.toBe(error);
    expect(mock.upload).not.toHaveBeenCalled();
  });

  it('saves photo-only treatment after scoped upload and leaves its real actor to the server', async () => {
    const mock = mockClient();
    mock.rpc.mockResolvedValueOnce({ data: { company_id: 7, audit_id: scope.auditId }, error: null })
      .mockResolvedValueOnce({ data: { id: 'event', finding_id: scope.findingId, actor_id: actorId, actor_name: 'Capitaine réel', created_at: '2026-10-01T09:00:00Z', status: 'resolved', treatment: 'Photos ajoutées au traitement.', photos: [] }, error: null });
    const event = await addAuditFindingTreatment(mock.client, scope.findingId, 'resolved', '', [png()]);
    expect(mock.rpc.mock.calls[0]).toEqual(['internal_audit_photo_upload_scope', { p_finding_id: scope.findingId, p_kind: 'treatment' }]);
    expect(mock.upload.mock.calls[0][0]).toContain('/treatment/');
    expect(mock.rpc.mock.calls[1][1]).toMatchObject({ p_treatment: '', p_status: 'resolved', p_photos: [expect.objectContaining({ mimeType: 'image/png' })] });
    expect(event.actorName).toBe('Capitaine réel');
  });

  it('signs authorized references in one batch and never requests public URLs', async () => {
    const mock = mockClient();
    const photos = [{ id: '1', fileName: 'preuve.png', storagePath: 'private/photo.png', mimeType: 'image/png', sizeBytes: 8, url: '' }];
    await hydrateAuditPhotoUrls(mock.client, photos);
    expect(mock.createSignedUrls).toHaveBeenCalledWith(['private/photo.png'], 3600);
    expect(photos[0].url).toBe('https://signed.example/private/photo.png');
  });

  it('keeps audit data usable if photo signing is unavailable', async () => {
    const mock = mockClient();
    mock.createSignedUrls.mockResolvedValue({ data: null, error: new Error('Storage indisponible') });
    const photos = [{ id: '1', fileName: 'preuve.png', storagePath: 'private/photo.png', mimeType: 'image/png', sizeBytes: 8, url: '' }];
    await hydrateAuditPhotoUrls(mock.client, photos);
    expect(photos[0].url).toBe('');
  });

  it('refreshes signed URLs and downloads export images with the authenticated client', async () => {
    const mock = mockClient();
    const photo = { id: '1', fileName: 'preuve.png', storagePath: 'private/photo.png', mimeType: 'image/png', sizeBytes: 8, url: '' };
    expect(await getAuditPhotoUrl(mock.client, photo)).toBe('https://signed.example/photo');
    expect(await downloadAuditPhoto(mock.client, photo)).toBeInstanceOf(Blob);
    expect(mock.download).toHaveBeenCalledWith('private/photo.png');
  });
});
