import { LogOut } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { getVisibleModules } from '../permissions/moduleAccess';
import type { RoleKey } from '../permissions/roles';

const INITIAL_DEMO_ROLES: RoleKey[] = ['admin'];

export function AppShell() {
  const { signOut } = useAuth();
  const visibleModules = getVisibleModules(INITIAL_DEMO_ROLES);

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
