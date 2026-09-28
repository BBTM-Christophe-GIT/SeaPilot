import { useEffect, useId, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectsData } from './projectQueries';
import { compareFleetAssets } from '../fleet/fleetDisplay';
import { isPortfolioKpiVessel, localCalendarDate, operationType, summarizeUtilization, utilization, type UtilizationDpr } from './projectPortfolioMetrics';

export function ProjectPortfolioInsights({ client, data }: { client: SupabaseClient; data: ProjectsData }) {
  const [month, setMonth] = useState(() => localCalendarDate().slice(0, 7));
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const [dprs, setDprs] = useState<UtilizationDpr[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const year = month.slice(0, 4);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setDprs([]);
    void (async () => {
      const rows: UtilizationDpr[] = [];
      for (let offset = 0; ; offset += 500) {
        const result = await client.from('dpr_reports').select('id,report_date,vessel_id,project_id').gte('report_date', `${year}-01-01`).lte('report_date', `${year}-12-31`).is('deleted_at', null).in('status', ['submitted', 'validated']).order('id').range(offset, offset + 499);
        if (result.error) throw result.error;
        if (cancelled) return;
        rows.push(...result.data);
        if (result.data.length < 500) break;
      }
      if (!cancelled) setDprs(rows);
    })().catch(() => { if (!cancelled) setError('Les DPR sont indisponibles : le réalisé n’est pas affiché.'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [client, year]);
  const end = new Date(Date.UTC(Number(year), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const today = localCalendarDate();
  const vessels = useMemo(() => data.vessels.filter((vessel) => isPortfolioKpiVessel(vessel, today)).sort(compareFleetAssets), [data.vessels, today]);
  const vesselMetrics = useMemo(() => vessels.map((vessel) => ({ vessel, periods: [
    utilization(vessel, `${month}-01`, end, data.planningOccurrences, dprs),
    utilization(vessel, `${year}-01-01`, `${year}-12-31`, data.planningOccurrences, dprs),
  ] })), [vessels, month, end, year, data.planningOccurrences, dprs]);
  const summaries = [0, 1].map((index) => summarizeUtilization(vesselMetrics.map(({ periods }) => periods[index])));
  const monthLabel = new Date(`${month}-01T12:00:00`).toLocaleDateString('fr-FR', { month: 'long' });
  const realizedLabel = (rate: number) => loading ? '…' : error || !vessels.length ? '—' : `${rate} %`;
  const distribution = useMemo(() => {
    const counts = new Map<string, number>();
    const vesselIds = new Set(vessels.map((vessel) => vessel.id));
    data.planningOccurrences.filter((operation) => {
      const assigned = operation.vesselIds?.length ? operation.vesselIds : operation.primaryVesselId ? [operation.primaryVesselId] : [];
      return operation.startsOn <= end && operation.endsOn >= `${month}-01` && !/annul|cancel/i.test(operation.status)
        && (!assigned.length || assigned.some((id) => vesselIds.has(id)));
    }).forEach((operation) => {
      const label = operationType(data.projects.find((project) => project.id === operation.projectId));
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [data.planningOccurrences, data.projects, month, end, vessels]);
  const total = distribution.reduce((sum, [, count]) => sum + count, 0);
  return <section className="project-insights" aria-label="Activité de la flotte">
    <header>
      <div className="project-insights-title"><h2>Activité de la flotte</h2><p>{vessels.length} navire{vessels.length > 1 ? 's' : ''} suivi{vessels.length > 1 ? 's' : ''}</p></div>
      <dl className="project-insights-summary" aria-label="Synthèse de l’activité">
        {summaries.map((metric, index) => <div key={index}><dt>{index ? `Année ${year}` : monthLabel}</dt><dd><strong>{vessels.length ? `${metric.plannedRate} %` : '—'}</strong> prévu <span>·</span> <strong>{realizedLabel(metric.realizedRate)}</strong> réalisé</dd></div>)}
        <div><dt>Opérations du mois</dt><dd><strong>{total}</strong> planifiée{total > 1 ? 's' : ''}</dd></div>
      </dl>
      <div className="project-insights-controls"><label>Période<input type="month" value={month} onChange={(event) => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) setMonth(event.target.value); }} /></label>
        <button type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded((value) => !value)}>{expanded ? 'Réduire' : 'Voir les détails'}{expanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}</button>
      </div>
    </header>
    {error ? <p role="alert">{error}</p> : null}
    <div id={detailsId} hidden={!expanded}>
    {expanded ? <div className="project-insights-grid"><article><h3>Utilisation par navire</h3><p className="project-chart-legend"><i /> Prévu <i /> Réalisé · DPR soumis ou validés</p>
      <div className="project-util-heading"><span>Navire</span><span>{monthLabel}</span><span>Année {year}</span></div>
      {vesselMetrics.map(({ vessel, periods }) => <div className="project-util-row" key={vessel.id}><strong>{vessel.name}</strong>{periods.map((metric, index) => {
        return <div className="project-util-pair" key={index} aria-label={`${vessel.name}, ${index ? year : month} : prévu ${metric.plannedRate} %, réalisé ${loading || error ? 'indisponible' : metric.realizedRate + ' %'}`}>
          <div title={`${metric.planned} jours prévus / ${metric.days} jours calendaires`}><span><i style={{ width: `${metric.plannedRate}%` }} /></span><b>{metric.plannedRate} %</b></div>
          <div title={`${metric.realized} jours avec DPR / ${metric.days} jours calendaires`}><span><i style={{ width: `${loading || error ? 0 : metric.realizedRate}%` }} /></span><b>{loading ? '…' : error ? '—' : `${metric.realizedRate} %`}</b></div>
        </div>;
      })}</div>)}
      {!vessels.length ? <p>Aucun navire actif dans le périmètre des indicateurs.</p> : null}
      <small>Base : jours calendaires du mois et de l’année entière, pour la flotte suivie aujourd’hui. La synthèse additionne les jours/navires ; un même jour/navire n’est compté qu’une fois.</small>
    </article><article><h3>Types d’opérations</h3><p>{total} opération(s) planifiée(s) sur le mois</p><div className="project-distribution">{distribution.map(([label, count], index) => <div key={label}><span>{label}<b>{count}</b></span><div><i style={{ width: `${count / total * 100}%`, background: ['#167e90', '#1f3f69', '#8daac2', '#df9c4c', '#6a819d', '#bbc8d3'][index % 6] }} /></div></div>)}{!total ? <p>Aucune opération sur cette période.</p> : null}</div><small>Opérations de la flotte suivie ou sans navire affecté, classées à partir du contrat et de l’intitulé du projet. Une opération correspond à une ligne du planning.</small></article></div> : null}
    </div>
  </section>;
}
