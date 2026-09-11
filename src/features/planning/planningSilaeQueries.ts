import type { SupabaseClient } from '@supabase/supabase-js';
import { addPlanningDays, planningDateFromTimestamp } from './planningDates';
import { normalizePlanningText } from './planningModel';
import { PLANNING_ASSIGNMENT_NOTE_SOURCE, PLANNING_VESSEL_LOCATION_SOURCE } from './planningQueries';
import { silaeMonthRange, type SilaeData, type SilaePerson, type SilaeSource } from './planningSilae';

type Row = Record<string, unknown>;
const text = (value: unknown) => value === null || value === undefined ? '' : String(value).trim();
const id = (value: unknown) => value === null || value === undefined ? null : Number(value);
const PAGE_SIZE = 500;

// Read through the signed-in client's RLS. Every relation is paginated and
// ordered by a unique key; payroll must never inherit a grid/API row limit.
async function readRows(client: SupabaseClient, table: string, columns: string, dateColumn?: string, end?: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    let query = client.from(table).select(columns).order('id', { ascending: true });
    if (dateColumn && end) query = query.lte(dateColumn, end);
    const { data, error } = await query.range(start, start + PAGE_SIZE - 1);
    if (error) throw new Error(`Impossible de charger les données SILAE (${table}). Réessayez ou vérifiez vos droits d’accès.`, { cause: error });
    const page = (data || []) as unknown as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export async function fetchPlanningSilaeData(client: SupabaseClient, month: string): Promise<SilaeData> {
  const range = silaeMonthRange(month);
  const [peopleRows, vesselRows, periods, assignments, days, absences] = await Promise.all([
    readRows(client, 'people', 'id,first_name,last_name,employee_number,enim_function_code,enim_category,function_label,grade_label,role_label,hired_on,departed_on,active'),
    readRows(client, 'vessels', 'id,name,registration_number'),
    readRows(client, 'planning_periods', 'id,person_id,crew_name,vessel_id,starts_on,ends_on,sailor_status', 'starts_on', range.end),
    readRows(client, 'planning_assignments', 'id,crew_person_id,vessel_id,starts_on,ends_on,status_label,confirmation_status', 'starts_on', range.end),
    readRows(client, 'planning_days', 'id,person_id,crew_name,vessel_id,work_date,sailor_status,day_status,source_label,slot365', 'work_date', range.end),
    readRows(client, 'planning_absences', 'id,person_id,absence_type,starts_at,ends_at,status', 'starts_at', `${addPlanningDays(range.end, 1)}T00:00:00Z`),
  ]);
  const people: SilaePerson[] = peopleRows.map((row) => ({
    id: Number(row.id), firstName: text(row.first_name), lastName: text(row.last_name),
    employeeNumber: text(row.employee_number), enimFunctionCode: text(row.enim_function_code), enimCategory: text(row.enim_category),
    functionLabel: text(row.function_label), gradeLabel: text(row.grade_label), roleLabel: text(row.role_label),
    hiredOn: text(row.hired_on), departedOn: text(row.departed_on), active: row.active === true,
  }));
  function sourcePerson(row: Row): number | null {
    if (id(row.person_id) !== null) return id(row.person_id);
    const name = normalizePlanningText(text(row.crew_name));
    const matches = people.filter((person) => name && [normalizePlanningText(`${person.lastName} ${person.firstName}`), normalizePlanningText(`${person.firstName} ${person.lastName}`)].includes(name));
    return matches.length === 1 ? matches[0].id : null;
  }
  const validAssignments = assignments.filter((row) => row.confirmation_status !== 'cancelled');
  const assignmentById = new Map(validAssignments.map((row) => [Number(row.id), row]));
  const sources: SilaeSource[] = periods.map((row) => ({
    personId: sourcePerson(row), vesselId: id(row.vessel_id), startsOn: text(row.starts_on), endsOn: text(row.ends_on), status: text(row.sailor_status), priority: 1,
  }));
  sources.push(...validAssignments.map((row) => ({
    personId: id(row.crew_person_id), vesselId: id(row.vessel_id), startsOn: text(row.starts_on), endsOn: text(row.ends_on), status: text(row.status_label), priority: 2,
  })));
  days.forEach((row) => {
    if (row.source_label === PLANNING_VESSEL_LOCATION_SOURCE) return;
    const date = text(row.work_date);
    const assignment = assignmentById.get(Number(text(row.slot365).replace('assignment:', '')));
    if (row.source_label === PLANNING_ASSIGNMENT_NOTE_SOURCE
      && (!assignment || date < text(assignment.starts_on) || date > text(assignment.ends_on))) return;
    sources.push({ personId: sourcePerson(row), vesselId: id(row.vessel_id), startsOn: date, endsOn: date, status: text(row.sailor_status) || text(row.day_status), priority: 3 });
  });
  absences.filter((row) => row.status === 'approved').forEach((row) => {
    sources.push({
      personId: id(row.person_id), vesselId: null, startsOn: planningDateFromTimestamp(text(row.starts_at)),
      endsOn: planningDateFromTimestamp(new Date(Date.parse(text(row.ends_at)) - 1).toISOString()),
      status: row.absence_type === 'leave' ? 'Congés' : `Absence ${text(row.absence_type)}`, priority: 4,
    });
  });
  return { people, sources, vessels: vesselRows.map((row) => ({ id: Number(row.id), name: text(row.name), registrationNumber: text(row.registration_number) })) };
}
