-- Planning P0.4: V1 governance, publication history, action permissions and tenant isolation.
-- Existing SeaPilot data is preserved and attached to the initial BBTM company.
--
-- Rollback strategy:
--   1. Export planning_change_log, planning_versions, planning_publications and vessel grants.
--   2. Restore the P0.3 RPCs, audit trigger and RLS policies from migrations 202607130003/006.
--   3. Keep company_id columns until every dependent policy and application deployment is rolled back.
--   4. Only then drop the P0.4 permission/grant tables and company model if multi-company data was never added.

create table if not exists public.companies (
  id bigint generated always as identity primary key,
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_code_check check (length(trim(code)) > 0),
  constraint companies_name_check check (length(trim(name)) > 0)
);

insert into public.companies (code, name)
values ('bbtm', 'BBTM')
on conflict (code) do nothing;

create table if not exists public.company_memberships (
  company_id bigint not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  primary key (company_id, user_id)
);

alter table public.profiles add column if not exists active_company_id bigint;
alter table public.user_roles add column if not exists company_id bigint;

do $$
declare
  initial_company_id bigint;
begin
  select id into initial_company_id from public.companies where code = 'bbtm';

  insert into public.company_memberships (company_id, user_id)
  select initial_company_id, profile.id
  from public.profiles profile
  on conflict (company_id, user_id) do nothing;

  update public.profiles
  set active_company_id = initial_company_id
  where active_company_id is null;

  update public.user_roles
  set company_id = initial_company_id
  where company_id is null;
end $$;

alter table public.profiles alter column active_company_id set not null;
alter table public.user_roles alter column company_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_active_company_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_active_company_id_fkey
      foreign key (active_company_id) references public.companies(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_roles_company_id_fkey'
      and conrelid = 'public.user_roles'::regclass
  ) then
    alter table public.user_roles
      add constraint user_roles_company_id_fkey
      foreign key (company_id) references public.companies(id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_roles_company_membership_fkey'
      and conrelid = 'public.user_roles'::regclass
  ) then
    alter table public.user_roles
      add constraint user_roles_company_membership_fkey
      foreign key (company_id, user_id)
      references public.company_memberships(company_id, user_id) on delete cascade;
  end if;
end $$;

alter table public.user_roles drop constraint if exists user_roles_pkey;
alter table public.user_roles
  add constraint user_roles_pkey primary key (user_id, company_id, role_key);

create index if not exists company_memberships_user_active_idx
  on public.company_memberships (user_id, company_id) where active;
create index if not exists company_memberships_created_by_idx
  on public.company_memberships (created_by);
create index if not exists profiles_active_company_id_idx
  on public.profiles (active_company_id);
create index if not exists user_roles_company_role_idx
  on public.user_roles (company_id, role_key, user_id);

create or replace function public.current_planning_company_id()
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select profile.active_company_id
      from public.profiles profile
      join public.company_memberships membership
        on membership.company_id = profile.active_company_id
       and membership.user_id = profile.id
       and membership.active
      where profile.id = (select auth.uid())
      limit 1
    ),
    (
      select min(company.id)
      from public.companies company
      where company.active
      having count(*) = 1
    )
  );
$$;

create or replace function public.user_belongs_to_company(target_company_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_company_id is not null
    and target_company_id = public.current_planning_company_id()
    and exists (
      select 1
      from public.company_memberships membership
      where membership.company_id = target_company_id
        and membership.user_id = (select auth.uid())
        and membership.active
    );
$$;

alter table public.profiles alter column active_company_id set default public.current_planning_company_id();
alter table public.user_roles alter column company_id set default public.current_planning_company_id();

create or replace function public.ensure_profile_company_membership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.company_memberships (company_id, user_id, created_by)
  values (new.active_company_id, new.id, (select auth.uid()))
  on conflict (company_id, user_id) do update set active = true;
  return new;
end;
$$;

revoke all on function public.ensure_profile_company_membership() from public, anon, authenticated;
drop trigger if exists profiles_company_membership on public.profiles;
create trigger profiles_company_membership after insert on public.profiles
  for each row execute function public.ensure_profile_company_membership();

create or replace function public.has_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles user_role
    where user_role.user_id = (select auth.uid())
      and user_role.company_id = public.current_planning_company_id()
      and user_role.role_key = required_role
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
    from public.user_roles user_role
    where user_role.user_id = (select auth.uid())
      and user_role.company_id = public.current_planning_company_id()
      and user_role.role_key = any(required_roles)
  );
$$;

revoke all on function public.current_planning_company_id() from public, anon;
revoke all on function public.user_belongs_to_company(bigint) from public, anon;
grant execute on function public.current_planning_company_id() to authenticated;
grant execute on function public.user_belongs_to_company(bigint) to authenticated;

-- Direct tenant keys keep historical rows with unresolved people/vessels isolated.
alter table public.people add column if not exists company_id bigint;
alter table public.vessels add column if not exists company_id bigint;
alter table public.planning_assignments add column if not exists company_id bigint;
alter table public.planning_days add column if not exists company_id bigint;
alter table public.planning_periods add column if not exists company_id bigint;
alter table public.planning_projects add column if not exists company_id bigint;
alter table public.fleet_certificates add column if not exists company_id bigint;
alter table public.hr_documents add column if not exists company_id bigint;
alter table public.planning_rules add column if not exists company_id bigint;
alter table public.planning_publications add column if not exists company_id bigint;
alter table public.planning_versions add column if not exists company_id bigint;
alter table public.planning_handovers add column if not exists company_id bigint;
alter table public.planning_derogations add column if not exists company_id bigint;
alter table public.planning_change_log add column if not exists company_id bigint;

do $$
declare
  initial_company_id bigint;
begin
  select id into initial_company_id from public.companies where code = 'bbtm';
  update public.people set company_id = initial_company_id where company_id is null;
  update public.vessels set company_id = initial_company_id where company_id is null;
  update public.planning_assignments set company_id = initial_company_id where company_id is null;
  update public.planning_days set company_id = initial_company_id where company_id is null;
  update public.planning_periods set company_id = initial_company_id where company_id is null;
  update public.planning_projects set company_id = initial_company_id where company_id is null;
  update public.fleet_certificates set company_id = initial_company_id where company_id is null;
  update public.hr_documents set company_id = initial_company_id where company_id is null;
  update public.planning_rules set company_id = initial_company_id where company_id is null;
  update public.planning_publications set company_id = initial_company_id where company_id is null;
  update public.planning_versions set company_id = initial_company_id where company_id is null;
  update public.planning_handovers set company_id = initial_company_id where company_id is null;
  update public.planning_derogations set company_id = initial_company_id where company_id is null;
  update public.planning_change_log set company_id = initial_company_id where company_id is null;
end $$;

alter table public.people alter column company_id set not null;
alter table public.vessels alter column company_id set not null;
alter table public.planning_assignments alter column company_id set not null;
alter table public.planning_days alter column company_id set not null;
alter table public.planning_periods alter column company_id set not null;
alter table public.planning_projects alter column company_id set not null;
alter table public.fleet_certificates alter column company_id set not null;
alter table public.hr_documents alter column company_id set not null;
alter table public.planning_rules alter column company_id set not null;
alter table public.planning_publications alter column company_id set not null;
alter table public.planning_versions alter column company_id set not null;
alter table public.planning_handovers alter column company_id set not null;
alter table public.planning_derogations alter column company_id set not null;
alter table public.planning_change_log alter column company_id set not null;

alter table public.people alter column company_id set default public.current_planning_company_id();
alter table public.vessels alter column company_id set default public.current_planning_company_id();
alter table public.planning_assignments alter column company_id set default public.current_planning_company_id();
alter table public.planning_days alter column company_id set default public.current_planning_company_id();
alter table public.planning_periods alter column company_id set default public.current_planning_company_id();
alter table public.planning_projects alter column company_id set default public.current_planning_company_id();
alter table public.fleet_certificates alter column company_id set default public.current_planning_company_id();
alter table public.hr_documents alter column company_id set default public.current_planning_company_id();
alter table public.planning_rules alter column company_id set default public.current_planning_company_id();
alter table public.planning_publications alter column company_id set default public.current_planning_company_id();
alter table public.planning_versions alter column company_id set default public.current_planning_company_id();
alter table public.planning_handovers alter column company_id set default public.current_planning_company_id();
alter table public.planning_derogations alter column company_id set default public.current_planning_company_id();
alter table public.planning_change_log alter column company_id set default public.current_planning_company_id();

alter table public.planning_rules drop constraint if exists planning_rules_code_key;
alter table public.planning_publications drop constraint if exists planning_publications_scope_period_key;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'planning_rules_company_code_key'
      and conrelid = 'public.planning_rules'::regclass
  ) then
    alter table public.planning_rules
      add constraint planning_rules_company_code_key unique (company_id, code);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'planning_publications_company_scope_period_key'
      and conrelid = 'public.planning_publications'::regclass
  ) then
    alter table public.planning_publications
      add constraint planning_publications_company_scope_period_key unique (company_id, scope_key, starts_on, ends_on);
  end if;
end $$;

do $$
declare
  target_table regclass;
  constraint_name text;
begin
  foreach target_table in array array[
    'public.people'::regclass,
    'public.vessels'::regclass,
    'public.planning_assignments'::regclass,
    'public.planning_days'::regclass,
    'public.planning_periods'::regclass,
    'public.planning_projects'::regclass,
    'public.fleet_certificates'::regclass,
    'public.hr_documents'::regclass,
    'public.planning_rules'::regclass,
    'public.planning_publications'::regclass,
    'public.planning_versions'::regclass,
    'public.planning_handovers'::regclass,
    'public.planning_derogations'::regclass,
    'public.planning_change_log'::regclass
  ] loop
    constraint_name := replace(target_table::text, 'public.', '') || '_company_id_fkey';
    if not exists (
      select 1 from pg_constraint
      where conname = constraint_name and conrelid = target_table
    ) then
      execute format(
        'alter table %s add constraint %I foreign key (company_id) references public.companies(id) on delete restrict',
        target_table,
        constraint_name
      );
    end if;
  end loop;
