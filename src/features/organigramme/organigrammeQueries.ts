import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrgCategory, OrgData, OrgLink, OrgSupportDraft } from './organigrammeModel';
import { loadPeoplePortraits } from '../humanResources/portraitMedia';
import { loadOrgVesselIcons } from './organigrammeMedia';

export async function fetchOrganigramme(client: SupabaseClient, asOf: string): Promise<OrgData> {
  const { data, error } = await client.rpc('organigramme_snapshot_v2', { p_as_of: asOf });
  if (error) throw new Error('Impossible de charger l’organigramme. Vérifiez vos droits et réessayez.', { cause: error });
  if (!data || !Array.isArray(data.people) || !Array.isArray(data.vessels) || !Array.isArray(data.memberships) || !Array.isArray(data.support) || !Array.isArray(data.watches)) throw new Error('Les données de l’organigramme sont indisponibles.');
  const snapshot = { ...data, asOf } as OrgData;
  const [people, vessels] = await Promise.all([loadPeoplePortraits(client, snapshot.people), loadOrgVesselIcons(snapshot.vessels)]);
  // Keep the HR function intact for inherited vessel roles. Office responsibilities
  // are resolved only where they are displayed, including the contact lists.
  return { ...snapshot, vessels, people };
}

export async function saveOrgEmergencyDefault(client: SupabaseClient, ids: number[]): Promise<void> {
  const { error } = await client.rpc('save_organigramme_emergency_default', { p_person_ids: ids });
  if (error) throw new Error('Impossible d’enregistrer la liste d’urgence par défaut. Réessayez.', { cause: error });
}

export async function saveOrgSupport(client: SupabaseClient, entry: OrgSupportDraft): Promise<void> {
  const { error } = await client.rpc('save_organigramme_responsibility', { p_id: entry.id ?? null, p_person_id: entry.personId, p_name: entry.name.trim(), p_function_label: entry.functionLabel.trim(), p_category: entry.category, p_position: entry.position, p_rank: entry.rank || null });
  if (error) throw new Error('Impossible d’enregistrer cet intervenant.', { cause: error });
}

export interface OrgWatchDraft { id: number | null; vesselId: number; name: string; members: Array<{ personId: number; functionLabel: string }> }
export async function saveOrgWatch(client: SupabaseClient, watch: OrgWatchDraft): Promise<number> {
  const { data, error } = await client.rpc('save_organigramme_watch', { p_id: watch.id, p_vessel_id: watch.vesselId, p_name: watch.name.trim(), p_members: watch.members });
  if (error) throw new Error('Impossible d’enregistrer la bordée. Vérifiez le nom (unique par navire) et les personnes sélectionnées.', { cause: error });
  return Number(data);
}
export async function deleteOrgWatch(client: SupabaseClient, id: number): Promise<void> {
  const { error } = await client.from('organigramme_watches').delete().eq('id', id);
  if (error) throw new Error('Impossible de supprimer cette bordée.', { cause: error });
}
export async function deleteOrgSupport(client: SupabaseClient, id: number): Promise<void> {
  const { error } = await client.from('organigramme_support').delete().eq('id', id);
  if (error) throw new Error('Impossible de supprimer cet intervenant.', { cause: error });
}

export async function saveOrgCategory(client: SupabaseClient, key: OrgCategory, label: string): Promise<void> {
  const { error } = await client.rpc('save_organigramme_category', { p_key: key, p_label: label.trim() });
  if (error) throw new Error('Impossible de renommer cette catégorie.', { cause: error });
}
export async function saveOrgLink(client: SupabaseClient, link: Omit<OrgLink, 'id'> & { id?: number }): Promise<void> {
  const { error } = await client.rpc('save_organigramme_link', { p_id: link.id ?? null, p_source: link.sourceCategory, p_kind: link.targetKind, p_key: link.targetKey, p_section: link.targetSection, p_label: link.label.trim() });
  if (error) throw new Error('Impossible d’enregistrer ce lien. Vérifiez la cible et les éventuels doublons.', { cause: error });
}
export async function deleteOrgLink(client: SupabaseClient, id: number): Promise<void> {
  const { error } = await client.from('organigramme_links').delete().eq('id', id);
  if (error) throw new Error('Impossible de supprimer ce lien.', { cause: error });
}
