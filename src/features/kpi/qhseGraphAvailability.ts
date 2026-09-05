import { QHSE_REPORT_CATALOG } from './qhseReportCatalog';
import { buildQhseReportContent, type QhseReportOptions, type QhseReportSnapshot } from './qhseReportData';
import { buildConsumptionCharts } from './qhseConsumption';
import { scopeMaritimeSnapshot } from './qhseMaritimeReports';
import { QHSE_CHART_CONTROLS } from './qhseReportTrends';
export type QhseGraphAvailability = Record<string, { trend: boolean; forecast: boolean; reason: string }>;

/** Probe the existing generator's eligibility, without adding alternative statistical rules. */
export function qhseGraphAvailability(id: string, input: QhseReportSnapshot, options: QhseReportOptions): QhseGraphAvailability {
  const report = QHSE_REPORT_CATALOG.find((r) => r.id === id);
  if (!report) return {};
  const all = { water: true, fuel: true, emissions: true, xbee: true };
  const controls = QHSE_CHART_CONTROLS[id] || [];
  const probe = { ...options, trend: all, forecast: all, charts: Object.fromEntries(controls.map((c) => [c.key, { trend: c.trend, forecast: c.forecast }])) };
  const charts = id === 'consumption' ? buildConsumptionCharts(scopeMaritimeSnapshot(input, options), probe) : buildQhseReportContent(report, input, probe).charts;
  const keys = id === 'consumption' ? ['water', 'fuel', 'emissions', 'xbee'] : controls.map((c) => c.key);
  return Object.fromEntries(keys.map((key, index) => {
    const selected = id === 'consumption' ? [charts[Math.min(index, 2)]] : charts.filter((c) => c.id === key);
    const series = selected.flatMap((c) => c?.series || []).filter((s) => index < 2 || id !== 'consumption' || (key === 'xbee' ? !s.label.includes('sans') : s.label.includes('sans')));
    const trend = series.some((s) => s.trend && s.values.some((v) => v !== null));
    const forecast = series.some((s) => s.forecast && s.values.some((v) => v !== null));
    const control = controls.find((c) => c.key === key);
    const reason = control?.reason || [!trend ? 'Tendance : moins de 3 mois terminés suffisamment renseignés.' : '', !forecast ? 'Prévision : historique récent insuffisant, paramètres absents ou année passée.' : ''].filter(Boolean).join(' ');
    return [key, { trend, forecast, reason }];
  }));
}
