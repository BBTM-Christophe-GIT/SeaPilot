# SeaPilot Migration Design

Date: 2026-06-28

## Objective

Build a private internal web application for BBTM at `app.bbtm.fr`, based on the existing SharePoint/SPFx Dashboard project in `C:\CODEX\Dashboard`, with Supabase as the application database and authentication provider.

The existing public website remains on `www.bbtm.fr`. The new application is hosted separately on `app.bbtm.fr` so the public website and the internal operational tool can coexist without sharing routing, authentication, or deployment constraints.

## Current Context

The reference application is the Dashboard SPFx project located at `C:\CODEX\Dashboard`.

Relevant source material:

- `C:\CODEX\Dashboard\src\webparts\bbtmKpiDashboard`
- `C:\CODEX\Dashboard\docs\sharepoint-modules-inventory.md`
- `C:\CODEX\Dashboard\docs\superpowers\specs`
- `C:\CODEX\Dashboard\sharepoint\solution\spfx-kpi-dashboard-bbtm.sppkg`

The target repository is `C:\CODEX\SeaPilot`, intended to connect to `https://github.com/BBTM-Christophe-GIT/SeaPilot.git`.

The DNS for `bbtm.fr` and `www.bbtm.fr` currently points to an Apache host at `213.186.33.16`. The new application should use a separate DNS record for `app.bbtm.fr`.

## Domain And Hosting

The selected domain strategy is:

- Public website: `www.bbtm.fr`
- Internal application: `app.bbtm.fr`

`app.bbtm.fr` should point to the future application hosting provider. The public website must remain independent and should not be moved as part of this migration.

Recommended hosting direction:

- Host the application as a modern static/SPA or full-stack web application.
- Configure `app.bbtm.fr` as a dedicated custom domain.
- Keep Supabase as the only authentication and database backend in the first migration phase.

## Authentication

SeaPilot uses Supabase Auth with application-specific user accounts.

Initial login method:

- Email and password.

Access model:

- The application is private.
- Unauthenticated users cannot access application modules.
- After login, module access and data access are determined by role assignments and row-level access rules.

Microsoft 365 / SharePoint accounts are not used for SeaPilot login in the initial design.

## Roles

Roles are application roles stored in Supabase. A user can have more than one role at the same time.

Initial role set:

- `Admin`
- `Direction`
- `Armement`
- `Capitaine`
- `Marin`

Permissions from multiple roles are cumulative. If one role grants access to a module and another role grants a broader action, the user receives the combined allowed access, except where a stricter data boundary is explicitly required for personal data.

## Role Definitions

### Admin

Admin has full access.

Responsibilities and permissions:

- Manage users.
- Manage role assignments.
- Manage application settings.
- Read and modify all data.
- Access every module.
- Access administrative diagnostics and migration tools.

### Direction

Direction has global operational access.

Responsibilities and permissions:

- Read and modify global operational data.
- Access dashboards and cross-module reporting.
- Access all modules unless a future legal or confidentiality rule creates an explicit exception.

### Armement

Armement represents the office team responsible for operational fleet, crew, and planning management.

Responsibilities and permissions:

- Manage fleet-related operational data.
- Manage crew assignments and planning data.
- Access marins, capitaines, navires, and affectations needed for operations.
- Access modules linked to RH operational follow-up, planning, fleet, and operational monitoring.

Detailed module permissions for Armement remain to be finalized during module-by-module migration.

### Capitaine

Capitaine has dynamic access based on planning assignments.

Responsibilities and permissions:

- Can be assigned to different vessels over time.
- Sees and validates data related to the vessel, date range, and crew under their responsibility.
- The crew under a Capitaine is not fixed; it is determined by the planning.
- Validation rights depend on active or relevant historical planning assignments.

The Capitaine access perimeter must be calculated from planning records rather than stored as a static list of subordinate users.

### Marin

Marin has broad read-only operational visibility with strict RH privacy boundaries.

Responsibilities and permissions:

- In the RH module, a Marin can only see data linked to their own person record.
- A Marin has read-only access to all modules except Projects.
- A Marin has no access to the Projects module.
- Some data submitted by a Marin must enter a validation workflow handled by a Capitaine.

The exact list of data types requiring Capitaine validation will be defined during module-by-module migration.

## Module Scope

The existing Dashboard modules form the migration source:

