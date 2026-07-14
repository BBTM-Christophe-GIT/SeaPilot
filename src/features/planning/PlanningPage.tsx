import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Activity,
  CalendarDays,
  ClipboardCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Expand,
  GripVertical,
  Minus,
  Pencil,
  Plus,
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
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
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
  buildPlanningExportRows,
  formatPlanningPerson,
  getAllPlanningCrewEvents,
  getUnassignedPlanningPeople,
  getUnbilledPlanningProjects,
  evaluatePlanningAssignment,
  hasBlockingPlanningControls,
  isSedentaryPlanningFunction,
  planningPeriodTitle,
  shiftPlanningAnchor,
  timelineRange,
  type PlanningCrewEvent,
  type PlanningControlResult,
  type PlanningFilters,
  type PlanningViewMode,
} from './planningModel';
import { addPlanningDays, daysBetween, formatPlanningDate, formatPlanningDateTime, todayPlanningDate, utcToPlanningLocalDateTime } from './planningDates';
import { planningErrorMessage } from './planningErrors';
import { getPlanningConflictEventIds } from './planningOverlap';
import { getPlanningPermissions } from './planningPermissions';
import { createPlanningPreviewOverview } from './planningPreviewData';
import { findPlanningPublication, isPlanningPublicationLocked } from './planningPublication';
import {
  archivePlanningVessel,
  createPlanningDerogation,
  createPlanningAssignment,
  createPlanningProject,
  createVessel,
  deletePlanningEvent,
  fetchPlanningAssignmentOverviewRows,
  fetchPlanningDerogations,
  fetchPlanningHandovers,
  fetchPlanningHistory,
  fetchPlanningDays,
  fetchPlanningProjects,
  fetchPlanningVersions,
  mapPlanningAssignmentOverviewRows,
  mapPlanningAssignmentRows,
  revokePlanningDerogation,
  savePlanningHandover,
  savePlanningVesselDayLocation,
  transitionPlanningPublication,
  updatePlanningEvent,
  updatePlanningProject,
  type PlanningPerson,
  type PlanningConfirmationStatus,
  type PlanningFleetEventType,
  type CreatePlanningDerogationInput,
  type PlanningDerogationRecord,
  type PlanningHandoverRecord,
  type PlanningHistoryRecord,
  type PlanningPublicationAction,
  type PlanningProjectRecord,
  type PlanningVessel,
  type SavePlanningHandoverInput,
} from './planningQueries';
import { PlanningControlSummary } from './PlanningControlSummary';
import {
  PlanningDerogationDialog,
  PlanningDerogationList,
  PlanningHandoverDialog,
} from './PlanningP03Panels';
import { PlanningPublicationPanel } from './PlanningPublicationPanel';
import { PlanningP11Panel } from './PlanningP11Panel';
import type { PlanningDetectedConflict } from './planningP12';
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

interface ExportFormState { personName: string; startsOn: string; endsOn: string }

type SideTab = 'conflicts' | 'handovers' | 'derogations' | 'history' | 'certificates' | 'unassigned' | 'billing' | 'alerts';

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
  { key: 'derogations', label: 'Dérogations' },
  { key: 'history', label: 'Historique' },
  { key: 'certificates', label: 'Certificats' },
  { key: 'unassigned', label: 'Marins non affectés' },
  { key: 'billing', label: 'Facturation' },
  { key: 'alerts', label: 'Alertes' },
];

