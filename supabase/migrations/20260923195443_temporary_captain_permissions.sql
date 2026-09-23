-- Resolve Captain authority from confirmed Planning duties, including daily overrides.
-- Permanent HR captains retain their existing eligibility. No role or HR row is changed.
create or replace function public.planning_assignment_is_captain(p_assignment_id bigint, p_work_date date)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from public.planning_assignments a
    join public.people p on p.id = a.crew_person_id and p.company_id = a.company_id
    where a.id = p_assignment_id
      and auth.uid() is not null and public.user_belongs_to_company(a.company_id)
      and p.active and (p.hired_on is null or p.hired_on <= p_work_date)
      and (p.departed_on is null or p.departed_on >= p_work_date)
      and a.confirmation_status = 'confirmed'
      and p_work_date between a.starts_on and a.ends_on
      and (p.function_label = 'Capitaine'
        or public.planning_assignment_function_on_date(a.id, p_work_date) = 'Capitaine')
      and public.planning_status_is_working(public.planning_effective_person_status(
        a.company_id, p.id, p_work_date, a.vessel_id, a.status_label
      ))
  );
$$;
revoke all on function public.planning_assignment_is_captain(bigint,date) from public, anon;
grant execute on function public.planning_assignment_is_captain(bigint,date) to authenticated;

create or replace function public.working_time_captain_matches_day(
  target_company_id bigint, target_person_id bigint,
  target_captain_person_id bigint, target_local_work_date date
)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and public.user_belongs_to_company(target_company_id)
    and exists (
      select 1 from public.planning_assignments subject_assignment
      join public.planning_assignments captain_assignment
        on captain_assignment.company_id = subject_assignment.company_id
        and captain_assignment.vessel_id = subject_assignment.vessel_id
        and lower(trim(coalesce(captain_assignment.watch_group, '')))
          = lower(trim(coalesce(subject_assignment.watch_group, '')))
      where subject_assignment.company_id = target_company_id
        and subject_assignment.crew_person_id = target_person_id
        and captain_assignment.crew_person_id = target_captain_person_id
        and target_local_work_date between subject_assignment.starts_on and subject_assignment.ends_on
        and subject_assignment.confirmation_status <> 'cancelled'
        and public.planning_assignment_is_captain(captain_assignment.id, target_local_work_date)
        and public.planning_status_is_working(public.planning_effective_person_status(
          subject_assignment.company_id, target_person_id, target_local_work_date,
          subject_assignment.vessel_id, subject_assignment.status_label
        ))
    );
$$;

create or replace function public.working_time_captain_can_access_period(
  target_company_id bigint, target_person_id bigint, target_starts_on date, target_ends_on date,
  target_vessel_id bigint default null, target_watch_group text default null
)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and public.user_belongs_to_company(target_company_id)
    and exists (
      select 1 from public.planning_assignments captain_assignment
      join public.planning_assignments crew_assignment
        on crew_assignment.company_id = captain_assignment.company_id
        and crew_assignment.vessel_id = captain_assignment.vessel_id
        and lower(trim(coalesce(crew_assignment.watch_group, '')))
          = lower(trim(coalesce(captain_assignment.watch_group, '')))
      cross join lateral generate_series(
        greatest(target_starts_on, captain_assignment.starts_on, crew_assignment.starts_on)::timestamp,
        least(target_ends_on, captain_assignment.ends_on, crew_assignment.ends_on)::timestamp,
        interval '1 day'
      ) as days(work_date)
      where captain_assignment.company_id = target_company_id
        and captain_assignment.crew_person_id = public.current_person_id()
        and captain_assignment.confirmation_status = 'confirmed'
        and captain_assignment.starts_on <= target_ends_on and captain_assignment.ends_on >= target_starts_on
        and crew_assignment.crew_person_id = target_person_id
        and crew_assignment.confirmation_status <> 'cancelled'
        and crew_assignment.starts_on <= target_ends_on and crew_assignment.ends_on >= target_starts_on
        and (target_vessel_id is null or crew_assignment.vessel_id = target_vessel_id)
        and (target_watch_group is null or lower(trim(coalesce(crew_assignment.watch_group, ''))) = lower(trim(target_watch_group)))
        and public.planning_assignment_is_captain(captain_assignment.id, days.work_date::date)
        and public.planning_status_is_working(public.planning_effective_person_status(
          crew_assignment.company_id, target_person_id, days.work_date::date,
          crew_assignment.vessel_id, crew_assignment.status_label
        ))
    );
$$;

