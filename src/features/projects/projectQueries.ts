import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeProjectStatus } from './projectStatus';

const READ_PAGE_SIZE = 500;

const PROJECT_SELECT = [
  'id',
  'title',
  'project_code',
  'client_id',
  'client_sharepoint_item_id',
  'client_name',
  'primary_vessel_id',
  'primary_vessel_sharepoint_item_id',
  'primary_vessel_name',
  'secondary_vessel_id',
  'secondary_vessel_sharepoint_item_id',
  'secondary_vessel_name',
  'starts_on',
  'ends_on',
  'delivery_at',
  'redelivery_at',
  'charter_starts_at',
  'charter_ends_at',
  'delivery_port',
  'redelivery_port',
  'contract_type',
  'operation_area',
  'is_rov_support',
  'is_diving_support',
  'status',
  'description',
  'source_label',
  'sharepoint_list_title',
  'sharepoint_item_id',
  'source_modified_at',
  'archived_at',
  'updated_at',
].join(', ');

const PROJECT_CONTRACT_HIRE_PERIOD_SELECT = [
  'id',
  'project_id',
  'contract_id',
  'starts_on',
  'ends_on',
  'charter_hire',
  'standby_hire',
  'weather_standby_hire',
  'hire_currency',
  'hire_unit',
].join(', ');

const VESSEL_SELECT = [
  'id',
  'name',
  'acronym',
  'active',
  'fleet_exit_on',
  'sharepoint_item_id',
  'length_overall',
  'bollard_pull_tonnes',
  'deck_equipment',
  'main_engine',
  'main_engine_power_kw',
  'classification_label',
  'flag_state',
  'registration_number',
  'liability_insurer',
].join(', ');

const PROJECT_DOCUMENT_SELECT = [
  'id',
  'project_id',
  'project_sharepoint_item_id',
  'project_code',
  'project_title',
  'category_key',
  'title',
  'source_label',
  'source_sharepoint_id',
  'file_url',
  'notes',
  'sharepoint_list_id',
  'sharepoint_list_title',
  'sharepoint_item_id',
  'sharepoint_drive_id',
  'sharepoint_drive_item_id',
  'file_name',
  'folder_path',
  'mime_type',
  'file_extension',
  'file_size_bytes',
  'source_modified_at',
  'is_folder',
].join(', ');

const CONTRACT_DOCUMENT_SELECT = [
  PROJECT_DOCUMENT_SELECT,
  'storage_bucket',
  'storage_path',
  'storage_sha256',
  'storage_migrated_at',
].join(', ');

const CLIENT_SELECT = [
  'id',
  'name',
  'represented_by',
  'code',
  'email',
  'phone',
  'address',
  'postal_code',
  'city',
  'country',
  'website',
  'logo_url',
  'logo_storage_path',
  'active',
  'source_label',
  'sharepoint_list_title',
  'sharepoint_item_id',
  'source_modified_at',
  'archived_at',
  'updated_at',
].join(', ');

const PROJECT_OPERATION_DOCUMENT_SELECT = [
  'id',
  'project_id',
  'planning_occurrence_id',
  'document_type',
  'category_key',
  'subcategory_key',
  'expires_on',
  'file_name',
  'mime_type',
  'file_size_bytes',
  'sharepoint_web_url',
  'sharepoint_folder_path',
  'storage_bucket',
  'storage_path',
  'created_at',
].join(', ');

interface ProjectRow {
  id: number;
  title: string;
  project_code: string | null;
  client_id: number | null;
  client_sharepoint_item_id: string | null;
  client_name: string | null;
  primary_vessel_id: number | null;
  primary_vessel_sharepoint_item_id: string | null;
  primary_vessel_name: string | null;
  secondary_vessel_id: number | null;
  secondary_vessel_sharepoint_item_id: string | null;
  secondary_vessel_name: string | null;
  starts_on: string | null;
  ends_on: string | null;
  delivery_at: string | null;
  redelivery_at: string | null;
  charter_starts_at: string | null;
  charter_ends_at: string | null;
  delivery_port: string | null;
  redelivery_port: string | null;
  contract_type: string | null;
  operation_area: string | null;
  is_rov_support: boolean | null;
  is_diving_support: boolean | null;
  status: string | null;
  description: string | null;
  source_label: string | null;
  sharepoint_list_title: string | null;
  sharepoint_item_id: string | null;
  source_modified_at: string | null;
  archived_at: string | null;
  updated_at: string;
}

