import type { SupabaseClient } from '@supabase/supabase-js';

export type FleetAssetKind = 'vessel' | 'office' | 'quay';

const FLEET_VESSEL_SELECT = [
  'id', 'company_id', 'name', 'acronym', 'asset_kind', 'type_label', 'unit_type_label',
  'fleet_exit_on', 'registration_number', 'imo_number', 'registration_port', 'call_sign',
  'mmsi', 'gross_tonnage', 'max_people', 'crew_members', 'medical_dotation', 'length_overall',
  'flag_state', 'active', 'sharepoint_list_id', 'sharepoint_item_id', 'source_modified_at',
  'source_guid', 'source_etag', 'source_active_label', 'source_fleet_exit_at', 'photo_url',
  'photo_storage_bucket', 'photo_storage_path', 'brochure_subtitle', 'brochure_summary',
  'brochure_operations', 'built_year', 'classification_label', 'navigation_category',
  'beam_overall_m', 'lightship_tonnes', 'deadweight_tonnes', 'safe_manning', 'main_engine',
  'main_engine_power_kw', 'bow_thruster_power_kw', 'gensets', 'max_speed_knots',
  'bollard_pull_tonnes', 'fuel_capacity_m3', 'range_description', 'deck_equipment',
  'electronics_communications', 'accommodation', 'liability_insurer',
].join(', ');

interface FleetVesselRow {
  id: number | string;
  company_id: number | string;
  name: string;
  acronym: string | null;
  asset_kind: FleetAssetKind | null;
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
  flag_state: string | null;
  active: boolean;
  sharepoint_list_id: string | null;
  sharepoint_item_id: string | null;
  source_modified_at: string | null;
  source_guid: string | null;
  source_etag: string | null;
  source_active_label: string | null;
  source_fleet_exit_at: string | null;
  photo_url: string | null;
  photo_storage_bucket: string | null;
  photo_storage_path: string | null;
  brochure_subtitle: string | null;
  brochure_summary: string | null;
  brochure_operations: string[] | null;
  built_year: number | string | null;
  classification_label: string | null;
  navigation_category: string | null;
  beam_overall_m: number | string | null;
  lightship_tonnes: number | string | null;
  deadweight_tonnes: number | string | null;
  safe_manning: number | string | null;
  main_engine: string | null;
  main_engine_power_kw: number | string | null;
  bow_thruster_power_kw: number | string | null;
  gensets: string | null;
  max_speed_knots: number | string | null;
  bollard_pull_tonnes: number | string | null;
  fuel_capacity_m3: number | string | null;
  range_description: string | null;
  deck_equipment: string | null;
  electronics_communications: string | null;
  accommodation: string | null;
  liability_insurer: string | null;
}

export interface FleetVessel {
  id: number;
  companyId: number;
  name: string;
  acronym: string;
  assetKind: FleetAssetKind;
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
  flagState: string;
  active: boolean;
  sharePointListId: string;
  sharePointItemId: string;
  sourceModifiedAt: string;
  sourceGuid: string;
  sourceEtag: string;
  sourceActiveLabel: string;
  sourceFleetExitAt: string;
  photoUrl: string;
  photoStorageBucket: string;
  photoStoragePath: string;
  brochureSubtitle: string;
  brochureSummary: string;
  brochureOperations: string[];
  builtYear: number | null;
  classificationLabel: string;
  navigationCategory: string;
  beamOverallM: number | null;
  lightshipTonnes: number | null;
  deadweightTonnes: number | null;
  safeManning: number | null;
  mainEngine: string;
  mainEnginePowerKw: number | null;
  bowThrusterPowerKw: number | null;
  gensets: string;
  maxSpeedKnots: number | null;
  bollardPullTonnes: number | null;
  fuelCapacityM3: number | null;
  rangeDescription: string;
  deckEquipment: string;
  electronicsCommunications: string;
  accommodation: string;
  liabilityInsurer: string;
}

