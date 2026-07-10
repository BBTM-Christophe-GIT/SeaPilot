import type { SupabaseClient } from '@supabase/supabase-js';

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
  'status',
  'description',
  'source_label',
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
  status: string | null;
  description: string | null;
  source_label: string | null;
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
  status: string;
  description: string;
  sourceLabel: string;
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
}

export interface ProjectsData {
  projects: ProjectRecord[];
  projectDocuments: ProjectDocumentRecord[];
  contractDocuments: ProjectDocumentRecord[];
  clients: ClientRecord[];
}

export interface ProjectMetrics {
  activeProjects: number;
  totalProjects: number;
  projectDocumentCount: number;
  contractDocumentCount: number;
  clientCount: number;
}

export interface CreateProjectInput {
  projectCode: string;
  title: string;
  clientName: string;
  primaryVesselName: string;
  secondaryVesselName: string;
  startsOn: string;
  endsOn: string;
  status: string;
  description: string;
}

function nullableText(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

function isActiveProject(project: ProjectRecord): boolean {
  const normalizedStatus = project.status
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return !normalizedStatus.includes('facture') && !normalizedStatus.includes('archive');
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
    status: nullableText(row.status),
    description: nullableText(row.description),
    sourceLabel: nullableText(row.source_label),
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
  }));
}

export function buildProjectMetrics(data: ProjectsData): ProjectMetrics {
  return {
    activeProjects: data.projects.filter(isActiveProject).length,
    clientCount: data.clients.filter((client) => client.active).length,
    contractDocumentCount: data.contractDocuments.length,
    projectDocumentCount: data.projectDocuments.length,
    totalProjects: data.projects.length,
  };
}

export async function fetchProjects(client: SupabaseClient): Promise<ProjectRecord[]> {
  const { data, error } = await client
    .from('projects')
    .select(PROJECT_SELECT)
    .order('starts_on', { ascending: false, nullsFirst: false })
    .order('title', { ascending: true });

  if (error) {
    throw error;
  }

  return mapProjectRows((data || []) as unknown as ProjectRow[]);
}

export async function fetchProjectDocuments(client: SupabaseClient): Promise<ProjectDocumentRecord[]> {
  const { data, error } = await client
    .from('project_documents')
    .select(PROJECT_DOCUMENT_SELECT)
    .order('project_code', { ascending: true, nullsFirst: false })
    .order('title', { ascending: true });

  if (error) {
    throw error;
  }

  return mapProjectDocumentRows((data || []) as unknown as ProjectDocumentRow[]);
}

export async function fetchContractDocuments(client: SupabaseClient): Promise<ProjectDocumentRecord[]> {
  const { data, error } = await client
    .from('contract_documents')
    .select(PROJECT_DOCUMENT_SELECT)
    .order('project_code', { ascending: true, nullsFirst: false })
    .order('title', { ascending: true });

  if (error) {
    throw error;
  }

  return mapProjectDocumentRows((data || []) as unknown as ProjectDocumentRow[]);
}

export async function fetchClients(client: SupabaseClient): Promise<ClientRecord[]> {
  const { data, error } = await client.from('clients').select(CLIENT_SELECT).order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return mapClientRows((data || []) as unknown as ClientRow[]);
}

export async function fetchProjectsData(client: SupabaseClient): Promise<ProjectsData> {
  const [projects, projectDocuments, contractDocuments, clients] = await Promise.all([
    fetchProjects(client),
    fetchProjectDocuments(client),
    fetchContractDocuments(client),
    fetchClients(client),
  ]);

  return { projects, projectDocuments, contractDocuments, clients };
}

export async function createProject(client: SupabaseClient, input: CreateProjectInput): Promise<ProjectRecord> {
  const title = input.title.trim();

  if (!title) {
    throw new Error('Le titre du projet est obligatoire.');
  }

  const payload = {
    project_code: optionalText(input.projectCode),
    title,
    client_name: optionalText(input.clientName),
    primary_vessel_name: optionalText(input.primaryVesselName),
    secondary_vessel_name: optionalText(input.secondaryVesselName),
    starts_on: optionalText(input.startsOn),
    ends_on: optionalText(input.endsOn),
    status: optionalText(input.status),
    description: optionalText(input.description),
    source_label: 'seapilot',
  };
  const { data, error } = await client.from('projects').insert(payload).select(PROJECT_SELECT).single();

  if (error) {
    throw error;
  }

  return mapProjectRows([data as unknown as ProjectRow])[0];
}