- Accueil / KPI
- QHSE
- Certificats flotte
- Procedures QHSE
- Plan d'action
- Daily Progress Report
- Achats
- Planning
- RH
- Projets

Migration should be progressive. The first implementation should not attempt to port every module at once.

Recommended migration order:

1. Application shell, Supabase authentication, user profile, role model, protected routing.
2. Navigation and module access guards based on roles.
3. Core data model for users, people, vessels, planning assignments, and role-derived access.
4. RH and Planning foundations, because Capitaine and Marin access depend on these records.
5. Validation workflow for Marin-submitted data requiring Capitaine approval.
6. Remaining modules migrated one by one from Dashboard: DPR, QHSE, Certificats, Achats, Projets, KPI.

## Data Model Direction

Supabase Postgres is the system of record for SeaPilot.

Initial core tables should include:

- `profiles`: application profile linked to Supabase Auth users.
- `roles`: available application roles.
- `user_roles`: many-to-many assignment between users and roles.
- `people`: BBTM personnel records, linked to users when applicable.
- `vessels`: fleet records.
- `planning_assignments`: vessel, person, role/function, start date, end date, and planning context.
- `validation_requests`: workflow records for submissions that require Capitaine validation.

The database must support row-level security from the start.

Access principles:

- Admin and Direction can access broad data sets.
- Marin RH access is restricted to the `people` record linked to the current user.
- Capitaine access is computed through planning assignments that associate the Capitaine, vessel, period, and crew.
- Armement receives broad operational access for planning, fleet, and crew administration.

## SharePoint Migration Direction

The existing SharePoint/SPFx application remains the reference during migration.

Short-term:

- Use the Dashboard source code and documentation as functional references.
- Do not depend on SharePoint authentication for the new app.
- Do not deploy new functionality as SPFx for the SeaPilot target.

Medium-term:

- Recreate the required SharePoint list structures as Supabase tables.
- Define explicit mappings from SharePoint internal fields to Supabase columns.
- Migrate or synchronize data module by module.

The current `spfx-kpi-dashboard-bbtm.sppkg` is a reference artifact, not the target deployment format.

## Security Requirements

Security is a core requirement, not a later enhancement.

The implementation must include:

- Supabase Auth login.
- Protected application routes.
- Server-side or database-enforced role checks.
- Row-level security for sensitive tables.
- Separate role assignment table instead of a single role column.
- Audit-friendly validation workflow records.
- No public access to internal operational data.

RLS policies must be designed before production data is imported.

## Application UX Direction

The application should feel like a professional internal operational tool, not a public marketing website.

UX principles:

- Dense but readable layout.
- Fast navigation between modules.
- Clear role-aware module visibility.
- Strong dashboard overview for Direction and Admin.
- Clear validation queues for Capitaine.
- Simple personal view for Marin.
- Operational views for Armement.

The visual design can reuse BBTM identity assets from the Dashboard project, including the BBTM logo, but the new app should not be constrained by SharePoint webpart layout.

## Initial Milestone

The first milestone should deliver:

- A working web application in `C:\CODEX\SeaPilot`.
- Supabase Auth connection.
- Login and logout.
- Protected app shell.
- User profile loading.
- Role assignment model.
- Role-aware navigation.
- Placeholder module pages for the migrated Dashboard modules.
- Initial RLS-ready schema migrations.
- Documentation explaining how to configure `app.bbtm.fr`.

This milestone proves the foundation before any complex module is migrated.

## Open Decisions

The following decisions remain open and should be resolved during the implementation plan or module-specific specs:

- Final application name shown in the UI.
- Hosting provider for `app.bbtm.fr`.
- Exact Armement permissions by module.
- Exact Capitaine validation scope by data type.
- Exact data types a Marin can submit for validation.
- Whether SharePoint data is imported once or synchronized during transition.
- Whether file storage uses Supabase Storage, existing SharePoint libraries, or both during migration.

## Recommended Approach

Use progressive migration.

Build the new application foundation first, then migrate modules one by one. This reduces risk because the current Dashboard contains many SharePoint-specific services and internal list field dependencies. A direct full clone would be fragile, while a clean rebuild without using the existing Dashboard as a reference would lose useful business logic.

The migration should preserve the business behavior of Dashboard while replacing the platform foundation: SPFx and SharePoint lists become a web app with Supabase Auth, Supabase Postgres, and role-aware access control.

