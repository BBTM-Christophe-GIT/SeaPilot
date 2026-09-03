import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AlertTriangle,
  CheckCircle2,
  PenLine,
  Save,
  Send,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { WorkingTimeInterval } from './workingTimeModel';
import {
  fetchWorkingTimePhasesRecommendation,
  workingTimeErrorMessage,
  type WorkingTimeEntryRecommendation,
  type WorkingTimePhaseInput,
} from './workingTimeQueries';

export interface WorkingTimeRollingWindowMarker {
  description: string;
  endLabel: string;
  endMinute: number;
  startLabel: string;
}

interface WorkingTimeEntryBoardProps {
  client: SupabaseClient;
  personId: number;
  periodStart: string;
  periodEnd: string;
  intervals: WorkingTimeInterval[];
  canEdit: boolean;
  isSaving: boolean;
  startsAt: string;
  endsAt: string;
  planningVesselId: number | null;
  planningWatchGroup: string | null;
  planningContextLoading?: boolean;
  comment: string;
  editingIntervalId: number | null;
  pendingPhases?: WorkingTimePhaseInput[];
  nonCompliantDates?: string[];
  selectedDay?: string;
  approverName?: string | null;
  hasRecordedPeriods?: boolean;
  showSaveDraft?: boolean;
  showSubmitToCaptain?: boolean;
  submitDisabled?: boolean;
  showValidate?: boolean;
  validateDisabled?: boolean;
  rollingWindow?: WorkingTimeRollingWindowMarker | null;
  onStartsAtChange: (value: string) => void;
  onEndsAtChange: (value: string) => void;
  onCommentChange: (value: string) => void;
  onPendingPhasesChange?: (phases: WorkingTimePhaseInput[]) => void;
  onSelectedDayChange?: (day: string) => void;
  onSubmit: (phases: WorkingTimePhaseInput[], intent: 'save-correction' | 'save-draft' | 'submit-day' | 'validate-day') => void;
  onCancelEdit: () => void;
  onEditInterval?: (interval: WorkingTimeInterval) => void;
  onRequestVoid?: (interval: WorkingTimeInterval) => void;
}

const pad = (value: number) => String(value).padStart(2, '0');
const MINUTES_PER_DAY = 24 * 60;

function addDays(value: string, amount: number): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function periodDays(start: string, end: string): string[] {
  const values: string[] = [];
  for (let current = start; current <= end && values.length < 31; current = addDays(current, 1)) values.push(current);
  return values;
}