end $$;

create index if not exists people_company_active_idx on public.people (company_id, active, last_name, first_name);
create index if not exists vessels_company_active_idx on public.vessels (company_id, active, name);
create index if not exists planning_assignments_company_dates_idx on public.planning_assignments (company_id, starts_on, ends_on, vessel_id);
create index if not exists planning_days_company_date_idx on public.planning_days (company_id, work_date, vessel_id);
create index if not exists planning_periods_company_dates_idx on public.planning_periods (company_id, starts_on, ends_on, vessel_id);
create index if not exists planning_projects_company_dates_idx on public.planning_projects (company_id, starts_on, ends_on);
create index if not exists fleet_certificates_company_expiry_idx on public.fleet_certificates (company_id, expires_on);
create index if not exists hr_documents_company_expiry_idx on public.hr_documents (company_id, expires_on);
create index if not exists planning_rules_company_code_idx on public.planning_rules (company_id, code);
create index if not exists planning_publications_company_scope_dates_idx on public.planning_publications (company_id, scope_key, starts_on, ends_on);
create index if not exists planning_versions_company_publication_idx on public.planning_versions (company_id, publication_id, version_number desc);
create index if not exists planning_handovers_company_date_idx on public.planning_handovers (company_id, handover_at desc, vessel_id);
create index if not exists planning_derogations_company_scope_idx on public.planning_derogations (company_id, vessel_id, starts_at, ends_at);
create index if not exists planning_change_log_company_date_idx on public.planning_change_log (company_id, changed_at desc);

-- Preserve actor labels even if a profile is later renamed or deleted.
alter table public.planning_publications
  add column if not exists submitted_by_name text,
  add column if not exists validated_by_name text,
  add column if not exists published_by_name text,
  add column if not exists locked_by_name text,
  add column if not exists created_by_name text,
  add column if not exists updated_by_name text;
alter table public.planning_versions add column if not exists created_by_name text;
alter table public.planning_change_log
  add column if not exists changed_by_name text,
  add column if not exists vessel_id bigint references public.vessels(id) on delete set null,
  add column if not exists starts_on date,
  add column if not exists ends_on date,
  add column if not exists summary text;

update public.planning_change_log change
set changed_by_name = coalesce(nullif(trim(profile.display_name), ''), profile.email, change.changed_by::text)
from public.profiles profile
where change.changed_by = profile.id and change.changed_by_name is null;

update public.planning_publications publication
set submitted_by_name = coalesce(publication.submitted_by_name, (select coalesce(nullif(trim(profile.display_name), ''), profile.email) from public.profiles profile where profile.id = publication.submitted_by)),
    validated_by_name = coalesce(publication.validated_by_name, (select coalesce(nullif(trim(profile.display_name), ''), profile.email) from public.profiles profile where profile.id = publication.validated_by)),
    published_by_name = coalesce(publication.published_by_name, (select coalesce(nullif(trim(profile.display_name), ''), profile.email) from public.profiles profile where profile.id = publication.published_by)),
    locked_by_name = coalesce(publication.locked_by_name, (select coalesce(nullif(trim(profile.display_name), ''), profile.email) from public.profiles profile where profile.id = publication.locked_by)),
    created_by_name = coalesce(publication.created_by_name, (select coalesce(nullif(trim(profile.display_name), ''), profile.email) from public.profiles profile where profile.id = publication.created_by)),
    updated_by_name = coalesce(publication.updated_by_name, (select coalesce(nullif(trim(profile.display_name), ''), profile.email) from public.profiles profile where profile.id = publication.updated_by));

update public.planning_versions version
set created_by_name = coalesce(version.created_by_name, nullif(trim(profile.display_name), ''), profile.email)
from public.profiles profile
where version.created_by = profile.id and version.created_by_name is null;

create index if not exists planning_change_log_vessel_date_idx
  on public.planning_change_log (company_id, vessel_id, starts_on, ends_on, changed_at desc);

create table if not exists public.planning_action_permissions (
  role_key text not null references public.roles(key) on delete cascade,
  action_key text not null,
  scope_mode text not null,
  created_at timestamptz not null default now(),
  primary key (role_key, action_key),
  constraint planning_action_permissions_action_check check (
    action_key in (
      'read', 'edit_event', 'submit', 'validate', 'publish', 'reopen', 'archive',
      'view_history', 'manage_handover', 'manage_derogation', 'manage_vessels',
      'manage_permissions', 'export'
    )
  ),
  constraint planning_action_permissions_scope_check check (scope_mode in ('company', 'assigned_vessel', 'own'))
);

insert into public.planning_action_permissions (role_key, action_key, scope_mode)
values
  ('admin', 'read', 'company'),
  ('admin', 'edit_event', 'company'),
  ('admin', 'submit', 'company'),
  ('admin', 'validate', 'company'),
  ('admin', 'publish', 'company'),
  ('admin', 'reopen', 'company'),
  ('admin', 'archive', 'company'),
  ('admin', 'view_history', 'company'),
  ('admin', 'manage_handover', 'company'),
  ('admin', 'manage_derogation', 'company'),
  ('admin', 'manage_vessels', 'company'),
  ('admin', 'manage_permissions', 'company'),
  ('admin', 'export', 'company'),
  ('direction', 'read', 'company'),
  ('direction', 'edit_event', 'company'),
  ('direction', 'submit', 'company'),
  ('direction', 'validate', 'company'),
  ('direction', 'publish', 'company'),
  ('direction', 'reopen', 'company'),
  ('direction', 'view_history', 'company'),
  ('direction', 'manage_derogation', 'company'),
  ('direction', 'export', 'company'),
  ('armement', 'read', 'company'),
  ('armement', 'edit_event', 'company'),
  ('armement', 'submit', 'company'),
  ('armement', 'view_history', 'company'),
  ('armement', 'manage_handover', 'company'),
  ('armement', 'export', 'company'),
  ('capitaine', 'read', 'assigned_vessel'),
  ('capitaine', 'validate', 'assigned_vessel'),
  ('capitaine', 'view_history', 'assigned_vessel'),
  ('marin', 'read', 'own')
on conflict (role_key, action_key) do update set scope_mode = excluded.scope_mode;

create table if not exists public.planning_vessel_permissions (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade default public.current_planning_company_id(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  vessel_id bigint not null references public.vessels(id) on delete cascade,
  action_key text not null,
  starts_on date,
  ends_on date,
  reason text not null,
  granted_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  constraint planning_vessel_permissions_action_check check (
    action_key in ('read', 'edit_event', 'submit', 'validate', 'publish', 'reopen', 'view_history', 'manage_handover', 'manage_derogation', 'export')
  ),
  constraint planning_vessel_permissions_dates_check check (
    (starts_on is null and ends_on is null) or (starts_on is not null and ends_on is not null and ends_on >= starts_on)
  ),
  constraint planning_vessel_permissions_reason_check check (length(trim(reason)) >= 10)
);

create index if not exists planning_vessel_permissions_lookup_idx
  on public.planning_vessel_permissions (company_id, user_id, vessel_id, action_key, starts_on, ends_on)
  where revoked_at is null;
create index if not exists planning_vessel_permissions_granted_by_idx on public.planning_vessel_permissions (granted_by);
create index if not exists planning_vessel_permissions_revoked_by_idx on public.planning_vessel_permissions (revoked_by);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vessels_id_company_key' and conrelid = 'public.vessels'::regclass
  ) then
    alter table public.vessels add constraint vessels_id_company_key unique (id, company_id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'planning_vessel_permissions_vessel_company_fkey' and conrelid = 'public.planning_vessel_permissions'::regclass
  ) then
    alter table public.planning_vessel_permissions
      add constraint planning_vessel_permissions_vessel_company_fkey
      foreign key (vessel_id, company_id) references public.vessels(id, company_id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'planning_vessel_permissions_membership_fkey' and conrelid = 'public.planning_vessel_permissions'::regclass
  ) then
    alter table public.planning_vessel_permissions
      add constraint planning_vessel_permissions_membership_fkey
      foreign key (company_id, user_id) references public.company_memberships(company_id, user_id) on delete cascade;
  end if;
end $$;

