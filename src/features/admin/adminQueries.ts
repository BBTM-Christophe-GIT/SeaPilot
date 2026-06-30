import type { SupabaseClient } from '@supabase/supabase-js';
import { ROLE_KEYS, type RoleKey } from '../permissions/roles';

interface AdminRoleRow {
  role_key: string;
}

interface AdminProfileRow {
  id: string;
  email: string;
  display_name: string;
  user_roles: AdminRoleRow[] | null;
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  roles: RoleKey[];
}

function isRoleKey(role: string): role is RoleKey {
  return ROLE_KEYS.includes(role as RoleKey);
}

export function mapAdminProfileRows(rows: AdminProfileRow[]): AdminUser[] {
  return rows.map((row) => {
    const roles = (row.user_roles || [])
      .map((roleRow) => roleRow.role_key)
      .filter(isRoleKey);
    const displayName = row.display_name.trim() || row.email;

    return {
      id: row.id,
      email: row.email,
      displayName,
      roles,
    };
  });
}

export async function fetchAdminUsers(client: SupabaseClient): Promise<AdminUser[]> {
  const { data, error } = await client
    .from('profiles')
    .select('id, email, display_name, user_roles!user_roles_user_id_fkey(role_key)')
    .order('email', { ascending: true });

  if (error) {
    throw error;
  }

  return mapAdminProfileRows((data || []) as AdminProfileRow[]);
}

export async function assignUserRole(client: SupabaseClient, userId: string, roleKey: RoleKey): Promise<void> {
  const { error } = await client.from('user_roles').insert({ user_id: userId, role_key: roleKey });

  if (error) {
    throw error;
  }
}

export async function removeUserRole(client: SupabaseClient, userId: string, roleKey: RoleKey): Promise<void> {
  const { error } = await client.from('user_roles').delete().eq('user_id', userId).eq('role_key', roleKey);

  if (error) {
    throw error;
  }
}
