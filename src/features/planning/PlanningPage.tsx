import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Activity,
  AlertTriangle,
  Bell,
  CalendarOff,
  CalendarDays,
  CalendarPlus,
  ClipboardCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Expand,
  FilePenLine,
  FileDown,
  FileSpreadsheet,
  Gauge,
  GripVertical,
  History,
  Minus,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldAlert,
  Ship,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserRoundPlus,
  UsersRound,
  Wrench,
  X,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, FormEvent, ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { PLANNING_ASSISTANT_ENABLED, PLANNING_PREDICTIONS_ENABLED } from '../../config/featureFlags';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import {
  buildPlanningCertificateAlerts,
  buildPlanningControlCenter,
  buildPlanningHrAlerts,
  buildPlanningMonthSegments,
  buildPlanningCrewRows,
  buildPlanningTimeline,
  formatPlanningPerson,
  getAllPlanningCrewEvents,
  getUnassignedPlanningPeople,
  getUnbilledPlanningProjects,
  evaluatePlanningAssignment,
  hasBlockingPlanningControls,
  isSedentaryPlanningFunction,
  planningStatusDisplayLabel,
  shiftPlanningAnchor,
  timelineRange,
  type PlanningCrewEvent,
  type PlanningControlResult,
  type PlanningFilters,
  type PlanningViewMode,
} from './planningModel';
import { addPlanningDays, daysBetween, formatPlanningDate, formatPlanningDateTime, todayPlanningDate, utcToPlanningLocalDateTime } from './planningDates';
import { planningErrorMessage } from './planningErrors';
import { getPlanningConflictDatesByEvent } from './planningOverlap';
import { getPlanningPermissions } from './planningPermissions';
import { createPlanningPreviewOverview } from './planningPreviewData';
import {
  addPlanningBoardRow,
  archivePlanningVessel,
  applyPlanningGridCells,
  createPlanningAssignment,
  createPlanningBoardAssignments,
  createPlanningProject,
  createVessel,
  deletePlanningBoardRow,
  deletePlanningEvent,
  fetchPlanningAssignmentOverviewRows,
  fetchPlanningHandovers,
  fetchPlanningHistory,
  fetchPlanningDays,
  fetchPlanningProjects,
  mapPlanningAssignmentOverviewRows,
  mapPlanningAssignmentRows,
  movePlanningGridCells,
  removePlanningGridCells,
  resolvePlanningGridConflictCells,
  savePlanningHandover,
  savePlanningAssignmentDayState,
  publishPlanningRelease,
  updatePlanningEvent,
  updatePlanningVessel,
  updatePlanningProject,
  type PlanningPerson,
  type PlanningConfirmationStatus,
  type PlanningFleetEventType,
  type PlanningHandoverRecord,
  type PlanningHistoryRecord,
  type PlanningHrDocumentRecord,
  type PlanningProjectRecord,
  type PlanningVessel,
  type SavePlanningHandoverInput,
} from './planningQueries';
import {
  buildPlanningGridPaste,
  planningGridCellKey,
  planningGridDefaultStatus,
  sortPlanningGridCells,
  type PlanningGridCell,
  type PlanningGridClipboard,
} from './planningGrid';
import { missingManningRequirementTerms, type PlanningManningRequirement } from './planningP11';
import { fetchPlanningManningMatrices } from './planningP11Queries';
import {
  availablePlanningCrewListBoards,
  buildPlanningCrewList,
  generatePlanningCrewList,
  type PlanningCrewListFormat,
} from './planningCrewList';
import { PlanningControlSummary } from './PlanningControlSummary';
import {
  PlanningHandoverDialog,
} from './PlanningP03Panels';
import { PlanningPublicationPanel } from './PlanningPublicationPanel';
import { PlanningP11Panel } from './PlanningP11Panel';
import type { PlanningAbsenceRecord, PlanningDetectedConflict } from './planningP12';
import { fetchPlanningAbsences } from './planningP12Queries';
import { PlanningCrewTimelineRow, PlanningFleetBoardTimelineRow, PlanningFleetTimelineRow } from './PlanningTimeline';
import {
  buildPlanningCrewLanes,
  buildPlanningFleetLanes,
  patchPlanningEvent,
  planningConfirmationLabel,
  planningCrewEventTypeLabel,
  planningFleetEventTypeLabel,
  removePlanningEvent,
  replacePlanningProject,
  type PlanningCrewGrouping,
  type PlanningCrewLane,
  type PlanningFleetLane,
  type PlanningPerspective,
} from './planningViews';
import { usePlanningOverview } from './usePlanningOverview';
import { usePlanningAssistantAccess } from './usePlanningAssistantAccess';

interface PlanningPageProps {
  client?: SupabaseClient;
  roles?: RoleKey[];
  assistantFeatureEnabled?: boolean;
  predictionsFeatureEnabled?: boolean;
}

interface AssignmentFormState {
  vesselId: string;
  captainPersonId: string;
  crewPersonId: string;
  startsOn: string;
  endsOn: string;
  startsAt: string;
  endsAt: string;
  assignmentRole: string;
  statusLabel: string;
  confirmationStatus: PlanningConfirmationStatus;
  watchGroup: string;
  comments: string;
}

interface EventFormState {
  vesselId: string;
  startsOn: string;
  endsOn: string;
  startsAt: string;
  endsAt: string;
  statusLabel: string;
  confirmationStatus: PlanningConfirmationStatus;
  functionLabel: string;
  watchGroup: string;
  comments: string;
}

interface ProjectFormState {
  title: string;
  startsOn: string;
  endsOn: string;
  status: string;
  eventType: PlanningFleetEventType;
  vesselId: string;
  responsibleName: string;
  clientName: string;
  description: string;
}

interface CrewListFormState { vesselId: string; date: string; watchGroup: string; format: PlanningCrewListFormat }
interface VesselFormState { id: number; name: string; acronym: string }
interface PlanningDayStateForm {
  event: PlanningCrewEvent;
  date: string | null;
  selectedDate: string;
  status: 'En Mer' | 'A Terre' | 'Vacance' | 'Repos';
  note: string;
}
interface PlanningBoardPositionForm {
  key: string;
  requirement: PlanningManningRequirement;
  personId: string;
  candidates: PlanningPerson[];
}
interface PlanningBoardForm {
  vesselId: number;
  vesselName: string;
  watchGroup: string;
  startsOn: string;
  endsOn: string;
  positions: PlanningBoardPositionForm[];
}

interface PlanningDepartedPeopleDialogState {
  vesselId: number;
  vesselName: string;
  watchGroup: string;
}

interface PlanningGridConflictForm {
  cell: PlanningGridCell;
  events: PlanningCrewEvent[];
}

type SideTab = 'conflicts' | 'handovers' | 'history' | 'certificates' | 'unassigned' | 'billing' | 'alerts';

interface PlanningRibbonButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  count?: number;
  icon: ReactNode;
  label: string;
}

function PlanningRibbonButton({ className = '', count = 0, icon, label, ...buttonProps }: PlanningRibbonButtonProps) {
  return (
    <button
      aria-label={buttonProps['aria-label'] || `${label}${count ? ` (${Math.min(99, count)})` : ''}`}
      className={`planning-ribbon-command${className ? ` ${className}` : ''}`}
      type="button"
      {...buttonProps}
    >
      <span className="planning-ribbon-command-icon">
        {icon}
        {count ? <em>{Math.min(99, count)}</em> : null}
      </span>
      <span className="planning-ribbon-command-label">{label}</span>
    </button>
  );
}

function PlanningRibbonGroup({ children, label }: { children?: ReactNode; label: string }) {
  return (
    <div aria-label={label} className="planning-ribbon-group" role="group">
      <div className="planning-ribbon-actions">{children}</div>
      <span className="planning-ribbon-group-label">{label}</span>
    </div>
  );
}

const EMPTY_FILTERS: PlanningFilters = { vesselName: '', personName: '', eventType: '', status: '', responsible: '' };
const EMPTY_ASSIGNMENT: AssignmentFormState = {
  vesselId: '',
  captainPersonId: '',
  crewPersonId: '',
  startsOn: '',
  endsOn: '',
  startsAt: '',
  endsAt: '',
  assignmentRole: 'Équipage',
  statusLabel: 'En Mer',
  confirmationStatus: 'confirmed',
  watchGroup: 'Affectation',
  comments: '',
};

const EMPTY_PROJECT_FORM: ProjectFormState = {
  title: '',
  startsOn: '',
  endsOn: '',
  status: 'A planifier',
  eventType: 'operation',
  vesselId: '',
  responsibleName: '',
  clientName: '',
  description: '',
};

const PLANNING_STATUSES = ['En Mer', 'A Terre', 'Repos', 'Vacance', 'Arrêt de travail', 'Formation'];
const PROJECT_STATUSES = ['A planifier', 'Confirmé', 'En cours', 'Validé', 'Terminé', 'Annulé'];
const FLEET_EVENT_TYPES: PlanningFleetEventType[] = ['operation', 'transit', 'maintenance', 'unavailability'];

const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const SIDE_TABS: Array<{ key: SideTab; label: string }> = [
  { key: 'conflicts', label: 'Conflits' },
  { key: 'handovers', label: 'Relèves' },
  { key: 'history', label: 'Historique' },
  { key: 'certificates', label: 'Certificats' },
  { key: 'unassigned', label: 'Marins non affectés' },
  { key: 'billing', label: 'Facturation' },
  { key: 'alerts', label: 'Alertes' },
];

const PlanningP12Panel = lazy(() => import('./PlanningP12Panel').then((module) => ({ default: module.PlanningP12Panel })));
const PlanningP13Panel = lazy(() => import('./PlanningP13Panel').then((module) => ({ default: module.PlanningP13Panel })));
const PlanningExportDialog = lazy(() => import('./PlanningExportDialog').then((module) => ({ default: module.PlanningExportDialog })));
const PlanningP21Panel = lazy(() => import('./PlanningP21Panel').then((module) => ({ default: module.PlanningP21Panel })));
const PlanningP22Panel = lazy(() => import('./PlanningP22Panel').then((module) => ({ default: module.PlanningP22Panel })));

function localDateTime(date: string, time: string): string {
  return date ? `${date}T${time}` : '';
}

function vesselOptionLabel(vessel: PlanningVessel): string {
  return vessel.acronym ? `${vessel.name} (${vessel.acronym})` : vessel.name;
}

function personOptionLabel(person: PlanningPerson): string {
  return `${formatPlanningPerson(person)}${person.functionLabel ? ` · ${person.functionLabel}` : ''}`;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, 'fr'));
}

function blockingControlMessage(results: PlanningControlResult[]): string {
  const blocking = results.find((result) => result.level === 'blocking');
  return blocking ? `${blocking.title} : ${blocking.detail}` : '';
}

function planningControlSaveMessage(results: PlanningControlResult[], fallback: string): string {
  const warnings = results.filter((result) => result.level === 'warning');
  return warnings.length ? `${fallback} ${warnings.length} avertissement(s) à traiter.` : fallback;
}

function timelineStyle(dayWidth: number, dayCount: number) {
  return {
    '--planning-day-width': `${dayWidth}px`,
    '--planning-day-count': dayCount,
  } as React.CSSProperties;
}

