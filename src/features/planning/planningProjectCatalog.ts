import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeProjectStatus } from '../projects/projectStatus';
import { compareProjectCodesNewestFirst } from '../../lib/projectCode';
import { mapPlanningProjectRows, type PlanningProjectRecord } from './planningQueries';

export interface PlanningProjectCatalogRecord {
  id: number;
  projectCode: string;
  title: string;
  clientName: string;
  status: string;
  description: string;
  startsOn: string;
  endsOn: string;
}

export interface PlanningProjectClientRecord {
  id: number;
  name: string;
  active: boolean;
}

export interface PlanningProjectIdentificationInput {
  title: string;
  clientId: number | null;
  status: string;
  description: string;
  vesselId: number;
  startsOn: string;
}

export interface PlanningProjectClientInput {
  name: string;
  code: string;
  email: string;
  phone: string;
  city: string;
  country: string;
}

function rpcError(error: { message?: string } | null, fallback: string): Error {
  return new Error(error?.message || fallback);
}

function firstRpcRow(data: unknown): Record<string, unknown> | null {
  const value = Array.isArray(data) ? data[0] : data;
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function mapCatalogRow(row: Record<string, unknown>): PlanningProjectCatalogRecord {
  return {
    id: Number(row.id),
    projectCode: String(row.project_code || ''),
    title: String(row.title || ''),
    clientName: String(row.client_name || ''),
    status: normalizeProjectStatus(row.status),
    description: String(row.description || ''),
    startsOn: String(row.starts_on || ''),
    endsOn: String(row.ends_on || ''),
  };
}

export async function fetchPlanningProjectCatalog(
  client: SupabaseClient,
): Promise<PlanningProjectCatalogRecord[]> {
  const { data, error } = await client.rpc('planning_project_catalog');
  if (error) throw rpcError(error, 'Impossible de charger le catalogue projets.');
  return ((data || []) as Array<Record<string, unknown>>)
    .map(mapCatalogRow)
    .filter((project) => Number.isSafeInteger(project.id) && project.id > 0 && project.title)
    .sort((left, right) =>
      compareProjectCodesNewestFirst(left.projectCode, right.projectCode) ||
      left.title.localeCompare(right.title, 'fr'));
}

export async function fetchPlanningProjectClients(
  client: SupabaseClient,
): Promise<PlanningProjectClientRecord[]> {
  const { data, error } = await client.rpc('planning_project_clients');
  if (error) throw rpcError(error, 'Impossible de charger les clients.');
  return ((data || []) as Array<Record<string, unknown>>)
    .map((row) => ({
      id: Number(row.id),
      name: String(row.name || ''),
      active: row.active !== false,
    }))
    .filter((item) => Number.isSafeInteger(item.id) && item.id > 0 && item.name);
}

export async function schedulePlanningCatalogProject(
  client: SupabaseClient,
  input: { projectId: number; vesselId: number; startsOn: string },
): Promise<PlanningProjectRecord> {
  const { data, error } = await client.rpc('planning_schedule_catalog_project', {
    target_project_id: input.projectId,
    target_starts_on: input.startsOn,
    target_ends_on: input.startsOn,
    target_primary_vessel_id: input.vesselId,
    target_status: 'Non validé',
    target_description: null,
  });
  if (error) throw rpcError(error, "Impossible d'ajouter ce projet au planning.");
  const row = firstRpcRow(data);
  const project = row ? mapPlanningProjectRows([row as never])[0] : undefined;
  if (!project) throw new Error("L'occurrence Planning créée n'a pas pu être relue.");
  return project;
}

export async function createAndSchedulePlanningProject(
  client: SupabaseClient,
  input: PlanningProjectIdentificationInput,
): Promise<PlanningProjectRecord> {
  if (!input.title.trim()) throw new Error('Le nom du projet est obligatoire.');
  const { data, error } = await client.rpc('planning_create_and_schedule_project', {
    target_title: input.title.trim(),
    target_client_id: input.clientId,
    target_primary_vessel_id: input.vesselId,
    target_starts_on: input.startsOn,
    target_status: normalizeProjectStatus(input.status),
    target_description: input.description.trim() || null,
  });
  if (error) throw rpcError(error, "Impossible de créer et d'ajouter ce projet au planning.");
  const row = firstRpcRow(data);
  const project = row ? mapPlanningProjectRows([row as never])[0] : undefined;
  if (!project) throw new Error("Le projet créé n'a pas pu être relu dans le Planning.");
  return project;
}

export async function createPlanningProjectClient(
  client: SupabaseClient,
  input: PlanningProjectClientInput,
): Promise<PlanningProjectClientRecord> {
  if (!input.name.trim()) throw new Error('Le nom du client est obligatoire.');
  const { data, error } = await client.rpc('planning_create_project_client', {
    target_name: input.name.trim(),
    target_code: input.code.trim() || null,
    target_email: input.email.trim() || null,
    target_phone: input.phone.trim() || null,
    target_city: input.city.trim() || null,
    target_country: input.country.trim() || null,
  });
  if (error) throw rpcError(error, "Impossible de créer ce client.");
  const row = firstRpcRow(data);
  if (!row || !Number.isSafeInteger(Number(row.id))) {
    throw new Error("Le client créé n'a pas pu être relu.");
  }
  return { id: Number(row.id), name: String(row.name || input.name.trim()), active: true };
}
