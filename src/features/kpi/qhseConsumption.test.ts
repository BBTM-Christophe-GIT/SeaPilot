import { PDFDocument } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { buildQhseReportContent, type QhseReportOptions, type QhseReportSnapshot } from './qhseReportData';
import { QHSE_REPORT_CATALOG } from './qhseReportCatalog';
import { buildQhseReportPdf } from './qhseReportPdf';

const REPORT = QHSE_REPORT_CATALOG.find((report) => report.id === 'consumption')!;
const OPTIONS: QhseReportOptions = { asOfDate: '2026-09-05', forecast: { water: true, fuel: true, emissions: true, xbee: true } };

function snapshot(): QhseReportSnapshot {
  const result: QhseReportSnapshot = {
    scope: { year: 2026, years: [2026], vesselId: 3, vesselName: 'GOURY', projectId: 144, projectName: 'P144' },
    actions: [], actionTypes: [], hseDashboard: null, reports: [], metrics: [], hseActions: [], exercises: [],
    portCalls: [], supplies: [], waste: [], incidents: [], certificates: [], visits: [], people: [], procedures: { procedures: [], publications: [] }, warnings: [],
    environmentParameters: [{ density: 0.85, emissionFactor: 3.206, directCombustionFactor: 2.85, xbeeReductionRate: 0.15, effectiveFrom: '2000-01-01', effectiveTo: '' }],
  };
  for (let day = Date.UTC(2026, 5, 1); day <= Date.UTC(2026, 8, 5); day += 86_400_000) {
    const date = new Date(day).toISOString().slice(0, 10);
    const id = result.reports.length + 1;
    result.reports.push({ id, reportDate: date, projectId: 144, projectLabel: 'P144', vesselId: 3, vesselName: 'GOURY' });
    result.metrics.push({ dprId: id, fuelConsumedLiters: 1000, fuelOnBoardLiters: 0, fuelReported: true });
    if (date.endsWith('-03')) result.supplies.push({ dprId: id, waterM3: 10, fuelM3: 0, oilLiters: 0, waterReported: true });
    if (date.endsWith('-20')) result.supplies.push({ dprId: id, waterM3: 20, fuelM3: 0, oilLiters: 0, waterReported: true });
  }
  return result;
}

