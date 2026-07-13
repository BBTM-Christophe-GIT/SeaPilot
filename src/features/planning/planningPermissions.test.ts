import { describe, expect, it } from 'vitest';
import { getPlanningPermissions } from './planningPermissions';

describe('planning permissions', () => {
  it('separates direction validation/publication from vessel administration', () => {
    expect(getPlanningPermissions(['direction'], false)).toMatchObject({
      canRead: true,
      canEditEvents: true,
      canSubmitPublication: true,
      canValidatePublication: true,
      canPublishPublication: true,
      canReopenPublication: true,
      canArchivePublication: false,
      canManageVessels: false,
      canManageHandovers: false,
      canManageDerogations: true,
      canViewHistory: true,
    });
  });

  it('lets armement prepare events and handovers without validating or publishing', () => {
    expect(getPlanningPermissions(['armement'], false)).toMatchObject({
      canEditEvents: true,
      canSubmitPublication: true,
      canValidatePublication: false,
      canPublishPublication: false,
      canManageHandovers: true,
      canManageDerogations: false,
      canViewHistory: true,
    });
  });

  it('limits a captain to reading, scoped validation and history', () => {
    expect(getPlanningPermissions(['capitaine'], false)).toMatchObject({
      canRead: true,
      canEditEvents: false,
      canValidatePublication: true,
      canPublishPublication: false,
      canViewHistory: true,
    });
  });

  it('keeps a sailor in read-only mode without governance history', () => {
    expect(getPlanningPermissions(['marin'], false)).toMatchObject({
      canRead: true,
      canEditEvents: false,
      canManagePublication: false,
      canViewHistory: false,
      canExport: false,
    });
  });

  it('allows an administrator to perform every Planning action', () => {
    expect(getPlanningPermissions(['admin'], false)).toMatchObject({
      canRead: true,
      canEditEvents: true,
      canSubmitPublication: true,
      canValidatePublication: true,
      canPublishPublication: true,
      canReopenPublication: true,
      canArchivePublication: true,
      canManageVessels: true,
      canManageHandovers: true,
      canManageDerogations: true,
      canViewHistory: true,
    });
  });

  it('blocks business mutations while retaining workflow actions on a locked period', () => {
    const permissions = getPlanningPermissions(['admin'], true);
    expect(permissions.canEditEvents).toBe(false);
    expect(permissions.canManageHandovers).toBe(false);
    expect(permissions.canManageDerogations).toBe(false);
    expect(permissions.canManagePublication).toBe(true);
    expect(permissions.canReopenPublication).toBe(true);
  });

  it('denies Planning access when no Planning role is present', () => {
    expect(getPlanningPermissions([], false).canRead).toBe(false);
  });
});
