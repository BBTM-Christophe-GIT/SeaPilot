import type { SupabaseClient } from '@supabase/supabase-js';
import { CalendarDays, Ship, UserRoundPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import {
  createPlanningAssignment,
  createVessel,
  fetchPlanningOverview,
  formatPlanningPersonName,
  mapPlanningAssignmentRows,
  type PlanningAssignmentRecord,
  type PlanningDayRecord,
  type PlanningOverview,
  type PlanningPeriodRecord,
  type PlanningPerson,
  type PlanningVessel,
} from './planningQueries';

interface PlanningPageProps {
  client?: SupabaseClient;
  roles?: RoleKey[];
}

interface VesselFormState {
  name: string;
  acronym: string;
}

interface AssignmentFormState {
  vesselId: string;
  captainPersonId: string;
  crewPersonId: string;
  startsOn: string;
  endsOn: string;
  assignmentRole: string;
}

interface PlanningFilterState {
  vesselName: string;
  personName: string;
  startsOn: string;
  endsOn: string;
  status: string;
}

const EMPTY_OVERVIEW: PlanningOverview = {
  vessels: [],
  people: [],
  assignments: [],
  days: [],
  periods: [],
};

const EMPTY_VESSEL_FORM: VesselFormState = {
  name: '',
  acronym: '',
};

const EMPTY_ASSIGNMENT_FORM: AssignmentFormState = {
  vesselId: '',
  captainPersonId: '',
  crewPersonId: '',
  startsOn: '',
  endsOn: '',
  assignmentRole: 'crew',
};

const EMPTY_PLANNING_FILTERS: PlanningFilterState = {
  vesselName: '',
  personName: '',
  startsOn: '',
  endsOn: '',
  status: '',
};

function canManagePlanning(roles: RoleKey[]): boolean {
  return roles.some((role) => role === 'admin' || role === 'direction' || role === 'armement');
}

function sortVessels(vessels: PlanningVessel[]): PlanningVessel[] {
  return [...vessels].sort((left, right) => left.name.localeCompare(right.name, 'fr'));
}

function sortAssignments(assignments: PlanningAssignmentRecord[]): PlanningAssignmentRecord[] {
  return [...assignments].sort(
    (left, right) =>
      left.startsOn.localeCompare(right.startsOn) ||
      left.endsOn.localeCompare(right.endsOn) ||
      left.vesselName.localeCompare(right.vesselName, 'fr') ||
      left.crewName.localeCompare(right.crewName, 'fr'),
  );
}

function sortPlanningDays(days: PlanningDayRecord[]): PlanningDayRecord[] {
  return [...days].sort(
    (left, right) =>
      left.workDate.localeCompare(right.workDate) ||
      left.vesselName.localeCompare(right.vesselName, 'fr') ||
      left.crewName.localeCompare(right.crewName, 'fr'),
  );
}

function sortPlanningPeriods(periods: PlanningPeriodRecord[]): PlanningPeriodRecord[] {
  return [...periods].sort(
    (left, right) =>
      left.startsOn.localeCompare(right.startsOn) ||
      left.endsOn.localeCompare(right.endsOn) ||
      left.vesselName.localeCompare(right.vesselName, 'fr') ||
      left.crewName.localeCompare(right.crewName, 'fr'),
  );
}

function vesselOptionLabel(vessel: PlanningVessel): string {
  return vessel.acronym ? `${vessel.name} (${vessel.acronym})` : vessel.name;
}

function personOptionLabel(person: PlanningPerson): string {
  const functionSuffix = person.functionLabel ? ` - ${person.functionLabel}` : '';
  return `${formatPlanningPersonName(person)}${functionSuffix}`;
}

function displayText(value: string): string {
  return value || '-';
}

function displayHours(value: number | null): string {
  return value === null ? '-' : `${value} h`;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right, 'fr'));
}

function isPeriodWithinFilter(startsOn: string, endsOn: string, filters: PlanningFilterState): boolean {
  return (!filters.startsOn || endsOn >= filters.startsOn) && (!filters.endsOn || startsOn <= filters.endsOn);
}

function isDayWithinFilter(workDate: string, filters: PlanningFilterState): boolean {
  return (!filters.startsOn || workDate >= filters.startsOn) && (!filters.endsOn || workDate <= filters.endsOn);
}

function assignmentMatchesFilters(assignment: PlanningAssignmentRecord, filters: PlanningFilterState): boolean {
  if (filters.vesselName && assignment.vesselName !== filters.vesselName) {
    return false;
  }

  if (filters.personName && assignment.crewName !== filters.personName && assignment.captainName !== filters.personName) {
    return false;
  }

  if (!isPeriodWithinFilter(assignment.startsOn, assignment.endsOn, filters)) {
    return false;
  }

  return !filters.status;
}

