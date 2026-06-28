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
create index if not exists user_roles_assigned_by_idx on public.user_roles (assigned_by);
create index if not exists people_user_id_idx on public.people (user_id);
create index if not exists planning_assignments_vessel_id_idx on public.planning_assignments (vessel_id);
create index if not exists planning_assignments_captain_person_id_idx on public.planning_assignments (captain_person_id);
create index if not exists planning_assignments_crew_person_id_idx on public.planning_assignments (crew_person_id);
create index if not exists planning_assignments_dates_idx on public.planning_assignments (starts_on, ends_on);
create index if not exists validation_requests_submitted_by_person_id_idx on public.validation_requests (submitted_by_person_id);
create index if not exists validation_requests_captain_person_id_idx on public.validation_requests (captain_person_id);
create index if not exists validation_requests_vessel_id_idx on public.validation_requests (vessel_id);
create index if not exists validation_requests_decided_by_idx on public.validation_requests (decided_by);

create or replace function public.has_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
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
set search_path = public, pg_temp
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
set search_path = public, pg_temp
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
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.planning_assignments assignment
    where assignment.captain_person_id = public.current_person_id()
      and assignment.crew_person_id = target_person_id
      and target_day between assignment.starts_on and assignment.ends_on
  );
$$;

revoke all on function public.has_role(text) from public;
revoke all on function public.has_any_role(text[]) from public;
revoke all on function public.current_person_id() from public;
revoke all on function public.is_captain_for_person(bigint, date) from public;

grant execute on function public.has_role(text) to authenticated;
grant execute on function public.has_any_role(text[]) to authenticated;
grant execute on function public.current_person_id() to authenticated;
grant execute on function public.is_captain_for_person(bigint, date) to authenticated;

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
