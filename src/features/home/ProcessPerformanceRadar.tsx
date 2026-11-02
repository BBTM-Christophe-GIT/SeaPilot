import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowLeft, ArrowUpRight, CalendarDays, Check, ChevronDown, CircleHelp, Layers, MapPin, Radar, RefreshCw, Target, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RoleKey } from '../permissions/roles';
import type { ModuleKey } from '../permissions/moduleAccess';
import { PERFORMANCE_TASK_STATE_LABELS, performanceToday, prioritizeProcesses, type ProcessPerformance, type ProcessPerformanceTask } from './processPerformance';
import { fetchProcessPerformanceDashboard, invalidateProcessPerformanceCache, type ProcessPerformanceDashboard, type ProcessPerformanceEntity } from './processPerformanceQueries';
import { PerformanceRadarGraphic, type RadarAxis } from './PerformanceRadarGraphic';
import { ProcessScopeSelect } from './ProcessScopeSelect';
import { ProcessCriterionBars } from './ProcessCriterionBars';
import { summarizeProcessPerformance } from './processPerformanceSummary';
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

export function ProcessPerformancePanel({ processes: companyProcesses, entities = NO_ENTITIES, scopeLabel, onRefresh, onRequestEntities, entitiesLoading = false, entitiesError = false, refreshing = false, today = performanceToday() }: {
  processes: ProcessPerformance[];
  entities?: ProcessPerformanceEntity[];
  scopeLabel?: string;
  onRefresh?: () => void;
  onRequestEntities?: (ids?: number[]) => void;
  entitiesLoading?: boolean;
  entitiesError?: boolean;
  refreshing?: boolean;
  today?: string;
}) {
  const headingId = useId();
  const detailId = useId();
  const graphicRef = useRef<HTMLDivElement>(null);
  const [entityId, setEntityId] = useState('all');
  const [comparing, setComparing] = useState(false);
  const [backToUnits, setBackToUnits] = useState(false);
  const [selectedKey, setSelectedKey] = useState('');
  const [taskLimit, setTaskLimit] = useState(5);
  const entity = entities.find((item) => String(item.id) === entityId);
  const scopedProcesses = entity?.processes ?? companyProcesses;
  const processes = useMemo(() => scopedProcesses.filter((process) => process.key !== 'medicalLogbook'), [scopedProcesses]);
  const ranked = useMemo(() => prioritizeProcesses(processes), [processes]);
  const units = useMemo(() => entities.map((unit) => ({ ...unit, performance: summarizeProcessPerformance(unit.processes) })), [entities]);
  const aggregateLabel = scopeLabel || companyProcesses[0]?.scopeLabel || 'Périmètre compagnie';
  const activeScopeLabel = entity?.name || aggregateLabel;
  const focusedProcess = processes.find((process) => process.key === selectedKey);
  const selected = focusedProcess || ranked[0];
  const entityPending = entity?.processesLoaded === false;
  const unitsPending = comparing && entities.some((unit) => unit.processesLoaded === false);
  const loading = !entitiesError && Boolean(entityPending || unitsPending || entitiesLoading);
  const axes: RadarAxis[] = comparing
    ? units.map((unit) => ({ key: String(unit.id), label: unit.name, score: unit.processesLoaded === false ? null : unit.performance.score }))
    : processes.filter((process) => process.score !== null || processes.every((item) => item.score === null))
      .map((process) => ({ key: process.key, label: process.label, shortLabel: process.shortLabel, score: process.score }));
  const availableCount = processes.filter((process) => process.score !== null).length;
  const priority = ranked.find((process) => process.score !== null && process.score < 75);
  if (!companyProcesses.some((process) => process.key !== 'medicalLogbook')) return null;

  function selectProcess(key: string) {
    setSelectedKey((current) => current === key ? '' : key);
    setTaskLimit(5);
    window.requestAnimationFrame(() => graphicRef.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' }));
  }
  function chooseEntity(value: string, fromComparison = false) {
    setEntityId(value);
    setSelectedKey('');
    setTaskLimit(5);
    setComparing(false);
    setBackToUnits(fromComparison);
    onRequestEntities?.(value === 'all' ? [] : [Number(value)]);
    if (fromComparison) window.requestAnimationFrame(() => graphicRef.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' }));
  }
  function showUnits() {
    const next = !comparing;
    setComparing(next);
    setSelectedKey('');
    setTaskLimit(5);
    setBackToUnits(false);
    onRequestEntities?.(next ? undefined : entity ? [entity.id] : []);
  }
  function returnToUnits() {
    setComparing(true);
    setSelectedKey('');
    setBackToUnits(false);
    onRequestEntities?.();
  }

  return <section aria-labelledby={headingId} className="process-performance-panel sp-panel" aria-busy={refreshing || loading}>
    <header className="process-performance-header"><div><span className="process-performance-eyebrow"><Radar size={15} />Pilotage des processus</span>
      <h2 id={headingId}>Où agir en priorité ?</h2><p>La situation, les actions engagées et les prochaines échéances au même endroit.</p>
      <div className="process-performance-controls"><ProcessScopeSelect aggregateLabel={aggregateLabel} entities={entities} onChange={chooseEntity} value={entity ? String(entity.id) : 'all'} />
        {entities.length ? <button aria-pressed={comparing} className="process-compare-toggle" onClick={showUnits} type="button"><Layers size={14} />Comparer les unités</button> : null}
      </div></div>
      <div className="process-performance-header-actions"><span>Campagne {today.slice(0, 4)}</span>{onRefresh ? <button aria-label="Actualiser la performance des processus" disabled={refreshing || loading} onClick={onRefresh} type="button"><RefreshCw className={refreshing ? 'is-spinning' : ''} size={16} /></button> : null}</div>
    </header>
    <div className="process-performance-overview"><div className="process-performance-map" ref={graphicRef}>
      <div className="process-radar-view-heading"><div><strong>{comparing ? 'Performance globale des unités' : focusedProcess ? `Composantes · ${focusedProcess.label}` : 'Vue globale des processus'}</strong>
        <small>{comparing ? `${units.length} unités · cliquez sur une unité pour voir ses processus` : activeScopeLabel}</small></div>
        {focusedProcess ? <button onClick={() => { setSelectedKey(''); setTaskLimit(5); }} type="button"><ArrowLeft size={13} />Vue globale</button>
          : backToUnits && !comparing ? <button onClick={returnToUnits} type="button"><ArrowLeft size={13} />Toutes les unités</button> : null}
      </div>
      {entitiesError ? <p className="process-unavailable" role="alert">Les performances de cette sélection n’ont pas pu être chargées. Utilisez Actualiser pour réessayer.</p>
        : (comparing && unitsPending) || (!comparing && entityPending) ? <p className="process-selection-loading" role="status"><RefreshCw size={18} />Chargement des performances {comparing ? 'des unités' : 'de cette unité'}…</p>
          : focusedProcess ? <ProcessCriterionBars process={focusedProcess} />
            : axes.length ? <PerformanceRadarGraphic axes={axes} onSelect={comparing ? (key) => chooseEntity(key, true) : selectProcess} selectedKey="" title={comparing ? 'Performance globale des unités sur 100' : 'Performance des processus sur 100'} />
              : <p className="process-comparison-empty">Aucun processus applicable à ce périmètre.</p>}
      {comparing ? <p className="process-units-methodology">Chaque axe représente une unité. La note globale est la moyenne à poids égaux de ses processus notés. Les processus non applicables sont exclus ; une source indisponible suspend la note.</p>
        : !focusedProcess && !entityPending ? <>
          <p className="process-radar-data-note">{availableCount}/{processes.length} processus renseignés{availableCount < processes.length ? ' · les processus non notés restent accessibles à droite.' : ''}</p>
          <div className={`process-priority-note ${priority ? `is-${tone(priority.score)}` : ''}`}><Target size={18} /><span>{priority ? <><strong>Priorité : {priority.label}</strong><small>Score le plus faible : {scoreLabel(priority.score)}. Sélectionnez un processus pour passer à l’action.</small></> : <><strong>{availableCount ? 'Gardez une longueur d’avance' : 'Données à compléter'}</strong><small>{availableCount ? 'Consultez les échéances et les actions déjà planifiées.' : 'Les données indisponibles ne sont pas notées comme conformes.'}</small></>}</span></div>
        </> : null}
    </div>
    <div className="process-performance-ranking" aria-label={comparing ? 'Sélectionner une unité' : 'Sélectionner un processus'} role="group">
      {comparing ? units.map((unit, index) => <button className={`process-ranking-row is-${tone(unit.performance.score)}`} key={unit.id} onClick={() => chooseEntity(String(unit.id), true)} type="button">
        <span className="process-ranking-number">{String(index + 1).padStart(2, '0')}</span><span className="process-ranking-copy"><strong>{unit.name}</strong><small>{unit.processesLoaded === false ? 'Calcul à la demande…' : `${unit.performance.ratedCount}/${unit.performance.totalCount} processus renseignés`}</small><span className="process-ranking-track"><i style={{ width: `${unit.performance.score ?? 0}%` }} /></span></span>
        <span className="process-ranking-score">{unit.processesLoaded === false ? '…' : scoreLabel(unit.performance.score)}<small>{unit.processesLoaded === false ? 'Chargement' : unit.performance.unavailableCount ? 'Données indisponibles' : 'Note globale'}</small></span>
      </button>) : ranked.map((process, index) => <button aria-controls={detailId} aria-pressed={focusedProcess?.key === process.key} className={`process-ranking-row is-${tone(process.score)} ${focusedProcess?.key === process.key ? 'is-selected' : ''}`} key={process.key} onClick={() => selectProcess(process.key)} type="button">
        <span className="process-ranking-number">{String(index + 1).padStart(2, '0')}</span><span className="process-ranking-copy"><strong>{process.label}</strong><small>{process.unavailableSources.length ? 'Données indisponibles' : process.summary}</small><span className="process-ranking-track"><i style={{ width: `${process.score ?? 0}%` }} /></span></span>
        <span className="process-ranking-score">{scoreLabel(process.score)}<small>{process.score === null ? process.unavailableSources.length ? 'Indisponible' : 'Non noté' : process.score < 40 ? 'Prioritaire' : process.score < 75 ? 'À renforcer' : 'Sous contrôle'}</small></span>
      </button>)}
    </div></div>
    {!comparing && selected && !entityPending ? <div className={`process-performance-detail is-${tone(selected.score)}`} id={detailId}>
      <header><div><span className="process-performance-eyebrow">Comprendre le score · {activeScopeLabel}</span><h3>{selected.label} <span>{scoreLabel(selected.score)}</span></h3><p>{selected.unavailableSources.length ? 'La lecture est incomplète ; les compteurs et les actions seront actualisés au chargement des sources.' : selected.summary}</p></div><Link className="process-open-module" to={selected.to}>Ouvrir le module <ArrowUpRight size={16} /></Link></header>
      {selected.unavailableSources.length ? <p className="process-unavailable" role="status"><TriangleAlert size={17} />Sources indisponibles : {selected.unavailableSources.join(', ')}. Le score sera calculé après leur chargement.</p> : null}
      {!focusedProcess ? <div className="process-score-breakdown" aria-label={`Composition du score ${selected.label}`}>
        {selected.criteria.map((criterion) => <div className="process-score-criterion" key={criterion.id}><div><strong>{criterion.label}</strong><span>{scoreLabel(criterion.score)}</span></div><progress aria-label={criterion.label} max={100} value={criterion.score ?? 0} /><small>{criterion.score === null ? 'Non applicable ou données manquantes' : `Poids : ${criterion.weight} %`}</small><p>{criterion.score === null && selected.unavailableSources.length ? 'Les sources nécessaires au calcul sont indisponibles.' : criterion.detail}</p></div>)}
      </div> : null}
      <div className="process-tasks-heading"><h4>Les actions derrière la note <span>{selected.tasks.length}</span></h4><span><i />En retard <i />À planifier <i />En cours / planifié</span></div>
      {selected.tasks.length && !selected.unavailableSources.length ? <div className="process-task-list">{selected.tasks.slice(0, taskLimit).map((task) => <PerformanceTask key={task.id} task={task} />)}{selected.tasks.length > taskLimit ? <button className="process-show-more" onClick={() => setTaskLimit((current) => current + 10)} type="button">Voir {Math.min(10, selected.tasks.length - taskLimit)} actions de plus <ChevronDown size={15} /></button> : null}</div>
        : <p className="process-tasks-empty"><Check size={18} />{selected.unavailableSources.length ? 'Chargez les sources pour connaître les actions à suivre.' : selected.score === null ? 'Aucune obligation renseignée pour ce processus.' : 'Aucune action en attente sur ce périmètre.'}</p>}
      <details className="process-methodology"><summary><CircleHelp size={14} />Comment lire ces scores ?</summary><p>Les scores mesurent la maîtrise des obligations et leur prise en charge. Les critères sans obligation sont exclus et les poids restants sont normalisés. Une réservation améliore l’anticipation sans prouver la conformité. Les sources indisponibles suspendent la note. {activeScopeLabel}, collaborateurs présents, année {today.slice(0, 4)}. Cliquez sur un processus pour afficher ses composantes en barres ; cliquez à nouveau pour retrouver le radar. Comparer les unités affiche leurs notes globales, puis un clic sur une unité ouvre ses processus. Les droits réels s’appliquent à chaque niveau. Le périmètre compagnie inclut les éléments sans affectation.</p></details>
    </div> : null}
  </section>;
}

export function ProcessPerformanceRadar({ client, roles, personId = null, moduleKeys }: ProcessPerformanceRadarProps) {
  const [state, setState] = useState<{ dashboard: ProcessPerformanceDashboard | null; loading: boolean; error: boolean; contextKey: string; client: SupabaseClient | null }>({ dashboard: null, loading: true, error: false, contextKey: '', client: null });
  const [refreshToken, setRefreshToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [entitiesError, setEntitiesError] = useState(false);
  const [requested, setRequested] = useState({ contextKey: '', value: '' });
  const lastFocusRefresh = useRef(0);
  const rolesKey = [...roles].sort().join(',');
  const modulesKey = moduleKeys ? [...moduleKeys].sort().join(',') : undefined;
  const today = performanceToday();
  const contextKey = JSON.stringify([rolesKey, personId, modulesKey, today]);
  const requestKey = requested.contextKey === contextKey ? requested.value : '';
  const allowed = roles.length > 0;

  useEffect(() => {
    if (!allowed) return;
    const refresh = () => {
      invalidateProcessPerformanceCache(client);
      setRefreshing(true);
      setEntitiesError(false);
      setRefreshToken((value) => value + 1);
    };
    const onFocus = () => {
      const now = Date.now();
      if (now - lastFocusRefresh.current < 30_000) return;
      lastFocusRefresh.current = now;
      refresh();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('seapilot:hr-actions-changed', refresh);
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('seapilot:hr-actions-changed', refresh); };
  }, [allowed, client]);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    const options = { includeEntities: Boolean(requestKey), ...(requestKey && requestKey !== 'all' ? { entityIds: requestKey.split(',').map(Number) } : {}) };
    void fetchProcessPerformanceDashboard(client, rolesKey.split(',') as RoleKey[], today, personId, modulesKey === undefined ? undefined : modulesKey ? modulesKey.split(',') as ModuleKey[] : [], options).then((dashboard) => {
      if (!cancelled) {
        setState({ dashboard, loading: false, error: false, contextKey, client });
        setRefreshing(false);
        setEntitiesError(false);
      }
    }).catch(() => {
      if (cancelled) return;
      setState((previous) => requestKey && previous.client === client && previous.contextKey === contextKey
        ? previous : { dashboard: null, loading: false, error: true, contextKey, client });
      setEntitiesError(Boolean(requestKey));
      setRefreshing(false);
    });
    return () => { cancelled = true; };
  }, [client, rolesKey, allowed, refreshToken, personId, modulesKey, contextKey, requestKey, today]);

  if (!allowed) return null;
  if (state.loading || state.contextKey !== contextKey || state.client !== client) return <section className="process-performance-loading" role="status"><Radar size={23} />Lecture des processus et de leurs échéances…</section>;
  if (state.error) return <section className="process-performance-loading" role="status"><TriangleAlert size={20} />Les performances n’ont pas pu être chargées.<button onClick={() => { invalidateProcessPerformanceCache(client); setRefreshToken((value) => value + 1); }} type="button">Réessayer</button></section>;
  return <ProcessPerformancePanel key={contextKey} entities={state.dashboard?.entities} entitiesError={entitiesError}
    onRequestEntities={(ids) => { setEntitiesError(false); setRequested({ contextKey, value: ids === undefined ? 'all' : ids.join(',') }); }}
    onRefresh={() => { invalidateProcessPerformanceCache(client); setRefreshing(true); setEntitiesError(false); setRefreshToken((value) => value + 1); }}
    processes={state.dashboard?.processes || []} refreshing={refreshing} scopeLabel={state.dashboard?.scopeLabel} today={today} />;
}
