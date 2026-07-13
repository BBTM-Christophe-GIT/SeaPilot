-- P0.2 views and event management.
-- Reuses planning_projects and planning_assignments; no parallel event table is created.
--
-- Rollback strategy:
--   1. Drop and recreate planning_assignment_overview() from 202607120003.
--   2. Drop the three P0.2 indexes and two P0.2 constraints.
--   3. Drop event_type/responsible_name/confirmation_status only after exporting values
--      created by SeaPilot, because dropping those columns is data-destructive.

alter table public.planning_projects
  add column if not exists event_type text not null default 'operation',
  add column if not exists responsible_name text;

alter table public.planning_assignments
  add column if not exists confirmation_status text not null default 'confirmed';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'planning_projects_event_type_check'
      and conrelid = 'public.planning_projects'::regclass
  ) then
    alter table public.planning_projects
      add constraint planning_projects_event_type_check
      check (event_type in ('operation', 'transit', 'maintenance', 'unavailability'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'planning_assignments_confirmation_status_check'
      and conrelid = 'public.planning_assignments'::regclass
  ) then
    alter table public.planning_assignments
      add constraint planning_assignments_confirmation_status_check
      check (confirmation_status in ('provisional', 'confirmed', 'cancelled'))
      not valid;
  end if;
end $$;

alter table public.planning_projects
  validate constraint planning_projects_event_type_check;
alter table public.planning_assignments
  validate constraint planning_assignments_confirmation_status_check;

create index if not exists planning_projects_type_dates_idx
  on public.planning_projects (event_type, starts_on, ends_on);
create index if not exists planning_projects_responsible_name_idx
  on public.planning_projects (responsible_name)
  where responsible_name is not null;
create index if not exists planning_assignments_confirmation_dates_idx
  on public.planning_assignments (confirmation_status, starts_on, ends_on);

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
    assignment.confirmation_status,
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
revoke execute on function public.planning_assignment_overview() from anon;
grant execute on function public.planning_assignment_overview() to authenticated;

comment on column public.planning_projects.event_type is
  'P0.2 fleet event kind: operation, transit, maintenance or unavailability.';
comment on column public.planning_projects.responsible_name is
  'P0.2 operational owner displayed and filtered by the Planning module.';
comment on column public.planning_assignments.confirmation_status is
  'P0.2 assignment lifecycle: provisional, confirmed or cancelled.';
