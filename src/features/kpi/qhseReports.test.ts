import { PDFDocument } from 'pdf-lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QHSE_REPORT_CATALOG, qhseReportFileName } from './qhseReportCatalog';
import {
  buildQhseReportContent, calculateDirectFuelCo2eTonnes, calculateFuelGhgTonnes, type QhseReportSnapshot,
} from './qhseReportData';
import { buildQhseReportPdf, fitImageWithinBox, sanitizeQhsePdfText } from './qhseReportPdf';

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
    expect(QHSE_REPORT_CATALOG.map((report) => report.sourcePage)).toEqual([1, 4, 5, 6, 7, 8, 12, 20, 21, 25]);
    expect(QHSE_REPORT_CATALOG.map((report) => report.pageNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(QHSE_REPORT_CATALOG).toHaveLength(10);
    expect(new Set(QHSE_REPORT_CATALOG.map((report) => report.pageNumber)).size).toBe(10);
    const names = QHSE_REPORT_CATALOG.map((report) => qhseReportFileName(report, 2026, 'GOURY'));
    expect(new Set(names).size).toBe(10);
    expect(names[0]).toBe('01-sommaire-des-rapports-qhse-2026-goury.pdf');
    expect(names.at(-1)).toBe('10-rse-consommations-par-projet-2026-goury.pdf');
  });

  it('keeps the report logo proportions and removes the product name from PDF copy', () => {
    expect(fitImageWithinBox(500, 500, 25, 13)).toEqual({ width: 13, height: 13 });
    expect(fitImageWithinBox(1000, 500, 20, 20)).toEqual({ width: 20, height: 10 });
    expect(sanitizeQhsePdfText('Données SeaPilot · SeaPilot · CO₂')).toBe('Données Supabase · Supabase · CO2');
  });

  it('builds page 25 fuel consumption and emissions from the DPR consumption field', () => {
    const snapshot = emptySnapshot();
    snapshot.scope = {
      year: 2025, years: [2024, 2025], vesselId: null, vesselIds: [], vesselName: '', vesselNames: [],
      projectId: 1, projectIds: [1], projectName: 'P144', projectNames: ['P144'],
    };
    snapshot.reports = [
      { id: 1, reportDate: '2024-01-10', projectId: 1, projectLabel: 'P144', vesselId: 3, vesselName: 'GOURY' },
      { id: 2, reportDate: '2024-02-10', projectId: 1, projectLabel: 'P144', vesselId: 3, vesselName: 'GOURY' },
      { id: 3, reportDate: '2025-01-10', projectId: 1, projectLabel: 'P144', vesselId: 3, vesselName: 'GOURY' },
    ];
    snapshot.supplies = [
      { dprId: 1, fuelM3: 10, oilLiters: 0, waterM3: 4 },
      { dprId: 2, fuelM3: 5, oilLiters: 0, waterM3: 6 },
      { dprId: 3, fuelM3: 7, oilLiters: 0, waterM3: 8 },
    ];
    snapshot.metrics = [
      { dprId: 1, fuelConsumedLiters: 100_000, fuelOnBoardLiters: 0 },
      { dprId: 2, fuelConsumedLiters: 50_000, fuelOnBoardLiters: 0 },
      { dprId: 3, fuelConsumedLiters: 200_000, fuelOnBoardLiters: 0 },
    ];
    snapshot.environmentParameters = [{ density: 0.85, emissionFactor: 3.206, directCombustionFactor: 2.85, xbeeReductionRate: 0.15, effectiveFrom: '2000-01-01', effectiveTo: '' }];
    const report = QHSE_REPORT_CATALOG.find((item) => item.id === 'consumption')!;
    const content = buildQhseReportContent(report, snapshot);

    expect(content.charts).toHaveLength(3);
    expect(content.charts[0].series[0].values.slice(0, 4)).toEqual([0, 4, 0, 6]);
    expect(content.charts[1].title).toBe('Consommation de fuel cumulée par mois');
    expect(content.charts[1].monthTicks?.map((tick) => tick.label)).toEqual([
      'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
    ]);
    expect(content.charts[1].series.map((series) => series.label)).toEqual(['2024', '2025']);
    const fuelChart = content.charts[1];
    expect(fuelChart.series[0].valueLabelIndices?.map((index) => fuelChart.series[0].values[index])).toEqual([100, 50]);
    expect(fuelChart.series[1].valueLabelIndices?.map((index) => fuelChart.series[1].values[index])).toEqual([200]);
    expect(fuelChart.series[0].values[fuelChart.labels.indexOf('01-10')]).toBe(100);
    expect(fuelChart.series[1].values[fuelChart.labels.indexOf('01-10')]).toBe(200);
    expect(content.charts[1].series[0].values).not.toContain(10);
    expect(content.charts[2].series[0].values[0]).toBeCloseTo(285, 3);
    expect(content.charts[2].series[0].values[1]).toBeCloseTo(427.5, 3);
    expect(content.charts[2].series[1].color).toEqual([11, 153, 73]);
    expect(content.charts[2].series[1].values[1]).toBeCloseTo(363.375, 3);
    expect(content.charts[2].series[1].values[12]).toBeCloseTo(484.5, 3);
    expect(content.tables[0].rows).toEqual([
      ['2024', '10 m³', '150 m³', '427,5 tCO₂e', '363,38 tCO₂e', '64,13 tCO₂e'],
      ['2025', '8 m³', '200 m³', '570 tCO₂e', '484,5 tCO₂e', '85,5 tCO₂e'],
    ]);
    expect(content.environmentalImpact?.emittedTonnes).toBeCloseTo(847.875);
    expect(content.environmentalImpact?.avoidedTonnes).toBeCloseTo(149.625);
    expect(content.environmentalImpact?.baselineTonnes).toBeCloseTo(997.5);
    expect(content.notes).toEqual([]);
  });

  it('keeps real leap-day and zero-consumption DPRs distinct from missing daily data', () => {
    const snapshot = emptySnapshot();
    snapshot.scope = { ...snapshot.scope, year: 2024 };
    snapshot.reports = [
      { id: 1, reportDate: '2024-02-29', projectId: 1, projectLabel: 'P144', vesselId: 3, vesselName: 'GOURY' },
      { id: 2, reportDate: '2024-02-29', projectId: 2, projectLabel: 'P145', vesselId: 3, vesselName: 'GOURY' },
      { id: 3, reportDate: '2024-03-01', projectId: 1, projectLabel: 'P144', vesselId: 3, vesselName: 'GOURY' },
    ];
    snapshot.metrics = [
      { dprId: 1, fuelConsumedLiters: 500, fuelOnBoardLiters: 0 },
      { dprId: 2, fuelConsumedLiters: 250, fuelOnBoardLiters: 0 },
      { dprId: 3, fuelConsumedLiters: 0, fuelOnBoardLiters: 0 },
    ];
    const report = QHSE_REPORT_CATALOG.find((item) => item.id === 'consumption')!;
    const content = buildQhseReportContent(report, snapshot);
    const chart = content.charts[1];
    expect(chart.series[0].values[chart.labels.indexOf('02-29')]).toBe(0.75);
    expect(chart.series[0].values[chart.labels.indexOf('03-01')]).toBe(0);
    expect(chart.series[0].values[chart.labels.indexOf('03-02')]).toBeNull();
    expect(chart.monthTicks).toHaveLength(12);
    expect(content.environmentalImpact).toBeUndefined();
    expect(content.notes[0].title).toBe('Paramètres environnementaux absents');
  });

  it('reuses the reference GHG conversion without importing PBIX values', () => {
    expect(calculateFuelGhgTonnes(100)).toBeCloseTo(272.51, 5);
    expect(calculateDirectFuelCo2eTonnes(10, 2.85)).toBe(28.5);
  });

  it('accumulates daily fuel within each month, resets at its boundary and labels the monthly total', () => {
    const snapshot = emptySnapshot();
    snapshot.scope = { ...snapshot.scope, year: 2024 };
    const days = ['2024-01-01', '2024-01-02', '2024-01-31', '2024-02-01', '2024-02-29', '2024-03-01'];
    snapshot.reports = days.map((date, index) => ({ id: index + 1, reportDate: date, projectId: 1, projectLabel: 'P144', vesselId: 3, vesselName: 'GOURY' }));
    snapshot.metrics = [1000, 2000, 500, 4000, 250, 0].map((liters, index) => ({ dprId: index + 1, fuelConsumedLiters: liters, fuelOnBoardLiters: 0 }));
    const report = QHSE_REPORT_CATALOG.find((item) => item.id === 'consumption')!;
    const chart = buildQhseReportContent(report, snapshot).charts[1];
    const valueAt = (date: string) => chart.series[0].values[chart.labels.indexOf(date)];
    expect(valueAt('01-01:reset')).toBe(0);
    expect(valueAt('01-01')).toBe(1);
    expect(valueAt('01-02')).toBe(3);
    expect(valueAt('01-03')).toBe(3); // No additional DPR: the recorded cumulative sum holds.
    expect(valueAt('01-31')).toBe(3.5);
    expect(valueAt('02-01:reset')).toBe(0);
    expect(valueAt('02-01')).toBe(4);
    expect(valueAt('02-29')).toBe(4.25);
    expect(valueAt('03-01')).toBe(0);
    expect(valueAt('03-02')).toBeNull(); // Future dates beyond the latest DPR stay empty.
    expect(valueAt('04-01:reset')).toBeNull(); // A whole month without DPRs is not presented as zero.
    expect(chart.pointPositions?.[chart.labels.indexOf('01-31')]).toBe(chart.pointPositions?.[chart.labels.indexOf('02-01:reset')]);
    const endIndices = chart.series[0].valueLabelIndices!;
    expect(endIndices.map((index) => chart.labels[index])).toEqual(['01-31', '02-29', '03-01']);
    expect(endIndices.map((index) => chart.series[0].values[index])).toEqual([3.5, 4.25, 0]);
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
    expect(document.getSubject()).not.toContain('SeaPilot');
    expect(document.getAuthor()).toBe('BBTM');
    expect(document.getCreator()).toBe('BBTM');
    expect(document.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('keeps each priority Power BI reproduction on one A4 portrait page', async () => {
    const ids = ['social-safety-1', 'social-safety-vessel', 'environment', 'port-call-tracking-v2', 'social-governance', 'consumption'];
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
