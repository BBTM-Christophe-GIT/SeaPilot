import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowUpRight, CalendarDays, Check, ChevronDown, CircleHelp, MapPin, Radar, RefreshCw, Target, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RoleKey } from '../permissions/roles';
import type { ModuleKey } from '../permissions/moduleAccess';
import { PERFORMANCE_TASK_STATE_LABELS, performanceToday, prioritizeProcesses, type ProcessPerformance, type ProcessPerformanceTask } from './processPerformance';
import { fetchProcessPerformance } from './processPerformanceQueries';
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
function point(index: number, count: number, radius: number): [number, number] {
  const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
  return [240 + Math.cos(angle) * radius, 205 + Math.sin(angle) * radius];
}
const pointsString = (points: Array<[number, number]>) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

export function PerformanceRadarGraphic({ processes, selectedKey, onSelect }: {
  processes: ProcessPerformance[];
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  const titleId = useId();
  const gradientId = useId().replace(/:/g, '');
  if (!processes.length) return null;
  const available = processes.filter((process) => process.score !== null);
  const count = Math.max(3, available.length);
  const shape = available.map((process, index) => point(index, count, 139 * process.score! / 100));
  return <div className="process-radar-graphic">
    <svg aria-labelledby={titleId} role="img" viewBox="0 0 480 414">
      <title id={titleId}>Performance des processus sur 100. {processes.map((process) => `${process.label} : ${process.score === null ? 'indisponible' : `${process.score} pour cent`}`).join('. ')}</title>
      <defs><linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stopColor="#1b72eb" stopOpacity=".38" /><stop offset="100%" stopColor="#16b8aa" stopOpacity=".12" /></linearGradient></defs>
      {[20, 40, 60, 80, 100].map((level) => <g className="process-radar-ring" key={level}>
        <polygon points={pointsString(Array.from({ length: count }, (_, index) => point(index, count, 139 * level / 100)))} />
        <text x="245" y={205 - 139 * level / 100 + 13}>{level}</text>
      </g>)}
      {available.map((process, index) => {
        const [x, y] = point(index, count, 139);
        return <line className={`process-radar-spoke ${process.key === selectedKey ? 'is-selected' : ''}`} key={process.key} x1="240" x2={x} y1="205" y2={y} />;
      })}
      {available.length >= 3 ? <polygon className="process-radar-shape" fill={`url(#${gradientId})`} points={pointsString(shape)} /> : null}
      {available.map((process, index) => {
        const [x, y] = shape[index];
        const [labelX, labelY] = point(index, count, 182);
        return <g key={process.key}>
          {process.score !== null ? <circle className={`process-radar-dot is-${tone(process.score)} ${selectedKey === process.key ? 'is-selected' : ''}`} cx={x} cy={y} r={selectedKey === process.key ? 7 : 5} /> : null}
          <text className={`process-radar-axis-label ${selectedKey === process.key ? 'is-selected' : ''}`} onClick={() => onSelect(process.key)} textAnchor="middle" x={labelX} y={labelY - 4} aria-hidden="true">{process.shortLabel}</text>
          <text aria-hidden="true" className={`process-radar-axis-score is-${tone(process.score)}`} onClick={() => onSelect(process.key)} textAnchor="middle" x={labelX} y={labelY + 15}>{scoreLabel(process.score)}</text>
        </g>;
      })}
    </svg>
    {available.length < processes.length ? <p className="process-radar-data-note">{processes.length - available.length} processus non noté{processes.length - available.length > 1 ? 's' : ''} : consultez le détail. Le tracé utilise les processus renseignés.</p> : null}
  </div>;
}

function PerformanceTask({ task }: { task: ProcessPerformanceTask }) {
  return <Link className={`process-task is-${task.state}`} to={task.to}>
    <span className="process-task-marker" aria-hidden="true" />
    <span className="process-task-copy"><strong>{task.title}</strong><span>{task.context}</span>
      <small><CalendarDays size={12} />{task.scheduledOn ? `Prévu le ${shortDate(task.scheduledOn)}` : `Échéance : ${shortDate(task.dueOn)}`}
        {task.location ? <><MapPin size={12} />{task.location}</> : null}</small></span>
    <span className="process-task-status">{PERFORMANCE_TASK_STATE_LABELS[task.state]}</span><ArrowUpRight aria-hidden="true" size={16} />
  </Link>;
}

export function ProcessPerformancePanel({ processes, onRefresh, refreshing = false, today = performanceToday() }: {
  processes: ProcessPerformance[];
  onRefresh?: () => void;
  refreshing?: boolean;
  today?: string;
}) {
  const headingId = useId();
  const detailId = useId();
  const ranked = useMemo(() => prioritizeProcesses(processes), [processes]);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [taskLimit, setTaskLimit] = useState(5);
  const selected = processes.find((process) => process.key === selectedKey) || ranked[0];
  const availableCount = processes.filter((process) => process.score !== null).length;
  const priority = ranked.find((process) => process.score !== null && process.score < 75);
  if (!selected) return null;
  const select = (key: string) => { setSelectedKey(key); setTaskLimit(5); };
  return <section aria-labelledby={headingId} className="process-performance-panel sp-panel" aria-busy={refreshing}>
    <header className="process-performance-header"><div><span className="process-performance-eyebrow"><Radar size={15} />Pilotage des processus</span>
      <h2 id={headingId}>Où agir en priorité ?</h2><p>La situation, les actions engagées et les prochaines échéances au même endroit.</p><small className="process-performance-scope">{selected.scopeLabel || 'Périmètre compagnie'}</small></div>
      <div className="process-performance-header-actions"><span>Campagne {today.slice(0, 4)}</span>{onRefresh ? <button aria-label="Actualiser la performance des processus" disabled={refreshing} onClick={onRefresh} type="button"><RefreshCw className={refreshing ? 'is-spinning' : ''} size={16} /></button> : null}</div>
    </header>
    <div className="process-performance-overview"><div className="process-performance-map">
      <div className="process-radar-legend"><span><i />Performance</span><span><i />Objectif 100 %</span><small>{availableCount}/{processes.length} processus renseignés</small></div>
      <PerformanceRadarGraphic onSelect={select} processes={processes} selectedKey={selected.key} />
      <div className={`process-priority-note ${priority ? `is-${tone(priority.score)}` : ''}`}><Target size={18} /><span>{priority ? <><strong>Priorité : {priority.label}</strong><small>Score le plus faible : {scoreLabel(priority.score)}. Sélectionnez un processus pour passer à l’action.</small></> : <><strong>{availableCount ? 'Gardez une longueur d’avance' : 'Données à compléter'}</strong><small>{availableCount ? 'Consultez les échéances et les actions déjà planifiées.' : 'Les données indisponibles ne sont pas notées comme conformes.'}</small></>}</span></div>
    </div>
    <div className={`process-performance-ranking${ranked.length > 6 ? ' is-many' : ''}`} aria-label="Sélectionner un processus">
      {ranked.map((process, index) => <button aria-controls={detailId} aria-pressed={selected.key === process.key} className={`process-ranking-row is-${tone(process.score)} ${selected.key === process.key ? 'is-selected' : ''}`} key={process.key} onClick={() => select(process.key)} type="button">
        <span className="process-ranking-number">{String(index + 1).padStart(2, '0')}</span><span className="process-ranking-copy"><strong>{process.label}</strong><small>{process.unavailableSources.length ? 'Données indisponibles' : process.summary}</small><span className="process-ranking-track"><i style={{ width: `${process.score ?? 0}%` }} /></span></span>
        <span className="process-ranking-score">{scoreLabel(process.score)}<small>{process.score === null ? process.unavailableSources.length ? 'Indisponible' : 'Non noté' : process.score < 40 ? 'Prioritaire' : process.score < 75 ? 'À renforcer' : 'Sous contrôle'}</small></span>
      </button>)}
    </div></div>
    <div className={`process-performance-detail is-${tone(selected.score)}`} id={detailId}>
      <header><div><span className="process-performance-eyebrow">Comprendre le score</span><h3>{selected.label} <span>{scoreLabel(selected.score)}</span></h3><p>{selected.unavailableSources.length ? 'La lecture est incomplète ; les compteurs et les actions seront actualisés au chargement des sources.' : selected.summary}</p></div><Link className="process-open-module" to={selected.to}>Ouvrir le module <ArrowUpRight size={16} /></Link></header>
      {selected.unavailableSources.length ? <p className="process-unavailable" role="status"><TriangleAlert size={17} />Sources indisponibles : {selected.unavailableSources.join(', ')}. Le score sera calculé après leur chargement.</p> : null}
      <div className="process-score-breakdown" aria-label={`Composition du score ${selected.label}`}>
        {selected.criteria.map((criterion) => <div className="process-score-criterion" key={criterion.id}><div><strong>{criterion.label}</strong><span>{scoreLabel(criterion.score)}</span></div><progress aria-label={criterion.label} max={100} value={criterion.score ?? 0} /><small>{criterion.score === null ? 'Non applicable ou données manquantes' : `Poids : ${criterion.weight} %`}</small><p>{criterion.score === null && selected.unavailableSources.length ? 'Les sources nécessaires au calcul sont indisponibles.' : criterion.detail}</p></div>)}
      </div>
      <div className="process-tasks-heading"><h4>Les actions derrière la note <span>{selected.tasks.length}</span></h4><span><i />En retard <i />À planifier <i />En cours / planifié</span></div>
      {selected.tasks.length && !selected.unavailableSources.length ? <div className="process-task-list">{selected.tasks.slice(0, taskLimit).map((task) => <PerformanceTask key={task.id} task={task} />)}{selected.tasks.length > taskLimit ? <button className="process-show-more" onClick={() => setTaskLimit((current) => current + 10)} type="button">Voir {Math.min(10, selected.tasks.length - taskLimit)} actions de plus <ChevronDown size={15} /></button> : null}</div>
        : <p className="process-tasks-empty"><Check size={18} />{selected.unavailableSources.length ? 'Chargez les sources pour connaître les actions à suivre.' : selected.score === null ? 'Aucune obligation renseignée pour ce processus.' : 'Aucune action en attente sur ce périmètre.'}</p>}
      <details className="process-methodology"><summary><CircleHelp size={14} />Comment lire ces scores ?</summary><p>Les scores mesurent la maîtrise des obligations et leur prise en charge. La moyenne utilise les poids des critères applicables : les critères sans obligation sont exclus. Une réservation améliore l’anticipation ; elle ne prouve pas la conformité ni la réalisation. Les données indisponibles suspendent la note du processus. {selected.scopeLabel || 'Périmètre compagnie'}, collaborateurs présents, année {today.slice(0, 4)}, échéances documentaires à 90 jours. Les processus, critères et actions suivent vos autorisations réelles. Les liens ouvrent les dossiers et menus concernés.</p></details>
    </div>
  </section>;
}

export function ProcessPerformanceRadar({ client, roles, personId = null, moduleKeys }: ProcessPerformanceRadarProps) {
  const [state, setState] = useState<{ processes: ProcessPerformance[]; loading: boolean; error: boolean; contextKey: string; client: SupabaseClient | null }>({ processes: [], loading: true, error: false, contextKey: '', client: null });
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
    void fetchProcessPerformance(client, rolesKey.split(',') as RoleKey[], undefined, personId, modulesKey === undefined ? undefined : modulesKey ? modulesKey.split(',') as ModuleKey[] : []).then((processes) => {
      if (!cancelled) { setState({ processes, loading: false, error: false, contextKey, client }); setRefreshing(false); }
    }).catch(() => { if (!cancelled) { setState({ processes: [], loading: false, error: true, contextKey, client }); setRefreshing(false); } });
    return () => { cancelled = true; };
  }, [client, rolesKey, allowed, refreshToken, personId, modulesKey, contextKey]);
  if (!allowed) return null;
  if (state.loading || state.contextKey !== contextKey || state.client !== client) return <section className="process-performance-loading" role="status"><Radar size={23} />Lecture des processus et de leurs échéances…</section>;
  if (state.error) return <section className="process-performance-loading" role="status"><TriangleAlert size={20} />Les performances n’ont pas pu être chargées.<button onClick={() => setRefreshToken((value) => value + 1)} type="button">Réessayer</button></section>;
  return <ProcessPerformancePanel onRefresh={() => { setRefreshing(true); setRefreshToken((value) => value + 1); }} processes={state.processes} refreshing={refreshing} />;
}
