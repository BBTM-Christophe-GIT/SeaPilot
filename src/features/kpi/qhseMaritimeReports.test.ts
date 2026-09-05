import { describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildQhseReportContent, collectQhsePages, type QhseReportChart, type QhseReportSnapshot } from './qhseReportData';
import { maritimeAnnualSafety, maritimeSafetyEvents, scopeMaritimeSnapshot } from './qhseMaritimeReports';
import { applyQhseChartOptions } from './qhseReportTrends';
import { QHSE_REPORT_CATALOG } from './qhseReportCatalog';
import { composeQhseReport, prepareQhseReport } from './qhseReportAssembly';
import { mapActionItemRows } from '../actionPlan/actionPlanQueries';

const options = { asOfDate: '2026-09-05' };
function snapshot(): QhseReportSnapshot {
  return { scope: { year: 2024, vesselId: null, vesselName: '' }, actions: [], actionTypes: [], hseDashboard: null, reports: [], metrics: [], hseActions: [], exercises: [], portCalls: [], supplies: [], waste: [], incidents: [], certificates: [], visits: [], people: [], hrDocuments: [], safetyEvents: [], exposureRecords: [], procedures: { procedures: [], publications: [] }, warnings: [] };
}
const reference = { year: 2024, vesselId: null, workedHours: 25883, personDays: 2394, sourceLabel: 'Historique officiel' };
const event = { id: 1, actionId: 10, date: '2024-05-01', classification: 'LWDC', lostDays: 10, vesselId: 1, projectId: 144 };
const report = (id: string) => QHSE_REPORT_CATALOG.find((r) => r.id === id)!;

describe('Maritime QHSE data integrity', () => {
  it('does not turn missing environmental declarations into zero', () => {
    const data = snapshot();
    expect(buildQhseReportContent(report('environment'), data, options).metrics.every((m) => m.value === '—')).toBe(true);
    data.reports = [{ id: 1, reportDate: '2024-05-01', vesselId: 1, projectId: null }] as never;
    data.metrics = [{ dprId: 1, fuelConsumedLiters: 0, fuelReported: true }] as never;
    data.supplies = [{ dprId: 1, waterM3: 0, waterReported: true }] as never;
    const content = buildQhseReportContent(report('environment'), data, options);
    expect(content.metrics[0].value).toBe('0 m³'); expect(content.metrics[1].value).toBe('0 m³');
    expect(content.metrics[2].value).toBe('—');
  });
  it('excludes empty DPR port-call sections while retaining incomplete declared stops', () => {
    const data = snapshot();
    data.reports = [{ id: 1, reportDate: '2024-05-01', vesselId: 1, projectId: null }] as never;
    const empty = { dprId: 1, arrivalAt: '', departureAt: '', portName: '', reasons: [] };
    data.portCalls = [empty, { ...empty, reasons: ['weather-standby'] }, { ...empty, arrivalAt: '2024-05-01T00:00:00Z', departureAt: '2024-05-01T14:00:00Z' }] as never;
    const content = buildQhseReportContent(report('port-call-tracking-v2'), data, options);
    expect(content.metrics[0].value).toBe('2'); expect(content.metrics[1].value).toBe('14 h'); expect(content.metrics[3].value).toBe('1');
    expect(content.tables.at(-1)?.rows).toHaveLength(2);
  });
  it('calculates annual rates from official hours, never the incomplete monthly registry', () => {
    const data = snapshot(); data.annualReferences = [reference]; data.safetyEvents = [event];
    data.exposureRecords = [{ date: '2024-05-01', hours: 11, population: 'offshore', personId: 1, vesselId: 1 }];
    const [row] = maritimeAnnualSafety(data, options);
    expect(row.hours).toBe(25883); expect(row.tf).toBeCloseTo(38.6354, 3); expect(row.tg).toBeCloseTo(.38635, 4);
    const content = buildQhseReportContent(report('social-safety-1'), data, options);
    expect(content.charts.every((c) => c.series[0].values.every((v) => v === null))).toBe(true);
  });
  it('counts fatalities once in LTI and TRIR, excluding FAC and commuting', () => {
    const data = snapshot(); data.annualReferences = [reference];
    data.safetyEvents = ['FAT', 'LWDC', 'MTC', 'RWC', 'FAC', 'COMMUTING'].map((classification, i) => ({ ...event, id: i + 1, actionId: i + 10, classification, lostDays: classification === 'LWDC' ? 10 : 0 }));
    const [row] = maritimeAnnualSafety(data, options);
    expect(row.lti).toBe(2); expect(row.tri).toBe(4); expect(row.far).toBeCloseTo(100_000_000 / 25883); expect(row.commuting).toBe(1);
  });
  it('deduplicates an event linked to an action and retains a standalone classified action', () => {
    const data = snapshot(); data.safetyEvents = [event];
    data.actions = mapActionItemRows([{ id: 10, action_type_key: 'lti', opened_on: '2024-05-01' }, { id: 11, action_type_key: 'lti', opened_on: '2024-06-01' }] as never);
    data.actionTypes = [{ key: 'lti', hseClassification: 'LWDC' }] as never;
    expect(maritimeSafetyEvents(data)).toHaveLength(2);
  });
  it('never allocates company-wide historical hours to selected projects or vessels', () => {
    const data = snapshot(); data.annualReferences = [reference]; data.safetyEvents = [event];
    data.scope.projectIds = [144];
    data.exposureRecords = [{ date: '2024-05-01', hours: 11, population: 'offshore', personId: 1, vesselId: 1, projectId: null }];
    const scoped = scopeMaritimeSnapshot(data, options); const [row] = maritimeAnnualSafety(scoped, options);
    expect(scoped.exposureRecords).toEqual([]); expect(row.hours).toBeNull(); expect(row.tf).toBeNull();
  });
  it('keeps missing historical accident declarations distinct from an observed current zero', () => {
    const data = snapshot(); data.scope = { ...data.scope, year: 2026, years: [2023, 2026] };
    data.annualReferences = [{ ...reference, year: 2023, workedHours: 11454 }];
    data.exposureRecords = [{ date: '2026-09-01', hours: 11, population: 'offshore', personId: 1, vesselId: 1 }];
    const rows = maritimeAnnualSafety(data, options);
    expect(rows[0].tf).toBeNull(); expect(rows[1].tf).toBe(0);
  });
  it('filters non-contiguous years, vessels, projects and future rows before calculations', () => {
    const data = snapshot(); data.scope = { ...data.scope, year: 2026, years: [2024, 2026], vesselIds: [1], projectIds: [144] };
    data.safetyEvents = [event, { ...event, id: 2, date: '2025-05-01' }, { ...event, id: 3, date: '2026-10-01' }, { ...event, id: 4, vesselId: 2 }, { ...event, id: 5, projectId: 145 }];
    expect(scopeMaritimeSnapshot(data, options).safetyEvents).toEqual([event]);
  });
  it('does not expose company-wide RH when project assignments are missing', () => {
    const data = snapshot(); data.scope.projectIds = [144]; data.people = [{ id: 1, hiredOn: '2023-01-01' }] as never;
    expect(scopeMaritimeSnapshot(data, options).people).toEqual([]);
    expect(buildQhseReportContent(report('training-plan'), data, options).metrics.every((m) => m.value === '—')).toBe(true);
  });
  it('paginates more than 1,000 records, preserving zeros, and propagates access failures', async () => {
    const rows = Array.from({ length: 1201 }, (_, id) => ({ id, hours: 0 }));
    const page = vi.fn(async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }));
    expect(await collectQhsePages(page)).toEqual(rows); expect(page).toHaveBeenCalledTimes(3);
    await expect(collectQhsePages(async () => ({ data: null, error: new Error('denied') }))).rejects.toThrow('denied');
  });
});

