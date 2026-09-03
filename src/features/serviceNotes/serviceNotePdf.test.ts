import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { ServiceNote } from './serviceNoteQueries';
import { buildServiceNotePdf } from './serviceNotePdf';

const note: ServiceNote = {
  id: 8, companyId: 1, chronologyCode: 'NS 08-26', subject: 'Consignes avant appareillage',
  body: 'Bonjour,\n\nMerci de prendre connaissance de cette note.\n\nBien cordialement,',
  vesselId: 1, vesselName: 'GOURY', scope: 'all_accounts', targetVessels: [], targetPersonIds: [], status: 'published', authorPersonId: 10,
  authorIdentitySnapshot: { display_name: 'Arthur DEMO' }, authorSignatureSnapshot: null,
  authoredOn: '2026-09-02', publishedAt: '2026-09-02T08:00:00Z', sourceKind: 'seapilot',
  sourceFileName: '', sourceWebUrl: '', sourceModifiedAt: '', createdBy: 'user-1',
  createdAt: '2026-09-02T07:00:00Z', updatedAt: '2026-09-02T08:00:00Z', lastRecalledChronologyCode: '',
  attachments: [{ id: 1, noteId: 8, kind: 'procedure', displayName: 'GEN 01-A - Manuel QHSE', storageBucket: '', storagePath: '', externalUrl: '/modules/procedures?document=1', linkedRecordId: 1, mimeType: '', fileSizeBytes: null, sortOrder: 0 }],
  recipients: [{ id: 20, noteId: 8, userId: 'user-2', personId: 12, firstName: 'Luc', lastName: 'MARTIN', functionLabel: 'Marin' }],
  signatures: [],
};

describe('service note PDF', () => {
  it('generates one multi-page PDF containing the common signature register', async () => {
    const logoBytes = new Uint8Array(await readFile(resolve('public/bbtm-service-note-logo.png')));
    const result = await buildServiceNotePdf({ note, logoBytes, authorSignature: null, recipientSignatures: new Map() });
    expect(result.filename).toBe('NS-08-26-Consignes-avant-appareillage.pdf');
    expect(result.blob.type).toBe('application/pdf');
    expect(result.blob.size).toBeGreaterThan(1_000);
    expect((await PDFDocument.load(await result.blob.arrayBuffer())).getPageCount()).toBe(2);
  });
});
