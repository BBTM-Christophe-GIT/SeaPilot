import type { SupabaseClient } from '@supabase/supabase-js';
import { Database, PanelLeft, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { NAVIGATION_MODULES, type ModuleKey } from '../permissions/moduleAccess';
import {
  fetchNavigationPermissions,
  setNavigationPermission,
  type NavigationPermission,
} from '../permissions/navigationPermissions';
import { ROLE_KEYS, ROLE_LABELS, type RoleKey } from '../permissions/roles';
import {
  assignUserRole,
  fetchAdminUsers,
  fetchSharePointImportSources,
  removeUserRole,
  type AdminUser,
  type SharePointImportSource,
} from './adminQueries';
import { InviteUserDialog } from './InviteUserDialog';

interface AdminPageProps {
  client?: SupabaseClient;
}

function sortRoles(roles: RoleKey[]): RoleKey[] {
  return ROLE_KEYS.filter((role) => roles.includes(role));
}

function updateUserRoles(users: AdminUser[], userId: string, role: RoleKey, checked: boolean): AdminUser[] {
  return users.map((user) => {
    if (user.id !== userId) {
      return user;
    }

    const nextRoles = checked
      ? sortRoles(Array.from(new Set([...user.roles, role])))
      : user.roles.filter((existingRole) => existingRole !== role);

    return {
      ...user,
      roles: nextRoles,
    };
  });
}

function updateNavigationPermissions(
  permissions: NavigationPermission[],
  roleKey: RoleKey,
  moduleKey: ModuleKey,
  isVisible: boolean,
): NavigationPermission[] {
  return permissions.map((permission) =>
    permission.roleKey === roleKey && permission.moduleKey === moduleKey
      ? { ...permission, isVisible }
      : permission,
  );
}

export function AdminPage({ client = supabase }: AdminPageProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [importSources, setImportSources] = useState<SharePointImportSource[]>([]);
  const [navigationPermissions, setNavigationPermissions] = useState<NavigationPermission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingRoleKey, setSavingRoleKey] = useState<string | null>(null);
  const [savingNavigationKey, setSavingNavigationKey] = useState<string | null>(null);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    setErrorMessage(null);

    Promise.all([fetchAdminUsers(client), fetchSharePointImportSources(client), fetchNavigationPermissions(client)])
      .then(([loadedUsers, loadedImportSources, loadedNavigationPermissions]) => {
        if (isMounted) {
          setUsers(loadedUsers);
          setImportSources(loadedImportSources);
          setNavigationPermissions(loadedNavigationPermissions);
        }
      })
      .catch(() => {
        if (isMounted) {
          setErrorMessage("Impossible de charger les utilisateurs.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [client]);

  async function handleRoleChange(userId: string, role: RoleKey, checked: boolean) {
    const operationKey = `${userId}:${role}`;

    setSavingRoleKey(operationKey);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      if (checked) {
        await assignUserRole(client, userId, role);
      } else {
        await removeUserRole(client, userId, role);
      }

      setUsers((currentUsers) => updateUserRoles(currentUsers, userId, role, checked));
      setStatusMessage("Role mis a jour.");
    } catch {
      setErrorMessage("Impossible de modifier ce role.");
    } finally {
      setSavingRoleKey(null);
    }
  }

  async function handleNavigationPermissionChange(roleKey: RoleKey, moduleKey: ModuleKey, isVisible: boolean) {
    const operationKey = `${roleKey}:${moduleKey}`;

    setSavingNavigationKey(operationKey);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      await setNavigationPermission(client, roleKey, moduleKey, isVisible);
      setNavigationPermissions((currentPermissions) =>
        updateNavigationPermissions(currentPermissions, roleKey, moduleKey, isVisible),
      );
      setStatusMessage('Acces de navigation mis a jour.');
    } catch {
      setErrorMessage("Impossible de modifier cet acces de navigation.");
    } finally {
      setSavingNavigationKey(null);
    }
  }

  async function handleUserInvited() {
    setIsInviteDialogOpen(false);
    setStatusMessage("Invitation envoyée. L'utilisateur doit maintenant activer son compte depuis l'email reçu.");

    try {
      const loadedUsers = await fetchAdminUsers(client);
      setUsers(loadedUsers);
    } catch {
      setErrorMessage("L'invitation a bien été envoyée, mais la liste des utilisateurs n'a pas pu être actualisée.");
    }
  }

  if (isLoading) {
    return <div className="admin-state">Chargement des utilisateurs...</div>;
  }

  return (
    <section className="admin-page">
      <div className="admin-header">
        <div>
          <p className="module-family">Administration</p>
          <h1>Gestion des utilisateurs</h1>
        </div>
        <div className="admin-header-actions">
          <div className="admin-summary" aria-label="Nombre d'utilisateurs">
            <Users aria-hidden="true" size={18} />
            <strong>{users.length}</strong>
          </div>
          <button className="admin-primary-button" onClick={() => setIsInviteDialogOpen(true)} type="button">
            <UserPlus aria-hidden="true" size={18} />
            Inviter un utilisateur
          </button>
        </div>
      </div>

      <div className="admin-notices" aria-live="polite">
        {statusMessage ? <p className="admin-success">{statusMessage}</p> : null}
        {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      </div>

      {users.length === 0 ? (
        <div className="admin-state">Aucun profil utilisateur trouve.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Utilisateur</th>
                {ROLE_KEYS.map((role) => (
                  <th key={role} scope="col">
                    {ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <th scope="row">
                    <span className="admin-user-name">{user.displayName}</span>
                    <span className="admin-user-email">{user.email}</span>
                  </th>
                  {ROLE_KEYS.map((role) => {
                    const operationKey = `${user.id}:${role}`;
                    const isSaving = savingRoleKey === operationKey;

                    return (
                      <td key={role}>
                        <label className="role-toggle">
                          <input
                            aria-label={`${ROLE_LABELS[role]} pour ${user.email}`}
                            checked={user.roles.includes(role)}
                            disabled={savingRoleKey !== null}
                            onChange={(event) => void handleRoleChange(user.id, role, event.target.checked)}
                            type="checkbox"
                          />
                          <span aria-hidden="true">
                            <ShieldCheck size={16} />
                          </span>
                          {isSaving ? <em>...</em> : null}
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="admin-navigation-access" aria-label="Acces de navigation par role">
        <div className="admin-header admin-section-header">
          <div>
            <p className="module-family">Navigation</p>
            <h2>Acces aux menus par role</h2>
            <p className="admin-section-description">
              Ces regles pilotent les menus visibles et bloquent aussi les acces directs aux modules.
            </p>
          </div>
          <div className="admin-summary" aria-label="Modules configurables">
            <PanelLeft aria-hidden="true" size={18} />
            <strong>{NAVIGATION_MODULES.length}</strong>
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table navigation-access-table">
            <thead>
              <tr>
                <th scope="col">Menu</th>
                {ROLE_KEYS.map((role) => (
                  <th key={role} scope="col">
                    {ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NAVIGATION_MODULES.map((module) => (
                <tr key={module.key}>
                  <th scope="row">
                    <span className="admin-user-name">{module.label}</span>
                    <span className="admin-user-email">{module.family}</span>
                  </th>
                  {ROLE_KEYS.map((role) => {
                    const operationKey = `${role}:${module.key}`;
                    const permission = navigationPermissions.find(
                      (candidate) => candidate.roleKey === role && candidate.moduleKey === module.key,
                    );

                    return (
                      <td key={role}>
                        <label className="role-toggle">
                          <input
                            aria-label={`${module.label} visible pour ${ROLE_LABELS[role]}`}
                            checked={permission?.isVisible || false}
                            disabled={savingNavigationKey !== null}
                            onChange={(event) =>
                              void handleNavigationPermissionChange(role, module.key, event.target.checked)
                            }
                            type="checkbox"
                          />
                          <span aria-hidden="true">
                            <ShieldCheck size={16} />
                          </span>
                          {savingNavigationKey === operationKey ? <em>...</em> : null}
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-import-monitor" aria-label="Suivi import SharePoint">
        <div className="admin-header admin-section-header">
          <div>
            <p className="module-family">Migration</p>
            <h2>Suivi import SharePoint</h2>
          </div>
          <div className="admin-summary" aria-label="Sources SharePoint">
            <Database aria-hidden="true" size={18} />
            <strong>{importSources.length}</strong>
          </div>
        </div>

        {importSources.length === 0 ? (
          <div className="admin-state">Aucune source SharePoint referencee.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Module</th>
                  <th scope="col">Type</th>
                  <th scope="col">Table cible</th>
                  <th scope="col">Priorite</th>
                  <th scope="col">Statut</th>
                </tr>
              </thead>
              <tbody>
                {importSources.map((source) => (
                  <tr key={source.key}>
                    <th scope="row">
                      <span className="admin-user-name">{source.title}</span>
                      <span className="admin-user-email">{source.key}</span>
                    </th>
                    <td>{source.moduleKey}</td>
                    <td>{source.sourceType}</td>
                    <td>{source.targetTable || '-'}</td>
                    <td>{`Priorite ${source.importPriority}`}</td>
                    <td>
                      <span className={source.confirmed ? 'admin-success-chip' : 'admin-warning-chip'}>
                        {source.confirmed ? 'Confirmee' : 'A confirmer'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isInviteDialogOpen ? (
        <InviteUserDialog
          client={client}
          onClose={() => setIsInviteDialogOpen(false)}
          onInvited={handleUserInvited}
        />
      ) : null}
    </section>
  );
}
