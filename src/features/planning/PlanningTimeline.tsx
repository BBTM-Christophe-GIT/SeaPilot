import { Check, ChevronDown, ChevronRight, FilePenLine, GripVertical, Pencil, Plus, UserRoundPlus, X } from 'lucide-react';
import { Fragment, useMemo, useRef, useState } from 'react';
import billedIcon from './assets/icone_a_facturer.svg';
import plannedIcon from './assets/icone_a_planifier.svg';
import validIcon from './assets/icone_valide.svg';
import { addPlanningDays, daysBetween, formatPlanningDate, todayPlanningDate } from './planningDates';
import {
  dateGridPlacement,
  planningStatusTone,
  projectStatusTone,
  type PlanningCrewEvent,
  type PlanningTimelineDay,
  type PlanningViewMode,
} from './planningModel';
import type { PlanningProjectRecord } from './planningQueries';
import {
  planningConfirmationLabel,
  planningFleetEventTypeLabel,
  type PlanningCrewLane,
  type PlanningFleetLane,
} from './planningViews';

interface TimelineBaseProps {
  days: PlanningTimelineDay[];
  editable: boolean;
  pendingId: string | null;
  viewMode: PlanningViewMode;
}

function projectStatusIcon(project: PlanningProjectRecord): string {
  const tone = projectStatusTone(project.status);
  return tone === 'valid' ? validIcon : tone === 'billed' ? billedIcon : plannedIcon;
}

function cellClass(day: PlanningTimelineDay, options: { create: boolean; dragOver: boolean; drop: boolean }): string {
  return `planning-day-cell${day.isWeekend ? ' is-weekend' : ''}${day.date === todayPlanningDate() ? ' is-today' : ''}${options.drop ? ' is-drop-target' : ''}${options.create ? ' is-quick-create' : ''}${options.dragOver ? ' is-drag-over' : ''}`;
}

