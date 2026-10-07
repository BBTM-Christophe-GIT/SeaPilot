import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeProcedureSearch, normalizeProcedureTags } from './procedureTags';

export const DEFAULT_PROCEDURE_TAGS = [
  'Rôle', 'MARPOL', 'Pollution', 'Incendie', 'THOMSEA',
] as const;

export async function fetchProcedureTagCatalogue(client: SupabaseClient): Promise<string[]> {
  const { data, error } = await client.from('procedure_tag_catalogue').select('name').eq('active', true).order('name');
  if (error) throw error;
  return normalizeProcedureTags(((data || []) as { name: string }[]).map(row => row.name))
    .sort((left, right) => left.localeCompare(right, 'fr'));
}

export async function createProcedureTag(client: SupabaseClient, value: string): Promise<string> {
  const name = normalizeProcedureTags([value])[0];
  if (!name) throw new Error('Renseignez le nom du tag.');
  if (/[,;]/.test(name)) throw new Error('Saisissez un seul tag, sans virgule ni point-virgule.');
  const { data, error } = await client.from('procedure_tag_catalogue')
    .upsert({ name, active: true }, { onConflict: 'name_key' }).select('name').single();
  if (error) throw error;
  return (data as { name: string }).name;
}

export async function removeProcedureTag(client: SupabaseClient, name: string): Promise<void> {
  const { error } = await client.from('procedure_tag_catalogue').update({ active: false })
    .eq('name_key', normalizeProcedureSearch(name)).select('name').single();
  if (error) throw error;
}
