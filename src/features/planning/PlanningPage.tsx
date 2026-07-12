import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  Expand,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Ship,
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
  dateGridPlacement,
  formatPlanningDate,
  formatPlanningPerson,
  getUnassignedPlanningPeople,
  getUnbilledPlanningProjects,
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
  createPlanningAssignment,
  fetchPlanningOverview,
  mapPlanningAssignmentRows,
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
}

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
};

const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const SIDE_TABS: Array<{ key: SideTab; label: string }> = [
  { key: 'certificates', label: 'Certificats' },
  { key: 'unassigned', label: 'Marins non affectés' },
  { key: 'billing', label: 'Facturation' },
  { key: 'alerts', label: 'Alertes' },
];

function canManagePlanning(roles: RoleKey[]): boolean {
  return roles.some((role) => role === 'admin' || role === 'direction' || role === 'armement');
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
  const [assignmentForm, setAssignmentForm] = useState<AssignmentFormState>(EMPTY_ASSIGNMENT);
  const [isAssignmentOpen, setIsAssignmentOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showWeekends, setShowWeekends] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const row = await createPlanningAssignment(effectiveClient, assignmentForm);
      const [assignment] = mapPlanningAssignmentRows([row], overview.people, overview.vessels);
      setOverview((current) => ({ ...current, assignments: [...current.assignments, assignment] }));
      setStatusMessage('Affectation ajoutée au planning.');
      setIsAssignmentOpen(false);
    } catch {
      setErrorMessage("Impossible d'ajouter cette affectation.");
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
              <button aria-label="Dupliquer l’affectation" className="planning-icon-button" disabled={selectedEvent?.kind !== 'assignment'} onClick={duplicateSelectedEvent} type="button"><Copy aria-hidden="true" size={17} /></button>
              <button aria-label={isFullscreen ? 'Quitter le plein écran' : 'Afficher en plein écran'} className="planning-icon-button" onClick={() => void toggleFullscreen()} type="button"><Expand aria-hidden="true" size={17} /></button>
              <button aria-label="Plus d’options" className="planning-icon-button" onClick={() => setIsSettingsOpen((value) => !value)} type="button"><MoreHorizontal aria-hidden="true" size={18} /></button>
            </div>
          </div>

          <div className="planning-board-titlebar">
            <strong>{planningPeriodTitle(days, viewMode)}</strong>
            <span aria-label="Affectations planning">{overview.assignments.length} affectation(s)</span>
            <span aria-label="Journees SMTR">{overview.days.length} journée(s) SMTR</span>
            <span aria-label="Periodes SMTR">{overview.periods.length} période(s) SMTR</span>
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
                  onOpenEvent={setSelectedEvent}
                  onOpenProject={setSelectedProject}
                  onToggle={() => toggleCollapsed(row.key)}
                  row={row}
                  viewMode={viewMode}
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
            </div>
            <footer><button className="is-secondary" onClick={() => setIsAssignmentOpen(false)} type="button">Annuler</button><button disabled={isSaving} type="submit">Ajouter affectation</button></footer>
          </form>
        </div>
      ) : null}

      {selectedEvent ? <PlanningEventDialog event={selectedEvent} onClose={() => setSelectedEvent(null)} /> : null}
      {selectedProject ? <PlanningProjectDialog onClose={() => setSelectedProject(null)} project={selectedProject} /> : null}
    </section>
  );
}

