import type { SupabaseClient } from '@supabase/supabase-js';
import { BarChart3, CalendarDays, Download, FileText, RefreshCw, ShieldAlert, ShipWheel, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  fetchWorkingTimeComplianceOptions,
  fetchWorkingTimeComplianceReport,
  type ComplianceMetricKey,
  type WorkingTimeComplianceOptions,
  type WorkingTimeComplianceReportData,
} from './workingTimeComplianceReportModel';
import { buildWorkingTimeCompliancePdf } from './workingTimeComplianceReportPdf';
import { workingTimeErrorMessage } from './workingTimeQueries';
import { WorkingTimeReportMultiSelect, type WorkingTimeReportMultiSelectOption } from './WorkingTimeReportMultiSelect';

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

function selectedStrings(select: HTMLSelectElement): string[] {
  return Array.from(select.selectedOptions, (option) => option.value);
}

function value(value: number | null | undefined, digits = 2) {
  return value === null || value === undefined ? 'Non configuré' : value.toLocaleString('fr-FR', { maximumFractionDigits: digits });
}

export function workingTimeComplianceErrorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason || '');
  if (message.toLowerCase().includes('statement timeout')) {
    return 'La génération du rapport a dépassé le délai serveur. Réduisez le périmètre ou relancez la génération.';
  }
  return workingTimeErrorMessage(reason);
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
  const [options, setOptions] = useState<WorkingTimeComplianceOptions | null>(null);
  const [methodologyLabel, setMethodologyLabel] = useState('');
  const [report, setReport] = useState<WorkingTimeComplianceReportData | null>(null);
  const [analysis, setAnalysis] = useState('');
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openMultiSelect, setOpenMultiSelect] = useState<'people' | 'vessels' | null>(null);
  const range = useMemo(() => periodBounds(year, periodMode, month, quarter), [month, periodMode, quarter, year]);
  const years = useMemo(() => Array.from({ length: 7 }, (_, index) => initialYear + 1 - index), [initialYear]);
  const people = options?.people || [];
  const vessels = options?.vessels || [];
  const availableWatchGroups = options?.watchGroups || [];
  const peopleMultiSelectOptions = useMemo<WorkingTimeReportMultiSelectOption[]>(() => people.map((person) => ({
    id: String(person.personId),
    label: `${person.lastName} ${person.firstName}`.trim(),
    description: person.functionLabel || person.gradeLabel || undefined,
  })), [people]);
  const vesselMultiSelectOptions = useMemo<WorkingTimeReportMultiSelectOption[]>(() => vessels.map((vessel) => ({
    id: String(vessel.id),
    label: vessel.name,
  })), [vessels]);
  const periodSummary = periodMode === 'year'
    ? `Année ${year}`
    : periodMode === 'quarter'
      ? `T${quarter} ${year}`
      : `${MONTHS[month - 1]} ${year}`;
  const populationSummary = populationScope === 'company'
    ? 'Compagnie entière'
    : populationScope === 'watch'
      ? (watchGroups.length ? `${watchGroups.length} bordée${watchGroups.length > 1 ? 's' : ''} sélectionnée${watchGroups.length > 1 ? 's' : ''}` : 'Aucune bordée sélectionnée')
      : (personIds.length ? `${personIds.length} marin${personIds.length > 1 ? 's' : ''} sélectionné${personIds.length > 1 ? 's' : ''}` : 'Aucun marin sélectionné');

  useEffect(() => {
    let cancelled = false;
    setIsLoadingOptions(true);
    setError(null);
    void fetchWorkingTimeComplianceOptions(client, year)
      .then((nextOptions) => {
        if (cancelled) return;
        setOptions(nextOptions);
        setMethodologyLabel(nextOptions.methodology ? `${nextOptions.methodology.name} · ${nextOptions.methodology.version_label}` : 'Aucune méthodologie applicable');
      })
      .catch((reason) => { if (!cancelled) setError(workingTimeComplianceErrorMessage(reason)); })
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
      setError(workingTimeComplianceErrorMessage(reason));
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
      setError(workingTimeComplianceErrorMessage(reason));
    } finally {
      setIsExporting(false);
    }
  }

  const maxTrendHours = Math.max(1, ...(report?.trend.map((point) => point.workHours) || [1]));
  const maxBreakdown = Math.max(1, ...(report?.breakdownByPerson.map((item) => item.value) || [1]));

  return (
    <section aria-labelledby="compliance-report-title" className="working-time-compliance-report">
      <h2 className="sr-only" id="compliance-report-title">Générer un rapport de conformité</h2>
      <div className="working-time-report-builder">
        <div className="working-time-report-steps">
          <fieldset className="working-time-report-step">
            <legend><span>1</span>Période</legend>
            <div className="working-time-report-period-grid">
              <label>Découpage<select value={periodMode} onChange={(event) => setPeriodMode(event.target.value as PeriodMode)}><option value="year">Année</option><option value="quarter">Trimestre</option><option value="month">Mois</option></select></label>
              <label>Année<select value={year} onChange={(event) => setYear(Number(event.target.value))}>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              {periodMode === 'quarter' ? <label>Trimestre<select value={quarter} onChange={(event) => setQuarter(Number(event.target.value))}>{[1, 2, 3, 4].map((item) => <option key={item} value={item}>T{item}</option>)}</select></label> : null}
              {periodMode === 'month' ? <label>Mois<select value={month} onChange={(event) => setMonth(Number(event.target.value))}>{MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select></label> : null}
            </div>
          </fieldset>

          <fieldset className="working-time-report-step working-time-report-scope-step">
            <legend><span>2</span>Périmètre</legend>
            <label className="working-time-report-population-scope">Population<select value={populationScope} onChange={(event) => { setPopulationScope(event.target.value as PopulationScope); setOpenMultiSelect(null); }}><option value="company">Compagnie entière</option><option value="sailors">Marins sélectionnés</option><option value="watch">Bordées sélectionnées</option></select></label>
            <div className="working-time-report-scope-grid">
              <div>
                {populationScope === 'sailors' ? (
                  <WorkingTimeReportMultiSelect
                    emptyLabel="Aucun marin sélectionné"
                    isOpen={openMultiSelect === 'people'}
                    label="Marins"
                    onChange={(ids) => setPersonIds(ids.map(Number))}
                    onOpenChange={(open) => setOpenMultiSelect(open ? 'people' : null)}
                    options={peopleMultiSelectOptions}
                    searchPlaceholder="Rechercher un marin…"
                    selectedIds={personIds.map(String)}
                    selectedLabel={(count) => `${count} marin${count > 1 ? 's' : ''} sélectionné${count > 1 ? 's' : ''}`}
                  />
                ) : populationScope === 'watch' ? (
                  <label>Bordées<select aria-label="Bordées du rapport" multiple onChange={(event) => setWatchGroups(selectedStrings(event.target))} value={watchGroups}>{availableWatchGroups.map((watch) => <option key={watch} value={watch}>{watch}</option>)}</select></label>
                ) : <p className="working-time-report-scope-note"><strong>Marins</strong><span>Tous les marins accessibles sont inclus.</span></p>}
              </div>
              <WorkingTimeReportMultiSelect
                allIncludedWhenEmpty
                emptyLabel="Tous les navires"
                isOpen={openMultiSelect === 'vessels'}
                label="Navires"
                onChange={(ids) => setVesselIds(ids.map(Number))}
                onOpenChange={(open) => setOpenMultiSelect(open ? 'vessels' : null)}
                options={vesselMultiSelectOptions}
                searchPlaceholder="Rechercher un navire…"
                selectedIds={vesselIds.map(String)}
                selectedLabel={(count) => `${count} navire${count > 1 ? 's' : ''} sélectionné${count > 1 ? 's' : ''}`}
              />
            </div>
          </fieldset>

          <fieldset className="working-time-report-step working-time-report-metrics">
            <legend><span>3</span>Indicateurs inclus</legend>
            {METRICS.map((metric) => <label key={metric.key}><input checked={metricKeys.includes(metric.key)} onChange={(event) => setMetricKeys((current) => event.target.checked ? [...current, metric.key] : current.filter((key) => key !== metric.key))} type="checkbox" />{metric.label}</label>)}
          </fieldset>
        </div>

        <aside aria-live="polite" className="working-time-report-summary">
          <header><FileText aria-hidden="true" size={28} /><h3>Rapport à générer</h3></header>
          <dl>
            <div><CalendarDays aria-hidden="true" size={24} /><dt>Période</dt><dd>{periodSummary}</dd></div>
            <div><Users aria-hidden="true" size={24} /><dt>Population</dt><dd>{populationSummary}</dd></div>
            <div><ShipWheel aria-hidden="true" size={24} /><dt>Navires</dt><dd>{vesselIds.length ? `${vesselIds.length} navire${vesselIds.length > 1 ? 's' : ''}` : 'Tous les navires'}</dd></div>
            <div><BarChart3 aria-hidden="true" size={24} /><dt>Indicateurs</dt><dd>{metricKeys.length} indicateur{metricKeys.length > 1 ? 's' : ''} inclus</dd></div>
          </dl>
          <p><ShieldAlert aria-hidden="true" size={18} />La génération peut prendre quelques instants selon le périmètre sélectionné.</p>
        </aside>
      </div>

      {error ? <p className="working-time-message is-error" role="alert">{error}</p> : null}
      <div className="working-time-report-actions">
        <span><ShieldAlert aria-hidden="true" size={16} />Méthodologie : {isLoadingOptions ? 'Chargement…' : methodologyLabel}</span>
        <button disabled={isGenerating || isLoadingOptions} onClick={() => void generateReport()} type="button"><RefreshCw aria-hidden="true" className={isGenerating ? 'is-spinning' : ''} size={17} />{isGenerating ? 'Génération…' : 'Générer le rapport'}</button>
        <button disabled={!report || isExporting} onClick={() => void exportPdf()} type="button"><Download aria-hidden="true" size={17} />{isExporting ? 'Export…' : 'Exporter le PDF'}</button>
      </div>

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
