import type { QhseReportChart, QhseReportOptions } from './qhseReportData';
import { consumptionCutoff } from './qhseConsumption';

export interface QhseChartControl { key: string; label: string; trend: boolean; forecast: boolean; reason?: string }
const temporal = (key: string, label: string, forecast = true): QhseChartControl => ({ key, label, trend: true, forecast,
  ...(!forecast ? { reason: 'Pas de prévision automatique des accidents ou des taux sécurité.' } : {}) });
const category = (key: string, label: string): QhseChartControl => ({ key, label, trend: false, forecast: false, reason: 'Répartition non chronologique : tendance et prévision sans objet.' });
export const QHSE_CHART_CONTROLS: Record<string, QhseChartControl[]> = {
  'social-safety-1': [temporal('safety-tf', 'TF / LTIFR mensuel', false), temporal('safety-tg', 'TG mensuel', false)],
  'social-safety-2': [category('safety-types', 'Typologie des événements'), category('safety-causes', 'Causes documentées')],
  'social-safety-vessel': [temporal('prevention-exercises', 'Exercices d’urgence'), temporal('prevention-tbt', 'Couverture des TBT', false)],
  environment: [temporal('environment-solid', 'Déchets solides'), temporal('environment-liquid', 'Déchets liquides')],
  'social-governance': [category('governance-contracts', 'Contrats'), category('governance-actions', 'Propositions par statut')],
  'port-call-tracking-v2': [temporal('port-hours', 'Durée mensuelle des escales'), category('port-reasons', 'Motifs des escales')],
  'hr-age-pyramid': [category('hr-ages', 'Tranches d’âge et genre')],
  'hr-management': [category('hr-functions', 'Fonctions'), category('hr-contracts', 'Contrats')],
  'training-plan': [{ key: 'training-expiries', label: 'Échéances de formation', trend: false, forecast: false, reason: 'Échéances déjà connues dans Supabase, et non une prévision statistique.' }],
};

/** Regression on complete observed monthly values; forecasts never alter source series or totals. */
export function applyQhseChartOptions(chart: QhseReportChart, options: QhseReportOptions): QhseReportChart {
  const selected = chart.id ? options.charts?.[chart.id] : undefined;
  if (!selected || !chart.periods) return chart;
  const cutoffMonth = consumptionCutoff(options).slice(0, 7);
  const currentYear = cutoffMonth.slice(0, 4);
  const eligible = (chart.eligibleIndices || []).filter((index) => chart.periods![index] < cutoffMonth);
  const result = { ...chart, series: [...chart.series] };
  if (selected.trend) {
    let created = false;
    chart.series.forEach((series) => {
      const points = eligible.flatMap((index) => series.values[index] !== null && Number.isFinite(series.values[index]) ? [{ x: index, y: series.values[index]! }] : []);
      if (points.length < 3) return;
      const mx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
      const my = points.reduce((sum, p) => sum + p.y, 0) / points.length;
      const slope = points.reduce((sum, p) => sum + (p.x - mx) * (p.y - my), 0) / points.reduce((sum, p) => sum + (p.x - mx) ** 2, 0);
      result.series.push({ ...series, label: `Tendance · ${series.label}`, trend: true, color: [170, 94, 22],
        values: chart.labels.map((_, index) => eligible.includes(index) ? Math.max(0, Math.min(chart.unit === '%' ? 100 : Infinity, my + slope * (index - mx))) : null) });
      created = true;
    });
    result.trendNote = created ? 'Tendance : régression sur les mois terminés suffisamment documentés ; losanges.' : 'Tendance indisponible : moins de 3 mois terminés suffisamment documentés.';
  }
  if (selected.forecast) {
    let created = false;
    if (chart.forecastAllowed) chart.series.forEach((series) => {
      const current = chart.periods!.indexOf(cutoffMonth);
      const prior = [current - 3, current - 2, current - 1];
      if (current < 3 || prior.some((index) => !eligible.includes(index) || series.values[index] === null)) return;
      const mean = prior.reduce((sum, index) => sum + series.values[index]!, 0) / 3;
      result.series.push({ ...series, label: `Prévision · ${series.label}`, forecast: true,
        values: chart.periods!.map((period, index) => index === current - 1 ? series.values[index] : period > cutoffMonth && period.startsWith(currentYear) ? mean : null) });
      created = true;
    });
    result.forecastNote = created ? 'Prévision : moyenne des 3 derniers mois complets, mois futurs uniquement ; pointillés. Estimation sans intervalle de confiance.' : chart.forecastAllowed ? 'Prévision indisponible : 3 derniers mois complets insuffisamment documentés, ou année passée.' : 'Prévision non pertinente pour cet indicateur.';
  }
  return result;
}
