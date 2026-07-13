import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  Download,
  Expand,
  GripVertical,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Ship,
  Trash2,
  UserRoundPlus,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import plannedIcon from './assets/icone_a_planifier.svg';
import billedIcon from './assets/icone_a_facturer.svg';
import validIcon from './assets/icone_valide.svg';
import {
  addPlanningDays,
  buildPlanningCertificateAlerts,
  buildPlanningCrewRows,
  buildPlanningHrAlerts,
  buildPlanningMonthSegments,
  buildPlanningTimeline,
  buildPlanningExportRows,
  dateGridPlacement,
  formatPlanningDate,
  formatPlanningPerson,
  getUnassignedPlanningPeople,
  getUnbilledPlanningProjects,
  getPlanningConflicts,
  getPlanningConflictEventIds,
  isSedentaryPlanningFunction,
  daysBetween,
  isoDate,
  planningPeriodTitle,
  planningStatusTone,
  projectStatusTone,
  shiftPlanningAnchor,
  timelineRange,
  type PlanningCrewEvent,
  type PlanningCrewRow,
  type PlanningFilters,
  type PlanningViewMode,
} from './planningModel';
import {
  archivePlanningVessel,
  createPlanningAssignment,
  createVessel,
  deletePlanningEvent,
  fetchPlanningOverview,
  mapPlanningAssignmentRows,
  updatePlanningEvent,
  updatePlanningProject,
  type PlanningOverview,
  type PlanningPerson,
  type PlanningProjectRecord,
  type PlanningVessel,
} from './planningQueries';

interface PlanningPageProps {
  client?: SupabaseClient;
  roles?: RoleKey[];
}

interface AssignmentFormState {
  vesselId: string;
  captainPersonId: string;
  crewPersonId: string;
  startsOn: string;
  endsOn: string;
  assignmentRole: string;
  statusLabel: string;
  watchGroup: string;
  comments: string;
}

interface EventFormState {
  vesselId: string;
  startsOn: string;
  endsOn: string;
  statusLabel: string;
  functionLabel: string;
  watchGroup: string;
  comments: string;
}

interface ExportFormState { personName: string; startsOn: string; endsOn: string }

type SideTab = 'certificates' | 'unassigned' | 'billing' | 'alerts';

const EMPTY_OVERVIEW: PlanningOverview = {
  vessels: [],
  people: [],
  assignments: [],
  days: [],
  periods: [],
  projects: [],
  certificates: [],
  hrDocuments: [],
};

const EMPTY_FILTERS: PlanningFilters = { vesselName: '', personName: '' };
const EMPTY_ASSIGNMENT: AssignmentFormState = {
  vesselId: '',
  captainPersonId: '',
  crewPersonId: '',
  startsOn: '',
  endsOn: '',
  assignmentRole: 'Équipage',
  statusLabel: 'En Mer',
  watchGroup: 'Affectation',
  comments: '',
};

const PLANNING_STATUSES = ['En Mer', 'A Terre', 'Repos', 'Vacance', 'Arrêt de travail', 'Formation'];

const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const SIDE_TABS: Array<{ key: SideTab; label: string }> = [
  { key: 'certificates', label: 'Certificats' },
  { key: 'unassigned', label: 'Marins non affectés' },
  { key: 'billing', label: 'Facturation' },
  { key: 'alerts', label: 'Alertes' },
];

function canManagePlanning(roles: RoleKey[]): boolean {
  return roles.includes('admin');
}

function projectStatusIcon(project: PlanningProjectRecord): string {
  const tone = projectStatusTone(project.status);
  return tone === 'valid' ? validIcon : tone === 'billed' ? billedIcon : plannedIcon;
}

function vesselOptionLabel(vessel: PlanningVessel): string {
  return vessel.acronym ? `${vessel.name} (${vessel.acronym})` : vessel.name;
}

function personOptionLabel(person: PlanningPerson): string {
  return `${formatPlanningPerson(person)}${person.functionLabel ? ` · ${person.functionLabel}` : ''}`;
}

function todayIso(): string {
  const now = new Date();
  return isoDate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, 'fr'));
}

function timelineStyle(dayWidth: number, dayCount: number) {
  return {
    '--planning-day-width': `${dayWidth}px`,
    '--planning-day-count': dayCount,
  } as React.CSSProperties;
}