const PlanningP12Panel = lazy(() => import('./PlanningP12Panel').then((module) => ({ default: module.PlanningP12Panel })));
const PlanningP13Panel = lazy(() => import('./PlanningP13Panel').then((module) => ({ default: module.PlanningP13Panel })));
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
  } = usePlanningOverview(effectiveClient, readPermissions.canRead, previewOverview);
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
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [newVessel, setNewVessel] = useState({ name: '', acronym: '' });
  const [exportForm, setExportForm] = useState<ExportFormState>({ personName: '', startsOn: '', endsOn: '' });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showWeekends, setShowWeekends] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pendingMutationId, setPendingMutationId] = useState<string | null>(null);
  const [isHandoverOpen, setIsHandoverOpen] = useState(false);
  const [derogationPrefill, setDerogationPrefill] = useState<Partial<CreatePlanningDerogationInput> | null>(null);
  const [isP11Open, setIsP11Open] = useState(false);
  const [isP12Open, setIsP12Open] = useState(false);
  const [isP13Open, setIsP13Open] = useState(false);
  const [isP21Open, setIsP21Open] = useState(false);
  const [isP22Open, setIsP22Open] = useState(false);
  const [touchPersonDrag, setTouchPersonDrag] = useState<{ person: PlanningPerson; x: number; y: number } | null>(null);
  const [touchDropTarget, setTouchDropTarget] = useState<{ vesselId: number; date: string } | null>(null);
  const [collapsedFleetNodes, setCollapsedFleetNodes] = useState<Set<string>>(() => new Set());
  const touchDropTargetRef = useRef<{ vesselId: number; date: string } | null>(null);

  useEffect(() => {
    const handleFullscreen = () => setIsFullscreen(document.fullscreenElement === workspaceRef.current);
    document.addEventListener('fullscreenchange', handleFullscreen);
    return () => document.removeEventListener('fullscreenchange', handleFullscreen);
  }, []);

  const timelineDays = useMemo(() => buildPlanningTimeline(anchorDate, viewMode), [anchorDate, viewMode]);
  const days = useMemo(
    () => showWeekends ? timelineDays : timelineDays.filter((day) => !day.isWeekend),
    [showWeekends, timelineDays],
  );
  const monthSegments = useMemo(() => buildPlanningMonthSegments(days), [days]);
  const range = useMemo(() => timelineRange(timelineDays), [timelineDays]);
  const publicationVessel = useMemo(
    () => overview.vessels.find((vessel) => vessel.name === filters.vesselName) || null,
    [filters.vesselName, overview.vessels],
  );
  const publicationVesselId = filters.vesselName ? publicationVessel?.id ?? null : null;
  const activePublication = useMemo(
    () => findPlanningPublication(overview.publications, range, publicationVesselId),
    [overview.publications, publicationVesselId, range],
  );
  const isPeriodLocked = isPlanningPublicationLocked(activePublication);
  const permissions = getPlanningPermissions(effectiveRoles, isPeriodLocked);
  const isPlanningAssistantEnabled = assistantFeatureEnabled ?? PLANNING_ASSISTANT_ENABLED;
  const isPlanningPredictionsEnabled = predictionsFeatureEnabled ?? PLANNING_PREDICTIONS_ENABLED;
  const { access: assistantAccess, isLoading: isAssistantAccessLoading } = usePlanningAssistantAccess(
    effectiveClient,
    isPlanningAssistantEnabled || isPlanningPredictionsEnabled,
    permissions.canBeAssistantPilot,
  );
  const canEditPlanning = permissions.canEditEvents;
  const publicationTargetVesselId = activePublication ? activePublication.vesselId : publicationVesselId;
  const captainHasVesselScope = !effectiveRoles.includes('capitaine')
    || effectiveRoles.some((role) => role === 'admin' || role === 'direction')
    || publicationTargetVesselId !== null;
  const allowedPublicationActions = useMemo(() => {
    const actions: PlanningPublicationAction[] = [];
    if (permissions.canSubmitPublication) actions.push('submit');
    if (permissions.canValidatePublication && captainHasVesselScope) actions.push('validate');
    if (permissions.canPublishPublication) actions.push('publish');
    if (permissions.canReopenPublication) actions.push('reopen');
    if (permissions.canArchivePublication) actions.push('archive');
    return actions;
  }, [captainHasVesselScope, permissions.canArchivePublication, permissions.canPublishPublication, permissions.canReopenPublication, permissions.canSubmitPublication, permissions.canValidatePublication]);
  const canManagePublication = permissions.canManagePublication
    && allowedPublicationActions.length > 0
    && (!filters.vesselName || publicationVessel !== null);
  const visibleSideTabs = useMemo(
    () => SIDE_TABS.filter((tab) => tab.key !== 'history' || permissions.canViewHistory),
    [permissions.canViewHistory],
  );
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
  const fleetVesselCount = useMemo(
    () => fleetRows.filter((row) => row.type === 'vessel').length,
    [fleetRows],
  );
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
  const allPlanningCrewEvents = useMemo(() => getAllPlanningCrewEvents(overview), [overview]);
  const conflictEventIds = useMemo(() => getPlanningConflictEventIds(overview), [overview]);
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
    derogations: overview.derogations.filter((derogation) => derogation.status === 'active').length,
    history: overview.history.length,
    certificates: certificateAlerts.filter((alert) => alert.tone === 'danger').length || certificateAlerts.length,
    unassigned: unassignedPeople.length,
    billing: unbilledProjects.length,
    alerts: hrAlerts.length,
  };

  async function handlePublicationAction(action: PlanningPublicationAction, comment: string): Promise<boolean> {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const publication = await transitionPlanningPublication(effectiveClient, {
        action,
        publicationId: activePublication?.id ?? null,
        startsOn: range.start,
        endsOn: range.end,
        vesselId: publicationVesselId,
        comment,
      });
      const [versions, history] = await Promise.all([
        fetchPlanningVersions(effectiveClient),
        fetchPlanningHistory(effectiveClient),
      ]);
      updateOverview((current) => ({
        ...current,
        publications: current.publications.some((item) => item.id === publication.id)
          ? current.publications.map((item) => item.id === publication.id ? publication : item)
          : [publication, ...current.publications],
        versions,
        history,
      }));
      const messages: Record<PlanningPublicationAction, string> = {
        submit: 'Période soumise et verrouillée pour validation.',
        validate: 'Planning validé. Il peut maintenant être publié.',
        publish: `Planning publié en version ${publication.currentVersion}.`,
        reopen: 'Période réouverte. La justification a été historisée.',
        archive: 'Période archivée.',
      };
      setStatusMessage(messages[action]);
      return true;
    } catch (error) {
      setErrorMessage(planningErrorMessage(error, 'Impossible de mettre à jour la publication du planning.'));
      return false;
    } finally {
      setIsSaving(false);
    }
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

  async function assignPersonByDrop(personId: number, lane: PlanningFleetLane, date: string) {
    if (!canEditPlanning || lane.vesselId === null) {
      setErrorMessage('Cette période est verrouillée ou ce navire ne peut pas recevoir une affectation.');
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
      startsOn: date,
      endsOn: date,
      startsAt: localDateTime(date, '08:00'),
      endsAt: localDateTime(date, '20:00'),
      assignmentRole: person.functionLabel || 'Équipage',
      confirmationStatus: 'provisional',
    };
    const controls = evaluatePlanningAssignment(overview, {
      id: 'drop-assignment',
      personId: person.id,
      person: formatPlanningPerson(person),
      vessel: lane.vessel,
      functionLabel: input.assignmentRole,
      status: input.statusLabel,
      startsOn: date,
      endsOn: date,
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
      setStatusMessage(`${formatPlanningPerson(person)} est affecté provisoirement à ${lane.label} le ${formatPlanningDate(date)}. Ouvrez la vue Équipages pour ajuster la durée.`);
    } catch (error) {
      setErrorMessage(planningErrorMessage(error, "Impossible d'affecter ce marin par glisser-déposer."));
    } finally {
      setPendingMutationId(null);
    }
  }

  async function saveVesselLocation(lane: PlanningFleetLane, date: string, location: string): Promise<boolean> {
    if (!canEditPlanning || lane.vesselId === null) return false;
    setErrorMessage(null);
    try {
      await savePlanningVesselDayLocation(effectiveClient, { vesselId: lane.vesselId, workDate: date, location });
      const daysData = await fetchPlanningDays(effectiveClient);
      updateOverview((current) => ({ ...current, days: daysData }));
      setStatusMessage(location.trim() ? `Lieu enregistré pour ${lane.label} le ${formatPlanningDate(date)}.` : `Lieu supprimé pour ${lane.label} le ${formatPlanningDate(date)}.`);
      return true;
    } catch (error) {
      setErrorMessage(planningErrorMessage(error, 'Impossible d’enregistrer le lieu quotidien.'));
      return false;
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
    const date = dropElement?.dataset.planningPersonDropDate || '';
    const target = Number.isSafeInteger(vesselId) && vesselId > 0 && date ? { vesselId, date } : null;
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
    if (lane) void assignPersonByDrop(personId, lane, target.date);
  }

  function cancelTouchPersonDrag() {
    setTouchPersonDrag(null);
    setTouchDropTarget(null);
    touchDropTargetRef.current = null;
  }

  function openAssignment(prefill?: Partial<AssignmentFormState>, quick = false) {
    if (!canEditPlanning) {
      setErrorMessage('Cette période est verrouillée. Réouvrez-la avant de créer une affectation.');
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
      setErrorMessage('Cette période est verrouillée. Réouvrez-la avant de créer un événement flotte.');
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
      setErrorMessage('Cette période est verrouillée. Réouvrez-la avant de créer une affectation.');
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
    setEventForm({
      vesselId: vessel ? String(vessel.id) : '', startsOn: event.startsOn, endsOn: event.endsOn,
      startsAt: event.startsAt ? utcToPlanningLocalDateTime(event.startsAt) : localDateTime(event.startsOn, '08:00'),
      endsAt: event.endsAt ? utcToPlanningLocalDateTime(event.endsAt) : localDateTime(event.endsOn, '20:00'),
      statusLabel: event.status, confirmationStatus: event.confirmationStatus,
      functionLabel: event.functionLabel, watchGroup: event.board, comments: event.comments,
    });
  }

  async function saveEvent(event: PlanningCrewEvent, form: EventFormState, closePanel = true) {
    if (!canEditPlanning) return setErrorMessage('Cette période est verrouillée. Réouvrez-la avant toute modification.');
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
    if (!canEditPlanning) return setErrorMessage('Cette période est verrouillée. Réouvrez-la avant toute suppression.');
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
    if (!canEditPlanning) return setErrorMessage('Cette période est verrouillée. Réouvrez-la avant de modifier un événement flotte.');
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
    const history = await fetchPlanningHistory(effectiveClient);
    updateOverview((current) => ({ ...current, history }));
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

  function openP12Derogation(conflict: PlanningDetectedConflict) {
    if (!permissions.canManageDerogations || !conflict.personId || !conflict.vesselId) return;
    const ruleCodeByConflict: Partial<Record<PlanningDetectedConflict['type'], string>> = {
      double_assignment: 'assignment_overlap',
      absence: 'crew_absence',
      unavailability: 'crew_unavailability',
      invalid_certificate: 'expired_credential',
      missing_qualification: 'missing_qualification',
    };
    const rule = overview.rules.find((item) => item.code === ruleCodeByConflict[conflict.type])
      || overview.rules.find((item) => item.active);
    const assignment = conflict.assignmentId
      ? overview.assignments.find((item) => item.id === conflict.assignmentId)
      : null;
    setIsP12Open(false);
    setDerogationPrefill({
      ruleId: rule ? String(rule.id) : '',
      assignmentId: conflict.assignmentId,
      personId: String(conflict.personId),
      vesselId: String(conflict.vesselId),
      startsAt: assignment?.startsAt
        ? utcToPlanningLocalDateTime(assignment.startsAt)
        : localDateTime(conflict.startsOn, '08:00'),
      endsAt: assignment?.endsAt
        ? utcToPlanningLocalDateTime(assignment.endsAt)
        : localDateTime(conflict.endsOn, '20:00'),
    });
  }

  function openDerogation(controls: PlanningControlResult[], assignmentId?: number) {
    if (!permissions.canManageDerogations) {
      setErrorMessage('Seuls les utilisateurs autorisés peuvent enregistrer une dérogation.');
      return;
    }
    const control = controls.find((item) => item.level === 'blocking') || controls.find((item) => item.level === 'warning');
    const rule = control ? overview.rules.find((item) => item.code === control.code) : overview.rules.find((item) => item.active);
    const source = selectedEvent && eventForm ? {
      personId: selectedEvent.personId ? String(selectedEvent.personId) : '',
      vesselId: eventForm.vesselId,
      startsAt: eventForm.startsAt,
      endsAt: eventForm.endsAt,
    } : {
      personId: assignmentForm.crewPersonId,
      vesselId: assignmentForm.vesselId,
      startsAt: assignmentForm.startsAt,
      endsAt: assignmentForm.endsAt,
    };
    setDerogationPrefill({
      ruleId: rule ? String(rule.id) : '',
      assignmentId: assignmentId ?? null,
      ...source,
    });
  }

  async function handleCreateDerogation(input: CreatePlanningDerogationInput) {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await createPlanningDerogation(effectiveClient, input);
      const data = await fetchPlanningDerogations(effectiveClient);
      updateOverview((current) => ({ ...current, derogations: data.derogations, derogationHistory: data.history }));
      setDerogationPrefill(null);
      setStatusMessage('Dérogation enregistrée et historisée. Les contrôles ont été recalculés.');
    } catch (error) {
      setErrorMessage(planningErrorMessage(error, 'Impossible d’enregistrer cette dérogation.'));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRevokeDerogation(derogation: PlanningDerogationRecord) {
    if (!window.confirm('Révoquer cette dérogation ? Cette action sera historisée.')) return;
    setIsSaving(true);
    try {
      await revokePlanningDerogation(effectiveClient, derogation.id);
      const data = await fetchPlanningDerogations(effectiveClient);
      updateOverview((current) => ({ ...current, derogations: data.derogations, derogationHistory: data.history }));
      setStatusMessage('Dérogation révoquée et historisée.');
    } catch (error) {
      setErrorMessage(planningErrorMessage(error, 'Impossible de révoquer cette dérogation.'));
    } finally {
      setIsSaving(false);
    }
  }

  function exportPlanning(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rowsToExport = buildPlanningExportRows(overview, exportForm.personName, { start: exportForm.startsOn, end: exportForm.endsOn });
    const headers = ['Date', 'Marin', 'Jour travaillé', 'Statut', 'Fonction', 'Navire', 'Bordée', 'Annotation', 'Source'];
    const escape = (value: string) => `"${String(value || '').replaceAll('"', '""')}"`;
    const csv = [headers, ...rowsToExport.map((row) => [row.date, row.person, row.worked, row.status, row.functionLabel, row.vessel, row.watchGroup, row.comments, row.source])]
      .map((line) => line.map(escape).join(';')).join('\r\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    link.download = `planning-${exportForm.personName.replaceAll(' ', '-')}-${exportForm.startsOn}-${exportForm.endsOn}.csv`; link.click(); URL.revokeObjectURL(link.href);
    setStatusMessage(`${rowsToExport.length} journée(s) exportée(s).`); setIsExportOpen(false);
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
    }, true);
  }

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
        <div className="planning-command-actions">
          <span className={canEditPlanning ? 'planning-mode-write' : isPeriodLocked ? 'planning-mode-locked' : 'planning-mode-read'}>
            {canEditPlanning ? 'Modification' : isPeriodLocked ? 'Verrouillé' : 'Lecture seule'}
          </span>
          <button aria-busy={isRefreshing} className="planning-command-button" disabled={isRefreshing} onClick={() => void loadPlanning()} type="button">
            <RefreshCw aria-hidden="true" size={18} />
            {isRefreshing ? 'Actualisation…' : 'Actualiser'}
          </button>
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

      <PlanningPublicationPanel
        allowedActions={allowedPublicationActions}
        canManage={canManagePublication}
        isSaving={isSaving}
        onAction={handlePublicationAction}
        publication={activePublication}
        range={range}
        scopeLabel={publicationVessel?.name || 'Flotte complète'}
      />

      <div className="planning-layout">
        <section className="planning-board-card" aria-label="Calendrier des affectations">
          <div className="planning-board-toolbar">
            <div className="planning-toolbar-main">
              <div className="planning-perspective-switch" aria-label="Vue du planning" role="tablist">
                <button aria-selected={perspective === 'fleet'} className={perspective === 'fleet' ? 'is-active' : ''} onClick={() => changePerspective('fleet')} role="tab" type="button">Flotte</button>
                <button aria-selected={perspective === 'crew'} className={perspective === 'crew' ? 'is-active' : ''} onClick={() => changePerspective('crew')} role="tab" type="button">Équipages</button>
              </div>
              {canEditPlanning ? (
                <button className="planning-primary-action" onClick={() => perspective === 'fleet' ? openFleetEvent() : openAssignment()} type="button">
                  <Plus aria-hidden="true" size={17} />{perspective === 'fleet' ? 'Nouveau projet' : 'Créer une affectation'}
                </button>
              ) : null}
              <button aria-expanded={isFiltersOpen} className={`planning-filter-toggle${isFiltersOpen ? ' is-active' : ''}`} onClick={() => setIsFiltersOpen((value) => !value)} type="button">
                <SlidersHorizontal aria-hidden="true" size={17} />Filtres{activeFilterCount ? <span>{activeFilterCount}</span> : null}
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
              <div className="planning-period-controls">
                <button aria-label="Période précédente" className="planning-icon-button" onClick={() => setAnchorDate((value) => shiftPlanningAnchor(value, viewMode, -1))} type="button"><ChevronLeft aria-hidden="true" size={18} /></button>
                <label><span>Date de référence</span><input aria-label="Date de référence" onChange={(event) => setAnchorDate(event.target.value)} type="date" value={anchorDate} /></label>
                <button className="planning-today-button" onClick={() => setAnchorDate(todayDate)} type="button">Aujourd’hui</button>
                <button aria-label="Période suivante" className="planning-icon-button" onClick={() => setAnchorDate((value) => shiftPlanningAnchor(value, viewMode, 1))} type="button"><ChevronRight aria-hidden="true" size={18} /></button>
              </div>
              <div className="planning-tools-anchor">
                <button aria-expanded={isSettingsOpen} className="planning-tools-button" onClick={() => setIsSettingsOpen((value) => !value)} type="button"><Wrench aria-hidden="true" size={17} />Outils</button>
                {isSettingsOpen ? (
                  <div className="planning-tools-popover">
                    <strong>Suivi opérationnel</strong>
                    {visibleSideTabs.filter((tab) => tab.key !== 'unassigned').map((tab) => <button key={tab.key} onClick={() => { setSideTab(tab.key); setIsOperationalPanelOpen(true); setIsSettingsOpen(false); }} type="button">{tab.label}{tabCounts[tab.key] ? <span>{Math.min(99, tabCounts[tab.key])}</span> : null}</button>)}
                    <hr />
                    <label><input checked={showWeekends} onChange={(event) => setShowWeekends(event.target.checked)} type="checkbox" />Afficher les week-ends</label>
                    {permissions.canManageVessels ? <button onClick={() => { setIsVesselsOpen(true); setIsSettingsOpen(false); }} type="button"><Ship aria-hidden="true" size={16} />Gérer les navires</button> : null}
                    <button onClick={() => { setIsP11Open(true); setIsSettingsOpen(false); }} type="button"><CalendarDays aria-hidden="true" size={16} />Rotations et armement</button>
                    <button onClick={() => { setIsP12Open(true); setIsSettingsOpen(false); }} type="button"><ShieldAlert aria-hidden="true" size={16} />Absences et conflits</button>
                    {permissions.canViewDashboard || permissions.canViewWorkRest ? <button onClick={() => { setIsP13Open(true); setIsSettingsOpen(false); }} type="button"><Activity aria-hidden="true" size={16} />Cockpit métier P1.3</button> : null}
                    {isPlanningAssistantEnabled && assistantAccess.hasAccess ? <button onClick={() => { setIsP21Open(true); setIsSettingsOpen(false); }} type="button"><Sparkles aria-hidden="true" size={16} />Assistant Planning</button> : null}
                    {isPlanningPredictionsEnabled && assistantAccess.hasAccess ? <button onClick={() => { setIsP22Open(true); setIsSettingsOpen(false); }} type="button"><Activity aria-hidden="true" size={16} />Prévisions et scénarios</button> : null}
                    {(isPlanningAssistantEnabled || isPlanningPredictionsEnabled) && permissions.canBeAssistantPilot && isAssistantAccessLoading ? <button disabled type="button"><Sparkles aria-hidden="true" size={16} />Vérification de l’accès…</button> : null}
                    {permissions.canManageHandovers ? <button onClick={() => { openHandover(); setIsSettingsOpen(false); }} type="button"><ClipboardCheck aria-hidden="true" size={16} />Créer une relève</button> : null}
                    {permissions.canManageDerogations ? <button onClick={() => { setDerogationPrefill({ startsAt: localDateTime(range.start || anchorDate, '08:00'), endsAt: localDateTime(range.start || anchorDate, '20:00') }); setIsSettingsOpen(false); }} type="button"><ShieldAlert aria-hidden="true" size={16} />Créer une dérogation</button> : null}
                    {permissions.canExport ? <button onClick={() => { setExportForm({ personName: personOptions[0] || '', startsOn: range.start, endsOn: range.end }); setIsExportOpen(true); setIsSettingsOpen(false); }} type="button"><Download aria-hidden="true" size={16} />Exporter un marin</button> : null}
                    <button onClick={() => { void toggleFullscreen(); setIsSettingsOpen(false); }} type="button"><Expand aria-hidden="true" size={16} />{isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}</button>
                  </div>
                ) : null}
              </div>
            </div>

            {isFiltersOpen ? <div className="planning-filter-strip" aria-label="Filtres du planning">
              <label className="planning-select-control"><Ship aria-hidden="true" size={16} /><span className="sr-only">Filtre navire</span><select aria-label="Filtre navire" onChange={(event) => setFilters((current) => ({ ...current, vesselName: event.target.value }))} value={filters.vesselName}><option value="">Tous les navires</option>{vesselOptions.map((value) => <option key={value}>{value}</option>)}</select><ChevronDown aria-hidden="true" size={14} /></label>
              {perspective === 'crew' ? <label className="planning-select-control"><Search aria-hidden="true" size={16} /><span className="sr-only">Filtre marin</span><select aria-label="Filtre marin" onChange={(event) => setFilters((current) => ({ ...current, personName: event.target.value }))} value={filters.personName}><option value="">Tous les marins</option>{personOptions.map((value) => <option key={value}>{value}</option>)}</select><ChevronDown aria-hidden="true" size={14} /></label> : null}
              <label className="planning-select-control"><span className="sr-only">Filtre type</span><select aria-label="Filtre type d’événement" onChange={(event) => setFilters((current) => ({ ...current, eventType: event.target.value }))} value={filters.eventType}><option value="">Tous les types</option>{perspective === 'fleet' ? FLEET_EVENT_TYPES.map((type) => <option key={type} value={type}>{planningFleetEventTypeLabel(type)}</option>) : ['assignment', 'rest', 'leave', 'training', 'unavailability'].map((type) => <option key={type} value={type}>{planningCrewEventTypeLabel(type)}</option>)}</select><ChevronDown aria-hidden="true" size={14} /></label>
              <label className="planning-select-control"><span className="sr-only">Filtre statut</span><select aria-label="Filtre statut" onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} value={filters.status}><option value="">Tous les statuts</option>{statusOptions.map((status) => <option key={status} value={status}>{status === 'provisional' || status === 'confirmed' || status === 'cancelled' ? planningConfirmationLabel(status) : status}</option>)}</select><ChevronDown aria-hidden="true" size={14} /></label>
              <label className="planning-select-control"><span className="sr-only">Filtre responsable</span><select aria-label="Filtre responsable" onChange={(event) => setFilters((current) => ({ ...current, responsible: event.target.value }))} value={filters.responsible}><option value="">Tous les responsables</option>{responsibleOptions.map((value) => <option key={value}>{value}</option>)}</select><ChevronDown aria-hidden="true" size={14} /></label>
              <button className="planning-filter-reset" disabled={!activeFilterCount} onClick={() => setFilters(EMPTY_FILTERS)} type="button"><X aria-hidden="true" size={14} />Réinitialiser</button>
            </div> : null}
          </div>

          <div className="planning-board-titlebar">
            <strong>{planningPeriodTitle(days, viewMode)}</strong>
            <div className="planning-board-guide" aria-label="Légende et gestes du planning">
              {perspective === 'fleet' ? <><span><i className="is-operation" />Opération</span><span><i className="is-maintenance" />Maintenance</span><span><i className="is-unavailability" />Indisponibilité</span></> : <><span><i className="is-sea" />En mer</span><span><i className="is-shore" />À terre</span><span><i className="is-provisional" />Provisoire</span></>}
              <span><i className="is-conflict" />Conflit</span>
              {canEditPlanning ? <small>{perspective === 'fleet' ? 'Cliquez un lieu pour le modifier · Glissez un marin sur un jour pour l’affecter' : 'Cliquez une zone vide pour ajouter · Glissez pour déplacer'}</small> : null}
            </div>
            <div className="planning-board-stats">
              {perspective === 'crew' && conflictEventIds.size ? <span className="is-conflict" aria-label="Conflits planning">{conflictEventIds.size} conflit(s)</span> : null}
              <span>{perspective === 'fleet' ? `${fleetVesselCount} navire(s) avec équipage` : `${crewLanes.length} ligne(s)`}</span>
              <span>{perspective === 'fleet' ? `${overview.projects.length} événement(s)` : `${allPlanningCrewEvents.length} période(s)`}</span>
            </div>
          </div>

          <div className="planning-calendar-scroll" data-planning-view-mode={viewMode} style={timelineStyle(effectiveDayWidth, days.length)} tabIndex={0}>
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
                      key={row.key}
                      lane={lane}
                      onAssignPerson={(personId, targetLane, date) => void assignPersonByDrop(personId, targetLane, date)}
                      onMove={(projectId, targetLane, date) => void moveProject(projectId, targetLane, date)}
                      onOpen={openProjectEditor}
                      onResize={(project, edge, delta) => void resizeProject(project, edge, delta)}
                      onSaveLocation={saveVesselLocation}
                      onToggle={() => toggleFleetNode(row.key)}
                      pendingId={pendingMutationId}
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
                      expanded={!collapsedFleetNodes.has(row.key)}
                      key={row.key}
                      onToggle={() => toggleFleetNode(row.key)}
                      vessel={row.vessel}
                    />
                  );
                }
                const lane: PlanningCrewLane = {
                  key: row.key,
                  label: row.label,
                  detail: '',
                  personId: row.personId,
                  watchGroup: row.board,
                  events: row.events,
                };
                return (
                  <PlanningCrewTimelineRow
                    conflictEventIds={conflictEventIds}
                    dayWidth={effectiveDayWidth}
                    days={days}
                    editable={canEditPlanning}
                    hierarchy
                    key={row.key}
                    lane={lane}
                    onCreate={openLaneAssignment}
                    onMove={(event, date) => void moveEvent(event, date)}
                    onOpen={openEvent}
                    onResize={(event, edge, delta) => void resizeEvent(event, edge, delta)}
                    pendingId={pendingMutationId}
                    viewMode={viewMode}
                  />
                );
              }) : null}
              {perspective === 'crew' && crewLanes.length ? crewLanes.map((lane) => (
                <PlanningCrewTimelineRow
                  conflictEventIds={conflictEventIds}
                  dayWidth={effectiveDayWidth}
                  days={days}
                  editable={canEditPlanning}
                  key={lane.key}
                  lane={lane}
                  onCreate={openLaneAssignment}
                  onMove={(event, date) => void moveEvent(event, date)}
                  onOpen={openEvent}
                  onResize={(event, edge, delta) => void resizeEvent(event, edge, delta)}
                  pendingId={pendingMutationId}
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
              <PlanningSideContent certificateAlerts={certificateAlerts} hrAlerts={hrAlerts} onOpenHandover={(handover) => openHandover(handover)} onOpenConflictCenter={() => setIsP12Open(true)} onRevokeDerogation={(derogation) => void handleRevokeDerogation(derogation)} overview={overview} planningControls={planningControls} sideTab={sideTab} unassignedPeople={unassignedPeople} unbilledProjects={unbilledProjects} editable={canEditPlanning} canManageDerogations={permissions.canManageDerogations} />
            </>
          ) : (
            <>
              <header className="planning-side-heading is-unassigned"><div><UsersRound aria-hidden="true" size={20} /><span><small>Affectation rapide</small><strong>Marins non affectés <em>{unassignedPeople.length}</em></strong></span></div></header>
              <p className="planning-unassigned-help">Glissez un marin sur le jour d’un navire pour l’affecter provisoirement.</p>
              <PlanningUnassignedPeopleList editable={canEditPlanning} onPointerCancel={cancelTouchPersonDrag} onPointerDown={beginTouchPersonDrag} onPointerMove={moveTouchPersonDrag} onPointerUp={endTouchPersonDrag} pendingId={pendingMutationId} people={unassignedPeople} />
            </>
          )}
        </aside> : null}
      </div>

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
              <label>Statut<select aria-label="Statut" onChange={(event) => setAssignmentForm((current) => ({ ...current, statusLabel: event.target.value }))} value={assignmentForm.statusLabel}>{PLANNING_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
              <label>Confirmation<select aria-label="Confirmation" onChange={(event) => setAssignmentForm((current) => ({ ...current, confirmationStatus: event.target.value as PlanningConfirmationStatus }))} value={assignmentForm.confirmationStatus}><option value="provisional">Provisoire</option><option value="confirmed">Confirmée</option></select></label>
              {!isAssignmentQuick ? <><label>Capitaine<select aria-label="Capitaine" onChange={(event) => setAssignmentForm((current) => ({ ...current, captainPersonId: event.target.value }))} value={assignmentForm.captainPersonId}><option value="">Aucun</option>{activePeople.map((person) => <option key={person.id} value={person.id}>{personOptionLabel(person)}</option>)}</select></label><label>Fonction<input aria-label="Fonction" onChange={(event) => setAssignmentForm((current) => ({ ...current, assignmentRole: event.target.value }))} value={assignmentForm.assignmentRole} /></label><label>Bordée / groupe<select aria-label="Bordée" onChange={(event) => setAssignmentForm((current) => ({ ...current, watchGroup: event.target.value }))} value={assignmentForm.watchGroup}>{uniqueSorted([...watchGroupOptions, assignmentForm.watchGroup]).map((group) => <option key={group}>{group}</option>)}</select></label><label className="is-wide">Annotation<textarea aria-label="Annotation" onChange={(event) => setAssignmentForm((current) => ({ ...current, comments: event.target.value }))} value={assignmentForm.comments} /></label></> : null}
            </div>
            <PlanningControlSummary results={assignmentControls} />
            {permissions.canManageDerogations && assignmentControls.some((control) => control.level !== 'information') ? <button className="planning-derogation-action" onClick={() => openDerogation(assignmentControls)} type="button"><ShieldAlert aria-hidden="true" size={16} />Créer une dérogation encadrée</button> : null}
            <footer>{isAssignmentQuick ? <button className="is-secondary" onClick={() => { setIsAssignmentQuick(false); setAssignmentForm((current) => ({ ...current, endsOn: current.endsOn || current.startsOn })); }} type="button">Formulaire complet</button> : <span />}<span><button className="is-secondary" onClick={() => setIsAssignmentOpen(false)} type="button">Annuler</button><button disabled={isSaving} type="submit">Ajouter</button></span></footer>
          </form>
        </div>
      ) : null}

      {selectedEvent && eventForm ? <PlanningEventDialog activeVessels={activeVessels} controls={selectedEventControls} editable={canEditPlanning} event={selectedEvent} form={eventForm} isSaving={isSaving} onChange={setEventForm} onClose={() => { setSelectedEvent(null); setEventForm(null); }} onDelete={() => void removeEvent(selectedEvent)} onDerogation={permissions.canManageDerogations ? () => openDerogation(selectedEventControls, selectedEvent.kind === 'assignment' ? Number(selectedEvent.id.split('-').pop()) : undefined) : undefined} onDuplicate={duplicateSelectedEvent} onSave={() => void saveEvent(selectedEvent, eventForm)} watchGroupOptions={watchGroupOptions} /> : null}
      {isHandoverOpen ? <PlanningHandoverDialog editable={permissions.canManageHandovers} handover={selectedHandover} isSaving={isSaving} onClose={() => { setIsHandoverOpen(false); setSelectedHandover(null); }} onSave={(input) => void handleSaveHandover(input)} overview={overview} /> : null}
      {isP11Open ? <PlanningP11Panel canManageManning={permissions.canManageManning} canManageRotations={permissions.canManageRotations} canManageTemplates={permissions.canManageTemplates} client={effectiveClient} onClose={() => setIsP11Open(false)} onOperationalChange={handleP11OperationalChange} overview={overview} range={range} /> : null}
      {isP12Open ? <Suspense fallback={<div className="planning-dialog-backdrop is-side-panel"><div className="admin-state" role="status">Chargement du centre de conflits…</div></div>}><PlanningP12Panel canManageConflictCases={permissions.canManageConflictCases} canManageDerogations={permissions.canManageDerogations} canPrepareReplacements={permissions.canPrepareReplacements} canRequestAbsences={permissions.canRequestAbsences} canReviewAbsences={permissions.canReviewAbsences} client={effectiveClient} onAuditChange={handleP12AuditChange} onClose={() => setIsP12Open(false)} onCreateDerogation={openP12Derogation} onOpenSource={openP12Source} onPrepareReplacement={prepareManualReplacement} overview={overview} range={range} /></Suspense> : null}
      {isP13Open ? <Suspense fallback={<div className="planning-dialog-backdrop is-side-panel"><div className="admin-state" role="status">Chargement du cockpit métier…</div></div>}><PlanningP13Panel canExport={permissions.canExport} canManageDependencies={permissions.canManageDependencies} canManageWorkRestPolicies={permissions.canManageWorkRestPolicies} canRefreshNotifications={permissions.canRefreshNotifications} canViewDashboard={permissions.canViewDashboard} canViewNotifications={permissions.canViewNotifications} canViewWorkRest={permissions.canViewWorkRest} client={effectiveClient} onAuditChange={handleP12AuditChange} onClose={() => setIsP13Open(false)} overview={overview} range={range} /></Suspense> : null}
      {isP21Open && assistantAccess.hasAccess ? <Suspense fallback={<div className="planning-dialog-backdrop is-side-panel"><div className="admin-state" role="status">Chargement de l’assistant Planning…</div></div>}><PlanningP21Panel access={assistantAccess} client={effectiveClient} onAuditChange={handleP12AuditChange} onClose={() => setIsP21Open(false)} overview={overview} range={range} /></Suspense> : null}
      {isP22Open && assistantAccess.hasAccess ? <Suspense fallback={<div className="planning-dialog-backdrop is-side-panel"><div className="admin-state" role="status">Chargement des prévisions…</div></div>}><PlanningP22Panel access={assistantAccess} client={effectiveClient} onClose={() => setIsP22Open(false)} overview={overview} range={range} /></Suspense> : null}
      {derogationPrefill ? <PlanningDerogationDialog isSaving={isSaving} onClose={() => setDerogationPrefill(null)} onSave={(input) => void handleCreateDerogation(input)} overview={overview} prefill={derogationPrefill} /> : null}
      {isProjectOpen ? <PlanningProjectDialog activeVessels={activeVessels} editable={canEditPlanning} form={projectForm} isQuick={isProjectQuick} isSaving={isSaving} onCancel={() => void cancelProject()} onChange={setProjectForm} onClose={() => { setSelectedProject(null); setIsProjectOpen(false); }} onDuplicate={duplicateSelectedProject} onExpand={() => setIsProjectQuick(false)} onSave={() => void saveProject(projectForm)} project={selectedProject} /> : null}
      {isVesselsOpen ? <div className="planning-dialog-backdrop" role="presentation"><section aria-modal="true" className="planning-dialog planning-vessel-dialog" role="dialog"><header><div><Ship aria-hidden="true" size={20} /><h2>Gérer les navires</h2></div><button aria-label="Fermer" onClick={() => setIsVesselsOpen(false)} type="button"><X aria-hidden="true" size={18} /></button></header><form className="planning-inline-form" onSubmit={addVessel}><label>Nom<input required value={newVessel.name} onChange={(event) => setNewVessel((current) => ({ ...current, name: event.target.value }))} /></label><label>Indicatif<input value={newVessel.acronym} onChange={(event) => setNewVessel((current) => ({ ...current, acronym: event.target.value }))} /></label><button disabled={isSaving} type="submit"><Plus aria-hidden="true" size={16} />Ajouter</button></form><div className="planning-vessel-list">{activeVessels.map((vessel) => <div key={vessel.id}><span><strong>{vessel.name}</strong><small>{vessel.acronym || 'Sans indicatif'}</small></span><button aria-label={`Retirer ${vessel.name}`} onClick={() => void archiveVessel(vessel)} type="button"><Trash2 aria-hidden="true" size={16} /></button></div>)}</div></section></div> : null}
      {isExportOpen ? <div className="planning-dialog-backdrop" role="presentation"><form className="planning-dialog" onSubmit={exportPlanning}><header><div><Download aria-hidden="true" size={20} /><h2>Exporter les données d’un marin</h2></div><button aria-label="Fermer" onClick={() => setIsExportOpen(false)} type="button"><X aria-hidden="true" size={18} /></button></header><div className="planning-dialog-grid"><label className="is-wide">Marin<select required value={exportForm.personName} onChange={(event) => setExportForm((current) => ({ ...current, personName: event.target.value }))}>{personOptions.map((person) => <option key={person}>{person}</option>)}</select></label><label>Début<input required type="date" value={exportForm.startsOn} onChange={(event) => setExportForm((current) => ({ ...current, startsOn: event.target.value }))} /></label><label>Fin<input required type="date" value={exportForm.endsOn} onChange={(event) => setExportForm((current) => ({ ...current, endsOn: event.target.value }))} /></label></div><footer><button className="is-secondary" onClick={() => setIsExportOpen(false)} type="button">Annuler</button><button type="submit">Exporter en CSV</button></footer></form></div> : null}
    </section>
  );
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

