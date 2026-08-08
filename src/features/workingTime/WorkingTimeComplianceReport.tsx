import type { SupabaseClient } from '@supabase/supabase-js';
import { BarChart3, Download, FileText, RefreshCw, ShieldAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  fetchWorkingTimeComplianceOptions,
  fetchWorkingTimeComplianceReport,
  reportWorkspaceWatchGroups,
  type ComplianceMetricKey,
  type WorkingTimeComplianceReportData,
} from './workingTimeComplianceReportModel';
import { buildWorkingTimeCompliancePdf } from './workingTimeComplianceReportPdf';
import { workingTimeErrorMessage, type WorkingTimeWorkspace } from './workingTimeQueries';

interface WorkingTimeComplianceReportProps {
  client: SupabaseClient;
  initialYear: number;
}

type PeriodMode = 'year' | 'quarter' | 'month';
type PopulationScope = 'company' | 'sailors' | 'watch';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const METRICS: Array<{ key: ComplianceMetricKey; label: string }> = [
  { key: 'imca', label: 'KPI IMCA' },
  { key: 'french', label: 'Taux de fréquence et taux de gravité' },
  { key: 'non_compliance', label: 'Journées non conformes' },
];
const pad = (value: number) => String(value).padStart(2, '0');

function periodBounds(year: number, mode: PeriodMode, month: number, quarter: number) {
  const startMonth = mode === 'year' ? 1 : mode === 'quarter' ? (quarter - 1) * 3 + 1 : month;
  const endMonth = mode === 'year' ? 12 : mode === 'quarter' ? startMonth + 2 : month;
  const endDate = new Date(year, endMonth, 0);
  return {
    start: `${year}-${pad(startMonth)}-01`,
    end: `${year}-${pad(endMonth)}-${pad(endDate.getDate())}`,
  };
}

function selectedNumbers(select: HTMLSelectElement): number[] {
  return Array.from(select.selectedOptions, (option) => Number(option.value));
}

function selectedStrings(select: HTMLSelectElement): string[] {
  return Array.from(select.selectedOptions, (option) => option.value);
}

function value(value: number | null | undefined, digits = 2) {
  return value === null || value === undefined ? 'Non configuré' : value.toLocaleString('fr-FR', { maximumFractionDigits: digits });
}

