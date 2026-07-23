import type { RoleKey } from '../permissions/roles';

const PLANNING_READ_ROLES = new Set<RoleKey>(['admin', 'direction', 'armement', 'capitaine', 'marin']);

export interface PlanningPermissions {
  canRead: boolean;
  canEditEvents: boolean;
  canExport: boolean;
  canManagePublication: boolean;
  canSubmitPublication: boolean;
  canValidatePublication: boolean;
  canPublishPublication: boolean;
  canReopenPublication: boolean;
  canArchivePublication: boolean;
  canViewHistory: boolean;
  canManageVessels: boolean;
  canManageHandovers: boolean;
  canManageRotations: boolean;
  canManageTemplates: boolean;
  canManageManning: boolean;
  canRequestAbsences: boolean;
  canReviewAbsences: boolean;
  canDeleteAbsences: boolean;
  canMoveApprovedAbsences: boolean;
  canManageConflictCases: boolean;
  canPrepareReplacements: boolean;
  canManageWorkRestPolicies: boolean;
  canViewWorkRest: boolean;
  canViewNotifications: boolean;
  canRefreshNotifications: boolean;
  canViewDashboard: boolean;
  canManageDependencies: boolean;
  canBeAssistantPilot: boolean;
  canManageAssistantPilots: boolean;
}

export function getPlanningPermissions(roles: RoleKey[], legacyLockState = false): PlanningPermissions {
  void legacyLockState;
  const isAdmin = roles.includes('admin');
  const isDirection = roles.includes('direction');
  const isArmement = roles.includes('armement');
  const isCaptain = roles.includes('capitaine');
  const canEdit = isAdmin || isDirection || isArmement;
  return {
    canRead: roles.some((role) => PLANNING_READ_ROLES.has(role)),
    canEditEvents: canEdit,
    canExport: isAdmin || isDirection || isArmement,
    canManagePublication: canEdit,
    canSubmitPublication: false,
    canValidatePublication: false,
    canPublishPublication: canEdit,
    canReopenPublication: false,
    canArchivePublication: false,
    canViewHistory: canEdit,
    canManageVessels: isAdmin,
    canManageHandovers: isAdmin || isArmement,
    canManageRotations: canEdit,
    canManageTemplates: canEdit,
    canManageManning: canEdit,
    canRequestAbsences: roles.some((role) => PLANNING_READ_ROLES.has(role)),
    canReviewAbsences: isAdmin || isDirection || isArmement,
    canDeleteAbsences: isAdmin,
    canMoveApprovedAbsences: isAdmin,
    canManageConflictCases: canEdit,
    canPrepareReplacements: canEdit,
    canManageWorkRestPolicies: isAdmin,
    canViewWorkRest: roles.some((role) => PLANNING_READ_ROLES.has(role)),
    canViewNotifications: roles.some((role) => PLANNING_READ_ROLES.has(role)),
    canRefreshNotifications: isAdmin || isDirection || isArmement,
    canViewDashboard: isAdmin || isDirection || isArmement || isCaptain,
    canManageDependencies: canEdit,
    canBeAssistantPilot: isAdmin || isDirection || isArmement,
    canManageAssistantPilots: isAdmin,
  };
}
