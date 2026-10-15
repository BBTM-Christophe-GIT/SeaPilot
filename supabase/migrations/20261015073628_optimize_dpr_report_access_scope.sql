-- Dashboard reads must resolve the actor's scope once, rather than repeat
-- membership, Planning and assigned-vessel lookups for every report/child row.
-- The private helper has no caller-selected company or actor and retains the
-- existing module, Marin ownership, 72-hour edit and dated Captain rules.
create function private.dpr_report_access_scope(p_manage_only boolean)
returns setof bigint
language plpgsql stable security definer set search_path = '' as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_company_id bigint := public.current_planning_company_id();
  actor_person_id bigint;
  vessel_scope bigint[] := '{}'::bigint[];
begin
  if actor_user_id is null or target_company_id is null
    or not public.dpr_user_has_module_access(target_company_id) then
    return;
  end if;

  if not public.dpr_user_is_history_restricted_marin(target_company_id) then
    return query select report.id from public.dpr_reports report
      where report.company_id = target_company_id and report.deleted_at is null;
    return;
  end if;

  actor_person_id := public.current_person_id();
  if not p_manage_only then
    vessel_scope := private.assigned_vessel_read_scope(target_company_id);
  end if;

  return query
  with captain_candidates as materialized (
    select report.id as report_id, report.report_date, assignment.id as assignment_id
    from public.planning_assignments assignment
    join public.dpr_reports report on report.company_id = assignment.company_id
      and report.vessel_id = assignment.vessel_id
      and report.report_date between assignment.starts_on and assignment.ends_on
      and report.deleted_at is null
    where assignment.company_id = target_company_id
      and assignment.crew_person_id = actor_person_id
      and assignment.confirmation_status = 'confirmed'
  ), captain_reports as materialized (
    select distinct candidate.report_id from captain_candidates candidate
    where public.planning_assignment_is_captain(candidate.assignment_id, candidate.report_date)
  )
  select report.id from public.dpr_reports report
  where report.company_id = target_company_id and report.deleted_at is null
    and (
      (report.created_by = actor_user_id
        and (not p_manage_only or now() < report.created_at + interval '3 days'))
      or (not p_manage_only and report.vessel_id = any(vessel_scope))
      or report.id in (select captain.report_id from captain_reports captain)
    );
end;
$$;
revoke all on function private.dpr_report_access_scope(boolean) from public, anon, authenticated;
grant execute on function private.dpr_report_access_scope(boolean) to authenticated;

-- An uncorrelated subquery lets PostgreSQL build the allowed ID set once per
-- statement. Deleted office reports retain their existing separate permission.
alter policy dpr_reports_role_read on public.dpr_reports using (
  company_id = (select public.current_planning_company_id())
  and (
    id in (select private.dpr_report_access_scope(false))
    or (deleted_at is not null and (select public.has_any_role(array['admin', 'direction', 'armement'])))
  )
);

do $$
declare child_table text;
begin
  foreach child_table in array array[
    'dpr_daily_metrics', 'dpr_crew_members', 'dpr_other_people', 'dpr_incidents',
    'dpr_hse_actions', 'dpr_emergency_exercises', 'dpr_port_calls',
    'dpr_supplies', 'dpr_waste_records', 'dpr_files'
  ] loop
    execute format('alter policy %I on public.%I using (dpr_id in (select private.dpr_report_access_scope(false)))',
      child_table || '_company_read', child_table);
  end loop;
end;
$$;

-- Return the capability once for the dashboard instead of invoking the computed
-- dpr_report_can_manage field, which repeats the complete authorization per row.
create function public.dpr_manageable_report_ids()
returns bigint[] language sql stable security invoker set search_path = '' as $$
  select coalesce(array_agg(scope.dpr_id), '{}'::bigint[])
  from private.dpr_report_access_scope(true) scope(dpr_id);
$$;
revoke all on function public.dpr_manageable_report_ids() from public, anon, authenticated;
grant execute on function public.dpr_manageable_report_ids() to authenticated;

create or replace function public.dpr_report_projects()
returns table (id bigint, project_code text, title text, archived_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare target_company_id bigint := public.current_planning_company_id();
begin
  if (select auth.uid()) is null or target_company_id is null
    or not public.user_belongs_to_company(target_company_id)
    or not public.dpr_user_has_module_access(target_company_id) then
    raise exception 'DPR module access required' using errcode = '42501';
  end if;
  return query select project.id, project.project_code, project.title, project.archived_at
  from public.projects project
  where project.company_id = target_company_id and exists (
    select 1 from public.dpr_reports report
    where report.project_id = project.id and report.company_id = target_company_id
      and report.deleted_at is null
      and report.id in (select private.dpr_report_access_scope(false))
  )
  order by project.project_code, project.id;
end;
$$;

comment on function private.dpr_report_access_scope(boolean) is
  'Current actor DPR IDs for statement-cached read or management checks; preserves module, tenant, ownership, dated Captain and read-only assigned-vessel scope.';
notify pgrst, 'reload schema';
