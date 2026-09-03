import { PDFDocument } from 'pdf-lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QHSE_REPORT_CATALOG, qhseReportFileName } from './qhseReportCatalog';
import {
  buildQhseReportContent, calculateFuelGhgTonnes, type QhseReportSnapshot,
} from './qhseReportData';
import { buildQhseReportPdf } from './qhseReportPdf';

function emptySnapshot(): QhseReportSnapshot {
  return {
    scope: { year: 2026, vesselId: 3, vesselName: 'GOURY' },
    actions: [], actionTypes: [], hseDashboard: null, reports: [], metrics: [], hseActions: [],
    exercises: [], portCalls: [], supplies: [], waste: [], incidents: [], certificates: [], visits: [],
    people: [], procedures: { procedures: [], publications: [] }, warnings: [],
  };
}

describe('QHSE report catalog and calculations', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  });

  it('maps every source page to a separate, stable PDF filename', () => {
    expect(QHSE_REPORT_CATALOG).toHaveLength(25);
    expect(new Set(QHSE_REPORT_CATALOG.map((report) => report.sourcePage)).size).toBe(25);
    const names = QHSE_REPORT_CATALOG.map((report) => qhseReportFileName(report, 2026, 'GOURY'));
    expect(new Set(names).size).toBe(25);
    expect(names[0]).toBe('01-sommaire-des-rapports-qhse-2026-goury.pdf');
  });

  it('reuses the reference GHG conversion without importing PBIX values', () => {
    expect(calculateFuelGhgTonnes(100)).toBeCloseTo(272.51, 5);
  });

  it('documents unavailable social-governance inputs instead of inventing a score', () => {
    const report = QHSE_REPORT_CATALOG.find((item) => item.id === 'social-governance')!;
    const content = buildQhseReportContent(report, emptySnapshot());
    expect(content.metrics.find((item) => item.label === 'Entretiens annuels')?.value).toBe('—');
    expect(content.notes.map((note) => note.title)).toContain('Discrimination et droits humains');
  });

  it('generates a valid landscape PDF for the source menu page', async () => {
    const report = QHSE_REPORT_CATALOG[0];
    const blob = await buildQhseReportPdf(report, emptySnapshot());
    const document = await PDFDocument.load(await blob.arrayBuffer());
    const [page] = document.getPages();
    expect(page.getWidth()).toBeGreaterThan(page.getHeight());
    expect(document.getTitle()).toBe(report.title);
    expect(document.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
