import { describe, expect, it, vi } from 'vitest';
import { APP_MODULES } from './moduleAccess';
import {
  getDefaultNavigationPermissions,
  getVisibleModulesForPermissions,
  mapNavigationPermissionRows,
  mergeNavigationPermissions,
  setNavigationPermission,
} from './navigationPermissions';

describe('navigation permissions', () => {
  it.each(['direction', 'armement', 'marin'] as const)('keeps medical records inaccessible to %s despite a visible permission', async (role) => {
    expect(getVisibleModulesForPermissions([role], [{ moduleKey: 'medicalLogbook', roleKey: role, isVisible: true }])).toEqual([]);
    const client = { from: vi.fn() };
    await expect(setNavigationPermission(client as never, role, 'medicalLogbook', true)).rejects.toThrow('réservé');
    expect(client.from).not.toHaveBeenCalled();
  });

  it.each(['admin', 'capitaine'] as const)('allows an authorized %s medical permission but respects its removal', (role) => {
    expect(getVisibleModulesForPermissions([role], [{ moduleKey: 'medicalLogbook', roleKey: role, isVisible: true }]))
      .toEqual([expect.objectContaining({ key: 'medicalLogbook', family: 'Registres' })]);
    expect(getVisibleModulesForPermissions([role], [{ moduleKey: 'medicalLogbook', roleKey: role, isVisible: false }])).toEqual([]);
  });
  it.each(['direction', 'armement', 'capitaine', 'marin'] as const)('keeps Administration inaccessible to %s even with a stale visible permission', (role) => {
    expect(getVisibleModulesForPermissions([role], [{ moduleKey: 'admin', roleKey: role, isVisible: true }])).toEqual([]);
  });
  it('keeps the role matrix as the seeded default for configured navigation items', () => {
    const permissions = getDefaultNavigationPermissions();
    const adminModules = getVisibleModulesForPermissions(['admin'], permissions);
    const sailorModules = getVisibleModulesForPermissions(['marin'], permissions);

    expect(adminModules).toHaveLength(APP_MODULES.length);
    expect(sailorModules.map((module) => module.key)).not.toContain('admin');
    expect(sailorModules.map((module) => module.key)).not.toContain('projects');
    expect(sailorModules.map((module) => module.key)).not.toContain('billingElements');
    expect(sailorModules.map((module) => module.key)).not.toContain('annualReviews');
    expect(sailorModules.map((module) => module.key)).toContain('workingTime');
    expect(sailorModules.map((module) => module.key)).toContain('lifting');
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
