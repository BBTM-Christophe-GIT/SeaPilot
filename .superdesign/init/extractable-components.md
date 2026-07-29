# Superdesign extractable components

## AppShell

- Source: `src/features/shell/AppShell.tsx`
- Category: layout
- Description: Global SeaPilot shell with collapsible sidebar, grouped module navigation, topbar, user identity, and routed content.
- Extractable props: `activeItem` (string, default `"projects"`), `isExpanded` (boolean, default `true`), `showNotification` (boolean, default `true`).
- Hardcoded: BBTM logo path, SeaPilot brand, family labels, Lucide icon identities, CSS colors and structure.

## PlanningRibbon

- Source: `src/features/planning/PlanningPage.tsx`
- Category: basic
- Description: Grouped command ribbon used as the organizational reference for the Projects redesign.
- Extractable props: `showBadges` (boolean, default `true`), `badgeCount` (number, default `3`).
- Hardcoded: group headings, representative command labels, Lucide icon identities, ribbon spacing and separators.

## ProjectDetailTabs

- Source: `src/features/projects/ProjectsPage.tsx`
- Category: basic
- Description: Six-section tab navigation for the selected project.
- Extractable props: `activeItem` (string, default `"contract"`).
- Hardcoded: tab labels, order, keyboard behavior, CSS classes.