function dayMatchesFilters(day: PlanningDayRecord, filters: PlanningFilterState): boolean {
  if (filters.vesselName && day.vesselName !== filters.vesselName) {
    return false;
  }

  if (filters.personName && day.crewName !== filters.personName && day.captainName !== filters.personName) {
    return false;
  }

  if (!isDayWithinFilter(day.workDate, filters)) {
    return false;
  }

  return !filters.status || day.sailorStatus === filters.status || day.dayStatus === filters.status;
}

function periodMatchesFilters(period: PlanningPeriodRecord, filters: PlanningFilterState): boolean {
  if (filters.vesselName && period.vesselName !== filters.vesselName) {
    return false;
  }

  if (filters.personName && period.crewName !== filters.personName) {
    return false;
  }

  if (!isPeriodWithinFilter(period.startsOn, period.endsOn, filters)) {
    return false;
  }

  return !filters.status || period.sailorStatus === filters.status;
}

export function PlanningPage({ client, roles }: PlanningPageProps) {
  const outletContext = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || outletContext?.client || supabase;
  const effectiveRoles = roles || outletContext?.roles || [];
  const isManager = canManagePlanning(effectiveRoles);
  const [overview, setOverview] = useState<PlanningOverview>(EMPTY_OVERVIEW);
  const [vesselForm, setVesselForm] = useState<VesselFormState>(EMPTY_VESSEL_FORM);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentFormState>(EMPTY_ASSIGNMENT_FORM);
  const [filters, setFilters] = useState<PlanningFilterState>(EMPTY_PLANNING_FILTERS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    setErrorMessage(null);

    fetchPlanningOverview(effectiveClient)
      .then((loadedOverview) => {
        if (isMounted) {
          setOverview({
            vessels: sortVessels(loadedOverview.vessels),
            people: loadedOverview.people,
            assignments: sortAssignments(loadedOverview.assignments),
            days: sortPlanningDays(loadedOverview.days),
            periods: sortPlanningPeriods(loadedOverview.periods),
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setErrorMessage('Impossible de charger le planning.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [effectiveClient]);

  const activeVessels = useMemo(() => overview.vessels.filter((vessel) => vessel.active), [overview.vessels]);
  const activePeople = useMemo(() => overview.people.filter((person) => person.active), [overview.people]);
  const vesselFilterOptions = useMemo(
    () =>
      uniqueSorted([
        ...overview.assignments.map((assignment) => assignment.vesselName),
        ...overview.days.map((day) => day.vesselName),
        ...overview.periods.map((period) => period.vesselName),
      ]),
    [overview.assignments, overview.days, overview.periods],
  );
  const personFilterOptions = useMemo(
    () =>
      uniqueSorted([
        ...overview.assignments.flatMap((assignment) => [assignment.crewName, assignment.captainName === '-' ? '' : assignment.captainName]),
        ...overview.days.flatMap((day) => [day.crewName, day.captainName]),
        ...overview.periods.map((period) => period.crewName),
      ]),
    [overview.assignments, overview.days, overview.periods],
  );
  const statusFilterOptions = useMemo(
    () =>
      uniqueSorted([
        ...overview.days.flatMap((day) => [day.sailorStatus, day.dayStatus]),
        ...overview.periods.map((period) => period.sailorStatus),
      ]),
    [overview.days, overview.periods],
  );
  const filteredAssignments = useMemo(
    () => overview.assignments.filter((assignment) => assignmentMatchesFilters(assignment, filters)),
    [filters, overview.assignments],
  );
  const filteredDays = useMemo(() => overview.days.filter((day) => dayMatchesFilters(day, filters)), [filters, overview.days]);
  const filteredPeriods = useMemo(
    () => overview.periods.filter((period) => periodMatchesFilters(period, filters)),
    [filters, overview.periods],
  );
  const hasActiveFilters = Object.values(filters).some(Boolean);

  function updateVesselFormValue(key: keyof VesselFormState, value: string) {
    setVesselForm((currentForm) => ({
      ...currentForm,
      [key]: value,
    }));
  }

  function updateAssignmentFormValue(key: keyof AssignmentFormState, value: string) {
    setAssignmentForm((currentForm) => ({
      ...currentForm,
      [key]: value,
    }));
  }

  function updateFilterValue(key: keyof PlanningFilterState, value: string) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      [key]: value,
    }));
  }

  async function handleCreateVessel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const vessel = await createVessel(effectiveClient, vesselForm);
      setOverview((currentOverview) => ({
        ...currentOverview,
        vessels: sortVessels([...currentOverview.vessels, vessel]),
      }));
      setVesselForm(EMPTY_VESSEL_FORM);
      setStatusMessage('Navire ajoute.');
    } catch {
      setErrorMessage("Impossible d'ajouter ce navire.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const assignmentRow = await createPlanningAssignment(effectiveClient, assignmentForm);
      const [assignment] = mapPlanningAssignmentRows([assignmentRow], overview.people, overview.vessels);
      setOverview((currentOverview) => ({
        ...currentOverview,
        assignments: sortAssignments([...currentOverview.assignments, assignment]),
      }));
      setAssignmentForm(EMPTY_ASSIGNMENT_FORM);
      setStatusMessage('Affectation ajoutee.');
    } catch {
      setErrorMessage("Impossible d'ajouter cette affectation.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="admin-state">Chargement du planning...</div>;
  }

  return (
    <section className="planning-page">
      <div className="admin-header">
        <div>
          <p className="module-family">Planning</p>
          <h1>Planning</h1>
        </div>
        <div className="planning-summary-grid">
          <div className="planning-summary" aria-label="Affectations planning">
            <CalendarDays aria-hidden="true" size={18} />
            <strong>{filteredAssignments.length}</strong>
            <span>{filteredAssignments.length > 1 ? 'affectations' : 'affectation'}</span>
          </div>
          <div className="planning-summary" aria-label="Journees SMTR">
            <CalendarDays aria-hidden="true" size={18} />
            <strong>{filteredDays.length}</strong>
            <span>journees SMTR</span>
          </div>
          <div className="planning-summary" aria-label="Periodes SMTR">
            <CalendarDays aria-hidden="true" size={18} />
            <strong>{filteredPeriods.length}</strong>
            <span>periodes SMTR</span>
          </div>
        </div>
      </div>

      <div className="admin-notices" aria-live="polite">
        {statusMessage ? <p className="admin-success">{statusMessage}</p> : null}
        {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      </div>

      <div className="planning-toolbar">
        <span className={isManager ? 'planning-mode-write' : 'planning-mode-read'}>
          {isManager ? 'Modification' : 'Lecture seule'}
        </span>
      </div>

      <div className="planning-filter-panel" aria-label="Filtres planning">
        <label>
          Filtre navire
          <select onChange={(event) => updateFilterValue('vesselName', event.target.value)} value={filters.vesselName}>
            <option value="">Tous les navires</option>
            {vesselFilterOptions.map((vesselName) => (
              <option key={vesselName} value={vesselName}>
                {vesselName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Filtre marin
          <select onChange={(event) => updateFilterValue('personName', event.target.value)} value={filters.personName}>
            <option value="">Tous les marins</option>
            {personFilterOptions.map((personName) => (
              <option key={personName} value={personName}>
                {personName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Debut filtre
          <input
            onChange={(event) => updateFilterValue('startsOn', event.target.value)}
            type="date"
            value={filters.startsOn}
          />
        </label>
        <label>
          Fin filtre
          <input onChange={(event) => updateFilterValue('endsOn', event.target.value)} type="date" value={filters.endsOn} />
        </label>
        <label>
          Filtre statut
          <select onChange={(event) => updateFilterValue('status', event.target.value)} value={filters.status}>
            <option value="">Tous les statuts</option>
            {statusFilterOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <button disabled={!hasActiveFilters} onClick={() => setFilters(EMPTY_PLANNING_FILTERS)} type="button">
          Reinitialiser
        </button>
      </div>

      {isManager ? (
        <div className="planning-forms">
          <form className="planning-form planning-vessel-form" onSubmit={handleCreateVessel}>
            <div className="planning-form-title">
              <Ship aria-hidden="true" size={18} />
              <strong>Nouveau navire</strong>
            </div>
            <label>
              Nom navire
              <input
                onChange={(event) => updateVesselFormValue('name', event.target.value)}
                required
                value={vesselForm.name}
              />
            </label>
            <label>
              Acronyme
              <input onChange={(event) => updateVesselFormValue('acronym', event.target.value)} value={vesselForm.acronym} />
            </label>
            <button disabled={isSaving} type="submit">
              Ajouter navire
            </button>
          </form>

          <form className="planning-form planning-assignment-form" onSubmit={handleCreateAssignment}>
            <div className="planning-form-title">
              <UserRoundPlus aria-hidden="true" size={18} />
              <strong>Nouvelle affectation</strong>
            </div>
            <label>
              Navire
              <select
                onChange={(event) => updateAssignmentFormValue('vesselId', event.target.value)}
                required
                value={assignmentForm.vesselId}
              >
                <option value="">Choisir</option>
                {activeVessels.map((vessel) => (
                  <option key={vessel.id} value={vessel.id}>
                    {vesselOptionLabel(vessel)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Marin
              <select
                onChange={(event) => updateAssignmentFormValue('crewPersonId', event.target.value)}
                required
                value={assignmentForm.crewPersonId}
              >
                <option value="">Choisir</option>
                {activePeople.map((person) => (
                  <option key={person.id} value={person.id}>
                    {personOptionLabel(person)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Capitaine
              <select
                onChange={(event) => updateAssignmentFormValue('captainPersonId', event.target.value)}
                value={assignmentForm.captainPersonId}
              >
                <option value="">Aucun</option>
                {activePeople.map((person) => (
                  <option key={person.id} value={person.id}>
                    {personOptionLabel(person)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Debut
              <input
                onChange={(event) => updateAssignmentFormValue('startsOn', event.target.value)}
                required
                type="date"
                value={assignmentForm.startsOn}
              />
            </label>
            <label>
              Fin
              <input
                onChange={(event) => updateAssignmentFormValue('endsOn', event.target.value)}
                required
                type="date"
                value={assignmentForm.endsOn}
              />
            </label>
            <label>
              Fonction
              <input
                onChange={(event) => updateAssignmentFormValue('assignmentRole', event.target.value)}
                value={assignmentForm.assignmentRole}
              />
            </label>
            <button disabled={isSaving} type="submit">
              Ajouter affectation
            </button>
          </form>
        </div>
      ) : null}

      {filteredAssignments.length === 0 ? (
        <div className="admin-state">Aucune affectation a afficher.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table planning-table">
            <thead>
              <tr>
                <th scope="col">Navire</th>
                <th scope="col">Marin</th>
                <th scope="col">Capitaine</th>
                <th scope="col">Periode</th>
                <th scope="col">Fonction</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssignments.map((assignment) => (
                <tr key={assignment.id}>
                  <th scope="row">{assignment.vesselName}</th>
                  <td>{assignment.crewName}</td>
                  <td>{assignment.captainName}</td>
                  <td>{`${assignment.startsOn} au ${assignment.endsOn}`}</td>
                  <td>{assignment.assignmentRole}</td>
                  <td>{assignment.sourceLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filteredDays.length > 0 || filteredPeriods.length > 0 ? (
        <section className="planning-import-panel" aria-label="Planning importe SharePoint">
          <div className="planning-import-header">
            <div>
              <p className="module-family">Import SharePoint</p>
              <h2>Planning importe SharePoint</h2>
            </div>
          </div>

          {filteredPeriods.length > 0 ? (
            <div className="planning-import-block">
              <h3>Periodes SMTR</h3>
              <div className="admin-table-wrap">
                <table className="admin-table planning-table">
                  <thead>
                    <tr>
                      <th scope="col">Marin</th>
                      <th scope="col">Navire</th>
                      <th scope="col">Periode</th>
                      <th scope="col">Fonction</th>
                      <th scope="col">Statut</th>
                      <th scope="col">Bordee</th>
                      <th scope="col">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPeriods.map((period) => (
                      <tr key={period.id}>
                        <th scope="row">{period.crewName}</th>
                        <td>{period.vesselName}</td>
                        <td>{`${period.startsOn} au ${period.endsOn}`}</td>
                        <td>{displayText(period.functionLabel)}</td>
                        <td>{displayText(period.sailorStatus)}</td>
                        <td>{displayText(period.watchGroup)}</td>
                        <td>{displayText(period.slot365SourceKey)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {filteredDays.length > 0 ? (
            <div className="planning-import-block">
              <h3>Journees SMTR</h3>
              <div className="admin-table-wrap">
                <table className="admin-table planning-table">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Marin</th>
                      <th scope="col">Navire</th>
                      <th scope="col">Capitaine</th>
                      <th scope="col">Statut jour</th>
                      <th scope="col">Fonction</th>
                      <th scope="col">Heures</th>
                      <th scope="col">Slot365</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDays.map((day) => (
                      <tr key={day.id}>
                        <th scope="row">{day.workDate}</th>
                        <td>{day.crewName}</td>
                        <td>{day.vesselName}</td>
                        <td>{displayText(day.captainName)}</td>
                        <td>{displayText(day.dayStatus)}</td>
                        <td>{displayText(day.functionLabel)}</td>
                        <td>{displayHours(day.workedHours)}</td>
                        <td>{displayText(day.slot365)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
