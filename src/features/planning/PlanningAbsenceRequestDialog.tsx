import type { SupabaseClient } from '@supabase/supabase-js';
import { useMemo, useState, type FormEvent } from 'react';
import { AppDialog } from '../../components/AppDialog';
import type { CurrentPersonSummary } from '../profiles/profileQueries';
import { PlanningAbsenceFormFields, type PlanningAbsenceFormValue } from './PlanningAbsenceForm';
import { todayPlanningDate } from './planningDates';
import { planningErrorMessage } from './planningErrors';
import type { PlanningDateRange } from './planningP12';
import { savePlanningAbsence } from './planningP12Queries';
import type { PlanningPerson } from './planningQueries';

export function PlanningAbsenceRequestDialog({ client, people, currentPerson, personalOnly, range, onClose, onSaved }: {
  client: SupabaseClient;
  people: PlanningPerson[];
  currentPerson: CurrentPersonSummary | null;
  personalOnly: boolean;
  range: PlanningDateRange;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<PlanningAbsenceFormValue>(() => ({
    personId: '', absenceType: 'leave',
    startsAt: `${range.start || todayPlanningDate()}T08:00`,
    endsAt: `${range.start || todayPlanningDate()}T18:00`,
    reason: '',
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = useMemo(() => {
    const available: Pick<PlanningPerson, 'id' | 'firstName' | 'lastName' | 'functionLabel'>[] = people
      .filter((person) => person.active && (!personalOnly || person.id === currentPerson?.id));
    if (currentPerson && !available.some((person) => person.id === currentPerson.id)) return [currentPerson, ...available];
    return available;
  }, [people, currentPerson, personalOnly]);
  const effectiveForm = { ...form, personId: personalOnly ? String(currentPerson?.id ?? '') : form.personId || String(currentPerson?.id ?? '') };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving || !effectiveForm.personId) return;
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
      description="Les dates sont affichées en heure locale et conservées en UTC."
      isBusy={isSaving}
      onClose={onClose}
      onSubmit={(event) => void submit(event)}
      size="lg"
      title="Demandes et indisponibilités"
    >
      <div className="planning-p12-section">
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="planning-p12-form">
          <PlanningAbsenceFormFields isSaving={isSaving} onChange={setForm} people={options} personalOnly={personalOnly} value={effectiveForm} />
          <footer>
            <button className="is-secondary" disabled={isSaving} onClick={onClose} type="button">Annuler</button>
            <button disabled={isSaving || !effectiveForm.personId} type="submit">{isSaving ? 'Envoi en cours…' : 'Envoyer la demande'}</button>
          </footer>
        </div>
      </div>
    </AppDialog>
  </div>;
}