create or replace function public.planning_user_can(
  target_action text,
  target_company_id bigint,
  target_vessel_id bigint default null,
  target_starts_on date default null,
  target_ends_on date default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.user_belongs_to_company(target_company_id)
    and (
      exists (
        select 1
        from public.user_roles user_role
        join public.planning_action_permissions permission on permission.role_key = user_role.role_key
        where user_role.user_id = (select auth.uid())
          and user_role.company_id = target_company_id
          and permission.action_key = target_action
          and (
            permission.scope_mode = 'company'
            or (
              permission.scope_mode = 'assigned_vessel'
              and target_vessel_id is not null
              and exists (
                select 1
                from public.planning_assignments assignment
                where assignment.company_id = target_company_id
                  and assignment.vessel_id = target_vessel_id
                  and assignment.captain_person_id = public.current_person_id()
                  and assignment.confirmation_status <> 'cancelled'
                  and (target_starts_on is null or assignment.ends_on >= target_starts_on)
                  and (target_ends_on is null or assignment.starts_on <= target_ends_on)
              )
            )
          )
      )
      or (
        target_vessel_id is not null
        and exists (
          select 1
          from public.planning_vessel_permissions vessel_permission
          where vessel_permission.company_id = target_company_id
            and vessel_permission.user_id = (select auth.uid())
            and vessel_permission.vessel_id = target_vessel_id
            and vessel_permission.action_key = target_action
            and vessel_permission.revoked_at is null
            and (vessel_permission.starts_on is null or target_ends_on is null or vessel_permission.starts_on <= target_ends_on)
            and (vessel_permission.ends_on is null or target_starts_on is null or vessel_permission.ends_on >= target_starts_on)
        )
      )
    );
$$;

create or replace function public.planning_can_read_row(
  target_company_id bigint,
  target_vessel_id bigint,
  target_person_id bigint,
  target_starts_on date,
  target_ends_on date
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.user_belongs_to_company(target_company_id)
    and (
      exists (
        select 1
        from public.user_roles user_role
        join public.planning_action_permissions permission on permission.role_key = user_role.role_key
        where user_role.user_id = (select auth.uid())
          and user_role.company_id = target_company_id
          and permission.action_key = 'read'
          and permission.scope_mode = 'company'
      )
      or target_person_id = public.current_person_id()
      or public.planning_user_can('read', target_company_id, target_vessel_id, target_starts_on, target_ends_on)
      or (
        target_vessel_id is not null
        and exists (
          select 1
          from public.planning_assignments assignment
          where assignment.company_id = target_company_id
            and assignment.vessel_id = target_vessel_id
            and assignment.crew_person_id = public.current_person_id()
            and assignment.confirmation_status <> 'cancelled'
            and assignment.ends_on >= target_starts_on
            and assignment.starts_on <= target_ends_on
        )
      )
    );
$$;

create or replace function public.planning_current_actor_name()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(nullif(trim(profile.display_name), ''), profile.email, (select auth.uid())::text)
  from public.profiles profile
  where profile.id = (select auth.uid());
$$;

revoke all on function public.planning_user_can(text, bigint, bigint, date, date) from public, anon;
revoke all on function public.planning_can_read_row(bigint, bigint, bigint, date, date) from public, anon;
revoke all on function public.planning_current_actor_name() from public, anon;
grant execute on function public.planning_user_can(text, bigint, bigint, date, date) to authenticated;
grant execute on function public.planning_can_read_row(bigint, bigint, bigint, date, date) to authenticated;

create or replace function public.current_person_id()
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select person.id
  from public.people person
  where person.user_id = (select auth.uid())
    and person.company_id = public.current_planning_company_id()
  limit 1;
$$;

create or replace function public.assert_planning_company_references()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.company_id is null then
    raise exception using errcode = '23502', message = 'PLANNING_COMPANY_REQUIRED';
  end if;

  if tg_table_name = 'planning_assignments' then
    if not exists (select 1 from public.vessels vessel where vessel.id = new.vessel_id and vessel.company_id = new.company_id)
      or not exists (select 1 from public.people person where person.id = new.crew_person_id and person.company_id = new.company_id)
      or (new.captain_person_id is not null and not exists (select 1 from public.people person where person.id = new.captain_person_id and person.company_id = new.company_id)) then
      raise exception using errcode = '23514', message = 'PLANNING_COMPANY_MISMATCH: affectation.';
    end if;
  elsif tg_table_name in ('planning_days', 'planning_periods') then
    if (new.vessel_id is not null and not exists (select 1 from public.vessels vessel where vessel.id = new.vessel_id and vessel.company_id = new.company_id))
      or (new.person_id is not null and not exists (select 1 from public.people person where person.id = new.person_id and person.company_id = new.company_id)) then
      raise exception using errcode = '23514', message = 'PLANNING_COMPANY_MISMATCH: historique.';
    end if;
  elsif tg_table_name = 'planning_projects' then
    if (new.primary_vessel_id is not null and not exists (select 1 from public.vessels vessel where vessel.id = new.primary_vessel_id and vessel.company_id = new.company_id))
      or (new.secondary_vessel_id is not null and not exists (select 1 from public.vessels vessel where vessel.id = new.secondary_vessel_id and vessel.company_id = new.company_id)) then
      raise exception using errcode = '23514', message = 'PLANNING_COMPANY_MISMATCH: opération.';
    end if;
  elsif tg_table_name = 'fleet_certificates' then
    if new.vessel_id is not null and not exists (select 1 from public.vessels vessel where vessel.id = new.vessel_id and vessel.company_id = new.company_id) then
      raise exception using errcode = '23514', message = 'PLANNING_COMPANY_MISMATCH: certificat navire.';
    end if;
  elsif tg_table_name = 'hr_documents' then
    if not exists (select 1 from public.people person where person.id = new.person_id and person.company_id = new.company_id) then
      raise exception using errcode = '23514', message = 'PLANNING_COMPANY_MISMATCH: document marin.';
    end if;
  elsif tg_table_name = 'planning_publications' then
    if new.vessel_id is not null and not exists (select 1 from public.vessels vessel where vessel.id = new.vessel_id and vessel.company_id = new.company_id) then
      raise exception using errcode = '23514', message = 'PLANNING_COMPANY_MISMATCH: publication.';
    end if;
  elsif tg_table_name = 'planning_versions' then
    if not exists (select 1 from public.planning_publications publication where publication.id = new.publication_id and publication.company_id = new.company_id) then
      raise exception using errcode = '23514', message = 'PLANNING_COMPANY_MISMATCH: version.';
    end if;
  elsif tg_table_name = 'planning_handovers' then
    if not exists (select 1 from public.vessels vessel where vessel.id = new.vessel_id and vessel.company_id = new.company_id)
      or not exists (select 1 from public.people person where person.id = new.responsible_person_id and person.company_id = new.company_id) then
      raise exception using errcode = '23514', message = 'PLANNING_COMPANY_MISMATCH: relève.';
    end if;
  elsif tg_table_name = 'planning_derogations' then
    if not exists (select 1 from public.planning_rules rule where rule.id = new.rule_id and rule.company_id = new.company_id)
      or not exists (select 1 from public.people person where person.id = new.person_id and person.company_id = new.company_id)
      or not exists (select 1 from public.vessels vessel where vessel.id = new.vessel_id and vessel.company_id = new.company_id)
      or (new.assignment_id is not null and not exists (select 1 from public.planning_assignments assignment where assignment.id = new.assignment_id and assignment.company_id = new.company_id)) then
      raise exception using errcode = '23514', message = 'PLANNING_COMPANY_MISMATCH: dérogation.';
    end if;
  elsif tg_table_name = 'planning_change_log' then
    if new.vessel_id is not null and not exists (select 1 from public.vessels vessel where vessel.id = new.vessel_id and vessel.company_id = new.company_id) then
      raise exception using errcode = '23514', message = 'PLANNING_COMPANY_MISMATCH: historique.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.assert_planning_company_references() from public, anon, authenticated;

drop trigger if exists planning_assignments_company_guard on public.planning_assignments;
create trigger planning_assignments_company_guard before insert or update on public.planning_assignments
  for each row execute function public.assert_planning_company_references();
drop trigger if exists planning_days_company_guard on public.planning_days;
create trigger planning_days_company_guard before insert or update on public.planning_days
  for each row execute function public.assert_planning_company_references();
drop trigger if exists planning_periods_company_guard on public.planning_periods;
create trigger planning_periods_company_guard before insert or update on public.planning_periods
  for each row execute function public.assert_planning_company_references();
drop trigger if exists planning_projects_company_guard on public.planning_projects;
create trigger planning_projects_company_guard before insert or update on public.planning_projects
  for each row execute function public.assert_planning_company_references();
drop trigger if exists fleet_certificates_company_guard on public.fleet_certificates;
create trigger fleet_certificates_company_guard before insert or update on public.fleet_certificates
  for each row execute function public.assert_planning_company_references();
drop trigger if exists hr_documents_company_guard on public.hr_documents;
create trigger hr_documents_company_guard before insert or update on public.hr_documents
  for each row execute function public.assert_planning_company_references();
drop trigger if exists planning_publications_company_guard on public.planning_publications;
create trigger planning_publications_company_guard before insert or update on public.planning_publications
  for each row execute function public.assert_planning_company_references();
drop trigger if exists planning_versions_company_guard on public.planning_versions;
create trigger planning_versions_company_guard before insert or update on public.planning_versions
  for each row execute function public.assert_planning_company_references();
drop trigger if exists planning_handovers_company_guard on public.planning_handovers;
create trigger planning_handovers_company_guard before insert or update on public.planning_handovers
  for each row execute function public.assert_planning_company_references();
drop trigger if exists planning_derogations_company_guard on public.planning_derogations;
create trigger planning_derogations_company_guard before insert or update on public.planning_derogations
  for each row execute function public.assert_planning_company_references();
drop trigger if exists planning_change_log_company_guard on public.planning_change_log;
create trigger planning_change_log_company_guard before insert or update on public.planning_change_log
  for each row execute function public.assert_planning_company_references();

grant select on public.companies, public.company_memberships, public.planning_action_permissions, public.planning_vessel_permissions to authenticated;
grant insert, update on public.company_memberships, public.planning_vessel_permissions to authenticated;
grant usage on public.planning_vessel_permissions_id_seq to authenticated;

alter table public.companies enable row level security;
alter table public.company_memberships enable row level security;
alter table public.planning_action_permissions enable row level security;
alter table public.planning_vessel_permissions enable row level security;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select * from (values
      ('public.profiles', 'profiles_company_read'),
      ('public.profiles', 'profiles_company_update'),
      ('public.user_roles', 'user_roles_company_read'),
      ('public.user_roles', 'user_roles_company_admin_write'),
      ('public.people', 'people_planning_company_read'),
      ('public.people', 'people_company_office_write'),
      ('public.vessels', 'vessels_planning_company_read'),
      ('public.vessels', 'vessels_company_admin_write'),
      ('public.planning_assignments', 'planning_assignments_company_read'),
      ('public.planning_assignments', 'planning_assignments_action_write'),
      ('public.planning_days', 'planning_days_company_read'),
      ('public.planning_days', 'planning_days_action_write'),
      ('public.planning_periods', 'planning_periods_company_read'),
      ('public.planning_periods', 'planning_periods_action_write'),
      ('public.planning_projects', 'planning_projects_company_read'),
      ('public.planning_projects', 'planning_projects_action_write'),
      ('public.fleet_certificates', 'fleet_certificates_company_read'),
      ('public.hr_documents', 'hr_documents_company_read'),
      ('public.planning_rules', 'planning_rules_company_read'),
      ('public.planning_rules', 'planning_rules_company_admin_write'),
      ('public.planning_publications', 'planning_publications_company_read'),
      ('public.planning_versions', 'planning_versions_history_read'),
      ('public.planning_handovers', 'planning_handovers_company_read'),
      ('public.planning_handovers', 'planning_handovers_action_write'),
      ('public.planning_handover_positions', 'planning_handover_positions_company_read'),
      ('public.planning_handover_positions', 'planning_handover_positions_action_write'),
      ('public.planning_derogations', 'planning_derogations_company_read'),
      ('public.planning_derogations', 'planning_derogations_action_write'),
      ('public.planning_change_log', 'planning_change_log_history_read'),
      ('public.planning_change_log', 'planning_change_log_action_insert')
    ) as policies(table_name, policy_name)
  loop
    execute format('drop policy if exists %I on %s', policy_row.policy_name, policy_row.table_name);
  end loop;
end $$;

drop policy if exists companies_active_read on public.companies;
create policy companies_active_read on public.companies for select to authenticated
  using (id = (select public.current_planning_company_id()));

drop policy if exists company_memberships_scope_read on public.company_memberships;
create policy company_memberships_scope_read on public.company_memberships for select to authenticated
  using (
    company_id = (select public.current_planning_company_id())
    and (user_id = (select auth.uid()) or (select public.has_role('admin')))
  );
drop policy if exists company_memberships_admin_write on public.company_memberships;
create policy company_memberships_admin_write on public.company_memberships for all to authenticated
  using (company_id = (select public.current_planning_company_id()) and (select public.has_role('admin')))
  with check (company_id = (select public.current_planning_company_id()) and (select public.has_role('admin')));

drop policy if exists planning_action_permissions_read on public.planning_action_permissions;
create policy planning_action_permissions_read on public.planning_action_permissions for select to authenticated using (true);

drop policy if exists planning_vessel_permissions_scope_read on public.planning_vessel_permissions;
create policy planning_vessel_permissions_scope_read on public.planning_vessel_permissions for select to authenticated
  using (
    company_id = (select public.current_planning_company_id())
    and (user_id = (select auth.uid()) or (select public.planning_user_can('manage_permissions', company_id, vessel_id, starts_on, ends_on)))
  );
drop policy if exists planning_vessel_permissions_admin_write on public.planning_vessel_permissions;
create policy planning_vessel_permissions_admin_write on public.planning_vessel_permissions for all to authenticated
  using ((select public.planning_user_can('manage_permissions', company_id, vessel_id, starts_on, ends_on)))
  with check ((select public.planning_user_can('manage_permissions', company_id, vessel_id, starts_on, ends_on)));

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_company_read on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (
      active_company_id = (select public.current_planning_company_id())
      and (select public.has_any_role(array['admin', 'direction']))
    )
  );
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_company_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.has_role('admin')))
  with check (
    (id = (select auth.uid()) or (select public.has_role('admin')))
    and exists (
      select 1 from public.company_memberships membership
      where membership.user_id = profiles.id
        and membership.company_id = profiles.active_company_id
        and membership.active
    )
  );

