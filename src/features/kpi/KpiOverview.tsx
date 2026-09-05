import { useMemo, useState } from 'react';
import { ChevronRight, Database, Info, TriangleAlert, CalendarClock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { QhseReportChart, QhseReportOptions, QhseReportSnapshot } from './qhseReportData';
import { buildKpiDomainContent, buildKpiOverview, buildKpiSafetyChart, KPI_DOMAINS, type KpiDomain, type KpiSafetyMetric } from './kpiOverviewData';

const number = (value: number | null | undefined, digits = 2) => value == null ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
export function KpiChart({ chart }: { chart: QhseReportChart }) {
  const data = useMemo(() => chart.labels.map((label, index) => ({ label, position: chart.pointPositions?.[index] ?? index, ...Object.fromEntries(chart.series.map((series, i) => [`s${i}`, series.values[index] ?? null])) })), [chart]);
  const ticks = chart.monthTicks?.map((tick) => chart.pointPositions?.[tick.index] ?? tick.index);
  const present = chart.series.some((s) => s.values.some((v) => v !== null));
  return <div className="kpi-chart" role="img" aria-label={`${chart.title} · ${chart.unit || ''}`}>
    {present ? <ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
      <CartesianGrid stroke="#e8eef4" vertical={false} />
      <XAxis dataKey="position" type="number" domain={['dataMin', 'dataMax']} ticks={ticks || (chart.labels.length === 12 ? data.map((d) => d.position) : undefined)} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} minTickGap={4} tickFormatter={(position: number) => {
        const month = ticks?.indexOf(position) ?? -1;
        return month >= 0 ? chart.monthTicks![month].label.slice(0, 4) : (chart.labels[position] || '').slice(0, 4);
      }} />
      <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
      {chart.series.some((s) => s.axis === 'right') && <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />}
      <Tooltip labelFormatter={(position) => data.find((d) => d.position === position)?.label.replace(':reset', ' · remise à zéro') || ''} formatter={(value, name) => [number(Number(value)), name]} />
      <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
      {chart.series.map((s, index) => chart.kind === 'bar' && !s.trend && !s.forecast
        ? <Bar key={index} dataKey={`s${index}`} name={s.label} fill={`rgb(${s.color.join(',')})`} yAxisId={s.axis || 'left'} maxBarSize={20} isAnimationActive={false} />
        : <Line key={index} dataKey={`s${index}`} name={s.label} stroke={`rgb(${s.color.join(',')})`} yAxisId={s.axis || 'left'} strokeWidth={s.trend ? 1.3 : 1.8} strokeDasharray={s.forecast ? '4 3' : undefined}
          type={s.step ? 'stepAfter' : 'linear'} dot={chart.labels.length <= 12 && !s.forecast ? { r: 2 } : false} connectNulls={false} isAnimationActive={false} />)}
    </ComposedChart></ResponsiveContainer> : <div className="kpi-chart-empty"><Database size={20} /><span>Pas de ventilation exploitable sur ce périmètre.</span></div>}
  </div>;
}

