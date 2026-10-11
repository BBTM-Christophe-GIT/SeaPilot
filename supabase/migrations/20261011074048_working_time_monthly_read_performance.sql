-- Monthly work/rest reads must evaluate the session's company, membership and
-- management role once, rather than once for every rolling calculation.
-- Keep the same own-person and effective Captain access checks as the existing
-- SECURITY DEFINER helpers; mutation policies and RPCs are unchanged.

alter policy working_time_registers_read on public.working_time_registers
using (
  company_id = (select public.current_planning_company_id())
  and (select public.user_belongs_to_company(public.current_planning_company_id()))
  and (
    person_id = (select public.current_person_id())
    or (select public.has_company_role(public.current_planning_company_id(), array['admin', 'direction', 'armement']))
    or public.working_time_can_read_register(id)
  )
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

  -- A rolling day has many calculation instants with the same access scope.
  -- Evaluate the original Captain rule once per distinct person/date/vessel,
  -- after cheaply eliminating assignment pairs that cannot possibly overlap.
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

alter policy working_time_calculation_windows_read on public.working_time_calculation_windows
using (id in (select public.working_time_readable_calculation_ids()));

-- The register table's RLS is the source of truth for these dependent rows.
-- This uncorrelated subquery lets PostgreSQL build the authorized register set
-- once instead of rechecking the same register for every interval or comment.
alter policy working_time_intervals_read on public.working_time_intervals
using (register_id in (select register.id from public.working_time_registers register));

alter policy working_time_day_comments_read on public.working_time_day_comments
using (register_id in (select register.id from public.working_time_registers register));

alter policy working_time_validations_read on public.working_time_validations
using (register_id in (select register.id from public.working_time_registers register));

-- A Marin exporting their own register may read the latest profile signature
-- of the Captain explicitly designated by its workflow or recorded validation.
-- The private Storage read policy calls this same guard, so both metadata and
-- image access use the same scope. No unrelated person's signature is exposed.
create or replace function public.working_time_can_read_signature(target_signature_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.working_time_profile_signatures signature
    where signature.id = target_signature_id
      and public.user_belongs_to_company(signature.company_id)
      and (
        signature.person_id = public.current_person_id()
        or public.has_company_role(signature.company_id, array['admin', 'direction', 'armement'])
        or exists (
          select 1 from public.working_time_registers register
          where register.company_id = signature.company_id
            and register.person_id = signature.person_id
            and public.working_time_captain_can_access_period(
              register.company_id, register.person_id, register.period_start, register.period_end
            )
        )
        or exists (
          select 1 from public.working_time_registers register
          where register.company_id = signature.company_id
            and public.working_time_can_read_register(register.id)
            and (
              register.requested_captain_person_id = signature.person_id
              or exists (
                select 1 from public.working_time_validations validation
                where validation.company_id = register.company_id
                  and validation.register_id = register.id
                  and validation.person_id = register.person_id
                  and validation.event_type = 'captain_validated'
                  and (
                    validation.actor_person_id = signature.person_id
                    or validation.signature_snapshot->>'signer_person_id' = signature.person_id::text
                  )
              )
              or exists (
                select 1 from public.working_time_day_approvals approval
                where approval.company_id = register.company_id
                  and approval.register_id = register.id
                  and approval.person_id = register.person_id
                  and (
                    approval.approver_person_id = signature.person_id
                    or (
                      approval.status = 'validated'
                      and (
                        approval.validated_by_person_id = signature.person_id
                        or approval.approver_signature_snapshot->>'signer_person_id' = signature.person_id::text
                      )
                    )
                  )
              )
            )
        )
      )
  );
$$;

revoke all on function public.working_time_can_read_signature(bigint) from public, anon;
grant execute on function public.working_time_can_read_signature(bigint) to authenticated;

notify pgrst, 'reload schema';
