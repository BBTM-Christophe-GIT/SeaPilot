import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowLeft, ArrowUpRight, CalendarDays, Check, ChevronDown, CircleHelp, Layers, MapPin, Radar, RefreshCw, Target, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RoleKey } from '../permissions/roles';
import type { ModuleKey } from '../permissions/moduleAccess';
import { PERFORMANCE_TASK_STATE_LABELS, performanceToday, prioritizeProcesses, type ProcessPerformance, type ProcessPerformanceTask } from './processPerformance';
import { fetchProcessPerformanceDashboard, type ProcessPerformanceDashboard, type ProcessPerformanceEntity } from './processPerformanceQueries';
import { PerformanceRadarGraphic, type RadarAxis, type RadarSeries } from './PerformanceRadarGraphic';
import { ProcessScopeSelect } from './ProcessScopeSelect';
import './processPerformance.css';

interface ProcessPerformanceRadarProps {
  client: SupabaseClient;
  roles: RoleKey[];
  personId?: number | null;
  moduleKeys?: ModuleKey[];
}

function tone(score: number | null): string { return score === null ? 'unknown' : score < 40 ? 'danger' : score < 75 ? 'warning' : 'success'; }
function scoreLabel(score: number | null): string { return score === null ? '—' : `${score} %`; }
function shortDate(value: string): string {
  return value ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : 'À préciser';
}
const NO_ENTITIES: ProcessPerformanceEntity[] = [];

function PerformanceTask({ task }: { task: ProcessPerformanceTask }) {
  return <Link className={`process-task is-${task.state}`} to={task.to}>
    <span className="process-task-marker" aria-hidden="true" />
    <span className="process-task-copy"><strong>{task.title}</strong><span>{task.context}</span>
      <small><CalendarDays size={12} />{task.scheduledOn ? `Prévu le ${shortDate(task.scheduledOn)}` : `Échéance : ${shortDate(task.dueOn)}`}
        {task.location ? <><MapPin size={12} />{task.location}</> : null}</small></span>
    <span className="process-task-status">{PERFORMANCE_TASK_STATE_LABELS[task.state]}</span><ArrowUpRight aria-hidden="true" size={16} />
  </Link>;
}

