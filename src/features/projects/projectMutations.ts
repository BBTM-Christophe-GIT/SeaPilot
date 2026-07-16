import type { SupabaseClient } from '@supabase/supabase-js';

export interface ProjectMutationResult {
  id: number;
  projectCode: string;
  title: string;
  updatedAt: string;
}

export interface ProjectCatalogOption {
  id: number;
  projectCode: string;
  title: string;
}

export interface ProjectPlanningOccurrenceWriteInput {
  projectId: number;
  startsOn: string;
  endsOn: string;
  primaryVesselId: number | null;
  status: string;
  description: string;
}

export interface ProjectWriteInput {
  projectId: number | null;
  title: string;
  clientId: number | null;
  primaryVesselId: number | null;
  secondaryVesselId: number | null;
  status: string;
  description: string;
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
  supplytimeData: Record<string, string>;
  expectedUpdatedAt: string;
}

export interface ClientWriteInput {
  clientId: number | null;
  name: string;
  code: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  active: boolean;
  expectedUpdatedAt: string;
}

export const EMPTY_PROJECT_WRITE_INPUT: ProjectWriteInput = {
  projectId: null,
  title: '',
  clientId: null,
  primaryVesselId: null,
  secondaryVesselId: null,
  status: '',
  description: '',
  startsOn: '',
  endsOn: '',
  deliveryAt: '',
  redeliveryAt: '',
  charterStartsAt: '',
  charterEndsAt: '',
  deliveryPort: '',
  redeliveryPort: '',
  contractType: '',
  operationArea: '',
  isRovSupport: false,
  isDivingSupport: false,
  ownerIdentity: '',
  vesselAssignmentLimit: '',
  extensionCount: null,
  extensionDuration: null,
  extensionUnit: '',
  autoExtensionPeriod: 'Voyage',
  maxExtensionDays: null,
  mobilisationFee: null,
  demobilisationFee: null,
  feeCurrency: '',
  charterHire: null,
  extensionHire: null,
  hireCurrency: '',
  hireUnit: '',
  maxAuditPeriod: '',
  supplytimeData: {},
  expectedUpdatedAt: '',
};

function optionalText(value: string): string | null {
  return value.trim() || null;
}

function optionalTimestamp(value: string): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function mutationError(error: { message?: string } | null, fallback: string): Error {
  return new Error(error?.message || fallback);
}

export function validateProjectWriteInput(input: ProjectWriteInput): string[] {
  const errors: string[] = [];
  if (!input.title.trim()) errors.push('Le nom du projet est obligatoire.');
  if (input.startsOn && input.endsOn && input.endsOn < input.startsOn) {
    errors.push('La fin du projet ne peut pas précéder son début.');
  }
  if (input.deliveryAt && input.redeliveryAt && new Date(input.redeliveryAt) < new Date(input.deliveryAt)) {
    errors.push('La restitution ne peut pas précéder la livraison.');
  }
  if (input.charterStartsAt && input.charterEndsAt && new Date(input.charterEndsAt) < new Date(input.charterStartsAt)) {
    errors.push("La fin d’affrètement ne peut pas précéder son début.");
  }
  if (input.primaryVesselId !== null && input.primaryVesselId === input.secondaryVesselId) {
    errors.push('Les navires principal et secondaire doivent être différents.');
  }

  const extensionValues = [input.extensionCount, input.extensionDuration, input.extensionUnit.trim()];
  const hasAnyExtension = extensionValues.some((value) => value !== null && value !== '');
  const hasAllExtensions = extensionValues.every((value) => value !== null && value !== '');
  if (hasAnyExtension && !hasAllExtensions) errors.push('Le nombre, la durée et l’unité de prolongation vont ensemble.');
  if ((input.extensionCount !== null && input.extensionCount <= 0) || (input.extensionDuration !== null && input.extensionDuration <= 0)) {
    errors.push('Les valeurs de prolongation doivent être positives.');
  }
  if (input.maxExtensionDays !== null && input.maxExtensionDays < 0) {
    errors.push('Le maximum de jours de prolongation ne peut pas être négatif.');
  }
  if ((input.mobilisationFee !== null || input.demobilisationFee !== null) && !/^[A-Za-z]{3}$/.test(input.feeCurrency.trim())) {
    errors.push('Une devise à trois lettres est obligatoire pour les frais.');
  }
  if ((input.charterHire !== null || input.extensionHire !== null) && !/^[A-Za-z]{3}$/.test(input.hireCurrency.trim())) {
    errors.push('Une devise à trois lettres est obligatoire pour les loyers.');
  }
  return errors;
}

