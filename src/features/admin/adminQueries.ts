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

interface SharePointSourceRow {
  key: string;
  title: string;
  source_type: string;
  module_key: string;
  target_table: string | null;
  import_priority: number;
  confirmed: boolean;
}

interface AdminInviteCandidateRow {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  function_label: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  roles: RoleKey[];
}

export interface SharePointImportSource {
  key: string;
  title: string;
  sourceType: string;
  moduleKey: string;
  targetTable: string;
  importPriority: number;
  confirmed: boolean;
}

export interface AdminInviteCandidate {
  id: number;
  displayName: string;
  email: string;
  functionLabel: string;
}

export interface AdminInvitationInput {
  email: string;
  displayName: string;
  roleKeys: RoleKey[];
  personId: number | null;
}

interface AdminUserActionResponse {
  message?: unknown;
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

export function mapSharePointSourceRows(rows: SharePointSourceRow[]): SharePointImportSource[] {
  return rows.map((row) => ({
    key: row.key,
    title: row.title,
    sourceType: row.source_type,
    moduleKey: row.module_key,
    targetTable: row.target_table || '',
    importPriority: row.import_priority,
    confirmed: row.confirmed,
  }));
}

export function mapAdminInviteCandidateRows(rows: AdminInviteCandidateRow[]): AdminInviteCandidate[] {
  return rows.map((row) => ({
    id: row.id,
    displayName: `${row.first_name} ${row.last_name}`.trim(),
    email: row.email?.trim() || '',
    functionLabel: row.function_label?.trim() || '',
  }));
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

export async function fetchSharePointImportSources(client: SupabaseClient): Promise<SharePointImportSource[]> {
  const { data, error } = await client
    .from('sharepoint_sources')
    .select('key, title, source_type, module_key, target_table, import_priority, confirmed')
    .order('import_priority', { ascending: true })
    .order('title', { ascending: true });

  if (error) {
    throw error;
  }

  return mapSharePointSourceRows((data || []) as SharePointSourceRow[]);
}

export async function fetchAdminInviteCandidates(client: SupabaseClient): Promise<AdminInviteCandidate[]> {
  const { data, error } = await client
    .from('people')
    .select('id, first_name, last_name, email, function_label')
    .eq('active', true)
    .is('user_id', null)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true });

  if (error) {
    throw error;
  }

  return mapAdminInviteCandidateRows((data || []) as AdminInviteCandidateRow[]);
}

async function readFunctionError(error: unknown, fallbackMessage: string): Promise<string> {
  const context = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;

  if (context?.json) {
    try {
      const payload = await context.json() as { message?: unknown };

      if (typeof payload.message === 'string' && payload.message.trim()) {
        return payload.message;
      }
    } catch {
      // Fall back to the client error below when the response is not JSON.
    }
  }

  return error instanceof Error && error.message
    ? error.message
    : fallbackMessage;
}

export async function inviteSeaPilotUser(
  client: SupabaseClient,
  input: AdminInvitationInput,
): Promise<void> {
  const { error } = await client.functions.invoke('admin-invite-user', {
    body: input,
  });

  if (error) {
    throw new Error(await readFunctionError(error, "Impossible d'envoyer l'invitation."));
  }
}

async function manageSeaPilotUser(
  client: SupabaseClient,
  userId: string,
  action: 'resend_access' | 'delete',
): Promise<string> {
  const { data, error } = await client.functions.invoke('admin-manage-user', {
    body: { action, userId },
  });

  if (error) {
    throw new Error(await readFunctionError(error, "Impossible d'effectuer cette action sur l'utilisateur."));
  }

  const message = (data as AdminUserActionResponse | null)?.message;
  return typeof message === 'string' && message.trim()
    ? message
    : action === 'delete'
      ? 'Utilisateur supprimé.'
      : 'Un nouveau lien a été envoyé.';
}

export function resendSeaPilotUserAccess(client: SupabaseClient, userId: string): Promise<string> {
  return manageSeaPilotUser(client, userId, 'resend_access');
}

export function deleteSeaPilotUser(client: SupabaseClient, userId: string): Promise<string> {
  return manageSeaPilotUser(client, userId, 'delete');
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