interface ProjectContractRow {
  id: number;
  project_id: number;
  owner_identity: string | null;
  vessel_assignment_limit: string | null;
  extension_count: number | null;
  extension_duration: number | string | null;
  extension_unit: string | null;
  auto_extension_period: string | null;
  max_extension_days: number | null;
  mobilisation_fee: number | string | null;
  demobilisation_fee: number | string | null;
  fee_currency: string | null;
  charter_hire: number | string | null;
  extension_hire: number | string | null;
  hire_currency: string | null;
  hire_unit: string | null;
  max_audit_period: string | null;
  supplytime_schema_version: string | null;
  supplytime_data: unknown;
  towed_asset_id: number | null;
  source_label: string | null;
  sharepoint_list_title: string | null;
  sharepoint_item_id: string | null;
  source_modified_at: string | null;
  archived_at: string | null;
}

interface VesselRow {
  id: number;
  name: string;
  acronym: string | null;
  active: boolean | null;
  fleet_exit_on: string | null;
  sharepoint_item_id: string | null;
  length_overall: string | null;
  bollard_pull_tonnes: number | string | null;
  deck_equipment: string | null;
  main_engine: string | null;
  main_engine_power_kw: number | string | null;
  classification_label: string | null;
  flag_state: string | null;
  registration_number: string | null;
  liability_insurer: string | null;
}

interface ProjectDocumentRow {
  id: number;
  project_id: number | null;
  project_sharepoint_item_id: string | null;
  project_code: string | null;
  project_title: string | null;
  category_key: string | null;
  title: string;
  source_label: string | null;
  source_sharepoint_id: string | null;
  file_url: string | null;
  notes: string | null;
  sharepoint_list_id: string | null;
  sharepoint_list_title: string | null;
  sharepoint_item_id: string | null;
  sharepoint_drive_id: string | null;
  sharepoint_drive_item_id: string | null;
  file_name: string | null;
  folder_path: string | null;
  mime_type: string | null;
  file_extension: string | null;
  file_size_bytes: number | string | null;
  source_modified_at: string | null;
  is_folder: boolean | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  storage_sha256?: string | null;
  storage_migrated_at?: string | null;
}

interface ClientRow {
  id: number;
  name: string;
  represented_by: string | null;
  code: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
  logo_url: string | null;
  logo_storage_path: string | null;
  active: boolean | null;
  source_label: string | null;
  sharepoint_list_title: string | null;
  sharepoint_item_id: string | null;
  source_modified_at: string | null;
  archived_at: string | null;
  updated_at: string;
}

interface ProjectPlanningOccurrenceRow {
  id: number;
  catalog_project_id: number | null;
  starts_on: string | null;
  ends_on: string | null;
  vessel_ids: number[] | null;
  vessel_names: string[] | null;
  primary_vessel_id?: number | null;
  primary_vessel_name?: string | null;
  status: string | null;
  description: string | null;
  charter_hire: number | string | null;
  hire_currency: string | null;
  hire_unit: string | null;
  charter_hire_override: boolean | null;
  source_label: string | null;
  created_at: string;
}

interface ProjectOperationDocumentRow {
  id: number;
  project_id: number;
  planning_occurrence_id: number | null;
  document_type: string;
  category_key: string | null;
  subcategory_key: string | null;
  expires_on: string | null;
  file_name: string;
  mime_type: string;
  file_size_bytes: number | string;
  sharepoint_web_url: string | null;
  sharepoint_folder_path: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  created_at: string;
}

