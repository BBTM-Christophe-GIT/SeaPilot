import type { SupabaseClient } from '@supabase/supabase-js';
import { CalendarDays, Pencil, Plus, RefreshCw, Wallet } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildPlanningLeaveCounterSummaries, getPlanningRequestCrewBalance, validatePlanningLeaveCounterPeriod, type PlanningAbsenceBalanceContext, type PlanningLeaveCounterPeriod, type PlanningLeaveCounterSummary, type PlanningLeaveCounterType } from './planningAbsenceBalance';
import { fetchPlanningAbsenceBalanceContext, savePlanningLeaveCounterPeriod } from './planningAbsenceBalanceQueries';
import { formatPlanningDate, todayPlanningDate } from './planningDates';
import { planningErrorMessage } from './planningErrors';
import type { PlanningAbsenceType } from './planningP12';
import './planningAbsenceBalances.css';

interface PlanningAbsenceBalancesProps {
  client: SupabaseClient;
  personId: number | null;
  absenceType: PlanningAbsenceType;
  startsAt: string;
  endsAt: string;
  absenceId?: number;
  canManage?: boolean;
  onEditingChange?: (editing: boolean) => void;
}
interface BalanceScope { client: SupabaseClient; personId: number | null }
interface CounterEditor {
  scope: BalanceScope;
  counterType: PlanningLeaveCounterType;
  startsOn: string;
  endsOn: string;
  entitlement: string;
  existing: boolean;
}
const COUNTER_LABELS = { leave: 'Congés', rtt: 'RTT' };
const daysLabel = (value: number) => `${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} j`;

function CounterMetrics({ summary }: { summary: PlanningLeaveCounterSummary }) {
  return <dl className="planning-absence-balances__metrics">
    <div><dt>Droits</dt><dd>{summary.period ? daysLabel(summary.period.entitlement) : 'Non renseignés'}</dd></div>
    <div><dt>Jours validés</dt><dd>{daysLabel(summary.approvedDays)}</dd></div>
    <div><dt>En attente</dt><dd>{daysLabel(summary.pendingDays)}</dd></div>
    <div className={`planning-absence-balances__available${summary.remaining !== null && summary.remaining < 0 ? ' is-negative' : ''}`}><dt>Solde disponible</dt><dd>{summary.remaining === null ? 'À initialiser' : daysLabel(summary.remaining)}</dd></div>
    {summary.requestDays !== null ? <>
      <div><dt>Cette demande</dt><dd>{daysLabel(summary.requestDays)}</dd></div>
      <div className={summary.projectedRemaining !== null && summary.projectedRemaining < 0 ? 'is-negative' : ''}><dt>Après validation</dt><dd>{summary.projectedRemaining === null ? 'À initialiser' : daysLabel(summary.projectedRemaining)}</dd></div>
    </> : null}
  </dl>;
}

