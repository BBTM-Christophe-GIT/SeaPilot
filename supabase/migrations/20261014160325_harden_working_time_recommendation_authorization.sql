-- A Marin with no linked HR person can make the access expression NULL.
-- SECURITY DEFINER recommendations must require explicit true authorization.
-- Patch only this guard, preserving the deployed recommendation calculations.
do $migration$
declare
  function_definition text;
  previous_guard constant text := $guard$  if target_person.id is null
    or not public.user_belongs_to_company(target_person.company_id)
    or not (
      (
        target_person.id = public.current_person_id()
        and public.has_company_role(target_person.company_id, array['marin', 'capitaine'])
      )
      or public.has_company_role(target_person.company_id, array['admin', 'armement'])
      or public.working_time_captain_can_access_period(
        target_person.company_id,
        target_person.id,
        (p_proposed_start at time zone p_timezone_name)::date,
        ((p_proposed_end - interval '1 microsecond') at time zone p_timezone_name)::date,
        p_vessel_id,
        p_watch_group
      )
    ) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: recommandation.';
  end if;
$guard$;
  hardened_guard constant text := $guard$  if target_person.id is null
    or not coalesce(public.user_belongs_to_company(target_person.company_id), false)
    or not coalesce((
      (
        target_person.id = public.current_person_id()
        and public.has_company_role(target_person.company_id, array['marin', 'capitaine'])
      )
      or public.has_company_role(target_person.company_id, array['admin', 'armement'])
      or public.working_time_captain_can_access_period(
        target_person.company_id,
        target_person.id,
        (p_proposed_start at time zone p_timezone_name)::date,
        ((p_proposed_end - interval '1 microsecond') at time zone p_timezone_name)::date,
        p_vessel_id,
        p_watch_group
      )
    ), false) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: recommandation.';
  end if;
$guard$;
begin
  select pg_get_functiondef(
    'public.working_time_interval_recommendation(bigint,timestamptz,timestamptz,text,bigint,text,bigint)'::regprocedure
  ) into function_definition;

  if position(hardened_guard in function_definition) > 0 then
    return;
  end if;
  if position(previous_guard in function_definition) = 0 then
    raise exception 'Unexpected working-time recommendation authorization definition';
  end if;

  execute replace(function_definition, previous_guard, hardened_guard);
end;
$migration$;

notify pgrst, 'reload schema';
