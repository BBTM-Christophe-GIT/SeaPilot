# SeaPilot Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first private SeaPilot web foundation for `app.bbtm.fr`: Supabase Auth, cumulative roles, protected routing, role-aware navigation, placeholder modules, and an RLS-ready database schema.

**Architecture:** Create a React + Vite + TypeScript single-page application backed by Supabase Auth and Supabase Postgres. Keep authentication, permissions, module definitions, and Supabase access in separate small modules so later Dashboard migrations can plug into the shell without rewriting the security foundation.

**Tech Stack:** React 18, Vite, TypeScript, React Router, Supabase JS, Vitest, Testing Library, Supabase SQL migrations.

---

## File Structure

- Create `package.json`: app scripts and dependencies.
- Create `index.html`: Vite entry document.
- Create `vite.config.ts`: Vite, React, and Vitest configuration.
- Create `tsconfig.json`, `tsconfig.node.json`: TypeScript project configuration.
- Create `.gitignore`: Node, build, environment, and Supabase local exclusions.
- Create `.env.example`: required public Supabase environment variables.
- Create `src/main.tsx`: React entry point.
- Create `src/App.tsx`: top-level route composition.
- Create `src/styles/index.css`: global app styling.
- Create `src/lib/env.ts`: typed environment variable loading.
- Create `src/lib/supabaseClient.ts`: Supabase browser client.
- Create `src/features/auth/AuthProvider.tsx`: session state and auth actions.
- Create `src/features/auth/RequireAuth.tsx`: protected-route wrapper.
- Create `src/features/auth/LoginPage.tsx`: login screen.
- Create `src/features/permissions/roles.ts`: role constants and role type helpers.
- Create `src/features/permissions/moduleAccess.ts`: module definitions and role-aware permission helpers.
- Create `src/features/shell/AppShell.tsx`: authenticated layout and navigation.
- Create `src/features/modules/ModulePage.tsx`: placeholder module surface.
- Create `src/test/setup.ts`: Testing Library setup.
- Create `src/**/*.test.ts` and `src/**/*.test.tsx`: focused unit tests.
- Create `supabase/migrations/202606280001_foundation.sql`: schema, indexes, helper functions, seed roles, and RLS policies.
- Create `docs/deployment/app-bbtm-fr.md`: DNS, hosting, and Supabase configuration notes.

## Task 1: Scaffold The React/Vite Application

**Files:**
- Create: `C:\CODEX\SeaPilot\package.json`
- Create: `C:\CODEX\SeaPilot\index.html`
- Create: `C:\CODEX\SeaPilot\vite.config.ts`
- Create: `C:\CODEX\SeaPilot\tsconfig.json`
- Create: `C:\CODEX\SeaPilot\tsconfig.node.json`
- Create: `C:\CODEX\SeaPilot\.gitignore`
- Create: `C:\CODEX\SeaPilot\src\main.tsx`
- Create: `C:\CODEX\SeaPilot\src\App.tsx`
- Create: `C:\CODEX\SeaPilot\src\styles\index.css`

- [ ] **Step 1: Create the Vite app in the existing repository**

Run:

```powershell
npm create vite@latest . -- --template react-ts
```

Expected: Vite creates `package.json`, `index.html`, `src`, TypeScript config, and Vite config without deleting `docs/`.

- [ ] **Step 2: Install runtime and test dependencies**

Run:

```powershell
npm install @supabase/supabase-js react-router-dom lucide-react clsx
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Expected: `package-lock.json` is created and dependencies are added.

- [ ] **Step 3: Replace `package.json` scripts with app scripts**

Set the scripts section to:

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 4: Configure Vite and Vitest**

Replace `vite.config.ts` with:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
```

- [ ] **Step 5: Create the initial stylesheet**

Replace `src/styles/index.css` with:

```css
:root {
  color: #172033;
  background: #f6f8fb;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

button,
input {
  font: inherit;
}

a {
  color: inherit;
}
```

- [ ] **Step 6: Run the generated build**

Run:

```powershell
npm run build
```

Expected: build succeeds and `dist/` is generated.

- [ ] **Step 7: Commit**

Run:

