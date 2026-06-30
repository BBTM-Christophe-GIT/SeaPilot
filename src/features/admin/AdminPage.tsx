import type { SupabaseClient } from '@supabase/supabase-js';
import { ShieldCheck, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { ROLE_KEYS, ROLE_LABELS, type RoleKey } from '../permissions/roles';
import { assignUserRole, fetchAdminUsers, removeUserRole, type AdminUser } from './adminQueries';

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

export function AdminPage({ client = supabase }: AdminPageProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingRoleKey, setSavingRoleKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    setErrorMessage(null);

    fetchAdminUsers(client)
      .then((loadedUsers) => {
        if (isMounted) {
          setUsers(loadedUsers);
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
        <div className="admin-summary" aria-label="Nombre d'utilisateurs">
          <Users aria-hidden="true" size={18} />
          <strong>{users.length}</strong>
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
    </section>
  );
}