export interface ProjectRecord {
  id: number;
  title: string;
  projectCode: string;
  clientId: number | null;
  clientSharePointItemId: string;
  clientName: string;
  primaryVesselId: number | null;
  primaryVesselSharePointItemId: string;
  primaryVesselName: string;
  secondaryVesselId: number | null;
  secondaryVesselSharePointItemId: string;
  secondaryVesselName: string;
  startsOn: string;
  endsOn: string;
  deliveryAt: string;
  redeliveryAt: string;
  charterStartsAt: string;
  charterEndsAt: string;
  deliveryPort: string;
  redeliveryPort: string;
  contractType: string;
  operationArea: string;
  isRovSupport: boolean;
  isDivingSupport: boolean;
  status: string;
  description: string;
  sourceLabel: string;
  sharePointListTitle: string;
  sharePointItemId: string;
  sourceModifiedAt: string;
  archivedAt: string;
  updatedAt: string;
}

export interface ProjectContractRecord {
  id: number;
  projectId: number;
  ownerIdentity: string;
  vesselAssignmentLimit: string;
  extensionCount: number | null;
  extensionDuration: number | null;
  extensionUnit: string;
  autoExtensionPeriod: string;
  maxExtensionDays: number | null;
  mobilisationFee: number | null;
  demobilisationFee: number | null;
  feeCurrency: string;
  charterHire: number | null;
  extensionHire: number | null;
  hireCurrency: string;
  hireUnit: string;
  maxAuditPeriod: string;
  supplytimeSchemaVersion: string;
  supplytimeData: Record<string, string>;
  towedAssetId?: number | null;
  sourceLabel: string;
  sharePointListTitle: string;
  sharePointItemId: string;
  sourceModifiedAt: string;
  archivedAt: string;
  hirePeriods?: ProjectContractHirePeriodRecord[];
}

interface ProjectTowedAssetRow {
  id: number;
  name: string;
  asset_type: string | null;
  length_overall_m: number | string | null;
  breadth_overall_m: number | string | null;
  max_draft_m: number | string | null;
  light_displacement_t: number | string | null;
  flag: string | null;
  classification_society: string | null;
  registration_number: string | null;
  owner_name: string | null;
  hull_machinery_insurer: string | null;
  liability_insurer: string | null;
  photo_url: string | null;
  photo_storage_path: string | null;
  active: boolean | null;
}

export interface ProjectTowedAssetRecord {
  id: number;
  name: string;
  assetType: string;
  lengthOverallM: number | null;
  breadthOverallM: number | null;
  maxDraftM: number | null;
  lightDisplacementT: number | null;
  flag: string;
  classificationSociety: string;
  registrationNumber: string;
  ownerName: string;
  hullMachineryInsurer: string;
  liabilityInsurer: string;
  photoUrl: string;
  photoStoragePath: string;
  active: boolean;
}

export interface ProjectContractHirePeriodRecord {
  id: number;
  projectId: number;
  contractId: number;
  startsOn: string;
  endsOn: string;
  charterHire: number;
  standbyHire: number;
  weatherStandbyHire: number;
  hireCurrency: string;
  hireUnit: string;
}

export interface ProjectDocumentRecord {
  id: number;
  projectId: number | null;
  projectSharePointItemId: string;
  projectCode: string;
  projectTitle: string;
  categoryKey: string;
  title: string;
  sourceLabel: string;
  sourceSharePointId: string;
  fileUrl: string;
  notes: string;
  sharePointListId: string;
  sharePointListTitle: string;
  sharePointItemId: string;
  sharePointDriveId: string;
  sharePointDriveItemId: string;
  fileName: string;
  folderPath: string;
  mimeType: string;
  fileExtension: string;
  fileSizeBytes: number | null;
  sourceModifiedAt: string;
  isFolder: boolean;
  storageBucket: string;
  storagePath: string;
  storageSha256: string;
  storageMigratedAt: string;
}

export interface ClientRecord {
  id: number;
  name: string;
  representedBy: string;
  code: string;
  email: string;
  phone: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  website: string;
  logoUrl: string;
  logoStoragePath: string;
  active: boolean;
  sourceLabel: string;
  sharePointListTitle: string;
  sharePointItemId: string;
  sourceModifiedAt: string;
  archivedAt: string;
  updatedAt: string;
}

export interface VesselRecord {
  id: number;
  name: string;
  acronym: string;
  active: boolean;
  fleetExitOn: string;
  sharePointItemId: string;
  lengthOverall?: string;
  bollardPullTonnes?: number | null;
  deckEquipment?: string;
  mainEngine?: string;
  mainEnginePowerKw?: number | null;
  classificationLabel?: string;
  flagState?: string;
  registrationNumber?: string;
  liabilityInsurer?: string;
}

