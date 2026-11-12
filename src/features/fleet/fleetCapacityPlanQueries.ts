import type { SupabaseClient } from '@supabase/supabase-js';
import type { FleetVessel } from './fleetQueries';

export const FLEET_CAPACITY_PLANS_BUCKET = 'fleet-capacity-plans';
export const FLEET_CAPACITY_PLAN_MAX_BYTES = 25 * 1024 * 1024;

const types: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
};
export const FLEET_CAPACITY_PLAN_ACCEPT = Object.keys(types).map(extension => `.${extension}`).join(',');

type Vessel = Pick<FleetVessel, 'id' | 'companyId'>;

export interface FleetCapacityPlan {
  key: string;
  name: string;
}

function vesselFolder(vessel: Vessel) {
  return `${vessel.companyId}/${vessel.id}`;
}

function planName(key: string): string | null {
  const match = /^[0-9a-f-]{36}\.([A-Za-z0-9_-]+)$/.exec(key);
  if (!match) return null;
  try {
    const bytes = Uint8Array.from(atob(match[1].replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes) || null;
  } catch {
    return null;
  }
}

export async function fetchFleetCapacityPlans(client: SupabaseClient, vessel: Vessel): Promise<FleetCapacityPlan[]> {
  const bucket = client.storage.from(FLEET_CAPACITY_PLANS_BUCKET);
  const folder = vesselFolder(vessel);
  const plans: FleetCapacityPlan[] = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const { data, error } = await bucket.list(folder, { offset, limit, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    for (const file of data) {
      const name = file.id ? planName(file.name) : null;
      if (name) plans.push({ key: file.name, name });
    }
    if (data.length < limit) break;
  }
  return plans.sort((left, right) => left.name.localeCompare(right.name, 'fr', { numeric: true }));
}

export async function uploadFleetCapacityPlan(client: SupabaseClient, vessel: Vessel, file: File): Promise<FleetCapacityPlan> {
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
  const contentType = Object.hasOwn(types, extension) ? types[extension] : undefined;
  if (!file.name.includes('.') || !contentType) throw new Error('Formats acceptés : PDF, JPEG, PNG et WebP.');
  if (!file.size) throw new Error('Le fichier est vide.');
  if (file.size > FLEET_CAPACITY_PLAN_MAX_BYTES) throw new Error('Le fichier dépasse la limite de 25 Mo.');
  const nameBytes = new TextEncoder().encode(file.name);
  if (nameBytes.length > 255) throw new Error('Raccourcissez le nom du fichier avant de l’ajouter.');

  // Encode the display name so Storage keys stay ASCII and never contain path separators.
  const encodedName = btoa(String.fromCharCode(...nameBytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  const key = `${crypto.randomUUID()}.${encodedName}`;
  const body = file.slice(0, file.size, contentType);
  const { error } = await client.storage.from(FLEET_CAPACITY_PLANS_BUCKET).upload(`${vesselFolder(vessel)}/${key}`, body, {
    contentType, upsert: false,
  });
  if (error) throw error;
  return { key, name: file.name };
}

export async function fleetCapacityPlanDownloadUrl(client: SupabaseClient, vessel: Vessel, plan: FleetCapacityPlan): Promise<string> {
  const { data, error } = await client.storage.from(FLEET_CAPACITY_PLANS_BUCKET)
    .createSignedUrl(`${vesselFolder(vessel)}/${plan.key}`, 300, { download: plan.name });
  if (error || !data?.signedUrl) throw error ?? new Error('Impossible de préparer le téléchargement du plan.');
  return data.signedUrl;
}

export async function removeFleetCapacityPlan(client: SupabaseClient, vessel: Vessel, plan: FleetCapacityPlan): Promise<void> {
  const { data, error } = await client.storage.from(FLEET_CAPACITY_PLANS_BUCKET).remove([`${vesselFolder(vessel)}/${plan.key}`]);
  if (error || !data?.length) throw error ?? new Error('Le plan n’a pas pu être retiré. Actualisez la fiche.');
}