export function PlanningPage({ client, roles, assistantFeatureEnabled, predictionsFeatureEnabled }: PlanningPageProps) {
  const outletContext = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || outletContext?.client || supabase;
  const effectiveRoles = roles || outletContext?.roles || [];
  const previewMode = outletContext?.previewMode || false;
  const readPermissions = getPlanningPermissions(effectiveRoles, false);
  const usesLivePlanning = effectiveRoles.some((role) => role === 'admin' || role === 'direction' || role === 'armement');
  const workspaceRef = useRef<HTMLElement>(null);
  const initialAnchorDate = useMemo(() => todayPlanningDate(), []);
  const previewOverview = useMemo(
    () => previewMode ? createPlanningPreviewOverview(initialAnchorDate) : undefined,
    [initialAnchorDate, previewMode],
  );
  const {
    overview,
    updateOverview,
    reload: loadPlanning,
    hasLoaded,
    isInitialLoading,
    isRefreshing,
    loadErrorMessage,
  } = usePlanningOverview(effectiveClient, readPermissions.canRead, previewOverview, !usesLivePlanning && !previewMode);
  const [anchorDate, setAnchorDate] = useState(initialAnchorDate);
  const [viewMode, setViewMode] = useState<PlanningViewMode>('month');
  const [perspective, setPerspective] = useState<PlanningPerspective>('fleet');
  const [crewGrouping, setCrewGrouping] = useState<PlanningCrewGrouping>('people');
  const [filters, setFilters] = useState<PlanningFilters>(EMPTY_FILTERS);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [sideTab, setSideTab] = useState<SideTab>('certificates');
  const [isOperationalPanelOpen, setIsOperationalPanelOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<PlanningCrewEvent | null>(null);
  const [selectedProject, setSelectedProject] = useState<PlanningProjectRecord | null>(null);
  const [selectedHandover, setSelectedHandover] = useState<PlanningHandoverRecord | null>(null);
  const [eventForm, setEventForm] = useState<EventFormState | null>(null);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentFormState>(EMPTY_ASSIGNMENT);
  const [isAssignmentOpen, setIsAssignmentOpen] = useState(false);
  const [isAssignmentQuick, setIsAssignmentQuick] = useState(false);
  const [projectForm, setProjectForm] = useState<ProjectFormState>(EMPTY_PROJECT_FORM);
  const [isProjectOpen, setIsProjectOpen] = useState(false);
  const [isProjectQuick, setIsProjectQuick] = useState(false);
  const [isVesselsOpen, setIsVesselsOpen] = useState(false);
  const [vesselForm, setVesselForm] = useState<VesselFormState | null>(null);
  const [dayStateForm, setDayStateForm] = useState<PlanningDayStateForm | null>(null);
  const [boardForm, setBoardForm] = useState<PlanningBoardForm | null>(null);
  const [departedPeopleDialog, setDepartedPeopleDialog] = useState<PlanningDepartedPeopleDialogState | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isCrewListOpen, setIsCrewListOpen] = useState(false);
  const [newVessel, setNewVessel] = useState({ name: '', acronym: '' });
  const [crewListForm, setCrewListForm] = useState<CrewListFormState>({ vesselId: '', date: initialAnchorDate, watchGroup: '', format: 'xlsx' });
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pendingMutationId, setPendingMutationId] = useState<string | null>(null);
  const [isHandoverOpen, setIsHandoverOpen] = useState(false);
  const [isP11Open, setIsP11Open] = useState(false);
  const [isP12Open, setIsP12Open] = useState(false);
  const [p12Launch, setP12Launch] = useState<{
    tab: 'absences' | 'conflicts' | 'replacements';
    absenceId: number | null;
    openAbsenceForm: boolean;
    requestedOnly: boolean;
  }>({ tab: 'conflicts', absenceId: null, openAbsenceForm: false, requestedOnly: false });
  const [isP13Open, setIsP13Open] = useState(false);
  const [isP21Open, setIsP21Open] = useState(false);
  const [isP22Open, setIsP22Open] = useState(false);
  const [touchPersonDrag, setTouchPersonDrag] = useState<{ person: PlanningPerson; x: number; y: number } | null>(null);
  const [touchDropTarget, setTouchDropTarget] = useState<{ vesselId: number; watchGroup: string } | null>(null);
  const [collapsedFleetNodes, setCollapsedFleetNodes] = useState<Set<string>>(() => new Set());
  const [selectedTimelineId, setSelectedTimelineId] = useState<string | null>(null);
  const [selectedGridCells, setSelectedGridCells] = useState<Map<string, PlanningGridCell>>(() => new Map());
  const [isCalendarPanning, setIsCalendarPanning] = useState(false);
  const [gridClipboard, setGridClipboard] = useState<PlanningGridClipboard | null>(null);
  const [gridConflictForm, setGridConflictForm] = useState<PlanningGridConflictForm | null>(null);
  const [absences, setAbsences] = useState<PlanningAbsenceRecord[]>([]);
  const touchDropTargetRef = useRef<{ vesselId: number; watchGroup: string } | null>(null);
  const calendarPanCleanupRef = useRef<(() => void) | null>(null);
  const suppressCalendarClickRef = useRef(false);
  const suppressCalendarClickTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const handleFullscreen = () => setIsFullscreen(document.fullscreenElement === workspaceRef.current);
    document.addEventListener('fullscreenchange', handleFullscreen);
    return () => document.removeEventListener('fullscreenchange', handleFullscreen);
  }, []);

  useEffect(() => () => {
    calendarPanCleanupRef.current?.();
    if (suppressCalendarClickTimeoutRef.current !== null) window.clearTimeout(suppressCalendarClickTimeoutRef.current);
  }, []);

  const loadAbsences = useCallback(async (): Promise<boolean> => {
    if (!readPermissions.canRead || previewMode) {
      setAbsences([]);
      return true;
    }
    try {
      setAbsences(await fetchPlanningAbsences(effectiveClient));
      return true;
    } catch (error) {
      setErrorMessage(planningErrorMessage(error, 'Impossible de charger les demandes de congés.'));
      return false;
    }
  }, [effectiveClient, previewMode, readPermissions.canRead]);

  useEffect(() => {
    if (!readPermissions.canRead || previewMode) return undefined;
    let active = true;
    void fetchPlanningAbsences(effectiveClient)
      .then((result) => {
        if (active) setAbsences(result);
      })
      .catch((error) => {
        if (active) setErrorMessage(planningErrorMessage(error, 'Impossible de charger les demandes de congés.'));
      });
    return () => {
      active = false;
    };
  }, [effectiveClient, previewMode, readPermissions.canRead]);

  const timelineDays = useMemo(() => buildPlanningTimeline(anchorDate, viewMode), [anchorDate, viewMode]);
  const days = timelineDays;
  const monthSegments = useMemo(() => buildPlanningMonthSegments(days), [days]);
  const range = useMemo(() => timelineRange(timelineDays), [timelineDays]);
  const permissions = getPlanningPermissions(effectiveRoles);
  const isPlanningAssistantEnabled = assistantFeatureEnabled ?? PLANNING_ASSISTANT_ENABLED;
  const isPlanningPredictionsEnabled = predictionsFeatureEnabled ?? PLANNING_PREDICTIONS_ENABLED;
  const { access: assistantAccess, isLoading: isAssistantAccessLoading } = usePlanningAssistantAccess(
    effectiveClient,
    isPlanningAssistantEnabled || isPlanningPredictionsEnabled,
    permissions.canBeAssistantPilot,
  );
  const canEditPlanning = permissions.canEditEvents;
  const latestRelease = overview.versions[0] || null;
  const pendingAbsenceCount = absences.filter((absence) => absence.status === 'requested').length;
  const todayDate = todayPlanningDate();
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const baseDayWidths: Record<PlanningViewMode, number> = { day: 260, week: 220, fortnight: 110, month: 52, year: 22 };
  const effectiveDayWidth = Math.round(baseDayWidths[viewMode] * zoomLevel / 100);
  const fleetLanes = useMemo(() => buildPlanningFleetLanes(overview, range, filters), [filters, overview, range]);
  const fleetRows = useMemo(() => buildPlanningCrewRows(overview, timelineDays, filters), [filters, overview, timelineDays]);
  const fleetLanesByVessel = useMemo(
    () => new Map(fleetLanes.map((lane) => [lane.vessel, lane])),
    [fleetLanes],
  );
  const fleetTreeCounts = useMemo(() => {
    const peopleByNode = new Map<string, Set<string>>();
    fleetRows.forEach((row) => {
      if (row.type !== 'person') return;
      [row.vesselKey, row.boardKey].forEach((key) => {
        const people = peopleByNode.get(key) || new Set<string>();
        people.add(row.label);
        peopleByNode.set(key, people);
      });
    });
    return new Map([...peopleByNode].map(([key, people]) => [key, people.size]));
  }, [fleetRows]);
  const crewLanes = useMemo(
    () => buildPlanningCrewLanes(overview, range, filters, crewGrouping),
    [crewGrouping, filters, overview, range],
  );
  const certificateAlerts = useMemo(() => buildPlanningCertificateAlerts(overview, todayDate), [overview, todayDate]);
  const hrAlerts = useMemo(() => buildPlanningHrAlerts(overview, todayDate), [overview, todayDate]);
  const unassignedPeople = useMemo(() => getUnassignedPlanningPeople(overview, range, filters), [filters, overview, range]);
  const unbilledProjects = useMemo(
    () => getUnbilledPlanningProjects(overview, Number(anchorDate.slice(0, 4))),
    [anchorDate, overview],
  );
  const activeVessels = useMemo(() => overview.vessels.filter((vessel) => vessel.active), [overview.vessels]);
  const activePeople = useMemo(() => overview.people.filter((person) => person.active), [overview.people]);
  const departedPeople = useMemo(
    () => overview.people
      .filter((person) => !person.departedOn || person.departedOn > todayDate)
      .sort((left, right) => formatPlanningPerson(left).localeCompare(formatPlanningPerson(right), 'fr')),
    [overview.people, todayDate],
  );
  const crewListVessels = useMemo(
    () => activeVessels.filter((vessel) => availablePlanningCrewListBoards(overview, vessel.id, crewListForm.date).length > 0),
    [activeVessels, crewListForm.date, overview],
  );
  const crewListBoards = useMemo(() => availablePlanningCrewListBoards(
    overview,
    Number(crewListForm.vesselId),
    crewListForm.date,
  ), [crewListForm.date, crewListForm.vesselId, overview]);
  const allPlanningCrewEvents = useMemo(() => getAllPlanningCrewEvents(overview), [overview]);
  const departedDialogExistingPersonIds = useMemo(() => {
    if (!departedPeopleDialog) return new Set<number>();
    return new Set([
      ...(overview.boardRows || [])
        .filter((row) => row.vesselId === departedPeopleDialog.vesselId && row.watchGroup === departedPeopleDialog.watchGroup)
        .map((row) => row.personId),
      ...allPlanningCrewEvents
        .filter((event) => event.vesselId === departedPeopleDialog.vesselId && event.board === departedPeopleDialog.watchGroup && event.personId !== null)
        .map((event) => event.personId as number),
    ]);
  }, [allPlanningCrewEvents, departedPeopleDialog, overview.boardRows]);
  const conflictDatesByEvent = useMemo(() => getPlanningConflictDatesByEvent(overview), [overview]);
  const cutGridCellKeys = useMemo(
    () => new Set(gridClipboard?.mode === 'cut' ? gridClipboard.cells.map((cell) => cell.key) : []),
    [gridClipboard],
  );
  const hrDocumentsByPerson = useMemo(() => {
    const indexed = new Map<number, PlanningHrDocumentRecord[]>();
    overview.hrDocuments.forEach((document) => {
      if (document.personId === null) return;
      indexed.set(document.personId, [...(indexed.get(document.personId) || []), document]);
    });
    return indexed;
  }, [overview.hrDocuments]);
  const planningControls = useMemo(() => buildPlanningControlCenter(overview, allPlanningCrewEvents), [allPlanningCrewEvents, overview]);
  const assignmentControls = useMemo(() => {
    const person = overview.people.find((item) => String(item.id) === assignmentForm.crewPersonId);
    const vessel = overview.vessels.find((item) => String(item.id) === assignmentForm.vesselId);
    if (!person || !vessel) return [];
    return evaluatePlanningAssignment(overview, {
      id: 'new-assignment',
      personId: person.id,
      person: formatPlanningPerson(person),
      vessel: vessel.name,
      functionLabel: assignmentForm.assignmentRole,
      status: assignmentForm.statusLabel,
      startsOn: assignmentForm.startsOn,
      endsOn: assignmentForm.endsOn,
      startsAt: assignmentForm.startsAt,
      endsAt: assignmentForm.endsAt,
    }, allPlanningCrewEvents);
  }, [allPlanningCrewEvents, assignmentForm, overview]);
  const selectedEventControls = useMemo(() => {
    if (!selectedEvent || !eventForm) return [];
    const vessel = overview.vessels.find((item) => String(item.id) === eventForm.vesselId);
    if (!vessel) return [];
    return evaluatePlanningAssignment(overview, {
      id: selectedEvent.id,
      personId: selectedEvent.personId,
      person: selectedEvent.person,
      vessel: vessel.name,
      functionLabel: eventForm.functionLabel,
      status: eventForm.statusLabel,
      startsOn: eventForm.startsOn,
      endsOn: eventForm.endsOn,
      startsAt: selectedEvent.kind === 'assignment' ? eventForm.startsAt : undefined,
      endsAt: selectedEvent.kind === 'assignment' ? eventForm.endsAt : undefined,
    }, allPlanningCrewEvents);
  }, [allPlanningCrewEvents, eventForm, overview, selectedEvent]);
  const watchGroupOptions = useMemo(
    () => uniqueSorted([
      'Affectation',
      'Armement',
      'Bordée 1',
      'Bordée 2',
      ...overview.assignments.map((assignment) => assignment.watchGroup),
      ...overview.periods.map((period) => period.watchGroup),
      ...overview.days.map((day) => day.watchGroup),
    ]),
    [overview.assignments, overview.days, overview.periods],
  );
  const vesselOptions = useMemo(
    () =>
      uniqueSorted([
        ...overview.vessels.map((vessel) => vessel.name),
        ...overview.periods.map((period) => period.vesselName),
        ...overview.assignments.map((assignment) => assignment.vesselName),
      ]),
    [overview],
  );
  const personOptions = useMemo(
    () => uniqueSorted(overview.people.map(formatPlanningPerson).concat(overview.periods.map((period) => period.crewName))),
    [overview.people, overview.periods],
  );
  const responsibleOptions = useMemo(
    () => uniqueSorted([
      ...overview.projects.map((project) => project.responsibleName),
      ...allPlanningCrewEvents.map((event) => event.responsible),
    ]),
    [allPlanningCrewEvents, overview.projects],
  );
  const statusOptions = useMemo(
    () => perspective === 'fleet'
      ? uniqueSorted([...PROJECT_STATUSES, ...overview.projects.map((project) => project.status)])
      : uniqueSorted([...PLANNING_STATUSES, 'provisional', 'confirmed', 'cancelled']),
    [overview.projects, perspective],
  );

  const tabCounts: Record<SideTab, number> = {
    conflicts: planningControls.filter((control) => control.level !== 'information').length,
    handovers: overview.handovers.filter((handover) => handover.status !== 'cancelled').length,
    history: overview.history.length,
    certificates: certificateAlerts.filter((alert) => alert.tone === 'danger').length || certificateAlerts.length,
    unassigned: unassignedPeople.length,
    billing: unbilledProjects.length,
    alerts: hrAlerts.length,
  };

  async function handlePublishPlanning(): Promise<void> {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const release = await publishPlanningRelease(effectiveClient);
      await loadPlanning();
      setStatusMessage(`Planning diffusé en version ${release.versionNumber}.`);
    } catch (error) {
      setErrorMessage(planningErrorMessage(error, 'Impossible de diffuser le planning.'));
    } finally {
      setIsSaving(false);
    }
  }

  function openP12(options: Partial<typeof p12Launch> = {}) {
    setP12Launch({
      tab: options.tab || 'conflicts',
      absenceId: options.absenceId ?? null,
      openAbsenceForm: options.openAbsenceForm ?? false,
      requestedOnly: options.requestedOnly ?? false,
    });
    setIsP12Open(true);
  }

  function openOperationalTab(tab: SideTab) {
    setSideTab(tab);
    setIsOperationalPanelOpen(true);
  }

  function changePerspective(next: PlanningPerspective) {
    setPerspective(next);
    setFilters((current) => ({
      ...current,
      personName: next === 'fleet' ? '' : current.personName,
      eventType: '',
      status: '',
      responsible: '',
    }));
    setIsOperationalPanelOpen(false);
  }

  async function assignPersonByDrop(personId: number, lane: PlanningFleetLane, watchGroup: string) {
    if (!canEditPlanning || lane.vesselId === null) {
      setErrorMessage('Votre rôle dispose d’un accès en lecture seule ou ce navire ne peut pas recevoir une affectation.');
      return;
    }
    const person = activePeople.find((item) => item.id === personId);
    if (!person) {
      setErrorMessage("Ce marin n'est plus disponible. Actualisez le planning.");
      return;
    }
    const input: AssignmentFormState = {
      ...EMPTY_ASSIGNMENT,
      vesselId: String(lane.vesselId),
      crewPersonId: String(person.id),
      startsOn: range.start,
      endsOn: range.end,
      startsAt: localDateTime(range.start, '08:00'),
      endsAt: localDateTime(range.end, '20:00'),
      assignmentRole: person.functionLabel || 'Équipage',
      confirmationStatus: 'provisional',
      watchGroup,
    };
    const controls = evaluatePlanningAssignment(overview, {
      id: 'drop-assignment',
      personId: person.id,
      person: formatPlanningPerson(person),
      vessel: lane.vessel,
      functionLabel: input.assignmentRole,
      status: input.statusLabel,
      startsOn: range.start,
      endsOn: range.end,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    }, allPlanningCrewEvents);
    if (hasBlockingPlanningControls(controls)) {
      setErrorMessage(blockingControlMessage(controls));
      return;
    }

    setPendingMutationId(`person-${person.id}`);
    setErrorMessage(null);
    try {
      const row = await createPlanningAssignment(effectiveClient, input);
      const [assignment] = mapPlanningAssignmentRows([row], overview.people, overview.vessels);
      updateOverview((current) => ({ ...current, assignments: [...current.assignments, assignment] }));
      setStatusMessage(`${formatPlanningPerson(person)} est affecté provisoirement à ${lane.label}, ${watchGroup}, du ${formatPlanningDate(range.start)} au ${formatPlanningDate(range.end)}.`);
    } catch (error) {
      setErrorMessage(planningErrorMessage(error, "Impossible d'affecter ce marin par glisser-déposer."));
    } finally {
      setPendingMutationId(null);
    }
  }

  function openDayState(event: PlanningCrewEvent, date: string | null) {
    const status = (date ? event.dailyStatuses?.[date] : event.status) || 'En Mer';
    const allowedStatus = ['En Mer', 'A Terre', 'Vacance', 'Repos'].includes(status) ? status as PlanningDayStateForm['status'] : 'En Mer';
    setDayStateForm({ event, date, selectedDate: date || event.startsOn, status: allowedStatus, note: date ? event.dailyNotes?.[date] || '' : event.comments || '' });
  }

  async function saveDayState(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dayStateForm?.event.assignmentId) return;
    const dates: string[] = [];
    if (dayStateForm.date) dates.push(dayStateForm.date);
    else {
      for (let date = dayStateForm.event.startsOn; date <= dayStateForm.event.endsOn; date = addPlanningDays(date, 1)) dates.push(date);
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await Promise.all(dates.map((date) => savePlanningAssignmentDayState(effectiveClient, {
        assignmentId: dayStateForm.event.assignmentId!,
        workDate: date,
        status: dayStateForm.status,
        note: dayStateForm.note,
      })));
      const daysData = await fetchPlanningDays(effectiveClient);
      updateOverview((current) => ({ ...current, days: daysData }));
      const displayStatus = planningStatusDisplayLabel(dayStateForm.status);
      setStatusMessage(`${displayStatus} ${displayStatus === 'Vacances' ? 'enregistrées' : 'enregistré'} pour ${dayStateForm.event.person}${dayStateForm.date ? ` le ${formatPlanningDate(dayStateForm.date)}` : ' sur toute la période'}.`);
      setDayStateForm(null);
    } catch (error) {
      setErrorMessage(planningErrorMessage(error, 'Impossible d’enregistrer le statut et le commentaire.'));
    } finally {
      setIsSaving(false);
    }
  }

  async function refreshPlanningGridData(cells: PlanningGridCell[] = []): Promise<PlanningGridCell[]> {
    const [assignmentRows, planningDays, history] = await Promise.all([
      fetchPlanningAssignmentOverviewRows(effectiveClient),
      fetchPlanningDays(effectiveClient),
      fetchPlanningHistory(effectiveClient),
    ]);
    const assignments = mapPlanningAssignmentOverviewRows(assignmentRows);
    updateOverview((current) => ({ ...current, assignments, days: planningDays, history }));
    return hydratePlanningGridCells(cells, assignments);
  }

  async function persistPlanningGridCells(cells: PlanningGridCell[], message: string): Promise<boolean> {
    if (!cells.length || !canEditPlanning) return false;
    setIsSaving(true);
    setPendingMutationId('planning-grid');
    setErrorMessage(null);
    try {
      await applyPlanningGridCells(effectiveClient, planningGridMutationCells(cells));
      const hydrated = await refreshPlanningGridData(cells);
      setSelectedGridCells(new Map(hydrated.map((cell) => [cell.key, cell])));
      setStatusMessage(message);
      return true;
    } catch (error) {
      setErrorMessage(planningErrorMessage(error, "Impossible d'enregistrer la sélection dans le planning."));
      return false;
    } finally {
      setIsSaving(false);
      setPendingMutationId(null);
    }
  }

  function openPlanningGridConflict(cell: PlanningGridCell) {
    const events = allPlanningCrewEvents.filter((event) => (
      event.personId === cell.personId
      && event.startsOn <= cell.workDate
      && event.endsOn >= cell.workDate
      && conflictDatesByEvent.get(event.id)?.has(cell.workDate)
    ));
    if (events.length < 2) {
      setErrorMessage("Ce conflit n'est plus présent. Actualisez le planning.");
      return;
    }
    setSelectedGridCells(new Map([[cell.key, cell]]));
    setGridConflictForm({ cell, events });
  }

  function selectPlanningGridCell(cell: PlanningGridCell, event: React.MouseEvent<HTMLButtonElement>): boolean {
    if (!canEditPlanning || isSaving) return false;
    if (event.ctrlKey || event.metaKey) {
      setSelectedGridCells((current) => {
        const next = new Map(current);
        if (next.has(cell.key)) next.delete(cell.key);
        else next.set(cell.key, cell);
        return next;
      });
      return true;
    }
    if (gridClipboard) {
      setSelectedGridCells(new Map([[cell.key, cell]]));
      setStatusMessage("Destination sélectionnée. Utilisez Ctrl+V pour coller.");
      return true;
    }
    return false;
  }

  async function colorPlanningGridCell(cell: PlanningGridCell) {
    if (!canEditPlanning || isSaving || cell.isConflict) return;
    const coloredCell = { ...cell, status: planningGridDefaultStatus(cell.vessel) };
    setSelectedGridCells(new Map([[coloredCell.key, coloredCell]]));
    const saved = await persistPlanningGridCells([coloredCell], '1 case enregistrée.');
    if (!saved) setSelectedGridCells(new Map());
  }

  function beginCalendarPan(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('.planning-day-cell, .planning-assignment-note-cell, .planning-day-heading, .planning-month-segment, .planning-week-segment')) return;

    const scroller = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const startScrollLeft = scroller.scrollLeft;
    const startScrollTop = scroller.scrollTop;
    let moved = false;

    calendarPanCleanupRef.current?.();
    suppressCalendarClickRef.current = false;
    setIsCalendarPanning(true);

    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
      if (calendarPanCleanupRef.current === cleanup) calendarPanCleanupRef.current = null;
    };
    const move = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      const deltaX = pointerEvent.clientX - startX;
      const deltaY = pointerEvent.clientY - startY;
      if (!moved && Math.hypot(deltaX, deltaY) < 4) return;
      moved = true;
      pointerEvent.preventDefault();
      scroller.scrollLeft = startScrollLeft - deltaX;
      scroller.scrollTop = startScrollTop - deltaY;
    };
    const finish = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      cleanup();
      setIsCalendarPanning(false);
      if (!moved) return;
      suppressCalendarClickRef.current = true;
      if (suppressCalendarClickTimeoutRef.current !== null) window.clearTimeout(suppressCalendarClickTimeoutRef.current);
      suppressCalendarClickTimeoutRef.current = window.setTimeout(() => {
        suppressCalendarClickRef.current = false;
        suppressCalendarClickTimeoutRef.current = null;
      }, 0);
    };
    const cancel = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      cleanup();
      setIsCalendarPanning(false);
    };

    calendarPanCleanupRef.current = cleanup;
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
  }

  function suppressCalendarClickAfterPan(event: React.MouseEvent<HTMLDivElement>) {
    if (!suppressCalendarClickRef.current) return;
    suppressCalendarClickRef.current = false;
    if (suppressCalendarClickTimeoutRef.current !== null) {
      window.clearTimeout(suppressCalendarClickTimeoutRef.current);
      suppressCalendarClickTimeoutRef.current = null;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  async function deleteSelectedPlanningGridCells(reason = 'Suppression manuelle depuis la grille') {
    const cells = [...selectedGridCells.values()].filter((cell) => cell.assignmentId !== null);
    if (!cells.length) {
      setErrorMessage('Aucune case enregistrée ne peut être supprimée dans cette sélection.');
      return;
    }
    if (!window.confirm(`Supprimer ${cells.length} case${cells.length > 1 ? 's' : ''} ? Les périodes adjacentes seront conservées et cette action sera historisée.`)) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await removePlanningGridCells(effectiveClient, planningGridMutationCells(cells), reason);
      await refreshPlanningGridData();
      setSelectedGridCells(new Map());
      setGridClipboard((current) => current?.mode === 'cut' ? null : current);
      setStatusMessage(`${cells.length} case${cells.length > 1 ? 's supprimées' : ' supprimée'} ; la modification est historisée.`);
    } catch (error) {
      setErrorMessage(planningErrorMessage(error, 'Impossible de supprimer les cases sélectionnées.'));
    } finally {
      setIsSaving(false);
    }
  }

  async function pastePlanningGridClipboard() {
    if (!gridClipboard || !selectedGridCells.size) {
      setErrorMessage("Copiez ou coupez des cases, puis sélectionnez la case d'arrivée.");
      return;
    }
    const targets = buildPlanningGridPaste(gridClipboard.cells, [...selectedGridCells.values()]);
    if (!targets.length) {
      setErrorMessage("La destination doit appartenir à une seule ligne marin/navire.");
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      if (gridClipboard.mode === 'cut') {
        const targetKeys = new Set(targets.map((cell) => cell.key));
        const sources = gridClipboard.cells.filter((cell) => cell.assignmentId !== null && !targetKeys.has(cell.key));
        if (sources.length) {
          await movePlanningGridCells(
            effectiveClient,
            planningGridMutationCells(sources),
            planningGridMutationCells(targets),
            'Déplacement par couper-coller depuis la grille',
          );
        } else {
          await applyPlanningGridCells(effectiveClient, planningGridMutationCells(targets));
        }
      } else {
        await applyPlanningGridCells(effectiveClient, planningGridMutationCells(targets));
      }
      const hydrated = await refreshPlanningGridData(targets);
      setSelectedGridCells(new Map(hydrated.map((cell) => [cell.key, cell])));
      setGridClipboard(null);
      setStatusMessage(`${targets.length} case${targets.length > 1 ? 's' : ''} ${gridClipboard.mode === 'cut' ? 'déplacée' : 'copiée'}${targets.length > 1 ? 's' : ''}.`);
    } catch (error) {
      setErrorMessage(planningErrorMessage(error, `Impossible de ${gridClipboard.mode === 'cut' ? 'déplacer' : 'copier'} les cases.`));
    } finally {
      setIsSaving(false);
    }
  }

  async function resolvePlanningGridConflict(priority: PlanningCrewEvent) {
    if (!gridConflictForm) return;
    const removals = new Map<string, PlanningGridCell>();
    gridConflictForm.events.filter((event) => event.id !== priority.id).forEach((event) => {
      if (event.personId === null || event.vesselId === null) return;
      const startsOn = event.startsOn > priority.startsOn ? event.startsOn : priority.startsOn;
      const endsOn = event.endsOn < priority.endsOn ? event.endsOn : priority.endsOn;
      for (let date = startsOn; date <= endsOn; date = addPlanningDays(date, 1)) {
        const laneKey = `${event.vesselId}-${event.board}-${event.personId}`;
        const cell: PlanningGridCell = {
          key: planningGridCellKey(laneKey, date), laneKey, workDate: date,
          personId: event.personId, person: event.person, vesselId: event.vesselId,
          vessel: event.vessel, watchGroup: event.board, functionLabel: event.functionLabel,
          assignmentId: event.assignmentId || null, eventId: event.id,
          status: planningGridDefaultStatus(event.vessel), note: event.dailyNotes?.[date] || '', isConflict: true,
        };
        removals.set(`${event.id}:${date}`, cell);
      }
    });
    const cells = [...removals.values()];
    if (!cells.length) return;
    if (!window.confirm(`Conserver ${priority.vessel} / ${priority.board} comme ligne prioritaire et supprimer uniquement ${cells.length} case${cells.length > 1 ? 's' : ''} en chevauchement sur les autres lignes ?`)) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await resolvePlanningGridConflictCells(
        effectiveClient,
        planningGridConflictMutationCells(cells),
        `Résolution de conflit : priorité à ${priority.vessel} / ${priority.board}`,
      );
      await refreshPlanningGridData();
      setGridConflictForm(null);
      setSelectedGridCells(new Map());
      setStatusMessage('Chevauchement supprimé. La ligne prioritaire est conservée et la résolution est historisée.');
    } catch (error) {
      setErrorMessage(planningErrorMessage(error, 'Impossible de résoudre ce conflit.'));
    } finally {
      setIsSaving(false);
    }
  }

  function openVesselEditor(lane: PlanningFleetLane) {
    const vessel = overview.vessels.find((item) => item.id === lane.vesselId);
    if (!vessel) {
      setErrorMessage('La fiche de ce navire est indisponible. Actualisez le planning.');
      return;
    }
    setVesselForm({ id: vessel.id, name: vessel.name, acronym: vessel.acronym });
  }

  async function saveVesselEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!vesselForm || !permissions.canManageVessels) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const vessel = await updatePlanningVessel(effectiveClient, vesselForm);
      updateOverview((current) => ({ ...current, vessels: current.vessels.map((item) => item.id === vessel.id ? vessel : item) }));
      setVesselForm(null);
      setStatusMessage(`Fiche de ${vessel.name} mise à jour.`);
    } catch (error) {
      setErrorMessage(planningErrorMessage(error, 'Impossible de modifier ce navire.'));
    } finally {
      setIsSaving(false);
    }
  }

  async function openNewBoard(lane: PlanningFleetLane) {
    if (lane.vesselId === null) return;
    const boardNumbers = fleetRows
      .filter((row) => row.type === 'board' && row.vesselId === lane.vesselId)
      .map((row) => Number(row.board.match(/\d+/)?.[0] || 0));
    const watchGroup = `Bordée ${Math.max(0, ...boardNumbers) + 1}`;
    setErrorMessage(null);
    try {
      const matrices = await fetchPlanningManningMatrices(effectiveClient);
      const matrix = matrices.find((item) => item.vesselId === lane.vesselId && item.status === 'active')
        || matrices.find((item) => item.vesselId === lane.vesselId);
      if (!matrix?.requirements.length) {
        setErrorMessage(`Configurez d’abord une Décision d’effectif pour ${lane.label}.`);
        return;
      }
      const available = activePeople.filter((person) => !overview.assignments.some((assignment) =>
        assignment.crewPersonId === person.id
        && assignment.confirmationStatus !== 'cancelled'
        && assignment.startsOn <= range.end
        && assignment.endsOn >= range.start));
      const positions = matrix.requirements.flatMap((requirement) => Array.from(
        { length: Math.max(1, requirement.minimumCount) },
        (_, index): PlanningBoardPositionForm => ({
          key: `${requirement.id || requirement.displayOrder}-${index}`,
          requirement,
          personId: '',
          candidates: available.filter((person) => !missingManningRequirementTerms(overview, person.id, requirement, range.end).length),
        }),
      ));
      setBoardForm({ vesselId: lane.vesselId, vesselName: lane.label, watchGroup, startsOn: range.start, endsOn: range.end, positions });
    } catch (error) {
      setErrorMessage(planningErrorMessage(error, 'Impossible de préparer cette bordée.'));
    }
  }

  async function saveNewBoard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!boardForm) return;
    const positions = boardForm.positions.filter((position) => position.personId).map((position) => ({
      personId: Number(position.personId),
      functionLabel: position.requirement.functionLabel,
    }));
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await createPlanningBoardAssignments(effectiveClient, { ...boardForm, positions });
      await handleP11OperationalChange('assignments');
      setStatusMessage(`${boardForm.watchGroup} créée pour ${boardForm.vesselName} avec ${positions.length} marin(s).`);
      setBoardForm(null);
    } catch (error) {
      setErrorMessage(planningErrorMessage(error, 'Impossible de créer cette bordée.'));
    } finally {
      setIsSaving(false);
    }
  }

  function openBoardAssignment(vesselId: number | null, watchGroup: string) {
    if (vesselId === null) return;
    const vessel = overview.vessels.find((item) => item.id === vesselId);
    if (!vessel) {
      setErrorMessage('Ce navire est indisponible. Actualisez le planning.');
      return;
    }
    setDepartedPeopleDialog({ vesselId, vesselName: vessel.name, watchGroup });
  }

  async function addDepartedPersonToBoard(person: PlanningPerson) {
    if (!departedPeopleDialog) return;
    setIsSaving(true);
    setPendingMutationId(`departed-person-${person.id}`);
    setErrorMessage(null);
    try {
      await addPlanningBoardRow(effectiveClient, {
        vesselId: departedPeopleDialog.vesselId,
        watchGroup: departedPeopleDialog.watchGroup,
        personId: person.id,
      });
      await loadPlanning();
      setDepartedPeopleDialog(null);
      setStatusMessage(`${formatPlanningPerson(person)} a été ajouté comme ligne vide à ${departedPeopleDialog.watchGroup}.`);
    } catch (error) {
      setErrorMessage(planningErrorMessage(error, 'Impossible d’ajouter ce marin à la bordée.'));
    } finally {
      setPendingMutationId(null);
      setIsSaving(false);
    }
  }

  async function removeEmptyBoardRow(rowId: number, personName: string) {
    if (!window.confirm(`Supprimer la ligne vide de ${personName} ?`)) return;
    setIsSaving(true);
    setPendingMutationId(`board-row-${rowId}`);
    setErrorMessage(null);
    try {
      await deletePlanningBoardRow(effectiveClient, rowId);
      await loadPlanning();
      setStatusMessage(`La ligne vide de ${personName} a été supprimée.`);
    } catch (error) {
      setErrorMessage(planningErrorMessage(error, 'Impossible de supprimer cette ligne vide.'));
    } finally {
      setPendingMutationId(null);
      setIsSaving(false);
    }
  }

  function openCrewList() {
    const vesselId = activeVessels.find((vessel) => availablePlanningCrewListBoards(overview, vessel.id, anchorDate).length)?.id;
    const boards = vesselId ? availablePlanningCrewListBoards(overview, vesselId, anchorDate) : [];
    setCrewListForm({ vesselId: vesselId ? String(vesselId) : '', date: anchorDate, watchGroup: boards.length === 1 ? boards[0] : '', format: 'xlsx' });
    setIsCrewListOpen(true);
  }

  function changeCrewListDate(date: string) {
    setCrewListForm((current) => {
      const eligibleVessels = activeVessels.filter((vessel) => availablePlanningCrewListBoards(overview, vessel.id, date).length > 0);
      const currentVesselId = Number(current.vesselId);
      const vesselId = eligibleVessels.some((vessel) => vessel.id === currentVesselId) ? currentVesselId : eligibleVessels[0]?.id;
      const boards = vesselId ? availablePlanningCrewListBoards(overview, vesselId, date) : [];
      return { ...current, date, vesselId: vesselId ? String(vesselId) : '', watchGroup: boards.length === 1 ? boards[0] : '' };
    });
  }

  async function handleGenerateCrewList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const document = buildPlanningCrewList(overview, {
        vesselId: Number(crewListForm.vesselId),
        date: crewListForm.date,
        watchGroup: crewListForm.watchGroup,
      });
      const generated = await generatePlanningCrewList(document, crewListForm.format);
      const url = URL.createObjectURL(generated.blob);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = generated.fileName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setStatusMessage(`Crew list ${crewListForm.format.toUpperCase()} générée pour ${document.vesselName}.` + (document.incompleteProfiles.length ? ` ${document.incompleteProfiles.length} profil(s) incomplet(s) : les champs absents restent vides.` : ''));
      setIsCrewListOpen(false);
    } catch (error) {
      setErrorMessage(planningErrorMessage(error, 'Impossible de générer la crew list.'));
    } finally {
      setIsSaving(false);
    }
  }

  function beginTouchPersonDrag(event: React.PointerEvent<HTMLElement>, person: PlanningPerson) {
    if (event.pointerType === 'mouse' || !canEditPlanning) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setTouchPersonDrag({ person, x: event.clientX, y: event.clientY });
  }

  function moveTouchPersonDrag(event: React.PointerEvent<HTMLElement>) {
    if (!touchPersonDrag) return;
    event.preventDefault();
    setTouchPersonDrag((current) => current ? { ...current, x: event.clientX, y: event.clientY } : null);
    const dropElement = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-planning-person-drop-vessel-id]');
    const vesselId = Number(dropElement?.dataset.planningPersonDropVesselId);
    const watchGroup = dropElement?.dataset.planningPersonDropWatchGroup || '';
    const target = Number.isSafeInteger(vesselId) && vesselId > 0 && watchGroup ? { vesselId, watchGroup } : null;
    touchDropTargetRef.current = target;
    setTouchDropTarget(target);
  }

  function endTouchPersonDrag(event: React.PointerEvent<HTMLElement>) {
    if (!touchPersonDrag) return;
    event.preventDefault();
    const target = touchDropTargetRef.current;
    const personId = touchPersonDrag.person.id;
    setTouchPersonDrag(null);
    setTouchDropTarget(null);
    touchDropTargetRef.current = null;
    if (!target) return;
    const lane = fleetLanes.find((item) => item.vesselId === target.vesselId);
    if (lane) void assignPersonByDrop(personId, lane, target.watchGroup);
  }

  function cancelTouchPersonDrag() {
    setTouchPersonDrag(null);
    setTouchDropTarget(null);
    touchDropTargetRef.current = null;
  }

  function openAssignment(prefill?: Partial<AssignmentFormState>, quick = false) {
    if (!canEditPlanning) {
      setErrorMessage('Votre rôle dispose d’un accès en lecture seule.');
      return;
    }
    const defaultStart = range.start || anchorDate;
    const defaultEnd = addPlanningDays(defaultStart, 6);
    setAssignmentForm({
      ...EMPTY_ASSIGNMENT,
      startsOn: defaultStart,
      endsOn: defaultEnd,
      startsAt: localDateTime(defaultStart, '08:00'),
      endsAt: localDateTime(defaultEnd, '20:00'),
      ...prefill,
    });
    setIsAssignmentQuick(quick);
    setIsAssignmentOpen(true);
  }

  function openFleetEvent(lane?: PlanningFleetLane, date?: string, quick = false) {
    if (!canEditPlanning) {
      setErrorMessage('Votre rôle dispose d’un accès en lecture seule.');
      return;
    }
    const startsOn = date || range.start || anchorDate;
    setSelectedProject(null);
    setProjectForm({
      ...EMPTY_PROJECT_FORM,
      startsOn,
      endsOn: startsOn,
      vesselId: lane?.vesselId ? String(lane.vesselId) : '',
    });
    setIsProjectQuick(quick);
    setIsProjectOpen(true);
  }

  async function handleCreateAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditPlanning) {
      setErrorMessage('Votre rôle dispose d’un accès en lecture seule.');
      return;
    }
    if (hasBlockingPlanningControls(assignmentControls)) {
      setErrorMessage(blockingControlMessage(assignmentControls));
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const row = await createPlanningAssignment(effectiveClient, assignmentForm);
      const [assignment] = mapPlanningAssignmentRows([row], overview.people, overview.vessels);
      updateOverview((current) => ({ ...current, assignments: [...current.assignments, assignment] }));
      setStatusMessage(planningControlSaveMessage(assignmentControls, 'Affectation ajoutée au planning.'));
      setIsAssignmentOpen(false);
    } catch (error) {
      setErrorMessage(planningErrorMessage(error, "Impossible d'ajouter cette affectation."));
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await workspaceRef.current?.requestFullscreen();
    } catch {
      setErrorMessage("Le plein écran n'est pas disponible dans ce navigateur.");
    }
  }

  function duplicateSelectedEvent() {
    if (!selectedEvent) return;
    const vessel = activeVessels.find((item) => item.name === selectedEvent.vessel);
    const person = activePeople.find((item) => item.id === selectedEvent.personId || formatPlanningPerson(item) === selectedEvent.person);
    openAssignment({
      vesselId: vessel ? String(vessel.id) : '',
      crewPersonId: person ? String(person.id) : '',
      startsOn: selectedEvent.startsOn,
      endsOn: selectedEvent.endsOn,
      startsAt: selectedEvent.startsAt ? utcToPlanningLocalDateTime(selectedEvent.startsAt) : localDateTime(selectedEvent.startsOn, '08:00'),
      endsAt: selectedEvent.endsAt ? utcToPlanningLocalDateTime(selectedEvent.endsAt) : localDateTime(selectedEvent.endsOn, '20:00'),
      assignmentRole: selectedEvent.functionLabel || 'Équipage',
      statusLabel: selectedEvent.status,
      confirmationStatus: 'provisional',
      watchGroup: selectedEvent.board || 'Affectation',
      comments: selectedEvent.comments,
    });
    setSelectedEvent(null);
    setEventForm(null);
  }

  function duplicateSelectedProject() {
    if (!selectedProject) return;
    setProjectForm({
      title: `${selectedProject.title} (copie)`,
      startsOn: selectedProject.startsOn,
      endsOn: selectedProject.endsOn,
      status: 'A planifier',
      eventType: selectedProject.eventType,
      vesselId: String(selectedProject.primaryVesselId || ''),
      responsibleName: selectedProject.responsibleName,
      clientName: selectedProject.clientName,
      description: selectedProject.description,
    });
    setSelectedProject(null);
    setIsProjectQuick(false);
    setIsProjectOpen(true);
  }

  function openEvent(event: PlanningCrewEvent) {
    const vessel = activeVessels.find((item) => item.id === event.vesselId || item.name === event.vessel);
    setSelectedEvent(event);
    setSelectedTimelineId(event.id);
    setEventForm({
      vesselId: vessel ? String(vessel.id) : '', startsOn: event.startsOn, endsOn: event.endsOn,
      startsAt: event.startsAt ? utcToPlanningLocalDateTime(event.startsAt) : localDateTime(event.startsOn, '08:00'),
      endsAt: event.endsAt ? utcToPlanningLocalDateTime(event.endsAt) : localDateTime(event.endsOn, '20:00'),
      statusLabel: event.status, confirmationStatus: event.confirmationStatus,
      functionLabel: event.functionLabel, watchGroup: event.board, comments: event.comments,
    });
  }

  async function saveEvent(event: PlanningCrewEvent, form: EventFormState, closePanel = true) {
    if (!canEditPlanning) return setErrorMessage('Votre rôle dispose d’un accès en lecture seule.');
    const vessel = activeVessels.find((item) => String(item.id) === form.vesselId);
    if (!vessel) return setErrorMessage('Sélectionnez un navire actif.');
    if (vessel.name !== event.vessel && !window.confirm(`Déplacer ${event.person} de ${event.vessel} vers ${vessel.name} ?`)) return;
    const controls = evaluatePlanningAssignment(overview, {
      id: event.id,
      personId: event.personId,
      person: event.person,
      vessel: vessel.name,
      functionLabel: form.functionLabel,
      status: form.statusLabel,
      startsOn: form.startsOn,
      endsOn: form.endsOn,
      startsAt: event.kind === 'assignment' ? form.startsAt : undefined,
      endsAt: event.kind === 'assignment' ? form.endsAt : undefined,
    }, allPlanningCrewEvents);
    if (hasBlockingPlanningControls(controls)) {
      setErrorMessage(blockingControlMessage(controls));
      return;
    }
    const mutation = {
      vesselId: vessel.id,
      vesselName: vessel.name,
      startsOn: form.startsOn,
      endsOn: form.endsOn,
      startsAt: event.kind === 'assignment' ? form.startsAt : undefined,
      endsAt: event.kind === 'assignment' ? form.endsAt : undefined,
      statusLabel: form.statusLabel,
      confirmationStatus: form.confirmationStatus,
      functionLabel: form.functionLabel,
      watchGroup: form.watchGroup,
      comments: form.comments,
    };
    const previous = overview;
    updateOverview(patchPlanningEvent(previous, event, mutation));
    setPendingMutationId(event.id);
    setIsSaving(true); setErrorMessage(null);
    try {
      await updatePlanningEvent(effectiveClient, {
        id: Number(event.id.split('-').pop()), kind: event.kind, vesselId: vessel.id, vesselName: vessel.name,
        startsOn: form.startsOn, endsOn: form.endsOn, statusLabel: form.statusLabel,
        startsAt: event.kind === 'assignment' ? form.startsAt : undefined,
        endsAt: event.kind === 'assignment' ? form.endsAt : undefined,
        confirmationStatus: form.confirmationStatus,
        functionLabel: form.functionLabel, watchGroup: form.watchGroup, comments: form.comments,
      });
      setStatusMessage(planningControlSaveMessage(controls, 'Planning mis à jour sans rechargement.'));
      if (closePanel) { setSelectedEvent(null); setEventForm(null); }
    } catch (error) {
      updateOverview(previous);
      setErrorMessage(`${planningErrorMessage(error, 'Impossible de modifier cette période.')} La modification visuelle a été annulée.`);
    } finally { setIsSaving(false); setPendingMutationId(null); }
  }

  async function removeEvent(event: PlanningCrewEvent) {
    if (!canEditPlanning) return setErrorMessage('Votre rôle dispose d’un accès en lecture seule.');
    if (event.kind === 'assignment') {
      if (!eventForm || !window.confirm('Annuler cette affectation ? Elle restera visible et historisée.')) return;
      await saveEvent(event, { ...eventForm, confirmationStatus: 'cancelled' });
      return;
    }
    if (!window.confirm('Supprimer cette donnée importée du planning ?')) return;
    const previous = overview;
    updateOverview(removePlanningEvent(previous, event));
    setPendingMutationId(event.id);
    setIsSaving(true);
    try {
      await deletePlanningEvent(effectiveClient, { id: Number(event.id.split('-').pop()), kind: event.kind });
      setSelectedEvent(null); setEventForm(null); setStatusMessage('Période supprimée sans rechargement.');
    } catch (error) {
      updateOverview(previous);
      setErrorMessage(`${planningErrorMessage(error, 'Impossible de supprimer cette période.')} La ligne a été restaurée.`);
    } finally { setIsSaving(false); setPendingMutationId(null); }
  }

  async function moveEvent(event: PlanningCrewEvent, startsOn: string) {
    const vessel = activeVessels.find((item) => item.id === event.vesselId || item.name === event.vessel);
    if (!vessel) return setErrorMessage('Ce navire ne peut pas recevoir une affectation.');
    const endsOn = addPlanningDays(startsOn, daysBetween(event.startsOn, event.endsOn));
    const form: EventFormState = {
      vesselId: String(vessel.id), startsOn, endsOn, statusLabel: event.status,
      startsAt: event.startsAt ? localDateTime(startsOn, utcToPlanningLocalDateTime(event.startsAt).slice(11)) : localDateTime(startsOn, '08:00'),
      endsAt: event.endsAt ? localDateTime(endsOn, utcToPlanningLocalDateTime(event.endsAt).slice(11)) : localDateTime(endsOn, '20:00'),
      confirmationStatus: event.confirmationStatus,
      functionLabel: event.functionLabel, watchGroup: event.board, comments: event.comments,
    };
    await saveEvent(event, form);
  }

  async function resizeEvent(event: PlanningCrewEvent, edge: 'start' | 'end', delta: number) {
    if (!delta) return;
    const startsOn = edge === 'start' ? addPlanningDays(event.startsOn, delta) : event.startsOn;
    const endsOn = edge === 'end' ? addPlanningDays(event.endsOn, delta) : event.endsOn;
    if (endsOn < startsOn) return setErrorMessage('Une période doit durer au moins un jour.');
    const vessel = activeVessels.find((item) => item.id === event.vesselId || item.name === event.vessel);
    if (!vessel) return;
    await saveEvent(event, {
      vesselId: String(vessel.id), startsOn, endsOn,
      startsAt: event.startsAt ? localDateTime(startsOn, utcToPlanningLocalDateTime(event.startsAt).slice(11)) : localDateTime(startsOn, '08:00'),
      endsAt: event.endsAt ? localDateTime(endsOn, utcToPlanningLocalDateTime(event.endsAt).slice(11)) : localDateTime(endsOn, '20:00'),
      statusLabel: event.status, confirmationStatus: event.confirmationStatus,
      functionLabel: event.functionLabel, watchGroup: event.board, comments: event.comments,
    }, false);
  }

  function openProjectEditor(project: PlanningProjectRecord) {
    setSelectedTimelineId(`project-${project.id}`);
    setSelectedProject(project);
    setProjectForm({
      title: project.title,
      startsOn: project.startsOn,
      endsOn: project.endsOn,
      status: project.status,
      eventType: project.eventType,
      vesselId: String(project.primaryVesselId || ''),
      responsibleName: project.responsibleName,
      clientName: project.clientName,
      description: project.description,
    });
    setIsProjectQuick(false);
    setIsProjectOpen(true);
  }

  async function moveProject(projectId: number, lane: PlanningFleetLane, startsOn: string) {
    const project = overview.projects.find((item) => item.id === projectId);
    const vessel = activeVessels.find((item) => item.id === lane.vesselId);
    if (!project || !vessel) return setErrorMessage('Cet événement ou ce navire ne peut pas être modifié.');
    if (project.primaryVesselId !== vessel.id && !window.confirm(`Déplacer ${project.title} vers ${vessel.name} ?`)) return;
    const optimistic = {
      ...project,
      startsOn,
      endsOn: addPlanningDays(startsOn, daysBetween(project.startsOn, project.endsOn)),
      primaryVesselId: vessel.id,
      primaryVesselName: vessel.name,
    };
    const previous = overview;
    updateOverview(replacePlanningProject(previous, optimistic));
    setPendingMutationId(`project-${project.id}`);
    try {
      const saved = await updatePlanningProject(effectiveClient, {
        id: project.id,
        title: optimistic.title,
        startsOn: optimistic.startsOn,
        endsOn: optimistic.endsOn,
        status: optimistic.status,
        eventType: optimistic.eventType,
        vesselId: vessel.id,
        vesselName: vessel.name,
        responsibleName: optimistic.responsibleName,
        clientName: optimistic.clientName,
        description: optimistic.description,
      });
      updateOverview((current) => replacePlanningProject(current, saved));
      setStatusMessage('Événement flotte déplacé sans rechargement.');
    } catch (error) {
      updateOverview(previous);
      setErrorMessage(`${planningErrorMessage(error, 'Impossible de déplacer cet événement.')} Sa position a été restaurée.`);
    } finally { setPendingMutationId(null); }
  }

  async function resizeProject(project: PlanningProjectRecord, edge: 'start' | 'end', delta: number) {
    if (!delta) return;
    const startsOn = edge === 'start' ? addPlanningDays(project.startsOn, delta) : project.startsOn;
    const endsOn = edge === 'end' ? addPlanningDays(project.endsOn, delta) : project.endsOn;
    if (endsOn < startsOn) return setErrorMessage('Un événement doit durer au moins un jour.');
    const vessel = activeVessels.find((item) => item.id === project.primaryVesselId || item.name === project.primaryVesselName);
    if (!vessel) return setErrorMessage('Ce navire ne peut pas recevoir cet événement.');
    const optimistic = { ...project, startsOn, endsOn };
    const previous = overview;
    updateOverview(replacePlanningProject(previous, optimistic));
    setPendingMutationId(`project-${project.id}`);
    try {
      const saved = await updatePlanningProject(effectiveClient, {
        id: project.id,
        title: optimistic.title,
        startsOn,
        endsOn,
        status: optimistic.status,
        eventType: optimistic.eventType,
        vesselId: vessel.id,
        vesselName: vessel.name,
        responsibleName: optimistic.responsibleName,
        clientName: optimistic.clientName,
        description: optimistic.description,
      });
      updateOverview((current) => replacePlanningProject(current, saved));
      setStatusMessage('Durée de l’événement mise à jour sans rechargement.');
    } catch (error) {
      updateOverview(previous);
      setErrorMessage(`${planningErrorMessage(error, 'Impossible de redimensionner cet événement.')} Sa durée a été restaurée.`);
    } finally { setPendingMutationId(null); }
  }

  async function addVessel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setIsSaving(true);
    try { await createVessel(effectiveClient, newVessel); await loadPlanning(); setNewVessel({ name: '', acronym: '' }); setStatusMessage('Navire ajouté.'); }
    catch (error) { setErrorMessage(planningErrorMessage(error, "Impossible d'ajouter ce navire.")); } finally { setIsSaving(false); }
  }

  async function archiveVessel(vessel: PlanningVessel) {
    if (!window.confirm(`Retirer ${vessel.name} du planning ?`)) return;
    try { await archivePlanningVessel(effectiveClient, vessel.id); await loadPlanning(); setStatusMessage('Navire retiré du planning.'); }
    catch (error) { setErrorMessage(planningErrorMessage(error, 'Impossible de retirer ce navire.')); }
  }

  async function saveProject(form: ProjectFormState) {
    if (!canEditPlanning) return setErrorMessage('Votre rôle dispose d’un accès en lecture seule.');
    const vessel = activeVessels.find((item) => String(item.id) === form.vesselId);
    if (!vessel) return setErrorMessage('Sélectionnez un navire actif.');
    if (selectedProject && selectedProject.primaryVesselId !== vessel.id && !window.confirm(`Déplacer ${selectedProject.title} vers ${vessel.name} ?`)) return;
    setIsSaving(true);
    try {
      const input = { ...form, vesselId: vessel.id, vesselName: vessel.name };
      const saved = selectedProject
        ? await updatePlanningProject(effectiveClient, { ...input, id: selectedProject.id })
        : await createPlanningProject(effectiveClient, input);
      updateOverview((current) => replacePlanningProject(current, saved));
      setSelectedProject(null); setIsProjectOpen(false);
      setStatusMessage(selectedProject ? 'Événement flotte mis à jour sans rechargement.' : 'Événement flotte créé.');
    } catch (error) { setErrorMessage(planningErrorMessage(error, 'Impossible d’enregistrer cet événement flotte.')); } finally { setIsSaving(false); }
  }

  async function cancelProject() {
    if (!selectedProject || !window.confirm(`Annuler ${selectedProject.title} ? L’événement restera visible dans le planning.`)) return;
    await saveProject({ ...projectForm, status: 'Annulé' });
  }

  function openAssignmentById(assignmentId: number) {
    const event = allPlanningCrewEvents.find((item) => item.id === `assignment-${assignmentId}`);
    if (event) openEvent(event);
  }

  function openHandover(handover: PlanningHandoverRecord | null = null) {
    if (!permissions.canManageHandovers && handover === null) {
      setErrorMessage('Vous n’êtes pas autorisé à créer une relève sur cette période.');
      return;
    }
    setSelectedHandover(handover);
    setIsHandoverOpen(true);
  }

  async function handleSaveHandover(input: SavePlanningHandoverInput) {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await savePlanningHandover(effectiveClient, input);
      const handovers = await fetchPlanningHandovers(effectiveClient);
      updateOverview((current) => ({ ...current, handovers }));
      setIsHandoverOpen(false);
      setSelectedHandover(null);
      setStatusMessage('Relève enregistrée et bordées comparées.');
    } catch (error) {
      setErrorMessage(planningErrorMessage(error, 'Impossible d’enregistrer cette relève.'));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleP11OperationalChange(kind: 'assignments' | 'projects' | 'handovers') {
    if (kind === 'assignments') {
      const rows = await fetchPlanningAssignmentOverviewRows(effectiveClient);
      updateOverview((current) => ({ ...current, assignments: mapPlanningAssignmentOverviewRows(rows) }));
      return;
    }
    if (kind === 'projects') {
      const projects = await fetchPlanningProjects(effectiveClient);
      updateOverview((current) => ({ ...current, projects }));
      return;
    }
    const handovers = await fetchPlanningHandovers(effectiveClient);
    updateOverview((current) => ({ ...current, handovers }));
  }

  async function handleP12AuditChange() {
    const [history] = await Promise.all([
      permissions.canViewHistory ? fetchPlanningHistory(effectiveClient) : Promise.resolve(overview.history),
      loadAbsences(),
    ]);
    if (permissions.canViewHistory) updateOverview((current) => ({ ...current, history }));
  }

  function prepareManualReplacement(person: PlanningPerson, conflict: PlanningDetectedConflict) {
    const sourceAssignment = conflict.assignmentId
      ? overview.assignments.find((assignment) => assignment.id === conflict.assignmentId)
      : null;
    setIsP12Open(false);
    openAssignment({
      vesselId: conflict.vesselId ? String(conflict.vesselId) : '',
      crewPersonId: String(person.id),
      startsOn: conflict.startsOn,
      endsOn: conflict.endsOn,
      startsAt: sourceAssignment?.startsAt
        ? utcToPlanningLocalDateTime(sourceAssignment.startsAt)
        : localDateTime(conflict.startsOn, '08:00'),
      endsAt: sourceAssignment?.endsAt
        ? utcToPlanningLocalDateTime(sourceAssignment.endsAt)
        : localDateTime(conflict.endsOn, '20:00'),
      assignmentRole: conflict.functionLabel || person.functionLabel || 'Équipage',
      confirmationStatus: 'provisional',
      comments: `Remplacement manuel préparé depuis le conflit « ${conflict.title} »`,
    });
  }

  function openP12Source(conflict: PlanningDetectedConflict) {
    setIsP12Open(false);
    if (conflict.assignmentId) {
      openAssignmentById(conflict.assignmentId);
      return;
    }
    if (conflict.handoverId) {
      const handover = overview.handovers.find((item) => item.id === conflict.handoverId);
      if (handover) openHandover(handover);
      return;
    }
    if (conflict.projectId) {
      const project = overview.projects.find((item) => item.id === conflict.projectId);
      if (project) openProjectEditor(project);
      return;
    }
    setStatusMessage('Ce conflit est lié à une exigence globale de la matrice d’armement.');
  }

  function toggleFleetNode(key: string) {
    setCollapsedFleetNodes((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function openLaneAssignment(targetLane: PlanningCrewLane, date: string) {
    const person = activePeople.find((item) => item.id === targetLane.personId);
    const currentVessel = activeVessels.find((item) => item.id === targetLane.events[0]?.vesselId || item.name === targetLane.events[0]?.vessel);
    openAssignment({
      vesselId: currentVessel ? String(currentVessel.id) : '',
      crewPersonId: person ? String(person.id) : '',
      startsOn: date,
      endsOn: date,
      startsAt: localDateTime(date, '08:00'),
      endsAt: localDateTime(date, '20:00'),
      assignmentRole: person?.functionLabel || 'Équipage',
      statusLabel: person && isSedentaryPlanningFunction(person.functionLabel) ? 'A Terre' : 'En Mer',
      confirmationStatus: 'provisional',
      watchGroup: targetLane.watchGroup || 'Affectation',
    });
  }

  useEffect(() => {
    const handleGridShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && (key === 'c' || key === 'x')) {
        if (!selectedGridCells.size) return;
        event.preventDefault();
        const mode = key === 'x' ? 'cut' : 'copy';
        const cells = sortPlanningGridCells([...selectedGridCells.values()]);
        setGridClipboard({ mode, cells });
        setStatusMessage(`${cells.length} case${cells.length > 1 ? 's' : ''} ${mode === 'cut' ? 'coupée' : 'copiée'}${cells.length > 1 ? 's' : ''}. Sélectionnez la destination puis utilisez Ctrl+V.`);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === 'v') {
        event.preventDefault();
        void pastePlanningGridClipboard();
        return;
      }
      if ((key === 'delete' || key === 'backspace') && selectedGridCells.size) {
        event.preventDefault();
        void deleteSelectedPlanningGridCells();
        return;
      }
      if (key === 'escape' && gridClipboard) {
        setGridClipboard(null);
        setStatusMessage('Copier-couper annulé.');
      }
    };
    window.addEventListener('keydown', handleGridShortcut);
    return () => window.removeEventListener('keydown', handleGridShortcut);
  });

  if (!permissions.canRead) {
    return <div className="admin-state" role="alert">Vous n’avez pas accès au module Planning.</div>;
  }
  if (isInitialLoading) return <div className="admin-state" role="status">Chargement du planning...</div>;
  if (!hasLoaded && loadErrorMessage) {
    return (
      <div className="admin-state" role="alert">
        <p>{loadErrorMessage}</p>
        <button onClick={() => void loadPlanning()} type="button">Réessayer</button>
      </div>
    );
  }

  return (
    <section className={`planning-workspace${isFullscreen ? ' is-fullscreen' : ''}`} ref={workspaceRef}>
      <header className="planning-command-header">
        <div>
          <p className="module-family">Planning</p>
          <h1 aria-label="Planning">Planning BBTM</h1>
        </div>
      </header>

      {statusMessage || errorMessage || loadErrorMessage || isRefreshing ? (
        <div className="planning-notices" aria-live="polite">
          {isRefreshing ? <p className="admin-state">Actualisation du planning...</p> : null}
          {statusMessage ? <p className="admin-success">{statusMessage}</p> : null}
          {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}
          {loadErrorMessage ? <p className="form-error" role="alert">{loadErrorMessage}</p> : null}
        </div>
      ) : null}

      <div className="planning-command-layout">
        <nav aria-label="Menu du planning" className="planning-module-toolbar">
          <div className="planning-ribbon-scroll">
            <PlanningRibbonGroup label="ARMEMENT">
              {permissions.canViewDashboard || permissions.canViewWorkRest ? <PlanningRibbonButton icon={<Gauge aria-hidden="true" size={22} />} label="Cockpit métier P1.3" onClick={() => setIsP13Open(true)} /> : null}
              <PlanningRibbonButton count={tabCounts.billing} icon={<ReceiptText aria-hidden="true" size={22} />} label="Facturation" onClick={() => openOperationalTab('billing')} />
              <PlanningRibbonButton icon={<CalendarDays aria-hidden="true" size={22} />} label="Rotations et décision d’effectif" onClick={() => setIsP11Open(true)} />
              {permissions.canManageHandovers ? <PlanningRibbonButton icon={<ClipboardCheck aria-hidden="true" size={22} />} label="Créer une relève" onClick={() => openHandover()} /> : null}
              {permissions.canManageVessels ? <PlanningRibbonButton icon={<Ship aria-hidden="true" size={22} />} label="Gérer les navires" onClick={() => setIsVesselsOpen(true)} /> : null}
              {canEditPlanning ? <PlanningRibbonButton icon={<CalendarPlus aria-hidden="true" size={22} />} label="Nouveau projet" onClick={() => openFleetEvent()} /> : null}
            </PlanningRibbonGroup>

            <PlanningRibbonGroup label="Gestion des congés">
              {permissions.canRequestAbsences ? <PlanningRibbonButton icon={<CalendarOff aria-hidden="true" size={22} />} label="Demander des congés" onClick={() => openP12({ tab: 'absences', openAbsenceForm: true })} /> : null}
              {permissions.canReviewAbsences ? <PlanningRibbonButton count={pendingAbsenceCount} icon={<ShieldAlert aria-hidden="true" size={22} />} label="Demandes en attente" onClick={() => openP12({ tab: 'absences', requestedOnly: true })} /> : null}
            </PlanningRibbonGroup>

            <PlanningRibbonGroup label="Aide à la décision">
              <PlanningRibbonButton count={tabCounts.conflicts} icon={<AlertTriangle aria-hidden="true" size={22} />} label="Conflits" onClick={() => openOperationalTab('conflicts')} />
              {permissions.canViewHistory ? <PlanningRibbonButton count={tabCounts.history} icon={<History aria-hidden="true" size={22} />} label="Historique" onClick={() => openOperationalTab('history')} /> : null}
              <PlanningRibbonButton icon={<ShieldAlert aria-hidden="true" size={22} />} label="Absences et conflits" onClick={() => openP12()} />
              <PlanningRibbonButton count={tabCounts.alerts} icon={<Bell aria-hidden="true" size={22} />} label="Alertes" onClick={() => openOperationalTab('alerts')} />
              <PlanningRibbonButton count={tabCounts.certificates} icon={<FilePenLine aria-hidden="true" size={22} />} label="Certificats" onClick={() => openOperationalTab('certificates')} />
              <PlanningRibbonButton count={tabCounts.handovers} icon={<ClipboardCheck aria-hidden="true" size={22} />} label="Relèves" onClick={() => openOperationalTab('handovers')} />
              {isPlanningAssistantEnabled && assistantAccess.hasAccess ? <PlanningRibbonButton icon={<Sparkles aria-hidden="true" size={22} />} label="Assistant Planning" onClick={() => setIsP21Open(true)} /> : null}
              {isPlanningPredictionsEnabled && assistantAccess.hasAccess ? <PlanningRibbonButton icon={<Activity aria-hidden="true" size={22} />} label="Prévisions et scénarios" onClick={() => setIsP22Open(true)} /> : null}
              {(isPlanningAssistantEnabled || isPlanningPredictionsEnabled) && permissions.canBeAssistantPilot && isAssistantAccessLoading ? <PlanningRibbonButton disabled icon={<Sparkles aria-hidden="true" size={22} />} label="Vérification de l’accès…" /> : null}
            </PlanningRibbonGroup>

            <PlanningRibbonGroup label="Documents">
              {permissions.canExport ? <PlanningRibbonButton icon={<FileSpreadsheet aria-hidden="true" size={22} />} label="Générer une crew list" onClick={openCrewList} /> : null}
              {permissions.canExport ? <PlanningRibbonButton icon={<FileDown aria-hidden="true" size={22} />} label="Exports" onClick={() => setIsExportOpen(true)} /> : null}
            </PlanningRibbonGroup>
          </div>
        </nav>
        <PlanningPublicationPanel
          canPublish={permissions.canPublishPublication}
          isSaving={isSaving}
          onPublish={handlePublishPlanning}
          release={latestRelease}
        />
      </div>

      <div className="planning-layout">
        <section className="planning-board-card" aria-label="Calendrier des affectations">
          <div className="planning-board-toolbar">
            <div className="planning-toolbar-main">
              <div className="planning-perspective-switch" aria-label="Vue du planning" role="tablist">
                <button aria-selected={perspective === 'fleet'} className={perspective === 'fleet' ? 'is-active' : ''} onClick={() => changePerspective('fleet')} role="tab" type="button">Flotte</button>
                <button aria-selected={perspective === 'crew'} className={perspective === 'crew' ? 'is-active' : ''} onClick={() => changePerspective('crew')} role="tab" type="button">Équipages</button>
              </div>
              {canEditPlanning && perspective === 'crew' ? (
                <button className="planning-primary-action" onClick={() => openAssignment()} type="button">
                  <Plus aria-hidden="true" size={17} />Créer une affectation
                </button>
              ) : null}
              <button aria-expanded={isFiltersOpen} className={`planning-filter-toggle${isFiltersOpen ? ' is-active' : ''}`} onClick={() => setIsFiltersOpen((value) => !value)} type="button">
                <SlidersHorizontal aria-hidden="true" size={17} />Filtres{activeFilterCount ? <span>{activeFilterCount}</span> : null}
              </button>
              <button aria-busy={isRefreshing} className="planning-filter-toggle planning-refresh-button" disabled={isRefreshing} onClick={() => void Promise.all([loadPlanning(), loadAbsences()])} type="button">
                <RefreshCw aria-hidden="true" size={17} />{isRefreshing ? 'Actualisation…' : 'Actualiser'}
              </button>
              <div className="planning-toolbar-spacer" />
              <div className="planning-view-switch" aria-label="Période affichée">
                {(['day', 'week', 'fortnight', 'month', 'year'] as PlanningViewMode[]).map((mode) => (
                  <button className={viewMode === mode ? 'is-active' : ''} key={mode} onClick={() => setViewMode(mode)} type="button">
                    {mode === 'day' ? 'Jour' : mode === 'week' ? 'Semaine' : mode === 'fortnight' ? '2 sem.' : mode === 'month' ? 'Mois' : 'An'}
                  </button>
                ))}
              </div>
              {perspective === 'crew' ? <div className="planning-grouping-switch" aria-label="Regrouper les équipages"><button className={crewGrouping === 'people' ? 'is-active' : ''} onClick={() => setCrewGrouping('people')} type="button">Marins</button><button className={crewGrouping === 'teams' ? 'is-active' : ''} onClick={() => setCrewGrouping('teams')} type="button">Équipes</button></div> : null}
            </div>

            <div className="planning-toolbar-navigation">
              <div className="planning-zoom-controls" aria-label="Zoom du planning">
                <button aria-label="Zoom arrière" disabled={zoomLevel <= 60} onClick={() => setZoomLevel((value) => Math.max(60, value - 20))} type="button"><Minus aria-hidden="true" size={15} /></button>
                <output aria-label="Niveau de zoom">{zoomLevel} %</output>
                <button aria-label="Zoom avant" disabled={zoomLevel >= 160} onClick={() => setZoomLevel((value) => Math.min(160, value + 20))} type="button"><Plus aria-hidden="true" size={15} /></button>
              </div>
              <button aria-label={isFullscreen ? 'Quitter le plein écran' : 'Afficher le planning en plein écran'} className="planning-icon-button" onClick={() => void toggleFullscreen()} title={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'} type="button"><Expand aria-hidden="true" size={17} /></button>
              <div className="planning-period-controls">
                <button aria-label="Période précédente" className="planning-icon-button" onClick={() => setAnchorDate((value) => shiftPlanningAnchor(value, viewMode, -1))} type="button"><ChevronLeft aria-hidden="true" size={18} /></button>
                <label><span>Date de référence</span><input aria-label="Date de référence" onChange={(event) => setAnchorDate(event.target.value)} type="date" value={anchorDate} /></label>
                <button className="planning-today-button" onClick={() => setAnchorDate(todayDate)} type="button">Aujourd’hui</button>
                <button aria-label="Période suivante" className="planning-icon-button" onClick={() => setAnchorDate((value) => shiftPlanningAnchor(value, viewMode, 1))} type="button"><ChevronRight aria-hidden="true" size={18} /></button>
              </div>
            </div>

            {isFiltersOpen ? <div className="planning-filter-strip" aria-label="Filtres du planning">
              <label className="planning-select-control"><Ship aria-hidden="true" size={16} /><span className="sr-only">Filtre navire</span><select aria-label="Filtre navire" onChange={(event) => setFilters((current) => ({ ...current, vesselName: event.target.value }))} value={filters.vesselName}><option value="">Tous les navires</option>{vesselOptions.map((value) => <option key={value}>{value}</option>)}</select><ChevronDown aria-hidden="true" size={14} /></label>
              {perspective === 'crew' ? <label className="planning-select-control"><Search aria-hidden="true" size={16} /><span className="sr-only">Filtre marin</span><select aria-label="Filtre marin" onChange={(event) => setFilters((current) => ({ ...current, personName: event.target.value }))} value={filters.personName}><option value="">Tous les marins</option>{personOptions.map((value) => <option key={value}>{value}</option>)}</select><ChevronDown aria-hidden="true" size={14} /></label> : null}
              <label className="planning-select-control"><span className="sr-only">Filtre type</span><select aria-label="Filtre type d’événement" onChange={(event) => setFilters((current) => ({ ...current, eventType: event.target.value }))} value={filters.eventType}><option value="">Tous les types</option>{perspective === 'fleet' ? FLEET_EVENT_TYPES.map((type) => <option key={type} value={type}>{planningFleetEventTypeLabel(type)}</option>) : ['assignment', 'rest', 'leave', 'training', 'unavailability'].map((type) => <option key={type} value={type}>{planningCrewEventTypeLabel(type)}</option>)}</select><ChevronDown aria-hidden="true" size={14} /></label>
              <label className="planning-select-control"><span className="sr-only">Filtre statut</span><select aria-label="Filtre statut" onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} value={filters.status}><option value="">Tous les statuts</option>{statusOptions.map((status) => <option key={status} value={status}>{status === 'provisional' || status === 'confirmed' || status === 'cancelled' ? planningConfirmationLabel(status) : planningStatusDisplayLabel(status)}</option>)}</select><ChevronDown aria-hidden="true" size={14} /></label>
              <label className="planning-select-control"><span className="sr-only">Filtre responsable</span><select aria-label="Filtre responsable" onChange={(event) => setFilters((current) => ({ ...current, responsible: event.target.value }))} value={filters.responsible}><option value="">Tous les responsables</option>{responsibleOptions.map((value) => <option key={value}>{value}</option>)}</select><ChevronDown aria-hidden="true" size={14} /></label>
              <button className="planning-filter-reset" disabled={!activeFilterCount} onClick={() => setFilters(EMPTY_FILTERS)} type="button"><X aria-hidden="true" size={14} />Réinitialiser</button>
            </div> : null}
          </div>

          <div
            className={`planning-calendar-scroll${isCalendarPanning ? ' is-panning' : ''}`}
            data-planning-view-mode={viewMode}
            onClickCapture={suppressCalendarClickAfterPan}
            onPointerDown={beginCalendarPan}
            style={timelineStyle(effectiveDayWidth, days.length)}
            tabIndex={0}
            title="Maintenez le clic et déplacez la souris pour parcourir le calendrier"
          >
            <div className="planning-calendar-grid planning-calendar-months">
              <div className="planning-calendar-corner" />
              {monthSegments.map((segment) => (
                <div className="planning-month-segment" key={segment.key} style={{ gridColumn: `${segment.startIndex + 2} / span ${segment.span}` }}>{segment.label}</div>
              ))}
            </div>
            <div className="planning-calendar-grid planning-calendar-weeks">
              <div className="planning-calendar-corner" />
              {days.map((day, index) => {
                const previous = days[index - 1];
                if (previous?.week === day.week && previous.year === day.year) return null;
                const span = days.slice(index).findIndex((candidate) => candidate.week !== day.week || candidate.year !== day.year);
                return <div className="planning-week-segment" key={`${day.year}-${day.week}`} style={{ gridColumn: `${index + 2} / span ${span === -1 ? days.length - index : span}` }}>S{day.week}</div>;
              })}
            </div>
            <div className="planning-calendar-grid planning-calendar-days">
              <div className="planning-calendar-corner planning-calendar-label-heading">{perspective === 'fleet' ? 'Navires · Bordées · Marins' : crewGrouping === 'teams' ? 'Équipes' : 'Marins'}</div>
              {days.map((day) => <div className={`planning-day-heading${day.isWeekend ? ' is-weekend' : ''}${day.date === todayDate ? ' is-today' : ''}`} key={day.date}><span>{WEEKDAY_LABELS[day.weekday]}</span><strong>{day.day}</strong></div>)}
            </div>

            <div className="planning-calendar-body">
              {perspective === 'fleet' && fleetRows.length ? fleetRows.map((row) => {
                if (row.type !== 'vessel' && collapsedFleetNodes.has(row.vesselKey)) return null;
                if (row.type === 'person' && collapsedFleetNodes.has(row.boardKey)) return null;
                if (row.type === 'vessel') {
                  const lane = fleetLanesByVessel.get(row.vessel);
                  if (!lane) return null;
                  return (
                    <PlanningFleetTimelineRow
                      crewCount={fleetTreeCounts.get(row.key) || 0}
                      dayWidth={effectiveDayWidth}
                      days={days}
                      editable={canEditPlanning}
                      expanded={!collapsedFleetNodes.has(row.key)}
                      hasBoards={fleetRows.some((item) => item.type === 'board' && item.vesselId === lane.vesselId)}
                      key={row.key}
                      lane={lane}
                      onAddBoard={openNewBoard}
                      onAssignPerson={(personId, targetLane, watchGroup) => void assignPersonByDrop(personId, targetLane, watchGroup)}
                      onMove={(projectId, targetLane, date) => void moveProject(projectId, targetLane, date)}
                      onOpen={openProjectEditor}
                      onOpenVessel={openVesselEditor}
                      onResize={(project, edge, delta) => void resizeProject(project, edge, delta)}
                      onSelect={setSelectedTimelineId}
                      onToggle={() => toggleFleetNode(row.key)}
                      pendingId={pendingMutationId}
                      selectedId={selectedTimelineId}
                      touchDropTarget={touchDropTarget}
                      viewMode={viewMode}
                    />
                  );
                }
                if (row.type === 'board') {
                  return (
                    <PlanningFleetBoardTimelineRow
                      board={row.label}
                      crewCount={fleetTreeCounts.get(row.key) || 0}
                      days={days}
                      editable={canEditPlanning}
                      expanded={!collapsedFleetNodes.has(row.key)}
                      key={row.key}
                      onAssignPerson={(personId, vesselId, watchGroup) => {
                        const targetLane = fleetLanes.find((item) => item.vesselId === vesselId);
                        if (targetLane) void assignPersonByDrop(personId, targetLane, watchGroup);
                      }}
                      onAddPerson={() => openBoardAssignment(row.vesselId, row.board)}
                      onToggle={() => toggleFleetNode(row.key)}
                      touchDropTarget={touchDropTarget}
                      vessel={row.vessel}
                      vesselId={row.vesselId}
                    />
                  );
                }
                const lane: PlanningCrewLane = {
                  key: row.key,
                  label: row.label,
                  detail: '',
                  personId: row.personId,
                  vesselId: row.vesselId,
                  vessel: row.vessel,
                  watchGroup: row.board,
                  functionLabel: row.functionLabel,
                  events: row.events,
                };
                return (
                  <PlanningCrewTimelineRow
                    absences={absences}
                    conflictDatesByEvent={conflictDatesByEvent}
                    cutGridCellKeys={cutGridCellKeys}
                    dayWidth={effectiveDayWidth}
                    days={days}
                    editable={canEditPlanning}
                    hierarchy
                    hrDocuments={lane.personId === null ? undefined : hrDocumentsByPerson.get(lane.personId)}
                    key={row.key}
                    lane={lane}
                    onCreate={openLaneAssignment}
                    onMove={(event, date) => void moveEvent(event, date)}
                    onOpen={openEvent}
                    onResize={(event, edge, delta) => void resizeEvent(event, edge, delta)}
                    onEditDayState={openDayState}
                    onConflictCellClick={!isSaving ? openPlanningGridConflict : undefined}
                    onGridCellClick={selectPlanningGridCell}
                    onEmptyGridCellDoubleClick={(cell) => void colorPlanningGridCell(cell)}
                    onDeleteEmptyRow={row.boardRowId && !row.hasAnyRecords ? () => void removeEmptyBoardRow(row.boardRowId!, row.label) : undefined}
                    onOpenAbsence={(absence) => openP12({ tab: 'absences', absenceId: absence.id })}
                    onSelect={setSelectedTimelineId}
                    pendingId={pendingMutationId}
                    isDeletingEmptyRow={pendingMutationId === `board-row-${row.boardRowId}`}
                    selectedId={selectedTimelineId}
                    selectedGridCells={selectedGridCells}
                    viewMode={viewMode}
                  />
                );
              }) : null}
              {perspective === 'crew' && crewLanes.length ? crewLanes.map((lane) => (
                <PlanningCrewTimelineRow
                  absences={absences}
                  conflictDatesByEvent={conflictDatesByEvent}
                  dayWidth={effectiveDayWidth}
                  days={days}
                  editable={canEditPlanning}
                  key={lane.key}
                  lane={lane}
                  hrDocuments={lane.personId === null ? undefined : hrDocumentsByPerson.get(lane.personId)}
                  onCreate={openLaneAssignment}
                  onMove={(event, date) => void moveEvent(event, date)}
                  onOpenAbsence={(absence) => openP12({ tab: 'absences', absenceId: absence.id })}
                  onOpen={openEvent}
                  onResize={(event, edge, delta) => void resizeEvent(event, edge, delta)}
                  onSelect={setSelectedTimelineId}
                  pendingId={pendingMutationId}
                  selectedId={selectedTimelineId}
                  viewMode={viewMode}
                />
              )) : null}
              {perspective === 'fleet' && !fleetRows.length ? <div className="planning-calendar-empty"><p>Aucun navire avec marin affecté ne correspond à cette période.</p></div> : null}
              {perspective === 'crew' && !crewLanes.length ? <div className="planning-calendar-empty"><p>Aucune affectation ne correspond à ces filtres.</p></div> : null}
            </div>
          </div>
        </section>

        {perspective === 'fleet' || isOperationalPanelOpen ? <aside className="planning-side-card" aria-label={isOperationalPanelOpen ? 'Suivi opérationnel du planning' : 'Marins non affectés'}>
          {isOperationalPanelOpen ? (
            <>
              <header className="planning-side-heading"><div><Wrench aria-hidden="true" size={19} /><span><small>Suivi opérationnel</small><strong>{SIDE_TABS.find((tab) => tab.key === sideTab)?.label}</strong></span></div><button aria-label="Fermer le suivi opérationnel" onClick={() => setIsOperationalPanelOpen(false)} type="button"><X aria-hidden="true" size={18} /></button></header>
              <PlanningSideContent certificateAlerts={certificateAlerts} hrAlerts={hrAlerts} onOpenHandover={(handover) => openHandover(handover)} onOpenConflictCenter={() => openP12()} overview={overview} planningControls={planningControls} sideTab={sideTab} unassignedPeople={unassignedPeople} unbilledProjects={unbilledProjects} editable={canEditPlanning} />
            </>
          ) : (
            <>
              <header className="planning-side-heading is-unassigned"><div><UsersRound aria-hidden="true" size={20} /><span><small>Affectation rapide</small><strong>Marins non affectés <em>{unassignedPeople.length}</em></strong></span></div></header>
              <p className="planning-unassigned-help">Glissez un marin sur une bordée, ou sur un navire sans bordée.</p>
              <PlanningUnassignedPeopleList editable={canEditPlanning} onPointerCancel={cancelTouchPersonDrag} onPointerDown={beginTouchPersonDrag} onPointerMove={moveTouchPersonDrag} onPointerUp={endTouchPersonDrag} pendingId={pendingMutationId} people={unassignedPeople} />
            </>
          )}
        </aside> : null}
      </div>

      {dayStateForm ? <PlanningDayStateDialog form={dayStateForm} isSaving={isSaving} onChange={setDayStateForm} onClose={() => setDayStateForm(null)} onSave={saveDayState} /> : null}
      {gridConflictForm ? <PlanningGridConflictDialog form={gridConflictForm} isSaving={isSaving} onClose={() => setGridConflictForm(null)} onResolve={(event) => void resolvePlanningGridConflict(event)} /> : null}
      {boardForm ? <PlanningBoardStaffingDialog form={boardForm} isSaving={isSaving} onChange={setBoardForm} onClose={() => setBoardForm(null)} onSave={saveNewBoard} /> : null}
      {departedPeopleDialog ? <PlanningDepartedPeopleDialog existingPersonIds={departedDialogExistingPersonIds} isSaving={isSaving} onAdd={(person) => void addDepartedPersonToBoard(person)} onClose={() => setDepartedPeopleDialog(null)} pendingId={pendingMutationId} people={departedPeople} state={departedPeopleDialog} /> : null}
      {touchPersonDrag ? <div aria-hidden="true" className="planning-touch-drag-ghost" style={{ left: touchPersonDrag.x + 14, top: touchPersonDrag.y + 14 }}><GripVertical size={16} /><span>{formatPlanningPerson(touchPersonDrag.person)}</span></div> : null}

      {isAssignmentOpen ? (
        <div className="planning-dialog-backdrop is-side-panel" role="presentation">
          <form aria-modal="true" className="planning-dialog is-side-panel" onSubmit={handleCreateAssignment} role="dialog">
            <header><div><UserRoundPlus aria-hidden="true" size={20} /><span><small>{isAssignmentQuick ? 'Formulaire rapide' : 'Formulaire complet'}</small><h2>Nouvelle affectation</h2></span></div><button aria-label="Fermer" onClick={() => setIsAssignmentOpen(false)} type="button"><X aria-hidden="true" size={18} /></button></header>
            <div className="planning-dialog-grid">
              <label>Navire<select aria-label="Navire" onChange={(event) => setAssignmentForm((current) => ({ ...current, vesselId: event.target.value }))} required value={assignmentForm.vesselId}><option value="">Choisir</option>{activeVessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vesselOptionLabel(vessel)}</option>)}</select></label>
              <label>Marin<select aria-label="Marin" onChange={(event) => setAssignmentForm((current) => ({ ...current, crewPersonId: event.target.value }))} required value={assignmentForm.crewPersonId}><option value="">Choisir</option>{activePeople.map((person) => <option key={person.id} value={person.id}>{personOptionLabel(person)}</option>)}</select></label>
              <label>Début<input aria-label="Debut" onChange={(event) => setAssignmentForm((current) => ({ ...current, startsAt: event.target.value, startsOn: event.target.value.slice(0, 10), endsAt: isAssignmentQuick ? localDateTime(event.target.value.slice(0, 10), '20:00') : current.endsAt, endsOn: isAssignmentQuick ? event.target.value.slice(0, 10) : current.endsOn }))} required type="datetime-local" value={assignmentForm.startsAt} /></label>
              <label>Fin<input aria-label="Fin" onChange={(event) => setAssignmentForm((current) => ({ ...current, endsAt: event.target.value, endsOn: event.target.value.slice(0, 10) }))} required type="datetime-local" value={assignmentForm.endsAt} /></label>
              <label>Statut<select aria-label="Statut" onChange={(event) => setAssignmentForm((current) => ({ ...current, statusLabel: event.target.value }))} value={assignmentForm.statusLabel}>{PLANNING_STATUSES.map((status) => <option key={status} value={status}>{planningStatusDisplayLabel(status)}</option>)}</select></label>
              <label>Confirmation<select aria-label="Confirmation" onChange={(event) => setAssignmentForm((current) => ({ ...current, confirmationStatus: event.target.value as PlanningConfirmationStatus }))} value={assignmentForm.confirmationStatus}><option value="provisional">Provisoire</option><option value="confirmed">Confirmée</option></select></label>
              {!isAssignmentQuick ? <><label>Capitaine<select aria-label="Capitaine" onChange={(event) => setAssignmentForm((current) => ({ ...current, captainPersonId: event.target.value }))} value={assignmentForm.captainPersonId}><option value="">Aucun</option>{activePeople.map((person) => <option key={person.id} value={person.id}>{personOptionLabel(person)}</option>)}</select></label><label>Fonction<input aria-label="Fonction" onChange={(event) => setAssignmentForm((current) => ({ ...current, assignmentRole: event.target.value }))} value={assignmentForm.assignmentRole} /></label><label>Bordée / groupe<select aria-label="Bordée" onChange={(event) => setAssignmentForm((current) => ({ ...current, watchGroup: event.target.value }))} value={assignmentForm.watchGroup}>{uniqueSorted([...watchGroupOptions, assignmentForm.watchGroup]).map((group) => <option key={group}>{group}</option>)}</select></label><label className="is-wide">Annotation<textarea aria-label="Annotation" onChange={(event) => setAssignmentForm((current) => ({ ...current, comments: event.target.value }))} value={assignmentForm.comments} /></label></> : null}
            </div>
            <PlanningControlSummary results={assignmentControls} />
            <footer>{isAssignmentQuick ? <button className="is-secondary" onClick={() => { setIsAssignmentQuick(false); setAssignmentForm((current) => ({ ...current, endsOn: current.endsOn || current.startsOn })); }} type="button">Formulaire complet</button> : <span />}<span><button className="is-secondary" onClick={() => setIsAssignmentOpen(false)} type="button">Annuler</button><button disabled={isSaving} type="submit">Ajouter</button></span></footer>
          </form>
        </div>
      ) : null}

      {selectedEvent && eventForm ? <PlanningEventDialog activeVessels={activeVessels} controls={selectedEventControls} editable={canEditPlanning} event={selectedEvent} form={eventForm} isSaving={isSaving} onChange={setEventForm} onClose={() => { setSelectedEvent(null); setEventForm(null); }} onDelete={() => void removeEvent(selectedEvent)} onDuplicate={duplicateSelectedEvent} onSave={() => void saveEvent(selectedEvent, eventForm)} watchGroupOptions={watchGroupOptions} /> : null}
      {isHandoverOpen ? <PlanningHandoverDialog editable={permissions.canManageHandovers} handover={selectedHandover} isSaving={isSaving} onClose={() => { setIsHandoverOpen(false); setSelectedHandover(null); }} onSave={(input) => void handleSaveHandover(input)} overview={overview} /> : null}
      {isP11Open ? <PlanningP11Panel canManageManning={permissions.canManageManning} canManageRotations={permissions.canManageRotations} canManageTemplates={permissions.canManageTemplates} client={effectiveClient} onClose={() => setIsP11Open(false)} onOperationalChange={handleP11OperationalChange} overview={overview} range={range} /> : null}
      {isP12Open ? <Suspense fallback={<div className="planning-dialog-backdrop is-side-panel"><div className="admin-state" role="status">Chargement du centre de conflits…</div></div>}><PlanningP12Panel canDeleteLeaves={permissions.canDeleteLeaves} canManageConflictCases={permissions.canManageConflictCases} canPrepareReplacements={permissions.canPrepareReplacements} canRequestAbsences={permissions.canRequestAbsences} canReviewAbsences={permissions.canReviewAbsences} client={effectiveClient} initialAbsenceId={p12Launch.absenceId} initialTab={p12Launch.tab} onAuditChange={handleP12AuditChange} onClose={() => setIsP12Open(false)} onOpenSource={openP12Source} onPrepareReplacement={prepareManualReplacement} openAbsenceFormOnMount={p12Launch.openAbsenceForm} overview={overview} range={range} requestedOnly={p12Launch.requestedOnly} /></Suspense> : null}
      {isP13Open ? <Suspense fallback={<div className="planning-dialog-backdrop is-side-panel"><div className="admin-state" role="status">Chargement du cockpit métier…</div></div>}><PlanningP13Panel canManageDependencies={permissions.canManageDependencies} canManageWorkRestPolicies={permissions.canManageWorkRestPolicies} canRefreshNotifications={permissions.canRefreshNotifications} canViewDashboard={permissions.canViewDashboard} canViewNotifications={permissions.canViewNotifications} canViewWorkRest={permissions.canViewWorkRest} client={effectiveClient} onAuditChange={handleP12AuditChange} onClose={() => setIsP13Open(false)} overview={overview} range={range} /></Suspense> : null}
      {isP21Open && assistantAccess.hasAccess ? <Suspense fallback={<div className="planning-dialog-backdrop is-side-panel"><div className="admin-state" role="status">Chargement de l’assistant Planning…</div></div>}><PlanningP21Panel access={assistantAccess} client={effectiveClient} onAuditChange={handleP12AuditChange} onClose={() => setIsP21Open(false)} overview={overview} range={range} /></Suspense> : null}
      {isP22Open && assistantAccess.hasAccess ? <Suspense fallback={<div className="planning-dialog-backdrop is-side-panel"><div className="admin-state" role="status">Chargement des prévisions…</div></div>}><PlanningP22Panel access={assistantAccess} client={effectiveClient} onClose={() => setIsP22Open(false)} overview={overview} range={range} /></Suspense> : null}
      {isProjectOpen ? <PlanningProjectDialog activeVessels={activeVessels} editable={canEditPlanning} form={projectForm} isQuick={isProjectQuick} isSaving={isSaving} onCancel={() => void cancelProject()} onChange={setProjectForm} onClose={() => { setSelectedProject(null); setIsProjectOpen(false); }} onDuplicate={duplicateSelectedProject} onExpand={() => setIsProjectQuick(false)} onSave={() => void saveProject(projectForm)} project={selectedProject} /> : null}
      {isVesselsOpen ? <div className="planning-dialog-backdrop" role="presentation"><section aria-modal="true" className="planning-dialog planning-vessel-dialog" role="dialog"><header><div><Ship aria-hidden="true" size={20} /><h2>Gérer les navires</h2></div><button aria-label="Fermer" onClick={() => setIsVesselsOpen(false)} type="button"><X aria-hidden="true" size={18} /></button></header><form className="planning-inline-form" onSubmit={addVessel}><label>Nom<input required value={newVessel.name} onChange={(event) => setNewVessel((current) => ({ ...current, name: event.target.value }))} /></label><label>Indicatif<input value={newVessel.acronym} onChange={(event) => setNewVessel((current) => ({ ...current, acronym: event.target.value }))} /></label><button disabled={isSaving} type="submit"><Plus aria-hidden="true" size={16} />Ajouter</button></form><div className="planning-vessel-list">{activeVessels.map((vessel) => <div key={vessel.id}><span><strong>{vessel.name}</strong><small>{vessel.acronym || 'Sans indicatif'}</small></span><button aria-label={`Retirer ${vessel.name}`} onClick={() => void archiveVessel(vessel)} type="button"><Trash2 aria-hidden="true" size={16} /></button></div>)}</div></section></div> : null}
      {vesselForm ? <div className="planning-dialog-backdrop" role="presentation"><form aria-label={`Fiche du navire ${vesselForm.name}`} aria-modal="true" className="planning-dialog planning-vessel-sheet" onSubmit={saveVesselEditor} role="dialog"><header><div><FilePenLine aria-hidden="true" size={20} /><span><small>Fiche navire</small><h2>{vesselForm.name}</h2></span></div><button aria-label="Fermer" onClick={() => setVesselForm(null)} type="button"><X aria-hidden="true" size={18} /></button></header><div className="planning-dialog-grid"><label className="is-wide">Nom<input aria-label="Nom du navire" disabled={!permissions.canManageVessels} maxLength={120} onChange={(event) => setVesselForm((current) => current ? { ...current, name: event.target.value } : null)} required value={vesselForm.name} /></label><label className="is-wide">Indicatif<input aria-label="Indicatif du navire" disabled={!permissions.canManageVessels} maxLength={40} onChange={(event) => setVesselForm((current) => current ? { ...current, acronym: event.target.value } : null)} value={vesselForm.acronym} /></label></div><footer><button className="is-secondary" onClick={() => setVesselForm(null)} type="button">Fermer</button>{permissions.canManageVessels ? <button disabled={isSaving} type="submit">Enregistrer</button> : null}</footer></form></div> : null}
      {isCrewListOpen ? <div className="planning-dialog-backdrop" role="presentation"><form aria-modal="true" className="planning-dialog planning-crew-list-dialog" onSubmit={handleGenerateCrewList} role="dialog"><header><div><FileSpreadsheet aria-hidden="true" size={20} /><span><small>Document réglementaire</small><h2>Générer une crew list</h2></span></div><button aria-label="Fermer" onClick={() => setIsCrewListOpen(false)} type="button"><X aria-hidden="true" size={18} /></button></header><p className="planning-dialog-intro">Le document A4 paysage reprend uniquement les affectations et profils enregistrés dans Supabase.</p><div className="planning-dialog-grid"><label>Date<input aria-label="Date de la crew list" onChange={(event) => changeCrewListDate(event.target.value)} required type="date" value={crewListForm.date} /></label><label>Navire<select aria-label="Navire de la crew list" onChange={(event) => { const vesselId = event.target.value; const boards = availablePlanningCrewListBoards(overview, Number(vesselId), crewListForm.date); setCrewListForm((current) => ({ ...current, vesselId, watchGroup: boards.length === 1 ? boards[0] : '' })); }} required value={crewListForm.vesselId}><option value="">Choisir</option>{crewListVessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vesselOptionLabel(vessel)}</option>)}</select></label><label>Bordée<select aria-label="Bordée de la crew list" disabled={!crewListBoards.length} onChange={(event) => setCrewListForm((current) => ({ ...current, watchGroup: event.target.value }))} required={crewListBoards.length > 0} value={crewListForm.watchGroup}><option value="">{crewListBoards.length ? 'Choisir' : 'Aucune bordée à cette date'}</option>{crewListBoards.map((board) => <option key={board}>{board}</option>)}</select></label><label>Format<select aria-label="Format de la crew list" onChange={(event) => setCrewListForm((current) => ({ ...current, format: event.target.value as PlanningCrewListFormat }))} value={crewListForm.format}><option value="xlsx">Excel (.xlsx)</option><option value="pdf">PDF (.pdf)</option></select></label></div>{!crewListVessels.length ? <p className="planning-crew-list-warning" role="status">Aucune affectation active pour cette date.</p> : null}<footer><button className="is-secondary" onClick={() => setIsCrewListOpen(false)} type="button">Annuler</button><button disabled={isSaving || !crewListBoards.length || !crewListForm.watchGroup} type="submit">Générer {crewListForm.format.toUpperCase()}</button></footer></form></div> : null}
      {isExportOpen ? <Suspense fallback={<div className="planning-dialog-backdrop"><div className="admin-state" role="status">Chargement des exports…</div></div>}><PlanningExportDialog client={effectiveClient} onClose={() => setIsExportOpen(false)} overview={overview} range={range} /></Suspense> : null}
    </section>
  );
}

