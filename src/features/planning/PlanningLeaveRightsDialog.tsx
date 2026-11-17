import type { SupabaseClient } from '@supabase/supabase-js';
import { CalendarDays } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AppDialog } from '../../components/AppDialog';
import { getPlanningLeaveRightsRange, getPlanningRequestCrewBalance, type PlanningAbsenceBalanceContext, type PlanningLeaveCounterType } from './planningAbsenceBalance';
import { fetchPlanningAbsenceBalanceContext, savePlanningLeaveCounterPeriod, savePlanningLeaveRightsPeriod, savePlanningSedentaryLeavePeriod } from './planningAbsenceBalanceQueries';
import { formatPlanningDate, isPlanningDate, todayPlanningDate } from './planningDates';
import { planningErrorMessage } from './planningErrors';
import { formatPlanningPerson } from './planningModel';
import type { PlanningPerson } from './planningQueries';
import { PlanningSedentaryLeaveRightsForm } from './PlanningSedentaryLeaveRightsForm';

const amountText = (amount: number | undefined) => amount === undefined ? '' : String(amount).replace('.', ',');
function parseAmount(text: string): number {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(text.trim())) throw new Error('Saisissez les totaux Congés et RTT, positifs ou nuls, avec deux décimales au maximum.');
  return Number(text.trim().replace(',', '.'));
}
function annualPeriod(start: string, end: string): boolean {
  return start.endsWith('-06-01') && end === `${Number(start.slice(0, 4)) + 1}-05-31`;
}

export function PlanningLeaveRightsDialog({ client, initialContext, people, anchor, onClose, onSaved }: {
  client: SupabaseClient;
  initialContext: PlanningAbsenceBalanceContext;
  people: Pick<PlanningPerson, 'id' | 'firstName' | 'lastName' | 'functionLabel'>[];
  anchor: string;
  onClose: (reloadNeeded?: boolean) => void;
  onSaved: (context: PlanningAbsenceBalanceContext) => void;
}) {
  const [portalTarget] = useState(() => document.querySelector('.planning-workspace.is-fullscreen') || document.body);
  const [personId, setPersonId] = useState(initialContext.person.id);
  const [isSaving, setIsSaving] = useState(false);
  const [refreshPending, setRefreshPending] = useState(false);
  const pendingReload = useRef(false);
  const close = () => onClose(pendingReload.current);
  const options = useMemo(() => {
    const unique = new Map(people.map((person) => [person.id, person]));
    if (!unique.has(initialContext.person.id)) unique.set(initialContext.person.id, initialContext.person);
    return [...unique.values()].sort((a, b) => formatPlanningPerson(a).localeCompare(formatPlanningPerson(b), 'fr'));
  }, [people, initialContext.person]);

  return createPortal(<div className="planning-leave-rights-overlay" onKeyDown={(event) => event.stopPropagation()} onSubmit={(event) => event.stopPropagation()}>
    <AppDialog title="Périodes de Droits Congés" size="lg" icon={<CalendarDays size={20} aria-hidden="true" />} isBusy={isSaving} onClose={close}
      description="Gérez les droits du 1er juin au 31 mai de l’année suivante."
      footer={<div className="app-dialog__actions"><button className="is-secondary" type="button" disabled={isSaving} onClick={close}>Fermer la fenêtre</button></div>}>
      <div className="planning-leave-rights">
        <label>Collaborateur<select disabled={isSaving || refreshPending} value={personId} onChange={(event) => setPersonId(Number(event.target.value))}>
          {options.map((person) => <option key={person.id} value={person.id}>{formatPlanningPerson(person)}{person.functionLabel ? ` · ${person.functionLabel}` : ''}</option>)}
        </select></label>
        <PlanningLeaveRightsEditor key={personId} client={client} personId={personId} initialContext={personId === initialContext.person.id ? initialContext : undefined} anchor={anchor} onSavingChange={setIsSaving} onCommitted={() => { setRefreshPending(true); if (personId === initialContext.person.id) pendingReload.current = true; }} onSaved={(updated) => { setRefreshPending(false); if (updated.person.id === initialContext.person.id) pendingReload.current = false; onSaved(updated); }} />
      </div>
    </AppDialog>
  </div>, portalTarget);
}