export interface ProjectPlanningOccurrenceRecord {
  id: number;
  projectId: number;
  startsOn: string;
  endsOn: string;
  primaryVesselId: number | null;
  primaryVesselName: string;
  vesselIds?: number[];
  vesselNames?: string[];
  status: string;
  description: string;
  charterHire: number | null;
  hireCurrency: string;
  hireUnit: string;
  charterHireOverride?: boolean;
  sourceLabel: string;
  createdAt: string;
}

export interface ProjectOperationDocumentRecord {
  id: number;
  projectId: number;
  planningOccurrenceId: number | null;
  documentType: string;
  categoryKey?: string;
  subcategoryKey?: string;
  expiresOn?: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  sharePointWebUrl: string;
  sharePointFolderPath: string;
  storageBucket: string;
  storagePath: string;
  createdAt: string;
}

export type ProjectsDataSource =
  | 'clients'
  | 'contractDocuments'
  | 'contractHirePeriods'
  | 'operationDocuments'
  | 'planningOccurrences'
  | 'projectContracts'
  | 'projectDocuments'
  | 'towedAssets'
  | 'vessels';

export interface ProjectsDataWarning {
  source: ProjectsDataSource;
  label: string;
}

export interface ProjectsData {
  projects: ProjectRecord[];
  projectContracts: ProjectContractRecord[];
  contractHirePeriods: ProjectContractHirePeriodRecord[];
  projectDocuments: ProjectDocumentRecord[];
  contractDocuments: ProjectDocumentRecord[];
  operationDocuments: ProjectOperationDocumentRecord[];
  clients: ClientRecord[];
  planningOccurrences: ProjectPlanningOccurrenceRecord[];
  towedAssets: ProjectTowedAssetRecord[];
  vessels: VesselRecord[];
  warnings: ProjectsDataWarning[];
}

export interface ProjectMetrics {
  activeProjects: number;
  totalProjects: number;
  projectDocumentCount: number;
  contractDocumentCount: number;
  clientCount: number;
}

function nullableText(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function nullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function mapSupplytimeData(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function isActiveProject(project: ProjectRecord): boolean {
  if (project.archivedAt) {
    return false;
  }

  const normalizedStatus = project.status
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return !normalizedStatus.includes('facture') && !normalizedStatus.includes('archive');
}

async function fetchRowsById(client: SupabaseClient, table: string, select: string): Promise<unknown[]> {
  const rows: unknown[] = [];
  let cursor = 0;

  while (true) {
    const { data, error } = await client
      .from(table)
      .select(select)
      .order('id', { ascending: true })
      .gt('id', cursor)
      .limit(READ_PAGE_SIZE);

    if (error) {
      throw error;
    }

    const page = (data || []) as unknown[];
    rows.push(...page);

    if (page.length < READ_PAGE_SIZE) {
      return rows;
    }

    const nextCursor = Number((page.at(-1) as { id?: unknown } | undefined)?.id);
    if (!Number.isFinite(nextCursor) || nextCursor <= cursor) {
      throw new Error(`Pagination Supabase invalide pour ${table}.`);
    }
    cursor = nextCursor;
  }
}

export function mapProjectRows(rows: ProjectRow[]): ProjectRecord[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    projectCode: nullableText(row.project_code),
    clientId: row.client_id,
    clientSharePointItemId: nullableText(row.client_sharepoint_item_id),
    clientName: nullableText(row.client_name),
    primaryVesselId: row.primary_vessel_id,
    primaryVesselSharePointItemId: nullableText(row.primary_vessel_sharepoint_item_id),
    primaryVesselName: nullableText(row.primary_vessel_name),
    secondaryVesselId: row.secondary_vessel_id,
    secondaryVesselSharePointItemId: nullableText(row.secondary_vessel_sharepoint_item_id),
    secondaryVesselName: nullableText(row.secondary_vessel_name),
    startsOn: nullableText(row.starts_on),
    endsOn: nullableText(row.ends_on),
    deliveryAt: nullableText(row.delivery_at),
    redeliveryAt: nullableText(row.redelivery_at),
    charterStartsAt: nullableText(row.charter_starts_at),
    charterEndsAt: nullableText(row.charter_ends_at),
    deliveryPort: nullableText(row.delivery_port),
    redeliveryPort: nullableText(row.redelivery_port),
    contractType: nullableText(row.contract_type),
    operationArea: nullableText(row.operation_area),
    isRovSupport: row.is_rov_support ?? false,
    isDivingSupport: row.is_diving_support ?? false,
    status: normalizeProjectStatus(row.status),
    description: nullableText(row.description),
    sourceLabel: nullableText(row.source_label),
    sharePointListTitle: nullableText(row.sharepoint_list_title),
    sharePointItemId: nullableText(row.sharepoint_item_id),
    sourceModifiedAt: nullableText(row.source_modified_at),
    archivedAt: nullableText(row.archived_at),
    updatedAt: nullableText(row.updated_at),
  }));
}

