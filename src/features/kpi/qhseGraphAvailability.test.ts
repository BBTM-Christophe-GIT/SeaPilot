import { describe, expect, it } from 'vitest';
import { qhseGraphAvailability } from './qhseGraphAvailability';
import type { QhseReportSnapshot } from './qhseReportData';
function fixture(): QhseReportSnapshot {
  return { scope: { year: 2026, vesselId: null, vesselName: '' }, actions: [], actionTypes: [], hseDashboard: null, reports: [], metrics: [], hseActions: [], exercises: [], portCalls: [], supplies: [], waste: [], incidents: [], certificates: [], visits: [], people: [], hrDocuments: [], safetyEvents: [], exposureRecords: [], procedures: { procedures: [], publications: [] }, warnings: [] };
}
describe('Graph option eligibility', () => {
  it('does not offer trend or forecast for missing consumption histories', () => {
    const result = qhseGraphAvailability('consumption', fixture(), { asOfDate: '2026-09-05' });
    expect(Object.values(result).every((r) => !r.trend && !r.forecast && r.reason)).toBe(true);
  });
  it('offers a trend and a forecast separately only when the generator has sufficient history', () => {
    const data = fixture();
    for (let month = 6; month <= 8; month++) for (let day = 1; day <= new Date(2026, month, 0).getDate(); day++) {
      const id = data.reports.length + 1;
      data.reports.push({ id, reportDate: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, vesselId: 1, projectId: 144 } as never);
      data.metrics.push({ dprId: id, fuelConsumedLiters: 100, fuelReported: true } as never);
    }
    const result = qhseGraphAvailability('consumption', data, { asOfDate: '2026-09-05' });
    expect(result.fuel.trend).toBe(true); expect(result.fuel.forecast).toBe(true);
    expect(result.water.trend).toBe(false); expect(result.emissions.trend).toBe(false);
  });
  it('never offers statistical forecasting for known training expiry dates', () => {
    const result = qhseGraphAvailability('training-plan', fixture(), { asOfDate: '2026-09-05' });
    expect(result['training-expiries'].forecast).toBe(false); expect(result['training-expiries'].reason).toContain('déjà connues');
  });
});