export interface SaveFleetVesselInput {
  id?: number;
  name: string;
  acronym: string;
  assetKind: FleetAssetKind;
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
  flagState: string;
  brochureSubtitle: string;
  brochureSummary: string;
  brochureOperations: string;
  builtYear: number | null;
  classificationLabel: string;
  navigationCategory: string;
  beamOverallM: number | null;
  lightshipTonnes: number | null;
  deadweightTonnes: number | null;
  safeManning: number | null;
  mainEngine: string;
  mainEnginePowerKw: number | null;
  bowThrusterPowerKw: number | null;
  gensets: string;
  maxSpeedKnots: number | null;
  bollardPullTonnes: number | null;
  fuelCapacityM3: number | null;
  rangeDescription: string;
  deckEquipment: string;
  electronicsCommunications: string;
  accommodation: string;
  liabilityInsurer: string;
}

function optional(value: string): string | null {
  return value.trim() || null;
}

function numberOrNull(value: number | string | null | undefined): number | null {
  return value == null || value === '' ? null : Number(value);
}

function mapFleetVessel(row: FleetVesselRow): FleetVessel {
  return {
    id: Number(row.id), companyId: Number(row.company_id), name: row.name, acronym: row.acronym || '',
    assetKind: row.asset_kind || 'vessel', typeLabel: row.type_label || '', unitTypeLabel: row.unit_type_label || '',
    fleetExitOn: row.fleet_exit_on || '', registrationNumber: row.registration_number || '', imoNumber: row.imo_number || '',
    registrationPort: row.registration_port || '', callSign: row.call_sign || '', mmsi: row.mmsi || '',
    grossTonnage: row.gross_tonnage || '', maxPeople: numberOrNull(row.max_people), crewMembers: row.crew_members || '',
    medicalDotation: row.medical_dotation || '', lengthOverall: row.length_overall || '', flagState: row.flag_state || '',
    active: row.active, sharePointListId: row.sharepoint_list_id || '', sharePointItemId: row.sharepoint_item_id || '',
    sourceModifiedAt: row.source_modified_at || '', sourceGuid: row.source_guid || '', sourceEtag: row.source_etag || '',
    sourceActiveLabel: row.source_active_label || '', sourceFleetExitAt: row.source_fleet_exit_at || '', photoUrl: row.photo_url || '',
    photoStorageBucket: row.photo_storage_bucket || '', photoStoragePath: row.photo_storage_path || '',
    brochureSubtitle: row.brochure_subtitle || '', brochureSummary: row.brochure_summary || '',
    brochureOperations: row.brochure_operations || [], builtYear: numberOrNull(row.built_year),
    classificationLabel: row.classification_label || '', navigationCategory: row.navigation_category || '',
    beamOverallM: numberOrNull(row.beam_overall_m), lightshipTonnes: numberOrNull(row.lightship_tonnes),
    deadweightTonnes: numberOrNull(row.deadweight_tonnes), safeManning: numberOrNull(row.safe_manning),
    mainEngine: row.main_engine || '', mainEnginePowerKw: numberOrNull(row.main_engine_power_kw),
    bowThrusterPowerKw: numberOrNull(row.bow_thruster_power_kw), gensets: row.gensets || '',
    maxSpeedKnots: numberOrNull(row.max_speed_knots), bollardPullTonnes: numberOrNull(row.bollard_pull_tonnes),
    fuelCapacityM3: numberOrNull(row.fuel_capacity_m3), rangeDescription: row.range_description || '',
    deckEquipment: row.deck_equipment || '', electronicsCommunications: row.electronics_communications || '',
    accommodation: row.accommodation || '', liabilityInsurer: row.liability_insurer || '',
  };
}

export async function fetchFleetVessels(client: SupabaseClient): Promise<FleetVessel[]> {
  const { data, error } = await client.from('vessels').select(FLEET_VESSEL_SELECT)
    .order('active', { ascending: false }).order('name', { ascending: true });
  if (error) throw error;
  return ((data || []) as unknown as FleetVesselRow[]).map(mapFleetVessel);
}

