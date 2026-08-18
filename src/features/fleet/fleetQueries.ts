import type { SupabaseClient } from '@supabase/supabase-js';

const FLEET_VESSEL_SELECT = [
  'id',
  'name',
  'acronym',
  'type_label',
  'unit_type_label',
  'fleet_exit_on',
  'registration_number',
  'imo_number',
  'registration_port',
  'call_sign',
  'mmsi',
  'gross_tonnage',
  'max_people',
  'crew_members',
  'medical_dotation',
  'length_overall',
  'active',
  'sharepoint_list_id',
  'sharepoint_item_id',
  'source_modified_at',
].join(', ');

interface FleetVesselRow {
  id: number | string;
  name: string;
  acronym: string | null;
  type_label: string | null;
  unit_type_label: string | null;
  fleet_exit_on: string | null;
  registration_number: string | null;
  imo_number: string | null;
  registration_port: string | null;
  call_sign: string | null;
  mmsi: string | null;
  gross_tonnage: string | null;
  max_people: number | string | null;
  crew_members: string | null;
  medical_dotation: string | null;
  length_overall: string | null;
  active: boolean;
  sharepoint_list_id: string | null;
  sharepoint_item_id: string | null;
  source_modified_at: string | null;
}

export interface FleetVessel {
  id: number;
  name: string;
  acronym: string;
  typeLabel: string;
  unitTypeLabel: string;
  fleetExitOn: string;
  registrationNumber: string;
  imoNumber: string;
  registrationPort: string;
  callSign: string;
  mmsi: string;
  grossTonnage: string;
  maxPeople: number | null;
  crewMembers: string;
  medicalDotation: string;
  lengthOverall: string;
  active: boolean;
  sharePointListId: string;
  sharePointItemId: string;
  sourceModifiedAt: string;
}

export interface SaveFleetVesselInput {
  id?: number;
  name: string;
  acronym: string;
  typeLabel: string;
  unitTypeLabel: string;
  registrationNumber: string;
  imoNumber: string;
  registrationPort: string;
  callSign: string;
  mmsi: string;
  grossTonnage: string;
  maxPeople: number | null;
  crewMembers: string;
  medicalDotation: string;
  lengthOverall: string;
}

function optional(value: string): string | null {
  return value.trim() || null;
}

function mapFleetVessel(row: FleetVesselRow): FleetVessel {
  return {
    id: Number(row.id),
    name: row.name,
    acronym: row.acronym || '',
    typeLabel: row.type_label || '',
    unitTypeLabel: row.unit_type_label || '',
    fleetExitOn: row.fleet_exit_on || '',
    registrationNumber: row.registration_number || '',
    imoNumber: row.imo_number || '',
    registrationPort: row.registration_port || '',
    callSign: row.call_sign || '',
    mmsi: row.mmsi || '',
    grossTonnage: row.gross_tonnage || '',
    maxPeople: row.max_people == null || row.max_people === '' ? null : Number(row.max_people),
    crewMembers: row.crew_members || '',
    medicalDotation: row.medical_dotation || '',
    lengthOverall: row.length_overall || '',
    active: row.active,
    sharePointListId: row.sharepoint_list_id || '',
    sharePointItemId: row.sharepoint_item_id || '',
    sourceModifiedAt: row.source_modified_at || '',
  };
}

export async function fetchFleetVessels(client: SupabaseClient): Promise<FleetVessel[]> {
  const { data, error } = await client
    .from('vessels')
    .select(FLEET_VESSEL_SELECT)
    .order('active', { ascending: false })
    .order('name', { ascending: true });
  if (error) throw error;
  return ((data || []) as unknown as FleetVesselRow[]).map(mapFleetVessel);
}

export async function saveFleetVessel(client: SupabaseClient, input: SaveFleetVesselInput): Promise<FleetVessel> {
  const name = input.name.trim();
  if (name.length < 2) throw new Error('Le nom du navire doit contenir au moins deux caractères.');
  const payload = {
    name,
    acronym: optional(input.acronym),
    type_label: optional(input.typeLabel),
    unit_type_label: optional(input.unitTypeLabel),
    registration_number: optional(input.registrationNumber),
    imo_number: optional(input.imoNumber),
    registration_port: optional(input.registrationPort),
    call_sign: optional(input.callSign),
    mmsi: optional(input.mmsi),
    gross_tonnage: optional(input.grossTonnage),
    max_people: input.maxPeople,
    crew_members: optional(input.crewMembers),
    medical_dotation: optional(input.medicalDotation),
    length_overall: optional(input.lengthOverall),
    active: true,
    updated_at: new Date().toISOString(),
  };
  const query = input.id
    ? client.from('vessels').update(payload).eq('id', input.id)
    : client.from('vessels').insert(payload);
  const { data, error } = await query.select(FLEET_VESSEL_SELECT).single();
  if (error) throw error;
  return mapFleetVessel(data as unknown as FleetVesselRow);
}

export async function archiveFleetVessel(client: SupabaseClient, vesselId: number): Promise<void> {
  const { error } = await client
    .from('vessels')
    .update({ active: false, fleet_exit_on: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() })
    .eq('id', vesselId);
  if (error) throw error;
}

export async function restoreFleetVessel(client: SupabaseClient, vesselId: number): Promise<void> {
  const { error } = await client
    .from('vessels')
    .update({ active: true, fleet_exit_on: null, updated_at: new Date().toISOString() })
    .eq('id', vesselId);
  if (error) throw error;
}