export function KpiOverview({ snapshot, options, loading, onQuality }: { snapshot: QhseReportSnapshot | null; options: QhseReportOptions; loading: boolean; onQuality(): void }) {
  const [domain, setDomain] = useState<KpiDomain>('Sécurité');
  const [safetyMetric, setSafetyMetric] = useState<KpiSafetyMetric>('tf');
  const [chosenYear, setChosenYear] = useState<number | null>(null);
  const [chartIndex, setChartIndex] = useState(0);
  const overview = useMemo(() => snapshot ? buildKpiOverview(snapshot, options) : null, [snapshot, options]);
  const years = overview?.annual.map((row) => row.year) || [];
  const year = chosenYear && years.includes(chosenYear) ? chosenYear : years.at(-1) || new Date().getFullYear();
  const domainContent = useMemo(() => snapshot && domain !== 'Sécurité' ? buildKpiDomainContent(snapshot, domain, year, options) : null, [snapshot, domain, year, options]);
  const chart = useMemo(() => !snapshot ? null : domain === 'Sécurité' ? buildKpiSafetyChart(snapshot, safetyMetric, options) : domainContent?.charts[Math.min(chartIndex, domainContent.charts.length - 1)], [snapshot, domain, safetyMetric, options, domainContent, chartIndex]);
  const month = overview ? new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(`${overview.cutoff}T12:00:00`)) : '';
  const values = [
    ['TF / LTIFR', number(overview?.tf), 'par million d’heures'], ['Taux de gravité', number(overview?.tg, 3), 'jours perdus / 1 000 h'],
    ['TRIR', number(overview?.trir), 'par million d’heures'], ['Exposition', overview?.hours == null ? '—' : `${number(overview.hours, 0)} h`, 'registre / historiques officiels'],
    ['Actions en retard', number(overview?.overdue, 0), overview ? `sur ${overview.open} ouvertes · stock actuel` : 'stock actuel'],
    ['Renouvellements RH', number(overview?.renewals, 0), `échéances de ${month}`],
  ];
  return <>
    <section className="kpi-metrics" aria-label="Synthèse de direction" aria-busy={loading}>{values.map(([label, value, detail], i) => <article className={`kpi-metric${i > 3 ? ' is-attention' : ''}`} aria-label={label} key={label}>
      <span>{label}</span><strong>{loading ? '…' : value}</strong><small>{detail}</small></article>)}</section>
    <section className="kpi-overview">
      <div className="kpi-panel kpi-analysis"><div className="kpi-tabs" role="tablist" aria-label="Domaines des indicateurs">{KPI_DOMAINS.map((name) => <button key={name} role="tab" aria-selected={domain === name} onClick={() => { setDomain(name); setChartIndex(0); }}>{name}</button>)}</div>
        <div className="kpi-analysis-body"><header><div><strong>{chart?.title || 'Indicateurs du périmètre'}</strong><small>{domain === 'Sécurité' ? 'Cumul annuel · comparaison des années sélectionnées' : `${year} · ${chart?.unit || ''}`}</small></div>
          <div className="kpi-chart-controls">{domain === 'Sécurité' ? (['tf', 'tg', 'trir', 'far'] as const).map((key) => <button key={key} aria-pressed={safetyMetric === key} onClick={() => setSafetyMetric(key)}>{key.toUpperCase()}</button>) : <>
            {years.length > 1 && <select aria-label="Année du graphique" value={year} onChange={(e) => setChosenYear(Number(e.target.value))}>{years.map((y) => <option key={y}>{y}</option>)}</select>}
            {domainContent && domainContent.charts.length > 1 && <select aria-label="Graphique du domaine" value={chartIndex} onChange={(e) => setChartIndex(Number(e.target.value))}>{domainContent.charts.map((c, i) => <option key={i} value={i}>{c.title}</option>)}</select>}
          </>}</div></header>
          {loading ? <div className="kpi-chart-empty" role="status">Actualisation des indicateurs…</div> : chart ? <KpiChart chart={chart} /> : <div className="kpi-chart-empty">Données non disponibles.</div>}
          <p className="kpi-chart-note">{domain === 'Sécurité' ? 'Événements enregistrés, exhaustivité non certifiée. Les mois non documentés ne sont pas extrapolés.' : domain === 'RH' ? 'Dates connues des titres actuels, et non formations réalisées ni prévisions.' : chart?.subtitle}</p>
        </div>
      </div>
      <div className="kpi-panel kpi-priorities"><h2>À traiter <small>· situation actuelle</small></h2>
        <Link to="/modules/actionPlan"><TriangleAlert size={17} /><b>{loading ? '…' : number(overview?.overdue, 0)}</b><span>actions en retard</span><ChevronRight size={15} /></Link>
        <Link to="/modules/humanResources"><CalendarClock size={17} /><b>{loading ? '…' : number(overview?.renewals, 0)}</b><span>titres à renouveler ce mois</span><ChevronRight size={15} /></Link>
        <button onClick={onQuality}><Database size={17} /><span>Qualité et couverture des données</span><ChevronRight size={15} /></button>
      </div>
    </section>
    <div className={`kpi-quality${overview?.warnings.length ? ' has-warning' : ''}`}><Info size={16} /><span>{overview?.warnings.length ? `${overview.warnings.length} point(s) de vigilance · données manquantes et exposition à vérifier.` : 'Données accessibles au profil connecté · les valeurs absentes restent distinctes des zéros.'}</span><button onClick={onQuality}>Voir les limites des données</button></div>
  </>;
}