-- Keep signatures, compliance, submission locks and the entry deadline untouched.
do $migration$
declare change record; definition text;
begin
  for change in select * from (values
    ('public.working_time_day_context(bigint,date)', $old$target_person.function_label = 'Capitaine'$old$, $new$public.planning_assignment_is_captain(target_assignment.id, p_local_work_date)$new$),
    ('public.working_time_day_context(bigint,date)', $old$candidate.function_label = 'Capitaine'$old$, $new$public.planning_assignment_is_captain(captain_assignment.id, p_local_work_date)$new$),
    ('public.working_time_actor_can_edit_day(bigint,date)', $old$actor.function_label = 'Capitaine'$old$, $new$public.working_time_captain_matches_day(register.company_id, register.person_id, actor.id, p_local_work_date)$new$),
    ('public.working_time_can_comment_register(bigint,date)', $old$actor.function_label = 'Capitaine'$old$, $new$public.working_time_captain_matches_day(register.company_id, register.person_id, actor.id, target_local_date)$new$),
    ('public.submit_working_time_day(bigint,date)', $old$actor_person.function_label = 'Capitaine'$old$, $new$public.working_time_captain_matches_day(target_register.company_id, target_register.person_id, actor_person.id, p_local_work_date)$new$),
    ('public.submit_working_time_day(bigint,date)', $old$target_person.function_label = 'Capitaine'$old$, $new$public.working_time_captain_matches_day(target_register.company_id, target_register.person_id, target_person.id, p_local_work_date)$new$),
    ('public.validate_working_time_day(bigint)', $old$actor_person.function_label = 'Capitaine'$old$, $new$public.working_time_captain_matches_day(target_approval.company_id, target_approval.person_id, actor_person.id, target_approval.local_work_date)$new$),
    ('public.working_time_entry_context(date,date)', $old$'current_person_id', actor_person_id,$old$, $new$'current_person_id', actor_person_id,
    'can_act_as_captain', public.working_time_captain_can_access_period(target_company_id, actor_person_id, p_starts_on, p_ends_on),$new$),
    ('public.working_time_can_read_signature(bigint)', $old$public.has_company_role(signature.company_id, array['capitaine'])
          and public.captain_shares_watch_with_person(signature.company_id, signature.person_id)$old$, $new$exists (
            select 1 from public.working_time_registers register
            where register.company_id = signature.company_id and register.person_id = signature.person_id
              and public.working_time_captain_can_access_period(
                register.company_id, register.person_id, register.period_start, register.period_end
              )
          )$new$)
  ) as changes(signature, old_sql, new_sql) loop
    definition := replace(pg_get_functiondef(change.signature::regprocedure), chr(13), '');
    if position(change.old_sql in definition) = 0 then
      raise exception 'Expected Captain guard missing in %', change.signature;
    end if;
    execute replace(definition, change.old_sql, change.new_sql);
  end loop;
end;
$migration$;

-- Temporary Captain DPR authority is scoped to the report date and vessel.
create or replace function public.dpr_temporary_captain_for_report(target_dpr_id bigint)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from public.dpr_reports report
    join public.planning_assignments assignment on assignment.company_id = report.company_id
      and assignment.vessel_id = report.vessel_id
      and assignment.crew_person_id = public.current_person_id()
    where report.id = target_dpr_id and report.deleted_at is null
      and public.planning_assignment_is_captain(assignment.id, report.report_date)
  );
$$;
revoke all on function public.dpr_temporary_captain_for_report(bigint) from public, anon;
grant execute on function public.dpr_temporary_captain_for_report(bigint) to authenticated;

do $migration$
declare signature regprocedure; definition text;
begin
  foreach signature in array array[
    'public.dpr_can_read_report(bigint)'::regprocedure,
    'public.dpr_user_can_manage_report(bigint)'::regprocedure
  ] loop
    definition := pg_get_functiondef(signature);
    if position('not public.dpr_user_is_history_restricted_marin(report.company_id)' in definition) = 0 then
      raise exception 'Expected DPR role guard missing in %', signature;
    end if;
    execute replace(definition,
      'not public.dpr_user_is_history_restricted_marin(report.company_id)',
      'not public.dpr_user_is_history_restricted_marin(report.company_id)
        or public.dpr_temporary_captain_for_report(report.id)');
  end loop;
end;
$migration$;

-- PostgREST computed field: the UI uses the same per-report authorization as writes.
create or replace function public.dpr_report_can_manage(report public.dpr_reports)
returns boolean language sql stable security invoker set search_path = ''
as $$ select public.dpr_user_can_manage_report(report.id); $$;
revoke all on function public.dpr_report_can_manage(public.dpr_reports) from public, anon;
grant execute on function public.dpr_report_can_manage(public.dpr_reports) to authenticated;

-- DPR crew functions come from the selected vessel/day, with HR as fallback.
do $migration$
declare definition text; old_sql text := 'coalesce(nullif(trim(person.function_label), ''''), nullif(trim(person.grade_label), ''''), ''Sans fonction'') as function_label';
begin
  definition := replace(pg_get_functiondef('public.dpr_entry_context(date,bigint)'::regprocedure), chr(13), '');
  if position(old_sql in definition) = 0 then raise exception 'Expected DPR crew function missing'; end if;
  execute replace(definition, old_sql, $new$
        coalesce((
          select nullif(trim(public.planning_assignment_function_on_date(assignment.id, target_date)), '')
          from public.planning_assignments assignment cross join selected_scope scope
          where assignment.company_id = target_company_id and assignment.crew_person_id = person.id
            and assignment.vessel_id = scope.vessel_id
            and (scope.watch_group is null or lower(trim(coalesce(assignment.watch_group, ''))) = lower(trim(scope.watch_group)))
            and target_date between assignment.starts_on and assignment.ends_on
            and assignment.confirmation_status <> 'cancelled'
            and public.planning_status_is_working(public.planning_effective_person_status(
              assignment.company_id, person.id, target_date, assignment.vessel_id, assignment.status_label
            ))
          order by (assignment.confirmation_status = 'confirmed') desc, assignment.id desc limit 1
        ), nullif(trim(person.function_label), ''), nullif(trim(person.grade_label), ''), 'Sans fonction') as function_label$new$);
end;
$migration$;

comment on function public.working_time_captain_matches_day(bigint,bigint,bigint,date) is
  'HR or temporary Planning Captain on the same confirmed vessel/watch and worked date, including daily function overrides.';
comment on function public.working_time_captain_can_access_period(bigint,bigint,date,date,bigint,text) is
  'Captain scope requires at least one shared working day within the requested period.';
notify pgrst, 'reload schema';
