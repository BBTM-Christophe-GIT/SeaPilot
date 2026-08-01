import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BarChart3,
  Bell,
  BookOpenCheck,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  ClipboardCheck,
  Construction,
  FileCheck2,
  FileText,
  FolderKanban,
  Gauge,
  Home,
  Eye,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { APP_BUILD_VERSION, APP_VERSION_LABEL } from '../../config/appVersion';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../auth/AuthProvider';
import { APP_MODULES, type AppModule, type ModuleKey } from '../permissions/moduleAccess';
import { fetchVisibleModulesForRoles, getDefaultVisibleModules } from '../permissions/navigationPermissions';
import { ROLE_KEYS, ROLE_LABELS, type RoleKey } from '../permissions/roles';
import { fetchCurrentPersonSummary, fetchCurrentUserRoles, type CurrentPersonSummary } from '../profiles/profileQueries';

interface AppShellProps {
  rolesOverride?: RoleKey[];
  client?: SupabaseClient;
  previewMode?: boolean;
}

export interface AppShellOutletContext {
  roles: RoleKey[];
  client: SupabaseClient;
  previewMode: boolean;
  currentPerson: CurrentPersonSummary | null;
}

type AdminProfileView = 'actual' | RoleKey;

const NAVIGATION_FAMILIES: AppModule['family'][] = [
  'Accueil',
  'QHSE',
  'Opérations',
  'Achats',
  'Planning',
  'Ressources Humaines',
  'Maintenance',
  'Levage',
  'Administration',
];

const FAMILY_ICONS: Record<AppModule['family'], LucideIcon> = {
  Accueil: Home,
  QHSE: ShieldCheck,
  Opérations: Gauge,
  Achats: ShoppingCart,
  Planning: CalendarDays,
  'Ressources Humaines': Users,
  Maintenance: Wrench,
  Levage: Construction,
  Administration: Settings,
};

const FAMILY_THEME_KEYS: Record<AppModule['family'], string> = {
  Accueil: 'home',
  QHSE: 'qhse',
  Opérations: 'operations',
  Achats: 'purchasing',
  Planning: 'planning',
  'Ressources Humaines': 'human-resources',
  Maintenance: 'maintenance',
  Levage: 'lifting',
  Administration: 'administration',
};

const MODULE_ICONS: Record<ModuleKey, LucideIcon> = {
  home: LayoutDashboard,
  kpi: BarChart3,
  qhse: ShieldCheck,
  certificates: FileCheck2,
  procedures: FileText,
  actionPlan: ClipboardCheck,
  dpr: Gauge,
  purchaseRequests: ShoppingCart,
  planning: CalendarDays,
  humanResources: Users,
  workingTime: Clock3,
  projects: FolderKanban,
  marad: Wrench,
  technicalDocuments: BookOpenCheck,
  lifting: Construction,
  admin: Settings,
};

function getRequestedModule(pathname: string) {
  const normalizedPathname = pathname.replace(/\/+$/, '');
  const [, section, moduleKey] = normalizedPathname.split('/');

  if (!section && !moduleKey) {
    return APP_MODULES.find((module) => module.key === 'home');
  }

  if (section !== 'modules' || !moduleKey) {
    return undefined;
  }

  return APP_MODULES.find((module) => module.key.toLowerCase() === moduleKey.toLowerCase());
}

function getInitials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return 'SP';
  }

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');
}