export function PlanningFleetTimelineRow({
  lane,
  days,
  editable,
  pendingId,
  viewMode,
  dayWidth,
  expanded,
  crewCount,
  touchDropTarget,
  onAssignPerson,
  onMove,
  onOpen,
  onResize,
  onSaveLocation,
  onAddBoard,
  onOpenVessel,
  selectedId,
  onToggle,
}: TimelineBaseProps & {
  lane: PlanningFleetLane;
  dayWidth: number;
  expanded: boolean;
  crewCount: number;
  touchDropTarget: { vesselId: number; date: string } | null;
  onAssignPerson: (personId: number, lane: PlanningFleetLane, date: string) => void;
  onMove: (projectId: number, lane: PlanningFleetLane, date: string) => void;
  onOpen: (project: PlanningProjectRecord) => void;
  onResize: (project: PlanningProjectRecord, edge: 'start' | 'end', delta: number) => void;
  onSaveLocation: (lane: PlanningFleetLane, date: string, location: string) => Promise<boolean>;
  onAddBoard: (lane: PlanningFleetLane) => void;
  onOpenVessel: (lane: PlanningFleetLane) => void;
  selectedId: string | null;
  onToggle: () => void;
}) {
  const [resizePreview, setResizePreview] = useState<{ id: number; startsOn: string; endsOn: string } | null>(null);
  const [dragOver, setDragOver] = useState<{ date: string; kind: 'person' | 'project' } | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [movePreview, setMovePreview] = useState<{ startsOn: string; endsOn: string } | null>(null);
  const [editingLocation, setEditingLocation] = useState<{ date: string; value: string } | null>(null);
  const [pendingLocationDate, setPendingLocationDate] = useState<string | null>(null);
  const suppressClickRef = useRef(false);
  const locationsByDate = useMemo(
    () => new Map(lane.locations.map((location) => [location.workDate, location.comments])),
    [lane.locations],
  );

  async function submitLocation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingLocation) return;
    setPendingLocationDate(editingLocation.date);
    const saved = await onSaveLocation(lane, editingLocation.date, editingLocation.value);
    setPendingLocationDate(null);
    if (saved) setEditingLocation(null);
  }

  const beginResize = (pointerEvent: React.PointerEvent, project: PlanningProjectRecord, edge: 'start' | 'end') => {
    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    const startX = pointerEvent.clientX;
    const duration = daysBetween(project.startsOn, project.endsOn);
    const deltaFromPointer = (clientX: number) => {
      const rawDelta = Math.round((clientX - startX) / dayWidth);
      return edge === 'start' ? Math.min(duration, rawDelta) : Math.max(-duration, rawDelta);
    };
    const handleMove = (event: PointerEvent) => {
      const delta = deltaFromPointer(event.clientX);
      setResizePreview({
        id: project.id,
        startsOn: edge === 'start' ? addPlanningDays(project.startsOn, delta) : project.startsOn,
        endsOn: edge === 'end' ? addPlanningDays(project.endsOn, delta) : project.endsOn,
      });
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
    };
    function cancel() {
      cleanup();
      setResizePreview(null);
    }
    function finish(event: PointerEvent) {
      cleanup();
      setResizePreview(null);
      suppressClickRef.current = true;
      onResize(project, edge, deltaFromPointer(event.clientX));
    }
    setResizePreview({ id: project.id, startsOn: project.startsOn, endsOn: project.endsOn });
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', finish, { once: true });
    window.addEventListener('pointercancel', cancel, { once: true });
  };
  return (
    <div className="planning-calendar-grid planning-timeline-row is-fleet" data-vessel={lane.vessel}>
      <div className="planning-row-label planning-tree-row is-vessel">
        <button aria-label={`Ouvrir la fiche de ${lane.label}`} className="planning-tree-action" disabled={lane.vesselId === null} onClick={() => onOpenVessel(lane)} title="Fiche du navire" type="button"><FilePenLine aria-hidden="true" size={14} /></button>
        {editable ? <button aria-label={`Ajouter une bordée à ${lane.label}`} className="planning-tree-action" disabled={lane.vesselId === null} onClick={() => onAddBoard(lane)} title="Ajouter une bordée" type="button"><Plus aria-hidden="true" size={15} /></button> : null}
        <button aria-expanded={expanded} aria-label={`${expanded ? 'Replier' : 'Déplier'} ${lane.label}`} className="planning-tree-toggle" onClick={onToggle} type="button">
          <span><strong>{lane.label}</strong><small>{lane.detail}</small></span>
          <em>{crewCount}</em>
          {expanded ? <ChevronDown aria-hidden="true" size={16} /> : <ChevronRight aria-hidden="true" size={16} />}
        </button>
      </div>
      {days.map((day, index) => {
        const touchPersonOver = touchDropTarget?.vesselId === lane.vesselId && touchDropTarget.date === day.date;
        const mouseDragOver = dragOver?.date === day.date;
        const personDragOver = touchPersonOver || (mouseDragOver && dragOver.kind === 'person');
        const location = locationsByDate.get(day.date) || '';
        const isEditing = editingLocation?.date === day.date;
        const shared = {
          className: `${cellClass(day, { create: false, dragOver: mouseDragOver || touchPersonOver, drop: editable })}${personDragOver ? ' is-person-drag-over' : ''}`,
          'data-planning-drop-date': day.date,
          'data-planning-drop-vessel': lane.vessel,
          'data-planning-person-drop-date': day.date,
          'data-planning-person-drop-vessel-id': lane.vesselId || undefined,
          onDragEnter: editable ? (event: React.DragEvent) => setDragOver({
            date: day.date,
            kind: event.dataTransfer.types.includes('application/x-seapilot-planning') ? 'person' : 'project',
          }) : undefined,
          onDragLeave: editable ? () => setDragOver((current) => current?.date === day.date ? null : current) : undefined,
          onDragOver: editable ? (event: React.DragEvent) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = event.dataTransfer.types.includes('application/x-seapilot-planning') ? 'copy' : 'move';
            if (draggingId !== null) {
              const project = lane.projects.find((item) => item.id === draggingId);
              if (project) setMovePreview({ startsOn: day.date, endsOn: addPlanningDays(day.date, daysBetween(project.startsOn, project.endsOn)) });
            }
          } : undefined,
          onDrop: editable ? (event: React.DragEvent) => {
            event.preventDefault();
            setDragOver(null);
            setMovePreview(null);
            const personPayload = event.dataTransfer.getData('application/x-seapilot-planning');
            if (personPayload) {
              try {
                const parsed = JSON.parse(personPayload) as { type?: string; id?: number };
                if (parsed.type === 'person' && Number.isSafeInteger(parsed.id) && Number(parsed.id) > 0) {
                  onAssignPerson(Number(parsed.id), lane, day.date);
                  return;
                }
              } catch {
                // Ignore malformed foreign drag payloads and keep project DnD available.
              }
            }
            const id = Number(event.dataTransfer.getData('application/x-seapilot-project'));
            if (Number.isSafeInteger(id) && id > 0) onMove(id, lane, day.date);
          } : undefined,
          style: { gridColumn: index + 2, gridRow: 1 },
        };
        return <div {...shared} key={day.date} title={location || undefined}>
          {personDragOver ? <span className="planning-person-drop-label">Déposer pour affecter</span> : lane.label.trim().toLocaleUpperCase('fr-FR') !== 'ARMEMENT - CHERBOURG' ? null : viewMode === 'year' ? (
            location ? <span className="planning-location-year">{location}</span> : null
          ) : isEditing ? (
            <form className="planning-location-editor" onSubmit={submitLocation}>
              <input
                aria-label={`Lieu du personnel pour ${lane.label} le ${formatPlanningDate(day.date)}`}
                autoFocus
                maxLength={80}
                onChange={(event) => setEditingLocation({ date: day.date, value: event.target.value })}
                placeholder="Lieu…"
                value={editingLocation.value}
              />
              <button aria-label="Enregistrer le lieu" disabled={pendingLocationDate === day.date} type="submit"><Check aria-hidden="true" size={13} /></button>
              <button aria-label="Annuler la modification du lieu" onClick={() => setEditingLocation(null)} type="button"><X aria-hidden="true" size={13} /></button>
            </form>
          ) : (
            <button
              aria-label={`${location ? 'Modifier' : 'Ajouter'} le lieu du personnel pour ${lane.label} le ${formatPlanningDate(day.date)}`}
              className={`planning-location-button${location ? ' has-value' : ''}`}
              disabled={!editable || lane.vesselId === null}
              onClick={() => setEditingLocation({ date: day.date, value: location })}
              type="button"
            >
              <span>{location || 'Lieu…'}</span><Pencil aria-hidden="true" size={11} />
            </button>
          )}
        </div>;
      })}
      {movePreview ? (() => {
        const placement = dateGridPlacement(movePreview.startsOn, movePreview.endsOn, days);
        return placement ? <span aria-hidden="true" className="planning-move-preview" style={{ gridColumn: `${placement.start + 1} / span ${placement.span}`, gridRow: 1 }} /> : null;
      })() : null}
      {lane.projects.map((project) => {
        const preview = resizePreview?.id === project.id ? resizePreview : null;
        const startsOn = preview?.startsOn || project.startsOn;
        const endsOn = preview?.endsOn || project.endsOn;
        const placement = dateGridPlacement(startsOn, endsOn, days);
        if (!placement) return null;
        const isPending = pendingId === `project-${project.id}`;
        return (
          <button
            aria-busy={isPending}
            aria-label={`${planningFleetEventTypeLabel(project.eventType)} ${project.title}, ${project.status}, du ${formatPlanningDate(startsOn)} au ${formatPlanningDate(endsOn)}`}
            className={`planning-project-bar is-${project.eventType} is-${projectStatusTone(project.status)}${draggingId === project.id ? ' is-dragging' : ''}${selectedId === `project-${project.id}` ? ' is-selected' : ''}${isPending ? ' is-pending' : ''}${preview ? ' is-resize-preview' : ''}`}
            draggable={editable && !isPending && !preview}
            key={project.id}
            onClick={(event) => { if (suppressClickRef.current) { suppressClickRef.current = false; event.preventDefault(); return; } onOpen(project); }}
            onDragEnd={() => { setDraggingId(null); setMovePreview(null); }}
            onDragStart={(event) => {
              setDraggingId(project.id);
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('application/x-seapilot-project', String(project.id));
            }}
            style={{ gridColumn: `${placement.start + 1} / span ${placement.span}`, gridRow: 1 }}
            title={`${planningFleetEventTypeLabel(project.eventType)} · ${project.title}\n${project.status}${project.responsibleName ? `\nResponsable : ${project.responsibleName}` : ''}`}
            type="button"
          >
            {editable ? <span aria-hidden="true" className="planning-resize-handle is-start" onPointerDown={(event) => beginResize(event, project, 'start')} /> : null}
            <span>{project.title}</span>
            <small>{planningFleetEventTypeLabel(project.eventType)}</small>
            <span className="planning-project-status-rail"><img alt="" src={projectStatusIcon(project)} /></span>
            {editable ? <span aria-hidden="true" className="planning-resize-handle is-end" onPointerDown={(event) => beginResize(event, project, 'end')} /> : null}
          </button>
        );
      })}
    </div>
  );
}

