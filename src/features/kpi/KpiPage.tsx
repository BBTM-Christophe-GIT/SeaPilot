import type { SupabaseClient } from '@supabase/supabase-js';
import { BookOpen, ChevronDown, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { fetchActionPlanData, type ActionPlanData } from '../actionPlan/actionPlanQueries';
import type { AppShellOutletContext } from '../shell/AppShell';
import { QHSE_REPORT_CATALOG } from './qhseReportCatalog';
import { fetchQhseReportProjectOptions, fetchQhseReportSnapshot, type QhseReportScope, type QhseReportProjectOption, type QhseReportSnapshot } from './qhseReportData';
import { QhseReportComposer } from './QhseReportComposer';
import { KpiOverview } from './KpiOverview';
import { buildKpiOverview } from './kpiOverviewData';
import { KpiDefinitions, KpiDialog } from './KpiDialog';
import { consumptionCutoff } from './qhseConsumption';
import './kpiReports.css';

function ScopeFilter({ label, summary, items, selected, onChange, required = false, disabled = false }: {
  label: string; summary: string; items: Array<{ id: number; label: string }>; selected: number[]; onChange(ids: number[]): void; required?: boolean; disabled?: boolean;
}) {
  return <details className="kpi-scope-filter"><summary><span>{label}</span><strong>{summary}</strong><ChevronDown size={14} /></summary>
    <fieldset aria-label={`${label} des indicateurs et rapports QHSE`} disabled={disabled}>
      {!required && <label><input type="checkbox" checked={!selected.length} onChange={() => onChange([])} />{label === 'Navires' ? 'Tous les navires' : 'Tous les projets'}</label>}
      {items.map((item) => <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} disabled={required && selected.length === 1 && selected[0] === item.id}
        onChange={(event) => onChange(event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))} />{item.label}</label>)}
      {!items.length && <p>Aucun choix accessible.</p>}
    </fieldset></details>;
}