drop policy if exists user_roles_self_read on public.user_roles;
create policy user_roles_company_read on public.user_roles for select to authenticated
  using (
    company_id = (select public.current_planning_company_id())
    and (user_id = (select auth.uid()) or (select public.has_role('admin')))
  );
drop policy if exists user_roles_admin_write on public.user_roles;
create policy user_roles_company_admin_write on public.user_roles for all to authenticated
  using (company_id = (select public.current_planning_company_id()) and (select public.has_role('admin')))
  with check (company_id = (select public.current_planning_company_id()) and (select public.has_role('admin')));

drop policy if exists people_role_read on public.people;
create policy people_planning_company_read on public.people for select to authenticated
  using (
    company_id = (select public.current_planning_company_id())
    and (
      user_id = (select auth.uid())
      or (select public.planning_user_can('read', company_id, null, null, null))
      or exists (
        select 1 from public.planning_assignments assignment
        where assignment.company_id = people.company_id
          and assignment.crew_person_id = people.id
          and assignment.captain_person_id = (select public.current_person_id())
          and assignment.confirmation_status <> 'cancelled'
      )
    )
  );
drop policy if exists people_office_write on public.people;
create policy people_company_office_write on public.people for all to authenticated
  using (company_id = (select public.current_planning_company_id()) and (select public.has_any_role(array['admin', 'direction', 'armement'])))
  with check (company_id = (select public.current_planning_company_id()) and (select public.has_any_role(array['admin', 'direction', 'armement'])));

drop policy if exists vessels_authenticated_read on public.vessels;
create policy vessels_planning_company_read on public.vessels for select to authenticated
  using (
    company_id = (select public.current_planning_company_id())
    and (
      (select public.planning_user_can('read', company_id, id, null, null))
      or exists (
        select 1 from public.planning_assignments assignment
        where assignment.company_id = vessels.company_id
          and assignment.vessel_id = vessels.id
          and assignment.confirmation_status <> 'cancelled'
          and (assignment.crew_person_id = (select public.current_person_id()) or assignment.captain_person_id = (select public.current_person_id()))
      )
    )
  );
drop policy if exists vessels_admin_write on public.vessels;
create policy vessels_company_admin_write on public.vessels for all to authenticated
  using ((select public.planning_user_can('manage_vessels', company_id, id, null, null)))
  with check ((select public.planning_user_can('manage_vessels', company_id, id, null, null)));

drop policy if exists planning_role_read on public.planning_assignments;
create policy planning_assignments_company_read on public.planning_assignments for select to authenticated
  using ((select public.planning_can_read_row(company_id, vessel_id, crew_person_id, starts_on, ends_on)));
drop policy if exists planning_admin_write on public.planning_assignments;
create policy planning_assignments_action_write on public.planning_assignments for all to authenticated
  using ((select public.planning_user_can('edit_event', company_id, vessel_id, starts_on, ends_on)))
  with check ((select public.planning_user_can('edit_event', company_id, vessel_id, starts_on, ends_on)));

drop policy if exists planning_days_role_read on public.planning_days;
create policy planning_days_company_read on public.planning_days for select to authenticated
  using ((select public.planning_can_read_row(company_id, vessel_id, person_id, work_date, coalesce(disembark_on, work_date))));
drop policy if exists planning_days_admin_write on public.planning_days;
create policy planning_days_action_write on public.planning_days for all to authenticated
  using ((select public.planning_user_can('edit_event', company_id, vessel_id, work_date, coalesce(disembark_on, work_date))))
  with check ((select public.planning_user_can('edit_event', company_id, vessel_id, work_date, coalesce(disembark_on, work_date))));

drop policy if exists planning_periods_role_read on public.planning_periods;
create policy planning_periods_company_read on public.planning_periods for select to authenticated
  using ((select public.planning_can_read_row(company_id, vessel_id, person_id, starts_on, ends_on)));
drop policy if exists planning_periods_admin_write on public.planning_periods;
create policy planning_periods_action_write on public.planning_periods for all to authenticated
  using ((select public.planning_user_can('edit_event', company_id, vessel_id, starts_on, ends_on)))
  with check ((select public.planning_user_can('edit_event', company_id, vessel_id, starts_on, ends_on)));

drop policy if exists planning_projects_role_read on public.planning_projects;
create policy planning_projects_company_read on public.planning_projects for select to authenticated
  using (
    (select public.planning_can_read_row(company_id, primary_vessel_id, null, coalesce(starts_on, current_date), coalesce(ends_on, starts_on, current_date)))
    or (secondary_vessel_id is not null and (select public.planning_can_read_row(company_id, secondary_vessel_id, null, coalesce(starts_on, current_date), coalesce(ends_on, starts_on, current_date))))
  );
drop policy if exists planning_projects_admin_write on public.planning_projects;
create policy planning_projects_action_write on public.planning_projects for all to authenticated
  using (
    (select public.planning_user_can('edit_event', company_id, primary_vessel_id, starts_on, coalesce(ends_on, starts_on)))
    and (secondary_vessel_id is null or (select public.planning_user_can('edit_event', company_id, secondary_vessel_id, starts_on, coalesce(ends_on, starts_on))))
  )
  with check (
    (select public.planning_user_can('edit_event', company_id, primary_vessel_id, starts_on, coalesce(ends_on, starts_on)))
    and (secondary_vessel_id is null or (select public.planning_user_can('edit_event', company_id, secondary_vessel_id, starts_on, coalesce(ends_on, starts_on))))
  );

drop policy if exists fleet_certificates_role_read on public.fleet_certificates;
create policy fleet_certificates_company_read on public.fleet_certificates for select to authenticated
  using ((select public.planning_can_read_row(company_id, vessel_id, null, coalesce(issued_on, current_date), coalesce(expires_on, current_date))));

drop policy if exists hr_documents_role_read on public.hr_documents;
create policy hr_documents_company_read on public.hr_documents for select to authenticated
  using (
    company_id = (select public.current_planning_company_id())
    and (
      person_id = (select public.current_person_id())
      or (select public.planning_user_can('read', company_id, null, null, null))
      or exists (
        select 1 from public.planning_assignments assignment
        where assignment.company_id = hr_documents.company_id
          and assignment.crew_person_id = hr_documents.person_id
          and assignment.captain_person_id = (select public.current_person_id())
          and assignment.confirmation_status <> 'cancelled'
      )
    )
  );

