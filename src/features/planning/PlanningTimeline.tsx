import { AlertTriangle, CalendarOff, ChevronDown, ChevronRight, FilePenLine, Plus, Trash2, UserRoundPlus } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import billedIcon from './assets/icone_a_facturer.svg';
import plannedIcon from './assets/icone_a_planifier.svg';
import validIcon from './assets/icone_valide.svg';
import { addPlanningDays, daysBetween, formatPlanningDate, todayPlanningDate } from './planningDates';
import {
  dateGridPlacement,
  planningStatusDisplayLabel,
  planningStatusTone,
  projectStatusTone,
  type PlanningCrewEvent,
  type PlanningTimelineDay,
  type PlanningViewMode,
} from './planningModel';
import type { PlanningProjectRecord } from './planningQueries';
import { planningAbsenceTypeLabel, type PlanningAbsenceRecord } from './planningP12';
import {
  planningGridCellKey,
  planningGridCellsShareSegment,
  planningGridDefaultStatus,
  normalizePlanningGridStatus,
  type PlanningGridCell,
} from './planningGrid';
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

const EMPTY_SELECTED_GRID_CELLS: ReadonlyMap<string, PlanningGridCell> = new Map();
const EMPTY_CUT_GRID_CELL_KEYS: ReadonlySet<string> = new Set();
const EMPTY_CONFLICT_DATES: ReadonlySet<string> = new Set();
const EMPTY_ABSENCES: PlanningAbsenceRecord[] = [];

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
  dayWidth,
  expanded,
  crewCount,
  hasBoards,
  touchDropTarget,
  onAssignPerson,
  onMove,
  onOpen,
  onResize,
  onAddBoard,
  onOpenVessel,
  selectedId,
  onSelect,
  onToggle,
}: TimelineBaseProps & {
  lane: PlanningFleetLane;
  dayWidth: number;
  expanded: boolean;
  crewCount: number;
  hasBoards: boolean;
  touchDropTarget: { vesselId: number; watchGroup: string } | null;
  onAssignPerson: (personId: number, lane: PlanningFleetLane, watchGroup: string) => void;
  onMove: (projectId: number, lane: PlanningFleetLane, date: string) => void;
  onOpen: (project: PlanningProjectRecord) => void;
  onResize: (project: PlanningProjectRecord, edge: 'start' | 'end', delta: number) => void;
  onAddBoard: (lane: PlanningFleetLane) => void;
  onOpenVessel: (lane: PlanningFleetLane) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: () => void;
}) {
  const [resizePreview, setResizePreview] = useState<{ id: number; startsOn: string; endsOn: string } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [personDropOver, setPersonDropOver] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [movePreview, setMovePreview] = useState<{ startsOn: string; endsOn: string } | null>(null);
  const suppressClickRef = useRef(false);
  const watchGroup = 'Bordée 1';
  const canDropPerson = editable && !hasBoards && lane.vesselId !== null;
  const touchPersonOver = canDropPerson && touchDropTarget?.vesselId === lane.vesselId && touchDropTarget.watchGroup === watchGroup;

  function dropPerson(event: React.DragEvent) {
    if (!canDropPerson) return;
    event.preventDefault();
    setPersonDropOver(false);
    try {
      const parsed = JSON.parse(event.dataTransfer.getData('application/x-seapilot-planning')) as { type?: string; id?: number };
      if (parsed.type === 'person' && Number.isSafeInteger(parsed.id) && Number(parsed.id) > 0) onAssignPerson(Number(parsed.id), lane, watchGroup);
    } catch {
      // Ignore malformed or unrelated payloads.
    }
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
      <div
        className={`planning-row-label planning-tree-row is-vessel${personDropOver || touchPersonOver ? ' is-person-drop-target' : ''}`}
        data-planning-person-drop-vessel-id={canDropPerson ? lane.vesselId || undefined : undefined}
        data-planning-person-drop-watch-group={canDropPerson ? watchGroup : undefined}
        onDragEnter={canDropPerson ? (event) => { if (event.dataTransfer.types.includes('application/x-seapilot-planning')) setPersonDropOver(true); } : undefined}
        onDragLeave={canDropPerson ? () => setPersonDropOver(false) : undefined}
        onDragOver={canDropPerson ? (event) => { if (event.dataTransfer.types.includes('application/x-seapilot-planning')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } } : undefined}
        onDrop={dropPerson}
      >
        <button aria-label={`Ouvrir la fiche de ${lane.label}`} className="planning-tree-action" disabled={lane.vesselId === null} onClick={() => onOpenVessel(lane)} title="Fiche du navire" type="button"><FilePenLine aria-hidden="true" size={14} /></button>
        {editable ? <button aria-label={`Ajouter une bordée à ${lane.label}`} className="planning-tree-action" disabled={lane.vesselId === null} onClick={() => onAddBoard(lane)} title="Ajouter une bordée" type="button"><Plus aria-hidden="true" size={15} /></button> : null}
        <button aria-expanded={expanded} aria-label={`${expanded ? 'Replier' : 'Déplier'} ${lane.label}`} className="planning-tree-toggle" onClick={onToggle} type="button">
          <span><strong>{lane.label}</strong><small>{lane.detail}</small></span>
          <em>{crewCount}</em>
          {expanded ? <ChevronDown aria-hidden="true" size={16} /> : <ChevronRight aria-hidden="true" size={16} />}
        </button>
      </div>
      {days.map((day, index) => {
        const mouseDragOver = dragOver === day.date;
        const shared = {
          className: cellClass(day, { create: false, dragOver: mouseDragOver, drop: editable }),
          'data-planning-drop-date': day.date,
          'data-planning-drop-vessel': lane.vessel,
          onDragEnter: editable ? (event: React.DragEvent) => { if (!event.dataTransfer.types.includes('application/x-seapilot-planning')) setDragOver(day.date); } : undefined,
          onDragLeave: editable ? () => setDragOver((current) => current === day.date ? null : current) : undefined,
          onDragOver: editable ? (event: React.DragEvent) => {
            if (event.dataTransfer.types.includes('application/x-seapilot-planning')) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            if (draggingId !== null) {
              const project = lane.projects.find((item) => item.id === draggingId);
              if (project) setMovePreview({ startsOn: day.date, endsOn: addPlanningDays(day.date, daysBetween(project.startsOn, project.endsOn)) });
            }
          } : undefined,
          onDrop: editable ? (event: React.DragEvent) => {
            event.preventDefault();
            setDragOver(null);
            setMovePreview(null);
            const id = Number(event.dataTransfer.getData('application/x-seapilot-project'));
            if (Number.isSafeInteger(id) && id > 0) onMove(id, lane, day.date);
          } : undefined,
          style: { gridColumn: index + 2, gridRow: 1 },
        };
        return <div {...shared} key={day.date} />;
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
            onClick={(event) => { if (suppressClickRef.current) { suppressClickRef.current = false; event.preventDefault(); return; } onSelect(`project-${project.id}`); }}
            onDoubleClick={() => onOpen(project)}
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
            <span className="planning-project-title">{project.title}</span>
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
  vesselId,
  crewCount,
  days,
  expanded,
  editable,
  touchDropTarget,
  onAssignPerson,
  onAddPerson,
  onToggle,
}: {
  board: string;
  vessel: string;
  vesselId: number | null;
  crewCount: number;
  days: PlanningTimelineDay[];
  expanded: boolean;
  editable: boolean;
  touchDropTarget: { vesselId: number; watchGroup: string } | null;
  onAssignPerson: (personId: number, vesselId: number, board: string) => void;
  onAddPerson: () => void;
  onToggle: () => void;
}) {
  const [personDropOver, setPersonDropOver] = useState(false);
  const canDropPerson = editable && vesselId !== null;
  const touchPersonOver = canDropPerson && touchDropTarget?.vesselId === vesselId && touchDropTarget.watchGroup === board;
  function dropPerson(event: React.DragEvent) {
    if (!canDropPerson || vesselId === null) return;
    event.preventDefault();
    setPersonDropOver(false);
    try {
      const parsed = JSON.parse(event.dataTransfer.getData('application/x-seapilot-planning')) as { type?: string; id?: number };
      if (parsed.type === 'person' && Number.isSafeInteger(parsed.id) && Number(parsed.id) > 0) onAssignPerson(Number(parsed.id), vesselId, board);
    } catch {
      // Ignore malformed or unrelated payloads.
    }
  }
  return (
    <div className="planning-calendar-grid planning-timeline-row is-fleet-board">
      <div
        className={`planning-row-label planning-tree-row is-board${personDropOver || touchPersonOver ? ' is-person-drop-target' : ''}`}
        data-planning-person-drop-vessel-id={canDropPerson ? vesselId || undefined : undefined}
        data-planning-person-drop-watch-group={canDropPerson ? board : undefined}
        onDragEnter={canDropPerson ? (event) => { if (event.dataTransfer.types.includes('application/x-seapilot-planning')) setPersonDropOver(true); } : undefined}
        onDragLeave={canDropPerson ? () => setPersonDropOver(false) : undefined}
        onDragOver={canDropPerson ? (event) => { if (event.dataTransfer.types.includes('application/x-seapilot-planning')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } } : undefined}
        onDrop={dropPerson}
      >
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
  conflictDatesByEvent,
  dayWidth,
  onCreate,
  onMove,
  onOpen,
  onResize,
  onEditDayState,
  onSelect,
  selectedId,
  selectedGridCells = EMPTY_SELECTED_GRID_CELLS,
  cutGridCellKeys = EMPTY_CUT_GRID_CELL_KEYS,
  onGridCellPointerDown,
  onGridCellPointerEnter,
  onConflictCellClick,
  absences = EMPTY_ABSENCES,
  onOpenAbsence,
  onDeleteEmptyRow,
  isDeletingEmptyRow = false,
  hierarchy = false,
}: TimelineBaseProps & {
  lane: PlanningCrewLane;
  conflictDatesByEvent: Map<string, Set<string>>;
  dayWidth: number;
  onCreate: (lane: PlanningCrewLane, date: string) => void;
  onMove: (event: PlanningCrewEvent, date: string) => void;
  onOpen: (event: PlanningCrewEvent) => void;
  onResize: (event: PlanningCrewEvent, edge: 'start' | 'end', delta: number) => void;
  onEditDayState?: (event: PlanningCrewEvent, date: string | null) => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
  selectedGridCells?: ReadonlyMap<string, PlanningGridCell>;
  cutGridCellKeys?: ReadonlySet<string>;
  onGridCellPointerDown?: (cell: PlanningGridCell, event: React.PointerEvent<HTMLButtonElement>) => void;
  onGridCellPointerEnter?: (cell: PlanningGridCell) => void;
  onConflictCellClick?: (cell: PlanningGridCell) => void;
  absences?: PlanningAbsenceRecord[];
  onOpenAbsence?: (absence: PlanningAbsenceRecord) => void;
  onDeleteEmptyRow?: () => void;
  isDeletingEmptyRow?: boolean;
  hierarchy?: boolean;
}) {
  const [resizePreview, setResizePreview] = useState<{ id: string; startsOn: string; endsOn: string } | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [movePreview, setMovePreview] = useState<{ startsOn: string; endsOn: string } | null>(null);
  const suppressClickRef = useRef(false);
  const conflictClickTimerRef = useRef<number | null>(null);
  const laneCoverage = useMemo(() => ({
    occupiedDates: new Set(days
      .filter((day) => lane.events.some((event) => event.startsOn <= day.date && event.endsOn >= day.date))
      .map((day) => day.date)),
    vesselId: lane.events.find((event) => event.vesselId !== null)?.vesselId || lane.vesselId || null,
    functionLabel: lane.events[0]?.functionLabel || lane.functionLabel || 'Équipage',
  }), [days, lane.events, lane.functionLabel, lane.vesselId]);
  const laneAbsences = useMemo(
    () => absences.filter((absence) => (
      absence.personId === lane.personId
      && (absence.status === 'requested' || absence.status === 'approved')
    )),
    [absences, lane.personId],
  );

  function cancelPendingConflictClick() {
    if (conflictClickTimerRef.current === null) return;
    window.clearTimeout(conflictClickTimerRef.current);
    conflictClickTimerRef.current = null;
  }

  function scheduleConflictClick(cell: PlanningGridCell) {
    cancelPendingConflictClick();
    conflictClickTimerRef.current = window.setTimeout(() => {
      conflictClickTimerRef.current = null;
      onConflictCellClick?.(cell);
    }, 220);
  }

  useEffect(() => () => {
    if (conflictClickTimerRef.current !== null) window.clearTimeout(conflictClickTimerRef.current);
  }, []);

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
      <div className={`planning-row-label${onDeleteEmptyRow ? ' has-empty-row-action' : ''}`}>
        <span><strong>{lane.label}</strong>{hierarchy ? null : <small>{lane.detail || 'Sans détail'}</small>}</span>
        {onDeleteEmptyRow ? <button aria-label={`Supprimer la ligne vide de ${lane.label}`} className="planning-empty-row-delete" disabled={isDeletingEmptyRow} onClick={onDeleteEmptyRow} title="Supprimer la ligne vide" type="button"><Trash2 aria-hidden="true" size={13} /></button> : null}
      </div>
      {days.map((day, index) => {
        const occupied = laneCoverage.occupiedDates.has(day.date);
        const vesselId = laneCoverage.vesselId;
        const showEmptyButton = editable && !occupied;
        const canPaintEmpty = hierarchy && lane.personId !== null && vesselId !== null && Boolean(onGridCellPointerDown);
        const emptySelectionId = `empty-${lane.key}-${day.date}`;
        const emptyKey = planningGridCellKey(lane.key, day.date);
        const emptySelectedCell = selectedGridCells.get(emptyKey);
        const emptySelected = Boolean(emptySelectedCell) || selectedId === emptySelectionId;
        const armementCell = lane.vessel.trim().toLocaleUpperCase('fr-FR').includes('ARMEMENT');
        const emptyCell: PlanningGridCell | null = lane.personId !== null && vesselId !== null ? {
          key: emptyKey,
          laneKey: lane.key,
          workDate: day.date,
          personId: lane.personId,
          person: lane.label,
          vesselId,
          vessel: lane.vessel,
          watchGroup: lane.watchGroup,
          functionLabel: laneCoverage.functionLabel,
          assignmentId: null,
          eventId: null,
          status: planningGridDefaultStatus(lane.vessel),
          note: '',
          isConflict: false,
        } : null;
        const shared = {
          className: cellClass(day, { create: showEmptyButton, dragOver: dragOverDate === day.date, drop: editable }),
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
        return showEmptyButton
          ? <button
              {...shared}
              aria-label={`Sélectionner la case vide de ${lane.label} le ${formatPlanningDate(day.date)}. Double-cliquer pour ouvrir le formulaire complet.`}
              data-planning-grid-cell={emptyKey}
              key={day.date}
              onClick={(event) => { event.preventDefault(); event.stopPropagation(); onSelect(emptySelectionId); }}
              onDoubleClick={() => onCreate(lane, day.date)}
              onPointerDown={(event) => { if (canPaintEmpty && emptyCell) onGridCellPointerDown?.(emptyCell, event); }}
              onPointerEnter={() => { if (canPaintEmpty && emptyCell) onGridCellPointerEnter?.(emptyCell); }}
              type="button"
            >{emptySelected ? <span aria-hidden="true" className={`planning-empty-cell-marker ${armementCell ? 'is-armement' : 'is-default'} is-${planningStatusTone(emptySelectedCell?.status || emptyCell?.status || 'En Mer')}`} /> : <Plus aria-hidden="true" size={13} />}</button>
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
        const conflictDates = conflictDatesByEvent.get(event.id) || EMPTY_CONFLICT_DATES;
        const isConflict = conflictDates.size > 0;
        const isPending = pendingId === event.id;
        const hasDailyGrid = hierarchy && Boolean(event.assignmentId) && viewMode !== 'year';
        const visibleDailyStates = hasDailyGrid
          ? days.flatMap((day) => {
              if (day.date < event.startsOn || day.date > event.endsOn) return [];
              const selectedCell = selectedGridCells.get(planningGridCellKey(lane.key, day.date));
              return [{
                note: selectedCell?.note ?? event.dailyNotes?.[day.date] ?? '',
                status: normalizePlanningGridStatus(selectedCell?.status ?? event.dailyStatuses?.[day.date] ?? event.status, event.vessel),
              }];
            })
          : [];
        const hasVisibleDailyNotes = visibleDailyStates.some((cell) => Boolean(cell.note.trim()));
        const continuousDailyStatus = visibleDailyStates.length > 0
          && visibleDailyStates.every((cell) => cell.status === visibleDailyStates[0].status)
          ? visibleDailyStates[0].status
          : null;
        const dailyBaseTone = planningStatusTone(continuousDailyStatus || event.status);
        return (
          <Fragment key={event.id}>
          <button
            aria-busy={isPending}
            aria-label={`${event.person}, ${planningStatusDisplayLabel(event.status)}, ${planningConfirmationLabel(event.confirmationStatus)}, du ${formatPlanningDate(startsOn)} au ${formatPlanningDate(endsOn)}`}
            className={`planning-crew-bar is-${planningStatusTone(event.status)} is-${event.confirmationStatus}${hierarchy ? ' is-fleet-tree' : ''}${hasDailyGrid ? ` has-daily-grid is-daily-base-${dailyBaseTone}` : ''}${editable ? ' is-editable' : ''}${isConflict ? ' has-conflict' : ''}${preview ? ' is-resize-preview' : ''}${draggingId === event.id ? ' is-dragging' : ''}${selectedId === event.id ? ' is-selected' : ''}${isPending ? ' is-pending' : ''}`}
            draggable={editable && !preview && !isPending}
            onClick={(clickEvent) => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                clickEvent.preventDefault();
                return;
              }
              onSelect(event.id);
            }}
            onContextMenu={(contextEvent) => {
              if (!editable || !hierarchy || !event.assignmentId || !onEditDayState) return;
              contextEvent.preventDefault();
              contextEvent.stopPropagation();
              onSelect(event.id);
              onEditDayState(event, null);
            }}
            onDoubleClick={() => onOpen(event)}
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
            title={`${event.person}\n${event.vessel} · ${planningStatusDisplayLabel(event.status)} · ${planningConfirmationLabel(event.confirmationStatus)}\n${formatPlanningDate(startsOn)} → ${formatPlanningDate(endsOn)}`}
            type="button"
          >
            {editable && event.kind !== 'day' ? <span aria-hidden="true" className="planning-resize-handle is-start" onPointerDown={(pointerEvent) => beginResize(pointerEvent, event, 'start')} /> : null}
            {viewMode !== 'year' && placement.span >= 2 && !hierarchy ? <span>{event.status === 'En Mer' ? event.vessel : planningStatusDisplayLabel(event.status)}</span> : null}
            {event.confirmationStatus === 'provisional' ? <span className="planning-provisional-mark">P</span> : null}
            {event.comments ? <span aria-label="Cette période contient une annotation" className="planning-annotation-dot" /> : null}
            {editable && event.kind !== 'day' ? <span aria-hidden="true" className="planning-resize-handle is-end" onPointerDown={(pointerEvent) => beginResize(pointerEvent, event, 'end')} /> : null}
          </button>
          {hasDailyGrid ? days.map((day, dayIndex) => {
            if (day.date < event.startsOn || day.date > event.endsOn) return null;
            if (event.personId === null || event.vesselId === null) return null;
            const cellKey = planningGridCellKey(lane.key, day.date);
            const storedCell: PlanningGridCell = {
              key: cellKey,
              laneKey: lane.key,
              workDate: day.date,
              personId: event.personId,
              person: event.person,
              vesselId: event.vesselId,
              vessel: event.vessel,
              watchGroup: event.board,
              functionLabel: event.functionLabel,
              assignmentId: event.assignmentId || null,
              eventId: event.id,
              status: normalizePlanningGridStatus(event.dailyStatuses?.[day.date] || event.status, event.vessel),
              note: event.dailyNotes?.[day.date] || '',
              isConflict: conflictDates.has(day.date),
            };
            const cell = selectedGridCells.get(cellKey) || storedCell;
            const adjacentCell = (date: string): PlanningGridCell | null => {
              if (date < event.startsOn || date > event.endsOn) return null;
              const adjacentKey = planningGridCellKey(lane.key, date);
              return selectedGridCells.get(adjacentKey) || {
                ...storedCell,
                key: adjacentKey,
                workDate: date,
                status: normalizePlanningGridStatus(event.dailyStatuses?.[date] || event.status, event.vessel),
                note: event.dailyNotes?.[date] || '',
                isConflict: conflictDates.has(date),
              };
            };
            const segmentStart = !planningGridCellsShareSegment(adjacentCell(addPlanningDays(day.date, -1)), cell);
            const segmentEnd = !planningGridCellsShareSegment(cell, adjacentCell(addPlanningDays(day.date, 1)));
            return (
              <button
                aria-label={`${cell.isConflict ? 'Conflit. ' : ''}Modifier le statut et le commentaire du ${formatPlanningDate(day.date)} pour ${lane.label}`}
                className={`planning-assignment-note-cell is-${planningStatusTone(cell.status)}${selectedGridCells.has(cellKey) ? ' is-selected' : ''}${cutGridCellKeys.has(cellKey) ? ' is-cut' : ''}${cell.isConflict ? ' has-conflict' : ''}${day.date === event.startsOn ? ' is-first' : ''}${day.date === event.endsOn ? ' is-last' : ''}${segmentStart ? ' is-segment-start' : ''}${segmentEnd ? ' is-segment-end' : ''}`}
                data-planning-grid-cell={cellKey}
                disabled={!editable}
                key={`${event.id}-${day.date}`}
                onClick={(noteEvent) => {
                  noteEvent.preventDefault();
                  noteEvent.stopPropagation();
                  if (cell.isConflict && onConflictCellClick && !noteEvent.ctrlKey && !noteEvent.metaKey) {
                    onSelect(event.id);
                    scheduleConflictClick(cell);
                    return;
                  }
                  onSelect(event.id);
                }}
                onContextMenu={(contextEvent) => {
                  if (!editable || !onEditDayState) return;
                  contextEvent.preventDefault();
                  contextEvent.stopPropagation();
                  cancelPendingConflictClick();
                  onSelect(event.id);
                  onEditDayState(event, day.date);
                }}
                onDoubleClick={(doubleClickEvent) => {
                  cancelPendingConflictClick();
                  doubleClickEvent.stopPropagation();
                  onOpen(event);
                }}
                onPointerDown={(pointerEvent) => onGridCellPointerDown?.(cell, pointerEvent)}
                onPointerEnter={() => onGridCellPointerEnter?.(cell)}
                style={{ gridColumn: dayIndex + 2, gridRow: 1 }}
                title={cell.isConflict ? `Conflit d'affectation — ${cell.note || 'aucun commentaire'}` : cell.note || 'Case sans commentaire'}
                type="button"
              >{cell.note}{cell.isConflict ? <AlertTriangle aria-hidden="true" className="planning-grid-conflict-icon" size={13} /> : null}</button>
            );
          }) : null}
          {hasDailyGrid && continuousDailyStatus && !hasVisibleDailyNotes && placement.span >= 2 ? (
            <span
              aria-hidden="true"
              className="planning-fleet-assignment-label"
              style={{ gridColumn: `${placement.start + 1} / span ${placement.span}`, gridRow: 1 }}
            >
              {continuousDailyStatus === 'En Mer' ? event.vessel : continuousDailyStatus}
            </span>
          ) : null}
          </Fragment>
        );
      })}
      {laneAbsences.map((absence) => {
        const placement = dateGridPlacement(absence.startsOn, absence.endsOn, days);
        if (!placement) return null;
        const statusLabel = absence.status === 'approved'
          ? absence.absenceType === 'leave' ? 'Validés' : 'Validée'
          : 'À valider';
        return (
          <button
            aria-label={`${planningAbsenceTypeLabel(absence.absenceType)} ${statusLabel.toLocaleLowerCase('fr-FR')} du ${formatPlanningDate(absence.startsOn)} au ${formatPlanningDate(absence.endsOn)}`}
            className={`planning-absence-bar is-${absence.status}`}
            key={`absence-${absence.id}`}
            onClick={() => onOpenAbsence?.(absence)}
            style={{ gridColumn: `${placement.start + 1} / span ${placement.span}`, gridRow: 1 }}
            title={`${planningAbsenceTypeLabel(absence.absenceType)} · ${statusLabel}\n${formatPlanningDate(absence.startsOn)} → ${formatPlanningDate(absence.endsOn)}${absence.reason ? `\n${absence.reason}` : ''}`}
            type="button"
          >
            <CalendarOff aria-hidden="true" size={12} />
            <span>{planningAbsenceTypeLabel(absence.absenceType)}</span>
          </button>
        );
      })}
    </div>
  );
}
