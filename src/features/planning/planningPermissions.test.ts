import { describe, expect, it } from 'vitest';
import { getPlanningPermissions } from './planningPermissions';

describe('planning permissions', () => {
  it.each(['direction', 'armement', 'capitaine', 'marin'] as const)('allows %s to read without modifying', (role) => {
    expect(getPlanningPermissions([role], false)).toEqual({
      canRead: true,
      canEditEvents: false,
      canExport: false,
      canManagePublication: false,
      canManageVessels: false,
    });
  });

  it('allows an administrator to modify an unlocked planning', () => {
    expect(getPlanningPermissions(['admin'], false)).toEqual({
      canRead: true,
      canEditEvents: true,
      canExport: true,
      canManagePublication: true,
      canManageVessels: true,
    });
  });

  it('keeps publication management available while a period is locked', () => {
    const permissions = getPlanningPermissions(['admin'], true);
    expect(permissions.canEditEvents).toBe(false);
    expect(permissions.canManagePublication).toBe(true);
  });

  it('denies Planning access when no Planning role is present', () => {
    expect(getPlanningPermissions([], false).canRead).toBe(false);
  });
});