drop policy if exists planning_rules_role_read on public.planning_rules;
create policy planning_rules_company_read on public.planning_rules for select to authenticated
  using (company_id = (select public.current_planning_company_id()) and (select public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin'])));
drop policy if exists planning_rules_admin_write on public.planning_rules;
create policy planning_rules_company_admin_write on public.planning_rules for all to authenticated
  using (company_id = (select public.current_planning_company_id()) and (select public.has_role('admin')))
  with check (company_id = (select public.current_planning_company_id()) and (select public.has_role('admin')));

drop policy if exists planning_publications_planning_read on public.planning_publications;
create policy planning_publications_company_read on public.planning_publications for select to authenticated
  using (
    company_id = (select public.current_planning_company_id())
    and (
      (select public.planning_user_can('read', company_id, vessel_id, starts_on, ends_on))
      or (
        status = 'published'
        and exists (
          select 1 from public.planning_assignments assignment
          where assignment.company_id = planning_publications.company_id
            and assignment.confirmation_status <> 'cancelled'
            and assignment.ends_on >= planning_publications.starts_on
            and assignment.starts_on <= planning_publications.ends_on
            and (planning_publications.vessel_id is null or assignment.vessel_id = planning_publications.vessel_id)
            and (assignment.crew_person_id = (select public.current_person_id()) or assignment.captain_person_id = (select public.current_person_id()))
        )
      )
    )
  );

drop policy if exists planning_versions_admin_read on public.planning_versions;
create policy planning_versions_history_read on public.planning_versions for select to authenticated
  using (
    company_id = (select public.current_planning_company_id())
    and exists (
      select 1 from public.planning_publications publication
      where publication.id = planning_versions.publication_id
        and (select public.planning_user_can('view_history', publication.company_id, publication.vessel_id, publication.starts_on, publication.ends_on))
    )
  );

drop policy if exists planning_handovers_role_read on public.planning_handovers;
create policy planning_handovers_company_read on public.planning_handovers for select to authenticated
  using ((select public.planning_can_read_row(company_id, vessel_id, null, (handover_at at time zone 'Europe/Paris')::date, (handover_at at time zone 'Europe/Paris')::date)));
drop policy if exists planning_handovers_admin_write on public.planning_handovers;
create policy planning_handovers_action_write on public.planning_handovers for all to authenticated
  using ((select public.planning_user_can('manage_handover', company_id, vessel_id, (handover_at at time zone 'Europe/Paris')::date, (handover_at at time zone 'Europe/Paris')::date)))
  with check ((select public.planning_user_can('manage_handover', company_id, vessel_id, (handover_at at time zone 'Europe/Paris')::date, (handover_at at time zone 'Europe/Paris')::date)));

drop policy if exists planning_handover_positions_role_read on public.planning_handover_positions;
create policy planning_handover_positions_company_read on public.planning_handover_positions for select to authenticated
  using (exists (select 1 from public.planning_handovers handover where handover.id = planning_handover_positions.handover_id));
drop policy if exists planning_handover_positions_admin_write on public.planning_handover_positions;
create policy planning_handover_positions_action_write on public.planning_handover_positions for all to authenticated
  using (exists (
    select 1 from public.planning_handovers handover
    where handover.id = planning_handover_positions.handover_id
      and (select public.planning_user_can('manage_handover', handover.company_id, handover.vessel_id, (handover.handover_at at time zone 'Europe/Paris')::date, (handover.handover_at at time zone 'Europe/Paris')::date))
  ))
  with check (exists (
    select 1 from public.planning_handovers handover
    where handover.id = planning_handover_positions.handover_id
      and (select public.planning_user_can('manage_handover', handover.company_id, handover.vessel_id, (handover.handover_at at time zone 'Europe/Paris')::date, (handover.handover_at at time zone 'Europe/Paris')::date))
  ));

drop policy if exists planning_derogations_admin_read on public.planning_derogations;
create policy planning_derogations_company_read on public.planning_derogations for select to authenticated
  using ((select public.planning_user_can('manage_derogation', company_id, vessel_id, (starts_at at time zone 'Europe/Paris')::date, (ends_at at time zone 'Europe/Paris')::date)));
drop policy if exists planning_derogations_admin_write on public.planning_derogations;
create policy planning_derogations_action_write on public.planning_derogations for all to authenticated
  using ((select public.planning_user_can('manage_derogation', company_id, vessel_id, (starts_at at time zone 'Europe/Paris')::date, (ends_at at time zone 'Europe/Paris')::date)))
  with check ((select public.planning_user_can('manage_derogation', company_id, vessel_id, (starts_at at time zone 'Europe/Paris')::date, (ends_at at time zone 'Europe/Paris')::date)));

drop policy if exists planning_change_log_admin_read on public.planning_change_log;
create policy planning_change_log_history_read on public.planning_change_log for select to authenticated
  using ((select public.planning_user_can('view_history', company_id, vessel_id, starts_on, ends_on)));
drop policy if exists planning_change_log_admin_insert on public.planning_change_log;
create policy planning_change_log_action_insert on public.planning_change_log for insert to authenticated
  with check ((select public.planning_user_can('edit_event', company_id, vessel_id, starts_on, ends_on)) or (select public.planning_user_can('manage_vessels', company_id, vessel_id, starts_on, ends_on)));

alter table public.planning_change_log drop constraint if exists planning_change_log_entity_kind_check;
alter table public.planning_change_log add constraint planning_change_log_entity_kind_check
  check (entity_kind in ('assignment', 'day', 'period', 'project', 'vessel', 'publication', 'handover', 'handover_position', 'derogation'));
alter table public.planning_change_log drop constraint if exists planning_change_log_action_check;
alter table public.planning_change_log add constraint planning_change_log_action_check
  check (action in (
    'create', 'update', 'move', 'assign', 'unassign', 'archive', 'delete', 'cancel',
    'status_change', 'derogate', 'submit', 'validate', 'publish', 'reopen'
  ));

create or replace function public.planning_publication_snapshot(target_publication_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'scope', jsonb_build_object(
      'company_id', publication.company_id,
      'vessel_id', publication.vessel_id,
      'starts_on', publication.starts_on,
      'ends_on', publication.ends_on
    ),
    'assignments', coalesce((
      select jsonb_agg(to_jsonb(assignment) order by assignment.id)
      from public.planning_assignments assignment
      where assignment.company_id = publication.company_id
        and assignment.starts_on <= publication.ends_on
        and assignment.ends_on >= publication.starts_on
        and (publication.vessel_id is null or assignment.vessel_id = publication.vessel_id)
    ), '[]'::jsonb),
    'days', coalesce((
      select jsonb_agg(to_jsonb(day_record) order by day_record.id)
      from public.planning_days day_record
      where day_record.company_id = publication.company_id
        and day_record.work_date between publication.starts_on and publication.ends_on
        and (publication.vessel_id is null or day_record.vessel_id = publication.vessel_id)
    ), '[]'::jsonb),
    'periods', coalesce((
      select jsonb_agg(to_jsonb(period_record) order by period_record.id)
      from public.planning_periods period_record
      where period_record.company_id = publication.company_id
        and period_record.starts_on <= publication.ends_on
        and period_record.ends_on >= publication.starts_on
        and (publication.vessel_id is null or period_record.vessel_id = publication.vessel_id)
    ), '[]'::jsonb),
    'projects', coalesce((
      select jsonb_agg(to_jsonb(project) order by project.id)
      from public.planning_projects project
      where project.company_id = publication.company_id
        and project.starts_on is not null
        and project.starts_on <= publication.ends_on
        and coalesce(project.ends_on, project.starts_on) >= publication.starts_on
        and (publication.vessel_id is null or project.primary_vessel_id = publication.vessel_id or project.secondary_vessel_id = publication.vessel_id)
    ), '[]'::jsonb),
    'handovers', coalesce((
      select jsonb_agg(
        to_jsonb(handover) || jsonb_build_object(
          'positions', coalesce((
            select jsonb_agg(to_jsonb(position) order by position.position_order, position.id)
            from public.planning_handover_positions position
            where position.handover_id = handover.id
          ), '[]'::jsonb)
        ) order by handover.handover_at, handover.id
      )
      from public.planning_handovers handover
      where handover.company_id = publication.company_id
        and (handover.handover_at at time zone 'Europe/Paris')::date between publication.starts_on and publication.ends_on
        and (publication.vessel_id is null or handover.vessel_id = publication.vessel_id)
    ), '[]'::jsonb),
    'derogations', coalesce((
      select jsonb_agg(to_jsonb(derogation) order by derogation.id)
      from public.planning_derogations derogation
      where derogation.company_id = publication.company_id
        and (derogation.starts_at at time zone 'Europe/Paris')::date <= publication.ends_on
        and (derogation.ends_at at time zone 'Europe/Paris')::date >= publication.starts_on
        and (publication.vessel_id is null or derogation.vessel_id = publication.vessel_id)
    ), '[]'::jsonb)
  )
  from public.planning_publications publication
  where publication.id = target_publication_id;
$$;

revoke all on function public.planning_publication_snapshot(bigint) from public, anon, authenticated;

create or replace function public.transition_planning_publication(
  p_action text,
  p_publication_id bigint default null,
  p_starts_on date default null,
  p_ends_on date default null,
  p_vessel_id bigint default null,
  p_comment text default null
)
returns public.planning_publications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.planning_publications%rowtype;
  previous_status text;
  requested_scope_key text;
  target_company_id bigint := public.current_planning_company_id();
  normalized_comment text := nullif(trim(coalesce(p_comment, '')), '');
  actor_id uuid := (select auth.uid());
  actor_name text := public.planning_current_actor_name();
begin
  if target_company_id is null then
    raise exception using errcode = '42501', message = 'Aucune entreprise active ne permet de piloter ce planning.';
  end if;
  if p_action not in ('submit', 'validate', 'publish', 'reopen', 'archive') then
    raise exception using errcode = '22023', message = 'Action de publication inconnue.';
  end if;

  if p_publication_id is null then
    if p_action <> 'submit' then
      raise exception using errcode = '22023', message = 'La période doit être soumise avant cette action.';
    end if;
    if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then
      raise exception using errcode = '22023', message = 'La période de publication est invalide.';
    end if;
    if p_vessel_id is not null and not exists (
      select 1 from public.vessels vessel where vessel.id = p_vessel_id and vessel.company_id = target_company_id
    ) then
      raise exception using errcode = '23503', message = 'Le navire de publication est introuvable dans cette entreprise.';
    end if;
    if not public.planning_user_can('submit', target_company_id, p_vessel_id, p_starts_on, p_ends_on) then
      raise exception using errcode = '42501', message = 'Vous ne pouvez pas soumettre ce périmètre de planning.';
    end if;

    requested_scope_key := case when p_vessel_id is null then 'fleet' else 'vessel:' || p_vessel_id::text end;
    perform pg_advisory_xact_lock(hashtextextended(target_company_id::text || ':' || requested_scope_key || ':' || p_starts_on || ':' || p_ends_on, 0));

    select publication.* into target
    from public.planning_publications publication
    where publication.company_id = target_company_id
      and publication.scope_key = requested_scope_key
      and publication.starts_on = p_starts_on
      and publication.ends_on = p_ends_on
    for update;

    if not found then
      insert into public.planning_publications (
        company_id, vessel_id, scope_key, starts_on, ends_on, status,
        created_by, created_by_name, updated_by, updated_by_name
      ) values (
        target_company_id, p_vessel_id, requested_scope_key, p_starts_on, p_ends_on, 'preparation',
        actor_id, actor_name, actor_id, actor_name
      ) returning * into target;
    end if;
  else
    select publication.* into target
    from public.planning_publications publication
    where publication.id = p_publication_id
      and publication.company_id = target_company_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Cette publication de planning est introuvable.';
    end if;
    if not public.planning_user_can(p_action, target.company_id, target.vessel_id, target.starts_on, target.ends_on) then
      raise exception using errcode = '42501', message = 'Vous ne pouvez pas exécuter cette action sur ce périmètre de planning.';
    end if;
  end if;

  previous_status := target.status;
  if p_action = 'submit' then
    if target.status not in ('preparation', 'modified_after_publication') then
      raise exception using errcode = '22023', message = 'Cette période ne peut pas être soumise dans son état actuel.';
    end if;
    update public.planning_publications
    set status = 'pending_validation', comment = normalized_comment,
        submitted_at = now(), submitted_by = actor_id, submitted_by_name = actor_name,
        validated_at = null, validated_by = null, validated_by_name = null,
        locked_at = now(), locked_by = actor_id, locked_by_name = actor_name,
        updated_at = now(), updated_by = actor_id, updated_by_name = actor_name
    where id = target.id returning * into target;
  elsif p_action = 'validate' then
    if target.status <> 'pending_validation' then
      raise exception using errcode = '22023', message = 'Seul un planning en attente peut être validé.';
    end if;
    update public.planning_publications
    set status = 'validated', comment = coalesce(normalized_comment, comment),
        validated_at = now(), validated_by = actor_id, validated_by_name = actor_name,
        updated_at = now(), updated_by = actor_id, updated_by_name = actor_name
    where id = target.id returning * into target;
  elsif p_action = 'publish' then
    if target.status <> 'validated' then
      raise exception using errcode = '22023', message = 'Le planning doit être validé avant publication.';
    end if;
    update public.planning_publications
    set status = 'published', current_version = current_version + 1,
        comment = coalesce(normalized_comment, comment),
        published_at = now(), published_by = actor_id, published_by_name = actor_name,
        locked_at = coalesce(locked_at, now()), locked_by = coalesce(locked_by, actor_id),
        locked_by_name = coalesce(locked_by_name, actor_name),
        updated_at = now(), updated_by = actor_id, updated_by_name = actor_name
    where id = target.id returning * into target;

    insert into public.planning_versions (
      company_id, publication_id, version_number, snapshot, comment, created_by, created_by_name
    ) values (
      target.company_id, target.id, target.current_version,
      public.planning_publication_snapshot(target.id), normalized_comment, actor_id, actor_name
    );
  elsif p_action = 'reopen' then
    if target.status not in ('pending_validation', 'validated', 'published') then
      raise exception using errcode = '22023', message = 'Cette période est déjà modifiable.';
    end if;
    if normalized_comment is null or length(normalized_comment) < 10 then
      raise exception using errcode = '22023', message = 'La réouverture exige un motif d’au moins 10 caractères.';
    end if;
    update public.planning_publications
    set status = case when current_version > 0 then 'modified_after_publication' else 'preparation' end,
        comment = normalized_comment, locked_at = null, locked_by = null, locked_by_name = null,
        updated_at = now(), updated_by = actor_id, updated_by_name = actor_name
    where id = target.id returning * into target;
  else
    if target.status = 'archived' then
      raise exception using errcode = '22023', message = 'Cette période est déjà archivée.';
    end if;
    if normalized_comment is null or length(normalized_comment) < 10 then
      raise exception using errcode = '22023', message = 'L’archivage exige un motif d’au moins 10 caractères.';
    end if;
    update public.planning_publications
    set status = 'archived', comment = normalized_comment,
        locked_at = coalesce(locked_at, now()), locked_by = coalesce(locked_by, actor_id),
        locked_by_name = coalesce(locked_by_name, actor_name),
        updated_at = now(), updated_by = actor_id, updated_by_name = actor_name
    where id = target.id returning * into target;
  end if;

  insert into public.planning_change_log (
    company_id, entity_kind, entity_id, action, payload, changed_by, changed_by_name,
    vessel_id, starts_on, ends_on, summary
  ) values (
    target.company_id, 'publication', target.id, p_action,
    jsonb_build_object(
      'previous_status', previous_status, 'status', target.status,
      'version', target.current_version, 'starts_on', target.starts_on,
      'ends_on', target.ends_on, 'vessel_id', target.vessel_id, 'comment', normalized_comment
    ),
    actor_id, actor_name, target.vessel_id, target.starts_on, target.ends_on,
    case p_action
      when 'submit' then 'Planning soumis à validation'
      when 'validate' then 'Planning validé'
      when 'publish' then 'Planning publié en version ' || target.current_version::text
      when 'reopen' then 'Planning rouvert après publication'
      else 'Planning archivé'
    end
  );
  return target;
end;
$$;

revoke all on function public.transition_planning_publication(text, bigint, date, date, bigint, text) from public, anon, authenticated;
grant execute on function public.transition_planning_publication(text, bigint, date, date, bigint, text) to authenticated;

create or replace function public.planning_scope_is_locked(
  target_starts_on date,
  target_ends_on date,
  target_vessel_id bigint,
  target_company_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.planning_publications publication
    where publication.company_id = target_company_id
      and publication.locked_at is not null
      and publication.starts_on <= target_ends_on
      and publication.ends_on >= target_starts_on
      and (publication.vessel_id is null or publication.vessel_id = target_vessel_id)
  );
$$;

create or replace function public.planning_scope_is_locked(
  target_starts_on date,
  target_ends_on date,
  target_vessel_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.planning_scope_is_locked(
    target_starts_on,
    target_ends_on,
    target_vessel_id,
    public.current_planning_company_id()
  );
$$;

revoke all on function public.planning_scope_is_locked(date, date, bigint, bigint) from public, anon, authenticated;
revoke all on function public.planning_scope_is_locked(date, date, bigint) from public, anon, authenticated;

create or replace function public.assert_planning_mutation_unlocked()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_starts_on date;
  old_ends_on date;
  old_vessel_id bigint;
  old_secondary_vessel_id bigint;
  old_company_id bigint;
  new_starts_on date;
  new_ends_on date;
  new_vessel_id bigint;
  new_secondary_vessel_id bigint;
  new_company_id bigint;
begin
  if tg_op <> 'INSERT' then
    old_company_id := old.company_id;
    if tg_table_name = 'planning_days' then
      old_starts_on := old.work_date; old_ends_on := coalesce(old.disembark_on, old.work_date); old_vessel_id := old.vessel_id;
    elsif tg_table_name = 'planning_periods' then
      old_starts_on := old.starts_on; old_ends_on := old.ends_on; old_vessel_id := old.vessel_id;
    elsif tg_table_name = 'planning_projects' then
      old_starts_on := old.starts_on; old_ends_on := coalesce(old.ends_on, old.starts_on);
      old_vessel_id := old.primary_vessel_id; old_secondary_vessel_id := old.secondary_vessel_id;
    else
      old_starts_on := old.starts_on; old_ends_on := old.ends_on; old_vessel_id := old.vessel_id;
    end if;
  end if;

  if tg_op <> 'DELETE' then
    new_company_id := new.company_id;
    if tg_table_name = 'planning_days' then
      new_starts_on := new.work_date; new_ends_on := coalesce(new.disembark_on, new.work_date); new_vessel_id := new.vessel_id;
    elsif tg_table_name = 'planning_periods' then
      new_starts_on := new.starts_on; new_ends_on := new.ends_on; new_vessel_id := new.vessel_id;
    elsif tg_table_name = 'planning_projects' then
      new_starts_on := new.starts_on; new_ends_on := coalesce(new.ends_on, new.starts_on);
      new_vessel_id := new.primary_vessel_id; new_secondary_vessel_id := new.secondary_vessel_id;
    else
      new_starts_on := new.starts_on; new_ends_on := new.ends_on; new_vessel_id := new.vessel_id;
    end if;
  end if;

  if (
    old_starts_on is not null and (
      public.planning_scope_is_locked(old_starts_on, old_ends_on, old_vessel_id, old_company_id)
      or (old_secondary_vessel_id is not null and public.planning_scope_is_locked(old_starts_on, old_ends_on, old_secondary_vessel_id, old_company_id))
    )
  ) or (
    new_starts_on is not null and (
      public.planning_scope_is_locked(new_starts_on, new_ends_on, new_vessel_id, new_company_id)
      or (new_secondary_vessel_id is not null and public.planning_scope_is_locked(new_starts_on, new_ends_on, new_secondary_vessel_id, new_company_id))
    )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PLANNING_LOCKED: cette période est soumise, validée ou publiée.',
      hint = 'Rouvrez la période avec un motif avant de modifier ses événements.';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.assert_planning_mutation_unlocked() from public, anon, authenticated;

create or replace function public.assert_planning_handover_unlocked()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_row public.planning_handovers%rowtype;
  target_date date;
begin
  if tg_op = 'DELETE' then target_row := old; else target_row := new; end if;
  target_date := (target_row.handover_at at time zone 'Europe/Paris')::date;
  if public.planning_scope_is_locked(target_date, target_date, target_row.vessel_id, target_row.company_id) then
    raise exception using errcode = 'P0001', message = 'PLANNING_LOCKED: cette relève appartient à une période verrouillée.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.assert_planning_handover_position_unlocked()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_handover_id bigint := case when tg_op = 'DELETE' then old.handover_id else new.handover_id end;
  handover public.planning_handovers%rowtype;
  target_date date;
begin
  select item.* into handover from public.planning_handovers item where item.id = target_handover_id;
  if found then
    target_date := (handover.handover_at at time zone 'Europe/Paris')::date;
    if public.planning_scope_is_locked(target_date, target_date, handover.vessel_id, handover.company_id) then
      raise exception using errcode = 'P0001', message = 'PLANNING_LOCKED: cette bordée appartient à une période verrouillée.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.assert_planning_handover_position_company()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  handover_company_id bigint;
  handover_vessel_id bigint;
begin
  select handover.company_id, handover.vessel_id
  into handover_company_id, handover_vessel_id
  from public.planning_handovers handover
  where handover.id = new.handover_id;
  if handover_company_id is null then
    raise exception using errcode = '23503', message = 'PLANNING_HANDOVER_NOT_FOUND';
  end if;
  if (new.outgoing_person_id is not null and not exists (select 1 from public.people person where person.id = new.outgoing_person_id and person.company_id = handover_company_id))
    or (new.incoming_person_id is not null and not exists (select 1 from public.people person where person.id = new.incoming_person_id and person.company_id = handover_company_id))
    or (new.outgoing_assignment_id is not null and not exists (select 1 from public.planning_assignments assignment where assignment.id = new.outgoing_assignment_id and assignment.company_id = handover_company_id and assignment.vessel_id = handover_vessel_id))
    or (new.incoming_assignment_id is not null and not exists (select 1 from public.planning_assignments assignment where assignment.id = new.incoming_assignment_id and assignment.company_id = handover_company_id and assignment.vessel_id = handover_vessel_id)) then
    raise exception using errcode = '23514', message = 'PLANNING_COMPANY_MISMATCH: poste de relève.';
  end if;
  return new;
end;
$$;

create or replace function public.assert_planning_derogation_unlocked()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_row public.planning_derogations%rowtype;
  target_start date;
  target_end date;
begin
  if tg_op = 'DELETE' then target_row := old; else target_row := new; end if;
  target_start := (target_row.starts_at at time zone 'Europe/Paris')::date;
  target_end := (target_row.ends_at at time zone 'Europe/Paris')::date;
  if public.planning_scope_is_locked(target_start, target_end, target_row.vessel_id, target_row.company_id) then
    raise exception using errcode = 'P0001', message = 'PLANNING_LOCKED: cette dérogation appartient à une période verrouillée.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.assert_planning_handover_unlocked() from public, anon, authenticated;
revoke all on function public.assert_planning_handover_position_unlocked() from public, anon, authenticated;
revoke all on function public.assert_planning_handover_position_company() from public, anon, authenticated;
revoke all on function public.assert_planning_derogation_unlocked() from public, anon, authenticated;

drop trigger if exists planning_handover_positions_company_guard on public.planning_handover_positions;
create trigger planning_handover_positions_company_guard before insert or update on public.planning_handover_positions
  for each row execute function public.assert_planning_handover_position_company();
drop trigger if exists planning_handover_positions_lock_guard on public.planning_handover_positions;
create trigger planning_handover_positions_lock_guard before insert or update or delete on public.planning_handover_positions
  for each row execute function public.assert_planning_handover_position_unlocked();
drop trigger if exists planning_derogations_lock_guard on public.planning_derogations;
create trigger planning_derogations_lock_guard before insert or update or delete on public.planning_derogations
  for each row execute function public.assert_planning_derogation_unlocked();

create or replace function public.audit_planning_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  before_row jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  after_row jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  target_row jsonb := coalesce(after_row, before_row);
  target_kind text;
  target_id bigint;
  target_action text;
  target_company_id bigint;
  target_vessel_id bigint;
  target_starts_on date;
  target_ends_on date;
  target_summary text;
  actor_name text := public.planning_current_actor_name();
begin
  target_kind := case tg_table_name
    when 'planning_assignments' then 'assignment'
    when 'planning_days' then 'day'
    when 'planning_periods' then 'period'
    when 'planning_projects' then 'project'
    when 'planning_handovers' then 'handover'
    when 'planning_handover_positions' then 'handover_position'
    when 'planning_derogations' then 'derogation'
  end;
  target_id := (target_row->>'id')::bigint;

  if tg_table_name = 'planning_handover_positions' then
    select handover.company_id, handover.vessel_id,
           (handover.handover_at at time zone 'Europe/Paris')::date
    into target_company_id, target_vessel_id, target_starts_on
    from public.planning_handovers handover
    where handover.id = (target_row->>'handover_id')::bigint;
    target_company_id := coalesce(target_company_id, public.current_planning_company_id());
    target_ends_on := target_starts_on;
  else
    target_company_id := (target_row->>'company_id')::bigint;
    target_vessel_id := nullif(coalesce(target_row->>'vessel_id', target_row->>'primary_vessel_id'), '')::bigint;
    if tg_table_name = 'planning_days' then
      target_starts_on := (target_row->>'work_date')::date;
      target_ends_on := coalesce(nullif(target_row->>'disembark_on', '')::date, target_starts_on);
    elsif tg_table_name in ('planning_assignments', 'planning_periods', 'planning_projects') then
      target_starts_on := nullif(target_row->>'starts_on', '')::date;
      target_ends_on := coalesce(nullif(target_row->>'ends_on', '')::date, target_starts_on);
    elsif tg_table_name = 'planning_handovers' then
      target_starts_on := ((target_row->>'handover_at')::timestamptz at time zone 'Europe/Paris')::date;
      target_ends_on := target_starts_on;
    elsif tg_table_name = 'planning_derogations' then
      target_starts_on := ((target_row->>'starts_at')::timestamptz at time zone 'Europe/Paris')::date;
      target_ends_on := ((target_row->>'ends_at')::timestamptz at time zone 'Europe/Paris')::date;
    end if;
  end if;

  if tg_op = 'INSERT' then
    target_action := case when target_kind = 'assignment' then 'assign' when target_kind = 'derogation' then 'derogate' else 'create' end;
  elsif tg_op = 'DELETE' then
    target_action := case when target_kind = 'assignment' then 'unassign' else 'delete' end;
  elsif target_kind = 'assignment' and coalesce(before_row->>'confirmation_status', '') <> 'cancelled' and after_row->>'confirmation_status' = 'cancelled' then
    target_action := 'unassign';
  elsif target_kind in ('assignment', 'day', 'period', 'project', 'handover') and (
    before_row->>'vessel_id' is distinct from after_row->>'vessel_id'
    or before_row->>'primary_vessel_id' is distinct from after_row->>'primary_vessel_id'
    or before_row->>'starts_on' is distinct from after_row->>'starts_on'
    or before_row->>'ends_on' is distinct from after_row->>'ends_on'
    or before_row->>'starts_at' is distinct from after_row->>'starts_at'
    or before_row->>'ends_at' is distinct from after_row->>'ends_at'
    or before_row->>'work_date' is distinct from after_row->>'work_date'
    or before_row->>'handover_at' is distinct from after_row->>'handover_at'
  ) then
    target_action := 'move';
  elsif target_kind = 'derogation' and before_row->>'status' is distinct from after_row->>'status' and after_row->>'status' = 'revoked' then
    target_action := 'cancel';
  elsif before_row->>'status' is distinct from after_row->>'status'
    or before_row->>'status_label' is distinct from after_row->>'status_label'
    or before_row->>'confirmation_status' is distinct from after_row->>'confirmation_status'
    or before_row->>'day_status' is distinct from after_row->>'day_status'
    or before_row->>'sailor_status' is distinct from after_row->>'sailor_status' then
    target_action := case when lower(coalesce(after_row->>'status', after_row->>'status_label', '')) ~ '(cancel|annul)' then 'cancel' else 'status_change' end;
  else
    target_action := 'update';
  end if;

  target_summary := case target_action
    when 'assign' then 'Marin affecté au navire'
    when 'unassign' then 'Marin désaffecté du navire'
    when 'move' then 'Événement déplacé ou redimensionné'
    when 'cancel' then 'Élément annulé ou révoqué'
    when 'derogate' then 'Dérogation enregistrée'
    when 'status_change' then 'Statut modifié'
    when 'create' then 'Élément créé'
    when 'delete' then 'Élément supprimé'
    else 'Élément modifié'
  end;

  insert into public.planning_change_log (
    company_id, entity_kind, entity_id, action, payload, changed_by, changed_by_name,
    vessel_id, starts_on, ends_on, summary
  ) values (
    target_company_id, target_kind, target_id, target_action,
    jsonb_build_object('before', before_row, 'after', after_row),
    (select auth.uid()), actor_name, target_vessel_id, target_starts_on, target_ends_on, target_summary
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.audit_planning_mutation() from public, anon, authenticated;

create or replace function public.save_planning_handover(
  p_handover_id bigint,
  p_vessel_id bigint,
  p_handover_at timestamptz,
  p_location text,
  p_duration_minutes integer,
  p_responsible_person_id bigint,
  p_comments text,
  p_status text,
  p_positions jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_id bigint;
  target_company_id bigint := public.current_planning_company_id();
  target_date date := (p_handover_at at time zone 'Europe/Paris')::date;
  existing_handover public.planning_handovers%rowtype;
begin
  if target_company_id is null or not public.planning_user_can('manage_handover', target_company_id, p_vessel_id, target_date, target_date) then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: relève non autorisée sur ce navire.';
  end if;
  if p_handover_at is null or length(trim(coalesce(p_location, ''))) = 0 then
    raise exception using errcode = '22023', message = 'PLANNING_HANDOVER_INVALID: date, heure et lieu obligatoires.';
  end if;
  if p_duration_minutes is null or p_duration_minutes not between 0 and 1440 or p_status not in ('draft', 'planned', 'confirmed', 'completed', 'cancelled') then
    raise exception using errcode = '22023', message = 'PLANNING_HANDOVER_INVALID: durée ou statut invalide.';
  end if;
  if jsonb_typeof(p_positions) <> 'array' or jsonb_array_length(p_positions) = 0 then
    raise exception using errcode = '22023', message = 'PLANNING_HANDOVER_INVALID: au moins un poste est obligatoire.';
  end if;
  if not exists (select 1 from public.vessels vessel where vessel.id = p_vessel_id and vessel.company_id = target_company_id)
    or not exists (select 1 from public.people person where person.id = p_responsible_person_id and person.company_id = target_company_id) then
    raise exception using errcode = '23514', message = 'PLANNING_COMPANY_MISMATCH: navire ou responsable de relève.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_positions) position
    where (nullif(position->>'outgoing_person_id', '') is not null and not exists (
      select 1 from public.people person where person.id = (position->>'outgoing_person_id')::bigint and person.company_id = target_company_id
    )) or (nullif(position->>'incoming_person_id', '') is not null and not exists (
      select 1 from public.people person where person.id = (position->>'incoming_person_id')::bigint and person.company_id = target_company_id
    ))
  ) then
    raise exception using errcode = '23514', message = 'PLANNING_COMPANY_MISMATCH: marin de relève.';
  end if;

  if p_handover_id is null then
    insert into public.planning_handovers (
      company_id, vessel_id, handover_at, location, handover_duration_minutes,
      responsible_person_id, comments, status, created_by, updated_by
    ) values (
      target_company_id, p_vessel_id, p_handover_at, trim(p_location), p_duration_minutes,
      p_responsible_person_id, nullif(trim(coalesce(p_comments, '')), ''), p_status,
      (select auth.uid()), (select auth.uid())
    ) returning id into target_id;
  else
    select handover.* into existing_handover
    from public.planning_handovers handover
    where handover.id = p_handover_id and handover.company_id = target_company_id
    for update;
    if not found then raise exception using errcode = 'P0002', message = 'PLANNING_HANDOVER_NOT_FOUND'; end if;
    if not public.planning_user_can(
      'manage_handover', existing_handover.company_id, existing_handover.vessel_id,
      (existing_handover.handover_at at time zone 'Europe/Paris')::date,
      (existing_handover.handover_at at time zone 'Europe/Paris')::date
    ) then
      raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: relève existante non autorisée.';
    end if;

    update public.planning_handovers
    set vessel_id = p_vessel_id, handover_at = p_handover_at, location = trim(p_location),
        handover_duration_minutes = p_duration_minutes, responsible_person_id = p_responsible_person_id,
        comments = nullif(trim(coalesce(p_comments, '')), ''), status = p_status,
        updated_by = (select auth.uid()), updated_at = now()
    where id = p_handover_id and company_id = target_company_id
    returning id into target_id;
    delete from public.planning_handover_positions where handover_id = target_id;
  end if;

  insert into public.planning_handover_positions (
    handover_id, position_order, function_label, outgoing_person_id, incoming_person_id,
    outgoing_assignment_id, incoming_assignment_id, comments
  )
  select target_id, (position.ordinality - 1)::integer, trim(position.value->>'function_label'),
    nullif(position.value->>'outgoing_person_id', '')::bigint,
    nullif(position.value->>'incoming_person_id', '')::bigint,
    nullif(position.value->>'outgoing_assignment_id', '')::bigint,
    nullif(position.value->>'incoming_assignment_id', '')::bigint,
    nullif(trim(coalesce(position.value->>'comments', '')), '')
  from jsonb_array_elements(p_positions) with ordinality as position(value, ordinality);
  return target_id;
end;
$$;

revoke all on function public.save_planning_handover(bigint, bigint, timestamptz, text, integer, bigint, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_planning_handover(bigint, bigint, timestamptz, text, integer, bigint, text, text, jsonb) to authenticated;

create or replace function public.planning_has_active_derogation(
  target_rule_code text,
  target_person_id bigint,
  target_vessel_id bigint,
  target_starts_at timestamptz,
  target_ends_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.planning_derogations derogation
    join public.planning_rules rule
      on rule.id = derogation.rule_id
     and rule.company_id = derogation.company_id
    where derogation.company_id = public.current_planning_company_id()
      and rule.code = target_rule_code
      and derogation.person_id = target_person_id
      and derogation.vessel_id = target_vessel_id
      and derogation.status = 'active'
      and derogation.starts_at <= target_starts_at
      and derogation.ends_at >= target_ends_at
  );
$$;

create or replace function public.planning_rule_is_blocking(target_rule_code text, target_date date)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select rule.active and rule.control_level = 'blocking' and rule.effective_from <= target_date
    from public.planning_rules rule
    where rule.company_id = public.current_planning_company_id()
      and rule.code = target_rule_code
    limit 1
  ), false);
$$;

revoke all on function public.planning_has_active_derogation(text, bigint, bigint, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.planning_rule_is_blocking(text, date) from public, anon, authenticated;

drop function if exists public.planning_assignment_overview();
create function public.planning_assignment_overview()
returns table (
  id bigint,
  vessel_id bigint,
  vessel_name text,
  captain_person_id bigint,
  captain_name text,
  crew_person_id bigint,
  crew_name text,
  starts_on date,
  ends_on date,
  starts_at timestamptz,
  ends_at timestamptz,
  assignment_role text,
  status_label text,
  confirmation_status text,
  watch_group text,
  comments text,
  source_label text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select assignment.id, assignment.vessel_id, vessel.name,
    assignment.captain_person_id,
    nullif(trim(concat_ws(' ', captain.first_name, captain.last_name)), ''),
    assignment.crew_person_id,
    nullif(trim(concat_ws(' ', crew.first_name, crew.last_name)), ''),
    assignment.starts_on, assignment.ends_on, assignment.starts_at, assignment.ends_at,
    assignment.assignment_role, assignment.status_label, assignment.confirmation_status,
    assignment.watch_group, assignment.comments, assignment.source_label
  from public.planning_assignments assignment
  left join public.vessels vessel on vessel.id = assignment.vessel_id and vessel.company_id = assignment.company_id
  left join public.people captain on captain.id = assignment.captain_person_id and captain.company_id = assignment.company_id
  left join public.people crew on crew.id = assignment.crew_person_id and crew.company_id = assignment.company_id
  where assignment.company_id = public.current_planning_company_id()
    and public.planning_can_read_row(
      assignment.company_id, assignment.vessel_id, assignment.crew_person_id,
      assignment.starts_on, assignment.ends_on
    )
  order by assignment.starts_at, assignment.ends_at, coalesce(vessel.name, ''), coalesce(crew.last_name, '');
$$;

revoke all on function public.planning_assignment_overview() from public, anon;
grant execute on function public.planning_assignment_overview() to authenticated;

create or replace function public.prevent_planning_version_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception using errcode = '55000', message = 'PLANNING_VERSION_IMMUTABLE: une version publiée ne peut pas être modifiée ou supprimée.';
end;
$$;

revoke all on function public.prevent_planning_version_mutation() from public, anon, authenticated;
drop trigger if exists planning_versions_immutable on public.planning_versions;
create trigger planning_versions_immutable before update or delete on public.planning_versions
  for each row execute function public.prevent_planning_version_mutation();

drop policy if exists fleet_certificates_office_write on public.fleet_certificates;
drop policy if exists fleet_certificates_company_office_write on public.fleet_certificates;
create policy fleet_certificates_company_office_write on public.fleet_certificates for all to authenticated
  using (company_id = (select public.current_planning_company_id()) and (select public.has_any_role(array['admin', 'direction', 'armement'])))
  with check (company_id = (select public.current_planning_company_id()) and (select public.has_any_role(array['admin', 'direction', 'armement'])));

drop policy if exists hr_documents_office_write on public.hr_documents;
drop policy if exists hr_documents_company_office_write on public.hr_documents;
create policy hr_documents_company_office_write on public.hr_documents for all to authenticated
  using (company_id = (select public.current_planning_company_id()) and (select public.has_any_role(array['admin', 'direction', 'armement'])))
  with check (company_id = (select public.current_planning_company_id()) and (select public.has_any_role(array['admin', 'direction', 'armement'])));

comment on table public.companies is 'P0.4 tenant boundary. Existing SeaPilot rows are backfilled to BBTM.';
comment on table public.planning_action_permissions is 'Server-side Planning action matrix by application role.';
comment on table public.planning_vessel_permissions is 'Auditable time-bounded Planning action grants for one vessel.';
comment on table public.planning_versions is 'Immutable complete Planning snapshots retained at every publication.';
comment on function public.transition_planning_publication(text, bigint, date, date, bigint, text) is
  'P0.4 transactional lifecycle with action/vessel/company authorization, actor attribution, locking and immutable versions.';
