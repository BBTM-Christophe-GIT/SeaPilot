-- A completed consecutive-rest block satisfies the rolling 24-hour rest rule.
-- This keeps the recorded rest duration factual while preventing the separate
-- cumulative-rest threshold from reopening a work cycle that has already reset.

create or replace function private.working_time_rest_24h_satisfied(
  rest_seconds numeric,
  longest_rest_seconds numeric,
  minimum_rest_hours numeric,
  minimum_consecutive_rest_hours numeric
)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select rest_seconds >= minimum_rest_hours * 3600
    or longest_rest_seconds >= minimum_consecutive_rest_hours * 3600;
$$;

revoke all on function private.working_time_rest_24h_satisfied(
  numeric, numeric, numeric, numeric
) from public, anon, authenticated;

create or replace function private.working_time_apply_rest_cycle_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.calculation_version := greatest(new.calculation_version, 3);

  if new.work_rest_policy_id is not null
    and new.consecutive_rest_compliant is true then
    new.rest_24h_compliant := true;
    new.violation_codes := array_remove(new.violation_codes, 'rest_24h');
    new.is_compliant := new.work_24h_compliant
      and new.rest_24h_compliant
      and new.consecutive_rest_compliant
      and new.rest_period_count_compliant
      and new.work_7d_compliant
      and new.rest_7d_compliant
      and new.night_work_compliant;
  end if;

  return new;
end;
$$;