function planningGridMutationCells(cells: PlanningGridCell[]) {
  return cells.map((cell) => ({
    personId: cell.personId,
    vesselId: cell.vesselId,
    assignmentId: cell.assignmentId,
    workDate: cell.workDate,
    status: cell.status,
    note: cell.note,
    watchGroup: cell.watchGroup,
    functionLabel: cell.functionLabel,
  }));
}

function planningGridConflictMutationCells(cells: PlanningGridCell[]) {
  return planningGridMutationCells(cells).map((cell, index) => {
    const sourceEventId = cells[index].eventId || '';
    const [eventKind, rawEventId] = sourceEventId.split('-');
    const eventId = Number(rawEventId);
    if (!['assignment', 'period', 'day'].includes(eventKind) || !Number.isSafeInteger(eventId) || eventId <= 0) {
      throw new Error("La ligne source du conflit n'est pas identifiable.");
    }
    return { ...cell, eventKind: eventKind as 'assignment' | 'period' | 'day', eventId };
  });
}

function hydratePlanningGridCells(cells: PlanningGridCell[], assignments: ReturnType<typeof mapPlanningAssignmentOverviewRows>): PlanningGridCell[] {
  return cells.map((cell) => {
    const assignment = assignments.find((item) => (
      item.crewPersonId === cell.personId
      && item.vesselId === cell.vesselId
      && item.watchGroup === cell.watchGroup
      && item.startsOn <= cell.workDate
      && item.endsOn >= cell.workDate
    ));
    return assignment ? { ...cell, assignmentId: assignment.id, eventId: `assignment-${assignment.id}` } : cell;
  });
}

