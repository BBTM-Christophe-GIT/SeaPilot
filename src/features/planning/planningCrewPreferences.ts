import type { SupabaseClient } from '@supabase/supabase-js';

export type CrewNameFormat = 'first_last' | 'last_first';
export type CrewSortOrder = 'period' | 'last_name' | 'function';
export interface CrewDisplayPreferences {
  nameFormat: CrewNameFormat;
  sortOrder: CrewSortOrder;
}

export const DEFAULT_CREW_PREFERENCES: CrewDisplayPreferences = { nameFormat: 'first_last', sortOrder: 'period' };
export const CREW_SORT_OPTIONS: { value: CrewSortOrder; label: string }[] = [
  { value: 'period', label: 'Période d’embarquement' },
  { value: 'last_name', label: 'NOM : A à Z' },
  { value: 'function', label: 'Fonction' },
];
export const CREW_FUNCTION_ORDER = ['Capitaine', 'Chef Mécanicien', '2nd Capitaine', 'Maître d’équipage', 'Maître Machine', 'Matelot'];
const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

export function formatCrewName(person: { firstName: string; lastName: string }, format: CrewNameFormat): string {
  const first = person.firstName.trim();
  const last = person.lastName.trim().toLocaleUpperCase('fr');
  return (format === 'last_first' ? [last, first] : [first, last]).filter(Boolean).join(' ');
}

export function crewFunctionRank(label: string): number {
  const normalized = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();
  if (normalized === 'capitaine') return 0;
  if (normalized === 'chef mecanicien') return 1;
  if (/^(2nd|2nde|2eme|second) capitaine$/.test(normalized)) return 2;
  if (/^maitre (d )?equipage$/.test(normalized)) return 3;
  if (/^maitre (de |de la )?machine$/.test(normalized)) return 4;
  if (/^matelot(?: |$)/.test(normalized)) return 5;
  return 6;
}

export function compareCrewNames(
  left: { firstName: string; lastName: string },
  right: { firstName: string; lastName: string },
): number {
  return collator.compare(left.lastName.trim(), right.lastName.trim())
    || collator.compare(left.firstName.trim(), right.firstName.trim());
}

function mapPreferences(row: { name_format?: string; sort_order?: string } | null): CrewDisplayPreferences {
  return {
    nameFormat: row?.name_format === 'last_first' ? 'last_first' : 'first_last',
    sortOrder: row?.sort_order === 'last_name' || row?.sort_order === 'function' ? row.sort_order : 'period',
  };
}

export async function fetchCrewDisplayPreferences(client: SupabaseClient): Promise<CrewDisplayPreferences> {
  const { data, error } = await client.from('planning_crew_display_preferences')
    .select('name_format, sort_order').maybeSingle();
  if (error) throw error;
  return mapPreferences(data);
}

export async function saveCrewDisplayPreferences(client: SupabaseClient, preferences: CrewDisplayPreferences): Promise<CrewDisplayPreferences> {
  const { data, error } = await client.rpc('planning_save_crew_display_preferences', {
    p_name_format: preferences.nameFormat, p_sort_order: preferences.sortOrder,
  });
  if (error) throw error;
  return mapPreferences(Array.isArray(data) ? data[0] : data);
}
