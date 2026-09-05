import type { QhseReportChart, QhseReportOptions, QhseReportSnapshot } from './qhseReportData';

const BLUE: [number, number, number] = [24, 96, 174];
const GREEN: [number, number, number] = [11, 153, 73];
const GREY: [number, number, number] = [112, 119, 127];
const TREND: [number, number, number] = [157, 83, 20];
const DAY = 86_400_000;

export function consumptionCutoff(options: QhseReportOptions = {}): string {
  return options.asOfDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function consumptionYears(snapshot: QhseReportSnapshot): number[] {
  return [...new Set(snapshot.scope.years?.length ? snapshot.scope.years : [snapshot.scope.year])].sort((a, b) => a - b);
}

export function consumptionYearSnapshot(snapshot: QhseReportSnapshot, year: number, cutoff: string): QhseReportSnapshot {
  const vesselIds = snapshot.scope.vesselIds?.length ? snapshot.scope.vesselIds : snapshot.scope.vesselId === null ? [] : [snapshot.scope.vesselId];
  const projectIds = snapshot.scope.projectIds?.length ? snapshot.scope.projectIds : snapshot.scope.projectId ? [snapshot.scope.projectId] : [];
  const reports = snapshot.reports.filter((report) => report.reportDate.startsWith(`${year}-`) && report.reportDate.slice(0, 10) <= cutoff
    && (!vesselIds.length || (report.vesselId !== null && vesselIds.includes(report.vesselId)))
    && (!projectIds.length || (report.projectId !== null && projectIds.includes(report.projectId))));
  const ids = new Set(reports.map((report) => report.id));
  return {
    ...snapshot, scope: { ...snapshot.scope, year, years: [year] }, reports,
    metrics: snapshot.metrics.filter((row) => ids.has(row.dprId)), supplies: snapshot.supplies.filter((row) => ids.has(row.dprId)),
  };
}

function calendar(years: number[]) {
  const leap = years.some((year) => new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1);
  const days = Array.from({ length: leap ? 366 : 365 }, (_, index) => new Date(Date.UTC(leap ? 2000 : 2001, 0, index + 1)));
  return days.flatMap((day, index) => {
    const point = { monthDay: day.toISOString().slice(5, 10), month: day.getUTCMonth(), reset: false, position: (index + 1) / days.length };
    return day.getUTCDate() === 1 ? [{ ...point, reset: true, position: index / days.length }, point] : [point];
  });
}

type Points = ReturnType<typeof calendar>;
type Series = QhseReportChart['series'][number];

function dailyTotals(snapshot: QhseReportSnapshot, kind: 'water' | 'fuel') {
  const reports = new Map(snapshot.reports.map((row) => [row.id, row.reportDate.slice(0, 10)]));
  const totals = new Map<string, number>();
  const rows = kind === 'fuel'
    ? snapshot.metrics.filter((row) => row.fuelReported !== false).map((row) => ({ id: row.dprId, value: row.fuelConsumedLiters }))
    : snapshot.supplies.filter((row) => row.waterReported !== false).map((row) => ({ id: row.dprId, value: row.waterM3 * 1000 }));
  rows.forEach((row) => {
    const date = reports.get(row.id);
    if (date && Number.isFinite(row.value) && row.value >= 0) totals.set(date, (totals.get(date) || 0) + row.value);
  });
  return totals;
}

function monthLabels(points: Points, values: Array<number | null>) {
  return Array.from({ length: 12 }, (_, month) => points.reduce((last, point, index) => point.month === month && !point.reset && values[index] !== null ? index : last, -1)).filter((index) => index >= 0);
}

function observations(points: Points, totals: Map<string, number>, year: number, annual: boolean, coverageEnd = ''): Array<number | null> {
  const dates = [...totals.keys()].sort();
  const last = dates.length ? coverageEnd || dates.at(-1)! : '';
  const months = new Set(dates.map((date) => date.slice(0, 7)));
  const leap = new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1;
  let sum = 0;
  return points.map((point) => {
    if (point.reset && !annual) sum = 0;
    const date = `${year}-${point.monthDay}`;
    if (!leap && point.monthDay === '02-29') return null;
    if (!point.reset) sum += totals.get(date) || 0;
    if (date > last || !months.has(date.slice(0, 7))) return null;
    return sum / 1000;
  });
}

function forecastRate(snapshot: QhseReportSnapshot, totals: Map<string, number>, cutoff: string, water: boolean): number | null {
  const year = snapshot.scope.year;
  const currentMonth = Number(cutoff.slice(5, 7)) - 1;
  if (year !== Number(cutoff.slice(0, 4)) || currentMonth < 3) return null;
  const reportDates = new Set(snapshot.reports.map((report) => report.reportDate.slice(0, 10)));
  let quantity = 0;
  let calendarDays = 0;
  // Use the three immediately preceding complete calendar months, never cherry-pick old months.
  for (let month = currentMonth - 3; month < currentMonth; month += 1) {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const entries = [...totals.entries()].filter(([date]) => date.startsWith(prefix));
    const coverage = water ? [...reportDates].filter((date) => date.startsWith(prefix)).length : entries.length;
    // Water is event-based, so require DPR coverage plus at least one explicit water quantity (including zero).
    if (coverage / days < 0.8 || !entries.length) return null;
    quantity += entries.reduce((sum, [, value]) => sum + value, 0);
    calendarDays += days;
  }
  return quantity / 1000 / calendarDays;
}

/** Descriptive OLS on completed monthly totals, never on rising annual cumulative values. */
function monthlyTrend(points: Points, snapshot: QhseReportSnapshot, totals: Map<string, number>, cutoff: string, water: boolean): Array<number | null> | null {
  const year = snapshot.scope.year;
  const reportDates = new Set(snapshot.reports.map((report) => report.reportDate.slice(0, 10)));
  const months = Array.from({ length: 12 }, (_, month) => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const entries = [...totals.entries()].filter(([date]) => date.startsWith(prefix));
    const coverage = water ? [...reportDates].filter((date) => date.startsWith(prefix)).length : entries.length;
    if (`${prefix}${days}` >= cutoff || !entries.length || coverage / days < 0.8) return null;
    return { month, value: entries.reduce((sum, [, value]) => sum + value, 0) / 1000 };
  }).filter((month) => month !== null);
  if (months.length < 3) return null;
  const meanX = months.reduce((sum, item) => sum + item.month, 0) / months.length;
  const meanY = months.reduce((sum, item) => sum + item.value, 0) / months.length;
  const slope = months.reduce((sum, item) => sum + (item.month - meanX) * (item.value - meanY), 0)
    / months.reduce((sum, item) => sum + (item.month - meanX) ** 2, 0);
  // Only eligible month centres: no extrapolation into incomplete or future months.
  return points.map((point) => !point.reset && point.monthDay.endsWith('-15') && months.some((item) => item.month === point.month)
    ? Math.max(0, meanY + slope * (point.month - meanX)) : null);
}

