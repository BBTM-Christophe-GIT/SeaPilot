import type { SupabaseClient } from '@supabase/supabase-js';

const VESSEL_SELECT = 'id, name, acronym, active';
const PLANNING_PERSON_SELECT = 'id, first_name, last_name, function_label, active';
const PLANNING_ASSIGNMENT_SELECT =
  'id, vessel_id, captain_person_id, crew_person_id, starts_on, ends_on, assignment_role, source_label';

interface VesselRow {
  id: number;
  name: string;
  acronym: string | null;
  active: boolean;
}

interface PlanningPersonRow {
  id: number;
  first_name: string;
  last_name: string;
  function_label: string | null;
  active: boolean;
}

export interface PlanningAssignmentRow {
  id: number;
  vessel_id: number;
  captain_person_id: number | null;
  crew_person_id: number;
  starts_on: string;
  ends_on: string;
  assignment_role: string;
  source_label: string;
}

export interface PlanningAssignmentOverviewRow extends PlanningAssignmentRow {
  vessel_name: string | null;
  captain_name: string | null;
  crew_name: string | null;
}

export interface PlanningVessel {
  id: number;
  name: string;
  acronym: string;
  active: boolean;
}

export interface PlanningPerson {
  id: number;
  firstName: string;
  lastName: string;
  functionLabel: string;
  active: boolean;
}

export interface PlanningAssignmentRecord {
  id: number;
  vesselId: number;
  vesselName: string;
  captainPersonId: number | null;
  captainName: string;
  crewPersonId: number;
  crewName: string;
  startsOn: string;
  endsOn: string;
  assignmentRole: string;
  sourceLabel: string;
}

export interface PlanningOverview {
  vessels: PlanningVessel[];
  people: PlanningPerson[];
  assignments: PlanningAssignmentRecord[];
}

export interface CreateVesselInput {
  name: string;
  acronym: string;
}

export interface CreatePlanningAssignmentInput {
  vesselId: string;
  captainPersonId: string;
  crewPersonId: string;
  startsOn: string;
  endsOn: string;
  assignmentRole: string;
}

export function formatPlanningPersonName(person: PlanningPerson): string {
  return [person.firstName, person.lastName].filter(Boolean).join(' ');
}

export function mapVesselRows(rows: VesselRow[]): PlanningVessel[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    acronym: row.acronym || '',
    active: row.active,
  }));
}

export function mapPlanningPeopleRows(rows: PlanningPersonRow[]): PlanningPerson[] {
  return rows.map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    functionLabel: row.function_label || '',
    active: row.active,
  }));
}

export function mapPlanningAssignmentRows(
  rows: PlanningAssignmentRow[],
  people: PlanningPerson[],
  vessels: PlanningVessel[],
): PlanningAssignmentRecord[] {
  const personById = new Map(people.map((person) => [person.id, person]));
  const vesselById = new Map(vessels.map((vessel) => [vessel.id, vessel]));

  return rows.map((row) => {
    const vessel = vesselById.get(row.vessel_id);
    const captain = row.captain_person_id ? personById.get(row.captain_person_id) : undefined;
    const crew = personById.get(row.crew_person_id);

    return {
      id: row.id,
      vesselId: row.vessel_id,
      vesselName: vessel?.name || `Navire #${row.vessel_id}`,
      captainPersonId: row.captain_person_id,
      captainName: captain
        ? formatPlanningPersonName(captain)
        : row.captain_person_id
          ? `Capitaine #${row.captain_person_id}`
          : '-',
      crewPersonId: row.crew_person_id,
      crewName: crew ? formatPlanningPersonName(crew) : `Marin #${row.crew_person_id}`,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      assignmentRole: row.assignment_role,
      sourceLabel: row.source_label,
    };
  });
}

export function mapPlanningAssignmentOverviewRows(rows: PlanningAssignmentOverviewRow[]): PlanningAssignmentRecord[] {
  return rows.map((row) => ({
    id: row.id,
    vesselId: row.vessel_id,
    vesselName: row.vessel_name || `Navire #${row.vessel_id}`,
    captainPersonId: row.captain_person_id,
    captainName: row.captain_name || (row.captain_person_id ? `Capitaine #${row.captain_person_id}` : '-'),
    crewPersonId: row.crew_person_id,
    crewName: row.crew_name || `Marin #${row.crew_person_id}`,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    assignmentRole: row.assignment_role,
    sourceLabel: row.source_label,
  }));
}

export async function fetchVessels(client: SupabaseClient): Promise<PlanningVessel[]> {
  const { data, error } = await client.from('vessels').select(VESSEL_SELECT).order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return mapVesselRows((data || []) as VesselRow[]);
}

export async function fetchPlanningPeople(client: SupabaseClient): Promise<PlanningPerson[]> {
  const { data, error } = await client
    .from('people')
    .select(PLANNING_PERSON_SELECT)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true });

  if (error) {
    throw error;
  }

  return mapPlanningPeopleRows((data || []) as PlanningPersonRow[]);
}

export async function fetchPlanningAssignmentOverviewRows(
  client: SupabaseClient,
): Promise<PlanningAssignmentOverviewRow[]> {
  const { data, error } = await client.rpc('planning_assignment_overview');

  if (error) {
    throw error;
  }

  return (data || []) as PlanningAssignmentOverviewRow[];
}

export async function fetchPlanningOverview(client: SupabaseClient): Promise<PlanningOverview> {
  const [vessels, people, assignmentRows] = await Promise.all([
    fetchVessels(client),
    fetchPlanningPeople(client),
    fetchPlanningAssignmentOverviewRows(client),
  ]);

  return {
    vessels,
    people,
    assignments: mapPlanningAssignmentOverviewRows(assignmentRows),
  };
}

export async function createVessel(client: SupabaseClient, input: CreateVesselInput): Promise<PlanningVessel> {
  const vesselName = input.name.trim();

  if (!vesselName) {
    throw new Error('Le nom du navire est obligatoire.');
  }

  const payload = {
    name: vesselName,
    acronym: input.acronym.trim() || null,
  };
  const { data, error } = await client.from('vessels').insert(payload).select(VESSEL_SELECT).single();

  if (error) {
    throw error;
  }

  return mapVesselRows([data as VesselRow])[0];
}

export async function createPlanningAssignment(
  client: SupabaseClient,
  input: CreatePlanningAssignmentInput,
): Promise<PlanningAssignmentRow> {
  const payload = {
    vessel_id: Number(input.vesselId),
    captain_person_id: input.captainPersonId ? Number(input.captainPersonId) : null,
    crew_person_id: Number(input.crewPersonId),
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    assignment_role: input.assignmentRole.trim() || 'crew',
    source_label: 'seapilot',
  };
  const { data, error } = await client
    .from('planning_assignments')
    .insert(payload)
    .select(PLANNING_ASSIGNMENT_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data as PlanningAssignmentRow;
}