export function PlanningPage({ client, roles }: PlanningPageProps) {
  const outletContext = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || outletContext?.client || supabase;
  const effectiveRoles = roles || outletContext?.roles || [];
  const isManager = canManagePlanning(effectiveRoles);
  const workspaceRef = useRef<HTMLElement>(null);
  const [overview, setOverview] = useState<PlanningOverview>(EMPTY_OVERVIEW);
  const [anchorDate, setAnchorDate] = useState(todayIso);
  const [viewMode, setViewMode] = useState<PlanningViewMode>('month');
  const [filters, setFilters] = useState<PlanningFilters>(EMPTY_FILTERS);
  const [dayWidth, setDayWidth] = useState(34);
  const [sideTab, setSideTab] = useState<SideTab>('certificates');
  const [collapsedRows, setCollapsedRows] = useState<Set<string>>(new Set());
  const [selectedEvent, setSelectedEvent] = useState<PlanningCrewEvent | null>(null);
  const [selectedProject, setSelectedProject] = useState<PlanningProjectRecord | null>(null);
  const [eventForm, setEventForm] = useState<EventFormState | null>(null);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentFormState>(EMPTY_ASSIGNMENT);
  const [isAssignmentOpen, setIsAssignmentOpen] = useState(false);
  const [isVesselsOpen, setIsVesselsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [newVessel, setNewVessel] = useState({ name: '', acronym: '' });
  const [exportForm, setExportForm] = useState<ExportFormState>({ personName: '', startsOn: '', endsOn: '' });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showWeekends, setShowWeekends] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [quickCreateKey, setQuickCreateKey] = useState<string | null>(null);

  const loadPlanning = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      setOverview(await fetchPlanningOverview(effectiveClient));
    } catch {
      setErrorMessage('Impossible de charger le planning.');
    } finally {
      setIsLoading(false);
    }
  }, [effectiveClient]);

  useEffect(() => {
    void loadPlanning();
  }, [loadPlanning]);

  useEffect(() => {
    const handleFullscreen = () => setIsFullscreen(document.fullscreenElement === workspaceRef.current);
    document.addEventListener('fullscreenchange', handleFullscreen);
    return () => document.removeEventListener('fullscreenchange', handleFullscreen);
  }, []);

  const days = useMemo(() => {
    const fullTimeline = buildPlanningTimeline(anchorDate, viewMode);
    return showWeekends ? fullTimeline : fullTimeline.filter((day) => !day.isWeekend);
  }, [anchorDate, showWeekends, viewMode]);
  const monthSegments = useMemo(() => buildPlanningMonthSegments(days), [days]);
  const range = useMemo(() => timelineRange(days), [days]);
  const rows = useMemo(() => buildPlanningCrewRows(overview, days, filters), [days, filters, overview]);
  const visibleRows = useMemo(
    () =>
      rows.filter((row) => {
        if (row.type === 'vessel') return true;
        if (collapsedRows.has(row.vesselKey)) return false;
        return row.type !== 'person' || !collapsedRows.has(row.boardKey);
      }),
    [collapsedRows, rows],
  );
  const certificateAlerts = useMemo(() => buildPlanningCertificateAlerts(overview, todayIso()), [overview]);
  const hrAlerts = useMemo(() => buildPlanningHrAlerts(overview, todayIso()), [overview]);
  const unassignedPeople = useMemo(() => getUnassignedPlanningPeople(overview, range, filters), [filters, overview, range]);
  const unbilledProjects = useMemo(
    () => getUnbilledPlanningProjects(overview, Number(anchorDate.slice(0, 4))),
    [anchorDate, overview],
  );
  const activeVessels = useMemo(() => overview.vessels.filter((vessel) => vessel.active), [overview.vessels]);
  const activePeople = useMemo(() => overview.people.filter((person) => person.active), [overview.people]);
  const conflictEventIds = useMemo(() => getPlanningConflictEventIds(overview), [overview]);
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

  const tabCounts: Record<SideTab, number> = {
    certificates: certificateAlerts.filter((alert) => alert.tone === 'danger').length || certificateAlerts.length,
    unassigned: unassignedPeople.length,
    billing: unbilledProjects.length,
    alerts: hrAlerts.length,
  };

  function toggleCollapsed(key: string) {
    setCollapsedRows((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function collapseAll() {
    setCollapsedRows(new Set(rows.filter((row) => row.type === 'vessel').map((row) => row.key)));
  }

  function expandAll() {
    setCollapsedRows(new Set());
  }

  function openAssignment(prefill?: Partial<AssignmentFormState>) {
    const defaultStart = range.start || anchorDate;
    setAssignmentForm({ ...EMPTY_ASSIGNMENT, startsOn: defaultStart, endsOn: addPlanningDays(defaultStart, 6), ...prefill });
    setIsAssignmentOpen(true);
  }

  async function handleCreateAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const person = activePeople.find((item) => String(item.id) === assignmentForm.crewPersonId);
    const vessel = activeVessels.find((item) => String(item.id) === assignmentForm.vesselId);
    let conflictWarning = '';
    if (person && vessel) {
      const conflicts = getPlanningConflicts(overview, { id: 'new', person: formatPlanningPerson(person), personId: person.id, vessel: vessel.name, startsOn: assignmentForm.startsOn, endsOn: assignmentForm.endsOn });
      if (conflicts.length) conflictWarning = `${formatPlanningPerson(person)} est aussi affecté au ${conflicts[0].event.vessel} le ${formatPlanningDate(conflicts[0].date)}.`;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const row = await createPlanningAssignment(effectiveClient, assignmentForm);
      const [assignment] = mapPlanningAssignmentRows([row], overview.people, overview.vessels);
      setOverview((current) => ({ ...current, assignments: [...current.assignments, assignment] }));
      setStatusMessage(conflictWarning ? `Affectation ajoutée. Conflit signalé : ${conflictWarning}` : 'Affectation ajoutée au planning.');
      setIsAssignmentOpen(false);
    } catch {
      setErrorMessage("Impossible d'ajouter cette affectation.");
    } finally {
      setIsSaving(false);
    }
  }

  async function createQuickDay(row: PlanningCrewRow, date: string) {
    if (!isManager || row.type !== 'person' || row.personId === null || row.vesselId === null) return;
    const person = activePeople.find((item) => item.id === row.personId);
    const vessel = activeVessels.find((item) => item.id === row.vesselId || item.name === row.vessel);
    if (!person || !vessel) {
      setErrorMessage('Ce collaborateur ou ce navire ne peut pas être modifié dans SeaPilot.');
      return;
    }
    const role = row.functionLabel || person.functionLabel || 'Équipage';
    const statusLabel = isSedentaryPlanningFunction(role) ? 'A Terre' : 'En Mer';
    const input: AssignmentFormState = {
      vesselId: String(vessel.id),
      captainPersonId: '',
      crewPersonId: String(person.id),
      startsOn: date,
      endsOn: date,
      assignmentRole: role,
      statusLabel,
      watchGroup: row.board || 'Affectation',
      comments: '',
    };
    const quickKey = `${row.key}-${date}`;
    setQuickCreateKey(quickKey);
    setErrorMessage(null);
    try {
      const conflicts = getPlanningConflicts(overview, {
        id: 'new', person: formatPlanningPerson(person), personId: person.id, vessel: vessel.name, startsOn: date, endsOn: date,
      });
      const created = await createPlanningAssignment(effectiveClient, input);
      const [assignment] = mapPlanningAssignmentRows([created], overview.people, overview.vessels);
      setOverview((current) => ({ ...current, assignments: [...current.assignments, assignment] }));
      setStatusMessage(conflicts.length
        ? `Affectation ajoutée. Conflit détecté avec ${conflicts[0].event.vessel} le ${formatPlanningDate(date)}.`
        : `${formatPlanningPerson(person)} · ${statusLabel} ajouté le ${formatPlanningDate(date)}.`);
    } catch {
      setErrorMessage("Impossible d'ajouter cette journée au planning.");
    } finally {
      setQuickCreateKey(null);
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
    if (!selectedEvent || selectedEvent.kind !== 'assignment') return;
    const vessel = activeVessels.find((item) => item.name === selectedEvent.vessel);
    const person = activePeople.find((item) => formatPlanningPerson(item) === selectedEvent.person);
    openAssignment({
      vesselId: vessel ? String(vessel.id) : '',
      crewPersonId: person ? String(person.id) : '',
      startsOn: selectedEvent.startsOn,
      endsOn: selectedEvent.endsOn,
      assignmentRole: selectedEvent.functionLabel || 'Équipage',
    });
  }

  function openEvent(event: PlanningCrewEvent) {
    const vessel = activeVessels.find((item) => item.id === event.vesselId || item.name === event.vessel);
    setSelectedEvent(event);
    setEventForm({
      vesselId: vessel ? String(vessel.id) : '', startsOn: event.startsOn, endsOn: event.endsOn,
      statusLabel: event.status, functionLabel: event.functionLabel, watchGroup: event.board, comments: event.comments,
    });
  }

  function conflictMessage(event: PlanningCrewEvent, vessel: PlanningVessel, startsOn: string, endsOn: string) {
    const conflicts = getPlanningConflicts(overview, { ...event, vessel: vessel.name, startsOn, endsOn });
    return conflicts.length
      ? `${event.person} est déjà affecté au ${conflicts[0].event.vessel} le ${formatPlanningDate(conflicts[0].date)}.`
      : '';
  }

  async function saveEvent(event: PlanningCrewEvent, form: EventFormState) {
    const vessel = activeVessels.find((item) => String(item.id) === form.vesselId);
    if (!vessel) return setErrorMessage('Sélectionnez un navire actif.');
    const conflict = conflictMessage(event, vessel, form.startsOn, form.endsOn);
    setIsSaving(true); setErrorMessage(null);
    try {
      await updatePlanningEvent(effectiveClient, {
        id: Number(event.id.split('-').pop()), kind: event.kind, vesselId: vessel.id, vesselName: vessel.name,
        startsOn: form.startsOn, endsOn: form.endsOn, statusLabel: form.statusLabel,
        functionLabel: form.functionLabel, watchGroup: form.watchGroup, comments: form.comments,
      });
      await loadPlanning(); setStatusMessage(conflict ? `Planning mis à jour. Conflit signalé : ${conflict}` : 'Planning mis à jour.'); setSelectedEvent(null); setEventForm(null);
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Impossible de modifier cette période.'); }
    finally { setIsSaving(false); }
  }

  async function removeEvent(event: PlanningCrewEvent) {
    if (!window.confirm('Supprimer cette période du planning ?')) return;
    setIsSaving(true);
    try {
      await deletePlanningEvent(effectiveClient, { id: Number(event.id.split('-').pop()), kind: event.kind });
      await loadPlanning(); setSelectedEvent(null); setEventForm(null); setStatusMessage('Période supprimée.');
    } catch { setErrorMessage('Impossible de supprimer cette période.'); }
    finally { setIsSaving(false); }
  }

  async function moveEvent(event: PlanningCrewEvent, vesselName: string, startsOn: string) {
    const vessel = activeVessels.find((item) => item.name === vesselName);
    if (!vessel) return setErrorMessage('Ce navire ne peut pas recevoir une affectation.');
    const endsOn = addPlanningDays(startsOn, daysBetween(event.startsOn, event.endsOn));
    const form: EventFormState = {
      vesselId: String(vessel.id), startsOn, endsOn, statusLabel: event.status,
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
    await saveEvent(event, { vesselId: String(vessel.id), startsOn, endsOn, statusLabel: event.status, functionLabel: event.functionLabel, watchGroup: event.board, comments: event.comments });
  }

  function handleDrop(row: PlanningCrewRow, date: string, raw: string) {
    if (!isManager || row.type === 'board') return;
    let payload: { type?: string; id?: string | number } = {};
    try { payload = JSON.parse(raw || '{}') as typeof payload; } catch { return; }
    if (payload.type === 'event') {
      const event = rows.flatMap((item) => item.events).find((item) => item.id === payload.id);
      if (event && row.type === 'person' && row.personId !== event.personId) {
        setErrorMessage('Déposez cette période sur la ligne du même collaborateur ou sur l’en-tête du navire cible.');
      } else if (event) void moveEvent(event, row.vessel, date);
    } else if (payload.type === 'person') {
      if (row.type !== 'vessel') return;
      const vessel = activeVessels.find((item) => item.name === row.vessel);
      if (vessel) openAssignment({ vesselId: String(vessel.id), crewPersonId: String(payload.id), startsOn: date, endsOn: addPlanningDays(date, 6) });
    } else if (payload.type === 'project') {
      const project = overview.projects.find((item) => item.id === Number(payload.id));
      const vessel = activeVessels.find((item) => item.name === row.vessel);
      if (project && vessel) void updatePlanningProject(effectiveClient, {
        id: project.id, title: project.title, startsOn: date, endsOn: addPlanningDays(date, daysBetween(project.startsOn, project.endsOn)),
        status: project.status, vesselId: vessel.id, vesselName: vessel.name, clientName: project.clientName, description: project.description,
      }).then(loadPlanning).catch(() => setErrorMessage('Impossible de déplacer ce projet.'));
    }
  }

  async function addVessel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setIsSaving(true);
    try { await createVessel(effectiveClient, newVessel); await loadPlanning(); setNewVessel({ name: '', acronym: '' }); setStatusMessage('Navire ajouté.'); }
    catch { setErrorMessage("Impossible d'ajouter ce navire."); } finally { setIsSaving(false); }
  }

  async function archiveVessel(vessel: PlanningVessel) {
    if (!window.confirm(`Retirer ${vessel.name} du planning ?`)) return;
    try { await archivePlanningVessel(effectiveClient, vessel.id); await loadPlanning(); setStatusMessage('Navire retiré du planning.'); }
    catch { setErrorMessage('Impossible de retirer ce navire.'); }
  }

  async function saveProject(project: PlanningProjectRecord, form: { title: string; startsOn: string; endsOn: string; status: string; vesselId: string; clientName: string; description: string }) {
    const vessel = activeVessels.find((item) => String(item.id) === form.vesselId);
    if (!vessel) return setErrorMessage('Sélectionnez un navire actif.');
    setIsSaving(true);
    try {
      await updatePlanningProject(effectiveClient, { id: project.id, title: form.title, startsOn: form.startsOn, endsOn: form.endsOn, status: form.status, vesselId: vessel.id, vesselName: vessel.name, clientName: form.clientName, description: form.description });
      await loadPlanning(); setSelectedProject(null); setStatusMessage('Projet mis à jour.');
    } catch { setErrorMessage('Impossible de modifier ce projet.'); } finally { setIsSaving(false); }
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

  if (isLoading) return <div className="admin-state">Chargement du planning...</div>;

  return (
    <section className={`planning-workspace${isFullscreen ? ' is-fullscreen' : ''}`} ref={workspaceRef}>
      <header className="planning-command-header">
        <div>
          <p className="module-family">Planning</p>
          <h1 aria-label="Planning">Planning BBTM</h1>
        </div>
        <div className="planning-command-actions">
          <span className={isManager ? 'planning-mode-write' : 'planning-mode-read'}>{isManager ? 'Modification' : 'Lecture seule'}</span>
          <button aria-label="Actualiser le planning" className="planning-icon-button" onClick={() => void loadPlanning()} type="button">
            <RefreshCw aria-hidden="true" size={18} />
          </button>
          <button aria-expanded={isSettingsOpen} aria-label="Réglages du planning" className="planning-icon-button" onClick={() => setIsSettingsOpen((value) => !value)} type="button">
            <Settings2 aria-hidden="true" size={18} />
          </button>
        </div>
      </header>

      {statusMessage || errorMessage ? (
        <div className="planning-notices" aria-live="polite">
          {statusMessage ? <p className="admin-success">{statusMessage}</p> : null}
          {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
        </div>
      ) : null}

      {isSettingsOpen ? (
        <div className="planning-settings-popover">
          <label>
            <input checked={showWeekends} onChange={(event) => setShowWeekends(event.target.checked)} type="checkbox" />
            Afficher les week-ends
          </label>
          <button onClick={collapsedRows.size ? expandAll : collapseAll} type="button">
            {collapsedRows.size ? <ChevronsUpDown aria-hidden="true" size={16} /> : <ChevronsDownUp aria-hidden="true" size={16} />}
            {collapsedRows.size ? 'Tout développer' : 'Réduire les navires'}
          </button>
          {isManager ? <button onClick={() => setIsVesselsOpen(true)} type="button"><Ship aria-hidden="true" size={16} />Gérer les navires</button> : null}
          {isManager ? <button onClick={() => { setExportForm({ personName: personOptions[0] || '', startsOn: range.start, endsOn: range.end }); setIsExportOpen(true); }} type="button"><Download aria-hidden="true" size={16} />Exporter un marin</button> : null}
        </div>
      ) : null}

      <div className="planning-layout">
        <section className="planning-board-card" aria-label="Calendrier des affectations">
          <div className="planning-board-toolbar">
            <div className="planning-view-switch" aria-label="Période affichée">
              {(['week', 'month', 'year'] as PlanningViewMode[]).map((mode) => (
                <button className={viewMode === mode ? 'is-active' : ''} key={mode} onClick={() => setViewMode(mode)} type="button">
                  {mode === 'week' ? 'Semaine' : mode === 'month' ? 'Mois' : 'An'}
                </button>
              ))}
            </div>
            <label className="planning-select-control">
              <Ship aria-hidden="true" size={16} />
              <span className="sr-only">Filtre navire</span>
              <select aria-label="Filtre navire" onChange={(event) => setFilters((current) => ({ ...current, vesselName: event.target.value }))} value={filters.vesselName}>
                <option value="">Tous les navires</option>
                {vesselOptions.map((value) => <option key={value}>{value}</option>)}
              </select>
              <ChevronDown aria-hidden="true" size={14} />
            </label>
            <label className="planning-select-control">
              <Search aria-hidden="true" size={16} />
              <span className="sr-only">Filtre marin</span>
              <select aria-label="Filtre marin" onChange={(event) => setFilters((current) => ({ ...current, personName: event.target.value }))} value={filters.personName}>
                <option value="">Tous les marins</option>
                {personOptions.map((value) => <option key={value}>{value}</option>)}
              </select>
              <ChevronDown aria-hidden="true" size={14} />
            </label>
            <div className="planning-zoom-controls" aria-label="Zoom du planning">
              <button aria-label="Zoom avant" onClick={() => setDayWidth((value) => Math.min(58, value + 4))} type="button"><Plus aria-hidden="true" size={16} /></button>
              <button aria-label="Zoom arrière" onClick={() => setDayWidth((value) => Math.max(viewMode === 'year' ? 12 : 24, value - 4))} type="button"><Minus aria-hidden="true" size={16} /></button>
            </div>
            <div className="planning-period-controls">
              <button aria-label="Période précédente" className="planning-icon-button" onClick={() => setAnchorDate((value) => shiftPlanningAnchor(value, viewMode, -1))} type="button"><ChevronLeft aria-hidden="true" size={18} /></button>
              <select aria-label="Année" onChange={(event) => setAnchorDate(`${event.target.value}-${anchorDate.slice(5)}`)} value={anchorDate.slice(0, 4)}>
                {Array.from({ length: 7 }, (_, index) => Number(todayIso().slice(0, 4)) - 3 + index).map((year) => <option key={year}>{year}</option>)}
              </select>
              {viewMode !== 'year' ? (
                <select aria-label="Mois" onChange={(event) => setAnchorDate(`${anchorDate.slice(0, 4)}-${event.target.value}-01`)} value={anchorDate.slice(5, 7)}>
                  {['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'].map((month, index) => <option key={month} value={String(index + 1).padStart(2, '0')}>{month}</option>)}
                </select>
              ) : null}
              <button aria-label="Période suivante" className="planning-icon-button" onClick={() => setAnchorDate((value) => shiftPlanningAnchor(value, viewMode, 1))} type="button"><ChevronRight aria-hidden="true" size={18} /></button>
            </div>
            <div className="planning-edit-controls">
              {isManager ? <button aria-label="Nouvelle affectation" className="planning-icon-button is-primary" onClick={() => openAssignment()} type="button"><Pencil aria-hidden="true" size={17} /></button> : null}
              {isManager ? <button aria-label="Dupliquer l’affectation" className="planning-icon-button" disabled={selectedEvent?.kind !== 'assignment'} onClick={duplicateSelectedEvent} type="button"><Copy aria-hidden="true" size={17} /></button> : null}
              {isManager ? <button aria-label="Exporter les données d'un marin" className="planning-icon-button" onClick={() => { setExportForm({ personName: personOptions[0] || '', startsOn: range.start, endsOn: range.end }); setIsExportOpen(true); }} type="button"><Download aria-hidden="true" size={17} /></button> : null}
              <button aria-label={isFullscreen ? 'Quitter le plein écran' : 'Afficher en plein écran'} className="planning-icon-button" onClick={() => void toggleFullscreen()} type="button"><Expand aria-hidden="true" size={17} /></button>
              <button aria-label="Plus d’options" className="planning-icon-button" onClick={() => setIsSettingsOpen((value) => !value)} type="button"><MoreHorizontal aria-hidden="true" size={18} /></button>
            </div>
          </div>

          <div className="planning-board-titlebar">
            <strong>{planningPeriodTitle(days, viewMode)}</strong>
            <div className="planning-board-guide" aria-label="Légende et gestes du planning">
              <span><i className="is-sea" />En mer</span>
              <span><i className="is-shore" />À terre</span>
              <span><i className="is-conflict" />Conflit</span>
              {isManager ? <small>Clic = ajouter · Glisser = déplacer · Poignées = étendre</small> : null}
            </div>
            <div className="planning-board-stats">
              {conflictEventIds.size ? <span className="is-conflict" aria-label="Conflits planning">{conflictEventIds.size} conflit(s)</span> : null}
              <span aria-label="Affectations planning">{overview.assignments.length} affectation(s)</span>
              <span aria-label="Journees SMTR">{overview.days.length} journée(s) SMTR</span>
              <span aria-label="Periodes SMTR">{overview.periods.length} période(s) SMTR</span>
            </div>
          </div>

          <div className="planning-calendar-scroll" style={timelineStyle(viewMode === 'year' ? Math.min(dayWidth, 18) : dayWidth, days.length)}>
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
              <div className="planning-calendar-corner planning-calendar-label-heading">Équipages</div>
              {days.map((day) => <div className={`planning-day-heading${day.isWeekend ? ' is-weekend' : ''}${day.date === todayIso() ? ' is-today' : ''}`} key={day.date}><span>{WEEKDAY_LABELS[day.weekday]}</span><strong>{day.day}</strong></div>)}
            </div>

            <div className="planning-calendar-body">
              {visibleRows.length ? visibleRows.map((row) => (
                <PlanningTimelineRow
                  collapsed={collapsedRows.has(row.key)}
                  days={days}
                  key={row.key}
                  onOpenProject={setSelectedProject}
                  onToggle={() => toggleCollapsed(row.key)}
                  row={row}
                  viewMode={viewMode}
                  editable={isManager}
                  dayWidth={viewMode === 'year' ? Math.min(dayWidth, 18) : dayWidth}
                  onDrop={handleDrop}
                  onResize={resizeEvent}
                  onOpenEvent={openEvent}
                  onCreateDay={(date) => void createQuickDay(row, date)}
                  conflictEventIds={conflictEventIds}
                  quickCreateKey={quickCreateKey}
                />
              )) : <div className="planning-calendar-empty">Aucune donnée sur cette période.</div>}
            </div>
          </div>
        </section>

        <aside className="planning-side-card" aria-label="Alertes du planning">
          <div className="planning-side-tabs" role="tablist">
            {SIDE_TABS.map((tab) => (
              <button aria-selected={sideTab === tab.key} className={sideTab === tab.key ? 'is-active' : ''} key={tab.key} onClick={() => setSideTab(tab.key)} role="tab" type="button">
                {tab.label}{tabCounts[tab.key] ? <span>{Math.min(99, tabCounts[tab.key])}</span> : null}
              </button>
            ))}
          </div>
          <PlanningSideContent
            certificateAlerts={certificateAlerts}
            hrAlerts={hrAlerts}
            sideTab={sideTab}
            unassignedPeople={unassignedPeople}
            unbilledProjects={unbilledProjects}
            editable={isManager}
          />
        </aside>
      </div>

      {isAssignmentOpen ? (
        <div className="planning-dialog-backdrop" role="presentation">
          <form className="planning-dialog" onSubmit={handleCreateAssignment}>
            <header><div><UserRoundPlus aria-hidden="true" size={20} /><h2>Nouvelle affectation</h2></div><button aria-label="Fermer" onClick={() => setIsAssignmentOpen(false)} type="button"><X aria-hidden="true" size={18} /></button></header>
            <div className="planning-dialog-grid">
              <label>Navire<select aria-label="Navire" onChange={(event) => setAssignmentForm((current) => ({ ...current, vesselId: event.target.value }))} required value={assignmentForm.vesselId}><option value="">Choisir</option>{activeVessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vesselOptionLabel(vessel)}</option>)}</select></label>
              <label>Marin<select aria-label="Marin" onChange={(event) => setAssignmentForm((current) => ({ ...current, crewPersonId: event.target.value }))} required value={assignmentForm.crewPersonId}><option value="">Choisir</option>{activePeople.map((person) => <option key={person.id} value={person.id}>{personOptionLabel(person)}</option>)}</select></label>
              <label>Capitaine<select aria-label="Capitaine" onChange={(event) => setAssignmentForm((current) => ({ ...current, captainPersonId: event.target.value }))} value={assignmentForm.captainPersonId}><option value="">Aucun</option>{activePeople.map((person) => <option key={person.id} value={person.id}>{personOptionLabel(person)}</option>)}</select></label>
              <label>Début<input aria-label="Debut" onChange={(event) => setAssignmentForm((current) => ({ ...current, startsOn: event.target.value }))} required type="date" value={assignmentForm.startsOn} /></label>
              <label>Fin<input aria-label="Fin" onChange={(event) => setAssignmentForm((current) => ({ ...current, endsOn: event.target.value }))} required type="date" value={assignmentForm.endsOn} /></label>
              <label>Fonction<input aria-label="Fonction" onChange={(event) => setAssignmentForm((current) => ({ ...current, assignmentRole: event.target.value }))} value={assignmentForm.assignmentRole} /></label>
              <label>Statut<select aria-label="Statut" onChange={(event) => setAssignmentForm((current) => ({ ...current, statusLabel: event.target.value }))} value={assignmentForm.statusLabel}>{PLANNING_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
              <label>Bordée / groupe<select aria-label="Bordée" onChange={(event) => setAssignmentForm((current) => ({ ...current, watchGroup: event.target.value }))} value={assignmentForm.watchGroup}>{uniqueSorted([...watchGroupOptions, assignmentForm.watchGroup]).map((group) => <option key={group}>{group}</option>)}</select></label>
              <label className="is-wide">Annotation<textarea aria-label="Annotation" onChange={(event) => setAssignmentForm((current) => ({ ...current, comments: event.target.value }))} value={assignmentForm.comments} /></label>
            </div>
            <footer><button className="is-secondary" onClick={() => setIsAssignmentOpen(false)} type="button">Annuler</button><button disabled={isSaving} type="submit">Ajouter affectation</button></footer>
          </form>
        </div>
      ) : null}

      {selectedEvent && eventForm ? <PlanningEventDialog activeVessels={activeVessels} editable={isManager} event={selectedEvent} form={eventForm} isSaving={isSaving} onChange={setEventForm} onClose={() => { setSelectedEvent(null); setEventForm(null); }} onDelete={() => void removeEvent(selectedEvent)} onSave={() => void saveEvent(selectedEvent, eventForm)} watchGroupOptions={watchGroupOptions} /> : null}
      {selectedProject ? <PlanningProjectDialog activeVessels={activeVessels} editable={isManager} isSaving={isSaving} onClose={() => setSelectedProject(null)} onSave={(form) => void saveProject(selectedProject, form)} project={selectedProject} /> : null}
      {isVesselsOpen ? <div className="planning-dialog-backdrop" role="presentation"><section aria-modal="true" className="planning-dialog planning-vessel-dialog" role="dialog"><header><div><Ship aria-hidden="true" size={20} /><h2>Gérer les navires</h2></div><button aria-label="Fermer" onClick={() => setIsVesselsOpen(false)} type="button"><X aria-hidden="true" size={18} /></button></header><form className="planning-inline-form" onSubmit={addVessel}><label>Nom<input required value={newVessel.name} onChange={(event) => setNewVessel((current) => ({ ...current, name: event.target.value }))} /></label><label>Indicatif<input value={newVessel.acronym} onChange={(event) => setNewVessel((current) => ({ ...current, acronym: event.target.value }))} /></label><button disabled={isSaving} type="submit"><Plus aria-hidden="true" size={16} />Ajouter</button></form><div className="planning-vessel-list">{activeVessels.map((vessel) => <div key={vessel.id}><span><strong>{vessel.name}</strong><small>{vessel.acronym || 'Sans indicatif'}</small></span><button aria-label={`Retirer ${vessel.name}`} onClick={() => void archiveVessel(vessel)} type="button"><Trash2 aria-hidden="true" size={16} /></button></div>)}</div></section></div> : null}
      {isExportOpen ? <div className="planning-dialog-backdrop" role="presentation"><form className="planning-dialog" onSubmit={exportPlanning}><header><div><Download aria-hidden="true" size={20} /><h2>Exporter les données d’un marin</h2></div><button aria-label="Fermer" onClick={() => setIsExportOpen(false)} type="button"><X aria-hidden="true" size={18} /></button></header><div className="planning-dialog-grid"><label className="is-wide">Marin<select required value={exportForm.personName} onChange={(event) => setExportForm((current) => ({ ...current, personName: event.target.value }))}>{personOptions.map((person) => <option key={person}>{person}</option>)}</select></label><label>Début<input required type="date" value={exportForm.startsOn} onChange={(event) => setExportForm((current) => ({ ...current, startsOn: event.target.value }))} /></label><label>Fin<input required type="date" value={exportForm.endsOn} onChange={(event) => setExportForm((current) => ({ ...current, endsOn: event.target.value }))} /></label></div><footer><button className="is-secondary" onClick={() => setIsExportOpen(false)} type="button">Annuler</button><button type="submit">Exporter en CSV</button></footer></form></div> : null}
    </section>
  );
}

function PlanningTimelineRow({ row, days, onToggle, onOpenEvent, onOpenProject, viewMode, collapsed, editable, dayWidth, onDrop, onResize, onCreateDay, conflictEventIds, quickCreateKey }: {
  row: PlanningCrewRow;
  days: ReturnType<typeof buildPlanningTimeline>;
  collapsed: boolean;
  editable: boolean;
  dayWidth: number;
  onToggle: () => void;
  onOpenEvent: (event: PlanningCrewEvent) => void;
  onOpenProject: (project: PlanningProjectRecord) => void;
  onDrop: (row: PlanningCrewRow, date: string, payload: string) => void;
  onResize: (event: PlanningCrewEvent, edge: 'start' | 'end', delta: number) => void;
  onCreateDay: (date: string) => void;
  conflictEventIds: Set<string>;
  quickCreateKey: string | null;
  viewMode: PlanningViewMode;
}) {
  const isGroup = row.type !== 'person';
  const [resizePreview, setResizePreview] = useState<{ id: string; startsOn: string; endsOn: string } | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const suppressClickRef = useRef(false);
  const beginResize = (event: React.PointerEvent, item: PlanningCrewEvent, edge: 'start' | 'end') => {
    event.preventDefault(); event.stopPropagation();
    const startX = event.clientX;
    const duration = daysBetween(item.startsOn, item.endsOn);
    const deltaFromPointer = (clientX: number) => {
      const rawDelta = Math.round((clientX - startX) / dayWidth);
      return edge === 'start' ? Math.min(duration, rawDelta) : Math.max(-duration, rawDelta);
    };
    const updatePreview = (clientX: number) => {
      const delta = deltaFromPointer(clientX);
      setResizePreview({
        id: item.id,
        startsOn: edge === 'start' ? addPlanningDays(item.startsOn, delta) : item.startsOn,
        endsOn: edge === 'end' ? addPlanningDays(item.endsOn, delta) : item.endsOn,
      });
    };
    const finishResize = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointercancel', cancelResize);
      setResizePreview(null);
      onResize(item, edge, deltaFromPointer(upEvent.clientX));
    };
    const handleMove = (moveEvent: PointerEvent) => updatePreview(moveEvent.clientX);
    const cancelResize = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', finishResize);
      setResizePreview(null);
    };
    setResizePreview({ id: item.id, startsOn: item.startsOn, endsOn: item.endsOn });
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', finishResize, { once: true });
    window.addEventListener('pointercancel', cancelResize, { once: true });
  };
  const canReceiveDrop = editable && (row.type === 'vessel' || row.type === 'person');
  const dayCell = (day: ReturnType<typeof buildPlanningTimeline>[number], index: number) => {
    const occupied = row.events.some((item) => item.startsOn <= day.date && item.endsOn >= day.date);
    const canQuickCreate = editable && viewMode !== 'year' && row.type === 'person' && row.personId !== null && !occupied;
    const isBusy = quickCreateKey === `${row.key}-${day.date}`;
    const className = `planning-day-cell${day.isWeekend ? ' is-weekend' : ''}${day.date === todayIso() ? ' is-today' : ''}${canReceiveDrop ? ' is-drop-target' : ''}${canQuickCreate ? ' is-quick-create' : ''}${dragOverDate === day.date ? ' is-drag-over' : ''}${isBusy ? ' is-saving' : ''}`;
    const sharedProps = {
      className,
      'data-date': day.date,
      'data-vessel': row.vessel,
      onDragEnter: canReceiveDrop ? () => setDragOverDate(day.date) : undefined,
      onDragLeave: canReceiveDrop ? () => setDragOverDate((current) => current === day.date ? null : current) : undefined,
      onDragOver: canReceiveDrop ? (dragEvent: React.DragEvent) => { dragEvent.preventDefault(); dragEvent.dataTransfer.dropEffect = 'move'; } : undefined,
      onDrop: canReceiveDrop ? (dropEvent: React.DragEvent) => {
        dropEvent.preventDefault();
        setDragOverDate(null);
        onDrop(row, day.date, dropEvent.dataTransfer.getData('application/x-seapilot-planning'));
      } : undefined,
      style: { gridColumn: index + 2, gridRow: 1 },
    };
    return canQuickCreate
      ? <button {...sharedProps} aria-busy={isBusy} aria-label={`Ajouter ${isSedentaryPlanningFunction(row.functionLabel) ? 'À Terre' : 'En Mer'} pour ${row.label} le ${formatPlanningDate(day.date)}`} disabled={isBusy} key={day.date} onClick={() => onCreateDay(day.date)} type="button"><Plus aria-hidden="true" size={12} /></button>
      : <span {...sharedProps} aria-hidden="true" key={day.date} />;
  };
  return (
    <div className={`planning-calendar-grid planning-timeline-row is-${row.type}`}>
      <div className="planning-row-label">
        {isGroup ? <button aria-label={`${row.label} · ${row.type === 'vessel' ? 'réduire ou développer' : 'réduire ou développer la bordée'}`} onClick={onToggle} type="button">{collapsed ? <Plus aria-hidden="true" size={13} /> : <Minus aria-hidden="true" size={13} />}</button> : <span className="planning-person-indent" />}
        <span><strong>{row.label}</strong>{row.type === 'person' && row.functionLabel ? <small>{row.functionLabel}</small> : null}</span>
      </div>
      {days.map(dayCell)}
      {row.projects.map((project) => {
        const placement = dateGridPlacement(project.startsOn, project.endsOn, days);
        if (!placement) return null;
        return <button aria-label={`${project.title}, ${project.status}`} className={`planning-project-bar is-${projectStatusTone(project.status)}`} draggable={editable} key={project.id} onClick={() => onOpenProject(project)} onDragStart={(event) => event.dataTransfer.setData('application/x-seapilot-planning', JSON.stringify({ type: 'project', id: project.id }))} style={{ gridColumn: `${placement.start + 1} / span ${placement.span}`, gridRow: 1 }} title={`${project.title} · ${project.status}`} type="button"><span>{project.title}</span><span className="planning-project-status-rail"><img alt="" src={projectStatusIcon(project)} /></span></button>;
      })}
      {row.events.map((event) => {
        const preview = resizePreview?.id === event.id ? resizePreview : null;
        const startsOn = preview?.startsOn || event.startsOn;
        const endsOn = preview?.endsOn || event.endsOn;
        const placement = dateGridPlacement(startsOn, endsOn, days);
        if (!placement) return null;
        const isConflict = conflictEventIds.has(event.id);
        return <button aria-label={`${event.person}, ${isConflict ? 'Conflit, ' : ''}${event.status}, du ${formatPlanningDate(startsOn)} au ${formatPlanningDate(endsOn)}`} className={`planning-crew-bar is-${planningStatusTone(event.status)}${editable ? ' is-editable' : ''}${isConflict ? ' has-conflict' : ''}${preview ? ' is-resize-preview' : ''}${draggingId === event.id ? ' is-dragging' : ''}`} draggable={editable && !preview} key={event.id} onClick={(clickEvent) => { if (suppressClickRef.current) { suppressClickRef.current = false; clickEvent.preventDefault(); return; } onOpenEvent(event); }} onDragEnd={() => { setDraggingId(null); window.setTimeout(() => { suppressClickRef.current = false; }, 0); }} onDragStart={(dragEvent) => {
          suppressClickRef.current = true;
          setDraggingId(event.id);
          dragEvent.dataTransfer.effectAllowed = 'move';
          dragEvent.dataTransfer.setData('application/x-seapilot-planning', JSON.stringify({ type: 'event', id: event.id }));
          const source = dragEvent.currentTarget;
          const rect = source.getBoundingClientRect();
          const ghost = source.cloneNode(true) as HTMLElement;
          ghost.classList.add('planning-drag-ghost');
          ghost.style.width = `${rect.width}px`;
          ghost.style.height = `${rect.height}px`;
          document.body.appendChild(ghost);
          dragEvent.dataTransfer.setDragImage(ghost, Math.max(8, dragEvent.clientX - rect.left), rect.height / 2);
          window.setTimeout(() => ghost.remove(), 0);
        }} style={{ gridColumn: `${placement.start + 1} / span ${placement.span}`, gridRow: 1 }} title={`${event.person}\n${isConflict ? 'Conflit de navire\n' : ''}${event.status}\n${event.comments || 'Sans annotation'}\n${formatPlanningDate(startsOn)} → ${formatPlanningDate(endsOn)}`} type="button">{editable && event.kind !== 'day' ? <span aria-hidden="true" className="planning-resize-handle is-start" onPointerDown={(pointerEvent) => beginResize(pointerEvent, event, 'start')} /> : null}{editable && viewMode !== 'year' && placement.span >= 2 ? <GripVertical aria-hidden="true" className="planning-drag-grip" size={13} /> : null}{viewMode !== 'year' && placement.span >= 2 ? <span>{isConflict ? 'Conflit' : event.status === 'En Mer' ? '' : event.status}</span> : null}{event.comments ? <span aria-label="Cette période contient une annotation" className="planning-annotation-dot" /> : null}{editable && event.kind !== 'day' ? <span aria-hidden="true" className="planning-resize-handle is-end" onPointerDown={(pointerEvent) => beginResize(pointerEvent, event, 'end')} /> : null}</button>;
      })}
    </div>
  );
}

function PlanningSideContent({ sideTab, certificateAlerts, hrAlerts, unassignedPeople, unbilledProjects, editable }: {
  sideTab: SideTab;
  certificateAlerts: ReturnType<typeof buildPlanningCertificateAlerts>;
  hrAlerts: ReturnType<typeof buildPlanningHrAlerts>;
  unassignedPeople: PlanningPerson[];
  unbilledProjects: PlanningProjectRecord[];
  editable: boolean;
}) {
  if (sideTab === 'unassigned') {
    return <div className="planning-side-list">{unassignedPeople.length ? unassignedPeople.map((person) => <article className={`planning-side-item${editable ? ' is-draggable' : ''}`} draggable={editable} key={person.id} onDragStart={(event) => event.dataTransfer.setData('application/x-seapilot-planning', JSON.stringify({ type: 'person', id: person.id }))}><div><strong>{formatPlanningPerson(person)}</strong><span className="planning-side-badge is-muted">{person.functionLabel || person.gradeLabel || 'Marin'}</span></div><p>{[person.gradeLabel, person.contractType].filter(Boolean).join(' · ') || 'Contrat actif'}</p>{editable ? <small>Glisser sur un navire pour affecter</small> : null}</article>) : <PlanningEmptySide text="Tous les marins sont affectés." />}</div>;
  }
  if (sideTab === 'billing') {
    return <div className="planning-side-list">{unbilledProjects.length ? unbilledProjects.map((project) => <article className="planning-side-item" key={project.id}><div><strong>{project.title}</strong><span className="planning-side-badge is-warning">{project.status || 'À planifier'}</span></div><p>{project.startsOn ? `${formatPlanningDate(project.startsOn)} – ${formatPlanningDate(project.endsOn)}` : 'Dates à planifier'}</p><p>{[project.primaryVesselName, project.secondaryVesselName].filter(Boolean).join(' · ')}</p></article>) : <PlanningEmptySide text="Aucun projet non facturé." />}</div>;
  }
  const alerts = sideTab === 'alerts' ? hrAlerts : certificateAlerts;
  return <div className="planning-side-list">{alerts.length ? alerts.map((alert) => <article className="planning-side-item" key={alert.id}><div><strong>{alert.title}</strong><span className={`planning-side-badge is-${alert.tone}`}>{alert.statusLabel}</span></div><p>{alert.subtitle} · {formatPlanningDate(alert.date)}</p>{alert.vesselName ? <p>Navire · {alert.vesselName}</p> : null}</article>) : <PlanningEmptySide text={sideTab === 'alerts' ? 'Aucune échéance RH proche.' : 'Aucune alarme certificat.'} />}</div>;
}

function PlanningEmptySide({ text }: { text: string }) {
  return <div className="planning-side-empty"><CalendarDays aria-hidden="true" size={24} /><p>{text}</p></div>;
}

function PlanningEventDialog({ event, form, activeVessels, watchGroupOptions, editable, isSaving, onChange, onClose, onSave, onDelete }: { event: PlanningCrewEvent; form: EventFormState; activeVessels: PlanningVessel[]; watchGroupOptions: string[]; editable: boolean; isSaving: boolean; onChange: (form: EventFormState) => void; onClose: () => void; onSave: () => void; onDelete: () => void }) {
  if (!editable) return <div className="planning-dialog-backdrop" role="presentation"><section aria-modal="true" className="planning-dialog is-detail" role="dialog"><header><div><CalendarDays aria-hidden="true" size={20} /><h2>{event.person}</h2></div><button aria-label="Fermer" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button></header><dl><div><dt>Navire</dt><dd>{event.vessel}</dd></div><div><dt>Bordée</dt><dd>{event.board || 'Non renseignée'}</dd></div><div><dt>Période</dt><dd>{formatPlanningDate(event.startsOn)} au {formatPlanningDate(event.endsOn)}</dd></div><div><dt>Statut</dt><dd>{event.status}</dd></div><div><dt>Fonction</dt><dd>{event.functionLabel || 'Équipage'}</dd></div><div><dt>Annotation</dt><dd>{event.comments || 'Aucune annotation'}</dd></div><div><dt>Source</dt><dd>{event.sourceLabel}</dd></div></dl><footer><button onClick={onClose} type="button">Fermer</button></footer></section></div>;
  return <div className="planning-dialog-backdrop" role="presentation"><form aria-modal="true" className="planning-dialog" onSubmit={(submitEvent) => { submitEvent.preventDefault(); onSave(); }} role="dialog"><header><div><Pencil aria-hidden="true" size={20} /><h2>Modifier · {event.person}</h2></div><button aria-label="Fermer" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button></header><div className="planning-dialog-grid"><label className="is-wide">Navire<select required value={form.vesselId} onChange={(changeEvent) => onChange({ ...form, vesselId: changeEvent.target.value })}>{activeVessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vesselOptionLabel(vessel)}</option>)}</select></label><label>Début<input required type="date" value={form.startsOn} onChange={(changeEvent) => onChange({ ...form, startsOn: changeEvent.target.value })} /></label><label>Fin<input disabled={event.kind === 'day'} required type="date" value={form.endsOn} onChange={(changeEvent) => onChange({ ...form, endsOn: changeEvent.target.value })} /></label><label>Statut<select value={form.statusLabel} onChange={(changeEvent) => onChange({ ...form, statusLabel: changeEvent.target.value })}>{PLANNING_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label><label>Fonction<input value={form.functionLabel} onChange={(changeEvent) => onChange({ ...form, functionLabel: changeEvent.target.value })} /></label><label className="is-wide">Bordée / groupe<select value={form.watchGroup} onChange={(changeEvent) => onChange({ ...form, watchGroup: changeEvent.target.value })}>{uniqueSorted([...watchGroupOptions, form.watchGroup]).map((group) => <option key={group}>{group}</option>)}</select></label><label className="is-wide">Annotation<textarea rows={4} value={form.comments} onChange={(changeEvent) => onChange({ ...form, comments: changeEvent.target.value })} /></label></div><footer className="planning-dialog-footer-split"><button className="is-danger" disabled={isSaving} onClick={onDelete} type="button"><Trash2 aria-hidden="true" size={16} />Supprimer</button><span><button className="is-secondary" onClick={onClose} type="button">Annuler</button><button disabled={isSaving} type="submit">Enregistrer</button></span></footer></form></div>;
}

function PlanningProjectDialog({ project, activeVessels, editable, isSaving, onClose, onSave }: { project: PlanningProjectRecord; activeVessels: PlanningVessel[]; editable: boolean; isSaving: boolean; onClose: () => void; onSave: (form: { title: string; startsOn: string; endsOn: string; status: string; vesselId: string; clientName: string; description: string }) => void }) {
  const [form, setForm] = useState({ title: project.title, startsOn: project.startsOn, endsOn: project.endsOn, status: project.status, vesselId: String(project.primaryVesselId || ''), clientName: project.clientName, description: project.description });
  if (!editable) return <div className="planning-dialog-backdrop" role="presentation"><section aria-modal="true" className="planning-dialog is-detail" role="dialog"><header><div><Ship aria-hidden="true" size={20} /><h2>{project.title}</h2></div><button aria-label="Fermer" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button></header><dl><div><dt>Statut</dt><dd>{project.status}</dd></div><div><dt>Période</dt><dd>{formatPlanningDate(project.startsOn)} au {formatPlanningDate(project.endsOn)}</dd></div><div><dt>Navire</dt><dd>{[project.primaryVesselName, project.secondaryVesselName].filter(Boolean).join(' · ') || 'Non renseigné'}</dd></div><div><dt>Client</dt><dd>{project.clientName || 'Non renseigné'}</dd></div><div><dt>Description</dt><dd>{project.description || 'Aucune description'}</dd></div></dl><footer><button onClick={onClose} type="button">Fermer</button></footer></section></div>;
  return <div className="planning-dialog-backdrop" role="presentation"><form className="planning-dialog" onSubmit={(event) => { event.preventDefault(); onSave(form); }}><header><div><Ship aria-hidden="true" size={20} /><h2>Modifier le projet</h2></div><button aria-label="Fermer" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button></header><div className="planning-dialog-grid"><label className="is-wide">Projet<input required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label><label>Début<input required type="date" value={form.startsOn} onChange={(event) => setForm((current) => ({ ...current, startsOn: event.target.value }))} /></label><label>Fin<input required type="date" value={form.endsOn} onChange={(event) => setForm((current) => ({ ...current, endsOn: event.target.value }))} /></label><label>Statut<input value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} /></label><label>Navire<select required value={form.vesselId} onChange={(event) => setForm((current) => ({ ...current, vesselId: event.target.value }))}>{activeVessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vesselOptionLabel(vessel)}</option>)}</select></label><label className="is-wide">Client<input value={form.clientName} onChange={(event) => setForm((current) => ({ ...current, clientName: event.target.value }))} /></label><label className="is-wide">Description<textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label></div><footer><button className="is-secondary" onClick={onClose} type="button">Annuler</button><button disabled={isSaving} type="submit">Enregistrer</button></footer></form></div>;
}