export function mapProjectContractRows(rows: ProjectContractRow[]): ProjectContractRecord[] {
  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    ownerIdentity: nullableText(row.owner_identity),
    vesselAssignmentLimit: nullableText(row.vessel_assignment_limit),
    extensionCount: row.extension_count,
    extensionDuration: nullableNumber(row.extension_duration),
    extensionUnit: nullableText(row.extension_unit),
    autoExtensionPeriod: nullableText(row.auto_extension_period),
    maxExtensionDays: row.max_extension_days,
    mobilisationFee: nullableNumber(row.mobilisation_fee),
    demobilisationFee: nullableNumber(row.demobilisation_fee),
    feeCurrency: nullableText(row.fee_currency),
    charterHire: nullableNumber(row.charter_hire),
    extensionHire: nullableNumber(row.extension_hire),
    hireCurrency: nullableText(row.hire_currency),
    hireUnit: nullableText(row.hire_unit),
    maxAuditPeriod: nullableText(row.max_audit_period),
    supplytimeSchemaVersion: nullableText(row.supplytime_schema_version),
    supplytimeData: mapSupplytimeData(row.supplytime_data),
    towedAssetId: row.towed_asset_id,
    sourceLabel: nullableText(row.source_label),
    sharePointListTitle: nullableText(row.sharepoint_list_title),
    sharePointItemId: nullableText(row.sharepoint_item_id),
    sourceModifiedAt: nullableText(row.source_modified_at),
    archivedAt: nullableText(row.archived_at),
  }));
}

export function mapProjectTowedAssetRows(rows: ProjectTowedAssetRow[]): ProjectTowedAssetRecord[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    assetType: nullableText(row.asset_type),
    lengthOverallM: nullableNumber(row.length_overall_m),
    breadthOverallM: nullableNumber(row.breadth_overall_m),
    maxDraftM: nullableNumber(row.max_draft_m),
    lightDisplacementT: nullableNumber(row.light_displacement_t),
    flag: nullableText(row.flag),
    classificationSociety: nullableText(row.classification_society),
    registrationNumber: nullableText(row.registration_number),
    ownerName: nullableText(row.owner_name),
    hullMachineryInsurer: nullableText(row.hull_machinery_insurer),
    liabilityInsurer: nullableText(row.liability_insurer),
    photoUrl: nullableText(row.photo_url),
    photoStoragePath: nullableText(row.photo_storage_path),
    active: row.active ?? true,
  }));
}

export function mapProjectContractHirePeriodRows(
  rows: Array<Record<string, unknown>>,
): ProjectContractHirePeriodRecord[] {
  return rows.map((row) => ({
    id: Number(row.id),
    projectId: Number(row.project_id),
    contractId: Number(row.contract_id),
    startsOn: nullableText(row.starts_on as string | null),
    endsOn: nullableText(row.ends_on as string | null),
    charterHire: nullableNumber(row.charter_hire as number | string | null) ?? 0,
    standbyHire: nullableNumber(row.standby_hire as number | string | null)
      ?? nullableNumber(row.charter_hire as number | string | null)
      ?? 0,
    weatherStandbyHire: nullableNumber(row.weather_standby_hire as number | string | null)
      ?? nullableNumber(row.charter_hire as number | string | null)
      ?? 0,
    hireCurrency: nullableText(row.hire_currency as string | null),
    hireUnit: nullableText(row.hire_unit as string | null),
  }));
}

