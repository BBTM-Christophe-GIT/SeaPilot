import type { SupabaseClient } from '@supabase/supabase-js';
import { CalendarDays, ChartNoAxesColumnIncreasing, ChevronRight, CircleCheck, Clock3, FileText, Info, RefreshCw, Send, TreePalm } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pie, PieChart } from 'recharts';
import { buildPlanningLeaveCounterSummaries, getPlanningRequestCrewBalance, type PlanningAbsenceBalanceContext, type PlanningLeaveCounterSummary } from './planningAbsenceBalance';
import { fetchPlanningAbsenceBalanceContext } from './planningAbsenceBalanceQueries';
import { formatPlanningDate, todayPlanningDate } from './planningDates';
import { planningErrorMessage } from './planningErrors';
import type { PlanningAbsenceType } from './planningP12';
import { PlanningLeaveRightsDialog } from './PlanningLeaveRightsDialog';
import type { PlanningPerson } from './planningQueries';
import './planningAbsenceBalances.css';

interface PlanningAbsenceBalancesProps {
  client: SupabaseClient;
  personId: number | null;
  absenceType: PlanningAbsenceType;
  startsAt: string;
  endsAt: string;
  absenceId?: number;
  canManage?: boolean;
  people?: Pick<PlanningPerson, 'id' | 'firstName' | 'lastName' | 'functionLabel'>[];
  onEditingChange?: (editing: boolean) => void;
}
interface BalanceScope { client: SupabaseClient; personId: number | null }

const COUNTER_LABELS = { leave: 'Congés', rtt: 'RTT' };
const daysLabel = (value: number) => `${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} j`;

function CounterMetrics({ summary }: { summary: PlanningLeaveCounterSummary }) {
  const entitlement = summary.period?.entitlement ?? null;
  const accrued = summary.acquiredDays ?? entitlement;
  const isOuvrable = summary.unit === 'ouvrables';
  const available = summary.remaining;
  const paintedAvailable = entitlement !== null && entitlement > 0 && available !== null ? Math.min(entitlement, Math.max(0, available)) : 0;
  const ring = entitlement !== null && entitlement > 0 ? [
    { value: paintedAvailable, fill: summary.counterType === 'leave' ? '#51b5b3' : '#9760d7' },
    { value: entitlement - paintedAvailable, fill: summary.counterType === 'leave' ? '#bee6e5' : '#eeedf8' },
  ] : [{ value: 1, fill: summary.counterType === 'leave' ? '#e6f1f3' : '#eeedf8' }];
  return <dl className={`planning-absence-balances__metrics${summary.requestDays !== null ? ' has-request' : ''}`}>
    <div className={`planning-absence-balances__available${available !== null && available < 0 ? ' is-negative' : ''}${available === null ? ' is-uninitialized' : ''}`}
      role={available === null ? 'status' : 'meter'} aria-label={`Solde disponible ${COUNTER_LABELS[summary.counterType]}`} aria-live="polite"
      aria-valuemin={available === null ? undefined : Math.min(0, available)} aria-valuemax={available === null ? undefined : Math.max(0, entitlement ?? 0, available)}
      aria-valuenow={available ?? undefined} aria-valuetext={available === null ? undefined : isOuvrable
        ? `${available.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} jours ouvrables disponibles`
        : `${daysLabel(available)} disponibles sur ${daysLabel(entitlement ?? 0)}`}>
      <div className="planning-absence-balances__ring" aria-hidden="true"><PieChart width={116} height={116} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} accessibilityLayer={false}><Pie data={ring} dataKey="value" cx={58} cy={58} innerRadius={48} outerRadius={57} startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false} /></PieChart></div>
      <dt>Solde disponible</dt><dd>{available === null ? 'À initialiser' : daysLabel(available)}</dd>
      <span className="planning-absence-balances__gauge-total">{entitlement === null ? isOuvrable ? 'Solde de paie requis' : 'Droits à renseigner' : isOuvrable ? 'jours ouvrables' : `sur ${daysLabel(entitlement)}`}</span>
    </div>
    <div className="planning-absence-balances__metric is-entitlement"><span className="planning-absence-balances__metric-icon" aria-hidden="true"><FileText size={22} /></span><dt>{isOuvrable ? 'Droits acquis' : 'Droits'}</dt><dd className={accrued === null ? 'is-uninitialized' : undefined}>{accrued === null ? 'Non renseignés' : daysLabel(accrued)}</dd></div>
    <div className="planning-absence-balances__metric is-approved"><span className="planning-absence-balances__metric-icon" aria-hidden="true"><CircleCheck size={23} /></span><dt>Jours validés</dt><dd>{daysLabel(summary.approvedDays)}</dd></div>
    <div className="planning-absence-balances__metric is-pending"><span className="planning-absence-balances__metric-icon" aria-hidden="true"><Clock3 size={23} /></span><dt>En attente</dt><dd>{daysLabel(summary.pendingDays)}</dd></div>
    {summary.requestDays !== null ? <>
      <div className="planning-absence-balances__metric is-request"><span className="planning-absence-balances__metric-icon" aria-hidden="true"><Send size={22} /></span><dt>Cette demande</dt><dd>{daysLabel(summary.requestDays)}</dd></div>
      <div className={`planning-absence-balances__metric is-projected${summary.projectedRemaining !== null && summary.projectedRemaining < 0 ? ' is-negative' : ''}`}><span className="planning-absence-balances__metric-icon" aria-hidden="true"><ChartNoAxesColumnIncreasing size={22} /></span><dt>Après validation</dt><dd className={summary.projectedRemaining === null ? 'is-uninitialized' : undefined}>{summary.projectedRemaining === null ? 'À initialiser' : daysLabel(summary.projectedRemaining)}</dd></div>
    </> : null}
  </dl>;
}

