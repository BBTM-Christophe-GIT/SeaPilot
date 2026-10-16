-- Resolve existing company-wide capabilities once per statement. Keep the
-- original row-dependent predicates for personal, assigned-vessel and delegated
-- access. No role matrix, grant, tenant boundary or data is changed.
-- ALL policies also participate in SELECT, so both permissive paths need the
-- same optimization. WITH CHECK uses the identical permission as USING.

alter policy planning_periods_company_read on public.planning_periods
using (
  company_id = (select public.current_planning_company_id())
  and ((select public.planning_can_read_row(public.current_planning_company_id(), null::bigint, null::bigint, null::date, null::date))
    or (select public.planning_can_read_row(company_id, vessel_id, person_id, starts_on, ends_on)))
);

alter policy planning_periods_action_write on public.planning_periods
using (
  company_id = (select public.current_planning_company_id())
  and ((select public.planning_user_can('edit_event', public.current_planning_company_id(), null::bigint, null::date, null::date))
    or (select public.planning_user_can('edit_event', company_id, vessel_id, starts_on, ends_on)))
)
with check (
  company_id = (select public.current_planning_company_id())
  and ((select public.planning_user_can('edit_event', public.current_planning_company_id(), null::bigint, null::date, null::date))
    or (select public.planning_user_can('edit_event', company_id, vessel_id, starts_on, ends_on)))
);

alter policy planning_assignments_company_read on public.planning_assignments
using (
  company_id = (select public.current_planning_company_id())
  and ((select public.planning_can_read_row(public.current_planning_company_id(), null::bigint, null::bigint, null::date, null::date))
    or (select public.planning_can_read_row(company_id, vessel_id, crew_person_id, starts_on, ends_on)))
);

alter policy planning_assignments_action_write on public.planning_assignments
using (
  company_id = (select public.current_planning_company_id())
  and ((select public.planning_user_can('edit_event', public.current_planning_company_id(), null::bigint, null::date, null::date))
    or (select public.planning_user_can('edit_event', company_id, vessel_id, starts_on, ends_on)))
)
with check (
  company_id = (select public.current_planning_company_id())
  and ((select public.planning_user_can('edit_event', public.current_planning_company_id(), null::bigint, null::date, null::date))
    or (select public.planning_user_can('edit_event', company_id, vessel_id, starts_on, ends_on)))
);

alter policy planning_days_company_read on public.planning_days
using (
  company_id = (select public.current_planning_company_id())
  and ((select public.planning_can_read_row(public.current_planning_company_id(), null::bigint, null::bigint, null::date, null::date))
    or (select public.planning_can_read_row(company_id, vessel_id, person_id, work_date, coalesce(disembark_on, work_date))))
);

alter policy planning_days_action_write on public.planning_days
using (
  company_id = (select public.current_planning_company_id())
  and ((select public.planning_user_can('edit_event', public.current_planning_company_id(), null::bigint, null::date, null::date))
    or (select public.planning_user_can('edit_event', company_id, vessel_id, work_date, coalesce(disembark_on, work_date))))
)
with check (
  company_id = (select public.current_planning_company_id())
  and ((select public.planning_user_can('edit_event', public.current_planning_company_id(), null::bigint, null::date, null::date))
    or (select public.planning_user_can('edit_event', company_id, vessel_id, work_date, coalesce(disembark_on, work_date))))
);

alter policy planning_board_rows_read on public.planning_board_rows
using (
  company_id = (select public.current_planning_company_id())
  and ((select public.planning_can_read_row(public.current_planning_company_id(), null::bigint, null::bigint, null::date, null::date))
    or (select public.planning_can_read_row(company_id, vessel_id, person_id, null::date, null::date)))
);

alter policy planning_change_log_history_read on public.planning_change_log
using (
  company_id = (select public.current_planning_company_id())
  and ((select public.planning_user_can('view_history', public.current_planning_company_id(), null::bigint, null::date, null::date))
    or (select public.planning_user_can('view_history', company_id, vessel_id, starts_on, ends_on)))
);

alter policy planning_projects_company_read on public.planning_projects
using (
  company_id = (select public.current_planning_company_id())
  and ((select public.planning_can_read_row(public.current_planning_company_id(), null::bigint, null::bigint, null::date, null::date))
    or (select public.planning_can_read_row(company_id, primary_vessel_id, null::bigint, coalesce(starts_on, current_date), coalesce(ends_on, starts_on, current_date)))
    or (secondary_vessel_id is not null and (select public.planning_can_read_row(company_id, secondary_vessel_id, null::bigint, coalesce(starts_on, current_date), coalesce(ends_on, starts_on, current_date)))))
);

alter policy planning_projects_action_write on public.planning_projects
using (
  company_id = (select public.current_planning_company_id())
  and ((select public.planning_user_can('edit_event', public.current_planning_company_id(), null::bigint, null::date, null::date))
    or ((select public.planning_user_can('edit_event', company_id, primary_vessel_id, starts_on, coalesce(ends_on, starts_on)))
      and (secondary_vessel_id is null or (select public.planning_user_can('edit_event', company_id, secondary_vessel_id, starts_on, coalesce(ends_on, starts_on))))))
)
with check (
  company_id = (select public.current_planning_company_id())
  and ((select public.planning_user_can('edit_event', public.current_planning_company_id(), null::bigint, null::date, null::date))
    or ((select public.planning_user_can('edit_event', company_id, primary_vessel_id, starts_on, coalesce(ends_on, starts_on)))
      and (secondary_vessel_id is null or (select public.planning_user_can('edit_event', company_id, secondary_vessel_id, starts_on, coalesce(ends_on, starts_on))))))
);

-- This existing SECURITY DEFINER reader already applies the same explicit
-- per-row authorization. Retain its signature, owner, grants and fallback.
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
  where assignment.company_id = (select public.current_planning_company_id())
    and (
      (select public.planning_can_read_row(public.current_planning_company_id(), null::bigint, null::bigint, null::date, null::date))
      or public.planning_can_read_row(assignment.company_id, assignment.vessel_id,
        assignment.crew_person_id, assignment.starts_on, assignment.ends_on)
    )
  order by assignment.starts_at, assignment.ends_at, coalesce(vessel.name, ''), coalesce(crew.last_name, '');
$$;