```powershell
git add package.json package-lock.json index.html vite.config.ts tsconfig.json tsconfig.node.json .gitignore src
git commit -m "chore: scaffold SeaPilot web app"
```

## Task 2: Add Environment And Supabase Client

**Files:**
- Create: `C:\CODEX\SeaPilot\.env.example`
- Create: `C:\CODEX\SeaPilot\src\lib\env.ts`
- Create: `C:\CODEX\SeaPilot\src\lib\env.test.ts`
- Create: `C:\CODEX\SeaPilot\src\lib\supabaseClient.ts`
- Create: `C:\CODEX\SeaPilot\src\test\setup.ts`

- [ ] **Step 1: Create `.env.example`**

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_APP_BASE_URL=https://app.bbtm.fr
```

- [ ] **Step 2: Add test setup**

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 3: Write failing env tests**

Create `src/lib/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readRequiredEnv } from './env';

describe('readRequiredEnv', () => {
  it('returns a configured value', () => {
    expect(readRequiredEnv({ VITE_SUPABASE_URL: 'https://example.supabase.co' }, 'VITE_SUPABASE_URL')).toBe(
      'https://example.supabase.co',
    );
  });

  it('throws a clear error when a value is missing', () => {
    expect(() => readRequiredEnv({}, 'VITE_SUPABASE_URL')).toThrow(
      'Missing required environment variable: VITE_SUPABASE_URL',
    );
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run:

```powershell
npm test -- src/lib/env.test.ts
```

Expected: FAIL because `src/lib/env.ts` does not exist.

- [ ] **Step 5: Implement typed env loading**

Create `src/lib/env.ts`:

```ts
type EnvSource = Record<string, string | boolean | undefined>;

export interface AppEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  appBaseUrl: string;
}

export function readRequiredEnv(source: EnvSource, key: string): string {
  const value = source[key];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export function loadAppEnv(source: EnvSource = import.meta.env): AppEnv {
  return {
    supabaseUrl: readRequiredEnv(source, 'VITE_SUPABASE_URL'),
    supabaseAnonKey: readRequiredEnv(source, 'VITE_SUPABASE_ANON_KEY'),
    appBaseUrl: readRequiredEnv(source, 'VITE_APP_BASE_URL'),
  };
}
```

- [ ] **Step 6: Add Supabase client**

Create `src/lib/supabaseClient.ts`:

```ts
import { createClient } from '@supabase/supabase-js';
import { loadAppEnv } from './env';

const env = loadAppEnv();

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
```

- [ ] **Step 7: Run tests**

Run:

```powershell
npm test -- src/lib/env.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```powershell
git add .env.example src/lib src/test
git commit -m "feat: add Supabase environment client"
```

## Task 3: Add Supabase Foundation Schema And RLS

**Files:**
- Create: `C:\CODEX\SeaPilot\supabase\migrations\202606280001_foundation.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/202606280001_foundation.sql`:

```sql
create table if not exists public.roles (
  key text primary key,
  label text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_key text not null references public.roles(key) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id) on delete set null,
  primary key (user_id, role_key)
);

create table if not exists public.people (
  id bigint generated always as identity primary key,
  user_id uuid unique references public.profiles(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text,
  function_label text,
  grade_label text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vessels (
  id bigint generated always as identity primary key,
  name text not null,
  acronym text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.planning_assignments (
  id bigint generated always as identity primary key,
  vessel_id bigint not null references public.vessels(id) on delete restrict,
  captain_person_id bigint references public.people(id) on delete set null,
  crew_person_id bigint not null references public.people(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  assignment_role text not null default 'crew',
  source_label text not null default 'seapilot',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_assignments_valid_dates check (ends_on >= starts_on)
);

create table if not exists public.validation_requests (
  id bigint generated always as identity primary key,
  submitted_by_person_id bigint not null references public.people(id) on delete cascade,
  captain_person_id bigint references public.people(id) on delete set null,
  vessel_id bigint references public.vessels(id) on delete set null,
  module_key text not null,
  request_type text not null,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  constraint validation_requests_status check (status in ('pending', 'approved', 'rejected', 'cancelled'))
);

insert into public.roles (key, label, description)
values
  ('admin', 'Admin', 'Gestion utilisateurs, roles, parametres et toutes les donnees'),
  ('direction', 'Direction', 'Lecture et modification globale avec tableaux de bord'),
  ('armement', 'Armement', 'Gestion operationnelle flotte, equipages et planning'),
  ('capitaine', 'Capitaine', 'Validation et suivi selon les affectations planning'),
  ('marin', 'Marin', 'Acces personnel RH et lecture operationnelle limitee')
on conflict (key) do update
set label = excluded.label,
    description = excluded.description;

create index if not exists user_roles_user_id_idx on public.user_roles (user_id);
create index if not exists user_roles_role_key_idx on public.user_roles (role_key);
create index if not exists people_user_id_idx on public.people (user_id);
create index if not exists planning_assignments_vessel_id_idx on public.planning_assignments (vessel_id);
create index if not exists planning_assignments_captain_person_id_idx on public.planning_assignments (captain_person_id);
create index if not exists planning_assignments_crew_person_id_idx on public.planning_assignments (crew_person_id);
create index if not exists planning_assignments_dates_idx on public.planning_assignments (starts_on, ends_on);
create index if not exists validation_requests_submitted_by_person_id_idx on public.validation_requests (submitted_by_person_id);
create index if not exists validation_requests_captain_person_id_idx on public.validation_requests (captain_person_id);
create index if not exists validation_requests_vessel_id_idx on public.validation_requests (vessel_id);

create or replace function public.has_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role_key = required_role
  );
$$;

create or replace function public.has_any_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role_key = any(required_roles)
  );
$$;

create or replace function public.current_person_id()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.people
  where user_id = (select auth.uid())
  limit 1;
$$;

create or replace function public.is_captain_for_person(target_person_id bigint, target_day date default current_date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.planning_assignments assignment
    where assignment.captain_person_id = public.current_person_id()
      and assignment.crew_person_id = target_person_id
      and target_day between assignment.starts_on and assignment.ends_on
  );
$$;

alter table public.roles enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.people enable row level security;
alter table public.vessels enable row level security;
alter table public.planning_assignments enable row level security;
alter table public.validation_requests enable row level security;

create policy roles_authenticated_read on public.roles
  for select to authenticated
  using (true);

create policy profiles_self_read on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.has_any_role(array['admin', 'direction']));

create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.has_role('admin'))
  with check (id = (select auth.uid()) or public.has_role('admin'));

create policy user_roles_self_read on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role('admin'));

create policy user_roles_admin_write on public.user_roles
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

create policy people_role_read on public.people
  for select to authenticated
  using (
    public.has_any_role(array['admin', 'direction', 'armement'])
    or user_id = (select auth.uid())
    or public.is_captain_for_person(id)
  );

create policy people_office_write on public.people
  for all to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement']))
  with check (public.has_any_role(array['admin', 'direction', 'armement']));

create policy vessels_authenticated_read on public.vessels
  for select to authenticated
  using (true);

create policy vessels_office_write on public.vessels
  for all to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement']))
  with check (public.has_any_role(array['admin', 'direction', 'armement']));

create policy planning_role_read on public.planning_assignments
  for select to authenticated
  using (
    public.has_any_role(array['admin', 'direction', 'armement'])
    or captain_person_id = public.current_person_id()
    or crew_person_id = public.current_person_id()
  );

create policy planning_office_write on public.planning_assignments
  for all to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement']))
  with check (public.has_any_role(array['admin', 'direction', 'armement']));

create policy validation_requests_role_read on public.validation_requests
  for select to authenticated
  using (
    public.has_any_role(array['admin', 'direction', 'armement'])
    or submitted_by_person_id = public.current_person_id()
    or captain_person_id = public.current_person_id()
  );

create policy validation_requests_submitter_insert on public.validation_requests
  for insert to authenticated
  with check (submitted_by_person_id = public.current_person_id());

create policy validation_requests_captain_update on public.validation_requests
  for update to authenticated
  using (
    public.has_any_role(array['admin', 'direction', 'armement'])
    or captain_person_id = public.current_person_id()
  )
  with check (
    public.has_any_role(array['admin', 'direction', 'armement'])
    or captain_person_id = public.current_person_id()
  );
```

- [ ] **Step 2: Validate migration with Supabase CLI**

Run:

```powershell
supabase db reset
```

Expected: local database resets and applies `202606280001_foundation.sql` without SQL errors.

- [ ] **Step 3: Commit**

Run:

```powershell
git add supabase/migrations/202606280001_foundation.sql
git commit -m "feat: add Supabase foundation schema"
```

## Task 4: Implement Auth Provider And Protected Routes

**Files:**
- Create: `C:\CODEX\SeaPilot\src\features\auth\AuthProvider.tsx`
- Create: `C:\CODEX\SeaPilot\src\features\auth\RequireAuth.tsx`
- Create: `C:\CODEX\SeaPilot\src\features\auth\AuthProvider.test.tsx`

- [ ] **Step 1: Write failing auth provider test**

Create `src/features/auth/AuthProvider.test.tsx`:

```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthProvider';

describe('AuthProvider', () => {
  it('exposes the loaded session state', async () => {
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({
          data: { subscription: { unsubscribe: vi.fn() } },
        }),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
      },
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider client={client as never}>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.session).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm test -- src/features/auth/AuthProvider.test.tsx
```

Expected: FAIL because `AuthProvider.tsx` does not exist.

- [ ] **Step 3: Implement auth provider**

Create `src/features/auth/AuthProvider.tsx`:

```tsx
import { Session, SupabaseClient } from '@supabase/supabase-js';
import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface AuthContextValue {
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
  client?: SupabaseClient;
}

export function AuthProvider({ children, client = supabase }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    client.auth.getSession().then(({ data, error }) => {
      if (!isMounted) {
        return;
      }

      if (error) {
        setSession(null);
      } else {
        setSession(data.session);
      }

      setIsLoading(false);
    });

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLoading,
      signIn: async (email, password) => {
        const { error } = await client.auth.signInWithPassword({ email, password });

        if (error) {
          throw error;
        }
      },
      signOut: async () => {
        const { error } = await client.auth.signOut();

        if (error) {
          throw error;
        }
      },
    }),
    [client, session, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return value;
}
```

- [ ] **Step 4: Implement route guard**

Create `src/features/auth/RequireAuth.tsx`:

```tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function RequireAuth() {
  const { session, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="auth-loading">Chargement de la session...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
```

- [ ] **Step 5: Run tests**

Run:

```powershell
npm test -- src/features/auth/AuthProvider.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/features/auth
git commit -m "feat: add authentication provider"
```

## Task 5: Implement Roles And Module Access Rules

**Files:**
- Create: `C:\CODEX\SeaPilot\src\features\permissions\roles.ts`
- Create: `C:\CODEX\SeaPilot\src\features\permissions\moduleAccess.ts`
- Create: `C:\CODEX\SeaPilot\src\features\permissions\moduleAccess.test.ts`

- [ ] **Step 1: Write failing module access tests**

Create `src/features/permissions/moduleAccess.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getVisibleModules, canAccessModule } from './moduleAccess';

describe('module access', () => {
  it('hides projects from marins', () => {
    expect(canAccessModule(['marin'], 'projects')).toBe(false);
  });

  it('allows marins to read operational modules', () => {
    expect(canAccessModule(['marin'], 'planning')).toBe(true);
    expect(canAccessModule(['marin'], 'dpr')).toBe(true);
  });

  it('treats roles as cumulative', () => {
    expect(canAccessModule(['marin', 'direction'], 'projects')).toBe(true);
  });

  it('shows every module to admin', () => {
    expect(getVisibleModules(['admin']).map((module) => module.key)).toContain('projects');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm test -- src/features/permissions/moduleAccess.test.ts
```

Expected: FAIL because permission files do not exist.

- [ ] **Step 3: Implement role constants**

Create `src/features/permissions/roles.ts`:

```ts
export const ROLE_KEYS = ['admin', 'direction', 'armement', 'capitaine', 'marin'] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLE_LABELS: Record<RoleKey, string> = {
  admin: 'Admin',
  direction: 'Direction',
  armement: 'Armement',
  capitaine: 'Capitaine',
  marin: 'Marin',
};

export function hasRole(roles: RoleKey[], role: RoleKey): boolean {
  return roles.includes(role);
}
```

- [ ] **Step 4: Implement module access**

Create `src/features/permissions/moduleAccess.ts`:

```ts
import { RoleKey } from './roles';

export type ModuleKey =
  | 'home'
  | 'kpi'
  | 'qhse'
  | 'certificates'
  | 'procedures'
  | 'actionPlan'
  | 'dpr'
  | 'purchaseRequests'
  | 'planning'
  | 'humanResources'
  | 'projects'
  | 'admin';

export interface AppModule {
  key: ModuleKey;
  label: string;
  family: 'Accueil' | 'QHSE' | 'Operations' | 'Achats' | 'Planning' | 'RH' | 'Administration';
  allowedRoles: RoleKey[];
}

export const APP_MODULES: AppModule[] = [
  { key: 'home', label: 'Accueil', family: 'Accueil', allowedRoles: ['admin', 'direction', 'armement', 'capitaine', 'marin'] },
  { key: 'kpi', label: 'KPI', family: 'Accueil', allowedRoles: ['admin', 'direction', 'armement', 'capitaine', 'marin'] },
  { key: 'qhse', label: 'QHSE', family: 'QHSE', allowedRoles: ['admin', 'direction', 'armement', 'capitaine', 'marin'] },
  { key: 'certificates', label: 'Certificats flotte', family: 'QHSE', allowedRoles: ['admin', 'direction', 'armement', 'capitaine', 'marin'] },
  { key: 'procedures', label: 'Procedures QHSE', family: 'QHSE', allowedRoles: ['admin', 'direction', 'armement', 'capitaine', 'marin'] },
  { key: 'actionPlan', label: "Plan d'action", family: 'QHSE', allowedRoles: ['admin', 'direction', 'armement', 'capitaine', 'marin'] },
  { key: 'dpr', label: 'Daily Progress Report', family: 'Operations', allowedRoles: ['admin', 'direction', 'armement', 'capitaine', 'marin'] },
  { key: 'purchaseRequests', label: "Demandes d'achat", family: 'Achats', allowedRoles: ['admin', 'direction', 'armement', 'capitaine', 'marin'] },
  { key: 'planning', label: 'Planning', family: 'Planning', allowedRoles: ['admin', 'direction', 'armement', 'capitaine', 'marin'] },
  { key: 'humanResources', label: 'RH', family: 'RH', allowedRoles: ['admin', 'direction', 'armement', 'capitaine', 'marin'] },
  { key: 'projects', label: 'Projets', family: 'Operations', allowedRoles: ['admin', 'direction'] },
  { key: 'admin', label: 'Administration', family: 'Administration', allowedRoles: ['admin'] },
];

export function canAccessModule(roles: RoleKey[], moduleKey: ModuleKey): boolean {
  const module = APP_MODULES.find((item) => item.key === moduleKey);

  if (!module) {
    return false;
  }

  return module.allowedRoles.some((role) => roles.includes(role));
}

export function getVisibleModules(roles: RoleKey[]): AppModule[] {
  return APP_MODULES.filter((module) => canAccessModule(roles, module.key));
}
```

- [ ] **Step 5: Run tests**

Run:

```powershell
npm test -- src/features/permissions/moduleAccess.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/features/permissions
git commit -m "feat: add role based module access"
```

## Task 6: Add Login Page, App Shell, And Placeholder Modules

**Files:**
- Modify: `C:\CODEX\SeaPilot\src\App.tsx`
- Modify: `C:\CODEX\SeaPilot\src\main.tsx`
- Create: `C:\CODEX\SeaPilot\src\features\auth\LoginPage.tsx`
- Create: `C:\CODEX\SeaPilot\src\features\shell\AppShell.tsx`
- Create: `C:\CODEX\SeaPilot\src\features\modules\ModulePage.tsx`
- Create: `C:\CODEX\SeaPilot\src\features\shell\AppShell.test.tsx`

- [ ] **Step 1: Create placeholder module page**

Create `src/features/modules/ModulePage.tsx`:

```tsx
import { AppModule } from '../permissions/moduleAccess';

interface ModulePageProps {
  module: AppModule;
}

export function ModulePage({ module }: ModulePageProps) {
  return (
    <section className="module-page">
      <p className="module-family">{module.family}</p>
      <h1>{module.label}</h1>
      <p>Module pret pour migration depuis le Dashboard BBTM.</p>
    </section>
  );
}
```

- [ ] **Step 2: Create login page**

Create `src/features/auth/LoginPage.tsx`:

```tsx
import { FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await signIn(email, password);
      navigate(from, { replace: true });
    } catch {
      setError('Connexion impossible. Verifiez votre email et votre mot de passe.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-panel" onSubmit={handleSubmit}>
        <span className="login-brand">BBTM</span>
        <h1>Connexion a SeaPilot</h1>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
        <label>
          Mot de passe
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Create authenticated shell**

Create `src/features/shell/AppShell.tsx`:

```tsx
import { NavLink, Outlet } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { getVisibleModules } from '../permissions/moduleAccess';
import { RoleKey } from '../permissions/roles';

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
```

- [ ] **Step 4: Wire routes**

Replace `src/App.tsx` with:

```tsx
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './features/auth/RequireAuth';
import { LoginPage } from './features/auth/LoginPage';
import { AppShell } from './features/shell/AppShell';
import { APP_MODULES } from './features/permissions/moduleAccess';
import { ModulePage } from './features/modules/ModulePage';

export default function App() {
  const homeModule = APP_MODULES.find((module) => module.key === 'home');

  if (!homeModule) {
    throw new Error('Home module is missing');
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<ModulePage module={homeModule} />} />
          {APP_MODULES.filter((module) => module.key !== 'home').map((module) => (
            <Route key={module.key} path={`/modules/${module.key}`} element={<ModulePage module={module} />} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 5: Wire providers**

Replace `src/main.tsx` with:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './features/auth/AuthProvider';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
```

- [ ] **Step 6: Add shell smoke test**

Create `src/features/shell/AppShell.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import { AuthProvider } from '../auth/AuthProvider';

describe('AppShell', () => {
  it('renders the private application navigation', async () => {
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({
          data: { subscription: { unsubscribe: vi.fn() } },
        }),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
      },
    };

    render(
      <AuthProvider client={client as never}>
        <MemoryRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<div>Accueil prive</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText('SeaPilot')).toBeInTheDocument();
    expect(screen.getByText('Projets')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run tests and build**

Run:

```powershell
npm test -- src/features/shell/AppShell.test.tsx
npm run build
```

Expected: PASS and build succeeds.

- [ ] **Step 8: Commit**

Run:

```powershell
git add src
git commit -m "feat: add protected application shell"
```

## Task 7: Replace Demo Roles With Supabase Profile Roles

**Files:**
- Create: `C:\CODEX\SeaPilot\src\features\profiles\profileQueries.ts`
- Create: `C:\CODEX\SeaPilot\src\features\profiles\profileQueries.test.ts`
- Modify: `C:\CODEX\SeaPilot\src\features\shell\AppShell.tsx`

- [ ] **Step 1: Write failing profile role mapper test**

Create `src/features/profiles/profileQueries.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mapRoleRows } from './profileQueries';

describe('mapRoleRows', () => {
  it('maps Supabase role rows to role keys', () => {
    expect(mapRoleRows([{ role_key: 'admin' }, { role_key: 'marin' }])).toEqual(['admin', 'marin']);
  });

  it('ignores unknown role keys', () => {
    expect(mapRoleRows([{ role_key: 'unknown' }, { role_key: 'direction' }])).toEqual(['direction']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm test -- src/features/profiles/profileQueries.test.ts
```

Expected: FAIL because `profileQueries.ts` does not exist.

- [ ] **Step 3: Implement profile role mapper and query**

Create `src/features/profiles/profileQueries.ts`:

```ts
import { SupabaseClient } from '@supabase/supabase-js';
import { ROLE_KEYS, RoleKey } from '../permissions/roles';

interface RoleRow {
  role_key: string;
}

export function mapRoleRows(rows: RoleRow[]): RoleKey[] {
  return rows
    .map((row) => row.role_key)
    .filter((role): role is RoleKey => ROLE_KEYS.includes(role as RoleKey));
}

export async function fetchCurrentUserRoles(client: SupabaseClient): Promise<RoleKey[]> {
  const { data, error } = await client.from('user_roles').select('role_key');

  if (error) {
    throw error;
  }

  return mapRoleRows(data || []);
}
```

- [ ] **Step 4: Update `AppShell` to load Supabase roles**

Replace `src/features/shell/AppShell.tsx` with:

```tsx
import { SupabaseClient } from '@supabase/supabase-js';
import { LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../auth/AuthProvider';
import { getVisibleModules } from '../permissions/moduleAccess';
import { RoleKey } from '../permissions/roles';
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
```

- [ ] **Step 5: Update shell test for explicit roles**

In `src/features/shell/AppShell.test.tsx`, replace:

```tsx
<Route element={<AppShell />}>
```

with:

```tsx
<Route element={<AppShell rolesOverride={['admin']} />}>
```

- [ ] **Step 6: Run tests**

Run:

```powershell
npm test -- src/features/profiles/profileQueries.test.ts src/features/shell/AppShell.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/features/profiles src/features/shell/AppShell.tsx src/features/shell/AppShell.test.tsx
git commit -m "feat: add profile role loading helpers"
```

## Task 8: Document `app.bbtm.fr` Deployment Configuration

**Files:**
- Create: `C:\CODEX\SeaPilot\docs\deployment\app-bbtm-fr.md`

- [ ] **Step 1: Create deployment documentation**

Create `docs/deployment/app-bbtm-fr.md`:

```md
# app.bbtm.fr Deployment Notes

## Domain Split

- `www.bbtm.fr` remains the public website.
- `app.bbtm.fr` hosts the private SeaPilot application.

## DNS

Create a DNS record for `app.bbtm.fr` pointing to the selected application host.

Use the hosting provider's required record type:

- `CNAME` when the provider gives a host name.
- `A` and `AAAA` when the provider gives static IP addresses.

Do not change the existing `www.bbtm.fr` record while deploying SeaPilot.

## Supabase Auth

In Supabase Auth URL configuration:

- Site URL: `https://app.bbtm.fr`
- Redirect URL: `https://app.bbtm.fr/*`
- Local redirect URL for development: `http://localhost:5173/*`

## Environment Variables

The application requires:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_APP_BASE_URL`

Production value:

```dotenv
VITE_APP_BASE_URL=https://app.bbtm.fr
```

## First Production Check

After deployment:

1. Open `https://app.bbtm.fr`.
2. Confirm unauthenticated users are sent to `/login`.
3. Sign in with a Supabase test user.
4. Confirm the private navigation appears.
5. Confirm `www.bbtm.fr` still serves the public website independently.
```

- [ ] **Step 2: Commit**

Run:

```powershell
git add docs/deployment/app-bbtm-fr.md
git commit -m "docs: add app domain deployment notes"
```

## Task 9: Run Full Verification And Push

**Files:**
- Verify all created files.

- [ ] **Step 1: Run unit tests**

Run:

```powershell
npm test
```

Expected: all Vitest suites pass.

- [ ] **Step 2: Run production build**

Run:

```powershell
npm run build
```

Expected: TypeScript and Vite build succeed.

- [ ] **Step 3: Run git status**

Run:

```powershell
git status --short --branch
```

Expected: branch is clean and ahead of `origin/main` by the implementation commits.

- [ ] **Step 4: Push**

Run:

```powershell
git push
```

Expected: commits are pushed to `BBTM-Christophe-GIT/SeaPilot.git`.

## Self-Review

Spec coverage:

- Private `app.bbtm.fr` foundation: covered by Tasks 1, 6, and 8.
- Supabase Auth: covered by Tasks 2, 4, and 6.
- Cumulative roles: covered by Tasks 3, 5, and 7.
- Role-aware navigation: covered by Tasks 5 and 6.
- Initial RLS-ready schema: covered by Task 3.
- Placeholder modules for Dashboard migration: covered by Task 6.
- Deployment documentation: covered by Task 8.

No placeholder tasks are intentionally left for this first milestone. Module-specific business migrations are outside this plan and should each receive their own spec and plan.