function PlanningGridConflictDialog({ form, isSaving, onClose, onResolve }: {
  form: PlanningGridConflictForm;
  isSaving: boolean;
  onClose: () => void;
  onResolve: (event: PlanningCrewEvent) => void;
}) {
  return <div className="planning-dialog-backdrop" role="presentation">
    <section aria-label="Résoudre le conflit d’affectation" aria-modal="true" className="planning-dialog planning-grid-conflict-dialog" role="dialog">
      <header><div><ShieldAlert aria-hidden="true" size={21} /><span><small>{formatPlanningDate(form.cell.workDate)}</small><h2>Conflit d’affectation</h2></span></div><button aria-label="Fermer" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button></header>
      <p className="planning-dialog-intro"><strong>{form.cell.person}</strong> est affecté sur plusieurs lignes. Choisissez celle à conserver : seules les cases qui se chevauchent seront supprimées des autres lignes.</p>
      <div className="planning-grid-conflict-options">
        {form.events.map((event) => <button disabled={isSaving} key={event.id} onClick={() => onResolve(event)} type="button">
          <span><strong>{event.vessel}</strong><small>{event.board} · {event.functionLabel || 'Fonction non renseignée'}</small></span>
          <em>Garder cette ligne</em>
        </button>)}
      </div>
      <p className="planning-grid-conflict-audit"><ClipboardCheck aria-hidden="true" size={16} /> Une confirmation sera demandée et la décision sera historisée.</p>
      <footer><button className="is-secondary" onClick={onClose} type="button">Annuler</button></footer>
    </section>
  </div>;
}