export function ProcessPerformancePanel({ processes: companyProcesses, entities = NO_ENTITIES, scopeLabel, onRefresh, refreshing = false, today = performanceToday() }: {
  processes: ProcessPerformance[];
  entities?: ProcessPerformanceEntity[];
  scopeLabel?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  today?: string;
}) {
  const headingId = useId();
  const detailId = useId();
  const [entityId, setEntityId] = useState('all');
  const [comparing, setComparing] = useState(false);
  const [comparisonIds, setComparisonIds] = useState<number[] | null>(null);
  const entity = entities.find((item) => String(item.id) === entityId);
  const processes = entity?.processes ?? companyProcesses;
  const aggregateLabel = scopeLabel || companyProcesses[0]?.scopeLabel || 'Périmètre compagnie';
  const activeScopeLabel = entity?.name || aggregateLabel;
  const ranked = useMemo(() => prioritizeProcesses(processes), [processes]);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [taskLimit, setTaskLimit] = useState(5);
  const focusedProcess = processes.find((process) => process.key === selectedKey);
  const selected = focusedProcess || ranked[0];
  const compared = entities.filter((item) => (comparisonIds ?? entities.slice(0, 3).map((unit) => unit.id)).includes(item.id));
  const axes: RadarAxis[] = focusedProcess
    ? focusedProcess.criteria.map((criterion) => ({ key: criterion.id, label: criterion.label, score: criterion.score }))
    : processes.filter((process) => comparing || process.score !== null || processes.every((item) => item.score === null))
      .map((process) => ({ key: process.key, label: process.label, shortLabel: process.shortLabel, score: process.score }));
  const series: RadarSeries[] | undefined = comparing ? compared.map((unit) => {
    const unitProcess = unit.processes.find((process) => process.key === focusedProcess?.key);
    return { key: String(unit.id), label: unit.name, values: Object.fromEntries(axes.map((axis) => [axis.key, focusedProcess
      ? unitProcess?.criteria.find((criterion) => criterion.id === axis.key)?.score ?? null
      : unit.processes.find((process) => process.key === axis.key)?.score ?? null])) };
  }) : undefined;
  const availableCount = processes.filter((process) => process.score !== null).length;
  const priority = ranked.find((process) => process.score !== null && process.score < 75);
  if (!selected) return null;
  const select = (key: string) => { setSelectedKey((current) => current === key ? '' : key); setTaskLimit(5); };
  const toggleComparison = (id: number) => {
    const current = compared.map((item) => item.id);
    setComparisonIds(current.includes(id) ? current.filter((value) => value !== id) : current.length < 4 ? [...current, id] : current);
  };
  return <section aria-labelledby={headingId} className="process-performance-panel sp-panel" aria-busy={refreshing}>
    <header className="process-performance-header"><div><span className="process-performance-eyebrow"><Radar size={15} />Pilotage des processus</span>
      <h2 id={headingId}>Où agir en priorité ?</h2><p>La situation, les actions engagées et les prochaines échéances au même endroit.</p>
      <div className="process-performance-controls"><ProcessScopeSelect aggregateLabel={aggregateLabel} entities={entities} onChange={(value) => { setEntityId(value); setTaskLimit(5); }} value={entity ? String(entity.id) : 'all'} />
        {entities.length > 1 ? <button aria-pressed={comparing} className="process-compare-toggle" onClick={() => setComparing((value) => !value)} type="button"><Layers size={14} />Comparer les unités</button> : null}
      </div></div>
      <div className="process-performance-header-actions"><span>Campagne {today.slice(0, 4)}</span>{onRefresh ? <button aria-label="Actualiser la performance des processus" disabled={refreshing} onClick={onRefresh} type="button"><RefreshCw className={refreshing ? 'is-spinning' : ''} size={16} /></button> : null}</div>
    </header>
    {comparing ? <fieldset className="process-comparison-units"><legend>Navires, bureaux et quais à comparer <small>4 maximum · mêmes axes pour chaque unité</small></legend>
      {entities.map((unit) => <label key={unit.id}><input checked={compared.some((item) => item.id === unit.id)} disabled={compared.length >= 4 && !compared.some((item) => item.id === unit.id)} onChange={() => toggleComparison(unit.id)} type="checkbox" /><span>{unit.name}</span></label>)}
      <p className="process-comparison-context">Classement et actions : {activeScopeLabel}.</p>
    </fieldset> : null}
    <div className="process-performance-overview"><div className="process-performance-map">
      <div className="process-radar-view-heading"><div><strong>{focusedProcess ? `Composantes · ${focusedProcess.label}` : comparing ? 'Comparer les performances' : 'Vue globale des processus'}</strong><small>{comparing ? `${compared.length} unité${compared.length > 1 ? 's' : ''} comparée${compared.length > 1 ? 's' : ''}` : activeScopeLabel}</small></div>
        {focusedProcess ? <button onClick={() => { setSelectedKey(''); setTaskLimit(5); }} type="button"><ArrowLeft size={13} />Vue globale</button> : null}</div>
      {!comparing ? <div className="process-radar-legend"><small>{focusedProcess ? `${axes.filter((axis) => axis.score !== null).length}/${axes.length} composantes renseignées` : `${availableCount}/${processes.length} processus renseignés`}</small></div> : null}
      {comparing && !compared.length ? <p className="process-comparison-empty" role="status">Sélectionnez au moins une unité pour tracer sa performance.</p>
        : axes.length ? <PerformanceRadarGraphic axes={axes} onSelect={focusedProcess ? undefined : select} selectedKey={selectedKey} series={series} title={focusedProcess ? `Composantes du score ${focusedProcess.label} sur 100` : 'Performance des processus sur 100'} />
          : <p className="process-comparison-empty">Aucune composante renseignée pour ce processus.</p>}
      {!focusedProcess && !comparing && availableCount < processes.length ? <p className="process-radar-data-note">{processes.length - availableCount} processus non noté{processes.length - availableCount > 1 ? 's' : ''} : consultez les cartes. Le tracé utilise les processus renseignés.</p> : null}
      <div className={`process-priority-note ${priority ? `is-${tone(priority.score)}` : ''}`}><Target size={18} /><span>{priority ? <><strong>Priorité : {priority.label}</strong><small>Score le plus faible : {scoreLabel(priority.score)}. Sélectionnez un processus pour passer à l’action.</small></> : <><strong>{availableCount ? 'Gardez une longueur d’avance' : 'Données à compléter'}</strong><small>{availableCount ? 'Consultez les échéances et les actions déjà planifiées.' : 'Les données indisponibles ne sont pas notées comme conformes.'}</small></>}</span></div>
    </div>
    <div className="process-performance-ranking" aria-label="Sélectionner un processus" role="group">
      {ranked.map((process, index) => <button aria-controls={detailId} aria-pressed={focusedProcess?.key === process.key} className={`process-ranking-row is-${tone(process.score)} ${focusedProcess?.key === process.key ? 'is-selected' : ''}`} key={process.key} onClick={() => select(process.key)} type="button">
        <span className="process-ranking-number">{String(index + 1).padStart(2, '0')}</span><span className="process-ranking-copy"><strong>{process.label}</strong><small>{process.unavailableSources.length ? 'Données indisponibles' : process.summary}</small><span className="process-ranking-track"><i style={{ width: `${process.score ?? 0}%` }} /></span></span>
        <span className="process-ranking-score">{scoreLabel(process.score)}<small>{process.score === null ? process.unavailableSources.length ? 'Indisponible' : 'Non noté' : process.score < 40 ? 'Prioritaire' : process.score < 75 ? 'À renforcer' : 'Sous contrôle'}</small></span>
      </button>)}
    </div></div>
    <div className={`process-performance-detail is-${tone(selected.score)}`} id={detailId}>
      <header><div><span className="process-performance-eyebrow">Comprendre le score · {activeScopeLabel}</span><h3>{selected.label} <span>{scoreLabel(selected.score)}</span></h3><p>{selected.unavailableSources.length ? 'La lecture est incomplète ; les compteurs et les actions seront actualisés au chargement des sources.' : selected.summary}</p></div><Link className="process-open-module" to={selected.to}>Ouvrir le module <ArrowUpRight size={16} /></Link></header>
      {selected.unavailableSources.length ? <p className="process-unavailable" role="status"><TriangleAlert size={17} />Sources indisponibles : {selected.unavailableSources.join(', ')}. Le score sera calculé après leur chargement.</p> : null}
      <div className="process-score-breakdown" aria-label={`Composition du score ${selected.label}`}>
        {selected.criteria.map((criterion) => <div className="process-score-criterion" key={criterion.id}><div><strong>{criterion.label}</strong><span>{scoreLabel(criterion.score)}</span></div><progress aria-label={criterion.label} max={100} value={criterion.score ?? 0} /><small>{criterion.score === null ? 'Non applicable ou données manquantes' : `Poids : ${criterion.weight} %`}</small><p>{criterion.score === null && selected.unavailableSources.length ? 'Les sources nécessaires au calcul sont indisponibles.' : criterion.detail}</p></div>)}
      </div>
      <div className="process-tasks-heading"><h4>Les actions derrière la note <span>{selected.tasks.length}</span></h4><span><i />En retard <i />À planifier <i />En cours / planifié</span></div>
      {selected.tasks.length && !selected.unavailableSources.length ? <div className="process-task-list">{selected.tasks.slice(0, taskLimit).map((task) => <PerformanceTask key={task.id} task={task} />)}{selected.tasks.length > taskLimit ? <button className="process-show-more" onClick={() => setTaskLimit((current) => current + 10)} type="button">Voir {Math.min(10, selected.tasks.length - taskLimit)} actions de plus <ChevronDown size={15} /></button> : null}</div>
        : <p className="process-tasks-empty"><Check size={18} />{selected.unavailableSources.length ? 'Chargez les sources pour connaître les actions à suivre.' : selected.score === null ? 'Aucune obligation renseignée pour ce processus.' : 'Aucune action en attente sur ce périmètre.'}</p>}
      <details className="process-methodology"><summary><CircleHelp size={14} />Comment lire ces scores ?</summary><p>Les scores mesurent la maîtrise des obligations et leur prise en charge. La moyenne utilise les poids des critères applicables : les critères sans obligation sont exclus. Une réservation améliore l’anticipation ; elle ne prouve pas la conformité ni la réalisation. Les données indisponibles suspendent la note du processus. {activeScopeLabel}, collaborateurs présents, année {today.slice(0, 4)}, échéances documentaires à 90 jours. Les processus, critères et actions suivent vos autorisations réelles. Les liens ouvrent les dossiers et menus concernés. Cliquez sur un processus pour afficher ses composantes ; cliquez à nouveau pour revenir à la vue globale. La comparaison utilise les mêmes axes et conserve les valeurs non applicables sans les remplacer par zéro. Le périmètre compagnie inclut aussi les éléments sans affectation.</p></details>
    </div>
  </section>;
}