export function PlanningAbsenceBalances({ client, personId, absenceType, startsAt, endsAt, absenceId, canManage = false, people = [], onEditingChange }: PlanningAbsenceBalancesProps) {
  const scope = useMemo<BalanceScope>(() => ({ client, personId }), [client, personId]);
  const scopeRef = useRef(scope);
  useEffect(() => { scopeRef.current = scope; }, [scope]);
  const [revision, setRevision] = useState(0);
  const [load, setLoad] = useState<{ scope: BalanceScope; revision: number; context: PlanningAbsenceBalanceContext | null; error: string } | null>(null);
  const [rightsScope, setRightsScope] = useState<BalanceScope | null>(null);
  const currentLoad = load?.scope === scope && load.revision === revision ? load : null;
  const isEditing = rightsScope === scope && canManage;
  const today = todayPlanningDate();

  useEffect(() => {
    if (personId === null || !Number.isSafeInteger(personId) || personId <= 0) return;
    let active = true;
    void fetchPlanningAbsenceBalanceContext(client, personId).then((context) => {
      if (active) setLoad({ scope, revision, context, error: '' });
    }).catch((error: unknown) => {
      if (active) setLoad({ scope, revision, context: null, error: planningErrorMessage(error, 'Impossible de charger les soldes. Réessayez.') });
    });
    return () => { active = false; };
  }, [client, personId, scope, revision]);
  useEffect(() => { onEditingChange?.(isEditing); }, [isEditing, onEditingChange]);
  useEffect(() => () => { onEditingChange?.(false); }, [onEditingChange]);

  if (personId === null || !Number.isSafeInteger(personId) || personId <= 0) return null;
  const context = currentLoad?.context;
  const requestBalanceKind = context?.requestBalanceKind ?? context?.kind;
  const isSedentary = Array.isArray(context?.sedentaryLeave);
  const showCounters = isSedentary || requestBalanceKind === 'leave_rtt';
  const showCrewBalance = !isSedentary && requestBalanceKind === 'crew';
  const summaries = context && showCounters ? buildPlanningLeaveCounterSummaries(context, { absenceType, startsAt, endsAt, absenceId }, today) : [];
  const crewBalance = context && showCrewBalance ? getPlanningRequestCrewBalance(context, today) : null;
  const unopened = summaries.filter((summary) => summary.unit === 'ouvrables' && !summary.period);
  const legacyLeave = context && requestBalanceKind === 'leave_rtt' && unopened.length
    ? buildPlanningLeaveCounterSummaries({ ...context, sedentaryLeave: null }, { absenceType: 'leave', startsAt, endsAt }, today)
      .filter((summary) => summary.counterType === 'leave' && summary.remaining !== null && unopened.some(({ range }) => range.start <= summary.range.end && summary.range.start <= range.end))
    : [];
  return <section aria-label="Soldes et droits" className="planning-absence-balances">
    <div className="planning-absence-balances__heading"><div className="planning-absence-balances__identity"><span className="planning-absence-balances__heading-icon" aria-hidden="true"><FileText size={23} strokeWidth={2.2} /></span><div><h3>{showCrewBalance ? 'Solde de Congés/Repos' : 'Soldes et droits'}</h3><p>{showCrewBalance ? 'Solde de la vue Équipages à la date de saisie' : 'Consultez vos droits et suivez vos compteurs d’absence'}</p></div></div>{context && showCounters && canManage ? <button className="planning-absence-balances__manage" type="button" disabled={isEditing} onClick={() => setRightsScope(scope)}><CalendarDays size={18} aria-hidden="true" />Périodes de Droits Congés<ChevronRight size={16} aria-hidden="true" /></button> : null}</div>
    {!currentLoad ? <p role="status">Chargement des soldes…</p> : currentLoad.error ? <div className="planning-absence-balances__error" role="alert"><p>{currentLoad.error}</p><button type="button" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={15} aria-hidden="true" />Réessayer</button></div> : null}
    {showCounters ? <>
      <div className="planning-absence-balances__cards">{summaries.map((summary) => {
        const label = COUNTER_LABELS[summary.counterType];
        const multiple = summaries.filter((item) => item.counterType === summary.counterType).length > 1;
        return <article aria-label={`Compteur ${label}${multiple ? ` du ${formatPlanningDate(summary.range.start)} au ${formatPlanningDate(summary.range.end)}` : ''}`} className={`planning-absence-balances__card is-${summary.counterType}`} key={`${summary.counterType}:${summary.range.start}:${summary.period?.id ?? 'uninitialized'}`}>
          <header className="planning-absence-balances__card-heading"><span className="planning-absence-balances__card-icon" aria-hidden="true">{summary.counterType === 'leave' ? <TreePalm size={24} strokeWidth={2} /> : <CalendarDays size={23} strokeWidth={2.1} />}</span><div><h4 aria-label={summary.unit === 'ouvrables' ? `${label} en jours ouvrables` : undefined}>{label}{summary.unit === 'ouvrables' ? <small> en jours ouvrables</small> : null}</h4><p className="planning-absence-balances__period"><CalendarDays size={14} aria-hidden="true" />Du {formatPlanningDate(summary.range.start)} au {formatPlanningDate(summary.range.end)}</p></div><img className="planning-absence-balances__illustration" src={summary.counterType === 'leave' ? '/images/planning/leave-island.png' : '/images/planning/rtt-clock.png'} alt="" aria-hidden="true" /></header>
          <CounterMetrics summary={summary} />
        </article>;
      })}</div>
      <p className="planning-absence-balances__help"><Info size={16} aria-hidden="true" /><span>{isSedentary
        ? `Congés du 1er juin au 31 mai. Un vendredi posé avec reprise le lundi compte deux jours, sauf si le samedi est férié et chômé.${requestBalanceKind === 'leave_rtt' ? ' Les RTT se décomptent en jours ouvrés.' : ''}`
        : 'Jours ouvrés du lundi au vendredi, hors jours fériés nationaux.'} Les demandes en attente restent séparées du solde.</span></p>
      {summaries.filter((summary, index) => summary.uncoveredRequestDays > 0 && summaries.findIndex((item) => item.counterType === summary.counterType) === index).map((summary) => <p className="planning-absence-balances__notice" key={summary.counterType}>{summary.unit === 'ouvrables'
        ? `${daysLabel(summary.uncoveredRequestDays)} de cette demande précèdent l’ouverture du compteur ou concernent une période sans solde de paie.`
        : `${daysLabel(summary.uncoveredRequestDays)} de cette demande sont hors des périodes de droits ${COUNTER_LABELS[summary.counterType]}. Les droits correspondants restent à renseigner.`}</p>)}
    </> : null}
    {legacyLeave.length > 0 ? <aside aria-label="Solde historique des congés" className="planning-absence-balances__crew">
      <p>Solde historique des congés en jours ouvrés</p>
      {legacyLeave.map((summary) => <div key={summary.period?.id}>
        <span>Du {formatPlanningDate(summary.range.start)} au {formatPlanningDate(summary.range.end)}</span>
        <strong>{summary.remaining?.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} j ouvrés</strong>
      </div>)}
    </aside> : null}
    {crewBalance ? <div className="planning-absence-balances__crew"><div><span>Au {formatPlanningDate(today)}</span><strong>{crewBalance.value === null ? 'À initialiser' : daysLabel(crewBalance.value)}</strong></div><p>{crewBalance.explanation}</p></div> : null}
    {isEditing && context ? <PlanningLeaveRightsDialog client={client} initialContext={context} people={people} anchor={startsAt.slice(0, 10)} onClose={(reloadNeeded) => { setRightsScope(null); if (reloadNeeded) setRevision((value) => value + 1); }} onSaved={(updated) => { if (scopeRef.current === scope && updated.person.id === personId) setLoad({ scope, revision, context: updated, error: '' }); }} /> : null}
  </section>;
}
