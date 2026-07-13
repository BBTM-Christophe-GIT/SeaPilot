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
  };
}
