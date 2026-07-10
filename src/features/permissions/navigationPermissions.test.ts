import { describe, expect, it } from 'vitest';
import { APP_MODULES } from './moduleAccess';
import {
  getDefaultNavigationPermissions,
  getVisibleModulesForPermissions,
  mapNavigationPermissionRows,
  mergeNavigationPermissions,
} from './navigationPermissions';

describe('navigation permissions', () => {
  it('keeps the legacy role matrix as the seeded default', () => {
    const permissions = getDefaultNavigationPermissions();
    const adminModules = getVisibleModulesForPermissions(['admin'], permissions);
    const sailorModules = getVisibleModulesForPermissions(['marin'], permissions);

    expect(adminModules).toHaveLength(APP_MODULES.length);
    expect(sailorModules.map((module) => module.key)).not.toContain('admin');
    expect(sailorModules.map((module) => module.key)).not.toContain('projects');
  });

  it('uses administrator configuration to reveal a module for a role', () => {
    const permissions = mergeNavigationPermissions(
      mapNavigationPermissionRows([
        { module_key: 'projects', role_key: 'marin', is_visible: true },
        { module_key: 'unknown', role_key: 'marin', is_visible: true },
      ]),
    );

    expect(getVisibleModulesForPermissions(['marin'], permissions).map((module) => module.key)).toContain('projects');
  });
});