function PlanningLeaveRightsEditor({ client, personId, initialContext, anchor, onSavingChange, onCommitted, onSaved }: {
  client: SupabaseClient;
  personId: number;
  initialContext?: PlanningAbsenceBalanceContext;
  anchor: string;
  onSavingChange: (saving: boolean) => void;
  onCommitted: () => void;
  onSaved: (context: PlanningAbsenceBalanceContext) => void;
}) {
  const [context, setContext] = useState(initialContext ?? null);
  const [loading, setLoading] = useState(!initialContext);
  const [loadRevision, setLoadRevision] = useState(0);
  const [error, setError] = useState('');
  const [counter, setCounter] = useState<PlanningLeaveCounterType>('leave');
  const [saving, setSaving] = useState(false);
  const [refreshPending, setRefreshPending] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const clearFeedback = () => setFeedback(null);
  useEffect(() => {
    if (initialContext && loadRevision === 0) return;
    let active = true;
    void fetchPlanningAbsenceBalanceContext(client, personId).then((value) => { if (active) { setContext(value); setError(''); } })
      .catch((failure) => { if (active) setError(planningErrorMessage(failure, 'Impossible de charger les droits.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, personId, initialContext, loadRevision]);

  async function save(writeRights?: () => Promise<unknown>) {
    if (saving || (writeRights && refreshPending)) return;
    setSaving(true);
    onSavingChange(true);
    clearFeedback();
    let committed = refreshPending;
    try {
      if (writeRights) {
        await writeRights();
        committed = true;
        onCommitted();
        setRefreshPending(true);
      }
      const updated = await fetchPlanningAbsenceBalanceContext(client, personId);
      setContext(updated);
      onSaved(updated);
      setRefreshPending(false);
      setFeedback({ error: false, message: 'Droits enregistrés. Les soldes sont recalculés.' });
    } catch (failure) {
      const message = committed
        ? 'Droits enregistrés, mais les soldes n’ont pas pu être actualisés. Réessayez l’actualisation.'
        : planningErrorMessage(failure, 'Impossible d’enregistrer les droits.');
      setFeedback({ error: true, message });
    } finally {
      setSaving(false);
      onSavingChange(false);
    }
  }

  if (loading) return <p role="status">Chargement des droits…</p>;
  if (!context) return <div role="alert"><p>{error}</p><button type="button" onClick={() => { setLoading(true); setLoadRevision((value) => value + 1); }}>Réessayer</button></div>;
  const hasLegacyCounters = (context.requestBalanceKind ?? context.kind) === 'leave_rtt';
  const sedentaryLeave = context.sedentaryLeave;
  if (!sedentaryLeave && !hasLegacyCounters) {
    const today = todayPlanningDate();
    const balance = getPlanningRequestCrewBalance(context, today);
    return <div className="planning-absence-balances__crew">
      <span>Solde de Congés/Repos au {formatPlanningDate(today)}</span>
      <strong>{balance.value === null ? 'À initialiser' : `${balance.value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} j`}</strong>
      <p>Ce collaborateur conserve le calcul de la vue Équipages. Les droits annuels ne s’appliquent pas.</p>
    </div>;
  }
  const disabled = saving || refreshPending;
  return <>
    {sedentaryLeave && hasLegacyCounters ? <label>Compteur à gérer<select disabled={disabled} value={counter} onChange={(event) => { setCounter(event.target.value === 'rtt' ? 'rtt' : 'leave'); clearFeedback(); }}>
      <option value="leave">Congés payés</option>
      <option value="rtt">RTT</option>
    </select></label> : null}
    {sedentaryLeave && (!hasLegacyCounters || counter === 'leave') ? <PlanningSedentaryLeaveRightsForm
      periods={sedentaryLeave} personId={personId} anchor={anchor} saving={saving} disabled={disabled}
      onChanged={clearFeedback} onSave={(draft) => { void save(() => savePlanningSedentaryLeavePeriod(client, draft())); }} /> : <PlanningLeaveRightsForm
      client={client} context={context} anchor={anchor} saving={saving} disabled={disabled} rttOnly={Boolean(sedentaryLeave)}
      onChanged={clearFeedback} onSave={(writeRights) => { void save(writeRights); }} />}
    {feedback ? <p className={feedback.error ? 'planning-absence-balances__error' : 'planning-absence-balances__success'} role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p> : null}
    {refreshPending ? <button type="button" disabled={saving} onClick={() => void save()}>Actualiser les soldes</button> : null}
  </>;
}

function PlanningLeaveRightsForm({ client, context, anchor, saving, disabled, rttOnly, onChanged, onSave }: {
  client: SupabaseClient;
  context: PlanningAbsenceBalanceContext;
  anchor: string;
  saving: boolean;
  disabled: boolean;
  rttOnly: boolean;
  onChanged: () => void;
  onSave: (writeRights: () => Promise<unknown>) => void;
}) {
  const validAnchor = isPlanningDate(anchor) && anchor >= '1900-06-01' && anchor <= '2100-05-31' ? anchor : todayPlanningDate();
  const currentRange = getPlanningLeaveRightsRange(validAnchor);
  const defaultKey = `${currentRange.start}:${currentRange.end}`;
  const [periodKey, setPeriodKey] = useState(defaultKey);
  const [year, setYear] = useState(currentRange.start.slice(0, 4));
  const [amounts, setAmounts] = useState<{ key: string; leave: string; rtt: string } | null>(null);
  const counterPeriods = rttOnly ? context.counterPeriods.filter((period) => period.counterType === 'rtt') : context.counterPeriods;
  const periods = [...new Set([defaultKey, ...counterPeriods.map((period) => `${period.startsOn}:${period.endsOn}`)])].sort().reverse();
  const [startsOn, endsOn] = periodKey === 'new' ? [`${year}-06-01`, `${Number(year) + 1}-05-31`] : periodKey.split(':');
  const rangeKey = `${startsOn}:${endsOn}`;
  const matching = counterPeriods.filter((period) => period.startsOn === startsOn && period.endsOn === endsOn);
  const values = amounts?.key === rangeKey ? amounts : {
    key: rangeKey,
    leave: amountText(matching.find((period) => period.counterType === 'leave')?.entitlement),
    rtt: amountText(matching.find((period) => period.counterType === 'rtt')?.entitlement),
  };
  const isAnnual = periodKey === 'new' || annualPeriod(startsOn, endsOn);
  const changePeriod = (key: string) => { setPeriodKey(key); setAmounts(null); onChanged(); };
  function save(counterType?: PlanningLeaveCounterType) {
    if (counterType) {
      onSave(() => savePlanningLeaveCounterPeriod(client, { personId: context.person.id, counterType, startsOn, endsOn, entitlement: parseAmount(values[counterType]) }));
    } else {
      onSave(() => savePlanningLeaveRightsPeriod(client, { personId: context.person.id, startsOn, endsOn, leaveEntitlement: parseAmount(values.leave), rttEntitlement: parseAmount(values.rtt) }));
    }
  }
  function submit(event: FormEvent) { event.preventDefault(); event.stopPropagation(); if (isAnnual) save(rttOnly ? 'rtt' : undefined); }

  return <form className="planning-leave-rights__form" onSubmit={submit}>
    <fieldset disabled={disabled}>
      <label className="is-wide">Période de droits<select value={periodKey} onChange={(event) => changePeriod(event.target.value)}>
        {periods.map((key) => { const [start, end] = key.split(':'); return <option key={key} value={key}>Du {formatPlanningDate(start)} au {formatPlanningDate(end)}</option>; })}
        <option value="new">Nouvelle période annuelle</option>
      </select></label>
      {periodKey === 'new' ? <label className="is-wide">Année de début<input type="number" min="1900" max="2099" required value={year} onChange={(event) => { setYear(event.target.value); setAmounts(null); onChanged(); }} /></label> : null}
      <label>Début de période<input type="date" readOnly value={startsOn} /></label>
      <label>Fin de période<input type="date" readOnly value={endsOn} /></label>
      {(rttOnly ? ['rtt'] as const : ['leave', 'rtt'] as const).map((type) => <label key={type}>Total {type === 'leave' ? 'Congés' : 'RTT'} (jours)<input inputMode="decimal" required={isAnnual} value={values[type]} placeholder="Total accordé pour la période" onChange={(event) => { setAmounts({ ...values, [type]: event.target.value }); onChanged(); }} /></label>)}
      <p className="is-wide">Le solde disponible correspond au total saisi moins les jours validés sur cette période. Ajustez ce total pour corriger les droits ; les demandes en attente restent séparées.</p>
      {isAnnual ? <div className="planning-leave-rights__actions is-wide"><button className="is-primary" type="submit">{saving ? 'Enregistrement…' : rttOnly ? 'Enregistrer les droits RTT' : 'Enregistrer les droits'}</button></div> : <>
        <p className="planning-absence-balances__notice is-wide">Cette période existante conserve ses dates. Ses compteurs se modifient séparément ; les nouvelles périodes vont du 1er juin au 31 mai.</p>
        <div className="planning-leave-rights__actions is-wide">{matching.map((period) => <button key={period.counterType} type="button" onClick={() => save(period.counterType)}>Enregistrer les droits {period.counterType === 'leave' ? 'Congés' : 'RTT'}</button>)}</div>
      </>}
    </fieldset>
  </form>;
}
