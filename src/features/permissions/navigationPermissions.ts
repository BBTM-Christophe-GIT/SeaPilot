import type { SupabaseClient } from '@supabase/supabase-js';
import { APP_MODULES, type AppModule, type ModuleKey } from './moduleAccess';
import { ROLE_KEYS, type RoleKey } from './roles';

interface NavigationPermissionRow {
  module_key: string;
  role_key: string;
  is_visible: boolean;
}

export interface NavigationPermission {
  moduleKey: ModuleKey;
  roleKey: RoleKey;
  isVisible: boolean;
}

function isModuleKey(value: string): value is ModuleKey {
  return APP_MODULES.some((module) => module.key === value);
}

function isRoleKey(value: string): value is RoleKey {
  return ROLE_KEYS.includes(value as RoleKey);
}

export function getDefaultNavigationPermissions(): NavigationPermission[] {
  return APP_MODULES.flatMap((module) =>
    ROLE_KEYS.map((roleKey) => ({
      moduleKey: module.key,
      roleKey,
      isVisible: module.allowedRoles.includes(roleKey),
    })),
  );
}

export function mapNavigationPermissionRows(rows: NavigationPermissionRow[]): NavigationPermission[] {
  return rows.flatMap((row) => {
    if (!isModuleKey(row.module_key) || !isRoleKey(row.role_key)) {
      return [];
    }

    return [
      {
        moduleKey: row.module_key,
        roleKey: row.role_key,
        isVisible: row.is_visible,
      },
    ];
  });
}

export function mergeNavigationPermissions(rows: NavigationPermission[]): NavigationPermission[] {
  const configuredPermissions = new Map(
    rows.map((permission) => [`${permission.roleKey}:${permission.moduleKey}`, permission]),
  );

  return getDefaultNavigationPermissions().map(
    (permission) => configuredPermissions.get(`${permission.roleKey}:${permission.moduleKey}`) || permission,
  );
}

export function getVisibleModulesForPermissions(
  roles: RoleKey[],
  permissions: NavigationPermission[],
): AppModule[] {
  const visibleKeys = new Set(
    permissions
      .filter((permission) => permission.isVisible && roles.includes(permission.roleKey))
      .map((permission) => permission.moduleKey),
  );

  return APP_MODULES.filter((module) => visibleKeys.has(module.key));
}

export function getDefaultVisibleModules(roles: RoleKey[]): AppModule[] {
  return getVisibleModulesForPermissions(roles, getDefaultNavigationPermissions());
}

export async function fetchNavigationPermissions(client: SupabaseClient): Promise<NavigationPermission[]> {
  const { data, error } = await client
    .from('role_module_permissions')
    .select('module_key, role_key, is_visible')
    .order('module_key', { ascending: true })
    .order('role_key', { ascending: true });

  if (error) {
    throw error;
  }

  return mergeNavigationPermissions(mapNavigationPermissionRows((data || []) as NavigationPermissionRow[]));
}

export async function fetchVisibleModulesForRoles(
  client: SupabaseClient,
  roles: RoleKey[],
): Promise<AppModule[]> {
  if (roles.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from('role_module_permissions')
    .select('module_key, role_key, is_visible')
    .in('role_key', roles);

  if (error) {
    throw error;
  }

  return getVisibleModulesForPermissions(roles, mapNavigationPermissionRows((data || []) as NavigationPermissionRow[]));
}

export async function setNavigationPermission(
  client: SupabaseClient,
  roleKey: RoleKey,
  moduleKey: ModuleKey,
  isVisible: boolean,
): Promise<void> {
  const { error } = await client.from('role_module_permissions').upsert(
    {
      role_key: roleKey,
      module_key: moduleKey,
      is_visible: isVisible,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'role_key,module_key' },
  );

  if (error) {
    throw error;
  }
}
