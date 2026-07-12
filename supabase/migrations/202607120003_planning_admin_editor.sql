alter table public.planning_assignments
  add column if not exists status_label text not null default 'En Mer',
  add column if not exists watch_group text not null default 'Affectation',
  add column if not exists comments text;

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
  assignment_role text,
  status_label text,
  watch_group text,
  comments text,
  source_label text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    assignment.id,
    assignment.vessel_id,
    vessel.name as vessel_name,
    assignment.captain_person_id,
    nullif(trim(concat_ws(' ', captain.first_name, captain.last_name)), '') as captain_name,
    assignment.crew_person_id,
    nullif(trim(concat_ws(' ', crew.first_name, crew.last_name)), '') as crew_name,
    assignment.starts_on,
    assignment.ends_on,
    assignment.assignment_role,
    assignment.status_label,
    assignment.watch_group,
    assignment.comments,
    assignment.source_label
  from public.planning_assignments assignment
  left join public.vessels vessel on vessel.id = assignment.vessel_id
  left join public.people captain on captain.id = assignment.captain_person_id
  left join public.people crew on crew.id = assignment.crew_person_id
  where
    public.has_any_role(array['admin', 'direction', 'armement'])
    or (public.has_role('capitaine') and assignment.captain_person_id = public.current_person_id())
    or assignment.crew_person_id = public.current_person_id()
  order by assignment.starts_on, assignment.ends_on, coalesce(vessel.name, ''), coalesce(crew.last_name, ''), coalesce(crew.first_name, '');
$$;

revoke all on function public.planning_assignment_overview() from public;
grant execute on function public.planning_assignment_overview() to authenticated;

drop policy if exists vessels_office_write on public.vessels;
drop policy if exists vessels_admin_write on public.vessels;
create policy vessels_admin_write on public.vessels
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

drop policy if exists planning_office_write on public.planning_assignments;
drop policy if exists planning_admin_write on public.planning_assignments;
create policy planning_admin_write on public.planning_assignments
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

drop policy if exists planning_days_office_write on public.planning_days;
drop policy if exists planning_days_admin_write on public.planning_days;
create policy planning_days_admin_write on public.planning_days
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

drop policy if exists planning_periods_office_write on public.planning_periods;
drop policy if exists planning_periods_admin_write on public.planning_periods;
create policy planning_periods_admin_write on public.planning_periods
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

drop policy if exists planning_projects_office_write on public.planning_projects;
drop policy if exists planning_projects_admin_write on public.planning_projects;
create policy planning_projects_admin_write on public.planning_projects
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

create table if not exists public.planning_change_log (
  id bigint generated always as identity primary key,
  entity_kind text not null,
  entity_id bigint not null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  changed_by uuid references public.profiles(id) on delete set null default auth.uid(),
  changed_at timestamptz not null default now(),
  constraint planning_change_log_entity_kind_check check (entity_kind in ('assignment', 'day', 'period', 'project', 'vessel')),
  constraint planning_change_log_action_check check (action in ('create', 'update', 'archive', 'delete'))
);

create index if not exists planning_change_log_entity_idx on public.planning_change_log (entity_kind, entity_id, changed_at desc);

grant select, insert on public.planning_change_log to authenticated;
grant usage on public.planning_change_log_id_seq to authenticated;
alter table public.planning_change_log enable row level security;

drop policy if exists planning_change_log_admin_read on public.planning_change_log;
create policy planning_change_log_admin_read on public.planning_change_log
  for select to authenticated using (public.has_role('admin'));

drop policy if exists planning_change_log_admin_insert on public.planning_change_log;
create policy planning_change_log_admin_insert on public.planning_change_log
  for insert to authenticated with check (public.has_role('admin'));