export function AppShell({ rolesOverride, client = supabase, previewMode = false }: AppShellProps) {
  const { session, signOut } = useAuth();
  const location = useLocation();
  const sessionUserId = session?.user.id;
  const [roles, setRoles] = useState<RoleKey[]>(rolesOverride || []);
  const [visibleModules, setVisibleModules] = useState<AppModule[]>(
    rolesOverride ? getDefaultVisibleModules(rolesOverride) : [],
  );
  const [isLoadingRoles, setIsLoadingRoles] = useState(!rolesOverride);
  const [hasRoleLoadError, setHasRoleLoadError] = useState(false);
  const [currentPerson, setCurrentPerson] = useState<CurrentPersonSummary | null>(null);
  const [isLoadingPerson, setIsLoadingPerson] = useState(!rolesOverride);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [adminProfileView, setAdminProfileView] = useState<AdminProfileView>('actual');
  const [adminProfileModules, setAdminProfileModules] = useState<AppModule[] | null>(null);
  const [expandedFamilies, setExpandedFamilies] = useState<Set<AppModule['family']>>(
    () => new Set(NAVIGATION_FAMILIES),
  );

  useEffect(() => {
    if (rolesOverride) {
      setRoles(rolesOverride);
      setVisibleModules(getDefaultVisibleModules(rolesOverride));
      setIsLoadingRoles(false);
      setHasRoleLoadError(false);
      return;
    }

    if (!sessionUserId) {
      setRoles([]);
      setVisibleModules([]);
      setIsLoadingRoles(true);
      setHasRoleLoadError(false);
      return;
    }

    let isMounted = true;

    setRoles([]);
    setVisibleModules([]);
    setIsLoadingRoles(true);
    setHasRoleLoadError(false);

    fetchCurrentUserRoles(client)
      .then(async (loadedRoles) => {
        const loadedVisibleModules = await fetchVisibleModulesForRoles(client, loadedRoles);

        if (isMounted) {
          setRoles(loadedRoles);
          setVisibleModules(loadedVisibleModules);
          setHasRoleLoadError(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setRoles([]);
          setVisibleModules([]);
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

  useEffect(() => {
    if (rolesOverride || !sessionUserId) {
      setCurrentPerson(null);
      setIsLoadingPerson(false);
      return;
    }
    let isMounted = true;
    setIsLoadingPerson(true);
    fetchCurrentPersonSummary(client)
      .then((person) => { if (isMounted) setCurrentPerson(person); })
      .catch(() => { if (isMounted) setCurrentPerson(null); })
      .finally(() => { if (isMounted) setIsLoadingPerson(false); });
    return () => { isMounted = false; };
  }, [client, rolesOverride, sessionUserId]);

  const isActualAdmin = roles.includes('admin');
  const simulatedRole = isActualAdmin && adminProfileView !== 'actual' ? adminProfileView : null;
  const effectiveRoles: RoleKey[] = simulatedRole ? [simulatedRole] : roles;

  useEffect(() => {
    if (!isActualAdmin) {
      setAdminProfileView('actual');
      setAdminProfileModules(null);
      return;
    }

    if (!simulatedRole) {
      setAdminProfileModules(null);
      return;
    }

    const fallbackModules = getDefaultVisibleModules([simulatedRole]);
    setAdminProfileModules(fallbackModules);
    if (rolesOverride) return;

    let isMounted = true;
    fetchVisibleModulesForRoles(client, [simulatedRole])
      .then((modules) => { if (isMounted) setAdminProfileModules(modules); })
      .catch(() => { if (isMounted) setAdminProfileModules(fallbackModules); });

    return () => { isMounted = false; };
  }, [client, isActualAdmin, rolesOverride, simulatedRole]);

  useEffect(() => {
    setIsMobileNavigationOpen(false);
    setIsUserMenuOpen(false);
  }, [location.pathname]);

  const requestedModule = getRequestedModule(location.pathname);
  const roleVisibleModules = simulatedRole ? adminProfileModules || getDefaultVisibleModules([simulatedRole]) : visibleModules;
  const isMarinOnly = effectiveRoles.includes('marin')
    && !effectiveRoles.some((role) => role === 'admin' || role === 'direction' || role === 'armement' || role === 'capitaine');
  const currentFunction = `${currentPerson?.functionLabel || ''} ${currentPerson?.gradeLabel || ''}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR');
  const isSecondCaptain = currentFunction.includes('2nd capitaine') || currentFunction.includes('second capitaine');
  const activeVisibleModules = isMarinOnly && !isSecondCaptain
    ? roleVisibleModules.filter((module) => module.key !== 'dpr')
    : roleVisibleModules;
  const isRequestedModuleDenied = requestedModule
    ? !activeVisibleModules.some((module) => module.key === requestedModule.key)
    : false;
  const groupedModules = useMemo(
    () =>
      NAVIGATION_FAMILIES.map((family) => ({
        family,
        modules: activeVisibleModules.filter(
          (module) => module.family === family && module.navigationKind !== 'hidden',
        ),
      })).filter((group) => group.modules.length > 0),
    [activeVisibleModules],
  );
  const userMetadata = (session?.user.user_metadata || {}) as Record<string, unknown>;
  const userEmail = previewMode ? 'preview@seapilot.local' : session?.user.email || 'utilisateur@bbtm.fr';
  const sessionDisplayName = [userMetadata.full_name, userMetadata.display_name, userMetadata.name].find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );
  const userDisplayName = previewMode
    ? 'Préversion SeaPilot'
    : sessionDisplayName || userEmail.split('@')[0] || 'Utilisateur';
  const primaryRole = ROLE_KEYS.find((role) => effectiveRoles.includes(role));
  const primaryRoleLabel = primaryRole ? ROLE_LABELS[primaryRole] : 'Utilisateur';

  function toggleFamily(family: AppModule['family']) {
    setExpandedFamilies((currentFamilies) => {
      const nextFamilies = new Set(currentFamilies);

      if (nextFamilies.has(family)) {
        nextFamilies.delete(family);
      } else {
        nextFamilies.add(family);
      }

      return nextFamilies;
    });
  }

  if (isLoadingRoles || isLoadingPerson) {
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

  if (activeVisibleModules.length === 0) {
    return <div className="auth-loading">Aucun module autorise pour ce compte.</div>;
  }

  return (
    <div className={`app-shell${isSidebarCollapsed ? ' sidebar-is-collapsed' : ''}`}>
      <button
        aria-label="Fermer la navigation"
        className={`sidebar-backdrop${isMobileNavigationOpen ? ' is-visible' : ''}`}
        onClick={() => setIsMobileNavigationOpen(false)}
        type="button"
      />
      <aside className={`sidebar${isMobileNavigationOpen ? ' is-mobile-open' : ''}`}>
        <div className="brand-block">
          <img alt="BBTM" className="brand-logo" src="/bbtm-logo.png" />
          <span className="brand-name">SeaPilot</span>
          <button
            aria-label="Fermer le menu"
            className="sidebar-mobile-close"
            onClick={() => setIsMobileNavigationOpen(false)}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>

        <nav aria-label="Navigation principale" className="sidebar-navigation">
          {groupedModules.map(({ family, modules }) => {
            const FamilyIcon = FAMILY_ICONS[family];
            const isExpanded = expandedFamilies.has(family);
            const directModule =
              modules.length === 1 && modules[0]?.navigationKind === 'direct' ? modules[0] : undefined;

            if (directModule) {
              return (
                <section
                  className="navigation-family navigation-direct-family"
                  data-family-theme={FAMILY_THEME_KEYS[family]}
                  key={family}
                >
                  <NavLink
                    aria-label={directModule.label}
                    className="navigation-direct-link"
                    end={directModule.key === 'home'}
                    title={directModule.label}
                    to={directModule.key === 'home' ? '/' : `/modules/${directModule.key}`}
                  >
                    <span className="navigation-icon-tile">
                      <FamilyIcon aria-hidden="true" size={20} />
                    </span>
                    <span className="navigation-link-label">{directModule.label}</span>
                    <ChevronRight aria-hidden="true" className="navigation-direct-chevron" size={17} />
                  </NavLink>
                </section>
              );
            }

            return (
              <section className="navigation-family" data-family-theme={FAMILY_THEME_KEYS[family]} key={family}>
                <button
                  aria-expanded={isExpanded}
                  className="navigation-family-button"
                  onClick={() => toggleFamily(family)}
                  title={family}
                  type="button"
                >
                  <span className="navigation-icon-tile">
                    <FamilyIcon aria-hidden="true" size={20} />
                  </span>
                  <span className="navigation-label">{family}</span>
                  {isExpanded ? (
                    <ChevronUp aria-hidden="true" className="navigation-chevron" size={15} />
                  ) : (
                    <ChevronDown aria-hidden="true" className="navigation-chevron" size={15} />
                  )}
                </button>
                {isExpanded ? (
                  <div className="navigation-family-links">
                    {modules.map((module) => {
                      const ModuleIcon = MODULE_ICONS[module.key];

                      return (
                        <NavLink
                          aria-label={module.label}
                          key={module.key}
                          title={module.label}
                          to={module.key === 'home' ? '/' : `/modules/${module.key}`}
                        >
                          <span aria-hidden="true" className="navigation-submenu-bullet" />
                          <ModuleIcon aria-hidden="true" size={16} />
                          <span className="navigation-link-label">{module.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="app-version" title={`Build ${APP_BUILD_VERSION}`}>
            <span>Version</span>
            <strong>{APP_VERSION_LABEL}</strong>
          </div>
          <button
            aria-label={isSidebarCollapsed ? 'Agrandir le menu' : 'Réduire le menu'}
            className="sidebar-collapse-button"
            onClick={() => setIsSidebarCollapsed((isCollapsed) => !isCollapsed)}
            type="button"
          >
            {isSidebarCollapsed ? (
              <ChevronRight aria-hidden="true" size={17} />
            ) : (
              <ChevronLeft aria-hidden="true" size={17} />
            )}
            <span>{isSidebarCollapsed ? 'Agrandir' : 'Réduire le menu'}</span>
          </button>
        </div>
      </aside>

      <div className="content-shell">
        <header className="topbar">
          <div className="topbar-context">
            <button
              aria-label="Ouvrir la navigation"
              className="topbar-menu-button"
              onClick={() => setIsMobileNavigationOpen(true)}
              type="button"
            >
              <Menu aria-hidden="true" size={20} />
            </button>
            <span>{requestedModule?.family || 'SeaPilot'}</span>
            <ChevronRight aria-hidden="true" size={16} />
            <strong>{requestedModule?.label || 'Accueil'}</strong>
            {previewMode ? <span className="preview-mode-badge">Préversion · données de démonstration</span> : null}
            {simulatedRole ? <span className="admin-profile-view-badge"><Eye aria-hidden="true" size={14}/> Vue {ROLE_LABELS[simulatedRole]}</span> : null}
          </div>

          <div className="topbar-actions">
            {isActualAdmin ? <label className="admin-profile-view-selector"><span>Vue</span><select aria-label="Vue de profil" value={adminProfileView} onChange={(event) => setAdminProfileView(event.target.value as AdminProfileView)}><option value="actual">Réelle</option>{ROLE_KEYS.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></label> : null}
            <button aria-label="Notifications" className="topbar-icon-button" type="button">
              <Bell aria-hidden="true" size={19} />
            </button>
            <div className="user-menu">
              <button
                aria-expanded={isUserMenuOpen}
                aria-haspopup="menu"
                className="user-menu-trigger"
                onClick={() => setIsUserMenuOpen((isOpen) => !isOpen)}
                type="button"
              >
                <span className="user-avatar">{getInitials(userDisplayName)}</span>
                <span className="user-identity">
                  <strong>{userDisplayName}</strong>
                  <small>{primaryRoleLabel}</small>
                </span>
                <ChevronDown aria-hidden="true" size={15} />
              </button>
              {isUserMenuOpen ? (
                <div className="user-menu-popover" role="menu">
                  <span>{userEmail}</span>
                  {simulatedRole ? <span className="admin-profile-view-note">Simulation visuelle {ROLE_LABELS[simulatedRole]}. Vos droits administrateur réels restent inchangés.</span> : null}
                  {previewMode ? (
                    <span className="preview-mode-menu-note">Aucune donnée de production n’est utilisée.</span>
                  ) : (
                    <button onClick={() => void signOut()} role="menuitem" type="button">
                      <LogOut aria-hidden="true" size={16} />
                      Deconnexion
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="content-area">
          {isRequestedModuleDenied ? (
            <div className="auth-loading">Acces refuse pour ce module.</div>
          ) : (
            <Outlet context={{ roles: effectiveRoles, client, previewMode, currentPerson } satisfies AppShellOutletContext} />
          )}
        </main>
      </div>
    </div>
  );
}
