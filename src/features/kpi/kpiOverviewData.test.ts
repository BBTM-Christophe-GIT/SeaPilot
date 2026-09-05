import { describe, expect, it } from 'vitest';
import { buildKpiOverview, buildKpiSafetyChart } from './kpiOverviewData';
import type { QhseReportSnapshot } from './qhseReportData';
import { mapActionItemRows } from '../actionPlan/actionPlanQueries';
const options = { asOfDate: '2026-09-05' };
function snapshot(): QhseReportSnapshot {
  return { scope: { year: 2026, vesselId: null, vesselName: '' }, actions: [], actionTypes: [], hseDashboard: null, reports: [], metrics: [], hseActions: [], exercises: [], portCalls: [], supplies: [], waste: [], incidents: [], certificates: [], visits: [], people: [], hrDocuments: [], safetyEvents: [], exposureRecords: [], procedures: { procedures: [], publications: [] }, warnings: [] };
}
describe('Executive KPI integrity', () => {
  it('calculates weighted multi-year rates, not averages', () => {
    const data = snapshot(); data.scope.years = [2024, 2025]; data.scope.year = 2025;
    data.annualReferences = [2024, 2025].map((year, i) => ({ year, vesselId: null, workedHours: (i + 1) * 1000, personDays: 100, sourceLabel: 'Officiel' }));
    data.safetyEvents = [2024, 2025].map((year, i) => ({ id: i + 1, actionId: null, date: `${year}-05-01`, classification: 'LWDC', lostDays: 3, vesselId: 1, projectId: 144 }));
    const result = buildKpiOverview(data, options);
    expect(result.hours).toBe(3000); expect(result.tf).toBeCloseTo(2e6 / 3000); expect(result.tg).toBe(2);
    expect(buildKpiSafetyChart(data, 'tf', options).series.every((s) => s.values.every((v) => v === null))).toBe(true);
  });
  it('keeps absent project exposure and historical accident declarations unavailable', () => {
    const data = snapshot(); data.scope.projectIds = [144];
    data.exposureRecords = [{ date: '2026-01-01', hours: 100, population: 'offshore', personId: 1, vesselId: 1, projectId: null }];
    const result = buildKpiOverview(data, options); expect(result.tf).toBeNull(); expect(result.hours).toBeNull(); expect(result.renewals).toBeNull();
    expect(result.warnings.join(' ')).toContain('heures flotte ne sont pas utilisées');
  });
  it('does not show future or undocumented safety months as zero', () => {
    const data = snapshot(); data.exposureRecords = [{ date: '2026-01-01', hours: 100, actualHours: 100, population: 'offshore', personId: 1, vesselId: 1 }];
    const series = buildKpiSafetyChart(data, 'tf', options).series[0];
    expect(series.values[0]).toBe(0); expect(series.values.slice(1).every((v) => v === null)).toBe(true);
  });
  it('treats overdue actions as current stock, including prior years and excluding closed actions', () => {
    const data = snapshot(); data.actions = mapActionItemRows([{ id: 1, opened_on: '2024-01-01', due_on: '2025-01-01', status: 'open' }, { id: 2, opened_on: '2026-01-01', due_on: '2026-01-02', status: 'closed', closed_on: '2026-02-01' }] as never);
    const result = buildKpiOverview(data, options); expect(result.overdue).toBe(1); expect(result.open).toBe(1);
  });
});
