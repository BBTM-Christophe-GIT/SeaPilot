import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeProjectStatus } from './projectStatus';
import { DEFAULT_PROJECT_FUEL_TERMS, DEFAULT_PROJECT_OWNER_IDENTITY } from './projectContractOptions';

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
  occurrenceId: number | null;
  projectId: number;
  startsOn: string;
  endsOn: string;
  vesselIds: number[];
  status: string;
  description: string;
  charterHire: number | null;
  hireCurrency: string;
  hireUnit: string;
  charterHireOverride?: boolean;
}

export interface ProjectContractHirePeriodWriteInput {
  startsOn: string;
  endsOn: string;
  charterHire: number | null;
  standbyHire: number | null;
  weatherStandbyHire: number | null;
  hireCurrency: string;
  hireUnit: string;
}

export interface ProjectTowedAssetWriteInput {
  id: number | null;
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
  expectedUpdatedAt: string;
}

export const EMPTY_PROJECT_WRITE_INPUT: ProjectWriteInput = {
  projectId: null,
  title: '',
  clientId: null,
  primaryVesselId: null,
  secondaryVesselId: null,
  status: 'Non validé',
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
  ownerIdentity: DEFAULT_PROJECT_OWNER_IDENTITY,
  vesselAssignmentLimit: '',
  extensionCount: null,
  extensionDuration: null,
  extensionUnit: '',
  autoExtensionPeriod: 'Voyage',
  maxExtensionDays: null,
  mobilisationFee: null,
  demobilisationFee: null,
  feeCurrency: 'EUR',
  charterHire: null,
  extensionHire: null,
  hireCurrency: '',
  hireUnit: '',
  maxAuditPeriod: '',
  supplytimeData: { box19_special_fuel: DEFAULT_PROJECT_FUEL_TERMS },
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

  const args = {
    target_project_id: input.projectId,
    target_title: input.title.trim(),
    target_client_id: input.clientId,
    target_primary_vessel_id: input.primaryVesselId,
    target_secondary_vessel_id: input.secondaryVesselId,
    target_status: normalizeProjectStatus(input.status),
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
    // Keep the timestamp returned by PostgREST byte-for-byte. Converting it through
    // Date.toISOString() drops PostgreSQL microseconds and makes every optimistic
    // concurrency check look stale (for example .643239 becomes .643).
    target_expected_updated_at: optionalText(input.expectedUpdatedAt),
  };

  const { data, error } = await client.rpc('projects_save', args);

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

export async function saveProjectContractDetails(
  client: SupabaseClient,
  projectId: number,
  input: ProjectWriteInput,
  towedAssetId: number | null,
): Promise<void> {
  const validationErrors = validateProjectWriteInput(input);
  if (validationErrors.length > 0) throw new Error(validationErrors.join(' '));

  const args = {
    target_project_id: projectId,
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
    target_towed_asset_id: towedAssetId,
  };
  const response = await client.rpc('projects_save_contract_details', args);
  if (response.error) {
    throw mutationError(response.error, "Impossible d’enregistrer les informations contractuelles.");
  }
}

export async function saveProjectTowedAsset(
  client: SupabaseClient,
  input: ProjectTowedAssetWriteInput,
): Promise<number> {
  if (!input.name.trim()) throw new Error('Le nom du remorqué est obligatoire.');
  const numericValues = [input.lengthOverallM, input.breadthOverallM, input.maxDraftM, input.lightDisplacementT];
  if (numericValues.some((value) => value !== null && value < 0)) {
    throw new Error('Les dimensions et le déplacement du remorqué ne peuvent pas être négatifs.');
  }
  if (input.flag.trim() && !/^[A-Za-z]{2}$/.test(input.flag.trim())) {
    throw new Error('Le pavillon du remorqué doit contenir deux lettres.');
  }

  const { data, error } = await client.rpc('projects_save_towed_asset', {
    target_towed_asset_id: input.id,
    target_name: input.name.trim(),
    target_asset_type: optionalText(input.assetType),
    target_length_overall_m: input.lengthOverallM,
    target_breadth_overall_m: input.breadthOverallM,
    target_max_draft_m: input.maxDraftM,
    target_light_displacement_t: input.lightDisplacementT,
    target_flag: optionalText(input.flag.toUpperCase()),
    target_classification_society: optionalText(input.classificationSociety),
    target_registration_number: optionalText(input.registrationNumber),
    target_owner_name: optionalText(input.ownerName),
    target_hull_machinery_insurer: optionalText(input.hullMachineryInsurer),
    target_liability_insurer: optionalText(input.liabilityInsurer),
    target_photo_url: optionalText(input.photoUrl),
    target_photo_storage_path: optionalText(input.photoStoragePath),
  });
  if (error) throw mutationError(error, "Impossible d’enregistrer le remorqué.");
  const savedId = Number(data);
  if (!Number.isInteger(savedId) || savedId <= 0) {
    throw new Error("Supabase n’a retourné aucun remorqué après l’enregistrement.");
  }
  return savedId;
}

export async function saveClient(client: SupabaseClient, input: ClientWriteInput): Promise<number> {
  if (!input.name.trim()) throw new Error('Le nom du client est obligatoire.');
  const { data, error } = await client.rpc('clients_save', {
    target_client_id: input.clientId,
    target_name: input.name.trim(),
    target_represented_by: optionalText(input.representedBy),
    target_code: optionalText(input.code),
    target_email: optionalText(input.email),
    target_phone: optionalText(input.phone),
    target_address: optionalText(input.address),
    target_postal_code: optionalText(input.postalCode),
    target_city: optionalText(input.city),
    target_country: optionalText(input.country),
    target_website: optionalText(input.website),
    target_logo_url: optionalText(input.logoUrl),
    target_logo_storage_path: optionalText(input.logoStoragePath),
    target_active: input.active,
    target_expected_updated_at: optionalText(input.expectedUpdatedAt),
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
  const vesselIds = input.vesselIds.filter((vesselId) => Number.isInteger(vesselId) && vesselId > 0);
  if (vesselIds.length === 0) errors.push("Au moins un navire est obligatoire pour l'op\u00e9ration.");
  if (vesselIds.length !== input.vesselIds.length || new Set(vesselIds).size !== vesselIds.length) {
    errors.push("Les navires de l'op\u00e9ration doivent \u00eatre valides et sans doublon.");
  }
  if (input.charterHire !== null && input.charterHire < 0) {
    errors.push("Le loyer d’affrètement de l’opération ne peut pas être négatif.");
  }
  if (input.charterHire !== null && !/^[A-Za-z]{3}$/.test(input.hireCurrency.trim())) {
    errors.push("Une devise à trois lettres est obligatoire pour le loyer de l’opération.");
  }
  if (input.charterHire !== null && !input.hireUnit.trim()) {
    errors.push("L’unité du loyer de l’opération est obligatoire.");
  }
  return errors;
}

export async function archiveClient(client: SupabaseClient, clientId: number): Promise<void> {
  if (!Number.isInteger(clientId) || clientId <= 0) throw new Error('Le client à supprimer est invalide.');
  const { error } = await client.rpc('clients_archive', { target_client_id: clientId });
  if (error) throw mutationError(error, 'Impossible de supprimer le client.');
}

export async function archiveProjectTowedAsset(client: SupabaseClient, towedAssetId: number): Promise<void> {
  if (!Number.isInteger(towedAssetId) || towedAssetId <= 0) {
    throw new Error('Le remorqué à supprimer est invalide.');
  }
  const { error } = await client.rpc('projects_archive_towed_asset', {
    target_towed_asset_id: towedAssetId,
  });
  if (error) throw mutationError(error, 'Impossible de supprimer le remorqué.');
}

export function validateProjectContractHirePeriods(
  periods: ProjectContractHirePeriodWriteInput[],
): string[] {
  const errors: string[] = [];
  const sorted = [...periods].sort((left, right) => left.startsOn.localeCompare(right.startsOn));
  sorted.forEach((period, index) => {
    if (!period.startsOn) errors.push(`La date de début du tarif ${index + 1} est obligatoire.`);
    if (period.endsOn && period.endsOn < period.startsOn) {
      errors.push(`La fin du tarif ${index + 1} ne peut pas précéder son début.`);
    }
    if (typeof period.charterHire !== 'number' || period.charterHire < 0) {
      errors.push(`Le montant En Opération du tarif ${index + 1} est obligatoire et doit être positif ou nul.`);
    }
    if (typeof period.standbyHire !== 'number' || period.standbyHire < 0) {
      errors.push(`Le montant Stand-by du tarif ${index + 1} est obligatoire et doit être positif ou nul.`);
    }
    if (typeof period.weatherStandbyHire !== 'number' || period.weatherStandbyHire < 0) {
      errors.push(`Le montant Weather Stand-by du tarif ${index + 1} est obligatoire et doit être positif ou nul.`);
    }
    if (!/^[A-Za-z]{3}$/.test(period.hireCurrency.trim())) {
      errors.push(`Une devise à trois lettres est obligatoire pour le tarif ${index + 1}.`);
    }
    if (!period.hireUnit.trim()) errors.push(`L’unité du tarif ${index + 1} est obligatoire.`);
    const previous = sorted[index - 1];
    if (previous && (!previous.endsOn || previous.endsOn >= period.startsOn)) {
      errors.push(`Les périodes tarifaires ${index} et ${index + 1} se chevauchent.`);
    }
  });
  return errors;
}

export async function saveProjectContractHirePeriods(
  client: SupabaseClient,
  projectId: number,
  periods: ProjectContractHirePeriodWriteInput[],
): Promise<void> {
  const validationErrors = validateProjectContractHirePeriods(periods);
  if (validationErrors.length > 0) throw new Error(validationErrors.join(' '));
  const { error } = await client.rpc('projects_replace_contract_hire_periods', {
    target_project_id: projectId,
    target_periods: periods.map((period) => ({
      starts_on: period.startsOn,
      ends_on: optionalText(period.endsOn),
      charter_hire: period.charterHire,
      standby_hire: period.standbyHire,
      weather_standby_hire: period.weatherStandbyHire,
      hire_currency: period.hireCurrency.trim().toUpperCase(),
      hire_unit: period.hireUnit.trim(),
    })),
  });
  if (error) throw mutationError(error, 'Impossible d’enregistrer le barème contractuel.');
}

export async function saveProjectPlanningOccurrence(
  client: SupabaseClient,
  input: ProjectPlanningOccurrenceWriteInput,
): Promise<number> {
  const validationErrors = validateProjectPlanningOccurrenceInput(input);
  if (validationErrors.length > 0) throw new Error(validationErrors.join(' '));

  const { data, error } = await client.rpc('projects_save_planning_occurrence', {
    target_occurrence_id: input.occurrenceId,
    target_project_id: input.projectId,
    target_starts_on: input.startsOn,
    target_ends_on: input.endsOn,
    target_vessel_ids: input.vesselIds,
    target_status: normalizeProjectStatus(input.status),
    target_description: optionalText(input.description),
    target_charter_hire: input.charterHire,
    target_hire_currency: optionalText(input.hireCurrency.toUpperCase()),
    target_hire_unit: optionalText(input.hireUnit),
  });
  if (error) throw mutationError(error, "Impossible d’enregistrer cette opération dans le planning.");
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row || !Number.isInteger(Number(row.id))) {
    throw new Error("Supabase n'a retourn\u00e9 aucune op\u00e9ration apr\u00e8s l'enregistrement.");
  }
  const occurrenceId = Number(row.id);
  if (input.charterHireOverride !== undefined) {
    const { error: overrideError } = await client.rpc('projects_set_operation_hire_override', {
      target_occurrence_id: occurrenceId,
      target_project_id: input.projectId,
      target_is_override: input.charterHireOverride,
      target_charter_hire: input.charterHire,
      target_hire_currency: optionalText(input.hireCurrency.toUpperCase()),
      target_hire_unit: optionalText(input.hireUnit),
    });
    if (overrideError) {
      throw mutationError(overrideError, 'Impossible d’appliquer le loyer de cette opération.');
    }
  }
  return occurrenceId;
}

export async function deleteProjectPlanningOccurrence(
  client: SupabaseClient,
  input: { occurrenceId: number; projectId: number },
): Promise<number> {
  if (!Number.isInteger(input.occurrenceId) || input.occurrenceId <= 0) {
    throw new Error("L'opération à supprimer est invalide.");
  }
  if (!Number.isInteger(input.projectId) || input.projectId <= 0) {
    throw new Error('Le projet de cette opération est invalide.');
  }

  const { data, error } = await client.rpc('projects_delete_planning_occurrence', {
    target_occurrence_id: input.occurrenceId,
    target_project_id: input.projectId,
  });
  if (error) throw mutationError(error, "Impossible de supprimer cette opération du planning.");
  const deletedOccurrenceId = Number(data);
  if (!Number.isInteger(deletedOccurrenceId) || deletedOccurrenceId <= 0) {
    throw new Error("Supabase n'a confirmé aucune suppression d'opération.");
  }
  return deletedOccurrenceId;
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
