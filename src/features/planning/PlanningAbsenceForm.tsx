import { formatPlanningPerson } from './planningModel';
import { planningAbsenceTypeLabel, type PlanningAbsenceType } from './planningP12';
import type { PlanningPerson } from './planningQueries';

export interface PlanningAbsenceFormValue {
  id?: number;
  personId: string;
  absenceType: PlanningAbsenceType;
  startsAt: string;
  endsAt: string;
  reason: string;
}

type AbsencePerson = Pick<PlanningPerson, 'id' | 'firstName' | 'lastName' | 'functionLabel'>;
const ABSENCE_TYPES: PlanningAbsenceType[] = ['leave', 'rtt', 'illness', 'training', 'medical_visit', 'recovery'];

interface PlanningAbsenceFormProps {
  value: PlanningAbsenceFormValue;
  people: AbsencePerson[];
  personalOnly: boolean;
  isSaving: boolean;
  onChange: (value: PlanningAbsenceFormValue) => void;
}

export function PlanningAbsencePersonFields({ value, people, personalOnly, isSaving, onChange }: PlanningAbsenceFormProps) {
  return <>
    <label>Marin<select disabled={personalOnly || isSaving} required value={value.personId} onChange={(event) => onChange({ ...value, personId: event.target.value })}><option value="">Choisir</option>{people.map((person) => <option key={person.id} value={person.id}>{formatPlanningPerson(person)} · {person.functionLabel || 'Marin'}</option>)}</select></label>
    <label>Type<select disabled={isSaving} value={value.absenceType} onChange={(event) => onChange({ ...value, absenceType: event.target.value as PlanningAbsenceType })}>{ABSENCE_TYPES.map((type) => <option key={type} value={type}>{planningAbsenceTypeLabel(type)}</option>)}</select></label>
  </>;
}

export function PlanningAbsenceReasonField({ value, isSaving, onChange }: Pick<PlanningAbsenceFormProps, 'value' | 'isSaving' | 'onChange'>) {
  return <label className="is-wide">Motif (facultatif)<textarea aria-label="Motif" disabled={isSaving} maxLength={1000} rows={2} value={value.reason} onChange={(event) => onChange({ ...value, reason: event.target.value })} /></label>;
}

export function PlanningAbsenceFormFields(props: PlanningAbsenceFormProps) {
  const { value, isSaving, onChange } = props;
  return <>
    <PlanningAbsencePersonFields {...props} />
    <label>Début<input disabled={isSaving} required type="datetime-local" value={value.startsAt} onChange={(event) => onChange({ ...value, startsAt: event.target.value })} /></label>
    <label>Fin<input disabled={isSaving} required type="datetime-local" value={value.endsAt} onChange={(event) => onChange({ ...value, endsAt: event.target.value })} /></label>
    <PlanningAbsenceReasonField value={value} isSaving={isSaving} onChange={onChange} />
  </>;
}