create or replace function public.working_time_phases_recommendation(
  p_person_id bigint,
  p_phases jsonb,
  p_timezone_name text,
  p_vessel_id bigint default null,
  p_watch_group text default null,
  p_exclude_interval_id bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  first_start timestamptz; last_end timestamptz; phase_count integer;
  auth_result jsonb; policy public.planning_work_rest_policies%rowtype;
  baseline24 record; baseline7 record; proposed24 record; proposed7 record;
  violations text[]; baseline_ok boolean; proposed_ok boolean; adjusted_max numeric;
  latest_compatible_end timestamptz; next_compatible_resume timestamptz;
begin
  if p_phases is null or jsonb_typeof(p_phases) <> 'array'
    or jsonb_array_length(p_phases) not between 1 and 48 then
    raise exception using errcode = '22023', message = 'WORKING_TIME_PHASES_INVALID';
  end if;
  with phases as (
    select * from jsonb_to_recordset(p_phases) phase(starts_at timestamptz, ends_at timestamptz)
  )
  select min(starts_at), max(ends_at), count(*)
  into first_start, last_end, phase_count
  from phases;
  if first_start is null or exists(
    select 1
    from jsonb_to_recordset(p_phases) phase(starts_at timestamptz, ends_at timestamptz)
    where starts_at is null or ends_at is null or ends_at <= starts_at
      or ends_at > starts_at + interval '24 hours'
  ) then
    raise exception using errcode = '22023', message = 'WORKING_TIME_PHASES_INVALID';
  end if;
  if exists(
    select 1
    from jsonb_to_recordset(p_phases) a(starts_at timestamptz, ends_at timestamptz)
    join jsonb_to_recordset(p_phases) b(starts_at timestamptz, ends_at timestamptz)
      on a.starts_at < b.starts_at and a.ends_at > b.starts_at
  ) then
    raise exception using errcode = '22023', message = 'WORKING_TIME_PHASES_OVERLAP';
  end if;
  if exists(
    select 1
    from jsonb_to_recordset(p_phases) phase(starts_at timestamptz, ends_at timestamptz)
    where (phase.starts_at at time zone p_timezone_name)::date
      <> (first_start at time zone p_timezone_name)::date
  ) then
    raise exception using errcode = '22023', message = 'WORKING_TIME_PHASES_INVALID';
  end if;

  select public.working_time_interval_recommendation(
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
  where id = (auth_result ->> 'policy_id')::bigint;

  select * into baseline24
  from private.working_time_window_metrics_with_phase_json(
    p_person_id, first_start - interval '24 hours', first_start, p_timezone_name,
    policy.night_starts_at, policy.night_ends_at, p_exclude_interval_id, '[]'
  );
  select * into baseline7
  from private.working_time_window_metrics_with_phase_json(
    p_person_id, first_start - interval '7 days', first_start, p_timezone_name,
    null, null, p_exclude_interval_id, '[]'
  );
  select * into proposed24
  from private.working_time_window_metrics_with_phase_json(
    p_person_id, last_end - interval '24 hours', last_end, p_timezone_name,
    policy.night_starts_at, policy.night_ends_at, p_exclude_interval_id, p_phases
  );
  select * into proposed7
  from private.working_time_window_metrics_with_phase_json(
    p_person_id, last_end - interval '7 days', last_end, p_timezone_name,
    null, null, p_exclude_interval_id, p_phases
  );

  baseline_ok := baseline24.work_seconds <= policy.max_work_24h * 3600
    and private.working_time_rest_24h_satisfied(
      baseline24.rest_seconds, baseline24.longest_rest_seconds,
      policy.min_rest_24h, policy.min_consecutive_rest_hours
    )
    and baseline24.longest_rest_seconds >= policy.min_consecutive_rest_hours * 3600
    and baseline24.rest_period_count <= policy.max_rest_periods_24h
    and baseline7.work_seconds <= policy.max_work_7d * 3600
    and baseline7.rest_seconds >= policy.min_rest_7d * 3600;
  proposed_ok := proposed24.work_seconds <= policy.max_work_24h * 3600
    and private.working_time_rest_24h_satisfied(
      proposed24.rest_seconds, proposed24.longest_rest_seconds,
      policy.min_rest_24h, policy.min_consecutive_rest_hours
    )
    and proposed24.longest_rest_seconds >= policy.min_consecutive_rest_hours * 3600
    and proposed24.rest_period_count <= policy.max_rest_periods_24h
    and proposed7.work_seconds <= policy.max_work_7d * 3600
    and proposed7.rest_seconds >= policy.min_rest_7d * 3600
    and (policy.max_night_work_24h is null
      or proposed24.night_work_seconds <= policy.max_night_work_24h * 3600);
  violations := array_remove(array[
    case when proposed24.work_seconds > policy.max_work_24h * 3600 then 'work_24h' end,
    case when not private.working_time_rest_24h_satisfied(
      proposed24.rest_seconds, proposed24.longest_rest_seconds,
      policy.min_rest_24h, policy.min_consecutive_rest_hours
    ) then 'rest_24h' end,
    case when proposed24.longest_rest_seconds < policy.min_consecutive_rest_hours * 3600 then 'consecutive_rest' end,
    case when proposed24.rest_period_count > policy.max_rest_periods_24h then 'rest_periods_24h' end,
    case when proposed7.work_seconds > policy.max_work_7d * 3600 then 'work_7d' end,
    case when proposed7.rest_seconds < policy.min_rest_7d * 3600 then 'rest_7d' end,
    case when policy.max_night_work_24h is not null
      and proposed24.night_work_seconds > policy.max_night_work_24h * 3600 then 'night_work_24h' end
  ], null);

  if baseline_ok and proposed_ok then
    with candidates as (
      select candidate_end
      from generate_series(
        last_end + interval '30 minutes', last_end + interval '24 hours', interval '30 minutes'
      ) candidate_end
    ), measured as (
      select candidates.candidate_end, m24.*, m7.work_seconds work7, m7.rest_seconds rest7
      from candidates
      cross join lateral private.working_time_window_metrics_with_phase_json(
        p_person_id, candidates.candidate_end - interval '24 hours', candidates.candidate_end,
        p_timezone_name, policy.night_starts_at, policy.night_ends_at, p_exclude_interval_id,
        p_phases || jsonb_build_array(jsonb_build_object('starts_at', last_end, 'ends_at', candidates.candidate_end))
      ) m24
      cross join lateral private.working_time_window_metrics_with_phase_json(
        p_person_id, candidates.candidate_end - interval '7 days', candidates.candidate_end,
        p_timezone_name, null, null, p_exclude_interval_id,
        p_phases || jsonb_build_array(jsonb_build_object('starts_at', last_end, 'ends_at', candidates.candidate_end))
      ) m7
    ), evaluated as (
      select measured.*,
        work_seconds <= policy.max_work_24h * 3600
        and private.working_time_rest_24h_satisfied(
          rest_seconds, longest_rest_seconds,
          policy.min_rest_24h, policy.min_consecutive_rest_hours
        )
        and longest_rest_seconds >= policy.min_consecutive_rest_hours * 3600
        and rest_period_count <= policy.max_rest_periods_24h
        and work7 <= policy.max_work_7d * 3600
        and rest7 >= policy.min_rest_7d * 3600
        and (policy.max_night_work_24h is null
          or night_work_seconds <= policy.max_night_work_24h * 3600) compliant
      from measured
    ), continuous as (
      select evaluated.*,
        bool_and(compliant) over (
          order by candidate_end rows between unbounded preceding and current row
        ) continuous_ok
      from evaluated
    )
    select max(candidate_end) filter (where continuous_ok)
    into latest_compatible_end
    from continuous;
  end if;
  adjusted_max := greatest(0, coalesce(extract(epoch from latest_compatible_end - last_end), 0));

  with candidates as (
    select resume_at
    from generate_series(
      last_end + policy.min_consecutive_rest_hours * interval '1 hour',
      last_end + interval '7 days',
      interval '30 minutes'
    ) resume_at
  ), measured as (
    select candidates.resume_at, start24.*, start7.work_seconds work7, start7.rest_seconds rest7,
      after24.work_seconds after_work24, after24.rest_seconds after_rest24,
      after24.longest_rest_seconds after_longest, after24.rest_period_count after_periods,
      after24.night_work_seconds after_night, after7.work_seconds after_work7,
      after7.rest_seconds after_rest7
    from candidates
    cross join lateral private.working_time_window_metrics_with_phase_json(
      p_person_id, resume_at - interval '24 hours', resume_at, p_timezone_name,
      policy.night_starts_at, policy.night_ends_at, p_exclude_interval_id, p_phases
    ) start24
    cross join lateral private.working_time_window_metrics_with_phase_json(
      p_person_id, resume_at - interval '7 days', resume_at, p_timezone_name,
      null, null, p_exclude_interval_id, p_phases
    ) start7
    cross join lateral private.working_time_window_metrics_with_phase_json(
      p_person_id, resume_at - interval '23 hours 30 minutes', resume_at + interval '30 minutes',
      p_timezone_name, policy.night_starts_at, policy.night_ends_at, p_exclude_interval_id,
      p_phases || jsonb_build_array(jsonb_build_object(
        'starts_at', resume_at, 'ends_at', resume_at + interval '30 minutes'
      ))
    ) after24
    cross join lateral private.working_time_window_metrics_with_phase_json(
      p_person_id, resume_at - interval '6 days 23 hours 30 minutes', resume_at + interval '30 minutes',
      p_timezone_name, null, null, p_exclude_interval_id,
      p_phases || jsonb_build_array(jsonb_build_object(
        'starts_at', resume_at, 'ends_at', resume_at + interval '30 minutes'
      ))
    ) after7
  )
  select min(resume_at) into next_compatible_resume
  from measured
  where work_seconds <= policy.max_work_24h * 3600
    and private.working_time_rest_24h_satisfied(
      rest_seconds, longest_rest_seconds, policy.min_rest_24h, policy.min_consecutive_rest_hours
    )
    and longest_rest_seconds >= policy.min_consecutive_rest_hours * 3600
    and rest_period_count <= policy.max_rest_periods_24h
    and work7 <= policy.max_work_7d * 3600
    and rest7 >= policy.min_rest_7d * 3600
    and (policy.max_night_work_24h is null
      or night_work_seconds <= policy.max_night_work_24h * 3600)
    and after_work24 <= policy.max_work_24h * 3600
    and private.working_time_rest_24h_satisfied(
      after_rest24, after_longest, policy.min_rest_24h, policy.min_consecutive_rest_hours
    )
    and after_longest >= policy.min_consecutive_rest_hours * 3600
    and after_periods <= policy.max_rest_periods_24h
    and after_work7 <= policy.max_work_7d * 3600
    and after_rest7 >= policy.min_rest_7d * 3600
    and (policy.max_night_work_24h is null
      or after_night <= policy.max_night_work_24h * 3600);

  return jsonb_build_object(
    'status', case
      when not baseline_ok or not proposed_ok then 'non_conforme'
      when adjusted_max <= 3600 then 'alerte'
      else 'conforme'
    end,
    'policy_id', policy.id,
    'policy_name', policy.name,
    'already_non_compliant', not baseline_ok,
    'phase_count', phase_count,
    'available_24h_seconds', greatest(0, policy.max_work_24h * 3600 - proposed24.work_seconds),
    'available_7d_seconds', greatest(0, policy.max_work_7d * 3600 - proposed7.work_seconds),
    'work_24h_seconds', proposed24.work_seconds,
    'work_7d_seconds', proposed7.work_seconds,
    'rest_24h_seconds', proposed24.rest_seconds,
    'longest_rest_24h_seconds', proposed24.longest_rest_seconds,
    'rest_impact_seconds', proposed24.rest_seconds - baseline24.rest_seconds,
    'consecutive_rest_impact_seconds', proposed24.longest_rest_seconds - baseline24.longest_rest_seconds,
    'max_additional_seconds', case when baseline_ok and proposed_ok then adjusted_max else 0 end,
    'latest_end_at', case when baseline_ok and proposed_ok then latest_compatible_end end,
    'next_resume_at', next_compatible_resume,
    'violation_codes', to_jsonb(violations)
  );
end;
$$;

revoke all on function private.working_time_apply_rest_cycle_rules()
  from public, anon, authenticated;

drop trigger if exists working_time_calculation_cycle_version
  on public.working_time_calculation_windows;
drop trigger if exists working_time_calculation_rest_cycle_rules
  on public.working_time_calculation_windows;
create trigger working_time_calculation_rest_cycle_rules
before insert or update on public.working_time_calculation_windows
for each row execute function private.working_time_apply_rest_cycle_rules();

drop function if exists private.working_time_set_cycle_calculation_version();

comment on column public.working_time_calculation_windows.rest_24h_compliant is
  'True when cumulative rest reaches the 24-hour threshold or the required consecutive-rest block is completed.';

-- Re-evaluate stored windows without sending a duplicate notification wave.
alter table public.working_time_calculation_windows
  disable trigger working_time_calculation_non_compliance_notify;

update public.working_time_calculation_windows
set calculation_version = greatest(calculation_version, 3),
    calculated_at = now();

alter table public.working_time_calculation_windows
  enable trigger working_time_calculation_non_compliance_notify;

create or replace function public.working_time_interval_recommendation(
  p_person_id bigint,
  p_proposed_start timestamptz,
  p_proposed_end timestamptz,
  p_timezone_name text,
  p_vessel_id bigint default null,
  p_watch_group text default null,
  p_exclude_interval_id bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  target_person public.people%rowtype;
  applicable_policy public.planning_work_rest_policies%rowtype;
  baseline_24 record;
  baseline_7d record;
  proposed_24 record;
  proposed_7d record;
  baseline_compliant boolean;
  proposed_compliant boolean;
  latest_compatible_end timestamptz;
  next_compatible_resume timestamptz;
  max_additional_seconds numeric := 0;
  violation_codes text[] := '{}'::text[];
  recommendation_status text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: authentification requise.';
  end if;
  if p_proposed_start is null or p_proposed_end is null
    or p_proposed_end <= p_proposed_start
    or p_proposed_end > p_proposed_start + interval '24 hours' then
    raise exception using errcode = '22023', message = 'WORKING_TIME_RECOMMENDATION_INTERVAL_INVALID.';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone_name) then
    raise exception using errcode = '22023', message = 'WORKING_TIME_TIMEZONE_INVALID.';
  end if;

  select * into target_person
  from public.people person
  where person.id = p_person_id and person.active;
  if target_person.id is null
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
  if p_vessel_id is not null and not exists (
    select 1 from public.vessels vessel
    where vessel.id = p_vessel_id
      and vessel.company_id = target_person.company_id
      and vessel.active
  ) then
    raise exception using errcode = '22023', message = 'WORKING_TIME_VESSEL_INVALID.';
  end if;
  if p_exclude_interval_id is not null and not exists (
    select 1 from public.working_time_intervals work_interval
    where work_interval.id = p_exclude_interval_id
      and work_interval.person_id = p_person_id
      and work_interval.voided_at is null
  ) then
    raise exception using errcode = '22023', message = 'WORKING_TIME_INTERVAL_NOT_FOUND.';
  end if;

  select policy.* into applicable_policy
  from public.planning_work_rest_policies policy
  where policy.company_id = target_person.company_id
    and policy.active
    and policy.effective_from <= (p_proposed_start at time zone p_timezone_name)::date
    and (policy.effective_to is null or policy.effective_to >= (p_proposed_start at time zone p_timezone_name)::date)
    and (policy.scope = 'company' or (policy.scope = 'vessel' and policy.vessel_id = p_vessel_id))
  order by (policy.scope = 'vessel') desc, policy.effective_from desc, policy.id desc
  limit 1;

  if applicable_policy.id is null then
    return jsonb_build_object(
      'status', 'sans_politique',
      'policy_id', null,
      'policy_name', null,
      'already_non_compliant', null,
      'available_24h_seconds', null,
      'available_7d_seconds', null,
      'max_additional_seconds', null,
      'latest_end_at', null,
      'next_resume_at', null,
      'violation_codes', '[]'::jsonb
    );
  end if;

  select * into baseline_24
  from private.working_time_window_metrics_with_proposals(
    p_person_id, p_proposed_start - interval '24 hours', p_proposed_start,
    p_timezone_name, applicable_policy.night_starts_at, applicable_policy.night_ends_at,
    p_exclude_interval_id
  );
  select * into baseline_7d
  from private.working_time_window_metrics_with_proposals(
    p_person_id, p_proposed_start - interval '7 days', p_proposed_start,
    p_timezone_name, null, null,
    p_exclude_interval_id
  );
  select * into proposed_24
  from private.working_time_window_metrics_with_proposals(
    p_person_id, p_proposed_end - interval '24 hours', p_proposed_end,
    p_timezone_name, applicable_policy.night_starts_at, applicable_policy.night_ends_at,
    p_exclude_interval_id, p_proposed_start, p_proposed_end
  );
  select * into proposed_7d
  from private.working_time_window_metrics_with_proposals(
    p_person_id, p_proposed_end - interval '7 days', p_proposed_end,
    p_timezone_name, null, null,
    p_exclude_interval_id, p_proposed_start, p_proposed_end
  );

  baseline_compliant := baseline_24.work_seconds <= applicable_policy.max_work_24h * 3600
    and private.working_time_rest_24h_satisfied(
      baseline_24.rest_seconds, baseline_24.longest_rest_seconds,
      applicable_policy.min_rest_24h, applicable_policy.min_consecutive_rest_hours
    )
    and baseline_24.longest_rest_seconds >= applicable_policy.min_consecutive_rest_hours * 3600
    and baseline_24.rest_period_count <= applicable_policy.max_rest_periods_24h
    and baseline_7d.work_seconds <= applicable_policy.max_work_7d * 3600
    and baseline_7d.rest_seconds >= applicable_policy.min_rest_7d * 3600
    and (applicable_policy.max_night_work_24h is null
      or baseline_24.night_work_seconds <= applicable_policy.max_night_work_24h * 3600);

  proposed_compliant := proposed_24.work_seconds <= applicable_policy.max_work_24h * 3600
    and private.working_time_rest_24h_satisfied(
      proposed_24.rest_seconds, proposed_24.longest_rest_seconds,
      applicable_policy.min_rest_24h, applicable_policy.min_consecutive_rest_hours
    )
    and proposed_24.longest_rest_seconds >= applicable_policy.min_consecutive_rest_hours * 3600
    and proposed_24.rest_period_count <= applicable_policy.max_rest_periods_24h
    and proposed_7d.work_seconds <= applicable_policy.max_work_7d * 3600
    and proposed_7d.rest_seconds >= applicable_policy.min_rest_7d * 3600
    and (applicable_policy.max_night_work_24h is null
      or proposed_24.night_work_seconds <= applicable_policy.max_night_work_24h * 3600);

  violation_codes := array_remove(array[
    case when proposed_24.work_seconds > applicable_policy.max_work_24h * 3600 then 'work_24h' end,
    case when not private.working_time_rest_24h_satisfied(
      proposed_24.rest_seconds, proposed_24.longest_rest_seconds,
      applicable_policy.min_rest_24h, applicable_policy.min_consecutive_rest_hours
    ) then 'rest_24h' end,
    case when proposed_24.longest_rest_seconds < applicable_policy.min_consecutive_rest_hours * 3600 then 'consecutive_rest' end,
    case when proposed_24.rest_period_count > applicable_policy.max_rest_periods_24h then 'rest_periods_24h' end,
    case when proposed_7d.work_seconds > applicable_policy.max_work_7d * 3600 then 'work_7d' end,
    case when proposed_7d.rest_seconds < applicable_policy.min_rest_7d * 3600 then 'rest_7d' end,
    case when applicable_policy.max_night_work_24h is not null
      and proposed_24.night_work_seconds > applicable_policy.max_night_work_24h * 3600 then 'night_work_24h' end
  ], null);

  if baseline_compliant then
    with candidate_ends as (
      select generated_end as candidate_end
      from generate_series(
        p_proposed_start + interval '30 minutes',
        p_proposed_start + interval '24 hours',
        interval '30 minutes'
      ) generated_end
    ), measured as (
      select candidate.candidate_end, metrics_24.*, metrics_7.work_seconds as work_7d_seconds,
        metrics_7.rest_seconds as rest_7d_seconds
      from candidate_ends candidate
      cross join lateral private.working_time_window_metrics_with_proposals(
        p_person_id, candidate.candidate_end - interval '24 hours', candidate.candidate_end,
        p_timezone_name, applicable_policy.night_starts_at, applicable_policy.night_ends_at,
        p_exclude_interval_id, p_proposed_start, candidate.candidate_end
      ) metrics_24
      cross join lateral private.working_time_window_metrics_with_proposals(
        p_person_id, candidate.candidate_end - interval '7 days', candidate.candidate_end,
        p_timezone_name, null, null,
        p_exclude_interval_id, p_proposed_start, candidate.candidate_end
      ) metrics_7
    ), evaluated as (
      select measured.*,
        measured.work_seconds <= applicable_policy.max_work_24h * 3600
        and private.working_time_rest_24h_satisfied(
          measured.rest_seconds, measured.longest_rest_seconds,
          applicable_policy.min_rest_24h, applicable_policy.min_consecutive_rest_hours
        )
        and measured.longest_rest_seconds >= applicable_policy.min_consecutive_rest_hours * 3600
        and measured.rest_period_count <= applicable_policy.max_rest_periods_24h
        and measured.work_7d_seconds <= applicable_policy.max_work_7d * 3600
        and measured.rest_7d_seconds >= applicable_policy.min_rest_7d * 3600
        and (applicable_policy.max_night_work_24h is null
          or measured.night_work_seconds <= applicable_policy.max_night_work_24h * 3600) as compliant
      from measured
    ), continuous as (
      select evaluated.*,
        bool_and(compliant) over (
          order by candidate_end rows between unbounded preceding and current row
        ) as continuously_compliant
      from evaluated
    )
    select max(candidate_end) filter (where continuously_compliant)
    into latest_compatible_end
    from continuous;

    max_additional_seconds := greatest(
      0,
      coalesce(extract(epoch from (latest_compatible_end - p_proposed_end)), 0)
    );
  end if;

  with resume_candidates as (
    select generated_resume as resume_at
    from generate_series(
      case when baseline_compliant then p_proposed_end else p_proposed_start end
        + applicable_policy.min_consecutive_rest_hours * interval '1 hour',
      case when baseline_compliant then p_proposed_end else p_proposed_start end + interval '7 days',
      interval '30 minutes'
    ) generated_resume
  ), resolved as (
    select candidate.resume_at, policy.*
    from resume_candidates candidate
    join lateral (
      select policy.*
      from public.planning_work_rest_policies policy
      where policy.company_id = target_person.company_id
        and policy.active
        and policy.effective_from <= (candidate.resume_at at time zone p_timezone_name)::date
        and (policy.effective_to is null or policy.effective_to >= (candidate.resume_at at time zone p_timezone_name)::date)
        and (policy.scope = 'company' or (policy.scope = 'vessel' and policy.vessel_id = p_vessel_id))
      order by (policy.scope = 'vessel') desc, policy.effective_from desc, policy.id desc
      limit 1
    ) policy on true
  ), measured as (
    select resolved.*,
      at_start.work_seconds as start_work_24h,
      at_start.rest_seconds as start_rest_24h,
      at_start.longest_rest_seconds as start_longest_rest,
      at_start.rest_period_count as start_rest_periods,
      at_start.night_work_seconds as start_night_work,
      start_7d.work_seconds as start_work_7d,
      start_7d.rest_seconds as start_rest_7d,
      at_end.work_seconds as end_work_24h,
      at_end.rest_seconds as end_rest_24h,
      at_end.longest_rest_seconds as end_longest_rest,
      at_end.rest_period_count as end_rest_periods,
      at_end.night_work_seconds as end_night_work,
      end_7d.work_seconds as end_work_7d,
      end_7d.rest_seconds as end_rest_7d
    from resolved
    cross join lateral private.working_time_window_metrics_with_proposals(
      p_person_id, resolved.resume_at - interval '24 hours', resolved.resume_at,
      p_timezone_name, resolved.night_starts_at, resolved.night_ends_at,
      p_exclude_interval_id,
      case when baseline_compliant then p_proposed_start end,
      case when baseline_compliant then p_proposed_end end
    ) at_start
    cross join lateral private.working_time_window_metrics_with_proposals(
      p_person_id, resolved.resume_at - interval '7 days', resolved.resume_at,
      p_timezone_name, null, null,
      p_exclude_interval_id,
      case when baseline_compliant then p_proposed_start end,
      case when baseline_compliant then p_proposed_end end
    ) start_7d
    cross join lateral private.working_time_window_metrics_with_proposals(
      p_person_id, resolved.resume_at + interval '30 minutes' - interval '24 hours',
      resolved.resume_at + interval '30 minutes',
      p_timezone_name, resolved.night_starts_at, resolved.night_ends_at,
      p_exclude_interval_id,
      case when baseline_compliant then p_proposed_start end,
      case when baseline_compliant then p_proposed_end end,
      resolved.resume_at, resolved.resume_at + interval '30 minutes'
    ) at_end
    cross join lateral private.working_time_window_metrics_with_proposals(
      p_person_id, resolved.resume_at + interval '30 minutes' - interval '7 days',
      resolved.resume_at + interval '30 minutes',
      p_timezone_name, null, null,
      p_exclude_interval_id,
      case when baseline_compliant then p_proposed_start end,
      case when baseline_compliant then p_proposed_end end,
      resolved.resume_at, resolved.resume_at + interval '30 minutes'
    ) end_7d
  )
  select min(resume_at) into next_compatible_resume
  from measured
  where start_work_24h <= max_work_24h * 3600
    and private.working_time_rest_24h_satisfied(
      start_rest_24h, start_longest_rest, min_rest_24h, min_consecutive_rest_hours
    )
    and start_longest_rest >= min_consecutive_rest_hours * 3600
    and start_rest_periods <= max_rest_periods_24h
    and start_work_7d <= max_work_7d * 3600
    and start_rest_7d >= min_rest_7d * 3600
    and (max_night_work_24h is null or start_night_work <= max_night_work_24h * 3600)
    and end_work_24h <= max_work_24h * 3600
    and private.working_time_rest_24h_satisfied(
      end_rest_24h, end_longest_rest, min_rest_24h, min_consecutive_rest_hours
    )
    and end_longest_rest >= min_consecutive_rest_hours * 3600
    and end_rest_periods <= max_rest_periods_24h
    and end_work_7d <= max_work_7d * 3600
    and end_rest_7d >= min_rest_7d * 3600
    and (max_night_work_24h is null or end_night_work <= max_night_work_24h * 3600);

  recommendation_status := case
    when not baseline_compliant or not proposed_compliant then 'non_conforme'
    when max_additional_seconds <= 3600 then 'alerte'
    else 'conforme'
  end;

  return jsonb_build_object(
    'status', recommendation_status,
    'policy_id', applicable_policy.id,
    'policy_name', applicable_policy.name,
    'already_non_compliant', not baseline_compliant,
    'available_24h_seconds', greatest(0, applicable_policy.max_work_24h * 3600 - proposed_24.work_seconds),
    'available_7d_seconds', greatest(0, applicable_policy.max_work_7d * 3600 - proposed_7d.work_seconds),
    'work_24h_seconds', proposed_24.work_seconds,
    'work_7d_seconds', proposed_7d.work_seconds,
    'rest_24h_seconds', proposed_24.rest_seconds,
    'longest_rest_24h_seconds', proposed_24.longest_rest_seconds,
    'rest_impact_seconds', proposed_24.rest_seconds - baseline_24.rest_seconds,
    'consecutive_rest_impact_seconds', proposed_24.longest_rest_seconds - baseline_24.longest_rest_seconds,
    'max_additional_seconds', case when baseline_compliant then max_additional_seconds else 0 end,
    'latest_end_at', case when baseline_compliant then latest_compatible_end else null end,
    'next_resume_at', next_compatible_resume,
    'violation_codes', to_jsonb(violation_codes)
  );
end;
$$;