export function KpiPage({ client }: { client?: SupabaseClient }) {
  const context = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || context?.client || supabase;
  const currentYear = new Date().getFullYear();
  const [data, setData] = useState<ActionPlanData | null>(null);
  const [projects, setProjects] = useState<QhseReportProjectOption[]>([]);
  const [years, setYears] = useState<number[]>([currentYear]);
  const [vessels, setVessels] = useState<number[]>([]);
  const [projectIds, setProjectIds] = useState<number[]>([]);
  const [revision, setRevision] = useState(0);
  const [baseLoading, setBaseLoading] = useState(true);
  const [baseError, setBaseError] = useState('');
  const [projectError, setProjectError] = useState('');
  const [snapshotState, setSnapshotState] = useState<{ key: string; client: SupabaseClient; snapshot: QhseReportSnapshot; loadedAt: string } | null>(null);
  const [snapshotError, setSnapshotError] = useState<{ key: string; text: string } | null>(null);
  const [dialog, setDialog] = useState<'definitions' | 'quality' | null>(null);
  const cutoff = consumptionCutoff();

  useEffect(() => {
    let active = true;
    setBaseLoading(true); setBaseError(''); setProjectError(''); setData(null);
    void Promise.all([fetchActionPlanData(effectiveClient), fetchQhseReportProjectOptions(effectiveClient).catch(() => {
      if (active) setProjectError('La liste des projets est indisponible. Actualisez pour réessayer.');
      return [] as QhseReportProjectOption[];
    })]).then(([nextData, nextProjects]) => { if (active) { setData(nextData); setProjects(nextProjects); } })
      .catch(() => { if (active) setBaseError('Impossible de charger les indicateurs QHSE. Vos droits ou la connexion sont à vérifier.'); })
      .finally(() => { if (active) setBaseLoading(false); });
    return () => { active = false; };
  }, [effectiveClient, revision]);

  const scope = useMemo<QhseReportScope>(() => {
    const period = [...years].sort((a, b) => a - b);
    const vesselNames = data?.vessels.filter((v) => vessels.includes(v.id)).map((v) => v.name) || [];
    const projectNames = projects.filter((p) => projectIds.includes(p.id)).map((p) => p.label);
    return { year: period.at(-1) || currentYear, years: period, cutoffDate: cutoff,
      vesselId: vessels.length === 1 ? vessels[0] : null, vesselIds: [...vessels].sort((a, b) => a - b), vesselName: vesselNames.length === 1 ? vesselNames[0] : '', vesselNames,
      projectId: projectIds.length === 1 ? projectIds[0] : null, projectIds: [...projectIds].sort((a, b) => a - b), projectName: projectNames.length === 1 ? projectNames[0] : '', projectNames };
  }, [years, vessels, projectIds, data, projects, currentYear, cutoff]);
  const scopeKey = `${revision}:${JSON.stringify(scope)}`;
  useEffect(() => {
    if (!data || baseLoading) return;
    let active = true;
    // Coalesce multi-select clicks; stale responses cannot publish into a new scope.
    const timer = window.setTimeout(() => {
      void fetchQhseReportSnapshot(effectiveClient, scope, { actions: data.actions, actionTypes: data.actionTypes, hseDashboard: data.hseDashboard })
        .then((snapshot) => { if (active) { setSnapshotState({ key: scopeKey, client: effectiveClient, snapshot, loadedAt: new Date().toISOString() }); setSnapshotError(null); } })
        .catch(() => { if (active) setSnapshotError({ key: scopeKey, text: 'Impossible de lire les données du périmètre. Actualisez pour réessayer.' }); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [effectiveClient, data, baseLoading, scope, scopeKey]);
  const snapshot = !baseLoading && snapshotState?.client === effectiveClient && snapshotState.key === scopeKey ? snapshotState.snapshot : null;
  const error = baseError || (snapshotError?.key === scopeKey ? snapshotError.text : '');
  const loading = !error && (baseLoading || !snapshot);
  const options = useMemo(() => ({ asOfDate: cutoff }), [cutoff]);
  const overview = useMemo(() => snapshot ? buildKpiOverview(snapshot, options) : null, [snapshot, options]);
  const getSnapshot = useCallback(async () => {
    if (!snapshot) throw new Error('Données du périmètre non disponibles.');
    return snapshot;
  }, [snapshot]);
  const yearOptions = useMemo(() => [...new Set([
    ...Array.from({ length: 6 }, (_, index) => currentYear - index),
    ...(data?.actions || []).map((a) => Number(a.openedOn.slice(0, 4))).filter((y) => y > 2000 && y <= currentYear),
  ])].sort((a, b) => b - a).map((id) => ({ id, label: String(id) })), [data, currentYear]);

  return <section className="kpi-page">
    <header className="kpi-page-head"><div><h1>Pilotage QHSE</h1><p>L’essentiel de la flotte. Un rapport prêt à partager.</p></div><div className="kpi-head-actions">
      <button className="kpi-button" disabled={baseLoading} onClick={() => setRevision((r) => r + 1)}><RefreshCw size={16} />Actualiser</button>
      <button className="kpi-button" onClick={() => setDialog('definitions')}><BookOpen size={16} />Définitions</button>
    </div></header>
    <section className="kpi-filters" aria-label="Périmètre partagé de la synthèse et des rapports">
      <ScopeFilter label="Années" summary={[...years].sort().join(', ')} items={yearOptions} selected={years} onChange={setYears} required />
      <ScopeFilter label="Navires" summary={vessels.length ? `${vessels.length} sélectionné(s)` : 'Tous les navires'} items={(data?.vessels || []).map((v) => ({ id: v.id, label: v.name }))} selected={vessels} onChange={setVessels} disabled={baseLoading} />
      <ScopeFilter label="Projets" summary={projectIds.length ? `${projectIds.length} sélectionné(s)` : 'Tous les projets'} items={projects} selected={projectIds} onChange={setProjectIds} disabled={baseLoading || Boolean(projectError)} />
      <span className="kpi-freshness"><strong>{context?.previewMode ? 'Préversion · démonstration' : 'Source : Supabase'}</strong>{snapshot && snapshotState ? `Actualisé à ${new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(snapshotState.loadedAt))} · arrêté au ${cutoff.split('-').reverse().join('/')}` : loading ? 'Lecture des données…' : 'Données non disponibles'}</span>
    </section>
    {(error || projectError) && <div className="kpi-error" role="alert">{error || projectError}<button className="kpi-button" onClick={() => setRevision((r) => r + 1)}>Réessayer</button></div>}
    <KpiOverview snapshot={snapshot} options={options} loading={loading} onQuality={() => setDialog('quality')} />
    <QhseReportComposer reports={QHSE_REPORT_CATALOG} options={options} scopeKey={scopeKey} disabled={!snapshot || loading || Boolean(error)} getSnapshot={getSnapshot} snapshot={snapshot} />
    {dialog && <KpiDialog title={dialog === 'definitions' ? 'Définitions et formules' : 'Qualité et couverture des données'} onClose={() => setDialog(null)}>
      {dialog === 'definitions' ? <KpiDefinitions /> : <>
        <p>Les indicateurs et les PDF partagent le même périmètre. Les actions ouvertes sont une situation à la date d’édition ; les renouvellements RH concernent le mois en cours, indépendamment de l’année analysée.</p>
        {overview?.warnings.length ? <ul>{overview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p>{snapshot ? 'Aucune erreur de lecture signalée. Cela ne certifie pas l’exhaustivité des déclarations.' : 'Les données de ce périmètre ne sont pas encore disponibles.'}</p>}
        <p>Une donnée absente est affichée « — », jamais remplacée par zéro. Les filtres navire/projet ne ventilent pas les historiques entreprise. Les personnes du périmètre sont identifiées par les affectations du registre d’exposition.</p>
      </>}
    </KpiDialog>}
  </section>;
}
