import { GripVertical, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
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
  onCreate,
  onMove,
  onOpen,
  onResize,
}: TimelineBaseProps & {
  lane: PlanningFleetLane;
  dayWidth: number;
  onCreate: (lane: PlanningFleetLane, date: string) => void;
  onMove: (projectId: number, lane: PlanningFleetLane, date: string) => void;
  onOpen: (project: PlanningProjectRecord) => void;
  onResize: (project: PlanningProjectRecord, edge: 'start' | 'end', delta: number) => void;
}) {
  const [resizePreview, setResizePreview] = useState<{ id: number; startsOn: string; endsOn: string } | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const suppressClickRef = useRef(false);
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
      <div className="planning-row-label">
        <span className="planning-row-icon" aria-hidden="true">N</span>
        <span><strong>{lane.label}</strong><small>{lane.detail}</small></span>
      </div>
      {days.map((day, index) => {
        const occupied = lane.projects.some((project) => project.startsOn <= day.date && project.endsOn >= day.date);
        const canCreate = editable && viewMode !== 'year' && lane.vesselId !== null && !occupied;
        const shared = {
          className: cellClass(day, { create: canCreate, dragOver: dragOverDate === day.date, drop: editable }),
          'data-planning-drop-date': day.date,
          'data-planning-drop-vessel': lane.vessel,
          onDragEnter: editable ? () => setDragOverDate(day.date) : undefined,
          onDragLeave: editable ? () => setDragOverDate((current) => current === day.date ? null : current) : undefined,
          onDragOver: editable ? (event: React.DragEvent) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } : undefined,
          onDrop: editable ? (event: React.DragEvent) => {
            event.preventDefault();
            setDragOverDate(null);
            const id = Number(event.dataTransfer.getData('application/x-seapilot-project'));
            if (Number.isSafeInteger(id) && id > 0) onMove(id, lane, day.date);
          } : undefined,
          style: { gridColumn: index + 2, gridRow: 1 },
        };
        return canCreate
          ? <button {...shared} aria-label={`Créer un événement pour ${lane.label} le ${formatPlanningDate(day.date)}`} key={day.date} onClick={() => onCreate(lane, day.date)} type="button"><Plus aria-hidden="true" size={13} /></button>
          : <span {...shared} aria-hidden="true" key={day.date} />;
      })}
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
            className={`planning-project-bar is-${project.eventType} is-${projectStatusTone(project.status)}${draggingId === project.id ? ' is-dragging' : ''}${isPending ? ' is-pending' : ''}${preview ? ' is-resize-preview' : ''}`}
            draggable={editable && !isPending && !preview}
            key={project.id}
            onClick={(event) => { if (suppressClickRef.current) { suppressClickRef.current = false; event.preventDefault(); return; } onOpen(project); }}
            onDragEnd={() => setDraggingId(null)}
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
}: TimelineBaseProps & {
  lane: PlanningCrewLane;
  conflictEventIds: Set<string>;
  dayWidth: number;
  onCreate: (lane: PlanningCrewLane, date: string) => void;
  onMove: (event: PlanningCrewEvent, date: string) => void;
  onOpen: (event: PlanningCrewEvent) => void;
  onResize: (event: PlanningCrewEvent, edge: 'start' | 'end', delta: number) => void;
}) {
  const [resizePreview, setResizePreview] = useState<{ id: string; startsOn: string; endsOn: string } | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
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
    <div className="planning-calendar-grid planning-timeline-row is-crew">
      <div className="planning-row-label">
        <span className="planning-row-icon" aria-hidden="true">E</span>
        <span><strong>{lane.label}</strong><small>{lane.detail || 'Sans détail'}</small></span>
      </div>
      {days.map((day, index) => {
        const occupied = lane.events.some((event) => event.startsOn <= day.date && event.endsOn >= day.date);
        const canCreate = editable && viewMode !== 'year' && !occupied;
        const shared = {
          className: cellClass(day, { create: canCreate, dragOver: dragOverDate === day.date, drop: editable }),
          'data-planning-drop-date': day.date,
          onDragEnter: editable ? () => setDragOverDate(day.date) : undefined,
          onDragLeave: editable ? () => setDragOverDate((current) => current === day.date ? null : current) : undefined,
          onDragOver: editable ? (event: React.DragEvent) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } : undefined,
          onDrop: editable ? (event: React.DragEvent) => {
            event.preventDefault();
            setDragOverDate(null);
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
      {lane.events.map((event) => {
        const preview = resizePreview?.id === event.id ? resizePreview : null;
        const startsOn = preview?.startsOn || event.startsOn;
        const endsOn = preview?.endsOn || event.endsOn;
        const placement = dateGridPlacement(startsOn, endsOn, days);
        if (!placement) return null;
        const isConflict = conflictEventIds.has(event.id);
        const isPending = pendingId === event.id;
        return (
          <button
            aria-busy={isPending}
            aria-label={`${event.person}, ${event.status}, ${planningConfirmationLabel(event.confirmationStatus)}, du ${formatPlanningDate(startsOn)} au ${formatPlanningDate(endsOn)}`}
            className={`planning-crew-bar is-${planningStatusTone(event.status)} is-${event.confirmationStatus}${editable ? ' is-editable' : ''}${isConflict ? ' has-conflict' : ''}${preview ? ' is-resize-preview' : ''}${draggingId === event.id ? ' is-dragging' : ''}${isPending ? ' is-pending' : ''}`}
            draggable={editable && !preview && !isPending}
            key={event.id}
            onClick={(clickEvent) => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                clickEvent.preventDefault();
                return;
              }
              onOpen(event);
            }}
            onDragEnd={() => {
              setDraggingId(null);
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
            {viewMode !== 'year' && placement.span >= 2 ? <span>{event.status === 'En Mer' ? event.vessel : event.status}</span> : null}
            {event.confirmationStatus === 'provisional' ? <span className="planning-provisional-mark">P</span> : null}
            {event.comments ? <span aria-label="Cette période contient une annotation" className="planning-annotation-dot" /> : null}
            {editable && event.kind !== 'day' ? <span aria-hidden="true" className="planning-resize-handle is-end" onPointerDown={(pointerEvent) => beginResize(pointerEvent, event, 'end')} /> : null}
          </button>
        );
      })}
    </div>
  );
}
