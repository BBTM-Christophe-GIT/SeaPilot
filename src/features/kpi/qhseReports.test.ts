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

  it('uses the official Supabase annual history and marks missing accident data', () => {
    const snapshot = emptySnapshot();
    snapshot.scope = { year: 2025, years: [2023, 2024, 2025], vesselId: null, vesselIds: [], vesselName: '', vesselNames: [] };
    snapshot.annualReferences = [
      { year: 2023, vesselId: null, workedHours: 11454, personDays: 1091, sourceLabel: 'Historique officiel' },
      { year: 2024, vesselId: null, workedHours: 25883, personDays: 2394, sourceLabel: 'Historique officiel' },
      { year: 2025, vesselId: null, workedHours: 36230, personDays: 3448, sourceLabel: 'Historique officiel' },
    ];
    const report = QHSE_REPORT_CATALOG.find((item) => item.id === 'social-safety-1')!;
    const content = buildQhseReportContent(report, snapshot);
    expect(content.tables[0].rows.map((row) => row.slice(0, 3))).toEqual([
      ['2023', '11 454', '1 091'], ['2024', '25 883', '2 394'], ['2025', '36 230', '3 448'],
    ]);
    expect(content.tables[1].rows[0].slice(1)).toEqual(Array.from({ length: 9 }, () => '—'));
    expect(content.notes[0].title).toBe('Historique accidentologique incomplet');
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

  it('keeps each priority Power BI reproduction on one A4 portrait page', async () => {
    const ids = ['social-safety-1', 'social-safety-vessel', 'environment', 'port-call-tracking-v2', 'social-governance'];
    for (const id of ids) {
      const report = QHSE_REPORT_CATALOG.find((item) => item.id === id)!;
      const blob = await buildQhseReportPdf(report, emptySnapshot());
      const document = await PDFDocument.load(await blob.arrayBuffer());
      const [page] = document.getPages();
      expect(page.getHeight()).toBeGreaterThan(page.getWidth());
      expect(document.getPageCount(), id).toBe(1);
    }
  });
});