export function mapVesselRows(rows: VesselRow[]): VesselRecord[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    acronym: nullableText(row.acronym),
    active: row.active ?? true,
    fleetExitOn: nullableText(row.fleet_exit_on),
    sharePointItemId: nullableText(row.sharepoint_item_id),
    lengthOverall: nullableText(row.length_overall),
    bollardPullTonnes: nullableNumber(row.bollard_pull_tonnes),
    deckEquipment: nullableText(row.deck_equipment),
    mainEngine: nullableText(row.main_engine),
    mainEnginePowerKw: nullableNumber(row.main_engine_power_kw),
    classificationLabel: nullableText(row.classification_label),
    flagState: nullableText(row.flag_state),
    registrationNumber: nullableText(row.registration_number),
    liabilityInsurer: nullableText(row.liability_insurer),
  }));
}

export function mapProjectDocumentRows(rows: ProjectDocumentRow[]): ProjectDocumentRecord[] {
  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    projectSharePointItemId: nullableText(row.project_sharepoint_item_id),
    projectCode: nullableText(row.project_code),
    projectTitle: nullableText(row.project_title),
    categoryKey: nullableText(row.category_key),
    title: row.title,
    sourceLabel: nullableText(row.source_label),
    sourceSharePointId: nullableText(row.source_sharepoint_id),
    fileUrl: nullableText(row.file_url),
    notes: nullableText(row.notes),
    sharePointListId: nullableText(row.sharepoint_list_id),
    sharePointListTitle: nullableText(row.sharepoint_list_title),
    sharePointItemId: nullableText(row.sharepoint_item_id),
    sharePointDriveId: nullableText(row.sharepoint_drive_id),
    sharePointDriveItemId: nullableText(row.sharepoint_drive_item_id),
    fileName: nullableText(row.file_name),
    folderPath: nullableText(row.folder_path),
    mimeType: nullableText(row.mime_type),
    fileExtension: nullableText(row.file_extension),
    fileSizeBytes: nullableNumber(row.file_size_bytes),
    sourceModifiedAt: nullableText(row.source_modified_at),
    isFolder: row.is_folder ?? false,
    storageBucket: nullableText(row.storage_bucket),
    storagePath: nullableText(row.storage_path),
    storageSha256: nullableText(row.storage_sha256),
    storageMigratedAt: nullableText(row.storage_migrated_at),
  }));
}

export function mapClientRows(rows: ClientRow[]): ClientRecord[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    representedBy: nullableText(row.represented_by),
    code: nullableText(row.code),
    email: nullableText(row.email),
    phone: nullableText(row.phone),
    address: nullableText(row.address),
    postalCode: nullableText(row.postal_code),
    city: nullableText(row.city),
    country: nullableText(row.country),
    website: nullableText(row.website),
    logoUrl: nullableText(row.logo_url),
    logoStoragePath: nullableText(row.logo_storage_path),
    active: row.active ?? true,
    sourceLabel: nullableText(row.source_label),
    sharePointListTitle: nullableText(row.sharepoint_list_title),
    sharePointItemId: nullableText(row.sharepoint_item_id),
    sourceModifiedAt: nullableText(row.source_modified_at),
    archivedAt: nullableText(row.archived_at),
    updatedAt: nullableText(row.updated_at),
  }));
}

export function mapProjectPlanningOccurrenceRows(
  rows: ProjectPlanningOccurrenceRow[],
): ProjectPlanningOccurrenceRecord[] {
  return rows.flatMap((row) => {
    if (!Number.isInteger(row.catalog_project_id) || Number(row.catalog_project_id) <= 0) return [];
    const vesselIds = (row.vessel_ids || [row.primary_vessel_id])
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);
    const vesselNames = (row.vessel_names || [row.primary_vessel_name]).map(nullableText).filter(Boolean);
    return [{
      id: row.id,
      projectId: Number(row.catalog_project_id),
      startsOn: nullableText(row.starts_on),
      endsOn: nullableText(row.ends_on || row.starts_on),
      primaryVesselId: vesselIds[0] ?? null,
      primaryVesselName: vesselNames[0] || '',
      vesselIds,
      vesselNames,
      status: normalizeProjectStatus(row.status),
      description: nullableText(row.description),
      charterHire: nullableNumber(row.charter_hire),
      hireCurrency: nullableText(row.hire_currency),
      hireUnit: nullableText(row.hire_unit),
      charterHireOverride: row.charter_hire_override ?? false,
      sourceLabel: nullableText(row.source_label),
      createdAt: nullableText(row.created_at),
    }];
  });
}

