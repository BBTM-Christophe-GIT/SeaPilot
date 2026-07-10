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
  | 'workingTime'
  | 'projects'
  | 'marad'
  | 'technicalDocuments'
  | 'lifting'
  | 'admin';

export type ModuleFamily =
  | 'Accueil'
  | 'QHSE'
  | 'Opérations'
  | 'Achats'
  | 'Planning'
  | 'Ressources Humaines'
  | 'Maintenance'
  | 'Levage'
  | 'Administration';

export interface AppModule {
  key: ModuleKey;
  label: string;
  family: ModuleFamily;
  navigationKind: 'direct' | 'submenu' | 'hidden';
  allowedRoles: RoleKey[];
}

const ALL_ROLES: RoleKey[] = ['admin', 'direction', 'armement', 'capitaine', 'marin'];

export const APP_MODULES: AppModule[] = [
  { key: 'home', label: 'Accueil', family: 'Accueil', navigationKind: 'direct', allowedRoles: ALL_ROLES },
  { key: 'kpi', label: 'KPI', family: 'QHSE', navigationKind: 'submenu', allowedRoles: ALL_ROLES },
  {
    key: 'certificates',
    label: 'Certificats flotte',
    family: 'QHSE',
    navigationKind: 'submenu',
    allowedRoles: ALL_ROLES,
  },
  {
    key: 'procedures',
    label: 'Procédures QHSE',
    family: 'QHSE',
    navigationKind: 'submenu',
    allowedRoles: ALL_ROLES,
  },
  {
    key: 'actionPlan',
    label: "Plan d'Action",
    family: 'QHSE',
    navigationKind: 'submenu',
    allowedRoles: ALL_ROLES,
  },
  {
    key: 'qhse',
    label: 'QHSE documentaire',
    family: 'QHSE',
    navigationKind: 'hidden',
    allowedRoles: ALL_ROLES,
  },
  {
    key: 'dpr',
    label: 'Daily Progress Report',
    family: 'Opérations',
    navigationKind: 'submenu',
    allowedRoles: ALL_ROLES,
  },
  {
    key: 'projects',
    label: 'Projets',
    family: 'Opérations',
    navigationKind: 'submenu',
    allowedRoles: ['admin', 'direction'],
  },
  {
    key: 'purchaseRequests',
    label: "Demande d'Achat",
    family: 'Achats',
    navigationKind: 'submenu',
    allowedRoles: ALL_ROLES,
  },
  { key: 'planning', label: 'Planning', family: 'Planning', navigationKind: 'direct', allowedRoles: ALL_ROLES },
  {
    key: 'humanResources',
    label: 'RH / Brevets',
    family: 'Ressources Humaines',
    navigationKind: 'submenu',
    allowedRoles: ALL_ROLES,
  },
  {
    key: 'workingTime',
    label: 'Suivi du Temps de travail',
    family: 'Ressources Humaines',
    navigationKind: 'submenu',
    allowedRoles: ALL_ROLES,
  },
  {
    key: 'marad',
    label: 'Marad',
    family: 'Maintenance',
    navigationKind: 'submenu',
    allowedRoles: ALL_ROLES,
  },
  {
    key: 'technicalDocuments',
    label: 'Documents Techniques',
    family: 'Maintenance',
    navigationKind: 'submenu',
    allowedRoles: ALL_ROLES,
  },
  { key: 'lifting', label: 'Levage', family: 'Levage', navigationKind: 'direct', allowedRoles: ALL_ROLES },
  {
    key: 'admin',
    label: 'Administration',
    family: 'Administration',
    navigationKind: 'direct',
    allowedRoles: ['admin'],
  },
];

export const NAVIGATION_MODULES = APP_MODULES.filter((module) => module.navigationKind !== 'hidden');

export function canAccessModule(roles: RoleKey[], moduleKey: ModuleKey): boolean {
  const module = APP_MODULES.find((item) => item.key === moduleKey);

  if (!module) {
    return false;
  }

  return module.allowedRoles.some((role) => roles.includes(role));
}

export function getVisibleModules(roles: RoleKey[]): AppModule[] {
  return NAVIGATION_MODULES.filter((module) => canAccessModule(roles, module.key));
}