describe('Consumption PDF observations and optional projections', () => {
  it('accumulates water at real DPR dates, holds plateaus and labels month ends without triangular monthly interpolation', () => {
    const source = snapshot();
    const [water] = buildQhseReportContent(REPORT, source, { asOfDate: OPTIONS.asOfDate }).charts;
    const values = water.series[0].values;
    const at = (date: string) => values[water.labels.indexOf(date)];
    expect(water.series[0].step).toBe(true);
    expect(at('06-03')).toBe(10);
    expect(at('06-19')).toBe(10);
    expect(at('06-20')).toBe(30);
    expect(at('06-30')).toBe(30);
    expect(at('07-01:reset')).toBe(0);
    expect(at('09-05')).toBe(10);
    expect(at('09-06')).toBeNull();
    expect(at('10-01')).toBeNull();
    expect(water.series[0].valueLabelIndices?.map((index) => water.labels[index])).toEqual(['06-30', '07-31', '08-31', '09-05']);
    expect(buildQhseReportContent(REPORT, source).metrics[0].value).toBe('100 m³');
  });

  it('keeps null water/fuel observations and entire missing months distinct from recorded zeroes', () => {
    const source = snapshot();
    source.supplies.forEach((row) => { row.waterReported = false; });
    source.metrics.forEach((row) => { row.fuelReported = false; });
    const content = buildQhseReportContent(REPORT, source, OPTIONS);
    expect(content.metrics[0].value).toBe('—');
    expect(content.metrics[1].value).toBe('—');
    expect(content.environmentalImpact).toBeUndefined();
    expect(content.charts.every((chart) => chart.series.every((series) => series.values.every((value) => value === null)))).toBe(true);
    source.supplies[0] = { ...source.supplies[0], waterReported: true, waterM3: 0 };
    const water = buildQhseReportContent(REPORT, source).charts[0];
    expect(water.series[0].values[water.labels.indexOf('06-03')]).toBe(0);
    expect(water.series[0].values[water.labels.indexOf('07-03')]).toBeNull();
  });

  it('predicts only future days, resets monthly quantities and derives GES/XBEE from the same fuel prediction', () => {
    const source = snapshot();
    const before = structuredClone(source);
    const actual = buildQhseReportContent(REPORT, source, { asOfDate: OPTIONS.asOfDate });
    const content = buildQhseReportContent(REPORT, source, OPTIONS);
    expect(content.metrics).toEqual(actual.metrics);
    expect(content.tables).toEqual(actual.tables);
    expect(content.environmentalImpact).toEqual(actual.environmentalImpact);
    expect(source).toEqual(before);
    const [water, fuel, ges] = content.charts;
    const projectedFuel = fuel.series.find((series) => series.forecast)!;
    expect(projectedFuel.values[fuel.labels.indexOf('09-04')]).toBeNull();
    expect(projectedFuel.values[fuel.labels.indexOf('09-05')]).toBe(5); // Anchor, not a new observation.
    expect(projectedFuel.values[fuel.labels.indexOf('09-06')]).toBe(6);
    expect(projectedFuel.values[fuel.labels.indexOf('10-01:reset')]).toBe(0);
    expect(projectedFuel.values[fuel.labels.indexOf('10-31')]).toBe(31);
    const projectedWater = water.series.find((series) => series.forecast)!;
    expect(projectedWater.values[water.labels.indexOf('10-31')]).toBeCloseTo(90 / 92 * 31);
    const forecasts = ges.series.filter((series) => series.forecast);
    const end = ges.labels.indexOf('12-31');
    expect(forecasts[0].values[end]).toBeCloseTo((97 + 117) * 2.85);
    expect(forecasts[1].values[end]).toBeCloseTo((97 + 117) * 2.85 * 0.85);
    expect(ges.series[0].values[ges.labels.indexOf('09-06')]).toBeNull();
  });

  it('defaults to observations only and toggles all four projections independently', () => {
    const source = snapshot();
    expect(buildQhseReportContent(REPORT, source).charts.every((chart) => chart.series.every((series) => !series.forecast))).toBe(true);
    for (const key of ['water', 'fuel', 'emissions', 'xbee'] as const) {
      const content = buildQhseReportContent(REPORT, source, { ...OPTIONS, forecast: { water: false, fuel: false, emissions: false, xbee: false, [key]: true } });
      expect(content.charts.flatMap((chart) => chart.series).filter((series) => series.forecast)).toHaveLength(1);
    }
  });

  it('refuses sparse history and never backfills old years or historical data gaps as forecasts', () => {
    const source = snapshot();
    source.reports = source.reports.filter((row) => !row.reportDate.startsWith('2026-07'));
    const sparse = buildQhseReportContent(REPORT, source, OPTIONS);
    expect(sparse.charts.every((chart) => chart.series.every((series) => !series.forecast))).toBe(true);
    expect(sparse.charts[0].forecastNote).toMatch(/insuffisants/);
    const historical = snapshot();
    historical.scope = { ...historical.scope, year: 2025, years: [2025] };
    historical.reports.forEach((row) => { row.reportDate = row.reportDate.replace('2026', '2025'); });
    const old = buildQhseReportContent(REPORT, historical, OPTIONS);
    expect(old.charts.every((chart) => chart.series.every((series) => !series.forecast))).toBe(true);
    expect(old.charts[0].forecastNote).toMatch(/année en cours/);
  });

  it('separates completed-month trends from predictions, including falling monthly GES despite rising annual totals', () => {
    const source = snapshot();
    for (const row of source.metrics) {
      const date = source.reports.find((report) => report.id === row.dprId)!.reportDate;
      const month = Number(date.slice(5, 7));
      row.fuelConsumedLiters = month === 6 ? 3000 : month === 7 ? 2000 : month === 8 ? 1000 : 100000;
    }
    const actual = buildQhseReportContent(REPORT, source, { asOfDate: OPTIONS.asOfDate });
    const flags = { water: true, fuel: true, emissions: true, xbee: true };
    const content = buildQhseReportContent(REPORT, source, { asOfDate: OPTIONS.asOfDate, trend: flags });
    expect(content.charts.flatMap((chart) => chart.series).filter((series) => series.trend)).toHaveLength(4);
    expect(content.charts.flatMap((chart) => chart.series).some((series) => series.forecast)).toBe(false);
    expect(content.metrics).toEqual(actual.metrics);
    expect(content.tables).toEqual(actual.tables);
    expect(content.environmentalImpact).toEqual(actual.environmentalImpact);
    const fuel = content.charts[1];
    const trend = fuel.series.find((series) => series.trend)!;
    const first = trend.values[fuel.labels.indexOf('06-15')]!;
    const last = trend.values[fuel.labels.indexOf('08-15')]!;
    expect(first).toBeCloseTo(90.5);
    expect(last).toBeCloseTo(31.5);
    expect(trend.values[fuel.labels.indexOf('09-15')]).toBeNull();
    expect(trend.values[fuel.labels.indexOf('12-15')]).toBeNull();
    const ges = content.charts[2].series.filter((series) => series.trend);
    expect(ges.every((series) => series.axis === 'right')).toBe(true);
    expect(ges[0].values[fuel.labels.indexOf('08-15')]).toBeCloseTo(last * 2.85);
    expect(ges[1].values[fuel.labels.indexOf('08-15')]).toBeCloseTo(last * 2.85 * 0.85);
    for (const key of ['water', 'fuel', 'emissions', 'xbee'] as const) {
      const independent = buildQhseReportContent(REPORT, source, { ...OPTIONS, trend: { water: false, fuel: false, emissions: false, xbee: false, [key]: true } });
      expect(independent.charts.flatMap((chart) => chart.series).filter((series) => series.trend)).toHaveLength(1);
      expect(independent.charts.flatMap((chart) => chart.series).filter((series) => series.forecast)).toHaveLength(4);
    }
  });

  it('does not fit trends to insufficient months and allows descriptive trends on historical years', () => {
    const source = snapshot();
    const options = { ...OPTIONS, trend: { water: true, fuel: true, emissions: true, xbee: true } };
    source.reports = source.reports.filter((report) => !report.reportDate.startsWith('2026-07'));
    const sparse = buildQhseReportContent(REPORT, source, options);
    expect(sparse.charts.every((chart) => chart.series.every((series) => !series.trend))).toBe(true);
    expect(sparse.charts[1].trendNote).toMatch(/indisponible/);
    const historical = snapshot();
    historical.scope = { ...historical.scope, year: 2025, years: [2025] };
    historical.reports.forEach((row) => { row.reportDate = row.reportDate.replace('2026', '2025'); });
    const content = buildQhseReportContent(REPORT, historical, options);
    expect(content.charts.flatMap((chart) => chart.series).filter((series) => series.trend)).toHaveLength(4);
    expect(content.charts.flatMap((chart) => chart.series).some((series) => series.forecast)).toBe(false);
  });

  it('applies project/vessel/date filters before actuals and prediction training', () => {
    const source = snapshot();
    source.reports.push({ ...source.reports[0], id: 9999, projectId: 145 });
    source.metrics.push({ dprId: 9999, fuelConsumedLiters: 1e9, fuelOnBoardLiters: 0 });
    source.reports.push({ ...source.reports[0], id: 9998, reportDate: '2026-10-01' });
    source.metrics.push({ dprId: 9998, fuelConsumedLiters: 1e9, fuelOnBoardLiters: 0 });
    const content = buildQhseReportContent(REPORT, source, OPTIONS);
    expect(content.metrics[1].value).toBe('97 m³');
    const prediction = content.charts[1].series.find((series) => series.forecast)!;
    expect(prediction.values[content.charts[1].labels.indexOf('10-31')]).toBe(31);
  });

  it('exports one page per year plus a comparison, keeping forecasts in the same report PDF', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const source = snapshot();
    source.scope.years = [2025, 2026];
    const blob = await buildQhseReportPdf(REPORT, source, { ...OPTIONS, trend: { water: true, fuel: true, emissions: true, xbee: true } });
    const pdf = await PDFDocument.load(await blob.arrayBuffer());
    expect(pdf.getPageCount()).toBe(3);
    expect(pdf.getPages().every((page) => page.getHeight() > page.getWidth())).toBe(true);
  });
});
