import type { SupabaseClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadSeaOperationDocuments } from './seaOperationDocumentDownloads';
import { loadSeaOperationProjectDocumentBlob, type SeaOperationProjectDocument } from './seaOperationDocumentQueries';
vi.mock('./seaOperationDocumentQueries', () => ({ loadSeaOperationProjectDocumentBlob: vi.fn() }));
const createUrl = vi.fn(); const revoke = vi.fn();
const client = {} as SupabaseClient;
const first: SeaOperationProjectDocument = { id: 'project:41', projectId: '501', title: 'Plan', fileName: 'plan.pdf', mimeType: 'application/pdf', categoryLabel: 'HSE', subcategoryLabel: '', createdAt: '', expiresOn: null };
beforeEach(() => {
  vi.clearAllMocks();
  const NativeUrl = URL; vi.stubGlobal('URL', class extends NativeUrl { static createObjectURL = createUrl.mockReturnValue('blob:sea-download'); static revokeObjectURL = revoke; });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Sea-authorized document downloads', () => {
  it('saves the exact original bytes after an explicit Sea authorization read', async () => {
    const blob = new Blob(['original private file']); vi.mocked(loadSeaOperationProjectDocumentBlob).mockResolvedValue(blob);
    const result = await downloadSeaOperationDocuments(client, '501', [first], 'plan.pdf');
    expect(result).toEqual({ count: 1, fileName: 'plan.pdf' });
    expect(loadSeaOperationProjectDocumentBlob).toHaveBeenCalledWith(client, '501', first, undefined, { allowLocalDrive: true });
    expect(createUrl).toHaveBeenCalledWith(blob);
  });

  it('builds a complete ZIP with original bytes, safe names and collision handling', async () => {
    const rows = [first, { ...first, id: 'project:42', fileName: 'plan.pdf' }, { ...first, id: 'project:43', fileName: '../../secret.txt' }];
    vi.mocked(loadSeaOperationProjectDocumentBlob).mockImplementation(async (_client, _project, file) => new Blob([file.id]));
    expect(await downloadSeaOperationDocuments(client, '501', rows, 'HSE.zip')).toEqual({ count: 3, fileName: 'HSE.zip' });
    const zip = await JSZip.loadAsync(await (createUrl.mock.calls[0][0] as Blob).arrayBuffer());
    expect(Object.keys(zip.files)).toEqual(['plan.pdf', 'plan (2).pdf', '..-..-secret.txt']);
    expect(await zip.file('plan.pdf')!.async('string')).toBe('project:41');
    expect(await zip.file('plan (2).pdf')!.async('string')).toBe('project:42');
    expect(await zip.file('..-..-secret.txt')!.async('string')).toBe('project:43');
  });

  it('never offers a partial archive when one role-gated file is denied', async () => {
    vi.mocked(loadSeaOperationProjectDocumentBlob).mockImplementation(async (_client, _project, file) => {
      if (file.id === 'project:42') throw new Error('Accès révoqué.'); return new Blob(['allowed']);
    });
    await expect(downloadSeaOperationDocuments(client, '501', [first, { ...first, id: 'project:42' }], 'documents.zip')).rejects.toThrow('Téléchargement annulé');
    expect(createUrl).not.toHaveBeenCalled();
    const controller = new AbortController(); controller.abort();
    await expect(downloadSeaOperationDocuments(client, '501', [first], 'documents.zip', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(createUrl).not.toHaveBeenCalled();
  });
});
