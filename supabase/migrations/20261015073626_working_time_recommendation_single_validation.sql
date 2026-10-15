-- A multi-phase recommendation used the complete single-interval calculation
-- solely to validate access and resolve the policy, then recalculated everything
-- for the phases. Keep those checks in a private helper and calculate once.
-- Extension candidates are continuous: after the first failure no later end is
-- eligible. Stop there instead of measuring all remaining half-hours.

create or replace function private.working_time_recommendation_policy(
  p_person_id bigint, p_proposed_start timestamptz, p_proposed_end timestamptz,
  p_timezone_name text, p_vessel_id bigint, p_watch_group text, p_exclude_interval_id bigint
)
returns public.planning_work_rest_policies
language plpgsql stable security definer set search_path = ''
as $$
declare
  target_person public.people%rowtype;
  applicable_policy public.planning_work_rest_policies%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: authentification requise.';
  end if;
  if p_proposed_start is null or p_proposed_end is null
    or p_proposed_end <= p_proposed_start
    or p_proposed_end > p_proposed_start + interval '24 hours' then
    raise exception using errcode = '22023', message = 'WORKING_TIME_RECOMMENDATION_INTERVAL_INVALID.';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone_name) then
    raise exception using errcode = '22023', message = 'WORKING_TIME_TIMEZONE_INVALID.';
  end if;
  select * into target_person from public.people person
  where person.id = p_person_id and person.active;
  if target_person.id is null
    or not coalesce(public.user_belongs_to_company(target_person.company_id), false)
    or not coalesce((
      (target_person.id = public.current_person_id()
        and public.has_company_role(target_person.company_id, array['marin', 'capitaine']))
      or public.has_company_role(target_person.company_id, array['admin', 'armement'])
      or public.working_time_captain_can_access_period(
        target_person.company_id, target_person.id,
        (p_proposed_start at time zone p_timezone_name)::date,
        ((p_proposed_end - interval '1 microsecond') at time zone p_timezone_name)::date,
        p_vessel_id, p_watch_group
      )
    ), false) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: recommandation.';
  end if;
  if p_vessel_id is not null and not exists (
    select 1 from public.vessels vessel where vessel.id = p_vessel_id
      and vessel.company_id = target_person.company_id and vessel.active
  ) then
    raise exception using errcode = '22023', message = 'WORKING_TIME_VESSEL_INVALID.';
  end if;
  if p_exclude_interval_id is not null and not exists (
    select 1 from public.working_time_intervals work_interval
    where work_interval.id = p_exclude_interval_id
      and work_interval.person_id = p_person_id and work_interval.voided_at is null
  ) then
    raise exception using errcode = '22023', message = 'WORKING_TIME_INTERVAL_NOT_FOUND.';
  end if;
  select policy.* into applicable_policy
  from public.planning_work_rest_policies policy
  where policy.company_id = target_person.company_id and policy.active
    and policy.effective_from <= (p_proposed_start at time zone p_timezone_name)::date
    and (policy.effective_to is null or policy.effective_to >= (p_proposed_start at time zone p_timezone_name)::date)
    and (policy.scope = 'company' or (policy.scope = 'vessel' and policy.vessel_id = p_vessel_id))
  order by (policy.scope = 'vessel') desc, policy.effective_from desc, policy.id desc
  limit 1;
  return applicable_policy;
end;
$$;
revoke all on function private.working_time_recommendation_policy(bigint,timestamptz,timestamptz,text,bigint,text,bigint)
  from public, anon, authenticated;

do $migration$
declare
  definition text;
  previous constant text := $old$  select public.working_time_interval_recommendation(
    p_person_id,
    first_start,
    (
      select ends_at
      from jsonb_to_recordset(p_phases) phase(starts_at timestamptz, ends_at timestamptz)
      order by starts_at
      limit 1
    ),
    p_timezone_name, p_vessel_id, p_watch_group, p_exclude_interval_id
  ) into auth_result;
  if auth_result ->> 'policy_id' is null then
    return auth_result || jsonb_build_object('phase_count', phase_count);
  end if;
  select * into policy
  from public.planning_work_rest_policies
  where id = (auth_result ->> 'policy_id')::bigint;$old$;
  replacement constant text := $new$  select * into policy from private.working_time_recommendation_policy(
    p_person_id, first_start,
    (select ends_at from jsonb_to_recordset(p_phases) phase(starts_at timestamptz, ends_at timestamptz)
      order by starts_at limit 1),
    p_timezone_name, p_vessel_id, p_watch_group, p_exclude_interval_id
  );
  if policy.id is null then
    return jsonb_build_object(
      'status', 'sans_politique', 'policy_id', null, 'policy_name', null,
      'already_non_compliant', null, 'available_24h_seconds', null,
      'available_7d_seconds', null, 'max_additional_seconds', null,
      'latest_end_at', null, 'next_resume_at', null,
      'violation_codes', '[]'::jsonb, 'phase_count', phase_count
    );
  end if;$new$;
