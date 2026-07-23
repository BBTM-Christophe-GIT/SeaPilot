import { describe, expect, it } from 'vitest';
import { getPlanningPermissions } from './planningPermissions';

describe('planning permissions', () => {
  it('lets direction edit and distribute without a validation circuit', () => {
    expect(getPlanningPermissions(['direction'], false)).toMatchObject({
      canRead: true,
      canEditEvents: true,
      canSubmitPublication: false,
      canValidatePublication: false,
      canPublishPublication: true,
      canReopenPublication: false,
      canArchivePublication: false,
      canManageVessels: false,
      canManageHandovers: false,
      canManageRotations: true,
      canManageTemplates: true,
      canManageManning: true,
      canRequestAbsences: true,
      canReviewAbsences: true,
      canDeleteAbsences: false,
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

  it('lets armement edit, handle handovers and distribute', () => {
    expect(getPlanningPermissions(['armement'], false)).toMatchObject({
      canEditEvents: true,
      canSubmitPublication: false,
      canValidatePublication: false,
      canPublishPublication: true,
      canManageHandovers: true,
      canManageRotations: true,
      canManageTemplates: true,
      canManageManning: true,
      canRequestAbsences: true,
      canReviewAbsences: true,
      canDeleteAbsences: false,
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

  it('limits a captain to the latest distributed planning and leave requests', () => {
    expect(getPlanningPermissions(['capitaine'], false)).toMatchObject({
      canRead: true,
      canEditEvents: false,
      canValidatePublication: false,
      canPublishPublication: false,
      canManageRotations: false,
      canManageTemplates: false,
      canManageManning: false,
      canRequestAbsences: true,
      canReviewAbsences: false,
      canDeleteAbsences: false,
      canManageConflictCases: false,
      canPrepareReplacements: false,
      canViewHistory: false,
      canManageWorkRestPolicies: false,
      canViewWorkRest: true,
      canViewNotifications: true,
      canRefreshNotifications: false,
      canViewDashboard: true,
      canManageDependencies: false,
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
      canDeleteAbsences: false,
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

  it('allows an administrator to edit and distribute without legacy workflow actions', () => {
    expect(getPlanningPermissions(['admin'], false)).toMatchObject({
      canRead: true,
      canEditEvents: true,
      canSubmitPublication: false,
      canValidatePublication: false,
      canPublishPublication: true,
      canReopenPublication: false,
      canArchivePublication: false,
      canManageVessels: true,
      canManageHandovers: true,
      canManageRotations: true,
      canManageTemplates: true,
      canManageManning: true,
      canRequestAbsences: true,
      canReviewAbsences: true,
      canDeleteAbsences: true,
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

  it('ignores legacy period locks for office business mutations', () => {
    const permissions = getPlanningPermissions(['admin'], true);
    expect(permissions.canEditEvents).toBe(true);
    expect(permissions.canManageHandovers).toBe(true);
    expect(permissions.canManageRotations).toBe(true);
    expect(permissions.canManageTemplates).toBe(true);
    expect(permissions.canManageManning).toBe(true);
    expect(permissions.canPrepareReplacements).toBe(true);
    expect(permissions.canManageDependencies).toBe(true);
    expect(permissions.canManageWorkRestPolicies).toBe(true);
    expect(permissions.canRequestAbsences).toBe(true);
    expect(permissions.canReviewAbsences).toBe(true);
    expect(permissions.canDeleteAbsences).toBe(true);
    expect(permissions.canManageConflictCases).toBe(true);
    expect(permissions.canManagePublication).toBe(true);
    expect(permissions.canPublishPublication).toBe(true);
    expect(permissions.canReopenPublication).toBe(false);
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
