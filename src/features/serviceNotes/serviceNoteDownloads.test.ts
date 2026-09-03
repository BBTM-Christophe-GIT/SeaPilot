import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { buildServiceNoteDownloadArchive } from './serviceNoteDownloads';
import type { ServiceNote } from './serviceNoteQueries';

const note: ServiceNote = {
  id: 24, companyId: 1, chronologyCode: 'NS 07-26', subject: 'Mise à jour du DUP de KROKDUR', body: '',
  vesselId: null, vesselName: '', scope: 'vessels', targetVessels: [{ id: 4, name: 'KROKDUR' }], targetPersonIds: [],
  status: 'published', authorPersonId: 1, authorIdentitySnapshot: {}, authorSignatureSnapshot: null,
  authoredOn: '2026-09-03', publishedAt: '2026-09-03T08:46:28Z', sourceKind: 'seapilot', sourceFileName: '', sourceWebUrl: '',
  sourceModifiedAt: '', createdBy: 'user', createdAt: '2026-09-03T08:00:00Z', updatedAt: '2026-09-03T08:46:28Z',
  lastRecalledChronologyCode: '', recipients: [], signatures: [], attachments: [{
    id: 3, noteId: 24, kind: 'procedure', displayName: 'VPC 07-E - DUP KROKDUR',
    storageBucket: 'procedure-documents', storagePath: 'published/24/vpc-07-e.pdf', externalUrl: '', linkedRecordId: 65,
    mimeType: 'application/pdf', fileSizeBytes: 4, sortOrder: 0,
  }],
};

describe('service note downloads', () => {
  it('packages all original attachments in a single archive', async () => {
    const download = vi.fn().mockResolvedValue({ data: new Blob(['DUP'], { type: 'application/pdf' }), error: null });
    const client = { storage: { from: vi.fn(() => ({ download })) } } as never;

    const result = await buildServiceNoteDownloadArchive(client, note, false);
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());

    expect(result.filename).toBe('NS 07-26 - Mise a jour du DUP de KROKDUR - Pieces jointes.zip');
    expect(result.entries).toEqual(['Pieces jointes/VPC 07-E - DUP KROKDUR.pdf']);
    expect(await archive.file(result.entries[0])?.async('string')).toBe('DUP');
  });
});
