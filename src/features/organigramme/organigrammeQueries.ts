import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrgData, OrgSupport } from './organigrammeModel';

export async function fetchOrganigramme(client: SupabaseClient, asOf: string): Promise<OrgData> {
  const { data, error } = await client.rpc('organigramme_snapshot', { p_as_of: asOf });
  if (error) throw new Error('Impossible de charger l’organigramme. Vérifiez vos droits et réessayez.', { cause: error });
  if (!data || !Array.isArray(data.people) || !Array.isArray(data.vessels) || !Array.isArray(data.memberships) || !Array.isArray(data.support)) throw new Error('Les données de l’organigramme sont indisponibles.');
  return { ...data, asOf } as OrgData;
}

export async function saveOrgSupport(client: SupabaseClient, entry: Omit<OrgSupport, 'id'> & { id?: number }): Promise<void> {
  const { error } = await client.rpc('save_organigramme_support', { p_id: entry.id ?? null, p_person_id: entry.personId, p_name: entry.name.trim(), p_function_label: entry.functionLabel.trim(), p_category: entry.category, p_position: entry.position });
  if (error) throw new Error('Impossible d’enregistrer cet intervenant.', { cause: error });
}
export async function deleteOrgSupport(client: SupabaseClient, id: number): Promise<void> {
  const { error } = await client.from('organigramme_support').delete().eq('id', id);
  if (error) throw new Error('Impossible de supprimer cet intervenant.', { cause: error });
}
