import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AlertTriangle,
  Ban,
  CalendarOff,
  Check,
  ExternalLink,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UserRoundSearch,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { formatPlanningDate, formatPlanningDateTime, todayPlanningDate, utcToPlanningLocalDateTime } from './planningDates';
import { planningErrorMessage } from './planningErrors';
import { formatPlanningPerson, normalizePlanningText } from './planningModel';
import type { PlanningOverview, PlanningPerson } from './planningQueries';
import {
  absenceImpactedAssignments,
  buildPlanningP12Conflicts,
  buildPlanningReplacementCandidates,
  planningAbsenceTypeLabel,
  planningConflictTypeLabel,
  type PlanningAbsenceRecord,
  type PlanningAbsenceType,
  type PlanningConflictCaseRecord,
  type PlanningConflictPriority,
  type PlanningConflictStatus,
  type PlanningDateRange,
  type PlanningDetectedConflict,
  type PlanningP12Data,
  type PlanningReplacementFilters,
} from './planningP12';
import {
  deletePlanningLeave,
  ensurePlanningConflictCase,
  fetchPlanningP12Data,
  reviewPlanningAbsence,
  savePlanningAbsence,
  updatePlanningConflictCase,
} from './planningP12Queries';

export type P12Tab = 'absences' | 'conflicts' | 'replacements';

interface AbsenceFormState {
  id?: number;
  personId: string;
  absenceType: PlanningAbsenceType;
  startsAt: string;
  endsAt: string;
  reason: string;
}

interface TreatmentFormState {
  assignToMe: boolean;
  priority: PlanningConflictPriority;
  status: PlanningConflictStatus;
  comment: string;
}

const EMPTY_DATA: PlanningP12Data = { absences: [], conflictCases: [], conflictHistory: [], matrices: [] };
const ABSENCE_TYPES: PlanningAbsenceType[] = ['leave', 'illness', 'training', 'medical_visit', 'unavailability', 'recovery'];
const CONFLICT_PRIORITIES: PlanningConflictPriority[] = ['low', 'normal', 'high', 'critical'];
const CONFLICT_STATUSES: PlanningConflictStatus[] = ['open', 'in_progress', 'resolved', 'dismissed'];

const ABSENCE_STATUS_LABELS: Record<PlanningAbsenceRecord['status'], string> = {
  requested: 'Demandée', approved: 'Validée', rejected: 'Refusée', cancelled: 'Annulée',
};
const LEAVE_STATUS_LABELS: Record<PlanningAbsenceRecord['status'], string> = {
  requested: 'Demandés', approved: 'Validés', rejected: 'Refusés', cancelled: 'Annulés',
};
const CONFLICT_STATUS_LABELS: Record<PlanningConflictStatus, string> = {
  open: 'Ouvert', in_progress: 'En cours', resolved: 'Résolu', dismissed: 'Classé sans suite', derogated: 'Classé historiquement',
};
const PRIORITY_LABELS: Record<PlanningConflictPriority, string> = {
  low: 'Basse', normal: 'Normale', high: 'Haute', critical: 'Critique',
};

function localDateTime(date: string, time: string): string {
  return `${date}T${time}`;
}

function emptyAbsence(range: PlanningDateRange, people: PlanningPerson[]): AbsenceFormState {
  const date = range.start || todayPlanningDate();
  return {
    personId: people[0] ? String(people[0].id) : '',
    absenceType: 'leave',
    startsAt: localDateTime(date, '08:00'),
    endsAt: localDateTime(date, '18:00'),
    reason: '',
  };
}

function treatmentFromCase(conflictCase: PlanningConflictCaseRecord | undefined): TreatmentFormState {
  return {
    assignToMe: !conflictCase?.ownerId,
    priority: conflictCase?.priority || 'normal',
    status: conflictCase?.status === 'derogated' ? 'dismissed' : conflictCase?.status || 'open',
    comment: '',
  };
}

function severityLabel(severity: PlanningDetectedConflict['severity']): string {
  return severity === 'blocking' ? 'Blocage' : severity === 'warning' ? 'Avertissement' : 'Information';
}