function PlanningDayStateDialog({ form, isSaving, onChange, onClose, onSave }: {
  form: PlanningDayStateForm;
  isSaving: boolean;
  onChange: (value: PlanningDayStateForm | null) => void;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const options = [
    ['En Mer', 'En mer', 'sea'],
    ['A Terre', 'À terre', 'shore'],
    ['Vacance', 'Vacances', 'vacation'],
    ['Repos', 'Repos', 'rest'],
  ] as const;
  return <div className="planning-dialog-backdrop" role="presentation">
    <form aria-label="Statut et commentaire" aria-modal="true" className="planning-dialog planning-day-state-dialog" onSubmit={onSave} role="dialog">
      <header><div><Pencil aria-hidden="true" size={20} /><span><small>{form.date ? formatPlanningDate(form.date) : 'Période complète'}</small><h2>{form.event.person}</h2></span></div><button aria-label="Fermer" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button></header>
      <p className="planning-dialog-intro">Choisissez l’état visible dans la grille et, si besoin, un commentaire court.</p>
      <fieldset className="planning-day-scope-options"><legend>Appliquer à</legend><button className={form.date ? 'is-active' : ''} onClick={() => onChange({ ...form, date: form.selectedDate })} type="button">Ce jour</button><button className={form.date ? '' : 'is-active'} onClick={() => onChange({ ...form, date: null })} type="button">Tout le groupe de cases</button></fieldset>
      <fieldset className="planning-day-status-options"><legend>Statut</legend>{options.map(([value, label, tone]) => <label className={`is-${tone}`} key={value}><input checked={form.status === value} name="daily-status" onChange={() => onChange({ ...form, status: value })} type="radio" /><span>{label}</span></label>)}</fieldset>
      <label className="planning-day-comment">Commentaire<input autoFocus maxLength={32} onChange={(event) => onChange({ ...form, note: event.target.value })} placeholder="Texte court affiché dans la case" value={form.note} /></label>
      <small>{form.note.length}/32</small>
      <footer><button className="is-secondary" onClick={onClose} type="button">Annuler</button><button disabled={isSaving} type="submit">Appliquer{form.date ? ' à ce jour' : ' à la période'}</button></footer>
    </form>
  </div>;
}

function PlanningDepartedPeopleDialog({ state, people, existingPersonIds, isSaving, pendingId, onAdd, onClose }: {
  state: PlanningDepartedPeopleDialogState;
  people: PlanningPerson[];
  existingPersonIds: ReadonlySet<number>;
  isSaving: boolean;
  pendingId: string | null;
  onAdd: (person: PlanningPerson) => void;
  onClose: () => void;
}) {
  return <div className="planning-dialog-backdrop" role="presentation">
    <section aria-label={`Ajouter un marin à ${state.watchGroup}`} aria-modal="true" className="planning-dialog planning-departed-people-dialog" role="dialog">
      <header><div><UserRoundPlus aria-hidden="true" size={20} /><span><small>{state.vesselName} · {state.watchGroup}</small><h2>Ajouter un marin</h2></span></div><button aria-label="Fermer" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button></header>
      <p className="planning-dialog-intro">Marins sans date de départ ou dont la date de départ est postérieure à aujourd’hui. L’ajout crée une ligne vide, sans case colorée.</p>
      {people.length ? <div className="planning-departed-people-list">{people.map((person) => {
        const isAlreadyPresent = existingPersonIds.has(person.id);
        const isPending = pendingId === `departed-person-${person.id}`;
        return <article key={person.id}>
          <span><strong>{formatPlanningPerson(person)}</strong><small>{[person.functionLabel || person.gradeLabel, person.contractType].filter(Boolean).join(' · ') || 'Marin'}</small></span>
          <span><small>Date de départ</small><strong>{formatPlanningDate(person.departedOn)}</strong></span>
          <button aria-label={`${isAlreadyPresent ? 'Déjà présent' : 'Ajouter'} ${formatPlanningPerson(person)}`} disabled={isSaving || isAlreadyPresent} onClick={() => onAdd(person)} type="button">{isPending ? 'Ajout…' : isAlreadyPresent ? 'Déjà présent' : 'Ajouter'}</button>
        </article>;
      })}</div> : <div className="planning-side-empty"><CalendarOff aria-hidden="true" size={24} /><p>Aucun marin sans date de départ ou avec une date de départ postérieure à aujourd’hui.</p></div>}
      <footer><button className="is-secondary" onClick={onClose} type="button">Fermer</button></footer>
    </section>
  </div>;
}

function PlanningBoardStaffingDialog({ form, isSaving, onChange, onClose, onSave }: {
  form: PlanningBoardForm;
  isSaving: boolean;
  onChange: (value: PlanningBoardForm | null) => void;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return <div className="planning-dialog-backdrop" role="presentation">
    <form aria-label={`Créer ${form.watchGroup}`} aria-modal="true" className="planning-dialog planning-board-staffing-dialog" onSubmit={onSave} role="dialog">
      <header><div><UsersRound aria-hidden="true" size={20} /><span><small>{form.vesselName}</small><h2>Créer {form.watchGroup}</h2></span></div><button aria-label="Fermer" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button></header>
      <p className="planning-dialog-intro">Chaque poste vient de la Décision d’effectif. Seuls les marins disponibles dont les brevets correspondent sont proposés.</p>
      <div className="planning-board-staffing-period"><label>Début<input readOnly type="date" value={form.startsOn} /></label><label>Fin<input readOnly type="date" value={form.endsOn} /></label></div>
      <div className="planning-board-staffing-list">{form.positions.map((position) => <label key={position.key}>
        <span><strong>{position.requirement.functionLabel}</strong><small>{position.requirement.requiredCertificates.length ? position.requirement.requiredCertificates.join(' · ') : 'Aucun brevet imposé'}</small></span>
        <select aria-label={`Marin pour ${position.requirement.functionLabel}`} onChange={(event) => onChange({ ...form, positions: form.positions.map((item) => item.key === position.key ? { ...item, personId: event.target.value } : item) })} value={position.personId}>
          <option value="">Poste vacant</option>
          {position.candidates.map((person) => <option disabled={form.positions.some((item) => item.key !== position.key && item.personId === String(person.id))} key={person.id} value={person.id}>{personOptionLabel(person)}</option>)}
        </select>
        {!position.candidates.length ? <em>Aucun marin compatible disponible</em> : null}
      </label>)}</div>
      <footer><button className="is-secondary" onClick={onClose} type="button">Annuler</button><button disabled={isSaving || !form.positions.some((position) => position.personId)} type="submit">Créer la bordée</button></footer>
    </form>
  </div>;
}

function PlanningUnassignedPeopleList({ people, editable, pendingId, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }: {
  people: PlanningPerson[];
  editable: boolean;
  pendingId: string | null;
  onPointerDown: (event: React.PointerEvent<HTMLElement>, person: PlanningPerson) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
}) {
  if (!people.length) return <PlanningEmptySide text="Tous les marins sont affectés sur la période." />;
  return (
    <div className="planning-side-list planning-unassigned-list">
      {people.map((person) => {
        const name = formatPlanningPerson(person);
        const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
        const isPending = pendingId === `person-${person.id}`;
        return (
          <article
            aria-busy={isPending}
            aria-label={`${name}, ${person.functionLabel || person.gradeLabel || 'Marin'}. Glisser pour affecter.`}
            className={`planning-unassigned-card${editable ? ' is-draggable' : ''}${isPending ? ' is-pending' : ''}`}
            draggable={editable && !isPending}
            key={person.id}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'copy';
              event.dataTransfer.setData('application/x-seapilot-planning', JSON.stringify({ type: 'person', id: person.id }));
            }}
          >
            <button
              aria-label={`Faire glisser ${name}`}
              className="planning-person-grip"
              disabled={!editable || isPending}
              onPointerCancel={onPointerCancel}
              onPointerDown={(event) => onPointerDown(event, person)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              type="button"
            ><GripVertical aria-hidden="true" size={17} /></button>
            <span className="planning-person-avatar" aria-hidden="true">{initials || 'M'}</span>
            <span className="planning-person-copy"><strong>{name}</strong><small>{[person.functionLabel || person.gradeLabel, person.contractType].filter(Boolean).join(' · ') || 'Marin actif'}</small></span>
          </article>
        );
      })}
    </div>
  );
}

function PlanningSideContent({ sideTab, certificateAlerts, hrAlerts, overview, planningControls, unassignedPeople, unbilledProjects, editable, onOpenHandover, onOpenConflictCenter }: {
  sideTab: SideTab;
  certificateAlerts: ReturnType<typeof buildPlanningCertificateAlerts>;
  hrAlerts: ReturnType<typeof buildPlanningHrAlerts>;
  overview: ReturnType<typeof usePlanningOverview>['overview'];
  planningControls: PlanningControlResult[];
  unassignedPeople: PlanningPerson[];
  unbilledProjects: PlanningProjectRecord[];
  editable: boolean;
  onOpenHandover: (handover: PlanningHandoverRecord) => void;
  onOpenConflictCenter: () => void;
}) {
  if (sideTab === 'conflicts') {
    return <div className="planning-side-list"><button className="planning-side-conflict-center" onClick={onOpenConflictCenter} type="button"><ShieldAlert aria-hidden="true" size={17} /><span><strong>Centre de conflits P1.2</strong><small>Absences, impacts, remplacements et traitement</small></span></button>{planningControls.length ? planningControls.map((control) => <article className="planning-side-item" key={control.id}><div><strong>{control.title}</strong><span className={`planning-side-badge is-${control.level === 'blocking' ? 'danger' : control.level === 'warning' ? 'warning' : 'muted'}`}>{control.level === 'blocking' ? 'Blocage' : control.level === 'warning' ? 'Avertissement' : 'Information'}</span></div><p>{control.detail}</p>{control.date ? <small>{formatPlanningDate(control.date)}</small> : null}</article>) : <PlanningEmptySide text="Aucun contrôle P0 en attente. Ouvrez le centre pour les contrôles P1.2." />}</div>;
  }
  if (sideTab === 'unassigned') {
    return <div className="planning-side-list">{unassignedPeople.length ? unassignedPeople.map((person) => <article className={`planning-side-item${editable ? ' is-draggable' : ''}`} draggable={editable} key={person.id} onDragStart={(event) => event.dataTransfer.setData('application/x-seapilot-planning', JSON.stringify({ type: 'person', id: person.id }))}><div><strong>{formatPlanningPerson(person)}</strong><span className="planning-side-badge is-muted">{person.functionLabel || person.gradeLabel || 'Marin'}</span></div><p>{[person.gradeLabel, person.contractType].filter(Boolean).join(' · ') || 'Contrat actif'}</p>{editable ? <small>Glisser sur un navire pour affecter</small> : null}</article>) : <PlanningEmptySide text="Tous les marins sont affectés." />}</div>;
  }
  if (sideTab === 'billing') {
    return <div className="planning-side-list">{unbilledProjects.length ? unbilledProjects.map((project) => <article className="planning-side-item" key={project.id}><div><strong>{project.title}</strong><span className="planning-side-badge is-warning">{project.status || 'À planifier'}</span></div><p>{project.startsOn ? `${formatPlanningDate(project.startsOn)} – ${formatPlanningDate(project.endsOn)}` : 'Dates à planifier'}</p><p>{[project.primaryVesselName, project.secondaryVesselName].filter(Boolean).join(' · ')}</p></article>) : <PlanningEmptySide text="Aucun projet non facturé." />}</div>;
  }
  if (sideTab === 'handovers') {
    return <div className="planning-side-list">{overview.handovers.length ? overview.handovers.map((handover) => {
      const vessel = overview.vessels.find((item) => item.id === handover.vesselId);
      return <button className="planning-side-item planning-side-button" key={handover.id} onClick={() => onOpenHandover(handover)} type="button"><div><strong>{vessel?.name || `Navire #${handover.vesselId}`}</strong><span className="planning-side-badge is-muted">{handover.status}</span></div><p>{formatPlanningDateTime(handover.handoverAt)} · {handover.location}</p><small>{handover.positions.length} poste(s) comparé(s)</small></button>;
    }) : <PlanningEmptySide text="Aucune relève enregistrée." />}</div>;
  }
  if (sideTab === 'history') {
    return <PlanningHistoryList overview={overview} />;
  }
  const alerts = sideTab === 'alerts' ? hrAlerts : certificateAlerts;
  return <div className="planning-side-list">{alerts.length ? alerts.map((alert) => <article className="planning-side-item" key={alert.id}><div><strong>{alert.title}</strong><span className={`planning-side-badge is-${alert.tone}`}>{alert.statusLabel}</span></div><p>{alert.subtitle} · {formatPlanningDate(alert.date)}</p>{alert.vesselName ? <p>Navire · {alert.vesselName}</p> : null}</article>) : <PlanningEmptySide text={sideTab === 'alerts' ? 'Aucune échéance RH proche.' : 'Aucune alarme certificat.'} />}</div>;
}

function PlanningEmptySide({ text }: { text: string }) {
  return <div className="planning-side-empty"><CalendarDays aria-hidden="true" size={24} /><p>{text}</p></div>;
}

function PlanningEventDialog({ event, form, activeVessels, watchGroupOptions, controls, editable, isSaving, onChange, onClose, onSave, onDelete, onDuplicate }: { event: PlanningCrewEvent; form: EventFormState; activeVessels: PlanningVessel[]; watchGroupOptions: string[]; controls: PlanningControlResult[]; editable: boolean; isSaving: boolean; onChange: (form: EventFormState) => void; onClose: () => void; onSave: () => void; onDelete: () => void; onDuplicate: () => void }) {
  if (!editable) {
    return <div className="planning-dialog-backdrop is-side-panel" role="presentation"><section aria-modal="true" className="planning-dialog is-side-panel is-detail" role="dialog"><header><div><CalendarDays aria-hidden="true" size={20} /><h2>{event.person}</h2></div><button aria-label="Fermer" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button></header><dl><div><dt>Navire</dt><dd>{event.vessel}</dd></div><div><dt>Bordée</dt><dd>{event.board || 'Non renseignée'}</dd></div><div><dt>Période</dt><dd>{event.startsAt && event.endsAt ? `${formatPlanningDateTime(event.startsAt)} au ${formatPlanningDateTime(event.endsAt)}` : `${formatPlanningDate(event.startsOn)} au ${formatPlanningDate(event.endsOn)}`}</dd></div><div><dt>Statut</dt><dd>{planningStatusDisplayLabel(event.status)}</dd></div><div><dt>Confirmation</dt><dd>{planningConfirmationLabel(event.confirmationStatus)}</dd></div><div><dt>Fonction</dt><dd>{event.functionLabel || 'Équipage'}</dd></div><div><dt>Annotation</dt><dd>{event.comments || 'Aucune annotation'}</dd></div><div><dt>Source</dt><dd>{event.sourceLabel}</dd></div></dl><footer><button onClick={onClose} type="button">Fermer</button></footer></section></div>;
  }
  return (
    <div className="planning-dialog-backdrop is-side-panel" role="presentation">
      <form aria-modal="true" className="planning-dialog is-side-panel" onSubmit={(submitEvent) => { submitEvent.preventDefault(); onSave(); }} role="dialog">
        <header><div><Pencil aria-hidden="true" size={20} /><span><small>Formulaire complet</small><h2>Modifier · {event.person}</h2></span></div><button aria-label="Fermer" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button></header>
        <div className="planning-dialog-grid">
          <label className="is-wide">Navire<select required value={form.vesselId} onChange={(changeEvent) => onChange({ ...form, vesselId: changeEvent.target.value })}>{activeVessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vesselOptionLabel(vessel)}</option>)}</select></label>
          <label>Début<input required type={event.kind === 'assignment' ? 'datetime-local' : 'date'} value={event.kind === 'assignment' ? form.startsAt : form.startsOn} onChange={(changeEvent) => onChange({ ...form, startsAt: event.kind === 'assignment' ? changeEvent.target.value : form.startsAt, startsOn: changeEvent.target.value.slice(0, 10) })} /></label>
          <label>Fin<input disabled={event.kind === 'day'} required type={event.kind === 'assignment' ? 'datetime-local' : 'date'} value={event.kind === 'assignment' ? form.endsAt : form.endsOn} onChange={(changeEvent) => onChange({ ...form, endsAt: event.kind === 'assignment' ? changeEvent.target.value : form.endsAt, endsOn: changeEvent.target.value.slice(0, 10) })} /></label>
          <label>Statut<select value={form.statusLabel} onChange={(changeEvent) => onChange({ ...form, statusLabel: changeEvent.target.value })}>{PLANNING_STATUSES.map((status) => <option key={status} value={status}>{planningStatusDisplayLabel(status)}</option>)}</select></label>
          {event.kind === 'assignment' ? <label>Confirmation<select value={form.confirmationStatus} onChange={(changeEvent) => onChange({ ...form, confirmationStatus: changeEvent.target.value as PlanningConfirmationStatus })}><option value="provisional">Provisoire</option><option value="confirmed">Confirmée</option><option value="cancelled">Annulée</option></select></label> : null}
          <label>Fonction<input value={form.functionLabel} onChange={(changeEvent) => onChange({ ...form, functionLabel: changeEvent.target.value })} /></label>
          <label className="is-wide">Bordée / groupe<select value={form.watchGroup} onChange={(changeEvent) => onChange({ ...form, watchGroup: changeEvent.target.value })}>{uniqueSorted([...watchGroupOptions, form.watchGroup]).map((group) => <option key={group}>{group}</option>)}</select></label>
          <label className="is-wide">Annotation<textarea rows={4} value={form.comments} onChange={(changeEvent) => onChange({ ...form, comments: changeEvent.target.value })} /></label>
        </div>
        <p className="planning-dialog-source">Source · {event.sourceLabel}</p>
        <PlanningControlSummary results={controls} />
        <footer className="planning-dialog-footer-split"><span><button className="is-danger" disabled={isSaving} onClick={onDelete} type="button"><Trash2 aria-hidden="true" size={16} />{event.kind === 'assignment' ? 'Annuler l’affectation' : 'Supprimer'}</button><button className="is-secondary" disabled={isSaving} onClick={onDuplicate} type="button"><Copy aria-hidden="true" size={15} />Dupliquer</button></span><span><button className="is-secondary" onClick={onClose} type="button">Fermer</button><button disabled={isSaving} type="submit">Enregistrer</button></span></footer>
      </form>
    </div>
  );
}

