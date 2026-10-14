-- Captain access is based on actual HR/Planning duties, including temporary
-- daily replacements. Cache this necessary (not sufficient) condition once per
-- SELECT, before expanding historical watch/period permissions for other people.
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.working_time_actor_has_captain_duties()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_company_id bigint := public.current_planning_company_id();
  actor_person_id bigint := public.current_person_id();
begin
  if (select auth.uid()) is null or actor_person_id is null
    or not public.user_belongs_to_company(actor_company_id) then
    return false;
  end if;

  return exists (
    select 1
    from public.people actor
    join public.planning_assignments assignment
      on assignment.company_id = actor.company_id
      and assignment.crew_person_id = actor.id
      and assignment.confirmation_status = 'confirmed'
    where actor.id = actor_person_id
      and actor.company_id = actor_company_id
      and actor.active
      and (
        actor.function_label = 'Capitaine'
        or assignment.assignment_role = 'Capitaine'
        or exists (
          select 1 from public.planning_days day_note
          where day_note.company_id = assignment.company_id
            and day_note.slot365 = 'assignment:' || assignment.id::text
            and day_note.source_label = 'seapilot-assignment-note'
            and day_note.work_date between assignment.starts_on and assignment.ends_on
            and trim(day_note.function_label) = 'Capitaine'
        )
      )
  );
end;
$$;

revoke all on function private.working_time_actor_has_captain_duties() from public, anon;
grant execute on function private.working_time_actor_has_captain_duties() to authenticated;

drop policy if exists working_time_registers_read on public.working_time_registers;
create policy working_time_registers_read on public.working_time_registers
for select to authenticated using (
  company_id = (select public.current_planning_company_id())
  and (select public.user_belongs_to_company(public.current_planning_company_id()))
  and (
    person_id = (select public.current_person_id())
    or (select public.has_company_role(public.current_planning_company_id(), array['admin', 'direction', 'armement']))
    or case when (select private.working_time_actor_has_captain_duties())
      then public.working_time_can_read_register(id)
      else false
    end
  )
);

-- Share the cached register policy instead of evaluating its full historical
-- Captain predicate once for every interval, comment or validation event.
drop policy if exists working_time_intervals_read on public.working_time_intervals;
create policy working_time_intervals_read on public.working_time_intervals
for select to authenticated using (
  register_id in (select register.id from public.working_time_registers register)
);
drop policy if exists working_time_day_comments_read on public.working_time_day_comments;
create policy working_time_day_comments_read on public.working_time_day_comments
for select to authenticated using (
  register_id in (select register.id from public.working_time_registers register)
);
drop policy if exists working_time_validations_read on public.working_time_validations;
create policy working_time_validations_read on public.working_time_validations
for select to authenticated using (
  register_id in (select register.id from public.working_time_registers register)
);

create or replace function public.working_time_readable_calculation_ids()
returns setof bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  actor_person_id bigint := public.current_person_id();
begin
  if (select auth.uid()) is null or not public.user_belongs_to_company(target_company_id) then
    return;
  end if;
  if public.has_company_role(target_company_id, array['admin', 'direction', 'armement']) then
    return query select calculation.id from public.working_time_calculation_windows calculation
      where calculation.company_id = target_company_id;
    return;
  end if;
  if actor_person_id is null then
    return;
  end if;
  return query select calculation.id from public.working_time_calculation_windows calculation
    where calculation.company_id = target_company_id and calculation.person_id = actor_person_id;

  if not private.working_time_actor_has_captain_duties() then
    return;
  end if;

  -- Retain the complete deployed Captain rule, including historical duty days,
  -- effective work statuses, vessel and watch, once per distinct rolling scope.
  return query
    with candidate_contexts as materialized (
      select distinct calculation.company_id, calculation.person_id,
        calculation.local_window_end_date, calculation.vessel_id
      from public.working_time_calculation_windows calculation
      join public.planning_assignments captain_assignment
        on captain_assignment.company_id = calculation.company_id
          and captain_assignment.crew_person_id = actor_person_id
          and captain_assignment.confirmation_status = 'confirmed'
      join public.planning_assignments crew_assignment
        on crew_assignment.company_id = captain_assignment.company_id
          and crew_assignment.crew_person_id = calculation.person_id
          and crew_assignment.vessel_id = captain_assignment.vessel_id
          and lower(trim(coalesce(crew_assignment.watch_group, '')))
            = lower(trim(coalesce(captain_assignment.watch_group, '')))
          and crew_assignment.confirmation_status <> 'cancelled'
      where calculation.company_id = target_company_id
        and calculation.person_id <> actor_person_id
        and (calculation.vessel_id is null or crew_assignment.vessel_id = calculation.vessel_id)
        and greatest(captain_assignment.starts_on, crew_assignment.starts_on, calculation.local_window_end_date - 6)
          <= least(captain_assignment.ends_on, crew_assignment.ends_on, calculation.local_window_end_date)
    ), allowed_contexts as materialized (
      select * from candidate_contexts scope
      where public.working_time_captain_can_access_period(scope.company_id, scope.person_id,
        scope.local_window_end_date - 6, scope.local_window_end_date, scope.vessel_id, null)
    )
    select calculation.id from public.working_time_calculation_windows calculation
    join allowed_contexts scope on scope.company_id = calculation.company_id
      and scope.person_id = calculation.person_id
      and scope.local_window_end_date = calculation.local_window_end_date
      and scope.vessel_id is not distinct from calculation.vessel_id;
end;
$$;

revoke all on function public.working_time_readable_calculation_ids() from public, anon;
grant execute on function public.working_time_readable_calculation_ids() to authenticated;

drop policy if exists working_time_calculation_windows_read on public.working_time_calculation_windows;
create policy working_time_calculation_windows_read on public.working_time_calculation_windows
for select to authenticated using (
  id in (select public.working_time_readable_calculation_ids())
);