export async function saveProject(client: SupabaseClient, input: ProjectWriteInput): Promise<ProjectMutationResult> {
  const validationErrors = validateProjectWriteInput(input);
  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join(' '));
  }

  const { data, error } = await client.rpc('projects_save', {
    target_project_id: input.projectId,
    target_title: input.title.trim(),
    target_client_id: input.clientId,
    target_primary_vessel_id: input.primaryVesselId,
    target_secondary_vessel_id: input.secondaryVesselId,
    target_status: optionalText(input.status),
    target_description: optionalText(input.description),
    target_starts_on: optionalText(input.startsOn),
    target_ends_on: optionalText(input.endsOn),
    target_delivery_at: optionalTimestamp(input.deliveryAt),
    target_redelivery_at: optionalTimestamp(input.redeliveryAt),
    target_charter_starts_at: optionalTimestamp(input.charterStartsAt),
    target_charter_ends_at: optionalTimestamp(input.charterEndsAt),
    target_delivery_port: optionalText(input.deliveryPort),
    target_redelivery_port: optionalText(input.redeliveryPort),
    target_contract_type: optionalText(input.contractType),
    target_operation_area: optionalText(input.operationArea),
    target_is_rov_support: input.isRovSupport,
    target_is_diving_support: input.isDivingSupport,
    target_owner_identity: optionalText(input.ownerIdentity),
    target_vessel_assignment_limit: optionalText(input.vesselAssignmentLimit),
    target_extension_count: input.extensionCount,
    target_extension_duration: input.extensionDuration,
    target_extension_unit: optionalText(input.extensionUnit),
    target_auto_extension_period: optionalText(input.autoExtensionPeriod),
    target_max_extension_days: input.maxExtensionDays,
    target_mobilisation_fee: input.mobilisationFee,
    target_demobilisation_fee: input.demobilisationFee,
    target_fee_currency: optionalText(input.feeCurrency),
    target_charter_hire: input.charterHire,
    target_extension_hire: input.extensionHire,
    target_hire_currency: optionalText(input.hireCurrency),
    target_hire_unit: optionalText(input.hireUnit),
    target_max_audit_period: optionalText(input.maxAuditPeriod),
    target_supplytime_data: input.supplytimeData,
    target_expected_updated_at: optionalTimestamp(input.expectedUpdatedAt),
  });

  if (error) throw mutationError(error, "Impossible d’enregistrer le projet.");
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) throw new Error("Supabase n’a retourné aucun projet après l’enregistrement.");
  return {
    id: Number(row.id),
    projectCode: String(row.project_code || ''),
    title: String(row.title || ''),
    updatedAt: String(row.updated_at || ''),
  };
}

export async function saveClient(client: SupabaseClient, input: ClientWriteInput): Promise<number> {
  if (!input.name.trim()) throw new Error('Le nom du client est obligatoire.');
  const { data, error } = await client.rpc('clients_save', {
    target_client_id: input.clientId,
    target_name: input.name.trim(),
    target_code: optionalText(input.code),
    target_email: optionalText(input.email),
    target_phone: optionalText(input.phone),
    target_address: optionalText(input.address),
    target_city: optionalText(input.city),
    target_country: optionalText(input.country),
    target_active: input.active,
    target_expected_updated_at: optionalTimestamp(input.expectedUpdatedAt),
  });
  if (error) throw mutationError(error, "Impossible d’enregistrer le client.");
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) throw new Error("Supabase n’a retourné aucun client après l’enregistrement.");
  return Number(row.id);
}

export async function archiveProject(client: SupabaseClient, projectId: number): Promise<void> {
  const { error } = await client.rpc('projects_archive', { target_project_id: projectId });
  if (error) throw mutationError(error, "Impossible d’archiver le projet.");
}

export function validateProjectPlanningOccurrenceInput(input: ProjectPlanningOccurrenceWriteInput): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(input.projectId) || input.projectId <= 0) errors.push('Le projet est obligatoire.');
  if (!input.startsOn) errors.push("La date de d\u00e9but de l'op\u00e9ration est obligatoire.");
  if (!input.endsOn) errors.push("La date de fin de l'op\u00e9ration est obligatoire.");
  if (input.startsOn && input.endsOn && input.endsOn < input.startsOn) {
    errors.push("La fin de l'op\u00e9ration ne peut pas pr\u00e9c\u00e9der son d\u00e9but.");
  }
  if (input.primaryVesselId === null || !Number.isInteger(input.primaryVesselId) || input.primaryVesselId <= 0) {
    errors.push("Le navire de l'op\u00e9ration est obligatoire.");
  }
  return errors;
}

export async function createProjectPlanningOccurrence(
  client: SupabaseClient,
  input: ProjectPlanningOccurrenceWriteInput,
): Promise<number> {
  const validationErrors = validateProjectPlanningOccurrenceInput(input);
  if (validationErrors.length > 0) throw new Error(validationErrors.join(' '));

  const { data, error } = await client.rpc('projects_create_planning_occurrence', {
    target_project_id: input.projectId,
    target_starts_on: input.startsOn,
    target_ends_on: input.endsOn,
    target_primary_vessel_id: input.primaryVesselId,
    target_status: optionalText(input.status),
    target_description: optionalText(input.description),
  });
  if (error) throw mutationError(error, "Impossible d'ajouter cette op\u00e9ration au planning.");
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row || !Number.isInteger(Number(row.id))) {
    throw new Error("Supabase n'a retourn\u00e9 aucune op\u00e9ration apr\u00e8s l'enregistrement.");
  }
  return Number(row.id);
}

export async function fetchProjectCatalogOptions(client: SupabaseClient): Promise<ProjectCatalogOption[]> {
  const { data, error } = await client.rpc('projects_catalog_options');
  if (error) throw mutationError(error, 'Impossible de charger le catalogue projets.');
  return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
    id: Number(row.id),
    projectCode: String(row.project_code || ''),
    title: String(row.title || ''),
  }));
}