const PLANNING_HISTORY_ACTION_LABELS: Record<string, string> = {
  create: 'Création',
  update: 'Modification',
  move: 'Déplacement',
  assign: 'Affectation',
  unassign: 'Désaffectation',
  submit: 'Soumission',
  validate: 'Validation',
  publish: 'Publication',
  reopen: 'Réouverture',
  archive: 'Archivage',
  cancel: 'Annulation',
  derogate: 'Exception historique',
  status_change: 'Changement de statut',
  delete: 'Suppression',
};

function planningHistoryScope(history: PlanningHistoryRecord, overview: ReturnType<typeof usePlanningOverview>['overview']): string {
  const vessel = history.vesselId === null ? null : overview.vessels.find((item) => item.id === history.vesselId);
  const dates = history.startsOn
    ? history.endsOn && history.endsOn !== history.startsOn
      ? `${formatPlanningDate(history.startsOn)} — ${formatPlanningDate(history.endsOn)}`
      : formatPlanningDate(history.startsOn)
    : '';
  return [vessel?.name, dates].filter(Boolean).join(' · ');
}

function PlanningHistoryList({ overview }: { overview: ReturnType<typeof usePlanningOverview>['overview'] }) {
  if (!overview.versions.length && !overview.history.length) {
    return <PlanningEmptySide text="Aucune version ou modification historisée." />;
  }
  return (
    <div className="planning-side-list planning-history-list">
      {overview.versions.slice(0, 10).map((version) => (
        <article className="planning-side-item planning-history-version" key={`version-${version.id}`}>
          <div>
            <strong>{`Version diffusée ${version.versionNumber}`}</strong>
            <span className="planning-side-badge is-success">Immuable</span>
          </div>
          <p>{`${version.createdByName || 'Utilisateur autorisé'} · ${formatPlanningDateTime(version.createdAt)}`}</p>
          {version.comment ? <small>{version.comment}</small> : null}
        </article>
      ))}
      {overview.history.slice(0, 80).map((history) => (
        <article className="planning-side-item" key={`history-${history.id}`}>
          <div>
            <strong>{history.summary || PLANNING_HISTORY_ACTION_LABELS[history.action] || history.action}</strong>
            <span className="planning-side-badge is-muted">{PLANNING_HISTORY_ACTION_LABELS[history.action] || history.action}</span>
          </div>
          <p>{`${history.changedByName || 'Système'} · ${formatPlanningDateTime(history.changedAt)}`}</p>
          {planningHistoryScope(history, overview) ? <small>{planningHistoryScope(history, overview)}</small> : null}
        </article>
      ))}
    </div>
  );
}