begin
  select pg_get_functiondef('public.working_time_phases_recommendation(bigint,jsonb,text,bigint,text,bigint)'::regprocedure)
  into definition;
  definition := replace(definition, chr(13), '');
  if position(previous in definition) = 0 then
    raise exception 'Unexpected multi-phase recommendation validation definition';
  end if;
  definition := replace(definition, previous, replacement);
  definition := replace(definition, '  auth_result jsonb; policy ', '  policy ');
  execute definition;
end;
$migration$;

-- Preserve the exact evaluated predicates and half-hour candidate grid in each
-- RPC. The former bool_and prefix cannot become true after its first false.
do $migration$
declare
  target regprocedure;
  definition text;
  previous_start text;
  replacement_start text;
  previous_end text;
  replacement_end text;
begin
  for target in select unnest(array[
    'public.working_time_interval_recommendation(bigint,timestamptz,timestamptz,text,bigint,text,bigint)'::regprocedure,
    'public.working_time_phases_recommendation(bigint,jsonb,text,bigint,text,bigint)'::regprocedure
  ]) loop
    select pg_get_functiondef(target) into definition;
    definition := replace(definition, chr(13), '');
    definition := replace(definition, '  candidate_resume timestamptz;',
      E'  candidate_resume timestamptz;\n  candidate_end_value timestamptz;\n  candidate_compliant boolean;');
    if target = 'public.working_time_interval_recommendation(bigint,timestamptz,timestamptz,text,bigint,text,bigint)'::regprocedure then
      previous_start := $old$    with candidate_ends as (
      select generated_end as candidate_end
      from generate_series(
        p_proposed_start + interval '30 minutes',
        p_proposed_start + interval '24 hours',
        interval '30 minutes'
      ) generated_end
    ), measured as ($old$;
      replacement_start := $new$    for candidate_end_value in
      select generated_end from generate_series(
        p_proposed_start + interval '30 minutes', p_proposed_start + interval '24 hours', interval '30 minutes'
      ) generated_end order by generated_end
    loop
    with candidate_ends as (select candidate_end_value as candidate_end), measured as ($new$;
      previous_end := $old$    ), continuous as (
      select evaluated.*,
        bool_and(compliant) over (
          order by candidate_end rows between unbounded preceding and current row
        ) as continuously_compliant
      from evaluated
    )
    select max(candidate_end) filter (where continuously_compliant)
    into latest_compatible_end
    from continuous;$old$;
    else
      previous_start := $old$    with candidates as (
      select candidate_end
      from generate_series(
        last_end + interval '30 minutes', last_end + interval '24 hours', interval '30 minutes'
      ) candidate_end
    ), measured as ($old$;
      replacement_start := $new$    for candidate_end_value in
      select generated_end from generate_series(
        last_end + interval '30 minutes', last_end + interval '24 hours', interval '30 minutes'
      ) generated_end order by generated_end
    loop
    with candidates as (select candidate_end_value as candidate_end), measured as ($new$;
      previous_end := $old$    ), continuous as (
      select evaluated.*,
        bool_and(compliant) over (
          order by candidate_end rows between unbounded preceding and current row
        ) continuous_ok
      from evaluated
    )
    select max(candidate_end) filter (where continuous_ok)
    into latest_compatible_end
    from continuous;$old$;
    end if;
    replacement_end := $new$    )
    select compliant into candidate_compliant from evaluated;
    exit when candidate_compliant is false;
    if candidate_compliant or latest_compatible_end is not null then
      latest_compatible_end := candidate_end_value;
    end if;
    end loop;$new$;
    if position(previous_start in definition) = 0 or position(previous_end in definition) = 0 then
      raise exception 'Unexpected recommendation extension definition: %', target;
    end if;
    execute replace(replace(definition, previous_start, replacement_start), previous_end, replacement_end);
  end loop;
end;
$migration$;

notify pgrst, 'reload schema';
