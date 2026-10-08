-- Managers can opt a selected collaborator into period-based leave/RTT rights.
-- Existing membership, custom periods and balances are preserved.
grant insert(company_id,person_id) on public.planning_leave_counter_people to authenticated;
create policy leave_counter_people_insert on public.planning_leave_counter_people for insert to authenticated
with check(company_id=(select public.current_planning_company_id())
  and public.planning_absence_balance_has_access(person_id,true));

create function public.save_planning_leave_rights_period(
  p_person_id bigint,p_starts_on date,p_ends_on date,p_leave_entitlement numeric,p_rtt_entitlement numeric
)
returns void language plpgsql security invoker set search_path = '' as $$
declare target_company bigint;
begin
  if not public.planning_absence_balance_has_access(p_person_id,true) then
    raise exception 'PLANNING_PERMISSION_DENIED: droits congés et RTT.' using errcode='42501';
  end if;
  if p_starts_on is null or p_ends_on is null or not isfinite(p_starts_on) or not isfinite(p_ends_on)
    or p_starts_on not between '1900-06-01'::date and '2099-06-01'::date
    or extract(month from p_starts_on)<>6 or extract(day from p_starts_on)<>1
    or p_ends_on<>(p_starts_on+interval '1 year'-interval '1 day')::date
    or p_leave_entitlement is null or p_leave_entitlement<0 or p_leave_entitlement>=100000
    or p_leave_entitlement<>round(p_leave_entitlement,2)
    or p_rtt_entitlement is null or p_rtt_entitlement<0 or p_rtt_entitlement>=100000
    or p_rtt_entitlement<>round(p_rtt_entitlement,2) then
    raise exception 'PLANNING_LEAVE_RIGHTS_PERIOD_INVALID' using errcode='22023';
  end if;
  target_company:=public.current_planning_company_id();
  -- Always lock both counters in the same order, including before enrollment.
  perform pg_advisory_xact_lock(hashtextextended(target_company::text||':leave-counter:'||p_person_id::text||':leave',0));
  perform pg_advisory_xact_lock(hashtextextended(target_company::text||':leave-counter:'||p_person_id::text||':rtt',0));
  insert into public.planning_leave_counter_people(company_id,person_id)
  values(target_company,p_person_id) on conflict(company_id,person_id) do nothing;
  perform public.save_planning_leave_counter_period(p_person_id,'leave',p_starts_on,p_ends_on,p_leave_entitlement);
  perform public.save_planning_leave_counter_period(p_person_id,'rtt',p_starts_on,p_ends_on,p_rtt_entitlement);
end $$;
revoke all on function public.save_planning_leave_rights_period(bigint,date,date,numeric,numeric) from public,anon;
grant execute on function public.save_planning_leave_rights_period(bigint,date,date,numeric,numeric) to authenticated;

comment on function public.save_planning_leave_rights_period(bigint,date,date,numeric,numeric)
is 'Atomic June 1–May 31 Congés/RTT total entitlement save and selected-person enrollment; existing periods retained, managers only, caller RLS enforced.';
notify pgrst,'reload schema';
