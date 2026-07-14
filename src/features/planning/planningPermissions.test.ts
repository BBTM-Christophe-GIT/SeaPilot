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
      canManageRotations: true,
      canManageTemplates: true,
      canManageManning: true,
      canRequestAbsences: true,
      canReviewAbsences: true,
      canManageConflictCases: true,
      canPrepareReplacements: true,
      canViewHistory: true,
      canManageWorkRestPolicies: false,
      canViewWorkRest: true,
      canViewNotifications: true,
      canRefreshNotifications: true,
      canViewDashboard: true,
      canManageDependencies: true,
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
      canManageRotations: true,
      canManageTemplates: true,
      canManageManning: true,
      canRequestAbsences: true,
      canReviewAbsences: true,
      canManageConflictCases: true,
      canPrepareReplacements: true,
      canViewHistory: true,
      canManageWorkRestPolicies: false,
      canViewWorkRest: true,
      canViewNotifications: true,
      canRefreshNotifications: true,
      canViewDashboard: true,
      canManageDependencies: true,
    });
  });

  it('limits a captain to reading, scoped validation and history', () => {
    expect(getPlanningPermissions(['capitaine'], false)).toMatchObject({
      canRead: true,
      canEditEvents: false,
      canValidatePublication: true,
      canPublishPublication: false,
      canManageRotations: false,
      canManageTemplates: false,
      canManageManning: false,
      canRequestAbsences: true,
      canReviewAbsences: false,
      canManageConflictCases: true,
      canPrepareReplacements: false,
      canViewHistory: true,
      canManageWorkRestPolicies: false,
      canViewWorkRest: true,
      canViewNotifications: true,
      canRefreshNotifications: false,
      canViewDashboard: true,
      canManageDependencies: true,
    });
  });

  it('keeps a sailor in read-only mode without governance history', () => {
    expect(getPlanningPermissions(['marin'], false)).toMatchObject({
      canRead: true,
      canEditEvents: false,
      canManagePublication: false,
      canViewHistory: false,
      canExport: false,
      canManageRotations: false,
      canManageTemplates: false,
      canManageManning: false,
      canRequestAbsences: true,
      canReviewAbsences: false,
      canManageConflictCases: false,
      canPrepareReplacements: false,
      canManageWorkRestPolicies: false,
      canViewWorkRest: true,
      canViewNotifications: true,
      canRefreshNotifications: false,
      canViewDashboard: false,
      canManageDependencies: false,
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
      canManageRotations: true,
      canManageTemplates: true,
      canManageManning: true,
      canRequestAbsences: true,
      canReviewAbsences: true,
      canManageConflictCases: true,
      canPrepareReplacements: true,
      canViewHistory: true,
      canManageWorkRestPolicies: true,
      canViewWorkRest: true,
      canViewNotifications: true,
      canRefreshNotifications: true,
      canViewDashboard: true,
      canManageDependencies: true,
    });
  });

  it('blocks business mutations while retaining workflow actions on a locked period', () => {
    const permissions = getPlanningPermissions(['admin'], true);
    expect(permissions.canEditEvents).toBe(false);
    expect(permissions.canManageHandovers).toBe(false);
    expect(permissions.canManageDerogations).toBe(false);
    expect(permissions.canManageRotations).toBe(false);
    expect(permissions.canManageTemplates).toBe(false);
    expect(permissions.canManageManning).toBe(false);
    expect(permissions.canPrepareReplacements).toBe(false);
    expect(permissions.canManageDependencies).toBe(false);
    expect(permissions.canManageWorkRestPolicies).toBe(true);
    expect(permissions.canRequestAbsences).toBe(true);
    expect(permissions.canReviewAbsences).toBe(true);
    expect(permissions.canManageConflictCases).toBe(true);
    expect(permissions.canManagePublication).toBe(true);
    expect(permissions.canReopenPublication).toBe(true);
  });

  it('denies Planning access when no Planning role is present', () => {
    expect(getPlanningPermissions([], false).canRead).toBe(false);
  });

  it('limits assistant pilot eligibility to administrators and office roles', () => {
    expect(getPlanningPermissions(['admin'], false)).toMatchObject({ canBeAssistantPilot: true, canManageAssistantPilots: true });
    expect(getPlanningPermissions(['direction'], false)).toMatchObject({ canBeAssistantPilot: true, canManageAssistantPilots: false });
    expect(getPlanningPermissions(['armement'], false)).toMatchObject({ canBeAssistantPilot: true, canManageAssistantPilots: false });
    expect(getPlanningPermissions(['capitaine'], false)).toMatchObject({ canBeAssistantPilot: false, canManageAssistantPilots: false });
    expect(getPlanningPermissions(['marin'], false)).toMatchObject({ canBeAssistantPilot: false, canManageAssistantPilots: false });
  });
});