export function ProcessPerformanceRadar({ client, roles, personId = null, moduleKeys }: ProcessPerformanceRadarProps) {
  const [state, setState] = useState<{ dashboard: ProcessPerformanceDashboard | null; loading: boolean; error: boolean; contextKey: string; client: SupabaseClient | null }>({ dashboard: null, loading: true, error: false, contextKey: '', client: null });
  const [refreshToken, setRefreshToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const rolesKey = roles.join(',');
  const modulesKey = moduleKeys?.join(',');
  const contextKey = JSON.stringify([rolesKey, personId, modulesKey]);
  const allowed = roles.length > 0;
  useEffect(() => {
    if (!allowed) return;
    const refresh = () => { setRefreshing(true); setRefreshToken((value) => value + 1); };
    window.addEventListener('focus', refresh);
    window.addEventListener('seapilot:hr-actions-changed', refresh);
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('seapilot:hr-actions-changed', refresh); };
  }, [allowed]);
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    void fetchProcessPerformanceDashboard(client, rolesKey.split(',') as RoleKey[], undefined, personId, modulesKey === undefined ? undefined : modulesKey ? modulesKey.split(',') as ModuleKey[] : []).then((dashboard) => {
      if (!cancelled) { setState({ dashboard, loading: false, error: false, contextKey, client }); setRefreshing(false); }
    }).catch(() => { if (!cancelled) { setState({ dashboard: null, loading: false, error: true, contextKey, client }); setRefreshing(false); } });
    return () => { cancelled = true; };
  }, [client, rolesKey, allowed, refreshToken, personId, modulesKey, contextKey]);
  if (!allowed) return null;
  if (state.loading || state.contextKey !== contextKey || state.client !== client) return <section className="process-performance-loading" role="status"><Radar size={23} />Lecture des processus et de leurs échéances…</section>;
  if (state.error) return <section className="process-performance-loading" role="status"><TriangleAlert size={20} />Les performances n’ont pas pu être chargées.<button onClick={() => setRefreshToken((value) => value + 1)} type="button">Réessayer</button></section>;
  return <ProcessPerformancePanel key={contextKey} entities={state.dashboard?.entities} onRefresh={() => { setRefreshing(true); setRefreshToken((value) => value + 1); }} processes={state.dashboard?.processes || []} refreshing={refreshing} scopeLabel={state.dashboard?.scopeLabel} />;
}