function compatibilityLabel(compatibility: 'compatible' | 'warning' | 'incompatible'): string {
  return compatibility === 'compatible' ? 'Compatible' : compatibility === 'warning' ? 'À confirmer' : 'Incompatible';
}

function absenceStatusLabel(absence: PlanningAbsenceRecord): string {
  return absence.absenceType === 'leave' ? LEAVE_STATUS_LABELS[absence.status] : ABSENCE_STATUS_LABELS[absence.status];
}

export function PlanningP12Panel({
  client,
  overview,
  range,
  canRequestAbsences,
  canReviewAbsences,
  canDeleteLeaves,
  canManageConflictCases,
  canPrepareReplacements,
  onClose,
  onPrepareReplacement,
  onOpenSource,
  onAuditChange,
  initialTab = 'conflicts',
  initialAbsenceId = null,
  openAbsenceFormOnMount = false,
  requestedOnly = false,
}: {
  client: SupabaseClient;
  overview: PlanningOverview;
  range: PlanningDateRange;
  canRequestAbsences: boolean;
  canReviewAbsences: boolean;
  canDeleteLeaves: boolean;
  canManageConflictCases: boolean;
  canPrepareReplacements: boolean;
  onClose: () => void;
  onPrepareReplacement: (person: PlanningPerson, conflict: PlanningDetectedConflict) => void;
  onOpenSource: (conflict: PlanningDetectedConflict) => void;
  onAuditChange: () => Promise<void>;
  initialTab?: P12Tab;
  initialAbsenceId?: number | null;
  openAbsenceFormOnMount?: boolean;
  requestedOnly?: boolean;
}) {
  const people = useMemo(() => overview.people.filter((person) => person.active), [overview.people]);
  const [tab, setTab] = useState<P12Tab>(initialTab);
  const [data, setData] = useState<PlanningP12Data>(EMPTY_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const [absenceForm, setAbsenceForm] = useState<AbsenceFormState>(() => emptyAbsence(range, people));
  const [isAbsenceFormOpen, setIsAbsenceFormOpen] = useState(openAbsenceFormOnMount);
  const [reviewComments, setReviewComments] = useState<Record<number, string>>({});
  const [selectedConflictKey, setSelectedConflictKey] = useState('');
  const [conflictTypeFilter, setConflictTypeFilter] = useState('');
  const [conflictStateFilter, setConflictStateFilter] = useState('active');
  const [replacementFilters, setReplacementFilters] = useState<PlanningReplacementFilters>({ functionLabel: '', qualification: '' });

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setData(await fetchPlanningP12Data(client));
      setFeedback(null);
    } catch (error) {
      setFeedback({ message: planningErrorMessage(error, 'Impossible de charger les absences et conflits.'), error: true });
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    let active = true;
    void fetchPlanningP12Data(client)
      .then((result) => { if (active) setData(result); })
      .catch((error) => { if (active) setFeedback({ message: planningErrorMessage(error, 'Impossible de charger les absences et conflits.'), error: true }); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [client]);

  const detectedConflicts = useMemo(
    () => buildPlanningP12Conflicts(overview, data, range),
    [data, overview, range],
  );
  const casesByKey = useMemo(
    () => new Map(data.conflictCases.map((conflictCase) => [conflictCase.conflictKey, conflictCase])),
    [data.conflictCases],
  );
  const filteredConflicts = useMemo(() => detectedConflicts.filter((item) => {
    const conflictCase = casesByKey.get(item.key);
    if (conflictTypeFilter && item.type !== conflictTypeFilter) return false;
    if (conflictStateFilter === 'active' && ['resolved', 'dismissed', 'derogated'].includes(conflictCase?.status || '')) return false;
    if (conflictStateFilter === 'treated' && !['resolved', 'dismissed', 'derogated'].includes(conflictCase?.status || '')) return false;
    return true;
  }), [casesByKey, conflictStateFilter, conflictTypeFilter, detectedConflicts]);
  const selectedConflict = detectedConflicts.find((item) => item.key === selectedConflictKey)
    || filteredConflicts[0]
    || detectedConflicts[0];
  const selectedCase = selectedConflict ? casesByKey.get(selectedConflict.key) : undefined;
  const displayedAbsences = useMemo(() => {
    const filtered = requestedOnly
      ? data.absences.filter((absence) => absence.status === 'requested')
      : data.absences;
    if (!initialAbsenceId) return filtered;
    return [...filtered].sort((left, right) => Number(right.id === initialAbsenceId) - Number(left.id === initialAbsenceId));
  }, [data.absences, initialAbsenceId, requestedOnly]);
  const [treatment, setTreatment] = useState<TreatmentFormState>(() => treatmentFromCase(undefined));
  const [treatmentKey, setTreatmentKey] = useState('');
  const effectiveTreatment = treatmentKey === selectedConflict?.key ? treatment : treatmentFromCase(selectedCase);

  const candidates = useMemo(
    () => selectedConflict
      ? buildPlanningReplacementCandidates(overview, data, selectedConflict, replacementFilters)
      : [],
    [data, overview, replacementFilters, selectedConflict],
  );
  const selectedHistory = selectedCase
    ? data.conflictHistory.filter((item) => item.caseId === selectedCase.id)
    : [];
  const functionOptions = useMemo(
    () => [...new Set(people.map((person) => person.functionLabel).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'fr')),
    [people],
  );
  const activeConflicts = detectedConflicts.filter((item) => !['resolved', 'dismissed', 'derogated'].includes(casesByKey.get(item.key)?.status || ''));
  const blockingCount = activeConflicts.filter((item) => item.severity === 'blocking').length;
  const warningCount = activeConflicts.filter((item) => item.severity === 'warning').length;
  const vacantCount = activeConflicts.filter((item) => item.type === 'vacant_position').length;

  async function submitAbsence(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setFeedback(null);
    try {
      await savePlanningAbsence(client, {
        id: absenceForm.id,
        personId: Number(absenceForm.personId),
        absenceType: absenceForm.absenceType,
        startsAt: absenceForm.startsAt,
        endsAt: absenceForm.endsAt,
        reason: absenceForm.reason,
      });
      await Promise.all([load(), onAuditChange()]);
      setAbsenceForm(emptyAbsence(range, people));
      setIsAbsenceFormOpen(false);
      setFeedback({ message: 'Demande d’absence enregistrée. Les impacts sont recalculés.', error: false });
    } catch (error) {
      setFeedback({ message: planningErrorMessage(error, 'Impossible d’enregistrer la demande d’absence.'), error: true });
    } finally {
      setIsSaving(false);
    }
  }

  async function reviewAbsence(absence: PlanningAbsenceRecord, action: 'approve' | 'reject' | 'cancel') {
    setIsSaving(true);
    setFeedback(null);
    try {
      await reviewPlanningAbsence(client, absence.id, action, reviewComments[absence.id] || '');
      await Promise.all([load(), onAuditChange()]);
      setFeedback({
        message: action === 'approve' ? 'Absence validée et impacts recalculés.' : action === 'reject' ? 'Demande refusée.' : 'Demande annulée.',
        error: false,
      });
    } catch (error) {
      setFeedback({ message: planningErrorMessage(error, 'Impossible de traiter cette demande.'), error: true });
    } finally {
      setIsSaving(false);
    }
  }

  async function removeLeave(absence: PlanningAbsenceRecord, personName: string) {
    const confirmed = window.confirm(
      `Supprimer les congés de ${personName} du ${formatPlanningDate(absence.startsOn)} au ${formatPlanningDate(absence.endsOn)} ?\n\n`
      + 'Cette action est définitive et sera enregistrée dans l’historique Planning.',
    );
    if (!confirmed) return;

    setIsSaving(true);
    setFeedback(null);
    try {
      await deletePlanningLeave(client, absence.id);
      await Promise.all([load(), onAuditChange()]);
      setFeedback({ message: 'Congés supprimés. Les impacts ont été recalculés.', error: false });
    } catch (error) {
      setFeedback({ message: planningErrorMessage(error, 'Impossible de supprimer les congés.'), error: true });
    } finally {
      setIsSaving(false);
    }
  }

  function editAbsence(absence: PlanningAbsenceRecord) {
    setAbsenceForm({
      id: absence.id,
      personId: String(absence.personId),
      absenceType: absence.absenceType,
      startsAt: utcToPlanningLocalDateTime(absence.startsAt),
      endsAt: utcToPlanningLocalDateTime(absence.endsAt),
      reason: absence.reason,
    });
    setIsAbsenceFormOpen(true);
  }

  async function submitTreatment(event: FormEvent) {
    event.preventDefault();
    if (!selectedConflict) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      const caseId = await ensurePlanningConflictCase(client, selectedConflict);
      await updatePlanningConflictCase(client, {
        caseId,
        assignToMe: effectiveTreatment.assignToMe,
        priority: effectiveTreatment.priority,
        status: effectiveTreatment.status,
        comment: effectiveTreatment.comment,
      });
      await Promise.all([load(), onAuditChange()]);
      setFeedback({ message: 'Traitement du conflit enregistré et historisé.', error: false });
    } catch (error) {
      setFeedback({ message: planningErrorMessage(error, 'Impossible de traiter ce conflit.'), error: true });
    } finally {
      setIsSaving(false);
    }
  }

  function chooseConflict(item: PlanningDetectedConflict, nextTab: P12Tab = 'conflicts') {
    setSelectedConflictKey(item.key);
    setTreatmentKey(item.key);
    setTreatment(treatmentFromCase(casesByKey.get(item.key)));
    setReplacementFilters({ functionLabel: item.functionLabel, qualification: '' });
    setTab(nextTab);
  }

  function changeTreatment(patch: Partial<TreatmentFormState>) {
    if (!selectedConflict) return;
    setTreatmentKey(selectedConflict.key);
    setTreatment((current) => ({
      ...(treatmentKey === selectedConflict.key ? current : treatmentFromCase(selectedCase)),
      ...patch,
    }));
  }

  return (
    <div className="planning-dialog-backdrop is-side-panel" role="presentation">
      <section aria-label="Absences, remplacements et centre de conflits" aria-modal="true" className="planning-dialog is-side-panel planning-p12-panel" role="dialog">
        <header>
          <div><ShieldAlert aria-hidden="true" size={20} /><span><small>Planification opérationnelle · P1.2</small><h2>Absences et conflits</h2></span></div>
          <div><button aria-label="Actualiser les absences et conflits" disabled={isLoading} onClick={() => void load()} type="button"><RefreshCw size={17} /></button><button aria-label="Fermer" onClick={onClose} type="button"><X size={18} /></button></div>
        </header>
        <div className="planning-p12-kpis" aria-label="Indicateurs de conflits">
          <span className="is-danger"><strong>{blockingCount}</strong> blocage(s)</span>
          <span className="is-warning"><strong>{warningCount}</strong> avertissement(s)</span>
          <span><strong>{vacantCount}</strong> poste(s) vacant(s)</span>
          <span><strong>{data.absences.filter((absence) => absence.status === 'requested').length}</strong> demande(s) à traiter</span>
        </div>
        <nav aria-label="Sections P1.2" className="planning-p12-tabs">
          <button aria-selected={tab === 'absences'} className={tab === 'absences' ? 'is-active' : ''} onClick={() => setTab('absences')} role="tab" type="button"><CalendarOff size={16} />Absences</button>
          <button aria-selected={tab === 'conflicts'} className={tab === 'conflicts' ? 'is-active' : ''} onClick={() => setTab('conflicts')} role="tab" type="button"><AlertTriangle size={16} />Centre de conflits</button>
          <button aria-selected={tab === 'replacements'} className={tab === 'replacements' ? 'is-active' : ''} onClick={() => setTab('replacements')} role="tab" type="button"><UserRoundSearch size={16} />Remplacements</button>
        </nav>
        {feedback ? <p className={feedback.error ? 'form-error planning-p12-feedback' : 'admin-success planning-p12-feedback'} role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p> : null}
        <div className="planning-p12-body">
          {isLoading ? <div className="admin-state" role="status">Chargement des absences, conflits et matrices…</div> : null}
          {!isLoading && tab === 'absences' ? (
            <section className="planning-p12-section">
              <div className="planning-p12-section-heading"><div><h3>Demandes et indisponibilités</h3><p>Les dates sont affichées en heure locale et conservées en UTC.</p></div>{canRequestAbsences ? <button onClick={() => { setAbsenceForm(emptyAbsence(range, people)); setIsAbsenceFormOpen((value) => !value); }} type="button"><Plus size={16} />Nouvelle demande</button> : null}</div>
              {isAbsenceFormOpen ? <form className="planning-p12-form" onSubmit={submitAbsence}>
                <label>Marin<select required value={absenceForm.personId} onChange={(event) => setAbsenceForm({ ...absenceForm, personId: event.target.value })}><option value="">Choisir</option>{people.map((person) => <option key={person.id} value={person.id}>{formatPlanningPerson(person)} · {person.functionLabel || 'Marin'}</option>)}</select></label>
                <label>Type<select value={absenceForm.absenceType} onChange={(event) => setAbsenceForm({ ...absenceForm, absenceType: event.target.value as PlanningAbsenceType })}>{ABSENCE_TYPES.map((type) => <option key={type} value={type}>{planningAbsenceTypeLabel(type)}</option>)}</select></label>
                <label>Début<input required type="datetime-local" value={absenceForm.startsAt} onChange={(event) => setAbsenceForm({ ...absenceForm, startsAt: event.target.value })} /></label>
                <label>Fin<input required type="datetime-local" value={absenceForm.endsAt} onChange={(event) => setAbsenceForm({ ...absenceForm, endsAt: event.target.value })} /></label>
                <label className="is-wide">Motif (facultatif)<textarea aria-label="Motif" maxLength={1000} rows={3} value={absenceForm.reason} onChange={(event) => setAbsenceForm({ ...absenceForm, reason: event.target.value })} /></label>
                <footer><button className="is-secondary" onClick={() => setIsAbsenceFormOpen(false)} type="button">Annuler</button><button disabled={isSaving} type="submit">{absenceForm.id ? 'Mettre à jour' : 'Envoyer la demande'}</button></footer>
              </form> : null}
              <div className="planning-p12-absence-list">{displayedAbsences.length ? displayedAbsences.map((absence) => {
                const person = overview.people.find((item) => item.id === absence.personId);
                const personName = person ? formatPlanningPerson(person) : `Marin #${absence.personId}`;
                const impacts = absenceImpactedAssignments(overview, absence);
                return <article className={`planning-p12-card${absence.id === initialAbsenceId ? ' is-selected' : ''}`} key={absence.id}>
                  <header>
                    <div><strong>{personName}</strong><small>{planningAbsenceTypeLabel(absence.absenceType)} · {formatPlanningDateTime(absence.startsAt)} au {formatPlanningDateTime(absence.endsAt)}</small></div>
                    <span className={`planning-p12-status is-${absence.status}`}>{absenceStatusLabel(absence)}</span>
                  </header>
                  <p>{absence.reason || 'Aucun motif renseigné.'}</p>
                  <div className="planning-p12-impact"><strong>{impacts.length}</strong><span>affectation(s) concernée(s){absence.status === 'approved' && impacts.length ? ` · ${impacts.length} poste(s) vacant(s)` : ''}</span></div>
                  {absence.reviewComment ? <small>Décision · {absence.reviewComment}</small> : null}
                  {absence.status === 'requested' ? <div className="planning-p12-review">
                    <label>Commentaire<input aria-label={`Commentaire pour ${personName}`} value={reviewComments[absence.id] || ''} onChange={(event) => setReviewComments((current) => ({ ...current, [absence.id]: event.target.value }))} /></label>
                    <div>
                      {canRequestAbsences ? <button className="is-secondary" onClick={() => editAbsence(absence)} type="button">Modifier</button> : null}
                      {canReviewAbsences ? <>
                        <button className="is-success" disabled={isSaving} onClick={() => void reviewAbsence(absence, 'approve')} type="button"><Check size={15} />Valider</button>
                        <button className="is-danger" disabled={isSaving} onClick={() => void reviewAbsence(absence, 'reject')} type="button"><Ban size={15} />Refuser</button>
                      </> : null}
                      <button className="is-secondary" disabled={isSaving} onClick={() => void reviewAbsence(absence, 'cancel')} type="button">Annuler la demande</button>
                    </div>
                  </div> : null}
                  {canDeleteLeaves && absence.absenceType === 'leave' ? <div className="planning-p12-card-actions">
                    <button aria-label={`Supprimer les congés de ${personName}`} className="is-danger" disabled={isSaving} onClick={() => void removeLeave(absence, personName)} type="button"><Trash2 aria-hidden="true" size={15} />Supprimer les congés</button>
                  </div> : null}
                </article>;
              }) : <div className="planning-calendar-empty"><CalendarOff size={24} /><p>{requestedOnly ? 'Aucune demande de congés en attente.' : 'Aucune absence dans le périmètre visible.'}</p></div>}</div>
            </section>
          ) : null}
          {!isLoading && tab === 'conflicts' ? (
            <section className="planning-p12-section planning-p12-conflict-layout">
              <div className="planning-p12-conflict-list"><div className="planning-p12-filters"><select aria-label="Filtrer le type de conflit" value={conflictTypeFilter} onChange={(event) => setConflictTypeFilter(event.target.value)}><option value="">Tous les types</option>{[...new Set(detectedConflicts.map((item) => item.type))].map((type) => <option key={type} value={type}>{planningConflictTypeLabel(type)}</option>)}</select><select aria-label="Filtrer le traitement" value={conflictStateFilter} onChange={(event) => setConflictStateFilter(event.target.value)}><option value="active">À traiter</option><option value="treated">Traités</option><option value="all">Tous</option></select></div>{filteredConflicts.length ? filteredConflicts.map((item) => {
                const conflictCase = casesByKey.get(item.key);
                return <button className={`planning-p12-conflict-card${selectedConflict?.key === item.key ? ' is-active' : ''}`} key={item.key} onClick={() => chooseConflict(item)} type="button"><span className={`planning-p12-severity is-${item.severity}`}>{severityLabel(item.severity)}</span><strong>{item.title}</strong><p>{item.detail}</p><small>{formatPlanningDate(item.startsOn)} – {formatPlanningDate(item.endsOn)}{conflictCase ? ` · ${CONFLICT_STATUS_LABELS[conflictCase.status]}` : ' · Non pris en charge'}</small></button>;
              }) : <div className="planning-calendar-empty"><Check size={24} /><p>Aucun conflit correspondant aux filtres.</p></div>}</div>
              <div className="planning-p12-conflict-detail">{selectedConflict ? <><header><div><small>{planningConflictTypeLabel(selectedConflict.type)}</small><h3>{selectedConflict.title}</h3></div><button onClick={() => onOpenSource(selectedConflict)} type="button"><ExternalLink size={15} />Voir l’élément</button></header><p>{selectedConflict.detail}</p><dl><div><dt>Période</dt><dd>{formatPlanningDate(selectedConflict.startsOn)} au {formatPlanningDate(selectedConflict.endsOn)}</dd></div><div><dt>Responsable</dt><dd>{selectedCase?.ownerName || 'Non attribué'}</dd></div><div><dt>Priorité</dt><dd>{selectedCase ? PRIORITY_LABELS[selectedCase.priority] : 'Normale'}</dd></div><div><dt>Statut</dt><dd>{selectedCase ? CONFLICT_STATUS_LABELS[selectedCase.status] : 'Ouvert'}</dd></div></dl>{canManageConflictCases ? <form className="planning-p12-treatment" onSubmit={submitTreatment}><label><input checked={effectiveTreatment.assignToMe} onChange={(event) => changeTreatment({ assignToMe: event.target.checked })} type="checkbox" />Me désigner responsable</label><label>Priorité<select value={effectiveTreatment.priority} onChange={(event) => changeTreatment({ priority: event.target.value as PlanningConflictPriority })}>{CONFLICT_PRIORITIES.map((priority) => <option key={priority} value={priority}>{PRIORITY_LABELS[priority]}</option>)}</select></label><label>Statut<select value={effectiveTreatment.status} onChange={(event) => changeTreatment({ status: event.target.value as PlanningConflictStatus })}>{CONFLICT_STATUSES.map((status) => <option key={status} value={status}>{CONFLICT_STATUS_LABELS[status]}</option>)}</select></label><label className="is-wide">Commentaire<textarea rows={3} value={effectiveTreatment.comment} onChange={(event) => changeTreatment({ comment: event.target.value })} /></label><footer><span /><button disabled={isSaving} type="submit">Enregistrer le traitement</button></footer></form> : null}<div className="planning-p12-detail-actions"><button onClick={() => chooseConflict(selectedConflict, 'replacements')} type="button"><UserRoundSearch size={15} />Rechercher un remplaçant</button></div>{selectedHistory.length ? <details><summary>Historique du dossier ({selectedHistory.length})</summary><ol>{selectedHistory.map((history) => <li key={history.id}><strong>{history.changedByName || 'SeaPilot'}</strong><span>{history.action} · {formatPlanningDateTime(history.changedAt)}</span>{history.comment ? <p>{history.comment}</p> : null}</li>)}</ol></details> : null}</> : <div className="planning-calendar-empty"><AlertTriangle size={24} /><p>Sélectionnez un conflit.</p></div>}</div>
            </section>
          ) : null}
          {!isLoading && tab === 'replacements' ? (
            <section className="planning-p12-section"><div className="planning-p12-section-heading"><div><h3>Recherche de remplaçants</h3><p>SeaPilot explique les incompatibilités ; le choix et l’affectation restent manuels.</p></div></div>{selectedConflict ? <><div className="planning-p12-replacement-target"><strong>{selectedConflict.title}</strong><span>{selectedConflict.functionLabel || 'Fonction à préciser'} · {formatPlanningDate(selectedConflict.startsOn)} au {formatPlanningDate(selectedConflict.endsOn)}</span></div><div className="planning-p12-filters"><select aria-label="Filtrer les remplaçants par fonction" value={replacementFilters.functionLabel} onChange={(event) => setReplacementFilters({ ...replacementFilters, functionLabel: event.target.value })}><option value="">Toutes les fonctions</option>{selectedConflict.functionLabel && !functionOptions.some((option) => normalizePlanningText(option) === normalizePlanningText(selectedConflict.functionLabel)) ? <option value={selectedConflict.functionLabel}>{selectedConflict.functionLabel}</option> : null}{functionOptions.map((option) => <option key={option}>{option}</option>)}</select><input aria-label="Filtrer les remplaçants par qualification" placeholder="Qualification, brevet, habilitation…" value={replacementFilters.qualification} onChange={(event) => setReplacementFilters({ ...replacementFilters, qualification: event.target.value })} /></div><div className="planning-p12-candidate-list">{candidates.length ? candidates.map((candidate) => <article className="planning-p12-candidate" key={candidate.person.id}><header><div><strong>{formatPlanningPerson(candidate.person)}</strong><small>{candidate.person.functionLabel || candidate.person.gradeLabel || 'Fonction non renseignée'}</small></div><span className={`is-${candidate.compatibility}`}>{compatibilityLabel(candidate.compatibility)}</span></header><ul>{candidate.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><button disabled={!canPrepareReplacements || candidate.compatibility === 'incompatible'} onClick={() => onPrepareReplacement(candidate.person, selectedConflict)} type="button">Préparer l’affectation manuelle</button></article>) : <div className="planning-calendar-empty"><UserRoundSearch size={24} /><p>Aucun marin ne correspond aux filtres.</p></div>}</div></> : <div className="planning-calendar-empty"><AlertTriangle size={24} /><p>Sélectionnez d’abord un conflit dans le centre.</p></div>}</section>
          ) : null}
        </div>
      </section>
    </div>
  );
}
