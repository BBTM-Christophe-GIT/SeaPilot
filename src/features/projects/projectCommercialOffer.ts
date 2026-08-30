import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createWorkingTimeSignatureUrl,
  fetchWorkingTimeProfileSignatures,
} from '../workingTime/workingTimeSignatureQueries';

export const COMMERCIAL_RESERVE_AVAILABILITY_KEY = 'commercial_reserve_availability';
export const COMMERCIAL_RESERVE_WEATHER_KEY = 'commercial_reserve_weather';
export const COMMERCIAL_RESERVE_OTHER_KEY = 'commercial_reserve_other';

export const COMMERCIAL_RESERVE_AVAILABILITY =
  'Sous réserve de disponibilité du navire et de validation technique et contractuelle.';
export const COMMERCIAL_RESERVE_WEATHER =
  'Sous réserve des conditions météo compatibles avec la manoeuvre.';

export interface ProjectDocumentEmitter {
  firstName: string;
  functionLabel: string;
  lastName: string;
  signatureMimeType?: string;
  signatureUrl?: string;
}

interface PersonRow {
  first_name?: string | null;
  function_label?: string | null;
  id?: number | string | null;
  last_name?: string | null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedPortName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function enabled(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

export function buildCommercialReserves(supplytimeData: Record<string, string>): string[] {
  return [
    enabled(supplytimeData[COMMERCIAL_RESERVE_AVAILABILITY_KEY]) ? COMMERCIAL_RESERVE_AVAILABILITY : '',
    enabled(supplytimeData[COMMERCIAL_RESERVE_WEATHER_KEY]) ? COMMERCIAL_RESERVE_WEATHER : '',
    text(supplytimeData[COMMERCIAL_RESERVE_OTHER_KEY]),
  ].filter(Boolean);
}

export function shouldDisplayCommercialOfferRoute(deliveryPort: string, redeliveryPort: string): boolean {
  const normalizedDeliveryPort = normalizedPortName(deliveryPort);
  const normalizedRedeliveryPort = normalizedPortName(redeliveryPort);
  return !(
    normalizedDeliveryPort
    && normalizedRedeliveryPort
    && normalizedDeliveryPort === normalizedRedeliveryPort
  );
}

export function formatProjectDocumentEmitterName(emitter?: ProjectDocumentEmitter | null): string {
  if (!emitter) return '';
  return [emitter.firstName, emitter.lastName.toLocaleUpperCase('fr-FR')].filter(Boolean).join(' ').trim();
}

export async function fetchProjectDocumentEmitter(
  client: SupabaseClient,
): Promise<ProjectDocumentEmitter | undefined> {
  const getUser = client.auth?.getUser?.bind(client.auth);
  if (!getUser) return undefined;

  const { data: authData } = await getUser();
  const user = authData.user;
  if (!user?.id) return undefined;

  const { data, error } = await client
    .from('people')
    .select('id,first_name,last_name,function_label')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Impossible de charger la fiche RH de l’émetteur.');

  const person = (data || {}) as PersonRow;
  const firstName = text(person.first_name) || text(user.user_metadata?.first_name);
  const lastName = text(person.last_name) || text(user.user_metadata?.last_name);
  const functionLabel = text(person.function_label);
  const personId = Number(person.id);
  const emitter: ProjectDocumentEmitter = { firstName, functionLabel, lastName };

  if (!Number.isFinite(personId) || personId <= 0) return emitter;

  const signatures = await fetchWorkingTimeProfileSignatures(client, personId);
  const activeSignature = signatures.find((signature) => signature.validTo === null);
  if (!activeSignature) return emitter;

  return {
    ...emitter,
    signatureMimeType: activeSignature.mimeType,
    signatureUrl: await createWorkingTimeSignatureUrl(client, activeSignature, 3_600),
  };
}
