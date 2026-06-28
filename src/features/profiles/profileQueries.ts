import type { SupabaseClient } from '@supabase/supabase-js';
import { ROLE_KEYS, type RoleKey } from '../permissions/roles';

interface RoleRow {
  role_key: string;
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
