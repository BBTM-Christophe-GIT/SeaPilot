import type { RoleKey } from '../permissions/roles';

const PLANNING_READ_ROLES = new Set<RoleKey>(['admin', 'direction', 'armement', 'capitaine', 'marin']);

export interface PlanningPermissions {
  canRead: boolean;
  canEditEvents: boolean;
  canExport: boolean;
  canManagePublication: boolean;
  canManageVessels: boolean;
  canManageHandovers: boolean;
  canManageDerogations: boolean;
}

export function getPlanningPermissions(roles: RoleKey[], isPeriodLocked: boolean): PlanningPermissions {
  const canAdminister = roles.includes('admin');
  return {
    canRead: roles.some((role) => PLANNING_READ_ROLES.has(role)),
    canEditEvents: canAdminister && !isPeriodLocked,
    canExport: canAdminister,
    canManagePublication: canAdminister,
    canManageVessels: canAdminister,
    canManageHandovers: canAdminister && !isPeriodLocked,
    canManageDerogations: canAdminister,
  };
}