export function PlanningFleetBoardTimelineRow({
  board,
  vessel,
  crewCount,
  days,
  expanded,
  editable,
  onAddPerson,
  onToggle,
}: {
  board: string;
  vessel: string;
  crewCount: number;
  days: PlanningTimelineDay[];
  expanded: boolean;
  editable: boolean;
  onAddPerson: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="planning-calendar-grid planning-timeline-row is-fleet-board">
      <div className="planning-row-label planning-tree-row is-board">
        {editable ? <button aria-label={`Ajouter un marin à ${board} de ${vessel}`} className="planning-tree-action" onClick={onAddPerson} title="Ajouter un marin" type="button"><UserRoundPlus aria-hidden="true" size={14} /></button> : null}
        <button aria-expanded={expanded} aria-label={`${expanded ? 'Replier' : 'Déplier'} ${board} de ${vessel}`} className="planning-tree-toggle" onClick={onToggle} type="button">
          <span><strong>{board}</strong></span>
          <em>{crewCount}</em>
          {expanded ? <ChevronDown aria-hidden="true" size={15} /> : <ChevronRight aria-hidden="true" size={15} />}
        </button>
      </div>
      {days.map((day, index) => (
        <span
          aria-hidden="true"
          className={cellClass(day, { create: false, dragOver: false, drop: false })}
          key={day.date}
          style={{ gridColumn: index + 2, gridRow: 1 }}
        />
      ))}
    </div>
  );
}

