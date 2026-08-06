import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Gauge,
  MoonStar,
  Save,
  ShieldAlert,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { WorkingTimeInterval } from './workingTimeModel';
import {
  fetchWorkingTimePhasesRecommendation,
  workingTimeErrorMessage,
  type WorkingTimeEntryRecommendation,
  type WorkingTimePhaseInput,
  type WorkingTimeVesselOption,
} from './workingTimeQueries';

interface WorkingTimeEntryBoardProps {
  client: SupabaseClient;
  personId: number;
  periodStart: string;
  periodEnd: string;
  intervals: WorkingTimeInterval[];
  vessels: WorkingTimeVesselOption[];
  canEdit: boolean;
  isSaving: boolean;
  startsAt: string;
  endsAt: string;
  vesselId: string;
  watchGroup: string;
  comment: string;
  editingIntervalId: number | null;
  pendingPhases?: WorkingTimePhaseInput[];
  onStartsAtChange: (value: string) => void;
  onEndsAtChange: (value: string) => void;
  onVesselIdChange: (value: string) => void;
  onWatchGroupChange: (value: string) => void;
  onCommentChange: (value: string) => void;
  onPendingPhasesChange?: (phases: WorkingTimePhaseInput[]) => void;
  onSubmit: (phases: WorkingTimePhaseInput[]) => void;
  onCancelEdit: () => void;
}

const pad = (value: number) => String(value).padStart(2, '0');

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

