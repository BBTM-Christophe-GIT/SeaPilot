-- Manual rollback for optimize_planning_company_permission_initplans.
-- Restores the previous expressions and explicit assignment filter exactly.
-- Does not change data, role matrices, function grants, or publication state.

alter policy planning_periods_company_read on public.planning_periods
using ((select public.planning_can_read_row(company_id, vessel_id, person_id, starts_on, ends_on)));

alter policy planning_periods_action_write on public.planning_periods
using ((select public.planning_user_can('edit_event', company_id, vessel_id, starts_on, ends_on)))
with check ((select public.planning_user_can('edit_event', company_id, vessel_id, starts_on, ends_on)));

alter policy planning_assignments_company_read on public.planning_assignments
using ((select public.planning_can_read_row(company_id, vessel_id, crew_person_id, starts_on, ends_on)));

alter policy planning_assignments_action_write on public.planning_assignments
using ((select public.planning_user_can('edit_event', company_id, vessel_id, starts_on, ends_on)))
with check ((select public.planning_user_can('edit_event', company_id, vessel_id, starts_on, ends_on)));

alter policy planning_days_company_read on public.planning_days
using ((select public.planning_can_read_row(company_id, vessel_id, person_id, work_date, coalesce(disembark_on, work_date))));

alter policy planning_days_action_write on public.planning_days
using ((select public.planning_user_can('edit_event', company_id, vessel_id, work_date, coalesce(disembark_on, work_date))))
with check ((select public.planning_user_can('edit_event', company_id, vessel_id, work_date, coalesce(disembark_on, work_date))));

alter policy planning_board_rows_read on public.planning_board_rows
using ((select public.planning_can_read_row(company_id, vessel_id, person_id, null::date, null::date)));

alter policy planning_change_log_history_read on public.planning_change_log
using ((select public.planning_user_can('view_history', company_id, vessel_id, starts_on, ends_on)));

alter policy planning_projects_company_read on public.planning_projects
using (
  (select public.planning_can_read_row(company_id, primary_vessel_id, null::bigint, coalesce(starts_on, current_date), coalesce(ends_on, starts_on, current_date)))
  or (secondary_vessel_id is not null and (select public.planning_can_read_row(company_id, secondary_vessel_id, null::bigint, coalesce(starts_on, current_date), coalesce(ends_on, starts_on, current_date))))
);

alter policy planning_projects_action_write on public.planning_projects
using (
  (select public.planning_user_can('edit_event', company_id, primary_vessel_id, starts_on, coalesce(ends_on, starts_on)))
  and (secondary_vessel_id is null or (select public.planning_user_can('edit_event', company_id, secondary_vessel_id, starts_on, coalesce(ends_on, starts_on))))
)
with check (
  (select public.planning_user_can('edit_event', company_id, primary_vessel_id, starts_on, coalesce(ends_on, starts_on)))
  and (secondary_vessel_id is null or (select public.planning_user_can('edit_event', company_id, secondary_vessel_id, starts_on, coalesce(ends_on, starts_on))))
);

create or replace function public.planning_assignment_overview()
returns table (
  id bigint, vessel_id bigint, vessel_name text, captain_person_id bigint,
  captain_name text, crew_person_id bigint, crew_name text, starts_on date,
  ends_on date, starts_at timestamptz, ends_at timestamptz, assignment_role text,
  status_label text, confirmation_status text, watch_group text, comments text,
  source_label text
)
language sql stable security definer set search_path = public, pg_temp
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
    and public.planning_can_read_row(assignment.company_id, assignment.vessel_id,
      assignment.crew_person_id, assignment.starts_on, assignment.ends_on)
  order by assignment.starts_at, assignment.ends_at, coalesce(vessel.name, ''), coalesce(crew.last_name, '');
$$;