export function PlanningCrewTimelineRow({
  lane,
  days,
  editable,
  pendingId,
  viewMode,
  conflictEventIds,
  dayWidth,
  onCreate,
  onMove,
  onOpen,
  onResize,
  onSaveDayNote,
  onSelect,
  selectedId,
  hierarchy = false,
}: TimelineBaseProps & {
  lane: PlanningCrewLane;
  conflictEventIds: Set<string>;
  dayWidth: number;
  onCreate: (lane: PlanningCrewLane, date: string) => void;
  onMove: (event: PlanningCrewEvent, date: string) => void;
  onOpen: (event: PlanningCrewEvent) => void;
  onResize: (event: PlanningCrewEvent, edge: 'start' | 'end', delta: number) => void;
  onSaveDayNote?: (event: PlanningCrewEvent, date: string, note: string) => Promise<boolean>;
  onSelect: (id: string) => void;
  selectedId: string | null;
  hierarchy?: boolean;
}) {
  const [resizePreview, setResizePreview] = useState<{ id: string; startsOn: string; endsOn: string } | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [movePreview, setMovePreview] = useState<{ startsOn: string; endsOn: string } | null>(null);
  const [editingNote, setEditingNote] = useState<{ eventId: string; date: string; value: string } | null>(null);
  const [pendingNote, setPendingNote] = useState(false);
  const suppressClickRef = useRef(false);

  const beginResize = (pointerEvent: React.PointerEvent, item: PlanningCrewEvent, edge: 'start' | 'end') => {
    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    const startX = pointerEvent.clientX;
    const duration = daysBetween(item.startsOn, item.endsOn);
    const deltaFromPointer = (clientX: number) => {
      const rawDelta = Math.round((clientX - startX) / dayWidth);
      return edge === 'start' ? Math.min(duration, rawDelta) : Math.max(-duration, rawDelta);
    };
    const handleMove = (event: PointerEvent) => {
      const delta = deltaFromPointer(event.clientX);
      setResizePreview({
        id: item.id,
        startsOn: edge === 'start' ? addPlanningDays(item.startsOn, delta) : item.startsOn,
        endsOn: edge === 'end' ? addPlanningDays(item.endsOn, delta) : item.endsOn,
      });
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
    };
    function cancel() {
      cleanup();
      setResizePreview(null);
    }
    function finish(event: PointerEvent) {
      cleanup();
      setResizePreview(null);
      onResize(item, edge, deltaFromPointer(event.clientX));
    }
    setResizePreview({ id: item.id, startsOn: item.startsOn, endsOn: item.endsOn });
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', finish, { once: true });
    window.addEventListener('pointercancel', cancel, { once: true });
  };

  return (
    <div className={`planning-calendar-grid planning-timeline-row is-crew${hierarchy ? ' is-fleet-person' : ''}`}>
      <div className="planning-row-label">
        <span><strong>{lane.label}</strong>{hierarchy ? null : <small>{lane.detail || 'Sans détail'}</small>}</span>
      </div>
      {days.map((day, index) => {
        const occupied = lane.events.some((event) => event.startsOn <= day.date && event.endsOn >= day.date);
        const canCreate = !hierarchy && editable && viewMode !== 'year' && !occupied;
        const shared = {
          className: cellClass(day, { create: canCreate, dragOver: dragOverDate === day.date, drop: editable }),
          'data-planning-drop-date': day.date,
          onDragEnter: editable ? () => setDragOverDate(day.date) : undefined,
          onDragLeave: editable ? () => setDragOverDate((current) => current === day.date ? null : current) : undefined,
          onDragOver: editable ? (dragEvent: React.DragEvent) => {
            dragEvent.preventDefault();
            dragEvent.dataTransfer.dropEffect = 'move';
            const item = lane.events.find((candidate) => candidate.id === draggingId);
            if (item) setMovePreview({ startsOn: day.date, endsOn: addPlanningDays(day.date, daysBetween(item.startsOn, item.endsOn)) });
          } : undefined,
          onDrop: editable ? (event: React.DragEvent) => {
            event.preventDefault();
            setDragOverDate(null);
            setMovePreview(null);
            const id = event.dataTransfer.getData('application/x-seapilot-event');
            const crewEvent = lane.events.find((item) => item.id === id);
            if (crewEvent) onMove(crewEvent, day.date);
          } : undefined,
          style: { gridColumn: index + 2, gridRow: 1 },
        };
        return canCreate
          ? <button {...shared} aria-label={`Créer une affectation pour ${lane.label} le ${formatPlanningDate(day.date)}`} key={day.date} onClick={() => onCreate(lane, day.date)} type="button"><Plus aria-hidden="true" size={13} /></button>
          : <span {...shared} aria-hidden="true" key={day.date} />;
      })}
      {movePreview ? (() => {
        const placement = dateGridPlacement(movePreview.startsOn, movePreview.endsOn, days);
        return placement ? <span aria-hidden="true" className="planning-move-preview is-crew" style={{ gridColumn: `${placement.start + 1} / span ${placement.span}`, gridRow: 1 }} /> : null;
      })() : null}
      {lane.events.map((event) => {
        const preview = resizePreview?.id === event.id ? resizePreview : null;
        const startsOn = preview?.startsOn || event.startsOn;
        const endsOn = preview?.endsOn || event.endsOn;
        const placement = dateGridPlacement(startsOn, endsOn, days);
        if (!placement) return null;
        const isConflict = conflictEventIds.has(event.id);
        const isPending = pendingId === event.id;
        return (
          <Fragment key={event.id}>
          <button
            aria-busy={isPending}
            aria-label={`${event.person}, ${event.status}, ${planningConfirmationLabel(event.confirmationStatus)}, du ${formatPlanningDate(startsOn)} au ${formatPlanningDate(endsOn)}`}
            className={`planning-crew-bar is-${planningStatusTone(event.status)} is-${event.confirmationStatus}${hierarchy ? ' is-fleet-tree' : ''}${editable ? ' is-editable' : ''}${isConflict ? ' has-conflict' : ''}${preview ? ' is-resize-preview' : ''}${draggingId === event.id ? ' is-dragging' : ''}${selectedId === event.id ? ' is-selected' : ''}${isPending ? ' is-pending' : ''}`}
            draggable={editable && !preview && !isPending}
            onClick={(clickEvent) => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                clickEvent.preventDefault();
                return;
              }
              onSelect(event.id);
              onOpen(event);
            }}
            onDragEnd={() => {
              setDraggingId(null);
              setMovePreview(null);
              window.setTimeout(() => { suppressClickRef.current = false; }, 0);
            }}
            onDragStart={(dragEvent) => {
              suppressClickRef.current = true;
              setDraggingId(event.id);
              dragEvent.dataTransfer.effectAllowed = 'move';
              dragEvent.dataTransfer.setData('application/x-seapilot-event', event.id);
            }}
            style={{ gridColumn: `${placement.start + 1} / span ${placement.span}`, gridRow: 1 }}
            title={`${event.person}\n${event.vessel} · ${event.status} · ${planningConfirmationLabel(event.confirmationStatus)}\n${formatPlanningDate(startsOn)} → ${formatPlanningDate(endsOn)}`}
            type="button"
          >
            {editable && event.kind !== 'day' ? <span aria-hidden="true" className="planning-resize-handle is-start" onPointerDown={(pointerEvent) => beginResize(pointerEvent, event, 'start')} /> : null}
            {viewMode !== 'year' && placement.span >= 2 ? <GripVertical aria-hidden="true" className="planning-drag-grip" size={13} /> : null}
            {viewMode !== 'year' && placement.span >= 2 ? <span>{event.status === 'En Mer' ? hierarchy ? 'Embarqué' : event.vessel : event.status}</span> : null}
            {event.confirmationStatus === 'provisional' ? <span className="planning-provisional-mark">P</span> : null}
            {event.comments ? <span aria-label="Cette période contient une annotation" className="planning-annotation-dot" /> : null}
            {editable && event.kind !== 'day' ? <span aria-hidden="true" className="planning-resize-handle is-end" onPointerDown={(pointerEvent) => beginResize(pointerEvent, event, 'end')} /> : null}
          </button>
          {hierarchy && event.assignmentId && viewMode !== 'year' ? days.map((day, dayIndex) => {
            if (day.date < event.startsOn || day.date > event.endsOn) return null;
            const isEditing = editingNote?.eventId === event.id && editingNote.date === day.date;
            if (isEditing) return (
              <form
                className="planning-assignment-note-editor"
                key={`${event.id}-${day.date}`}
                onSubmit={async (submitEvent) => {
                  submitEvent.preventDefault();
                  if (!onSaveDayNote || !editingNote) return;
                  setPendingNote(true);
                  const saved = await onSaveDayNote(event, day.date, editingNote.value);
                  setPendingNote(false);
                  if (saved) setEditingNote(null);
                }}
                style={{ gridColumn: dayIndex + 2, gridRow: 1 }}
              >
                <input aria-label={`Texte du ${formatPlanningDate(day.date)} pour ${lane.label}`} autoFocus maxLength={32} onChange={(inputEvent) => setEditingNote({ eventId: event.id, date: day.date, value: inputEvent.target.value })} value={editingNote.value} />
                <button aria-label="Enregistrer le texte" disabled={pendingNote} type="submit"><Check aria-hidden="true" size={12} /></button>
                <button aria-label="Annuler le texte" onClick={() => setEditingNote(null)} type="button"><X aria-hidden="true" size={12} /></button>
              </form>
            );
            const note = event.dailyNotes?.[day.date] || '';
            return (
              <button
                aria-label={`${note ? 'Modifier' : 'Ajouter'} le texte du ${formatPlanningDate(day.date)} pour ${lane.label}`}
                className={`planning-assignment-note-cell${selectedId === event.id ? ' is-selected' : ''}${day.date === event.startsOn ? ' is-first' : ''}${day.date === event.endsOn ? ' is-last' : ''}`}
                disabled={!editable || !onSaveDayNote}
                draggable={editable && !isPending}
                key={`${event.id}-${day.date}`}
                onClick={(noteEvent) => {
                  noteEvent.stopPropagation();
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  onSelect(event.id);
                  setEditingNote({ eventId: event.id, date: day.date, value: note });
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setMovePreview(null);
                  window.setTimeout(() => { suppressClickRef.current = false; }, 0);
                }}
                onDragStart={(dragEvent) => {
                  suppressClickRef.current = true;
                  setDraggingId(event.id);
                  onSelect(event.id);
                  dragEvent.dataTransfer.effectAllowed = 'move';
                  dragEvent.dataTransfer.setData('application/x-seapilot-event', event.id);
                }}
                style={{ gridColumn: dayIndex + 2, gridRow: 1 }}
                title={note || 'Ajouter un texte court pour ce jour'}
                type="button"
              >{note}</button>
            );
          }) : null}
          </Fragment>
        );
      })}
    </div>
  );
}