function formatSignedDuration(seconds: number): string {
  if (!seconds) return 'Aucun impact';
  return `${seconds < 0 ? '−' : '+'}${formatDuration(Math.abs(seconds))}`;
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

const VIOLATION_LABELS: Record<string, string> = {
  work_24h: 'Travail sur 24 h',
  rest_24h: 'Repos sur 24 h',
  consecutive_rest: 'Repos consécutif',
  rest_periods_24h: 'Fractionnement du repos',
  work_7d: 'Travail sur 7 jours',
  rest_7d: 'Repos sur 7 jours',
  night_work_24h: 'Travail de nuit',
};

export function WorkingTimeEntryBoard({
  client,
  personId,
  periodStart,
  periodEnd,
  intervals,
  vessels,
  canEdit,
  isSaving,
  startsAt,
  endsAt,
  vesselId,
  watchGroup,
  comment,
  editingIntervalId,
  pendingPhases = [],
  onStartsAtChange,
  onEndsAtChange,
  onVesselIdChange,
  onWatchGroupChange,
  onCommentChange,
  onPendingPhasesChange = () => undefined,
  onSubmit,
  onCancelEdit,
}: WorkingTimeEntryBoardProps) {
  const days = useMemo(() => periodDays(periodStart, periodEnd), [periodEnd, periodStart]);
  const selectedDay = startsAt.slice(0, 10) || days[0] || periodStart;
  const [recommendation, setRecommendation] = useState<WorkingTimeEntryRecommendation | null>(null);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [activePendingIndex, setActivePendingIndex] = useState<number | null>(null);
  const dragStart = useRef<number | null>(null);
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
        vesselId: vesselId ? Number(vesselId) : null,
        watchGroup: watchGroup.trim() || null,
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
  }, [client, combinedPhases, editingIntervalId, personId, phasesOverlap, timezoneName, vesselId, watchGroup]);

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

  function updateActivePhase(field: 'startsAt' | 'endsAt', value: string) {
    if (field === 'startsAt') onStartsAtChange(value);
    else onEndsAtChange(value);
    if (editingIntervalId || activePendingIndex === null || !pendingPhases[activePendingIndex]) return;
    onPendingPhasesChange(pendingPhases.map((phase, index) => index === activePendingIndex
      ? { ...phase, [field]: value }
      : phase));
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
          return <button aria-selected={day === selectedDay} className={day === selectedDay ? 'is-active' : ''} key={day} onClick={() => selectDay(day)} role="tab" type="button"><span>{label.weekday}</span><strong>{label.day}</strong></button>;
        })}
      </div>

      <div className="working-time-entry-layout">
        <div className="working-time-timeline-panel">
          <div className="working-time-timeline-legend"><span><i className="is-existing" />Enregistré</span><span><i className="is-pending" />À enregistrer</span><span><i className="is-selected" />Plage active</span><small>Glissez plusieurs fois pour ajouter des périodes · pas de 30 min</small></div>
          <div aria-label={`Grille horaire du ${selectedDay}`} aria-readonly={!canEdit} className="working-time-timeline" role="grid">
            {Array.from({ length: 48 }, (_, slot) => {
              const label = slotLocalValue(selectedDay, slot).slice(11);
              const className = [occupiedSlots[slot] ? 'is-occupied' : '', pendingSlots[slot] ? 'is-pending' : '', selectedSlots[slot] ? 'is-selected' : '', slot % 2 === 0 ? 'is-hour' : ''].filter(Boolean).join(' ');
              return (
                <button
                  aria-label={`${label}, ${occupiedSlots[slot] ? 'travail enregistré' : pendingSlots[slot] ? 'période à enregistrer' : 'repos'}${selectedSlots[slot] ? ', sélectionné' : ''}`}
                  aria-selected={selectedSlots[slot]}
                  className={className}
                  disabled={!canEdit}
                  key={slot}
                  onKeyDown={(event) => handleSlotKeyDown(event, slot)}
                  onPointerDown={() => { dragStart.current = slot; setActivePendingIndex(null); selectSlots(slot, slot); }}
                  onPointerEnter={() => { if (dragStart.current !== null) selectSlots(dragStart.current, slot); }}
                  onPointerUp={() => {
                    if (dragStart.current !== null) commitSlots(dragStart.current, slot);
                    dragStart.current = null;
                  }}
                  ref={(element) => { slotRefs.current[slot] = element; }}
                  role="gridcell"
                  type="button"
                >
                  <time>{slot % 6 === 0 ? label : ''}</time><span />
                </button>
              );
            })}
          </div>
        </div>

        <div className="working-time-recommendation-panel" aria-live="polite">
          <div className="working-time-kpi-grid">
            <article><Gauge aria-hidden="true" size={18} /><span>Travail 7 jours</span><strong>{recommendation ? formatDuration(recommendation.work7dSeconds) : '—'}</strong><small>{recommendation ? `${formatDuration(recommendation.available7dSeconds)} disponibles` : 'Calcul serveur'}</small></article>
            <article><MoonStar aria-hidden="true" size={18} /><span>Repos consécutif</span><strong>{recommendation ? formatDuration(recommendation.longestRest24hSeconds) : '—'}</strong><small>{recommendation ? formatSignedDuration(recommendation.consecutiveRestImpactSeconds) : 'Impact en attente'}</small></article>
            <article><ShieldAlert aria-hidden="true" size={18} /><span>Alertes</span><strong>{recommendation?.violationCodes.length || 0}</strong><small>{recommendation?.violationCodes.map((code) => VIOLATION_LABELS[code] || code).join(', ') || 'Aucun écart détecté'}</small></article>
            <article><Clock3 aria-hidden="true" size={18} /><span>Statut</span><strong>{statusLabel}</strong><small>{recommendation?.policyName || 'Politique datée non résolue'}</small></article>
          </div>

          <div className={`working-time-guidance is-${status}`}>
            <div className="working-time-guidance-summary">
              <span>Durée supplémentaire maximale recommandée</span>
              <strong>{formatDuration(maxRecommended)}</strong>
              {recommendation?.alreadyNonCompliant ? <p>La personne est déjà non conforme : aucune heure supplémentaire recommandée.</p> : null}
            </div>
            <dl>
              <div><dt>Disponible sur 24 h</dt><dd>{recommendation ? formatDuration(recommendation.available24hSeconds) : '—'}</dd></div>
              <div><dt>Impact repos total</dt><dd>{recommendation ? formatSignedDuration(recommendation.restImpactSeconds) : '—'}</dd></div>
              <div><dt>Heure limite de fin</dt><dd>{formatDateTime(recommendation?.latestEndAt || null)}</dd></div>
              <div><dt>Prochaine reprise compatible</dt><dd>{formatDateTime(recommendation?.nextResumeAt || null)}</dd></div>
            </dl>
          </div>
          {phasesOverlap ? <p className="working-time-message is-error" role="alert">Les phases de travail ne peuvent pas se chevaucher.</p> : null}
          {phasesConflictExisting ? <p className="working-time-message is-error" role="alert">Une phase recouvre un créneau déjà enregistré.</p> : null}
          {recommendationError ? <p className="working-time-message is-error" role="alert">{recommendationError}</p> : null}
        </div>
      </div>

      {canEdit ? (
        <form className="working-time-interval-form working-time-entry-form" onSubmit={(event) => { event.preventDefault(); onSubmit(combinedPhases); }}>
          <label>Début<input aria-label="Début du travail" onChange={(event) => updateActivePhase('startsAt', event.target.value)} required step="1800" type="datetime-local" value={startsAt} /></label>
          <label>Fin<input aria-label="Fin du travail" onChange={(event) => updateActivePhase('endsAt', event.target.value)} required step="1800" type="datetime-local" value={endsAt} /></label>
          <label>Navire<select aria-label="Filtrer et affecter le navire" onChange={(event) => onVesselIdChange(event.target.value)} value={vesselId}><option value="">Sans navire</option>{vessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name}</option>)}</select></label>
          <label>Bordée<input aria-label="Filtrer et affecter la bordée" onChange={(event) => onWatchGroupChange(event.target.value)} value={watchGroup} /></label>
          <label className="is-wide">Commentaire<input onChange={(event) => onCommentChange(event.target.value)} value={comment} /></label>
          {!editingIntervalId ? <div className="working-time-selection-summary">
            <div><strong>{pendingPhases.length ? `${pendingPhases.length} période${pendingPhases.length > 1 ? 's' : ''} prête${pendingPhases.length > 1 ? 's' : ''}` : 'Sélection directe'}</strong><small>{pendingPhases.length ? 'Vous pouvez encore glisser sur la frise pour en ajouter.' : 'Glissez sur la frise ; chaque nouvelle plage est ajoutée automatiquement.'}</small></div>
            {pendingPhases.length ? <button onClick={() => { onPendingPhasesChange([]); setActivePendingIndex(null); onStartsAtChange(`${selectedDay}T00:00`); onEndsAtChange(`${selectedDay}T00:00`); }} type="button">Effacer la sélection</button> : null}
          </div> : null}
          {!editingIntervalId && pendingPhases.length ? <div className="working-time-pending-phases" aria-label="Périodes à enregistrer">{pendingPhases.map((phase, index) => <div className={activePendingIndex === index ? 'is-active' : ''} key={`${phase.startsAt}-${phase.endsAt}`}><button aria-pressed={activePendingIndex === index} onClick={() => { setActivePendingIndex(index); onStartsAtChange(phase.startsAt); onEndsAtChange(phase.endsAt); }} type="button"><strong>Période {index + 1}</strong> {phase.startsAt.slice(11, 16)}–{phase.endsAt.slice(11, 16)}</button><button aria-label={`Retirer la période ${index + 1}`} onClick={() => removePendingPhase(index)} type="button">×</button></div>)}</div> : null}
          <div className="working-time-form-actions">
            <button disabled={isSaving || !combinedPhases.length || phasesOverlap || phasesConflictExisting} type="submit"><Save aria-hidden="true" size={16} />{editingIntervalId ? 'Enregistrer la correction' : `Enregistrer la sélection · ${combinedPhases.length} période${combinedPhases.length > 1 ? 's' : ''}`}</button>
            {editingIntervalId ? <button onClick={onCancelEdit} type="button">Annuler</button> : null}
          </div>
        </form>
      ) : <p className="working-time-lock-note">Ce registre est en lecture seule pour son statut actuel.</p>}
    </section>
  );
}
