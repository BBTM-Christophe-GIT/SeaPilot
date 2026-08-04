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
  fetchWorkingTimeEntryRecommendation,
  workingTimeErrorMessage,
  type WorkingTimeEntryRecommendation,
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
  onStartsAtChange: (value: string) => void;
  onEndsAtChange: (value: string) => void;
  onVesselIdChange: (value: string) => void;
  onWatchGroupChange: (value: string) => void;
  onCommentChange: (value: string) => void;
  onSubmit: () => void;
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
  onStartsAtChange,
  onEndsAtChange,
  onVesselIdChange,
  onWatchGroupChange,
  onCommentChange,
  onSubmit,
  onCancelEdit,
}: WorkingTimeEntryBoardProps) {
  const days = useMemo(() => periodDays(periodStart, periodEnd), [periodEnd, periodStart]);
  const selectedDay = startsAt.slice(0, 10) || days[0] || periodStart;
  const [recommendation, setRecommendation] = useState<WorkingTimeEntryRecommendation | null>(null);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const dragStart = useRef<number | null>(null);
  const slotRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const timezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';

  useEffect(() => {
    if (!validProposal(startsAt, endsAt)) {
      setRecommendation(null);
      setRecommendationError(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsCalculating(true);
      setRecommendationError(null);
      void fetchWorkingTimeEntryRecommendation(client, {
        personId,
        proposedStart: new Date(startsAt).toISOString(),
        proposedEnd: new Date(endsAt).toISOString(),
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
  }, [client, editingIntervalId, endsAt, personId, startsAt, timezoneName, vesselId, watchGroup]);

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

  function selectSlots(first: number, last: number) {
    if (!canEdit) return;
    const from = Math.max(0, Math.min(first, last));
    const to = Math.min(48, Math.max(first, last) + 1);
    onStartsAtChange(slotLocalValue(selectedDay, from));
    onEndsAtChange(slotLocalValue(selectedDay, to));
  }

  function selectDay(day: string) {
    const startTime = startsAt.slice(11, 16) || '08:00';
    const endTime = endsAt.slice(11, 16) || '16:00';
    const crossesMidnight = endsAt.slice(0, 10) > startsAt.slice(0, 10) || endTime <= startTime;
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
      selectSlots(slot, slot);
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
          <div className="working-time-timeline-legend"><span><i className="is-existing" />Enregistré</span><span><i className="is-selected" />Sélection</span><small>Clic-glissé ou clavier · pas de 30 min</small></div>
          <div aria-label={`Grille horaire du ${selectedDay}`} aria-readonly={!canEdit} className="working-time-timeline" role="grid">
            {Array.from({ length: 48 }, (_, slot) => {
              const label = slotLocalValue(selectedDay, slot).slice(11);
              const className = [occupiedSlots[slot] ? 'is-occupied' : '', selectedSlots[slot] ? 'is-selected' : '', slot % 2 === 0 ? 'is-hour' : ''].filter(Boolean).join(' ');
              return (
                <button
                  aria-label={`${label}, ${occupiedSlots[slot] ? 'travail enregistré' : 'repos'}${selectedSlots[slot] ? ', sélectionné' : ''}`}
                  aria-selected={selectedSlots[slot]}
                  className={className}
                  disabled={!canEdit}
                  key={slot}
                  onKeyDown={(event) => handleSlotKeyDown(event, slot)}
                  onPointerDown={() => { dragStart.current = slot; selectSlots(slot, slot); }}
                  onPointerEnter={() => { if (dragStart.current !== null) selectSlots(dragStart.current, slot); }}
                  onPointerUp={() => { dragStart.current = null; }}
                  ref={(element) => { slotRefs.current[slot] = element; }}
                  role="gridcell"
                  type="button"
                >
                  <time>{slot % 2 === 0 ? label : ''}</time><span />
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
            <span>Durée supplémentaire maximale recommandée</span>
            <strong>{formatDuration(maxRecommended)}</strong>
            {recommendation?.alreadyNonCompliant ? <p>La personne est déjà non conforme : aucune heure supplémentaire recommandée.</p> : null}
            <dl>
              <div><dt>Disponible sur 24 h</dt><dd>{recommendation ? formatDuration(recommendation.available24hSeconds) : '—'}</dd></div>
              <div><dt>Impact repos total</dt><dd>{recommendation ? formatSignedDuration(recommendation.restImpactSeconds) : '—'}</dd></div>
              <div><dt>Heure limite de fin</dt><dd>{formatDateTime(recommendation?.latestEndAt || null)}</dd></div>
              <div><dt>Prochaine reprise compatible</dt><dd>{formatDateTime(recommendation?.nextResumeAt || null)}</dd></div>
            </dl>
          </div>
          {recommendationError ? <p className="working-time-message is-error" role="alert">{recommendationError}</p> : null}
        </div>
      </div>

      {canEdit ? (
        <form className="working-time-interval-form working-time-entry-form" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
          <label>Début<input aria-label="Début du travail" onChange={(event) => onStartsAtChange(event.target.value)} required step="1800" type="datetime-local" value={startsAt} /></label>
          <label>Fin<input aria-label="Fin du travail" onChange={(event) => onEndsAtChange(event.target.value)} required step="1800" type="datetime-local" value={endsAt} /></label>
          <label>Navire<select aria-label="Filtrer et affecter le navire" onChange={(event) => onVesselIdChange(event.target.value)} value={vesselId}><option value="">Sans navire</option>{vessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name}</option>)}</select></label>
          <label>Bordée<input aria-label="Filtrer et affecter la bordée" onChange={(event) => onWatchGroupChange(event.target.value)} value={watchGroup} /></label>
          <label className="is-wide">Commentaire<input onChange={(event) => onCommentChange(event.target.value)} value={comment} /></label>
          <div className="working-time-form-actions">
            <button disabled={isSaving || !validProposal(startsAt, endsAt)} type="submit"><Save aria-hidden="true" size={16} />{editingIntervalId ? 'Enregistrer la correction' : 'Ajouter au brouillon'}</button>
            {editingIntervalId ? <button onClick={onCancelEdit} type="button">Annuler</button> : null}
          </div>
        </form>
      ) : <p className="working-time-lock-note">Ce registre est en lecture seule pour son statut actuel.</p>}
    </section>
  );
}
