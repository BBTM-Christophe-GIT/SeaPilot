import type { RoleKey } from '../permissions/roles';

export function canDownloadFleetCertificates(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => role === 'admin' || role === 'direction' || role === 'armement' || role === 'capitaine');
}
