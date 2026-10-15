-- Period checks run inside register/calculation RLS as well as entry RPCs.
-- Resolve the actor once, filter assignment pairs first, then expand only their
-- overlapping dates. Keep the authoritative daily Captain/status checks.
create or replace function public.working_time_captain_can_access_period(
  target_company_id bigint, target_person_id bigint, target_starts_on date, target_ends_on date,
  target_vessel_id bigint default null, target_watch_group text default null
)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare actor_person_id bigint;
begin
  if (select auth.uid()) is null
    or not coalesce(public.user_belongs_to_company(target_company_id), false) then
    return false;
  end if;
  actor_person_id := public.current_person_id();
  if actor_person_id is null then return false; end if;

  return exists (
    with captain_assignments as materialized (
      select assignment.id, assignment.company_id, assignment.vessel_id,
        assignment.starts_on, assignment.ends_on,
        lower(trim(coalesce(assignment.watch_group, ''))) as watch_group
      from public.planning_assignments assignment
      where assignment.company_id = target_company_id
        and assignment.crew_person_id = actor_person_id
        and assignment.confirmation_status = 'confirmed'
        and assignment.starts_on <= target_ends_on and assignment.ends_on >= target_starts_on
    ), assignment_pairs as materialized (
      select captain.id as captain_assignment_id, crew.company_id, crew.vessel_id, crew.status_label,
        greatest(target_starts_on, captain.starts_on, crew.starts_on) as starts_on,
        least(target_ends_on, captain.ends_on, crew.ends_on) as ends_on
      from captain_assignments captain
      join public.planning_assignments crew
        on crew.company_id = captain.company_id and crew.vessel_id = captain.vessel_id
        and lower(trim(coalesce(crew.watch_group, ''))) = captain.watch_group
      where crew.crew_person_id = target_person_id
        and crew.confirmation_status <> 'cancelled'
        and crew.starts_on <= target_ends_on and crew.ends_on >= target_starts_on
        and (target_vessel_id is null or crew.vessel_id = target_vessel_id)
        and (target_watch_group is null or lower(trim(coalesce(crew.watch_group, ''))) = lower(trim(target_watch_group)))
    )
    select 1 from assignment_pairs pair
    cross join lateral generate_series(pair.starts_on::timestamp, pair.ends_on::timestamp, interval '1 day') days(work_date)
    where public.planning_assignment_is_captain(pair.captain_assignment_id, days.work_date::date)
      and public.planning_status_is_working(public.planning_effective_person_status(
        pair.company_id, target_person_id, days.work_date::date, pair.vessel_id, pair.status_label
      ))
  );
end;
$$;

notify pgrst, 'reload schema';