export function mapProjectOperationDocumentRows(
  rows: ProjectOperationDocumentRow[],
): ProjectOperationDocumentRecord[] {
  return rows.flatMap((row) => {
    const planningOccurrenceId = Number.isInteger(row.planning_occurrence_id)
      && Number(row.planning_occurrence_id) > 0
      ? Number(row.planning_occurrence_id)
      : null;
    if (planningOccurrenceId === null && row.document_type !== 'project_attachment') return [];
    return [{
      id: row.id,
      projectId: row.project_id,
      planningOccurrenceId,
      documentType: row.document_type,
      categoryKey: nullableText(row.category_key),
      subcategoryKey: nullableText(row.subcategory_key),
      expiresOn: nullableText(row.expires_on),
      fileName: row.file_name,
      mimeType: row.mime_type,
      fileSizeBytes: Number(row.file_size_bytes) || 0,
      sharePointWebUrl: nullableText(row.sharepoint_web_url),
      sharePointFolderPath: nullableText(row.sharepoint_folder_path),
      storageBucket: nullableText(row.storage_bucket),
      storagePath: nullableText(row.storage_path),
      createdAt: row.created_at,
    }];
  });
}

export function buildProjectMetrics(data: ProjectsData): ProjectMetrics {
  return {
    activeProjects: data.projects.filter(isActiveProject).length,
    clientCount: data.clients.filter((client) => client.active && !client.archivedAt).length,
    contractDocumentCount: data.contractDocuments.filter((document) => !document.isFolder).length,
    projectDocumentCount: data.projectDocuments.filter((document) => !document.isFolder).length,
    totalProjects: data.projects.length,
  };
}

export async function fetchProjects(client: SupabaseClient): Promise<ProjectRecord[]> {
  return mapProjectRows((await fetchRowsById(client, 'projects', PROJECT_SELECT)) as ProjectRow[]);
}

export async function fetchProjectContracts(client: SupabaseClient): Promise<ProjectContractRecord[]> {
  const { data, error } = await client.rpc('projects_contracts');
  if (error) throw new Error(error.message || 'Impossible de charger les contrats des projets.');
  return mapProjectContractRows((data || []) as ProjectContractRow[]);
}

export async function fetchProjectTowedAssets(client: SupabaseClient): Promise<ProjectTowedAssetRecord[]> {
  const { data, error } = await client.rpc('projects_towed_assets');
  if (error) throw new Error(error.message || 'Impossible de charger le référentiel des remorqués.');
  return mapProjectTowedAssetRows((data || []) as ProjectTowedAssetRow[]);
}

export async function fetchProjectContractHirePeriods(
  client: SupabaseClient,
): Promise<ProjectContractHirePeriodRecord[]> {
  return mapProjectContractHirePeriodRows(
    (await fetchRowsById(
      client,
      'project_contract_hire_periods',
      PROJECT_CONTRACT_HIRE_PERIOD_SELECT,
    )) as Array<Record<string, unknown>>,
  );
}

export async function fetchProjectDocuments(client: SupabaseClient): Promise<ProjectDocumentRecord[]> {
  return mapProjectDocumentRows(
    (await fetchRowsById(client, 'project_documents', PROJECT_DOCUMENT_SELECT)) as ProjectDocumentRow[],
  ).filter((document) => !document.isFolder);
}

export async function fetchContractDocuments(client: SupabaseClient): Promise<ProjectDocumentRecord[]> {
  return mapProjectDocumentRows(
    (await fetchRowsById(client, 'contract_documents', CONTRACT_DOCUMENT_SELECT)) as ProjectDocumentRow[],
  ).filter((document) => !document.isFolder);
}

