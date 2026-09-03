import { describe, expect, it } from 'vitest';
import { buildDprMigrationManifest, manifestSha256, selectDprManifestReports, selectMissingDprManifest, storageObjectPath, validateDprManifest } from './dprMigration.ts';

describe('DPR migration manifest', () => {
  const bundle = {
    exportedAt: '2026-07-22T12:00:00.000Z',
    sources: [
      {
        sourceKey: 'list-indicateurs-projet-p144emdt',
        items: [
          {
            id: 1056,
            fields: {
              ID: 1056,
              UniqueId: 'report-1056',
              Title: 'DPR-1056',
              DPR_x002d_Date: '2026-07-21T00:00:00Z',
              DPR_x002d_Projet: { LookupId: 28, LookupValue: 'Projet supprimé' },
              DPR_x002d_Navire: { LookupId: 12, LookupValue: 'GOURY' },
              DPR_x002d_DescriptionJourn_x00e9: 'Opérations en mer',
              DPR_x002d_ConsommationdeCarburan: '650,5',
              DPR_x002d_LEMS_x002d_TBT: false,
              DPR_x002d_LEMS_x002d_Th_x00e8_me: 'Exercice incendie',
              Author: { DisplayName: 'Pierre LEPRETRE' },
            },
          },
        ],
      },
      {
        sourceKey: 'library-dpr',
        items: [
          {
            id: 400,
            fields: {
              ID: 400,
              UniqueId: 'file-400',
              FileLeafRef: 'DPR-1056 - GOURY - 21-07-2026.pdf',
              FileRef: '/sites/QHSE/DPR/DPR-1056 - GOURY - 21-07-2026.pdf',
              File_x0020_Size: '1234',
              DPRId: 1056,
            },
          },
          {
            id: 401,
            fields: { ID: 401, FileLeafRef: 'temp.html', FileRef: '/sites/QHSE/DPR/temp.html' },
          },
        ],
      },
    ],
  };

  it('normalizes reports, lookups and files deterministically', () => {
    const manifest = buildDprMigrationManifest(bundle, new Date('2026-07-22T13:00:00.000Z'));
    expect(manifest.reports).toEqual([
      expect.objectContaining({
        sourceItemId: '1056',
        dprNumber: 1056,
        reportDate: '2026-07-21',
        projectSharePointItemId: '28',
        projectTitle: 'Projet supprimé',
        vesselSharePointItemId: '12',
        vesselName: 'GOURY',
        issuerName: 'Pierre LEPRETRE',
        fuelConsumedLiters: 650.5,
        hseActions: expect.objectContaining({ tbtPerformed: true, tbtTheme: 'Exercice incendie' }),
      }),
    ]);
    expect(manifest.files[0]).toEqual(expect.objectContaining({ kind: 'pdf', dprSharePointItemId: '1056', dprNumber: 1056, sizeBytes: 1234 }));
    expect(manifest.files[1]).toEqual(expect.objectContaining({ kind: 'excluded', exclusionReason: 'temporary-html' }));
    expect(manifest.counters).toEqual(expect.objectContaining({ reports: 1, pdfs: 1, excludedHtml: 1, reportsWithoutPdf: 0 }));
    expect(manifestSha256(manifest)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reports expected-volume mismatches instead of silently applying them', () => {
    const manifest = buildDprMigrationManifest(bundle);
    expect(validateDprManifest(manifest)).toEqual(expect.arrayContaining([
      'Expected 981 DPR reports, got 1.',
      'Expected 325 PDF files, got 1.',
      'Expected 15 excluded HTML files, got 1.',
      'Expected 10 non-PDF files, got 0.',
    ]));
  });

  it('builds a tenant-owned path from trusted target identifiers', () => {
    expect(storageObjectPath(1, 99, { sourceItemId: '400', fileName: 'DPR épreuve 1056.pdf' }))
      .toBe('company/1/dpr/99/400-DPR-epreuve-1056.pdf');
  });

  it('selects only missing DPRs and their directly related files', () => {
    const manifest = buildDprMigrationManifest(bundle);
    const selected = selectDprManifestReports(manifest, new Set(['1056']));

    expect(selected.reports.map((report) => report.sourceItemId)).toEqual(['1056']);
    expect(selected.files.map((file) => file.sourceItemId)).toEqual(['400']);
    expect(selected.counters).toEqual(expect.objectContaining({ reports: 1, filesDiscovered: 1, pdfs: 1, excludedHtml: 0 }));
  });

  it('returns an empty additive manifest when every DPR already exists', () => {
    const manifest = buildDprMigrationManifest(bundle);
    const selected = selectDprManifestReports(manifest, new Set());

    expect(selected.reports).toEqual([]);
    expect(selected.files).toEqual([]);
    expect(selected.counters).toEqual(expect.objectContaining({ reports: 0, filesDiscovered: 0, reportsWithoutPdf: 0 }));
  });

  it('treats an existing DPR number as present even without a SharePoint id', () => {
    const manifest = buildDprMigrationManifest(bundle);
    const selected = selectMissingDprManifest(manifest, new Set(), new Set([1056]));

    expect(selected.reports).toEqual([]);
    expect(selected.files).toEqual([]);
  });

  it('does not migrate historical PDFs in additive mode', () => {
    const manifest = buildDprMigrationManifest(bundle);
    const selected = selectMissingDprManifest(manifest, new Set(), new Set());

    expect(selected.reports.map((report) => report.sourceItemId)).toEqual(['1056']);
    expect(selected.files).toEqual([]);
    expect(selected.counters.pdfs).toBe(0);
  });
});
