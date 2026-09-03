import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AlertTriangle, Archive, BookOpen, CheckCircle2, Clock3, Download, FileText, History, RefreshCw, X,
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { supabase } from '../../lib/supabaseClient';
import {
  buildActionPlanMetrics, fetchActionPlanData, fetchActionPlanHseDashboard,
  type ActionPlanData, type ActionPlanHsePoint,
} from '../actionPlan/actionPlanQueries';
import '../actionPlan/actionPlan.css';
import type { AppShellOutletContext } from '../shell/AppShell';
import {
  QHSE_REPORT_CATALOG, QHSE_REPORT_FAMILIES, qhseReportFileName, type QhseReportDefinition,
} from './qhseReportCatalog';
import { fetchQhseReportSnapshot, type QhseReportSnapshot } from './qhseReportData';
import {
  buildQhseReportArchive, buildQhseReportPdf, downloadQhseBlob, qhseReportArchiveFileName,
} from './qhseReportPdf';
import './kpiReports.css';

interface KpiPageProps { client?: SupabaseClient }

const EMPTY_DATA: ActionPlanData = {
  actions: [], documents: [], actionTypes: [], vessels: [], people: [], assignees: [],
  exposureHours: 0, hseKpis: null, hseDashboard: null,
};

function formatHours(value: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value)} h`;
}

function MetricCard({ icon, label, value, tone, detail }: {
  icon: ReactNode; label: string; value: string | number; tone: string; detail: string;
}) {
  return <article className={`action-plan-metric ${tone}`} aria-label={label}>
    <span className="action-plan-metric-icon">{icon}</span>
    <span><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>
  </article>;
}

interface RateSeries {
  key: keyof ActionPlanHsePoint;
  label: string;
  color: string;
  axis?: 'left' | 'right';
}

function formatRate(value: unknown): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(value));
}

function RateChart({ title, description, points, series }: {
  title: string; description: string; points: ActionPlanHsePoint[]; series: RateSeries[];
}) {
  const latest = points[points.length - 1];
  return <article className="action-plan-chart-card">
    <header><div><h3>{title}</h3><p>{description}</p></div><div className="action-plan-chart-values">
      {series.map((item) => <span key={String(item.key)} style={{ '--series-color': item.color } as CSSProperties}>
        <small>{item.label}</small><strong>{formatRate(latest?.[item.key])}</strong>
      </span>)}
    </div></header>
    <div className="action-plan-chart" role="img" aria-label={`${title}, évolution cumulée mois par mois`}>
      <ResponsiveContainer height="100%" width="100%">
        <LineChart data={points} margin={{ top: 10, right: 18, left: -14, bottom: 0 }}>
          <CartesianGrid stroke="#e5ebf3" strokeDasharray="3 4" vertical={false} />
          <XAxis axisLine={false} dataKey="monthLabel" fontSize={11} tickLine={false} />
          <YAxis axisLine={false} fontSize={11} tickLine={false} yAxisId="left" />
          {series.some((item) => item.axis === 'right') && <YAxis axisLine={false} fontSize={11} orientation="right" tickLine={false} yAxisId="right" />}
          <Tooltip formatter={(value, name) => [formatRate(value), name]} labelFormatter={(label) => `Cumul à fin ${label}`} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          {series.map((item) => <Line activeDot={{ r: 5 }} connectNulls={false} dataKey={item.key} dot={{ r: 2.5 }} key={String(item.key)}
            name={item.label} stroke={item.color} strokeWidth={2.5} type="monotone" yAxisId={item.axis || 'left'} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  </article>;
}

function HseDefinitionsDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  if (!open) return null;
  const definitions = [
    ['FAT', 'Décès lié au travail.'],
    ['LWDC', 'Accident entraînant au moins une journée de travail perdue.'],
    ['LTI', 'Accident avec arrêt : FAT + LWDC.'],
    ['RWC', 'Blessure permettant un travail adapté ou restreint.'],
    ['MTC', 'Cas nécessitant un traitement médical au-delà des premiers soins.'],
    ['FAC', 'Cas traité uniquement par des premiers soins.'],
    ['Near miss', 'Presqu’accident sans blessure, mais avec un potentiel de dommage.'],
    ['Safety observation', 'Observation documentée d’une situation ou d’un comportement de sécurité.'],
  ];
  const formulas = [
    ['LTIFR', '(FAT + LWDC) × 1 000 000 ÷ heures travaillées'],
    ['TRIR', '(FAT + LWDC + RWC + MTC) × 1 000 000 ÷ heures travaillées'],
    ['FAR', 'FAT × 100 000 000 ÷ heures travaillées'],
    ['SOFR', 'Observations sécurité × 200 000 ÷ heures travaillées'],
    ['Taux de fréquence (TF)', '(FAT + LWDC) × 1 000 000 ÷ heures travaillées'],
    ['Taux de gravité (TG)', 'Jours perdus × 1 000 ÷ heures travaillées'],
  ];
  return <div className="action-plan-dialog-backdrop" role="presentation"><section className="action-plan-definitions" role="dialog" aria-modal="true" aria-labelledby="hse-definitions-title">
    <header><div><span>Référentiel HSE</span><h2 id="hse-definitions-title">Définitions et formules</h2></div><button aria-label="Fermer" onClick={onClose}><X size={22} /></button></header>
    <div className="action-plan-definitions-body"><section><h3>Classification des événements</h3><dl>{definitions.map(([term, definition]) => <Fragment key={term}><dt>{term}</dt><dd>{definition}</dd></Fragment>)}</dl></section>
      <section><h3>Formules de calcul</h3><dl>{formulas.map(([term, formula]) => <Fragment key={term}><dt>{term}</dt><dd>{formula}</dd></Fragment>)}</dl>
        <p>Les courbes affichent le cumul du 1er janvier à la fin de chaque mois. Les taux restent indisponibles tant qu’aucune heure travaillée n’est enregistrée.</p></section></div>
    <footer><button onClick={onClose}>Fermer</button></footer>
  </section></div>;
}

export function KpiPage({ client }: KpiPageProps) {
  const context = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || context?.client || supabase;
  const currentYear = new Date().getFullYear();
  const [data, setData] = useState<ActionPlanData>(EMPTY_DATA);
  const [hseYear, setHseYear] = useState(currentYear);
  const [loading, setLoading] = useState(true);
  const [hseLoading, setHseLoading] = useState(false);
  const [definitionsOpen, setDefinitionsOpen] = useState(false);
  const [error, setError] = useState('');
  const [reportYears, setReportYears] = useState<number[]>([currentYear]);
  const [reportVesselIds, setReportVesselIds] = useState<number[]>([]);
  const [reportBusy, setReportBusy] = useState('');
  const [reportProgress, setReportProgress] = useState('');
  const [reportMessage, setReportMessage] = useState('');
  const reportSnapshots = useRef(new Map<string, QhseReportSnapshot>());

  async function load() {
    setLoading(true); setError('');
    try {
      const nextData = await fetchActionPlanData(effectiveClient);
      if (hseYear !== currentYear) {
        const dashboard = await fetchActionPlanHseDashboard(effectiveClient, hseYear);
        nextData.hseDashboard = dashboard;
        nextData.exposureHours = dashboard?.totals.exposureHours || 0;
      }
      setData(nextData);
      reportSnapshots.current.clear();
    } catch {
      setError('Impossible de charger les indicateurs HSE.');
    } finally { setLoading(false); }
  }

  async function loadHseDashboard(year: number) {
    setHseLoading(true); setError('');
    try {
      const dashboard = await fetchActionPlanHseDashboard(effectiveClient, year);
      setData((current) => ({ ...current, hseDashboard: dashboard, exposureHours: dashboard?.totals.exposureHours || 0 }));
      reportSnapshots.current.clear();
    } catch {
      setError(`Impossible de calculer les indicateurs HSE ${year}.`);
    } finally { setHseLoading(false); }
  }

  useEffect(() => { void load(); }, [effectiveClient]);
  useEffect(() => {
    if (!loading && data.hseDashboard?.year !== hseYear) void loadHseDashboard(hseYear);
  }, [hseYear]);

  const metrics = useMemo(() => buildActionPlanMetrics(data.actions, data.exposureHours), [data.actions, data.exposureHours]);
  const vesselCount = useMemo(() => new Set(data.actions.map((action) => action.vesselName).filter(Boolean)).size, [data.actions]);
  const hseYears = useMemo(() => Array.from(new Set([
    ...Array.from({ length: 6 }, (_, index) => currentYear - index),
    ...data.actions.map((action) => Number(action.openedOn.slice(0, 4))).filter((year) => Number.isInteger(year) && year > 2000),
  ])).sort((a, b) => b - a), [currentYear, data.actions]);
  const selectedVessels = data.vessels.filter((vessel) => reportVesselIds.includes(vessel.id));
  const selectedVesselNames = selectedVessels.map((vessel) => vessel.name);
  const reportPeriod = [...reportYears].sort((left, right) => left - right);

  async function getReportSnapshot(): Promise<QhseReportSnapshot> {
    const key = `${reportPeriod.join(',')}:${reportVesselIds.slice().sort((left, right) => left - right).join(',') || 'all'}`;
    const cached = reportSnapshots.current.get(key);
    if (cached) return cached;
    const snapshot = await fetchQhseReportSnapshot(effectiveClient, {
      year: reportPeriod.at(-1) || currentYear,
      years: reportPeriod,
      vesselId: reportVesselIds.length === 1 ? reportVesselIds[0] : null,
      vesselIds: reportVesselIds,
      vesselName: selectedVesselNames.length === 1 ? selectedVesselNames[0] : '',
      vesselNames: selectedVesselNames,
    }, {
      actions: data.actions,
      actionTypes: data.actionTypes,
      hseDashboard: data.hseDashboard,
    });
    reportSnapshots.current.set(key, snapshot);
    return snapshot;
  }

  async function generateReport(report: QhseReportDefinition) {
    setReportBusy(report.id); setReportMessage(''); setReportProgress('Préparation des données SeaPilot…');
    try {
      const snapshot = await getReportSnapshot();
      setReportProgress('Mise en page du PDF…');
      const blob = await buildQhseReportPdf(report, snapshot);
      downloadQhseBlob(blob, qhseReportFileName(report, reportPeriod, selectedVesselNames.join('-')));
      setReportMessage(`${report.title} a été généré.`);
    } catch {
      setReportMessage(`Impossible de générer « ${report.title} ».`);
    } finally { setReportBusy(''); setReportProgress(''); }
  }

  async function generateAllReports() {
    setReportBusy('all'); setReportMessage(''); setReportProgress('Préparation des données SeaPilot…');
    try {
      const snapshot = await getReportSnapshot();
      const archive = await buildQhseReportArchive(QHSE_REPORT_CATALOG, snapshot, (completed, total) => {
        setReportProgress(`Génération des PDF : ${completed} / ${total}`);
      });
      downloadQhseBlob(archive, qhseReportArchiveFileName(snapshot));
      setReportMessage(`Les ${QHSE_REPORT_CATALOG.length} rapports PDF ont été regroupés dans une archive ZIP.`);
    } catch {
      setReportMessage('Impossible de générer l’archive des rapports QHSE.');
    } finally { setReportBusy(''); setReportProgress(''); }
  }

  if (loading) return <div className="admin-state" role="status">Chargement des indicateurs HSE…</div>;

  return <section className="action-plan-page kpi-page">
    <header className="action-plan-header"><div><h1>Indicateurs HSE</h1><p>Pilotage QHSE annuel, fréquence, gravité et référentiel IMCA.</p></div></header>
    <nav className="action-plan-toolbar kpi-page-toolbar" aria-label="Actions des indicateurs HSE">
      <div><span className="action-plan-kpi-location">QHSE · KPI</span></div>
      <span><button className="is-secondary" onClick={() => void load()}><RefreshCw size={16} />Actualiser</button></span>
    </nav>

    {error && <p className="action-plan-message is-error">{error}</p>}

    <div className="action-plan-metrics">
      <MetricCard detail={`${vesselCount} navire(s) / lieu(x)`} icon={<Clock3 size={20} />} label="Actions non soldées" tone="is-orange" value={metrics.openActionCount} />
      <MetricCard detail={`${metrics.overdueActionCount} action(s) en retard`} icon={<AlertTriangle size={20} />} label="Non-conformités majeures" tone="is-red" value={metrics.majorNonConformityCount} />
      <MetricCard detail={`${data.actions.length} action(s) au total`} icon={<CheckCircle2 size={20} />} label="Actions soldées" tone="is-green" value={metrics.closedActionCount} />
      <MetricCard detail={`Période ${hseYear}`} icon={<History size={20} />} label="Heures travaillées" tone="is-teal" value={formatHours(metrics.exposureHours)} />
    </div>

    <section className="action-plan-indicators"><header><div><span className="action-plan-eyebrow">Pilotage annuel</span><h2>Indicateurs HSE liés au temps de travail</h2><p>Les événements du plan d’action et les heures travaillées alimentent un même calcul versionné.</p></div><div className="action-plan-indicator-actions">
      <label>Année<select aria-label="Année des indicateurs HSE" disabled={hseLoading} value={hseYear} onChange={(event) => setHseYear(Number(event.target.value))}>{hseYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
      <button className="is-secondary" onClick={() => setDefinitionsOpen(true)}><BookOpen size={17} />Définitions et formules</button>
    </div></header>

      {hseLoading && <div className="action-plan-hse-loading" role="status"><RefreshCw size={18} />Calcul des indicateurs {hseYear}…</div>}
      {!hseLoading && data.hseDashboard && <>
        <div className="action-plan-hse-summary"><div><small>Heures travaillées</small><strong>{formatHours(data.hseDashboard.totals.exposureHours)}</strong><span>Du 1er janvier à la dernière période disponible</span></div><div><small>Méthodologie</small><strong>{data.hseDashboard.methodologyVersion || 'SeaPilot HSE'}</strong><span>{data.hseDashboard.exposureRefreshed ? 'Heures réelles, sinon 11 h par jour planifié' : 'Dernier registre des heures disponible'}</span></div></div>
        <div className="action-plan-indicator-grid">{[
          ['FAT', 'Décès', data.hseDashboard.totals.FAT, data.hseDashboard.historicalTotals.FAT],
          ['LTI', 'Accidents avec arrêt', data.hseDashboard.totals.LTI, data.hseDashboard.historicalTotals.LTI],
          ['RWC', 'Travail adapté', data.hseDashboard.totals.RWC, data.hseDashboard.historicalTotals.RWC],
          ['MTC', 'Traitement médical', data.hseDashboard.totals.MTC, data.hseDashboard.historicalTotals.MTC],
          ['FAC', 'Premiers soins', data.hseDashboard.totals.FAC, data.hseDashboard.historicalTotals.FAC],
          ['Near miss', 'Presqu’accidents', data.hseDashboard.totals.nearMiss, data.hseDashboard.historicalTotals.nearMiss],
        ].map(([key, label, value, historical]) => <article key={String(key)}><small>{key}</small><strong>{Number(value)}</strong><span>{label}<small>{Number(historical)} au total</small></span></article>)}</div>

        <section className="action-plan-chart-section"><header><div><span className="action-plan-eyebrow">Référentiel français</span><h2>Fréquence et gravité</h2></div><p>Évolution cumulée depuis le 1er janvier. Le taux de gravité utilise les jours perdus.</p></header>
          <RateChart description="TF par million d’heures · TG par millier d’heures" points={data.hseDashboard.monthly} series={[
            { key: 'frequencyRate', label: 'Taux de fréquence', color: '#2663eb' },
            { key: 'severityRate', label: 'Taux de gravité', color: '#dc6b2f', axis: 'right' },
          ]} title="Taux de fréquence et taux de gravité" />
        </section>

        <section className="action-plan-chart-section"><header><div><span className="action-plan-eyebrow">Référentiel IMCA</span><h2>Performance sécurité maritime</h2></div><p>Lecture séparée des accidents enregistrables et des indicateurs de prévention.</p></header>
          <div className="action-plan-chart-grid"><RateChart description="Taux cumulés rapportés aux heures travaillées" points={data.hseDashboard.monthly} series={[
            { key: 'LTIFR', label: 'LTIFR', color: '#2463d4' }, { key: 'TRIR', label: 'TRIR', color: '#13a06f' },
            { key: 'FAR', label: 'FAR', color: '#c33c42', axis: 'right' },
          ]} title="Accidents enregistrables" />
          <RateChart description="Cas et observations rapportés aux heures travaillées" points={data.hseDashboard.monthly} series={[
            { key: 'RWCRate', label: 'RWC', color: '#7a57c7' }, { key: 'MTCRate', label: 'MTC', color: '#d17a24' },
            { key: 'FACRate', label: 'FAC', color: '#2383a8' }, { key: 'SOFR', label: 'SOFR', color: '#19875b', axis: 'right' },
          ]} title="Prévention, soins et travail adapté" /></div>
        </section>
        <div className="action-plan-rate-note"><Clock3 size={20} /><div><strong>Dénominateur commun et traçable</strong><p>Chaque journée du planning reprend les heures du registre lorsqu’elles existent, sinon 11 heures. Les courbes sont cumulées mois par mois pour l’année {hseYear}.</p></div></div>
      </>}
      {!hseLoading && !data.hseDashboard && <div className="action-plan-empty">Aucune méthodologie HSE disponible pour cette année.</div>}
    </section>

    <section className="qhse-report-library" aria-labelledby="qhse-report-library-title">
      <header><div><span className="action-plan-eyebrow">Rapport Général QHSE</span><h2 id="qhse-report-library-title">Rapports PDF</h2><p>Les 25 pages du rapport de référence, recalculées exclusivement avec les données SeaPilot.</p></div>
        <div className="qhse-report-controls">
          <details className="qhse-report-multiselect"><summary>Années <strong>{reportPeriod.join(', ')}</strong></summary><fieldset aria-label="Années des rapports QHSE">{hseYears.map((year) => <label key={year}><input type="checkbox" disabled={Boolean(reportBusy)} checked={reportYears.includes(year)} onChange={(event) => setReportYears((current) => event.target.checked ? [...current, year] : current.length > 1 ? current.filter((item) => item !== year) : current)}/>{year}</label>)}</fieldset></details>
          <details className="qhse-report-multiselect"><summary>Navires <strong>{selectedVesselNames.length ? `${selectedVesselNames.length} sélectionné(s)` : 'Tous'}</strong></summary><fieldset aria-label="Navires des rapports QHSE"><label><input type="checkbox" disabled={Boolean(reportBusy)} checked={!reportVesselIds.length} onChange={() => setReportVesselIds([])}/>Tous les navires</label>{data.vessels.map((vessel) => <label key={vessel.id}><input type="checkbox" disabled={Boolean(reportBusy)} checked={reportVesselIds.includes(vessel.id)} onChange={(event) => setReportVesselIds((current) => event.target.checked ? [...current, vessel.id] : current.filter((item) => item !== vessel.id))}/>{vessel.name}</label>)}</fieldset></details>
          <button className="qhse-report-all" disabled={Boolean(reportBusy) || hseLoading} onClick={() => void generateAllReports()}><Archive size={17} />{reportBusy === 'all' ? 'Génération…' : `Télécharger les ${QHSE_REPORT_CATALOG.length} PDF`}</button>
        </div>
      </header>
      <div className="qhse-report-assurance"><CheckCircle2 size={18} /><div><strong>Calculs SeaPilot traçables</strong><p>Les rapports utilisent les DPR soumis ou validés, le registre d’exposition HSE versionné et les référentiels métier visibles par votre profil. Les données absentes sont signalées dans le PDF.</p></div></div>
      {(reportProgress || reportMessage) && <p className={`qhse-report-status ${reportProgress ? 'is-progress' : ''}`} role="status">{reportProgress || reportMessage}</p>}
      {QHSE_REPORT_FAMILIES.map((family) => {
        const reports = QHSE_REPORT_CATALOG.filter((report) => report.family === family);
        return <section className="qhse-report-family" key={family}><header><h3>{family}</h3><span>{reports.length} rapport(s)</span></header><div className="qhse-report-grid">
          {reports.map((report) => <article className="qhse-report-card" key={report.id}>
            <div className="qhse-report-card-icon"><FileText size={20} /></div><div className="qhse-report-card-body"><span>Page {report.sourcePage} · {report.orientation === 'portrait' ? 'A4 portrait' : 'A4 paysage'}</span><h4>{report.title}</h4><p>{report.description}</p><small className={report.coverage === 'partial' ? 'is-partial' : ''}>{report.coverage === 'complete' ? 'Couverture SeaPilot complète' : 'Couverture partielle documentée'}</small></div>
            <button aria-label={`Générer ${report.title}`} disabled={Boolean(reportBusy) || hseLoading} onClick={() => void generateReport(report)}><Download size={16} />{reportBusy === report.id ? 'Génération…' : 'PDF'}</button>
          </article>)}
        </div></section>;
      })}
    </section>

    <HseDefinitionsDialog onClose={() => setDefinitionsOpen(false)} open={definitionsOpen} />
  </section>;
}
