import type { SupabaseClient } from '@supabase/supabase-js';
import { LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../auth/AuthProvider';
import { APP_MODULES, canAccessModule, getVisibleModules } from '../permissions/moduleAccess';
import type { RoleKey } from '../permissions/roles';
import { fetchCurrentUserRoles } from '../profiles/profileQueries';

interface AppShellProps {
  rolesOverride?: RoleKey[];
  client?: SupabaseClient;
}

export interface AppShellOutletContext {
  roles: RoleKey[];
  client: SupabaseClient;
}

function getRequestedModule(pathname: string) {
  const normalizedPathname = pathname.replace(/\/+$/, '');
  const [, section, moduleKey] = normalizedPathname.split('/');

  if (section !== 'modules' || !moduleKey) {
    return undefined;
  }

  return APP_MODULES.find((module) => module.key.toLowerCase() === moduleKey.toLowerCase());
}

export function AppShell({ rolesOverride, client = supabase }: AppShellProps) {
  const { session, signOut } = useAuth();
  const location = useLocation();
  const sessionUserId = session?.user.id;
  const [roles, setRoles] = useState<RoleKey[]>(rolesOverride || []);
  const [isLoadingRoles, setIsLoadingRoles] = useState(!rolesOverride);
  const [hasRoleLoadError, setHasRoleLoadError] = useState(false);

  useEffect(() => {
    if (rolesOverride) {
      setRoles(rolesOverride);
      setIsLoadingRoles(false);
      setHasRoleLoadError(false);
      return;
    }

    if (!sessionUserId) {
      setRoles([]);
      setIsLoadingRoles(true);
      setHasRoleLoadError(false);
      return;
    }

    let isMounted = true;

    setRoles([]);
    setIsLoadingRoles(true);
    setHasRoleLoadError(false);

    fetchCurrentUserRoles(client)
      .then((loadedRoles) => {
        if (isMounted) {
          setRoles(loadedRoles);
          setHasRoleLoadError(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setRoles([]);
          setHasRoleLoadError(true);
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
  }, [client, rolesOverride, sessionUserId]);

  const visibleModules = getVisibleModules(roles);
  const requestedModule = getRequestedModule(location.pathname);
  const isRequestedModuleDenied = requestedModule ? !canAccessModule(roles, requestedModule.key) : false;

  if (isLoadingRoles) {
    return <div className="auth-loading">Chargement des droits...</div>;
  }

  if (hasRoleLoadError) {
    return (
      <div className="auth-loading">
        <p>Impossible de charger vos droits d'acces.</p>
        <button onClick={() => void signOut()} type="button">
          <LogOut aria-hidden="true" size={16} />
          Deconnexion
        </button>
      </div>
    );
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
          {isRequestedModuleDenied ? (
            <div className="auth-loading">Acces refuse pour ce module.</div>
          ) : (
            <Outlet context={{ roles, client } satisfies AppShellOutletContext} />
          )}
        </main>
      </div>
    </div>
  );
}
