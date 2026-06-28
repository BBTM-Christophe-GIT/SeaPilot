import type { SupabaseClient } from '@supabase/supabase-js';
import { LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../auth/AuthProvider';
import { getVisibleModules } from '../permissions/moduleAccess';
import type { RoleKey } from '../permissions/roles';
import { fetchCurrentUserRoles } from '../profiles/profileQueries';

interface AppShellProps {
  rolesOverride?: RoleKey[];
  client?: SupabaseClient;
}

export function AppShell({ rolesOverride, client = supabase }: AppShellProps) {
  const { signOut } = useAuth();
  const [roles, setRoles] = useState<RoleKey[]>(rolesOverride || []);
  const [isLoadingRoles, setIsLoadingRoles] = useState(!rolesOverride);

  useEffect(() => {
    if (rolesOverride) {
      setRoles(rolesOverride);
      setIsLoadingRoles(false);
      return;
    }

    let isMounted = true;

    fetchCurrentUserRoles(client)
      .then((loadedRoles) => {
        if (isMounted) {
          setRoles(loadedRoles);
        }
      })
      .catch(() => {
        if (isMounted) {
          setRoles([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingRoles(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [client, rolesOverride]);

  const visibleModules = getVisibleModules(roles);

  if (isLoadingRoles) {
    return <div className="auth-loading">Chargement des droits...</div>;
  }

  if (visibleModules.length === 0) {
    return <div className="auth-loading">Aucun module autorise pour ce compte.</div>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <strong>BBTM</strong>
          <span>SeaPilot</span>
        </div>
        <nav aria-label="Navigation principale">
          {visibleModules.map((module) => (
            <NavLink key={module.key} to={module.key === 'home' ? '/' : `/modules/${module.key}`}>
              {module.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="content-shell">
        <header className="topbar">
          <span>app.bbtm.fr</span>
          <button onClick={() => void signOut()} type="button">
            <LogOut aria-hidden="true" size={16} />
            Deconnexion
          </button>
        </header>
        <main className="content-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