function prediction(points: Points, totals: Map<string, number>, year: number, cutoff: string, dailyRate: number, annual: boolean): Array<number | null> {
  const cutoffTime = Date.parse(`${cutoff}T00:00:00Z`);
  const knownAnnual = [...totals.values()].reduce((sum, value) => sum + value, 0) / 1000;
  const cutoffMonth = cutoff.slice(0, 7);
  const knownMonth = [...totals.entries()].filter(([date]) => date.startsWith(cutoffMonth)).reduce((sum, [, value]) => sum + value, 0) / 1000;
  return points.map((point) => {
    const date = `${year}-${point.monthDay}`;
    const dateTime = Date.parse(`${date}T00:00:00Z`);
    if (new Date(dateTime).toISOString().slice(0, 10) !== date || date < cutoff || (date === cutoff && point.reset)) return null;
    if (annual) return knownAnnual + dailyRate * Math.max(0, (dateTime - cutoffTime) / DAY - (point.reset ? 1 : 0));
    if (date.startsWith(cutoffMonth)) return knownMonth + dailyRate * Math.max(0, (dateTime - cutoffTime) / DAY);
    return point.reset ? 0 : dailyRate * Number(point.monthDay.slice(3));
  });
}

/** Projection of recorded quantities; never changes actual totals or fills historical gaps. */
export function buildConsumptionCharts(snapshot: QhseReportSnapshot, options: QhseReportOptions = {}): QhseReportChart[] {
  const years = consumptionYears(snapshot);
  const cutoff = consumptionCutoff(options);
  const points = calendar(years);
  const base = {
    kind: 'line' as const, compactDailyPoints: true,
    labels: points.map((point) => `${point.monthDay}${point.reset ? ':reset' : ''}`), pointPositions: points.map((point) => point.position),
    monthTicks: Array.from({ length: 12 }, (_, month) => ({
      label: new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, month, 1))),
      index: points.findIndex((point) => point.month === month && point.monthDay.endsWith('-15')),
      startIndex: points.findIndex((point) => point.month === month && point.reset),
    })),
  };
  const water: QhseReportChart = { ...base, title: 'Eau avitaillée cumulée par mois', subtitle: 'Cumul mensuel · remise à zéro le 1er', unit: 'm³', series: [] };
  const fuel: QhseReportChart = { ...base, title: 'Consommation de fuel cumulée par mois', subtitle: 'Cumul mensuel · remise à zéro le 1er', unit: 'm³', series: [] };
  const emissions: QhseReportChart = { ...base, title: 'Émissions de GES cumulées', subtitle: 'Cumul depuis le 1er janvier · tCO₂e', unit: 'tCO₂e', series: [] };
  const notes: [Set<string>, Set<string>, Set<string>] = [new Set(), new Set(), new Set()];
  const trendNotes: [Set<string>, Set<string>, Set<string>] = [new Set(), new Set(), new Set()];
  years.forEach((year) => {
    const scoped = consumptionYearSnapshot(snapshot, year, cutoff);
    const waterTotals = dailyTotals(scoped, 'water');
    const fuelTotals = dailyTotals(scoped, 'fuel');
    const actualAnnual = observations(points, fuelTotals, year, true);
    const parameter = (snapshot.environmentParameters || []).filter((item) => item.effectiveFrom <= `${year}-12-31` && (!item.effectiveTo || item.effectiveTo >= `${year}-01-01`)).at(-1);
    const series = (values: Array<number | null>, label: string, color: Series['color'], step = false): Series => ({ label, color, values, year, step, valueLabelIndices: monthLabels(points, values) });
    const lastReportDate = scoped.reports.map((row) => row.reportDate.slice(0, 10)).sort().at(-1) || '';
    water.series.push(series(observations(points, waterTotals, year, false, lastReportDate), String(year), BLUE, true));
    fuel.series.push(series(observations(points, fuelTotals, year, false), years.length === 1 ? `Cumul mensuel · ${year}` : String(year), BLUE));
    const multiply = (values: Array<number | null>, factor: number | undefined) => values.map((value) => value === null || factor === undefined ? null : value * factor);
    const factor = parameter?.directCombustionFactor;
    const xbeeFactor = parameter ? parameter.directCombustionFactor * (1 - parameter.xbeeReductionRate) : undefined;
    emissions.series.push(series(multiply(actualAnnual, factor), `Sans XBEE${years.length > 1 ? ` · ${year}` : ''}`, GREY), series(multiply(actualAnnual, xbeeFactor), `Avec XBEE${years.length > 1 ? ` · ${year}` : ''}`, GREEN));
    const configurations = [
      { key: 'water' as const, chart: water, totals: waterTotals, index: 0, annual: false, color: BLUE, factor: 1 },
      { key: 'fuel' as const, chart: fuel, totals: fuelTotals, index: 1, annual: false, color: BLUE, factor: 1 },
      { key: 'emissions' as const, chart: emissions, totals: fuelTotals, index: 2, annual: true, color: GREY, factor },
      { key: 'xbee' as const, chart: emissions, totals: fuelTotals, index: 2, annual: true, color: GREEN, factor: xbeeFactor },
    ];
    configurations.forEach((config) => {
      if (options.trend?.[config.key]) {
        const fitted = monthlyTrend(points, scoped, config.totals, cutoff, config.key === 'water');
        if (fitted === null || config.factor === undefined) trendNotes[config.index].add('Tendance indisponible : au moins 3 mois terminés suffisamment renseignés et paramètres requis.');
        else {
          const values = multiply(fitted, config.factor);
          config.chart.series.push({ ...series(values, config.key === 'xbee' ? 'Tendance XBEE' : config.key === 'emissions' ? 'Tendance sans XBEE' : 'Tendance mensuelle', config.annual ? config.color : TREND), trend: true, axis: config.annual ? 'right' : 'left', valueLabelIndices: [] });
          trendNotes[config.index].add('Tendance : régression linéaire des totaux mensuels terminés, couverture DPR ≥ 80 %, minimum 3 mois, valeurs bornées à zéro.');
        }
      }
      if (!options.forecast?.[config.key]) return;
      if (cutoff === `${year}-12-31`) { notes[config.index].add('Année terminée : aucun jour futur à projeter.'); return; }
      const rate = forecastRate(scoped, config.totals, cutoff, config.key === 'water');
      if (year !== Number(cutoff.slice(0, 4))) { notes[config.index].add('Prévision réservée à l’année en cours.'); return; }
      if (rate === null || config.factor === undefined) { notes[config.index].add('Prévision indisponible : historique ou paramètres insuffisants.'); return; }
      const values = multiply(prediction(points, config.totals, year, cutoff, rate, config.annual), config.factor);
      config.chart.series.push({ ...series(values, config.key === 'xbee' ? 'Prévision XBEE' : config.key === 'emissions' ? 'Prévision sans XBEE' : 'Prévision', config.color), forecast: true });
      notes[config.index].add('Pointillés : rythme moyen des 3 derniers mois terminés, couverture DPR ≥ 80 %.');
    });
  });
  return [water, fuel, emissions].map((chart, index) => ({ ...chart, forecastNote: [...notes[index]].join(' ') || undefined, trendNote: [...trendNotes[index]].join(' ') || undefined }));
}
