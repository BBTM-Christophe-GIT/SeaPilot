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
create index if not exists planning_assignments_captain_crew_dates_idx
  on public.planning_assignments (captain_person_id, crew_person_id, starts_on, ends_on);
create index if not exists planning_assignments_crew_dates_scope_idx
  on public.planning_assignments (crew_person_id, starts_on, ends_on, captain_person_id, vessel_id);
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
  )
  and public.has_role('capitaine');
$$;

create or replace function public.validation_request_scope_matches(
  target_submitted_by_person_id bigint,
  target_captain_person_id bigint,
  target_vessel_id bigint,
  target_submitted_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.planning_assignments assignment
    where assignment.crew_person_id = target_submitted_by_person_id
      and assignment.captain_person_id is not null
      and target_submitted_at::date between assignment.starts_on and assignment.ends_on
      and (
        target_captain_person_id is null
        or assignment.captain_person_id = target_captain_person_id
      )
      and (
        target_vessel_id is null
        or assignment.vessel_id = target_vessel_id
      )
  );
$$;

create or replace function public.is_captain_for_validation_request(target_request_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_role('capitaine')
    and exists (
      select 1
      from public.validation_requests request
      join public.planning_assignments assignment
        on assignment.crew_person_id = request.submitted_by_person_id
       and request.submitted_at::date between assignment.starts_on and assignment.ends_on
       and (
         request.vessel_id is null
         or assignment.vessel_id = request.vessel_id
       )
       and (
         request.captain_person_id is null
         or assignment.captain_person_id = request.captain_person_id
       )
      where request.id = target_request_id
        and assignment.captain_person_id = public.current_person_id()
    );
$$;

create or replace function public.protect_validation_request_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.submitted_at := now();

  if not public.has_any_role(array['admin', 'direction', 'armement'])
    and new.submitted_by_person_id is distinct from public.current_person_id() then
    raise exception 'validation request submitter must be the current person';
  end if;

  if new.status <> 'pending' then
    raise exception 'validation request inserts must start pending';
  end if;

  if new.decided_by is not null or new.decided_at is not null then
    raise exception 'validation request inserts must be undecided';
  end if;

  if not public.validation_request_scope_matches(
    new.submitted_by_person_id,
    new.captain_person_id,
    new.vessel_id,
    new.submitted_at
  ) then
    raise exception 'validation request captain or vessel is not consistent with planning';
  end if;

  return new;
end;
$$;

create or replace function public.protect_validation_request_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.has_any_role(array['admin', 'direction', 'armement']) then
    return new;
  end if;

  if new.id is distinct from old.id
    or new.submitted_by_person_id is distinct from old.submitted_by_person_id
    or new.captain_person_id is distinct from old.captain_person_id
    or new.vessel_id is distinct from old.vessel_id
    or new.module_key is distinct from old.module_key
    or new.request_type is distinct from old.request_type
    or new.payload is distinct from old.payload
    or new.submitted_at is distinct from old.submitted_at then
    raise exception 'validation request immutable fields cannot be changed';
  end if;

  if not public.is_captain_for_validation_request(old.id) then
    raise exception 'only an authorized captain can decide this validation request';
  end if;

  new.decided_by := (select auth.uid());
  new.decided_at := now();

  if old.status <> 'pending' then
    raise exception 'only pending validation requests can be decided by captains';
  end if;

  if old.decided_by is not null or old.decided_at is not null then
    raise exception 'only undecided validation requests can be decided by captains';
  end if;

  if new.status not in ('approved', 'rejected') then
    raise exception 'captain decisions must approve or reject validation requests';
  end if;

  if new.decided_by is distinct from (select auth.uid()) then
    raise exception 'captain decisions must be attributed to the current user';
  end if;

  if new.decided_at is null then
    raise exception 'captain decisions must set decided_at';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_validation_request_insert on public.validation_requests;
create trigger protect_validation_request_insert
  before insert on public.validation_requests
  for each row
  execute function public.protect_validation_request_insert();

drop trigger if exists protect_validation_request_update on public.validation_requests;
create trigger protect_validation_request_update
  before update on public.validation_requests
  for each row
  execute function public.protect_validation_request_update();

revoke all on function public.has_role(text) from public;
revoke all on function public.has_any_role(text[]) from public;
revoke all on function public.current_person_id() from public;
revoke all on function public.is_captain_for_person(bigint, date) from public;
revoke all on function public.validation_request_scope_matches(bigint, bigint, bigint, timestamptz) from public;
revoke all on function public.is_captain_for_validation_request(bigint) from public;
revoke all on function public.protect_validation_request_insert() from public;
revoke all on function public.protect_validation_request_update() from public;

grant execute on function public.has_role(text) to authenticated;
grant execute on function public.has_any_role(text[]) to authenticated;
grant execute on function public.current_person_id() to authenticated;
grant execute on function public.is_captain_for_person(bigint, date) to authenticated;
grant execute on function public.is_captain_for_validation_request(bigint) to authenticated;

grant usage on schema public to authenticated;
grant select on
  public.roles,
  public.profiles,
  public.user_roles,
  public.people,
  public.vessels,
  public.planning_assignments,
  public.validation_requests
to authenticated;
grant update on public.profiles to authenticated;
grant insert, update, delete on
  public.user_roles,
  public.people,
  public.vessels,
  public.planning_assignments
to authenticated;
grant insert, update on public.validation_requests to authenticated;
grant usage on
  public.people_id_seq,
  public.vessels_id_seq,
  public.planning_assignments_id_seq,
  public.validation_requests_id_seq
to authenticated;

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
    or (
      public.has_role('capitaine')
      and captain_person_id = public.current_person_id()
    )
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
    or public.is_captain_for_validation_request(id)
  );

create policy validation_requests_submitter_insert on public.validation_requests
  for insert to authenticated
  with check (
    (
      public.has_any_role(array['admin', 'direction', 'armement'])
      or submitted_by_person_id = public.current_person_id()
    )
    and status = 'pending'
    and decided_by is null
    and decided_at is null
  );

create policy validation_requests_captain_update on public.validation_requests
  for update to authenticated
  using (
    public.has_any_role(array['admin', 'direction', 'armement'])
    or public.is_captain_for_validation_request(id)
  )
  with check (
    public.has_any_role(array['admin', 'direction', 'armement'])
    or public.is_captain_for_validation_request(id)
  );
