import { Blob as ByteBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PublishedProcedureRecord } from '../procedures/procedureQueries';
import { readQhsePolicyDocument, readQhsePolicyPublication } from './qhsePolicyFiles';

const mocks = vi.hoisted(() => ({ publications: vi.fn(), url: vi.fn(), driveRead: vi.fn(), fetch: vi.fn() }));
vi.mock('../procedures/procedureQueries', () => ({ fetchPublishedProcedures: mocks.publications, getProcedureFileUrl: mocks.url }));
vi.mock('../procedures/procedureDriveFiles', () => ({ createProcedureFileStore: () => ({ read: mocks.driveRead }) }));
const client = {} as SupabaseClient;
const publication = { id: 46, title: 'POL 01-B - Politique', procedureCode: 'POL 01-B', status: 'published', ismChapter: '02', publishedOn: '2026-01-01', mimeType: 'application/pdf', fileName: 'politique.pdf' } as PublishedProcedureRecord;
const policy = new ByteBlob(['%PDF-1.7\n'], { type: 'application/pdf' });
beforeEach(() => {
  vi.clearAllMocks(); mocks.publications.mockResolvedValue([publication]); mocks.url.mockResolvedValue('https://storage.example.invalid/policy.pdf');
  mocks.fetch.mockResolvedValue({ ok: true, blob: async () => policy }); vi.stubGlobal('fetch', mocks.fetch); mocks.driveRead.mockResolvedValue(policy);
});
afterEach(() => vi.unstubAllGlobals());

describe('QHSE policy PDF bytes', () => {
  it('reads the latest chapter 02 publication for the default policy and retains its filename', async () => {
    mocks.publications.mockResolvedValue([publication, { ...publication, id: 47, publishedOn: '2026-02-01' }, { ...publication, id: 48, ismChapter: '03', publishedOn: '2026-03-01' }]);
    const result = await readQhsePolicyDocument(client, null);
    expect(result).toEqual({ blob: policy, title: 'POL 01-B - Politique', fileName: 'politique.pdf' });
    expect(mocks.url).toHaveBeenCalledWith(client, expect.objectContaining({ id: 47 }), 'open');
  });
  it('reads an explicit published PDF from any chapter and never substitutes an unavailable selection', async () => {
    mocks.publications.mockResolvedValue([{ ...publication, ismChapter: '03' }]);
    await expect(readQhsePolicyDocument(client, { publicationId: 46, documentUrl: '', revision: 1, updatedAt: '' })).resolves.toHaveProperty('blob', policy);
    await expect(readQhsePolicyDocument(client, { publicationId: 99, documentUrl: '', revision: 1, updatedAt: '' })).rejects.toThrow('Aucun PDF');
    await expect(readQhsePolicyDocument(client, { publicationId: null, documentUrl: 'https://drive.google.com/file/d/ABCDEF012345/view', revision: 1, updatedAt: '' })).rejects.toThrow('liste des fichiers PDF');
  });
  it('uses verified Drive reading and rejects unavailable or non-PDF source bytes', async () => {
    await expect(readQhsePolicyPublication(client, { ...publication, googleDrivePath: 'Politique.pdf' })).resolves.toBe(policy);
    expect(mocks.driveRead).toHaveBeenCalledWith(expect.objectContaining({ googleDrivePath: 'Politique.pdf' }));
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.fetch.mockResolvedValueOnce({ ok: false });
    await expect(readQhsePolicyPublication(client, publication)).rejects.toThrow('indisponible');
    mocks.fetch.mockResolvedValueOnce({ ok: true, blob: async () => new ByteBlob(['<html>Erreur</html>']) });
    await expect(readQhsePolicyPublication(client, publication)).rejects.toThrow('PDF valide');
  });
});
