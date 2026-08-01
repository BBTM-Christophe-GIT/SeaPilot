import type { SupabaseClient } from '@supabase/supabase-js';
import { ROLE_KEYS, type RoleKey } from '../permissions/roles';

interface RoleRow {
  role_key: string;
}

export interface CurrentPersonSummary {
  id: number;
  firstName: string;
  lastName: string;
  functionLabel: string;
  gradeLabel: string;
}

export function mapRoleRows(rows: RoleRow[]): RoleKey[] {
  return rows
    .map((row) => row.role_key)
    .filter((role): role is RoleKey => ROLE_KEYS.includes(role as RoleKey));
}

export async function fetchCurrentUserRoles(client: SupabaseClient): Promise<RoleKey[]> {
  const { data, error } = await client.from('user_roles').select('role_key');

  if (error) {
    throw error;
  }

  return mapRoleRows(data || []);
}

export async function fetchCurrentPersonSummary(client: SupabaseClient): Promise<CurrentPersonSummary | null> {
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  const userId = authData.user?.id;
  if (!userId) return null;

  const { data, error } = await client
    .from('people')
    .select('id,first_name,last_name,function_label,grade_label')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    id: Number(data.id),
    firstName: String(data.first_name || ''),
    lastName: String(data.last_name || ''),
    functionLabel: String(data.function_label || ''),
    gradeLabel: String(data.grade_label || ''),
  };
}