export function PlanningAbsenceBalances({ client, personId, absenceType, startsAt, endsAt, absenceId, canManage = false, onEditingChange }: PlanningAbsenceBalancesProps) {
  const scope = useMemo<BalanceScope>(() => ({ client, personId }), [client, personId]);
  const scopeRef = useRef(scope);
  useEffect(() => { scopeRef.current = scope; }, [scope]);
  const [revision, setRevision] = useState(0);
  const [load, setLoad] = useState<{ scope: BalanceScope; revision: number; context: PlanningAbsenceBalanceContext | null; error: string } | null>(null);
  const [editor, setEditor] = useState<CounterEditor | null>(null);
  const [savingEditor, setSavingEditor] = useState<CounterEditor | null>(null);
  const [feedback, setFeedback] = useState<{ scope: BalanceScope; error: boolean; message: string } | null>(null);
  const currentLoad = load?.scope === scope && load.revision === revision ? load : null;
  const currentEditor = editor?.scope === scope && canManage ? editor : null;
  const isSaving = savingEditor?.scope === scope;
  const isEditing = Boolean(currentEditor);
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
  const summaries = context?.kind === 'leave_rtt' ? buildPlanningLeaveCounterSummaries(context, { absenceType, startsAt, endsAt, absenceId }, today) : [];
  const crewBalance = context?.kind === 'crew' ? getPlanningRequestCrewBalance(context, today) : null;
  const currentFeedback = feedback?.scope === scope ? feedback : null;

  function openEditor(counterType: PlanningLeaveCounterType, period: PlanningLeaveCounterPeriod | null) {
    const year = (startsAt.slice(0, 4).match(/^\d{4}$/) ? startsAt : today).slice(0, 4);
    setFeedback(null);
    setEditor({ scope, counterType, startsOn: period?.startsOn || `${year}-01-01`, endsOn: period?.endsOn || `${year}-12-31`, entitlement: period ? String(period.entitlement).replace('.', ',') : '', existing: Boolean(period) });
  }

  async function saveRights() {
    if (!currentEditor || isSaving || !canManage || personId === null) return;
    const draftEditor = currentEditor;
    setSavingEditor(draftEditor); setFeedback(null);
    try {
      const amount = draftEditor.entitlement.trim();
      if (!/^\d+(?:[.,]\d{1,2})?$/.test(amount)) throw new Error('Saisissez un total de droits positif ou nul, avec deux décimales au maximum.');
      const draft = validatePlanningLeaveCounterPeriod({ personId, counterType: draftEditor.counterType, startsOn: draftEditor.startsOn, endsOn: draftEditor.endsOn, entitlement: Number(amount.replace(',', '.')) });
      await savePlanningLeaveCounterPeriod(client, draft);
      if (scopeRef.current !== scope) return;
      setEditor((value) => value === draftEditor ? null : value);
      setFeedback({ scope, error: false, message: 'Droits enregistrés. Les soldes sont recalculés.' });
      setRevision((value) => value + 1);
    } catch (error) {
      if (scopeRef.current === scope) setFeedback({ scope, error: true, message: planningErrorMessage(error, 'Impossible d’enregistrer les droits.') });
    } finally { setSavingEditor((value) => value === draftEditor ? null : value); }
  }

  return <section aria-label="Soldes et droits" className="planning-absence-balances">
    <div className="planning-absence-balances__heading"><h3><Wallet size={19} aria-hidden="true" />Soldes et droits</h3>{context?.kind === 'leave_rtt' && canManage && !currentEditor ? <button type="button" onClick={() => openEditor(absenceType === 'rtt' ? 'rtt' : 'leave', null)}><Plus size={15} aria-hidden="true" />Ajouter une période de droits</button> : null}</div>
    {!currentLoad ? <p role="status">Chargement des soldes…</p> : currentLoad.error ? <div className="planning-absence-balances__error" role="alert"><p>{currentLoad.error}</p><button type="button" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={15} aria-hidden="true" />Réessayer</button></div> : null}
    {context?.kind === 'leave_rtt' ? <>
      <div className="planning-absence-balances__cards">{summaries.map((summary) => {
        const label = COUNTER_LABELS[summary.counterType];
        const multiple = summaries.filter((item) => item.counterType === summary.counterType).length > 1;
        return <article aria-label={`Compteur ${label}${multiple ? ` du ${formatPlanningDate(summary.range.start)} au ${formatPlanningDate(summary.range.end)}` : ''}`} className={`planning-absence-balances__card is-${summary.counterType}`} key={`${summary.counterType}:${summary.period?.id ?? 'uninitialized'}`}>
          <h4>{label}</h4><p className="planning-absence-balances__period"><CalendarDays size={14} aria-hidden="true" />Du {formatPlanningDate(summary.range.start)} au {formatPlanningDate(summary.range.end)}</p>
          <CounterMetrics summary={summary} />
          {canManage && !currentEditor ? <button className="planning-absence-balances__edit" type="button" onClick={() => openEditor(summary.counterType, summary.period)}><Pencil size={14} aria-hidden="true" />{summary.period ? 'Modifier' : 'Saisir'} les droits {label}</button> : null}
        </article>;
      })}</div>
      <p className="planning-absence-balances__help">Jours ouvrés du lundi au vendredi, hors jours fériés nationaux. Les demandes en attente restent séparées du solde.</p>
      {summaries.filter((summary, index) => summary.uncoveredRequestDays > 0 && summaries.findIndex((item) => item.counterType === summary.counterType) === index).map((summary) => <p className="planning-absence-balances__notice" key={summary.counterType}>{daysLabel(summary.uncoveredRequestDays)} de cette demande sont hors des périodes de droits {COUNTER_LABELS[summary.counterType]}. Les droits correspondants restent à renseigner.</p>)}
    </> : null}
    {crewBalance ? <div className="planning-absence-balances__crew"><div><span>Solde équipage au {formatPlanningDate(today)}</span><strong>{crewBalance.value === null ? 'À initialiser' : daysLabel(crewBalance.value)}</strong></div><p>{crewBalance.explanation}</p></div> : null}
    {currentFeedback ? <p className={currentFeedback.error ? 'planning-absence-balances__error' : 'planning-absence-balances__success'} role={currentFeedback.error ? 'alert' : 'status'}>{currentFeedback.message}</p> : null}
    {currentEditor ? <fieldset className="planning-absence-balances__editor" disabled={isSaving} onKeyDown={(event) => {
      if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!isSaving) { setEditor(null); setFeedback(null); } }
    }}>
      <legend>Droits {COUNTER_LABELS[currentEditor.counterType]}</legend>
      {!currentEditor.existing ? <label>Compteur<select value={currentEditor.counterType} onChange={(event) => setEditor({ ...currentEditor, counterType: event.target.value as PlanningLeaveCounterType })}><option value="leave">Congés</option><option value="rtt">RTT</option></select></label> : null}
      <label>Début de période<input disabled={currentEditor.existing} type="date" required value={currentEditor.startsOn} onChange={(event) => setEditor({ ...currentEditor, startsOn: event.target.value })} /></label>
      <label>Fin de période<input disabled={currentEditor.existing} type="date" required value={currentEditor.endsOn} onChange={(event) => setEditor({ ...currentEditor, endsOn: event.target.value })} /></label>
      <label className="is-wide">Total des droits (jours)<input inputMode="decimal" required value={currentEditor.entitlement} onChange={(event) => setEditor({ ...currentEditor, entitlement: event.target.value })} placeholder="Saisir les droits accordés pour cette période" /></label>
      <p className="is-wide">Les jours validés de toute la période seront déduits de ce total.{currentEditor.existing ? ' Pour d’autres dates, ajoutez une période de droits.' : ''}</p>
      <div className="planning-absence-balances__editor-actions is-wide"><button type="button" onClick={() => { setEditor(null); setFeedback(null); }}>Annuler la modification</button><button type="button" onClick={() => void saveRights()}>{isSaving ? 'Enregistrement…' : 'Enregistrer les droits'}</button></div>
    </fieldset> : null}
  </section>;
}
