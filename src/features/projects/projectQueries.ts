import type { SupabaseClient } from '@supabase/supabase-js';

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
].join(', ');

const PROJECT_CONTRACT_SELECT = [
  'id',
  'project_id',
  'owner_identity',
  'vessel_assignment_limit',
  'extension_count',
  'extension_duration',
  'extension_unit',
  'auto_extension_period',
  'max_extension_days',
  'mobilisation_fee',
  'demobilisation_fee',
  'fee_currency',
  'charter_hire',
  'extension_hire',
  'hire_currency',
  'hire_unit',
  'max_audit_period',
  'supplytime_schema_version',
  'supplytime_data',
  'source_label',
  'sharepoint_list_title',
  'sharepoint_item_id',
  'source_modified_at',
  'archived_at',
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
  'sharepoint_list_title',
  'sharepoint_item_id',
  'file_name',
  'folder_path',
  'mime_type',
  'file_extension',
  'file_size_bytes',
  'source_modified_at',
  'is_folder',
].join(', ');

const CLIENT_SELECT = [
  'id',
  'name',
  'code',
  'email',
  'phone',
  'address',
  'city',
  'country',
  'active',
  'source_label',
  'sharepoint_list_title',
  'sharepoint_item_id',
  'source_modified_at',
  'archived_at',
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
  source_label: string | null;
  sharepoint_list_title: string | null;
  sharepoint_item_id: string | null;
  source_modified_at: string | null;
  archived_at: string | null;
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
  sharepoint_list_title: string | null;
  sharepoint_item_id: string | null;
  file_name: string | null;
  folder_path: string | null;
  mime_type: string | null;
  file_extension: string | null;
  file_size_bytes: number | string | null;
  source_modified_at: string | null;
  is_folder: boolean | null;
}

interface ClientRow {
  id: number;
  name: string;
  code: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  active: boolean | null;
  source_label: string | null;
  sharepoint_list_title: string | null;
  sharepoint_item_id: string | null;
  source_modified_at: string | null;
  archived_at: string | null;
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
  sourceLabel: string;
  sharePointListTitle: string;
  sharePointItemId: string;
  sourceModifiedAt: string;
  archivedAt: string;
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
  sharePointListTitle: string;
  sharePointItemId: string;
  fileName: string;
  folderPath: string;
  mimeType: string;
  fileExtension: string;
  fileSizeBytes: number | null;
  sourceModifiedAt: string;
  isFolder: boolean;
}

export interface ClientRecord {
  id: number;
  name: string;
  code: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  active: boolean;
  sourceLabel: string;
  sharePointListTitle: string;
  sharePointItemId: string;
  sourceModifiedAt: string;
  archivedAt: string;
}

export type ProjectsDataSource = 'clients' | 'contractDocuments' | 'projectContracts' | 'projectDocuments';

export interface ProjectsDataWarning {
  source: ProjectsDataSource;
  label: string;
}

export interface ProjectsData {
  projects: ProjectRecord[];
  projectContracts: ProjectContractRecord[];
  projectDocuments: ProjectDocumentRecord[];
  contractDocuments: ProjectDocumentRecord[];
  clients: ClientRecord[];
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
    status: nullableText(row.status),
    description: nullableText(row.description),
    sourceLabel: nullableText(row.source_label),
    sharePointListTitle: nullableText(row.sharepoint_list_title),
    sharePointItemId: nullableText(row.sharepoint_item_id),
    sourceModifiedAt: nullableText(row.source_modified_at),
    archivedAt: nullableText(row.archived_at),
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
    sourceLabel: nullableText(row.source_label),
    sharePointListTitle: nullableText(row.sharepoint_list_title),
    sharePointItemId: nullableText(row.sharepoint_item_id),
    sourceModifiedAt: nullableText(row.source_modified_at),
    archivedAt: nullableText(row.archived_at),
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
    sharePointListTitle: nullableText(row.sharepoint_list_title),
    sharePointItemId: nullableText(row.sharepoint_item_id),
    fileName: nullableText(row.file_name),
    folderPath: nullableText(row.folder_path),
    mimeType: nullableText(row.mime_type),
    fileExtension: nullableText(row.file_extension),
    fileSizeBytes: nullableNumber(row.file_size_bytes),
    sourceModifiedAt: nullableText(row.source_modified_at),
    isFolder: row.is_folder ?? false,
  }));
}

export function mapClientRows(rows: ClientRow[]): ClientRecord[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    code: nullableText(row.code),
    email: nullableText(row.email),
    phone: nullableText(row.phone),
    address: nullableText(row.address),
    city: nullableText(row.city),
    country: nullableText(row.country),
    active: row.active ?? true,
    sourceLabel: nullableText(row.source_label),
    sharePointListTitle: nullableText(row.sharepoint_list_title),
    sharePointItemId: nullableText(row.sharepoint_item_id),
    sourceModifiedAt: nullableText(row.source_modified_at),
    archivedAt: nullableText(row.archived_at),
  }));
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
  return mapProjectContractRows(
    (await fetchRowsById(client, 'project_contracts', PROJECT_CONTRACT_SELECT)) as ProjectContractRow[],
  );
}

export async function fetchProjectDocuments(client: SupabaseClient): Promise<ProjectDocumentRecord[]> {
  return mapProjectDocumentRows(
    (await fetchRowsById(client, 'project_documents', PROJECT_DOCUMENT_SELECT)) as ProjectDocumentRow[],
  ).filter((document) => !document.isFolder);
}

export async function fetchContractDocuments(client: SupabaseClient): Promise<ProjectDocumentRecord[]> {
  return mapProjectDocumentRows(
    (await fetchRowsById(client, 'contract_documents', PROJECT_DOCUMENT_SELECT)) as ProjectDocumentRow[],
  ).filter((document) => !document.isFolder);
}

export async function fetchClients(client: SupabaseClient): Promise<ClientRecord[]> {
  return mapClientRows((await fetchRowsById(client, 'clients', CLIENT_SELECT)) as ClientRow[]);
}

const OPTIONAL_SOURCES: Array<{
  source: ProjectsDataSource;
  label: string;
}> = [
  { source: 'projectContracts', label: 'les informations contractuelles et SUPPLYTIME' },
  { source: 'projectDocuments', label: 'les documents projets' },
  { source: 'contractDocuments', label: 'les documents contractuels' },
  { source: 'clients', label: 'les fiches clients' },
];

export async function fetchProjectsData(client: SupabaseClient): Promise<ProjectsData> {
  const [projectsResult, contractsResult, projectDocumentsResult, contractDocumentsResult, clientsResult] =
    await Promise.allSettled([
      fetchProjects(client),
      fetchProjectContracts(client),
      fetchProjectDocuments(client),
      fetchContractDocuments(client),
      fetchClients(client),
    ]);

  if (projectsResult.status === 'rejected') {
    throw projectsResult.reason;
  }

  const optionalResults = [contractsResult, projectDocumentsResult, contractDocumentsResult, clientsResult];
  const warnings = optionalResults.flatMap((result, index) =>
    result.status === 'rejected' ? [OPTIONAL_SOURCES[index]] : [],
  );

  return {
    projects: projectsResult.value,
    projectContracts: contractsResult.status === 'fulfilled' ? contractsResult.value : [],
    projectDocuments: projectDocumentsResult.status === 'fulfilled' ? projectDocumentsResult.value : [],
    contractDocuments: contractDocumentsResult.status === 'fulfilled' ? contractDocumentsResult.value : [],
    clients: clientsResult.status === 'fulfilled' ? clientsResult.value : [],
    warnings,
  };
}
