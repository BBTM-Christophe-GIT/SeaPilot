# SeaPilot shared layouts

## AppShell

- Source: `src/features/shell/AppShell.tsx`
- Description: persistent desktop/mobile application shell with collapsible navy sidebar, grouped module navigation, white top bar, user menu, version label, and routed content outlet.
- Full canonical source: `src/features/shell/AppShell.tsx` (449 lines).
- The rendered branch is the `return` starting around line 262. The excerpt below is the complete structural shell used by the Projects and Planning routes; data-loading and role-fetching logic is intentionally omitted from this discovery summary.

```tsx
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
      </div>
      <nav aria-label="Navigation principale" className="sidebar-navigation">
        {groupedModules.map(({ family, modules }) => (
          <section className="navigation-family" data-family-theme={FAMILY_THEME_KEYS[family]} key={family}>
            {/* Direct links or expandable family links; canonical implementation is in AppShell.tsx. */}
          </section>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="app-version" title={`Build ${APP_BUILD_VERSION}`}>
          <span>Version</span>
          <strong>{APP_VERSION_LABEL}</strong>
        </div>
      </div>
    </aside>
    <div className="content-shell">
      <header className="topbar">
        <div className="topbar-context">
          <span>{requestedModule?.family || 'SeaPilot'}</span>
          <ChevronRight aria-hidden="true" size={16} />
          <strong>{requestedModule?.label || 'Accueil'}</strong>
        </div>
        <div className="topbar-actions">{/* notifications and user menu */}</div>
      </header>
      <main className="content-area">
        {isRequestedModuleDenied ? (
          <div className="auth-loading">Accès refusé pour ce module.</div>
        ) : (
          <Outlet context={{ roles, client, previewMode } satisfies AppShellOutletContext} />
        )}
      </main>
    </div>
  </div>
);
```

## Layout invariants

- Desktop sidebar width: 286px; collapsed width: 82px.
- Top bar remains above feature content.
- Feature pages render inside `.content-area`.
- Projects route: `/modules/projects`; Planning route: `/modules/planning`.
- The Projects redesign must not duplicate global navigation; its new command ribbon belongs inside the Projects feature page under the module header.
