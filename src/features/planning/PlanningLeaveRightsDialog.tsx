import type { SupabaseClient } from '@supabase/supabase-js';
import { CalendarDays } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AppDialog } from '../../components/AppDialog';
import { getPlanningLeaveRightsRange, getPlanningRequestCrewBalance, type PlanningAbsenceBalanceContext, type PlanningLeaveCounterType } from './planningAbsenceBalance';
import { fetchPlanningAbsenceBalanceContext, savePlanningLeaveCounterPeriod, savePlanningLeaveRightsPeriod } from './planningAbsenceBalanceQueries';
import { formatPlanningDate, isPlanningDate, todayPlanningDate } from './planningDates';
import { planningErrorMessage } from './planningErrors';
import { formatPlanningPerson } from './planningModel';
import type { PlanningPerson } from './planningQueries';

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
      description="Définissez et ajustez les totaux de Congés et de RTT du 1er juin au 31 mai de l’année suivante."
      footer={<div className="app-dialog__actions"><button className="is-secondary" type="button" disabled={isSaving} onClick={close}>Fermer la fenêtre</button></div>}>
      <div className="planning-leave-rights">
        <label>Collaborateur<select disabled={isSaving || refreshPending} value={personId} onChange={(event) => setPersonId(Number(event.target.value))}>
          {options.map((person) => <option key={person.id} value={person.id}>{formatPlanningPerson(person)}{person.functionLabel ? ` · ${person.functionLabel}` : ''}</option>)}
        </select></label>
        <PlanningLeaveRightsEditor key={personId} client={client} personId={personId} initialContext={personId === initialContext.person.id ? initialContext : undefined} anchor={anchor} onSavingChange={setIsSaving} onCommitted={() => { setRefreshPending(true); if (personId === initialContext.person.id) pendingReload.current = true; }} onSaved={(updated) => { setRefreshPending(false); if (updated.person.id === initialContext.person.id) pendingReload.current = false; onSaved(updated); }} />
      </div>
    </AppDialog>
  </div>, document.body);
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
  useEffect(() => {
    if (initialContext && loadRevision === 0) return;
    let active = true;
    void fetchPlanningAbsenceBalanceContext(client, personId).then((value) => { if (active) { setContext(value); setError(''); } })
      .catch((failure) => { if (active) setError(planningErrorMessage(failure, 'Impossible de charger les droits.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, personId, initialContext, loadRevision]);
  if (loading) return <p role="status">Chargement des droits…</p>;
  if (!context) return <div role="alert"><p>{error}</p><button type="button" onClick={() => { setLoading(true); setLoadRevision((value) => value + 1); }}>Réessayer</button></div>;
  if ((context.requestBalanceKind ?? context.kind) === 'crew') {
    const today = todayPlanningDate();
    const balance = getPlanningRequestCrewBalance(context, today);
    return <div className="planning-absence-balances__crew">
      <span>Solde de Congés/Repos au {formatPlanningDate(today)}</span>
      <strong>{balance.value === null ? 'À initialiser' : `${balance.value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} j`}</strong>
      <p>Ce collaborateur conserve le calcul de la vue Équipages. Les droits annuels ne s’appliquent pas.</p>
    </div>;
  }
  return <PlanningLeaveRightsForm client={client} context={context} anchor={anchor} onSavingChange={onSavingChange} onCommitted={onCommitted} onSaved={(value) => { setContext(value); onSaved(value); }} />;
}

function PlanningLeaveRightsForm({ client, context, anchor, onSavingChange, onCommitted, onSaved }: {
  client: SupabaseClient;
  context: PlanningAbsenceBalanceContext;
  anchor: string;
  onSavingChange: (saving: boolean) => void;
  onCommitted: () => void;
  onSaved: (context: PlanningAbsenceBalanceContext) => void;
}) {
  const validAnchor = isPlanningDate(anchor) && anchor >= '1900-06-01' && anchor <= '2100-05-31' ? anchor : todayPlanningDate();
  const currentRange = getPlanningLeaveRightsRange(validAnchor);
  const defaultKey = `${currentRange.start}:${currentRange.end}`;
  const [periodKey, setPeriodKey] = useState(defaultKey);
  const [year, setYear] = useState(currentRange.start.slice(0, 4));
  const [amounts, setAmounts] = useState<{ key: string; leave: string; rtt: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshPending, setRefreshPending] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const periods = [...new Set([defaultKey, ...context.counterPeriods.map((period) => `${period.startsOn}:${period.endsOn}`)])].sort().reverse();
  const [startsOn, endsOn] = periodKey === 'new' ? [`${year}-06-01`, `${Number(year) + 1}-05-31`] : periodKey.split(':');
  const rangeKey = `${startsOn}:${endsOn}`;
  const matching = context.counterPeriods.filter((period) => period.startsOn === startsOn && period.endsOn === endsOn);
  const values = amounts?.key === rangeKey ? amounts : {
    key: rangeKey,
    leave: amountText(matching.find((period) => period.counterType === 'leave')?.entitlement),
    rtt: amountText(matching.find((period) => period.counterType === 'rtt')?.entitlement),
  };
  const isAnnual = periodKey === 'new' || annualPeriod(startsOn, endsOn);
  const changePeriod = (key: string) => { setPeriodKey(key); setAmounts(null); setFeedback(null); };

  async function save(counterType?: PlanningLeaveCounterType) {
    if (saving || refreshPending) return;
    setSaving(true); onSavingChange(true); setFeedback(null);
    let committed = false;
    try {
      if (counterType) {
        await savePlanningLeaveCounterPeriod(client, { personId: context.person.id, counterType, startsOn, endsOn, entitlement: parseAmount(values[counterType]) });
      } else {
        await savePlanningLeaveRightsPeriod(client, { personId: context.person.id, startsOn, endsOn, leaveEntitlement: parseAmount(values.leave), rttEntitlement: parseAmount(values.rtt) });
      }
      committed = true; onCommitted(); setRefreshPending(true);
      // Publish the refreshed context to the request only for its selected person.
      const updated = await fetchPlanningAbsenceBalanceContext(client, context.person.id);
      onSaved(updated);
      setRefreshPending(false);
      setFeedback({ error: false, message: 'Droits enregistrés. Les soldes sont recalculés.' });
    } catch (failure) {
      setFeedback({ error: true, message: committed ? 'Droits enregistrés, mais les soldes n’ont pas pu être actualisés. Réessayez l’actualisation.' : planningErrorMessage(failure, 'Impossible d’enregistrer les droits.') });
    } finally { setSaving(false); onSavingChange(false); }
  }
  async function refresh() {
    if (saving) return;
    setSaving(true); onSavingChange(true);
    try {
      const updated = await fetchPlanningAbsenceBalanceContext(client, context.person.id);
      onSaved(updated); setRefreshPending(false);
      setFeedback({ error: false, message: 'Droits enregistrés. Les soldes sont recalculés.' });
    } catch {
      setFeedback({ error: true, message: 'Droits enregistrés, mais les soldes n’ont pas pu être actualisés. Réessayez l’actualisation.' });
    } finally { setSaving(false); onSavingChange(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); event.stopPropagation(); if (isAnnual) void save(); }

  return <form className="planning-leave-rights__form" onSubmit={submit}>
    <fieldset disabled={saving || refreshPending}>
      <label className="is-wide">Période de droits<select value={periodKey} onChange={(event) => changePeriod(event.target.value)}>
        {periods.map((key) => { const [start, end] = key.split(':'); return <option key={key} value={key}>Du {formatPlanningDate(start)} au {formatPlanningDate(end)}</option>; })}
        <option value="new">Nouvelle période annuelle</option>
      </select></label>
      {periodKey === 'new' ? <label className="is-wide">Année de début<input type="number" min="1900" max="2099" required value={year} onChange={(event) => { setYear(event.target.value); setAmounts(null); setFeedback(null); }} /></label> : null}
      <label>Début de période<input type="date" readOnly value={startsOn} /></label>
      <label>Fin de période<input type="date" readOnly value={endsOn} /></label>
      {(['leave', 'rtt'] as const).map((type) => <label key={type}>Total {type === 'leave' ? 'Congés' : 'RTT'} (jours)<input inputMode="decimal" required={isAnnual} value={values[type]} placeholder="Total accordé pour la période" onChange={(event) => { setAmounts({ ...values, [type]: event.target.value }); setFeedback(null); }} /></label>)}
      <p className="is-wide">Le solde disponible correspond au total saisi moins les jours validés sur cette période. Ajustez ce total pour corriger les droits ; les demandes en attente restent séparées.</p>
      {isAnnual ? <div className="planning-leave-rights__actions is-wide"><button className="is-primary" type="submit">{saving ? 'Enregistrement…' : 'Enregistrer les droits'}</button></div> : <>
        <p className="planning-absence-balances__notice is-wide">Cette période existante conserve ses dates. Ses compteurs se modifient séparément ; les nouvelles périodes vont du 1er juin au 31 mai.</p>
        <div className="planning-leave-rights__actions is-wide">{matching.map((period) => <button key={period.counterType} type="button" onClick={() => void save(period.counterType)}>Enregistrer les droits {period.counterType === 'leave' ? 'Congés' : 'RTT'}</button>)}</div>
      </>}
    </fieldset>
    {feedback ? <p className={feedback.error ? 'planning-absence-balances__error' : 'planning-absence-balances__success'} role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p> : null}
    {refreshPending ? <button type="button" disabled={saving} onClick={() => void refresh()}>Actualiser les soldes</button> : null}
  </form>;
}