describe('Independent observed trends and future forecasts', () => {
  const chart: QhseReportChart = { id: 'test', title: 'Exercices', kind: 'bar', unit: 'nombre', labels: Array.from({ length: 12 }, (_, i) => String(i + 1)), periods: Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`), eligibleIndices: [0, 1, 2, 3, 4, 5, 6, 7], forecastAllowed: true, series: [{ label: 'Nombre', color: [24, 96, 174], values: [2, 3, 4, 5, 6, 7, 8, 9, 1, null, null, null] }] };
  it('adds an observed trend without changing values or forecasting', () => {
    const result = applyQhseChartOptions(chart, { ...options, charts: { test: { trend: true } } });
    expect(result.series[0]).toEqual(chart.series[0]); expect(result.series[1].trend).toBe(true);
    expect(result.series[1].values.slice(8)).toEqual([null, null, null, null]);
    expect(result.series.some((s) => s.forecast)).toBe(false);
  });
  it('uses the last three completed months only, never past gaps or the partial month', () => {
    const result = applyQhseChartOptions(chart, { ...options, charts: { test: { forecast: true } } });
    expect(result.series[1].values.slice(9)).toEqual([8, 8, 8]); expect(result.series[1].values[8]).toBeNull();
    expect(result.series[0]).toEqual(chart.series[0]); expect(result.series.some((s) => s.trend)).toBe(false);
  });
  it('does not create a forecast for sparse data, historical years or accident rates', () => {
    const selected = { ...options, charts: { test: { forecast: true } } };
    expect(applyQhseChartOptions({ ...chart, eligibleIndices: [0, 1] }, selected).series).toHaveLength(1);
    expect(applyQhseChartOptions({ ...chart, forecastAllowed: false }, selected).series).toHaveLength(1);
    expect(applyQhseChartOptions(chart, { ...selected, asOfDate: '2027-09-05' }).series).toHaveLength(1);
  });
});

describe('Exact report page assembly', () => {
  it('exports exactly one selected physical page or a subset with a regenerated contents page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const data = snapshot(); data.scope.years = [2024, 2025];
    const prepared = await prepareQhseReport([report('menu'), report('social-safety-1'), report('training-plan')], data, options);
    expect(prepared.pages.length).toBeGreaterThan(3);
    const selection = prepared.pages.find((p) => p.reportId === 'training-plan')!;
    expect((await PDFDocument.load(await (await composeQhseReport(prepared, [selection.id])).arrayBuffer())).getPageCount()).toBe(1);
    const blob = await composeQhseReport(prepared, [prepared.pages[0].id, selection.id]);
    expect((await PDFDocument.load(await blob.arrayBuffer())).getPageCount()).toBe(2);
    await expect(composeQhseReport(prepared, [])).rejects.toThrow('Sélectionnez');
  });
});
