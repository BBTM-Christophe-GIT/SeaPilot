create or replace function public.planning_assignment_overview()
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
    assignment.source_label
  from public.planning_assignments assignment
  left join public.vessels vessel
    on vessel.id = assignment.vessel_id
  left join public.people captain
    on captain.id = assignment.captain_person_id
  left join public.people crew
    on crew.id = assignment.crew_person_id
  where
    public.has_any_role(array['admin', 'direction', 'armement'])
    or (
      public.has_role('capitaine')
      and assignment.captain_person_id = public.current_person_id()
    )
    or assignment.crew_person_id = public.current_person_id()
  order by
    assignment.starts_on,
    assignment.ends_on,
    coalesce(vessel.name, ''),
    coalesce(crew.last_name, ''),
    coalesce(crew.first_name, '');
$$;

revoke all on function public.planning_assignment_overview() from public;
grant execute on function public.planning_assignment_overview() to authenticated;