function slotLocalValue(day: string, slot: number): string {
  if (slot === 48) return `${addDays(day, 1)}T00:00`;
  const minutes = slot * 30;
  return `${day}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  return `${hours} h ${pad(minutes)}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return 'À déterminer';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function dateLabel(value: string): { weekday: string; day: string } {
  const date = new Date(`${value}T12:00:00`);
  return {
    weekday: new Intl.DateTimeFormat('fr-FR', { weekday: 'short' }).format(date).replace('.', ''),
    day: new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(date).replace('.', ''),
  };
}

function validProposal(startsAt: string, endsAt: string): boolean {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  return Boolean(startsAt && endsAt && Number.isFinite(start) && Number.isFinite(end) && end > start && end - start <= 86_400_000);
}

function mergePhases(phases: WorkingTimePhaseInput[]): WorkingTimePhaseInput[] {
  return phases
    .filter((phase) => validProposal(phase.startsAt, phase.endsAt))
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
    .reduce<WorkingTimePhaseInput[]>((merged, phase) => {
      const previous = merged.at(-1);
      if (!previous || phase.startsAt > previous.endsAt) {
        merged.push({ ...phase });
        return merged;
      }
      previous.endsAt = previous.endsAt > phase.endsAt ? previous.endsAt : phase.endsAt;
      return merged;
    }, []);
}

export function WorkingTimeEntryBoard({
  client,
  personId,
  periodStart,
  periodEnd,
  intervals,
  canEdit,
  isSaving,
  startsAt,
  endsAt,
  planningVesselId,
  planningWatchGroup,
  planningContextLoading = false,
  comment,
  editingIntervalId,
  pendingPhases = [],
  nonCompliantDates = [],
  selectedDay: controlledSelectedDay,
  approverName = null,
  hasRecordedPeriods = false,
  showSaveDraft = false,
  showSubmitToCaptain = false,
  submitDisabled = false,
  showValidate = false,
  validateDisabled = false,
  rollingWindow = null,
  onStartsAtChange,
  onEndsAtChange,
  onCommentChange,
  onPendingPhasesChange = () => undefined,
  onSelectedDayChange = () => undefined,
  onSubmit,
  onCancelEdit,
  onEditInterval = () => undefined,
  onRequestVoid = () => undefined,
}: WorkingTimeEntryBoardProps) {
  const days = useMemo(() => periodDays(periodStart, periodEnd), [periodEnd, periodStart]);
  const nonCompliantDaySet = useMemo(() => new Set(nonCompliantDates), [nonCompliantDates]);
  const selectedDay = controlledSelectedDay || startsAt.slice(0, 10) || days[0] || periodStart;
  const [recommendation, setRecommendation] = useState<WorkingTimeEntryRecommendation | null>(null);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [activePendingIndex, setActivePendingIndex] = useState<number | null>(null);
  const [selectedRecordedIntervalId, setSelectedRecordedIntervalId] = useState<number | null>(null);
  const dragStart = useRef<number | null>(null);
  const dayButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const slotRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const timezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';
  const activePhase = validProposal(startsAt, endsAt) ? { startsAt, endsAt } : null;
  const combinedPhases = useMemo(() => {
    if (editingIntervalId) return activePhase ? [activePhase] : [];
    if (pendingPhases.length) return [...pendingPhases].sort((left, right) => left.startsAt.localeCompare(right.startsAt));
    return activePhase ? [activePhase] : [];
  }, [editingIntervalId, endsAt, pendingPhases, startsAt]);
  const phasesOverlap = combinedPhases.some((phase, index) => index > 0
    && new Date(phase.startsAt).getTime() < new Date(combinedPhases[index - 1].endsAt).getTime());
  const phasesConflictExisting = combinedPhases.some((phase) => intervals.some((interval) => interval.id !== editingIntervalId
    && new Date(phase.startsAt).getTime() < new Date(interval.endsAt).getTime()
    && new Date(phase.endsAt).getTime() > new Date(interval.startsAt).getTime()));

  useEffect(() => {
    if (!combinedPhases.length || phasesOverlap) {
      setRecommendation(null);
      setRecommendationError(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsCalculating(true);
      setRecommendationError(null);
      void fetchWorkingTimePhasesRecommendation(client, {
        personId,
        phases: combinedPhases.map((phase) => ({ startsAt: new Date(phase.startsAt).toISOString(), endsAt: new Date(phase.endsAt).toISOString() })),
        timezoneName,
        vesselId: planningVesselId,
        watchGroup: planningWatchGroup,
        excludeIntervalId: editingIntervalId,
      }).then((result) => {
        if (!cancelled) setRecommendation(result);
      }).catch((error) => {
        if (!cancelled) {
          setRecommendation(null);
          setRecommendationError(workingTimeErrorMessage(error));
        }
      }).finally(() => {
        if (!cancelled) setIsCalculating(false);
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [client, combinedPhases, editingIntervalId, personId, phasesOverlap, planningVesselId, planningWatchGroup, timezoneName]);

  const selectedSlots = useMemo(() => {
    const start = new Date(startsAt).getTime();
    const end = new Date(endsAt).getTime();
    return Array.from({ length: 48 }, (_, slot) => {
      const slotStart = new Date(slotLocalValue(selectedDay, slot)).getTime();
      const slotEnd = new Date(slotLocalValue(selectedDay, slot + 1)).getTime();
      return slotStart < end && slotEnd > start;
    });
  }, [endsAt, selectedDay, startsAt]);

  const occupiedSlots = useMemo(() => Array.from({ length: 48 }, (_, slot) => {
    const slotStart = new Date(slotLocalValue(selectedDay, slot)).getTime();
    const slotEnd = new Date(slotLocalValue(selectedDay, slot + 1)).getTime();
    return intervals.some((interval) => interval.id !== editingIntervalId
      && slotStart < new Date(interval.endsAt).getTime()
      && slotEnd > new Date(interval.startsAt).getTime());
  }), [editingIntervalId, intervals, selectedDay]);

  const recordedIntervalBySlot = useMemo(() => Array.from({ length: 48 }, (_, slot) => {
    const slotStart = new Date(slotLocalValue(selectedDay, slot)).getTime();
    const slotEnd = new Date(slotLocalValue(selectedDay, slot + 1)).getTime();
    return intervals.find((interval) => interval.id !== editingIntervalId
      && slotStart < new Date(interval.endsAt).getTime()
      && slotEnd > new Date(interval.startsAt).getTime()) || null;
  }), [editingIntervalId, intervals, selectedDay]);
  const selectedRecordedInterval = intervals.find((interval) => interval.id === selectedRecordedIntervalId) || null;

  useEffect(() => { setSelectedRecordedIntervalId(null); }, [selectedDay]);
  useEffect(() => {
    dayButtonRefs.current.get(selectedDay)?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [selectedDay]);

  const pendingSlots = useMemo(() => Array.from({ length: 48 }, (_, slot) => {
    const slotStart = new Date(slotLocalValue(selectedDay, slot)).getTime();
    const slotEnd = new Date(slotLocalValue(selectedDay, slot + 1)).getTime();
    return pendingPhases.some((phase) => slotStart < new Date(phase.endsAt).getTime()
      && slotEnd > new Date(phase.startsAt).getTime());
  }), [pendingPhases, selectedDay]);

  function selectSlots(first: number, last: number) {
    if (!canEdit) return;
    const from = Math.max(0, Math.min(first, last));
    const to = Math.min(48, Math.max(first, last) + 1);
    onStartsAtChange(slotLocalValue(selectedDay, from));
    onEndsAtChange(slotLocalValue(selectedDay, to));
  }

  function commitSlots(first: number, last: number) {
    if (!canEdit) return;
    const from = Math.max(0, Math.min(first, last));
    const to = Math.min(48, Math.max(first, last) + 1);
    const phase = { startsAt: slotLocalValue(selectedDay, from), endsAt: slotLocalValue(selectedDay, to) };
    onStartsAtChange(phase.startsAt);
    onEndsAtChange(phase.endsAt);
    if (editingIntervalId) return;

    const merged = mergePhases([...pendingPhases, phase]);
    onPendingPhasesChange(merged);
    const nextActiveIndex = merged.findIndex((candidate) => candidate.startsAt <= phase.startsAt && candidate.endsAt >= phase.endsAt);
    setActivePendingIndex(nextActiveIndex >= 0 ? nextActiveIndex : null);
    if (nextActiveIndex >= 0) {
      onStartsAtChange(merged[nextActiveIndex].startsAt);
      onEndsAtChange(merged[nextActiveIndex].endsAt);
    }
  }

  function removePendingPhase(index: number) {
    const remaining = pendingPhases.filter((_, phaseIndex) => phaseIndex !== index);
    onPendingPhasesChange(remaining);
    const nextIndex = remaining.length ? Math.min(index, remaining.length - 1) : null;
    setActivePendingIndex(nextIndex);
    if (nextIndex !== null) {
      onStartsAtChange(remaining[nextIndex].startsAt);
      onEndsAtChange(remaining[nextIndex].endsAt);
    } else {
      onStartsAtChange(`${selectedDay}T00:00`);
      onEndsAtChange(`${selectedDay}T00:00`);
    }
  }

  function selectDay(day: string) {
    onSelectedDayChange(day);
    if (!validProposal(startsAt, endsAt)) {
      setActivePendingIndex(null);
      onStartsAtChange(`${day}T00:00`);
      onEndsAtChange(`${day}T00:00`);
      return;
    }
    const startTime = startsAt.slice(11, 16) || '08:00';
    const endTime = endsAt.slice(11, 16) || '16:00';
    const crossesMidnight = endsAt.slice(0, 10) > startsAt.slice(0, 10) || endTime <= startTime;
    setActivePendingIndex(null);
    onStartsAtChange(`${day}T${startTime}`);
    onEndsAtChange(`${crossesMidnight ? addDays(day, 1) : day}T${endTime}`);
  }

  function handleSlotKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, slot: number) {
    let target: number;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') target = Math.min(47, slot + 1);
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') target = Math.max(0, slot - 1);
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = 47;
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const selectionStart = selectedSlots.findIndex(Boolean);
      const selectionEnd = selectedSlots.lastIndexOf(true);
      if (selectionStart >= 0 && selectedSlots[slot]) commitSlots(selectionStart, selectionEnd);
      else commitSlots(slot, slot);
      return;
    } else return;
    event.preventDefault();
    if (event.shiftKey) {
      const selectionStart = selectedSlots.findIndex(Boolean);
      selectSlots(selectionStart >= 0 ? selectionStart : slot, target);
    }
    slotRefs.current[target]?.focus();
  }

  const status = recommendation?.status || 'sans_politique';
  const statusLabel = status === 'conforme' ? 'Conforme' : status === 'alerte' ? 'Alerte' : status === 'non_conforme' ? 'Non conforme' : 'Politique requise';
  const maxRecommended = recommendation?.alreadyNonCompliant ? 0 : recommendation?.maxAdditionalSeconds || 0;
  const commentRequired = combinedPhases.length > 0 && (status === 'alerte' || status === 'non_conforme');
  const selectionBlocked = phasesOverlap || phasesConflictExisting || Boolean(recommendationError);

  return (
    <section aria-labelledby="working-time-entry-title" className="working-time-entry-board">
      <header className="working-time-entry-heading">
        <div>
          <p>Saisie assistée</p>
          <h4 id="working-time-entry-title">Journée de travail</h4>
        </div>
        <span aria-live="polite" className={`working-time-compliance-badge is-${status}`}>
          {status === 'conforme' ? <CheckCircle2 aria-hidden="true" size={15} /> : <AlertTriangle aria-hidden="true" size={15} />}
          {isCalculating ? 'Calcul…' : statusLabel}
        </span>
      </header>

      <div aria-label="Jours du registre" className="working-time-day-strip" role="tablist">
        {days.map((day) => {
          const label = dateLabel(day);
          const isNonCompliant = nonCompliantDaySet.has(day);
          const className = [day === selectedDay ? 'is-active' : '', isNonCompliant ? 'is-non-compliant' : ''].filter(Boolean).join(' ');
          return <button aria-label={`${label.weekday} ${label.day}${isNonCompliant ? ', journée non conforme' : ''}`} aria-selected={day === selectedDay} className={className} key={day} onClick={() => selectDay(day)} ref={(element) => { if (element) dayButtonRefs.current.set(day, element); else dayButtonRefs.current.delete(day); }} role="tab" type="button"><span>{label.weekday}</span><strong>{label.day}</strong></button>;
        })}
      </div>

      <div className="working-time-entry-layout">
        <div className="working-time-timeline-panel">
          <div className="working-time-timeline-legend"><span><i className="is-existing" />Enregistré</span><span><i className="is-pending" />À enregistrer</span><span><i className="is-selected" />Plage active</span>{rollingWindow ? <small className="is-rolling-window"><i />24 h glissantes</small> : <small>Glissez plusieurs fois pour ajouter des périodes · pas de 30 min</small>}</div>
          <div className="working-time-timeline-track">
            <div aria-label={`Grille horaire du ${selectedDay}`} aria-readonly={!canEdit} className="working-time-timeline" role="grid">
              {Array.from({ length: 48 }, (_, slot) => {
                const label = slotLocalValue(selectedDay, slot).slice(11);
                const recordedInterval = recordedIntervalBySlot[slot];
                const className = [occupiedSlots[slot] ? 'is-occupied' : '', pendingSlots[slot] ? 'is-pending' : '', selectedSlots[slot] ? 'is-selected' : '', slot % 2 === 0 ? 'is-hour' : ''].filter(Boolean).join(' ');
                return (
                  <button
                    aria-label={`${label}, ${occupiedSlots[slot] ? 'travail enregistré, cliquer pour corriger ou retirer' : pendingSlots[slot] ? 'période à enregistrer' : 'repos'}${selectedSlots[slot] ? ', sélectionné' : ''}`}
                    aria-selected={selectedSlots[slot]}
                    className={className}
                    disabled={!canEdit}
                    key={slot}
                    onKeyDown={(event) => handleSlotKeyDown(event, slot)}
                    onClick={() => { if (recordedInterval) setSelectedRecordedIntervalId(recordedInterval.id); }}
                    onPointerDown={() => {
                      if (recordedInterval) { setSelectedRecordedIntervalId(recordedInterval.id); return; }
                      dragStart.current = slot; setActivePendingIndex(null); selectSlots(slot, slot);
                    }}
                    onPointerEnter={() => { if (dragStart.current !== null) selectSlots(dragStart.current, slot); }}
                    onPointerUp={() => {
                      if (dragStart.current !== null) commitSlots(dragStart.current, slot);
                      dragStart.current = null;
                    }}
                    ref={(element) => { slotRefs.current[slot] = element; }}
                    role="gridcell"
                    type="button"
                  >
                    <time>{slot % 2 === 0 ? `${label.slice(0, 2)}h` : ''}</time><span />
                  </button>
                );
              })}
            </div>
            {rollingWindow ? (
              <div
                aria-label="Impact des 24 heures glissantes"
                className="working-time-rolling-window"
                role="status"
                title={rollingWindow.description}
              >
                <span className="sr-only">{rollingWindow.description}</span>
                <div
                  aria-hidden="true"
                  className="working-time-rolling-window-line"
                  style={{ width: `${(Math.max(0, Math.min(MINUTES_PER_DAY, rollingWindow.endMinute)) / MINUTES_PER_DAY) * 100}%` }}
                  title={rollingWindow.description}
                >
                  <span>J−1 {rollingWindow.startLabel}</span>
                  <strong>fin {rollingWindow.endLabel}</strong>
                </div>
              </div>
            ) : null}
          </div>
          {selectedRecordedInterval ? <div className="working-time-recorded-period-actions" role="group" aria-label="Actions de la plage enregistrée"><span><strong>{formatDateTime(selectedRecordedInterval.startsAt)}</strong> → {formatDateTime(selectedRecordedInterval.endsAt)}</span><div><button onClick={() => { setSelectedRecordedIntervalId(null); onEditInterval(selectedRecordedInterval); }} type="button"><PenLine size={15} />Corriger</button><button onClick={() => { setSelectedRecordedIntervalId(null); onRequestVoid(selectedRecordedInterval); }} type="button"><Trash2 size={15} />Retirer</button><button aria-label="Fermer les actions" onClick={() => setSelectedRecordedIntervalId(null)} type="button">×</button></div></div> : null}
        </div>

        <div className="working-time-recommendation-panel" aria-live="polite">
          <div className={`working-time-analysis-bar is-${status}`}>
            <span>Analyse automatique</span>
            <dl>
              <div><dt>Travail sur 7 jours</dt><dd>{recommendation ? formatDuration(recommendation.work7dSeconds) : '—'}</dd></div>
              <div><dt>Repos consécutif actuel</dt><dd>{recommendation ? formatDuration(recommendation.longestRest24hSeconds) : '—'}</dd></div>
              <div><dt>Conformité repos</dt><dd>{statusLabel}</dd></div>
              <div><dt>Repos disponibles</dt><dd>{recommendation ? formatDuration(maxRecommended) : '—'}</dd></div>
              <div><dt>Prochaine reprise</dt><dd>{formatDateTime(recommendation?.nextResumeAt || null)}</dd></div>
            </dl>
          </div>
          {phasesOverlap ? <p className="working-time-message is-error" role="alert">Les phases de travail ne peuvent pas se chevaucher.</p> : null}
          {phasesConflictExisting ? <p className="working-time-message is-error" role="alert">Une phase recouvre un créneau déjà enregistré.</p> : null}
          {recommendationError ? <p className="working-time-message is-error" role="alert">{recommendationError}</p> : null}
        </div>
      </div>

      {!editingIntervalId && pendingPhases.length ? <div className="working-time-pending-phases" aria-label="Périodes à enregistrer">{pendingPhases.map((phase, index) => <div className={activePendingIndex === index ? 'is-active' : ''} key={`${phase.startsAt}-${phase.endsAt}`}><button aria-pressed={activePendingIndex === index} onClick={() => { setActivePendingIndex(index); onStartsAtChange(phase.startsAt); onEndsAtChange(phase.endsAt); }} type="button"><strong>Période {index + 1}</strong> {phase.startsAt.slice(11, 16)}–{phase.endsAt.slice(11, 16)}</button><button aria-label={`Retirer la période ${index + 1}`} onClick={() => removePendingPhase(index)} type="button">×</button></div>)}</div> : null}

      {canEdit ? (
        <form className="working-time-interval-form working-time-entry-form" onSubmit={(event) => {
          event.preventDefault();
          const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          onSubmit(combinedPhases, (submitter?.value || 'save-correction') as 'save-correction' | 'save-draft' | 'submit-day' | 'validate-day');
        }}>
          <label className="is-wide">{commentRequired ? 'Commentaire obligatoire' : 'Commentaire'}<input aria-required={commentRequired} onChange={(event) => onCommentChange(event.target.value)} required={commentRequired} value={comment} /></label>
          {planningContextLoading
            ? <p className="working-time-planning-context" role="status">Chargement de l’affectation Planning…</p>
            : !planningVesselId
              ? <p className="working-time-planning-context is-missing">Aucune affectation Planning « En mer » ou « A terre » active pour cette journée.</p>
              : <p className="working-time-planning-context">Affectation Planning appliquée{planningWatchGroup ? ` · ${planningWatchGroup}` : ''}{approverName ? ` · Approbateur : ${approverName}` : ' · Aucun capitaine approbateur disponible'}</p>}
          <div className="working-time-form-actions">
            {editingIntervalId ? <button disabled={isSaving || !combinedPhases.length || selectionBlocked} type="submit" value="save-correction"><Save aria-hidden="true" size={16} />Enregistrer la correction</button> : null}
            {!editingIntervalId && showSaveDraft ? <button disabled={isSaving || !combinedPhases.length || selectionBlocked || !planningVesselId} type="submit" value="save-draft"><Save aria-hidden="true" size={16} />Enregistrer le brouillon</button> : null}
            {!editingIntervalId && showSubmitToCaptain ? <button disabled={isSaving || submitDisabled || (!combinedPhases.length && !hasRecordedPeriods) || selectionBlocked || !planningVesselId || !approverName} type="submit" value="submit-day"><Send aria-hidden="true" size={16}/>Valider</button> : null}
            {!editingIntervalId && showValidate ? <button disabled={isSaving || validateDisabled || (!combinedPhases.length && !hasRecordedPeriods) || selectionBlocked} type="submit" value="validate-day"><UserCheck aria-hidden="true" size={16}/>Valider la journée</button> : null}
            {editingIntervalId ? <button onClick={onCancelEdit} type="button">Annuler</button> : null}
          </div>
        </form>
      ) : <>
        <p className="working-time-lock-note">Cette journée est en lecture seule pour son statut actuel.</p>
        {showValidate ? <div className="working-time-form-actions is-readonly"><button disabled={isSaving || validateDisabled} onClick={() => onSubmit([], 'validate-day')} type="button"><UserCheck aria-hidden="true" size={16}/>Valider la journée</button></div> : null}
      </>}
    </section>
  );
}
