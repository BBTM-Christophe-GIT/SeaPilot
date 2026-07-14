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
  canManageDerogations: boolean;
  canManageRotations: boolean;
  canManageTemplates: boolean;
  canManageManning: boolean;
  canRequestAbsences: boolean;
  canReviewAbsences: boolean;
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

export function getPlanningPermissions(roles: RoleKey[], isPeriodLocked: boolean): PlanningPermissions {
  const isAdmin = roles.includes('admin');
  const isDirection = roles.includes('direction');
  const isArmement = roles.includes('armement');
  const isCaptain = roles.includes('capitaine');
  const canEdit = isAdmin || isDirection || isArmement;
  const canSubmit = canEdit;
  const canValidate = isAdmin || isDirection || isCaptain;
  const canPublish = isAdmin || isDirection;
  const canReopen = isAdmin || isDirection;
  return {
    canRead: roles.some((role) => PLANNING_READ_ROLES.has(role)),
    canEditEvents: canEdit && !isPeriodLocked,
    canExport: isAdmin || isDirection || isArmement,
    canManagePublication: canSubmit || canValidate || canPublish || canReopen || isAdmin,
    canSubmitPublication: canSubmit,
    canValidatePublication: canValidate,
    canPublishPublication: canPublish,
    canReopenPublication: canReopen,
    canArchivePublication: isAdmin,
    canViewHistory: isAdmin || isDirection || isArmement || isCaptain,
    canManageVessels: isAdmin,
    canManageHandovers: (isAdmin || isArmement) && !isPeriodLocked,
    canManageDerogations: (isAdmin || isDirection) && !isPeriodLocked,
    canManageRotations: canEdit && !isPeriodLocked,
    canManageTemplates: canEdit && !isPeriodLocked,
    canManageManning: canEdit && !isPeriodLocked,
    canRequestAbsences: roles.some((role) => PLANNING_READ_ROLES.has(role)),
    canReviewAbsences: isAdmin || isDirection || isArmement,
    canManageConflictCases: isAdmin || isDirection || isArmement || isCaptain,
    canPrepareReplacements: canEdit && !isPeriodLocked,
    canManageWorkRestPolicies: isAdmin,
    canViewWorkRest: roles.some((role) => PLANNING_READ_ROLES.has(role)),
    canViewNotifications: roles.some((role) => PLANNING_READ_ROLES.has(role)),
    canRefreshNotifications: isAdmin || isDirection || isArmement,
    canViewDashboard: isAdmin || isDirection || isArmement || isCaptain,
    canManageDependencies: (isAdmin || isDirection || isArmement || isCaptain) && !isPeriodLocked,
    canBeAssistantPilot: isAdmin || isDirection || isArmement,
    canManageAssistantPilots: isAdmin,
  };
}