export async function fetchClients(client: SupabaseClient): Promise<ClientRecord[]> {
  return mapClientRows((await fetchRowsById(client, 'clients', CLIENT_SELECT)) as ClientRow[]);
}

export async function fetchVessels(client: SupabaseClient): Promise<VesselRecord[]> {
  return mapVesselRows((await fetchRowsById(client, 'vessels', VESSEL_SELECT)) as VesselRow[]);
}

export async function fetchProjectPlanningOccurrences(
  client: SupabaseClient,
): Promise<ProjectPlanningOccurrenceRecord[]> {
  const { data, error } = await client.rpc('projects_planning_occurrences');
  if (error) throw new Error(error.message || 'Impossible de charger les opérations des projets.');
  return mapProjectPlanningOccurrenceRows(
    (data || []) as ProjectPlanningOccurrenceRow[],
  );
}

export async function fetchProjectOperationDocuments(
  client: SupabaseClient,
): Promise<ProjectOperationDocumentRecord[]> {
  const rows = await fetchRowsById(
    client,
    'project_generated_documents',
    PROJECT_OPERATION_DOCUMENT_SELECT,
  ) as ProjectOperationDocumentRow[];
  return mapProjectOperationDocumentRows(rows);
}

const OPTIONAL_SOURCES: Array<{
  source: ProjectsDataSource;
  label: string;
}> = [
  { source: 'projectContracts', label: 'les informations contractuelles et SUPPLYTIME' },
  { source: 'projectDocuments', label: 'les documents projets' },
  { source: 'contractDocuments', label: 'les documents contractuels' },
  { source: 'operationDocuments', label: 'les documents des opérations' },
  { source: 'planningOccurrences', label: 'les op\u00e9rations du planning' },
  { source: 'clients', label: 'les fiches clients' },
  { source: 'vessels', label: 'le référentiel navires' },
  { source: 'towedAssets', label: 'le référentiel des remorqués' },
];

export async function fetchProjectsData(client: SupabaseClient): Promise<ProjectsData> {
  const [projectsResult, contractsResult, hirePeriodsResult, projectDocumentsResult, contractDocumentsResult, operationDocumentsResult, occurrencesResult, clientsResult, vesselsResult, towedAssetsResult] =
    await Promise.allSettled([
      fetchProjects(client),
      fetchProjectContracts(client),
      fetchProjectContractHirePeriods(client),
      fetchProjectDocuments(client),
      fetchContractDocuments(client),
      fetchProjectOperationDocuments(client),
      fetchProjectPlanningOccurrences(client),
      fetchClients(client),
      fetchVessels(client),
      fetchProjectTowedAssets(client),
    ]);

  if (projectsResult.status === 'rejected') {
    throw projectsResult.reason;
  }

  const optionalResults = [contractsResult, projectDocumentsResult, contractDocumentsResult, operationDocumentsResult, occurrencesResult, clientsResult, vesselsResult, towedAssetsResult];
  const warnings = optionalResults.flatMap((result, index) =>
    result.status === 'rejected' ? [OPTIONAL_SOURCES[index]] : [],
  );

  const contractHirePeriods = hirePeriodsResult.status === 'fulfilled' ? hirePeriodsResult.value : [];
  const projectContracts = contractsResult.status === 'fulfilled'
    ? contractsResult.value.map((contract) => ({
      ...contract,
      hirePeriods: contractHirePeriods.filter((period) => period.contractId === contract.id),
    }))
    : [];

  return {
    projects: projectsResult.value,
    projectContracts,
    contractHirePeriods,
    projectDocuments: projectDocumentsResult.status === 'fulfilled' ? projectDocumentsResult.value : [],
    contractDocuments: contractDocumentsResult.status === 'fulfilled' ? contractDocumentsResult.value : [],
    operationDocuments: operationDocumentsResult.status === 'fulfilled' ? operationDocumentsResult.value : [],
    planningOccurrences: occurrencesResult.status === 'fulfilled' ? occurrencesResult.value : [],
    clients: clientsResult.status === 'fulfilled' ? clientsResult.value : [],
    towedAssets: towedAssetsResult.status === 'fulfilled' ? towedAssetsResult.value : [],
    vessels: vesselsResult.status === 'fulfilled' ? vesselsResult.value : [],
    warnings,
  };
}