function PlanningTimelineRow({ row, days, onToggle, onOpenEvent, onOpenProject, viewMode, collapsed }: {
  row: PlanningCrewRow;
  days: ReturnType<typeof buildPlanningTimeline>;
  collapsed: boolean;
  onToggle: () => void;
  onOpenEvent: (event: PlanningCrewEvent) => void;
  onOpenProject: (project: PlanningProjectRecord) => void;
  viewMode: PlanningViewMode;
}) {
  const isGroup = row.type !== 'person';
  return (
    <div className={`planning-calendar-grid planning-timeline-row is-${row.type}`}>
      <div className="planning-row-label">
        {isGroup ? <button aria-label={`${row.label} · ${row.type === 'vessel' ? 'réduire ou développer' : 'réduire ou développer la bordée'}`} onClick={onToggle} type="button">{collapsed ? <Plus aria-hidden="true" size={13} /> : <Minus aria-hidden="true" size={13} />}</button> : <span className="planning-person-indent" />}
        <span><strong>{row.label}</strong>{row.type === 'person' && row.functionLabel ? <small>{row.functionLabel}</small> : null}</span>
      </div>
      {days.map((day) => <span aria-hidden="true" className={`planning-day-cell${day.isWeekend ? ' is-weekend' : ''}${day.date === todayIso() ? ' is-today' : ''}`} key={day.date} />)}
      {row.projects.map((project) => {
        const placement = dateGridPlacement(project.startsOn, project.endsOn, days);
        if (!placement) return null;
        return <button aria-label={`${project.title}, ${project.status}`} className={`planning-project-bar is-${projectStatusTone(project.status)}`} key={project.id} onClick={() => onOpenProject(project)} style={{ gridColumn: `${placement.start + 1} / span ${placement.span}` }} title={`${project.title} · ${project.status}`} type="button"><span>{project.title}</span><span className="planning-project-status-rail"><img alt="" src={projectStatusIcon(project)} /></span></button>;
      })}
      {row.events.map((event) => {
        const placement = dateGridPlacement(event.startsOn, event.endsOn, days);
        if (!placement) return null;
        return <button aria-label={`${event.person}, ${event.status}, du ${formatPlanningDate(event.startsOn)} au ${formatPlanningDate(event.endsOn)}`} className={`planning-crew-bar is-${planningStatusTone(event.status)}`} key={event.id} onClick={() => onOpenEvent(event)} style={{ gridColumn: `${placement.start + 1} / span ${placement.span}` }} title={`${event.person}\n${event.status}\n${formatPlanningDate(event.startsOn)} → ${formatPlanningDate(event.endsOn)}`} type="button">{viewMode !== 'year' && placement.span >= 2 ? <span>{event.status === 'En Mer' ? '' : event.status}</span> : null}</button>;
      })}
    </div>
  );
}

function PlanningSideContent({ sideTab, certificateAlerts, hrAlerts, unassignedPeople, unbilledProjects }: {
  sideTab: SideTab;
  certificateAlerts: ReturnType<typeof buildPlanningCertificateAlerts>;
  hrAlerts: ReturnType<typeof buildPlanningHrAlerts>;
  unassignedPeople: PlanningPerson[];
  unbilledProjects: PlanningProjectRecord[];
}) {
  if (sideTab === 'unassigned') {
    return <div className="planning-side-list">{unassignedPeople.length ? unassignedPeople.map((person) => <article className="planning-side-item" key={person.id}><div><strong>{formatPlanningPerson(person)}</strong><span className="planning-side-badge is-muted">{person.functionLabel || person.gradeLabel || 'Marin'}</span></div><p>{[person.gradeLabel, person.contractType].filter(Boolean).join(' · ') || 'Contrat actif'}</p></article>) : <PlanningEmptySide text="Tous les marins sont affectés." />}</div>;
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

function PlanningEventDialog({ event, onClose }: { event: PlanningCrewEvent; onClose: () => void }) {
  return <div className="planning-dialog-backdrop" role="presentation"><section aria-modal="true" className="planning-dialog is-detail" role="dialog"><header><div><CalendarDays aria-hidden="true" size={20} /><h2>{event.person}</h2></div><button aria-label="Fermer" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button></header><dl><div><dt>Navire</dt><dd>{event.vessel}</dd></div><div><dt>Bordée</dt><dd>{event.board || 'Non renseignée'}</dd></div><div><dt>Période</dt><dd>{formatPlanningDate(event.startsOn)} au {formatPlanningDate(event.endsOn)}</dd></div><div><dt>Statut</dt><dd>{event.status}</dd></div><div><dt>Fonction</dt><dd>{event.functionLabel || 'Équipage'}</dd></div><div><dt>Rythme</dt><dd>{event.rhythm || 'Sans rythme'}</dd></div><div><dt>Commentaires</dt><dd>{event.comments || 'Aucun commentaire'}</dd></div><div><dt>Source</dt><dd>{event.sourceLabel}</dd></div></dl><footer><button onClick={onClose} type="button">Fermer</button></footer></section></div>;
}

function PlanningProjectDialog({ project, onClose }: { project: PlanningProjectRecord; onClose: () => void }) {
  return <div className="planning-dialog-backdrop" role="presentation"><section aria-modal="true" className="planning-dialog is-detail" role="dialog"><header><div><Ship aria-hidden="true" size={20} /><h2>{project.title}</h2></div><button aria-label="Fermer" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button></header><dl><div><dt>Statut</dt><dd>{project.status}</dd></div><div><dt>Période</dt><dd>{formatPlanningDate(project.startsOn)} au {formatPlanningDate(project.endsOn)}</dd></div><div><dt>Navire</dt><dd>{[project.primaryVesselName, project.secondaryVesselName].filter(Boolean).join(' · ') || 'Non renseigné'}</dd></div><div><dt>Client</dt><dd>{project.clientName || 'Non renseigné'}</dd></div><div><dt>Description</dt><dd>{project.description || 'Aucune description'}</dd></div></dl><footer><button onClick={onClose} type="button">Fermer</button></footer></section></div>;
}