export function WorkingTimeComplianceReport({ client, initialYear }: WorkingTimeComplianceReportProps) {
  const [year, setYear] = useState(initialYear);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('year');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [quarter, setQuarter] = useState(Math.floor(new Date().getMonth() / 3) + 1);
  const [metricKeys, setMetricKeys] = useState<ComplianceMetricKey[]>(METRICS.map((metric) => metric.key));
  const [populationScope, setPopulationScope] = useState<PopulationScope>('company');
  const [personIds, setPersonIds] = useState<number[]>([]);
  const [watchGroups, setWatchGroups] = useState<string[]>([]);
  const [vesselIds, setVesselIds] = useState<number[]>([]);
  const [workspace, setWorkspace] = useState<WorkingTimeWorkspace | null>(null);
  const [methodologyLabel, setMethodologyLabel] = useState('');
  const [report, setReport] = useState<WorkingTimeComplianceReportData | null>(null);
  const [analysis, setAnalysis] = useState('');
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const range = useMemo(() => periodBounds(year, periodMode, month, quarter), [month, periodMode, quarter, year]);
  const years = useMemo(() => Array.from({ length: 7 }, (_, index) => initialYear + 1 - index), [initialYear]);
  const people = workspace?.readablePeople || [];
  const vessels = workspace?.vessels || [];
  const availableWatchGroups = workspace ? reportWorkspaceWatchGroups(workspace) : [];

  useEffect(() => {
    let cancelled = false;
    setIsLoadingOptions(true);
    setError(null);
    void fetchWorkingTimeComplianceOptions(client, year)
      .then(({ methodology, workspace: nextWorkspace }) => {
        if (cancelled) return;
        setWorkspace(nextWorkspace);
        setMethodologyLabel(methodology ? `${methodology.name} · ${methodology.version_label}` : 'Aucune méthodologie applicable');
      })
      .catch((reason) => { if (!cancelled) setError(workingTimeErrorMessage(reason)); })
      .finally(() => { if (!cancelled) setIsLoadingOptions(false); });
    return () => { cancelled = true; };
  }, [client, year]);

  async function generateReport() {
    if (!metricKeys.length) {
      setError('Sélectionnez au moins une famille d’indicateurs.');
      return;
    }
    if (populationScope === 'sailors' && !personIds.length) {
      setError('Sélectionnez au moins un marin.');
      return;
    }
    if (populationScope === 'watch' && !watchGroups.length) {
      setError('Sélectionnez au moins une bordée.');
      return;
    }
    setIsGenerating(true);
    setError(null);
    try {
      const nextReport = await fetchWorkingTimeComplianceReport(client, {
        ...range,
        metricKeys,
        personIds: populationScope === 'sailors' ? personIds : [],
        vesselIds,
        watchGroups: populationScope === 'watch' ? watchGroups : [],
      });
      setReport(nextReport);
      setAnalysis(nextReport.analysis);
    } catch (reason) {
      setError(workingTimeErrorMessage(reason));
    } finally {
      setIsGenerating(false);
    }
  }

  async function exportPdf() {
    if (!report) return;
    setIsExporting(true);
    setError(null);
    try {
      const generated = await buildWorkingTimeCompliancePdf(report, analysis);
      generated.document.save(generated.filename);
    } catch (reason) {
      setError(workingTimeErrorMessage(reason));
    } finally {
      setIsExporting(false);
    }
  }

  const maxTrendHours = Math.max(1, ...(report?.trend.map((point) => point.workHours) || [1]));
  const maxBreakdown = Math.max(1, ...(report?.breakdownByPerson.map((item) => item.value) || [1]));

  return (
    <section aria-labelledby="compliance-report-title" className="working-time-compliance-report">
      <header>
        <div><p>Documents</p><h2 id="compliance-report-title">Rapport de conformité</h2><span>Configurez le périmètre, générez l’analyse, puis adaptez le commentaire avant export.</span></div>
        <FileText aria-hidden="true" size={25} />
      </header>

      <div className="working-time-report-filter-grid">
        <fieldset className="working-time-report-metrics">
          <legend>Indicateurs inclus</legend>
          {METRICS.map((metric) => <label key={metric.key}><input checked={metricKeys.includes(metric.key)} onChange={(event) => setMetricKeys((current) => event.target.checked ? [...current, metric.key] : current.filter((key) => key !== metric.key))} type="checkbox" />{metric.label}</label>)}
        </fieldset>
        <fieldset>
          <legend>Période</legend>
          <label>Découpage<select value={periodMode} onChange={(event) => setPeriodMode(event.target.value as PeriodMode)}><option value="year">Année</option><option value="quarter">Trimestre</option><option value="month">Mois</option></select></label>
          <label>Année<select value={year} onChange={(event) => setYear(Number(event.target.value))}>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          {periodMode === 'quarter' ? <label>Trimestre<select value={quarter} onChange={(event) => setQuarter(Number(event.target.value))}>{[1, 2, 3, 4].map((item) => <option key={item} value={item}>T{item}</option>)}</select></label> : null}
          {periodMode === 'month' ? <label>Mois<select value={month} onChange={(event) => setMonth(Number(event.target.value))}>{MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select></label> : null}
        </fieldset>
        <fieldset>
          <legend>Population</legend>
          <label>Périmètre<select value={populationScope} onChange={(event) => setPopulationScope(event.target.value as PopulationScope)}><option value="company">Compagnie entière</option><option value="sailors">Marins sélectionnés</option><option value="watch">Bordées sélectionnées</option></select></label>
          {populationScope === 'sailors' ? <label>Marins<select aria-label="Marins du rapport" multiple onChange={(event) => setPersonIds(selectedNumbers(event.target))} value={personIds.map(String)}>{people.map((person) => <option key={person.personId} value={person.personId}>{person.lastName} {person.firstName} · {person.functionLabel}</option>)}</select></label> : null}
          {populationScope === 'watch' ? <label>Bordées<select aria-label="Bordées du rapport" multiple onChange={(event) => setWatchGroups(selectedStrings(event.target))} value={watchGroups}>{availableWatchGroups.map((watch) => <option key={watch} value={watch}>{watch}</option>)}</select></label> : null}
        </fieldset>
        <fieldset>
          <legend>Navires</legend>
          <label>Sélection multiple<select aria-label="Navires du rapport" multiple onChange={(event) => setVesselIds(selectedNumbers(event.target))} value={vesselIds.map(String)}>{vessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name}</option>)}</select></label>
          <small>Aucune sélection signifie : tous les navires.</small>
        </fieldset>
      </div>

      <div className="working-time-report-actions">
        <span><ShieldAlert aria-hidden="true" size={16} />Méthodologie : {isLoadingOptions ? 'Chargement…' : methodologyLabel}</span>
        <button disabled={isGenerating || isLoadingOptions} onClick={() => void generateReport()} type="button"><RefreshCw aria-hidden="true" className={isGenerating ? 'is-spinning' : ''} size={17} />{isGenerating ? 'Génération…' : 'Générer le rapport'}</button>
        <button disabled={!report || isExporting} onClick={() => void exportPdf()} type="button"><Download aria-hidden="true" size={17} />{isExporting ? 'Export…' : 'Exporter le PDF'}</button>
      </div>
      {error ? <p className="working-time-message is-error" role="alert">{error}</p> : null}

      {report ? <article className="working-time-report-preview">
        <header>
          <img alt="BBTM" src="/bbtm-report-logo.png" />
          <div><h3>Rapport de suivi du temps de travail</h3><p>{report.periodLabel}</p></div>
        </header>
        <section>
          <h4>Résumé exécutif</h4>
          <textarea aria-label="Analyse modifiable du rapport" onChange={(event) => setAnalysis(event.target.value)} rows={7} value={analysis} />
        </section>
        <section>
          <h4>Chiffres clés</h4>
          <div className="working-time-report-kpis">
            <article><span>Heures de travail</span><strong>{value(report.workHours, 1)} h</strong></article>
            <article><span>Journées non conformes</span><strong>{value(report.nonCompliantDays, 0)}</strong></article>
            <article><span>Marins concernés</span><strong>{value(report.peopleAffected, 0)}</strong></article>
            <article><span>Exposition HSE</span><strong>{value(report.rawKpis.exposure_hours, 1)} h</strong></article>
            {report.metricKeys.includes('imca') ? <><article><span>LTIFR</span><strong>{value(report.rates.LTIFR)}</strong></article><article><span>TRIR</span><strong>{value(report.rates.TRIR)}</strong></article></> : null}
            {report.metricKeys.includes('french') ? <><article><span>Fréquence FR</span><strong>{value(report.rates.french_frequency_rate)}</strong></article><article><span>Gravité FR</span><strong>{value(report.rates.french_severity_rate)}</strong></article></> : null}
          </div>
        </section>
        <section className="working-time-report-chart-section">
          <div><h4><BarChart3 aria-hidden="true" size={18} />Heures enregistrées sur la période</h4><p>Évolution issue des intervalles horodatés.</p></div>
          <div className="working-time-report-trend" role="img" aria-label="Évolution des heures de travail">{report.trend.map((point) => <label key={point.key}><span>{point.label}</span><progress max={maxTrendHours} value={point.workHours} /><strong>{value(point.workHours, 1)} h</strong></label>)}</div>
        </section>
        <section className="working-time-report-chart-section">
          <div><h4><ShieldAlert aria-hidden="true" size={18} />Journées non conformes par marin</h4><p>Un marin et une date ne sont comptés qu’une seule fois.</p></div>
          <div className="working-time-report-breakdown">{report.breakdownByPerson.length ? report.breakdownByPerson.slice(0, 12).map((item) => <label key={item.id}><span>{item.label}</span><progress max={maxBreakdown} value={item.value} /><strong>{item.value}</strong></label>) : <p>Aucune journée non conforme dans ce périmètre.</p>}</div>
        </section>
        <section><h4>Caveats et hypothèses</h4><ul>{report.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul></section>
        <section><h4>Détail des formules utilisées</h4><ul>{report.formulas.map((formula) => <li key={formula}>{formula}</li>)}</ul></section>
      </article> : null}
    </section>
  );
}
