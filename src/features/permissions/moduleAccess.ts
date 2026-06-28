import type { RoleKey } from './roles';

export type ModuleKey =
  | 'home'
  | 'kpi'
  | 'qhse'
  | 'certificates'
  | 'procedures'
  | 'actionPlan'
  | 'dpr'
  | 'purchaseRequests'
  | 'planning'
  | 'humanResources'
  | 'projects'
  | 'admin';

export interface AppModule {
  key: ModuleKey;
  label: string;
  family: 'Accueil' | 'QHSE' | 'Operations' | 'Achats' | 'Planning' | 'RH' | 'Administration';
  allowedRoles: RoleKey[];
}

export const APP_MODULES: AppModule[] = [
  { key: 'home', label: 'Accueil', family: 'Accueil', allowedRoles: ['admin', 'direction', 'armement', 'capitaine', 'marin'] },
  { key: 'kpi', label: 'KPI', family: 'Accueil', allowedRoles: ['admin', 'direction', 'armement', 'capitaine', 'marin'] },
  { key: 'qhse', label: 'QHSE', family: 'QHSE', allowedRoles: ['admin', 'direction', 'armement', 'capitaine', 'marin'] },
  { key: 'certificates', label: 'Certificats flotte', family: 'QHSE', allowedRoles: ['admin', 'direction', 'armement', 'capitaine', 'marin'] },
  { key: 'procedures', label: 'Procedures QHSE', family: 'QHSE', allowedRoles: ['admin', 'direction', 'armement', 'capitaine', 'marin'] },
  { key: 'actionPlan', label: "Plan d'action", family: 'QHSE', allowedRoles: ['admin', 'direction', 'armement', 'capitaine', 'marin'] },
  { key: 'dpr', label: 'Daily Progress Report', family: 'Operations', allowedRoles: ['admin', 'direction', 'armement', 'capitaine', 'marin'] },
  { key: 'purchaseRequests', label: "Demandes d'achat", family: 'Achats', allowedRoles: ['admin', 'direction', 'armement', 'capitaine', 'marin'] },
  { key: 'planning', label: 'Planning', family: 'Planning', allowedRoles: ['admin', 'direction', 'armement', 'capitaine', 'marin'] },
  { key: 'humanResources', label: 'RH', family: 'RH', allowedRoles: ['admin', 'direction', 'armement', 'capitaine', 'marin'] },
  { key: 'projects', label: 'Projets', family: 'Operations', allowedRoles: ['admin', 'direction'] },
  { key: 'admin', label: 'Administration', family: 'Administration', allowedRoles: ['admin'] },
];

export function canAccessModule(roles: RoleKey[], moduleKey: ModuleKey): boolean {
  const module = APP_MODULES.find((item) => item.key === moduleKey);

  if (!module) {
    return false;
  }

  return module.allowedRoles.some((role) => roles.includes(role));
}

export function getVisibleModules(roles: RoleKey[]): AppModule[] {
  return APP_MODULES.filter((module) => canAccessModule(roles, module.key));
}