function PlanningProjectDialog({ project, form, activeVessels, editable, isQuick, isSaving, onChange, onClose, onSave, onExpand, onDuplicate, onCancel }: { project: PlanningProjectRecord | null; form: ProjectFormState; activeVessels: PlanningVessel[]; editable: boolean; isQuick: boolean; isSaving: boolean; onChange: (form: ProjectFormState) => void; onClose: () => void; onSave: () => void; onExpand: () => void; onDuplicate: () => void; onCancel: () => void }) {
  if (project && !editable) return <div className="planning-dialog-backdrop is-side-panel" role="presentation"><section aria-modal="true" className="planning-dialog is-side-panel is-detail" role="dialog"><header><div><Ship aria-hidden="true" size={20} /><h2>{project.title}</h2></div><button aria-label="Fermer" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button></header><dl><div><dt>Type</dt><dd>{planningFleetEventTypeLabel(project.eventType)}</dd></div><div><dt>Statut</dt><dd>{project.status}</dd></div><div><dt>Période</dt><dd>{formatPlanningDate(project.startsOn)} au {formatPlanningDate(project.endsOn)}</dd></div><div><dt>Navire</dt><dd>{project.primaryVesselName || 'Non renseigné'}</dd></div><div><dt>Responsable</dt><dd>{project.responsibleName || 'Non renseigné'}</dd></div><div><dt>Client</dt><dd>{project.clientName || 'Non renseigné'}</dd></div><div><dt>Description</dt><dd>{project.description || 'Aucune description'}</dd></div></dl><footer><button onClick={onClose} type="button">Fermer</button></footer></section></div>;
  return (
    <div className="planning-dialog-backdrop is-side-panel" role="presentation">
      <form aria-modal="true" className="planning-dialog is-side-panel" onSubmit={(event) => { event.preventDefault(); onSave(); }} role="dialog">
        <header><div><Ship aria-hidden="true" size={20} /><span><small>{isQuick ? 'Formulaire rapide' : 'Formulaire complet'}</small><h2>{project ? 'Modifier l’événement' : 'Nouvel événement flotte'}</h2></span></div><button aria-label="Fermer" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button></header>
        <div className="planning-dialog-grid">
          <label className="is-wide">Titre<input required value={form.title} onChange={(event) => onChange({ ...form, title: event.target.value })} /></label>
          <label>Navire<select required value={form.vesselId} onChange={(event) => onChange({ ...form, vesselId: event.target.value })}><option value="">Choisir</option>{activeVessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vesselOptionLabel(vessel)}</option>)}</select></label>
          <label>Type<select value={form.eventType} onChange={(event) => onChange({ ...form, eventType: event.target.value as PlanningFleetEventType })}>{FLEET_EVENT_TYPES.map((type) => <option key={type} value={type}>{planningFleetEventTypeLabel(type)}</option>)}</select></label>
          <label>Début<input required type="date" value={form.startsOn} onChange={(event) => onChange({ ...form, startsOn: event.target.value, endsOn: isQuick ? event.target.value : form.endsOn })} /></label>
          <label>Statut<select value={form.status} onChange={(event) => onChange({ ...form, status: event.target.value })}>{PROJECT_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
          {!isQuick ? <><label>Fin<input required type="date" value={form.endsOn} onChange={(event) => onChange({ ...form, endsOn: event.target.value })} /></label><label>Responsable<input value={form.responsibleName} onChange={(event) => onChange({ ...form, responsibleName: event.target.value })} /></label><label className="is-wide">Client<input value={form.clientName} onChange={(event) => onChange({ ...form, clientName: event.target.value })} /></label><label className="is-wide">Description<textarea rows={4} value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} /></label></> : null}
        </div>
        <footer className="planning-dialog-footer-split">
          {project ? <span><button className="is-danger" disabled={isSaving || project.status === 'Annulé'} onClick={onCancel} type="button">Annuler l’événement</button><button className="is-secondary" disabled={isSaving} onClick={onDuplicate} type="button"><Copy aria-hidden="true" size={15} />Dupliquer</button></span> : isQuick ? <button className="is-secondary" onClick={onExpand} type="button">Formulaire complet</button> : <span />}
          <span><button className="is-secondary" onClick={onClose} type="button">Fermer</button><button disabled={isSaving} type="submit">Enregistrer</button></span>
        </footer>
      </form>
    </div>
  );
}
