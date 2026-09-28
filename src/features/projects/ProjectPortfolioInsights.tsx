import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectsData } from './projectQueries';
import { compareFleetAssets } from '../fleet/fleetDisplay';
import { operationType, utilization, type UtilizationDpr } from './projectPortfolioMetrics';

export function ProjectPortfolioInsights({ client, data }: { client: SupabaseClient; data: ProjectsData }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
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
  const vessels = useMemo(() => [...data.vessels].filter((vessel) => (!vessel.assetKind || vessel.assetKind === 'vessel') && (vessel.active || (vessel.fleetExitOn && vessel.fleetExitOn >= `${year}-01-01`))).sort(compareFleetAssets), [data.vessels, year]);
  const distribution = useMemo(() => {
    const counts = new Map<string, number>();
    data.planningOccurrences.filter((operation) => operation.startsOn <= end && operation.endsOn >= `${month}-01` && !/annul|cancel/i.test(operation.status)).forEach((operation) => {
      const label = operationType(data.projects.find((project) => project.id === operation.projectId));
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [data.planningOccurrences, data.projects, month, end]);
  const total = distribution.reduce((sum, [, count]) => sum + count, 0);
  return <section className="project-insights" aria-label="Activité de la flotte">
    <header><div><h2>La flotte en un regard</h2><p>Mois et année sélectionnés · projets archivés inclus dans les historiques.</p></div><label>Période<input type="month" value={month} onChange={(event) => { if (/^\d{4}-\d{2}$/.test(event.target.value)) setMonth(event.target.value); }} /></label></header>
    <div className="project-insights-grid"><article><h3>Utilisation par navire</h3><p className="project-chart-legend"><i /> Prévu <i /> Réalisé · DPR soumis ou validés</p>
      {error ? <p role="alert">{error}</p> : null}
      <div className="project-util-heading"><span>Navire</span><span>{new Date(`${month}-01T12:00:00`).toLocaleDateString('fr-FR', { month: 'long' })}</span><span>Année {year}</span></div>
      {vessels.map((vessel) => <div className="project-util-row" key={vessel.id}><strong>{vessel.name}</strong>{[[`${month}-01`, end], [`${year}-01-01`, `${year}-12-31`]].map(([start, stop], index) => {
        const metric = utilization(vessel, start, stop, data.planningOccurrences, dprs);
        return <div className="project-util-pair" key={start + index} aria-label={`${vessel.name}, ${index ? year : month} : prévu ${metric.plannedRate} %, réalisé ${loading || error ? 'indisponible' : metric.realizedRate + ' %'}`}>
          <div title={`${metric.planned} jours prévus / ${metric.days} jours calendaires`}><span><i style={{ width: `${metric.plannedRate}%` }} /></span><b>{metric.plannedRate} %</b></div>
          <div title={`${metric.realized} jours avec DPR / ${metric.days} jours calendaires`}><span><i style={{ width: `${loading || error ? 0 : metric.realizedRate}%` }} /></span><b>{loading ? '…' : error ? '—' : `${metric.realizedRate} %`}</b></div>
        </div>;
      })}</div>)}
      <small>Base : jours calendaires du mois et de l’année entière. Un même jour/navire n’est compté qu’une fois. La sortie de flotte borne la période.</small>
    </article><article><h3>Types d’opérations</h3><p>{total} opération(s) planifiée(s) sur le mois</p><div className="project-distribution">{distribution.map(([label, count], index) => <div key={label}><span>{label}<b>{count}</b></span><div><i style={{ width: `${count / total * 100}%`, background: ['#167e90', '#1f3f69', '#8daac2', '#df9c4c', '#6a819d', '#bbc8d3'][index % 6] }} /></div></div>)}{!total ? <p>Aucune opération sur cette période.</p> : null}</div><small>Classement à partir du contrat et de l’intitulé du projet. Une opération correspond à une ligne du planning.</small></article></div>
  </section>;
}