function PlanningSideContent({ sideTab, certificateAlerts, hrAlerts, overview, planningControls, unassignedPeople, unbilledProjects, editable, canManageDerogations, onOpenHandover, onOpenConflictCenter, onRevokeDerogation }: {
  sideTab: SideTab;
  certificateAlerts: ReturnType<typeof buildPlanningCertificateAlerts>;
  hrAlerts: ReturnType<typeof buildPlanningHrAlerts>;
  overview: ReturnType<typeof usePlanningOverview>['overview'];
  planningControls: PlanningControlResult[];
  unassignedPeople: PlanningPerson[];
  unbilledProjects: PlanningProjectRecord[];
  editable: boolean;
  canManageDerogations: boolean;
  onOpenHandover: (handover: PlanningHandoverRecord) => void;
  onOpenConflictCenter: () => void;
  onRevokeDerogation: (derogation: PlanningDerogationRecord) => void;
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
  if (sideTab === 'derogations') {
    return <PlanningDerogationList editable={canManageDerogations} onRevoke={onRevokeDerogation} overview={overview} />;
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

function PlanningEventDialog({ event, form, activeVessels, watchGroupOptions, controls, editable, isSaving, onChange, onClose, onSave, onDelete, onDuplicate, onDerogation }: { event: PlanningCrewEvent; form: EventFormState; activeVessels: PlanningVessel[]; watchGroupOptions: string[]; controls: PlanningControlResult[]; editable: boolean; isSaving: boolean; onChange: (form: EventFormState) => void; onClose: () => void; onSave: () => void; onDelete: () => void; onDuplicate: () => void; onDerogation?: () => void }) {
  if (!editable) {
    return <div className="planning-dialog-backdrop is-side-panel" role="presentation"><section aria-modal="true" className="planning-dialog is-side-panel is-detail" role="dialog"><header><div><CalendarDays aria-hidden="true" size={20} /><h2>{event.person}</h2></div><button aria-label="Fermer" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button></header><dl><div><dt>Navire</dt><dd>{event.vessel}</dd></div><div><dt>Bordée</dt><dd>{event.board || 'Non renseignée'}</dd></div><div><dt>Période</dt><dd>{event.startsAt && event.endsAt ? `${formatPlanningDateTime(event.startsAt)} au ${formatPlanningDateTime(event.endsAt)}` : `${formatPlanningDate(event.startsOn)} au ${formatPlanningDate(event.endsOn)}`}</dd></div><div><dt>Statut</dt><dd>{event.status}</dd></div><div><dt>Confirmation</dt><dd>{planningConfirmationLabel(event.confirmationStatus)}</dd></div><div><dt>Fonction</dt><dd>{event.functionLabel || 'Équipage'}</dd></div><div><dt>Annotation</dt><dd>{event.comments || 'Aucune annotation'}</dd></div><div><dt>Source</dt><dd>{event.sourceLabel}</dd></div></dl><footer><button onClick={onClose} type="button">Fermer</button></footer></section></div>;
  }
  return (
    <div className="planning-dialog-backdrop is-side-panel" role="presentation">
      <form aria-modal="true" className="planning-dialog is-side-panel" onSubmit={(submitEvent) => { submitEvent.preventDefault(); onSave(); }} role="dialog">
        <header><div><Pencil aria-hidden="true" size={20} /><span><small>Formulaire complet</small><h2>Modifier · {event.person}</h2></span></div><button aria-label="Fermer" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button></header>
        <div className="planning-dialog-grid">
          <label className="is-wide">Navire<select required value={form.vesselId} onChange={(changeEvent) => onChange({ ...form, vesselId: changeEvent.target.value })}>{activeVessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vesselOptionLabel(vessel)}</option>)}</select></label>
          <label>Début<input required type={event.kind === 'assignment' ? 'datetime-local' : 'date'} value={event.kind === 'assignment' ? form.startsAt : form.startsOn} onChange={(changeEvent) => onChange({ ...form, startsAt: event.kind === 'assignment' ? changeEvent.target.value : form.startsAt, startsOn: changeEvent.target.value.slice(0, 10) })} /></label>
          <label>Fin<input disabled={event.kind === 'day'} required type={event.kind === 'assignment' ? 'datetime-local' : 'date'} value={event.kind === 'assignment' ? form.endsAt : form.endsOn} onChange={(changeEvent) => onChange({ ...form, endsAt: event.kind === 'assignment' ? changeEvent.target.value : form.endsAt, endsOn: changeEvent.target.value.slice(0, 10) })} /></label>
          <label>Statut<select value={form.statusLabel} onChange={(changeEvent) => onChange({ ...form, statusLabel: changeEvent.target.value })}>{PLANNING_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
          {event.kind === 'assignment' ? <label>Confirmation<select value={form.confirmationStatus} onChange={(changeEvent) => onChange({ ...form, confirmationStatus: changeEvent.target.value as PlanningConfirmationStatus })}><option value="provisional">Provisoire</option><option value="confirmed">Confirmée</option><option value="cancelled">Annulée</option></select></label> : null}
          <label>Fonction<input value={form.functionLabel} onChange={(changeEvent) => onChange({ ...form, functionLabel: changeEvent.target.value })} /></label>
          <label className="is-wide">Bordée / groupe<select value={form.watchGroup} onChange={(changeEvent) => onChange({ ...form, watchGroup: changeEvent.target.value })}>{uniqueSorted([...watchGroupOptions, form.watchGroup]).map((group) => <option key={group}>{group}</option>)}</select></label>
          <label className="is-wide">Annotation<textarea rows={4} value={form.comments} onChange={(changeEvent) => onChange({ ...form, comments: changeEvent.target.value })} /></label>
        </div>
        <p className="planning-dialog-source">Source · {event.sourceLabel}</p>
        <PlanningControlSummary results={controls} />
        {onDerogation && controls.some((control) => control.level !== 'information') ? <button className="planning-derogation-action" onClick={onDerogation} type="button"><ShieldAlert aria-hidden="true" size={16} />Créer une dérogation encadrée</button> : null}
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
  derogate: 'Dérogation',
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
            <strong>{`Version publiée ${version.versionNumber}`}</strong>
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
