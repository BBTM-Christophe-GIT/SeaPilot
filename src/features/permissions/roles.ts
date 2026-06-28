export const ROLE_KEYS = ['admin', 'direction', 'armement', 'capitaine', 'marin'] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLE_LABELS: Record<RoleKey, string> = {
  admin: 'Admin',
  direction: 'Direction',
  armement: 'Armement',
  capitaine: 'Capitaine',
  marin: 'Marin',
};

export function hasRole(roles: RoleKey[], role: RoleKey): boolean {
  return roles.includes(role);
}
