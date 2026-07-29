# SeaPilot key page dependency trees

## `/modules/projects` — Projects

Entry: `src/features/projects/ProjectsPage.tsx`

Dependencies:

- `src/features/projects/ProjectsPage.tsx`
  - `src/features/projects/ProjectEditors.tsx`
    - `src/features/projects/projectMutations.ts`
    - `src/features/projects/projectPorts.ts`
    - `src/features/projects/projectQueries.ts`
    - `src/features/projects/projectReadModel.ts`
  - `src/features/projects/projectDocumentTypes.ts`
  - `src/features/projects/projectMutations.ts`
  - `src/features/projects/projectDocuments.ts`
  - `src/features/projects/projectQueries.ts`
  - `src/features/projects/projectReadModel.ts`
  - dynamic: `src/features/projects/projectDocumentGeneration.ts`
  - dynamic: `src/features/projects/projectDocumentStorage.ts`
  - `src/features/shell/AppShell.tsx`
    - `src/config/appVersion.ts`
    - `src/features/permissions/moduleAccess.ts`
    - `src/features/permissions/navigationPermissions.ts`
    - `src/features/permissions/roles.ts`
- `src/styles/index.css`
- `src/App.tsx`

Actual desktop render branch:

- Page render starts at approximately `ProjectsPage.tsx:823`.
- Supporting detail/tab components are approximately lines 160-570.
- Because the file exceeds 900 lines, pass those ranges rather than the whole file.

Current structure:

- Module header and five summary metrics.
- Dense multi-field filter panel.
- Flat manager action toolbar.
- Two-column master/detail area:
  - left: project portfolio list with operations;
  - right: selected project detail with six tabs.
- Modal editors for client, project, and planning occurrence.

## `/modules/planning` — Planning

Entry: `src/features/planning/PlanningPage.tsx`

Visual dependencies relevant to this redesign:

- `src/features/planning/PlanningPage.tsx`
  - `src/features/planning/PlanningTimeline.tsx`
  - `src/features/planning/PlanningControlSummary.tsx`
  - `src/features/planning/PlanningPublicationPanel.tsx`
  - `src/features/planning/PlanningP03Panels.tsx`
  - `src/features/planning/PlanningP11Panel.tsx`
  - `src/features/planning/PlanningVisitsPanel.tsx`
  - `src/features/shell/AppShell.tsx`
- `src/styles/index.css`

Actual ribbon:

- Component definitions: `PlanningPage.tsx:243:273`.
- Rendered ribbon groups and commands: `PlanningPage.tsx:2019:2050`.
- Styling: `src/styles/index.css:14099:14310`.
- Groups: Armement, Gestion des congés, Aide à la décision, Documents.

## `/` — Home/module landing

Entry: `src/features/modules/ModulePage.tsx`

Dependencies:

- `src/features/modules/ModulePage.tsx`
- `src/features/permissions/moduleAccess.ts`
- `src/features/shell/AppShell.tsx`
- `src/styles/index.css`

## Shared shell

Entry: `src/features/shell/AppShell.tsx`

Dependencies:

- `src/config/appVersion.ts`
- `src/features/auth/AuthProvider.tsx`
- `src/features/permissions/moduleAccess.ts`
- `src/features/permissions/navigationPermissions.ts`
- `src/features/permissions/roles.ts`
- `src/features/profiles/profileQueries.ts`
- `src/lib/supabaseClient.ts`
- `src/styles/index.css`