export async function saveFleetVessel(client: SupabaseClient, input: SaveFleetVesselInput): Promise<FleetVessel> {
  const name = input.name.trim();
  if (name.length < 2) throw new Error('Le nom doit contenir au moins deux caractères.');
  const payload = {
    name, acronym: optional(input.acronym), asset_kind: input.assetKind, type_label: optional(input.typeLabel),
    unit_type_label: optional(input.unitTypeLabel), registration_number: optional(input.registrationNumber),
    imo_number: optional(input.imoNumber), registration_port: optional(input.registrationPort), call_sign: optional(input.callSign),
    mmsi: optional(input.mmsi), gross_tonnage: optional(input.grossTonnage), max_people: input.maxPeople,
    crew_members: optional(input.crewMembers), medical_dotation: optional(input.medicalDotation),
    length_overall: optional(input.lengthOverall), flag_state: optional(input.flagState),
    brochure_subtitle: optional(input.brochureSubtitle), brochure_summary: optional(input.brochureSummary),
    brochure_operations: input.brochureOperations.split(/\r?\n|;/).map((value) => value.trim()).filter(Boolean),
    built_year: input.builtYear, classification_label: optional(input.classificationLabel),
    navigation_category: optional(input.navigationCategory), beam_overall_m: input.beamOverallM,
    lightship_tonnes: input.lightshipTonnes, deadweight_tonnes: input.deadweightTonnes, safe_manning: input.safeManning,
    main_engine: optional(input.mainEngine), main_engine_power_kw: input.mainEnginePowerKw,
    bow_thruster_power_kw: input.bowThrusterPowerKw, gensets: optional(input.gensets), max_speed_knots: input.maxSpeedKnots,
    bollard_pull_tonnes: input.bollardPullTonnes, fuel_capacity_m3: input.fuelCapacityM3,
    range_description: optional(input.rangeDescription), deck_equipment: optional(input.deckEquipment),
    electronics_communications: optional(input.electronicsCommunications), accommodation: optional(input.accommodation),
    liability_insurer: optional(input.liabilityInsurer),
    active: true, updated_at: new Date().toISOString(),
  };
  const query = input.id ? client.from('vessels').update(payload).eq('id', input.id) : client.from('vessels').insert(payload);
  const { data, error } = await query.select(FLEET_VESSEL_SELECT).single();
  if (error) throw error;
  return mapFleetVessel(data as unknown as FleetVesselRow);
}

function safePhotoExtension(file: File): string {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

export async function uploadFleetVesselPhoto(client: SupabaseClient, vessel: FleetVessel, file: File): Promise<FleetVessel> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('La photo doit être au format JPEG, PNG ou WebP.');
  if (file.size > 10 * 1024 * 1024) throw new Error('La photo dépasse la limite de 10 Mo.');
  const storagePath = `${vessel.companyId}/${vessel.id}/${crypto.randomUUID()}.${safePhotoExtension(file)}`;
  const { error: uploadError } = await client.storage.from('fleet-media').upload(storagePath, file, {
    cacheControl: '3600', contentType: file.type, upsert: false,
  });
  if (uploadError) throw uploadError;
  const { data, error } = await client.from('vessels').update({
    photo_url: null, photo_storage_bucket: 'fleet-media', photo_storage_path: storagePath, updated_at: new Date().toISOString(),
  }).eq('id', vessel.id).select(FLEET_VESSEL_SELECT).single();
  if (error) {
    await client.storage.from('fleet-media').remove([storagePath]);
    throw error;
  }
  if (vessel.photoStorageBucket === 'fleet-media' && vessel.photoStoragePath) {
    await client.storage.from('fleet-media').remove([vessel.photoStoragePath]);
  }
  return mapFleetVessel(data as unknown as FleetVesselRow);
}

export async function resolveFleetVesselPhotoUrl(client: SupabaseClient, vessel: FleetVessel): Promise<string> {
  if (vessel.photoStorageBucket && vessel.photoStoragePath) {
    const { data, error } = await client.storage.from(vessel.photoStorageBucket).createSignedUrl(vessel.photoStoragePath, 3600);
    if (error || !data?.signedUrl) throw error || new Error('Impossible de charger la photo du navire.');
    return data.signedUrl;
  }
  return vessel.photoUrl;
}

export async function archiveFleetVessel(client: SupabaseClient, vesselId: number): Promise<void> {
  const { error } = await client.from('vessels').update({
    active: false, fleet_exit_on: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString(),
  }).eq('id', vesselId);
  if (error) throw error;
}

export async function restoreFleetVessel(client: SupabaseClient, vesselId: number): Promise<void> {
  const { error } = await client.from('vessels').update({ active: true, fleet_exit_on: null, updated_at: new Date().toISOString() }).eq('id', vesselId);
  if (error) throw error;
}
