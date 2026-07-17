import { ArrowRight, ClipboardCheck, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { formatPlanningDate, formatPlanningDateTime, utcToPlanningLocalDateTime } from './planningDates';
import {
  buildPlanningHandoverComparison,
  buildPlanningHandoverPositions,
  handoverPositionInputFromRecord,
  type PlanningHandoverComparisonStatus,
} from './planningHandovers';
import { formatPlanningPerson } from './planningModel';
import type {
  PlanningAssignmentRecord,
  PlanningHandoverRecord,
  PlanningHandoverStatus,
  PlanningOverview,
  SavePlanningHandoverInput,
  SavePlanningHandoverPositionInput,
} from './planningQueries';

const HANDOVER_STATUS_LABELS: Record<PlanningHandoverStatus, string> = {
  draft: 'Brouillon',
  planned: 'Planifiée',
  confirmed: 'Confirmée',
  completed: 'Terminée',
  cancelled: 'Annulée',
};

const COMPARISON_STATUS_LABELS: Record<PlanningHandoverComparisonStatus, string> = {
  unchanged: 'Poste inchangé',
  replaced: 'Poste remplacé',
  vacant: 'Poste vacant',
  noncompliant: 'Poste non conforme',
};

function assignmentPeriod(assignment: PlanningAssignmentRecord): string {
  if (assignment.startsAt && assignment.endsAt) {
    return `${formatPlanningDateTime(assignment.startsAt)} – ${formatPlanningDateTime(assignment.endsAt)}`;
  }
  return `${formatPlanningDate(assignment.startsOn)} – ${formatPlanningDate(assignment.endsOn)}`;
}
export function PlanningAssignmentDetailView({
  mode,
  overview,
  vesselName,
  personName,
  editable,
  onOpenAssignment,
  onNewAssignment,
  onOpenHandover,
}: {
  mode: 'vessel' | 'sailor';
  overview: PlanningOverview;
  vesselName: string;
  personName: string;
  editable: boolean;
  onOpenAssignment: (assignmentId: number) => void;
  onNewAssignment: () => void;
  onOpenHandover: (handover: PlanningHandoverRecord) => void;
}) {
  const assignments = overview.assignments
    .filter((assignment) => mode === 'vessel' ? assignment.vesselName === vesselName : assignment.crewName === personName)
    .sort((left, right) => left.startsOn.localeCompare(right.startsOn));
  const vessel = overview.vessels.find((item) => item.name === vesselName);
  const handovers = mode === 'vessel' && vessel
    ? overview.handovers.filter((handover) => handover.vesselId === vessel.id)
    : [];
  const title = mode === 'vessel' ? vesselName || 'Sélectionnez un navire' : personName || 'Sélectionnez un marin';

  return (
    <div className="planning-entity-view">
      <header>
        <div><small>{mode === 'vessel' ? 'Vue navire' : 'Vue marin'}</small><h2>{title}</h2></div>
        {editable ? <button onClick={onNewAssignment} type="button"><Plus aria-hidden="true" size={16} />Nouvelle affectation</button> : null}
      </header>
      {assignments.length ? (
        <div className="planning-assignment-table-wrap">
          <table className="planning-assignment-table">
            <thead><tr><th>{mode === 'vessel' ? 'Marin' : 'Navire'}</th><th>Fonction</th><th>Période</th><th>État</th><th>Bordée</th><th /></tr></thead>
            <tbody>{assignments.map((assignment) => (
              <tr key={assignment.id}>
                <td><strong>{mode === 'vessel' ? assignment.crewName : assignment.vesselName}</strong></td>
                <td>{assignment.assignmentRole}</td>
                <td>{assignmentPeriod(assignment)}</td>
                <td><span className={`planning-confirmation-pill is-${assignment.confirmationStatus}`}>{assignment.confirmationStatus === 'confirmed' ? 'Confirmée' : assignment.confirmationStatus === 'provisional' ? 'Provisoire' : 'Annulée'}</span></td>
                <td>{assignment.watchGroup}</td>
                <td><button aria-label={`Ouvrir l’affectation de ${assignment.crewName}`} onClick={() => onOpenAssignment(assignment.id)} type="button">Ouvrir</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <div className="planning-calendar-empty"><p>Aucune affectation ne correspond à cette vue.</p></div>}
      {mode === 'vessel' ? (
        <section className="planning-handover-cards" aria-label="Relèves du navire">
          <h3>Relèves</h3>
          {handovers.length ? handovers.map((handover) => (
            <button className="planning-handover-card" key={handover.id} onClick={() => onOpenHandover(handover)} type="button">
              <span><strong>{formatPlanningDateTime(handover.handoverAt)}</strong><small>{handover.location}</small></span>
              <span>{handover.positions.length} poste(s)<small>{HANDOVER_STATUS_LABELS[handover.status]}</small></span>
            </button>
          )) : <p className="planning-muted-copy">Aucune relève enregistrée pour ce navire.</p>}
        </section>
      ) : null}
    </div>
  );
}
const EMPTY_POSITION: SavePlanningHandoverPositionInput = {
  functionLabel: 'Équipage',
  outgoingPersonId: '',
  incomingPersonId: '',
  outgoingAssignmentId: '',
  incomingAssignmentId: '',
  comments: '',
};

export function PlanningHandoverDialog({ overview, handover, editable, isSaving, onClose, onSave }: {
  overview: PlanningOverview;
  handover: PlanningHandoverRecord | null;
  editable: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (input: SavePlanningHandoverInput) => void;
}) {
  const initialDate = handover ? utcToPlanningLocalDateTime(handover.handoverAt) : `${new Date().toISOString().slice(0, 10)}T12:00`;
  const [form, setForm] = useState<SavePlanningHandoverInput>({
    id: handover?.id,
    vesselId: handover ? String(handover.vesselId) : '',
    handoverAt: initialDate,
    location: handover?.location || '',
    durationMinutes: handover?.durationMinutes || 60,
    responsiblePersonId: handover ? String(handover.responsiblePersonId) : '',
    comments: handover?.comments || '',
    status: handover?.status || 'draft',
    positions: handover?.positions.map(handoverPositionInputFromRecord) || [{ ...EMPTY_POSITION }],
  });
  const comparison = useMemo(() => {
    if (!form.vesselId || !form.handoverAt) return [];
    return buildPlanningHandoverComparison(overview, Number(form.vesselId), form.handoverAt, form.positions);
  }, [form.handoverAt, form.positions, form.vesselId, overview]);
  const updatePosition = (index: number, patch: Partial<SavePlanningHandoverPositionInput>) => {
    setForm((current) => ({
      ...current,
      positions: current.positions.map((position, positionIndex) => positionIndex === index ? { ...position, ...patch } : position),
    }));
  };
  const prefill = () => {
    const positions = buildPlanningHandoverPositions(overview.assignments, Number(form.vesselId), form.handoverAt);
    setForm((current) => ({ ...current, positions: positions.length ? positions : [{ ...EMPTY_POSITION }] }));
  };

  return (
    <div className="planning-dialog-backdrop is-side-panel" role="presentation">
      <form aria-modal="true" className="planning-dialog is-side-panel is-handover" onSubmit={(event: FormEvent) => { event.preventDefault(); if (editable) onSave(form); }} role="dialog">
        <header><div><ClipboardCheck aria-hidden="true" size={20} /><span><small>Relève maritime</small><h2>{handover ? editable ? 'Modifier la relève' : 'Consulter la relève' : 'Nouvelle relève'}</h2></span></div><button aria-label="Fermer" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button></header>
        <fieldset className="planning-handover-fieldset" disabled={!editable}>
        <div className="planning-dialog-grid">
          <label>Navire<select required value={form.vesselId} onChange={(event) => setForm((current) => ({ ...current, vesselId: event.target.value }))}><option value="">Choisir</option>{overview.vessels.filter((vessel) => vessel.active).map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name}</option>)}</select></label>
          <label>Date et heure<input required type="datetime-local" value={form.handoverAt} onChange={(event) => setForm((current) => ({ ...current, handoverAt: event.target.value }))} /></label>
          <label>Port ou lieu<input required value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} /></label>
          <label>Durée de passation (min)<input min="0" max="1440" required type="number" value={form.durationMinutes} onChange={(event) => setForm((current) => ({ ...current, durationMinutes: Number(event.target.value) }))} /></label>
          <label>Responsable<select required value={form.responsiblePersonId} onChange={(event) => setForm((current) => ({ ...current, responsiblePersonId: event.target.value }))}><option value="">Choisir</option>{overview.people.filter((person) => person.active).map((person) => <option key={person.id} value={person.id}>{formatPlanningPerson(person)}</option>)}</select></label>
          <label>Statut<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as PlanningHandoverStatus }))}>{Object.entries(HANDOVER_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="is-wide">Commentaires<textarea value={form.comments} onChange={(event) => setForm((current) => ({ ...current, comments: event.target.value }))} /></label>
        </div>
        <section className="planning-handover-editor">
          <header><div><h3>Bordées entrante et sortante</h3><p>Comparez chaque fonction avant de confirmer la relève.</p></div><button className="is-secondary" disabled={!form.vesselId || !form.handoverAt} onClick={prefill} type="button">Préremplir depuis les affectations</button></header>
          {form.positions.map((position, index) => (
            <div className="planning-handover-position" key={index}>
              <label>Fonction<input required value={position.functionLabel} onChange={(event) => updatePosition(index, { functionLabel: event.target.value })} /></label>
              <label>Sortant<select value={position.outgoingPersonId} onChange={(event) => updatePosition(index, { outgoingPersonId: event.target.value, outgoingAssignmentId: '' })}><option value="">Poste non pourvu</option>{overview.people.map((person) => <option key={person.id} value={person.id}>{formatPlanningPerson(person)}</option>)}</select></label>
              <ArrowRight aria-hidden="true" size={18} />
              <label>Entrant<select value={position.incomingPersonId} onChange={(event) => updatePosition(index, { incomingPersonId: event.target.value, incomingAssignmentId: '' })}><option value="">Poste vacant</option>{overview.people.map((person) => <option key={person.id} value={person.id}>{formatPlanningPerson(person)}</option>)}</select></label>
              <button aria-label={`Supprimer le poste ${index + 1}`} disabled={form.positions.length === 1} onClick={() => setForm((current) => ({ ...current, positions: current.positions.filter((_, positionIndex) => positionIndex !== index) }))} type="button"><Trash2 aria-hidden="true" size={16} /></button>
            </div>
          ))}
          <button className="planning-add-position" onClick={() => setForm((current) => ({ ...current, positions: [...current.positions, { ...EMPTY_POSITION }] }))} type="button"><Plus aria-hidden="true" size={16} />Ajouter un poste</button>
        </section>
        <PlanningHandoverComparison rows={comparison} />
        </fieldset>
        <footer><button className="is-secondary" onClick={onClose} type="button">{editable ? 'Annuler' : 'Fermer'}</button>{editable ? <button disabled={isSaving} type="submit">Enregistrer la relève</button> : null}</footer>
      </form>
    </div>
  );
}
function PlanningHandoverComparison({ rows }: { rows: ReturnType<typeof buildPlanningHandoverComparison> }) {
  return (
    <section className="planning-handover-comparison">
      <h3>Comparaison des bordées</h3>
      <div className="planning-assignment-table-wrap"><table className="planning-assignment-table"><thead><tr><th>Fonction</th><th>Sortant</th><th>Entrant</th><th>Comparaison</th><th>Documents / qualifications</th></tr></thead><tbody>
        {rows.map((row) => <tr key={row.key}><td>{row.functionLabel}</td><td>{row.outgoingPersonName}</td><td>{row.incomingPersonName}</td><td><span className={`planning-comparison-pill is-${row.status}`}>{COMPARISON_STATUS_LABELS[row.status]}</span></td><td>{row.documentIssues.length || row.qualificationIssues.length ? [...row.documentIssues, ...row.qualificationIssues].map((control) => <small className="planning-comparison-issue" key={control.id}>{control.title}</small>) : <small>Conforme aux données connues</small>}</td></tr>)}
      </tbody></table></div>
    </section>
  );
}
