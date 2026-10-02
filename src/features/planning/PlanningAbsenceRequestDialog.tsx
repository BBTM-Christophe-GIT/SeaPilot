import type { SupabaseClient } from '@supabase/supabase-js';
import { useMemo, useState, type FormEvent } from 'react';
import { AppDialog } from '../../components/AppDialog';
import type { CurrentPersonSummary } from '../profiles/profileQueries';
import { PlanningAbsencePersonFields, PlanningAbsenceReasonField, type PlanningAbsenceFormValue } from './PlanningAbsenceForm';
import { PlanningAbsenceBalances } from './PlanningAbsenceBalances';
import { PlanningAbsencePeriodPicker } from './PlanningAbsencePeriodPicker';
import { todayPlanningDate } from './planningDates';
import { planningErrorMessage } from './planningErrors';
import { isPlanningPersonEmployedOn } from './planningModel';
import type { PlanningDateRange } from './planningP12';
import { savePlanningAbsence } from './planningP12Queries';
import type { PlanningPerson } from './planningQueries';
import './planningAbsenceRequest.css';

export function PlanningAbsenceRequestDialog({ client, people, currentPerson, personalOnly, range, onClose, onSaved, canManageBalances = false }: {
  client: SupabaseClient;
  people: PlanningPerson[];
  currentPerson: CurrentPersonSummary | null;
  personalOnly: boolean;
  range: PlanningDateRange;
  onClose: () => void;
  onSaved: () => Promise<void>;
  canManageBalances?: boolean;
}) {
  const [form, setForm] = useState<PlanningAbsenceFormValue>(() => ({
    personId: '', absenceType: 'leave',
    startsAt: `${range.start || todayPlanningDate()}T08:00`,
    endsAt: `${range.start || todayPlanningDate()}T18:00`,
    reason: '',
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingBalances, setIsEditingBalances] = useState(false);
  const [isSelectingPeriod, setIsSelectingPeriod] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = todayPlanningDate();
  const options = useMemo(() => {
    const available: Pick<PlanningPerson, 'id' | 'firstName' | 'lastName' | 'functionLabel'>[] = people
      .filter((person) => isPlanningPersonEmployedOn(person, today) && (!personalOnly || person.id === currentPerson?.id));
    if (currentPerson && isPlanningPersonEmployedOn(currentPerson, today) && !people.some((person) => person.id === currentPerson.id)) return [currentPerson, ...available];
    return available;
  }, [people, currentPerson, personalOnly, today]);
  const selectedPersonId = personalOnly ? String(currentPerson?.id ?? '') : form.personId || String(currentPerson?.id ?? '');
  const effectiveForm = { ...form, personId: options.some((person) => String(person.id) === selectedPersonId) ? selectedPersonId : '' };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving || isEditingBalances || isSelectingPeriod || !effectiveForm.personId) return;
    setIsSaving(true);
    setError(null);
    try {
      await savePlanningAbsence(client, { ...effectiveForm, personId: Number(effectiveForm.personId) });
      await onSaved();
      onClose();
    } catch (failure) {
      setError(planningErrorMessage(failure, 'Impossible d’enregistrer la demande de congés.'));
    } finally {
      setIsSaving(false);
    }
  }

  return <div className="planning-absence-request">
    <AppDialog
      description="Choisissez un jour ou une période, puis consultez le solde de la personne."
      isBusy={isSaving || isEditingBalances || isSelectingPeriod}
      onClose={onClose}
      onSubmit={(event) => void submit(event)}
      size="lg"
      title="Demandes et indisponibilités"
      footer={<div className="app-dialog__actions">
        <button className="is-secondary" disabled={isSaving || isEditingBalances || isSelectingPeriod} onClick={onClose} type="button">Annuler</button>
        <button className="is-primary" disabled={isSaving || isEditingBalances || isSelectingPeriod || !effectiveForm.personId} type="submit">{isSaving ? 'Envoi en cours…' : 'Envoyer la demande'}</button>
      </div>}
    >
      <div className="planning-p12-section">
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="planning-p12-form">
          <PlanningAbsencePersonFields isSaving={isSaving || isEditingBalances} onChange={setForm} people={options} personalOnly={personalOnly} value={effectiveForm} />
          <PlanningAbsencePeriodPicker startsAt={effectiveForm.startsAt} endsAt={effectiveForm.endsAt} disabled={isSaving || isEditingBalances} onOpenChange={setIsSelectingPeriod} onChange={(startsAt, endsAt) => setForm((current) => ({ ...current, startsAt, endsAt }))} />
          <PlanningAbsenceBalances client={client} people={options} personId={effectiveForm.personId ? Number(effectiveForm.personId) : null} absenceType={effectiveForm.absenceType} startsAt={effectiveForm.startsAt} endsAt={effectiveForm.endsAt} absenceId={effectiveForm.id} canManage={canManageBalances && !personalOnly && !isSaving && !isSelectingPeriod} onEditingChange={setIsEditingBalances} />
          <PlanningAbsenceReasonField isSaving={isSaving || isEditingBalances} onChange={setForm} value={effectiveForm} />
        </div>
      </div>
    </AppDialog>
  </div>;
}
