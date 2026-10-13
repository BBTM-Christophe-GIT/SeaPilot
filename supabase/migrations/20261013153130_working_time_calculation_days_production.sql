-- Calculation days start at the beginning of a qualifying continuous rest.
-- Closing a day never erases a violation in another day touching the 24h window.
-- The legacy work_24h field stores the largest relevant calculation-day total.
-- No historical signatures/approvals, policies, or raw intervals are rewritten.
-- Internal metric calls receive a globally unique person ID, so their leading
-- predicate must not require a company ID to use an index.
create index if not exists working_time_intervals_calculation_day_ranges_idx
  on public.working_time_intervals (person_id, starts_at, ends_at)
  where voided_at is null;
alter table public.planning_work_rest_policies
  add column if not exists max_amplitude_hours numeric(5, 2) not null default 14,
  add column if not exists max_interval_between_rests_hours numeric(5, 2) not null default 14;
alter table public.planning_work_rest_policies
  add constraint planning_work_rest_policies_amplitude_check
    check (max_amplitude_hours > 0 and max_amplitude_hours <= 24),
  add constraint planning_work_rest_policies_rest_interval_check
    check (max_interval_between_rests_hours > 0 and max_interval_between_rests_hours <= 24);

-- A calculation day may exceed 24h if no qualifying rest was taken. Preserve
-- its factual total rather than clipping away the beginning of a violation.
alter table public.working_time_calculation_windows
  drop constraint working_time_calculation_windows_24h_check;
alter table public.working_time_calculation_windows
  add constraint working_time_calculation_windows_24h_check check (
    work_24h_seconds >= 0 and rest_24h_seconds between 0 and 86400
    and longest_rest_24h_seconds between 0 and 86400 and rest_period_count_24h >= 0
    and (night_work_24h_seconds is null or night_work_24h_seconds between 0 and 86400)
  );

create or replace function private.working_time_calculation_day_metrics(
  target_person_id bigint, target_window_start timestamptz, target_window_end timestamptz,
  target_timezone_name text, target_night_starts_at time, target_night_ends_at time,
  target_exclude_interval_id bigint, target_phases jsonb, target_minimum_rest_hours numeric
)
returns table (
  work_seconds numeric, rest_seconds numeric, longest_rest_seconds numeric,
  rest_period_count integer, night_work_seconds numeric,
  current_day_starts_at timestamptz, current_day_ends_at timestamptz,
  current_day_work_seconds numeric, maximum_amplitude_seconds numeric,
  maximum_rest_interval_seconds numeric, calculation_days jsonb
)
language sql stable security definer set search_path = ''
as $$
  with full_work as materialized (
    select * from private.working_time_merged_ranges_with_phase_json(
      target_person_id, '-infinity'::timestamptz, target_window_end,
      target_exclude_interval_id, target_phases
    )
  ), clipped as materialized (
    select greatest(starts_at, target_window_start) starts_at, ends_at
    from full_work where ends_at > target_window_start
  ), raw_total as (
    select coalesce(sum(extract(epoch from (ends_at - starts_at))), 0)::numeric seconds from clipped
  ), gaps as (
    select lag(ends_at, 1, target_window_start) over (order by starts_at, ends_at) starts_at,
      starts_at ends_at from clipped
    union all select coalesce(max(ends_at), target_window_start), target_window_end from clipped
  ), rest_summary as (
    select coalesce(max(extract(epoch from (ends_at - starts_at))) filter (where ends_at > starts_at), 0)::numeric longest,
      count(*) filter (where ends_at > starts_at)::integer periods
    from gaps
  ), continuous_work as (
    select coalesce(max(extract(epoch from (ends_at - starts_at))),0)::numeric rest_interval
    from full_work where ends_at > target_window_start
  ), ordered_work as (
    select full_work.*, lag(ends_at) over (order by starts_at, ends_at) previous_end
    from full_work
  ), numbered_work as (
    select ordered_work.*, sum(case when previous_end is null
      or starts_at - previous_end >= target_minimum_rest_hours * interval '1 hour'
      then 1 else 0 end) over (order by starts_at, ends_at) day_number
    from ordered_work
  ), sequences as (
    select day_number, min(starts_at) work_start, max(ends_at) work_end,
      sum(extract(epoch from (ends_at - starts_at)))::numeric work_total
    from numbered_work group by day_number
  ), days as (
    select sequences.*,
      coalesce(lag(work_end) over (order by day_number), work_start) day_start,
      case when lead(work_start) over (order by day_number) is not null
        or target_window_end - work_end >= target_minimum_rest_hours * interval '1 hour'
        then work_end else target_window_end end day_end,
      lead(work_start) over (order by day_number) is not null
        or target_window_end - work_end >= target_minimum_rest_hours * interval '1 hour' is_closed
    from sequences
  ), relevant_days as materialized (
    select * from days where day_end > target_window_start and day_start < target_window_end
  ), day_summary as (
    select coalesce(max(work_total), 0)::numeric maximum_work,
      coalesce(max(extract(epoch from (work_end - work_start))), 0)::numeric maximum_amplitude,
      coalesce(jsonb_agg(jsonb_build_object(
        'starts_at', day_start, 'ends_at', day_end, 'work_seconds', work_total,
        'work_starts_at', work_start, 'work_ends_at', work_end, 'closed', is_closed
      ) order by day_number), '[]'::jsonb) day_data
    from relevant_days
  ), latest as (
    select * from days order by day_number desc limit 1
  ), night_dates as (
    select value::date local_date from generate_series(
      (target_window_start at time zone target_timezone_name)::date - 1,
      (target_window_end at time zone target_timezone_name)::date, interval '1 day'
    ) value where target_night_starts_at is not null and target_night_ends_at is not null
  ), nights as (
    select (local_date + target_night_starts_at) at time zone target_timezone_name starts_at,
      (local_date + case when target_night_ends_at > target_night_starts_at then 0 else 1 end
        + target_night_ends_at) at time zone target_timezone_name ends_at from night_dates
  ), night_total as (
    select coalesce(sum(extract(epoch from (
      least(clipped.ends_at, nights.ends_at, target_window_end)
      - greatest(clipped.starts_at, nights.starts_at, target_window_start)
    ))), 0)::numeric seconds from clipped join nights
      on clipped.starts_at < least(nights.ends_at, target_window_end)
      and clipped.ends_at > greatest(nights.starts_at, target_window_start)
  )
  select round(case when target_window_end - target_window_start = interval '24 hours'
      then day_summary.maximum_work else raw_total.seconds end, 3),
    round(extract(epoch from (target_window_end - target_window_start))::numeric - raw_total.seconds, 3),
    round(rest_summary.longest, 3), rest_summary.periods,
    case when target_night_starts_at is null or target_night_ends_at is null then null else round(night_total.seconds, 3) end,
    case when latest.is_closed then latest.work_end else latest.day_start end,
    target_window_end,
    case when latest.is_closed then 0 else coalesce(latest.work_total, 0) end,
    round(day_summary.maximum_amplitude, 3), round(continuous_work.rest_interval, 3), day_summary.day_data
  from raw_total cross join rest_summary cross join continuous_work cross join day_summary cross join night_total
  left join latest on true;
$$;
revoke all on function private.working_time_calculation_day_metrics(bigint,timestamptz,timestamptz,text,time,time,bigint,jsonb,numeric)
  from public, anon, authenticated;

create or replace function private.working_time_rest_24h_satisfied(
  rest_seconds numeric, longest_rest_seconds numeric,
  minimum_rest_hours numeric, minimum_consecutive_rest_hours numeric
)
returns boolean language sql immutable strict set search_path = ''
as $$ select rest_seconds >= minimum_rest_hours * 3600; $$;

-- Replace the former rest override with authoritative v4 work-day/rest checks.
create or replace function private.working_time_apply_rest_cycle_rules()
returns trigger language plpgsql set search_path = ''
as $$
declare policy public.planning_work_rest_policies%rowtype; measured record;
begin
  if new.work_rest_policy_id is null then return new; end if;
  -- Imported/frozen evidence may intentionally have an explicit verdict with
  -- incomplete component flags. Do not manufacture a new verdict from it.
  -- The recalculation writer always supplies these complete component flags.
  if new.work_24h_compliant is null or new.rest_24h_compliant is null
    or new.consecutive_rest_compliant is null or new.rest_period_count_compliant is null
    or new.work_7d_compliant is null or new.rest_7d_compliant is null then return new; end if;
  new.calculation_version := greatest(new.calculation_version, 4);
  select * into strict policy from public.planning_work_rest_policies where id = new.work_rest_policy_id;
  select * into measured from private.working_time_calculation_day_metrics(
    new.person_id, new.window_end - interval '24 hours', new.window_end, new.timezone_name,
    policy.night_starts_at, policy.night_ends_at, null, '[]'::jsonb, policy.min_consecutive_rest_hours
  );
  new.work_24h_seconds := measured.work_seconds;
  new.work_24h_compliant := measured.work_seconds <= policy.max_work_24h * 3600;
  new.rest_24h_compliant := new.rest_24h_seconds >= policy.min_rest_24h * 3600;
  new.violation_codes := array_remove(array_remove(array_remove(array_remove(
    new.violation_codes, 'work_24h'), 'rest_24h'), 'amplitude'), 'rest_interval');
  if not new.work_24h_compliant then new.violation_codes := array_append(new.violation_codes, 'work_24h'); end if;
  if not new.rest_24h_compliant then new.violation_codes := array_append(new.violation_codes, 'rest_24h'); end if;
  if measured.maximum_amplitude_seconds > policy.max_amplitude_hours * 3600 then
    new.violation_codes := array_append(new.violation_codes, 'amplitude');
  end if;
  if measured.maximum_rest_interval_seconds > policy.max_interval_between_rests_hours * 3600 then
    new.violation_codes := array_append(new.violation_codes, 'rest_interval');
  end if;
  new.is_compliant := new.work_24h_compliant and new.rest_24h_compliant
    and new.consecutive_rest_compliant and new.rest_period_count_compliant
    and new.work_7d_compliant and new.rest_7d_compliant and new.night_work_compliant
    and not (new.violation_codes && array['amplitude', 'rest_interval']);
  return new;
end;
$$;
comment on column public.working_time_calculation_windows.work_24h_seconds is
  'Maximum work total of calculation days touching the 24-hour analysis window. A day closes at the START of a configured continuous rest; the following day starts at that same instant.';
comment on column public.working_time_calculation_windows.rest_24h_compliant is
  'Strict independent comparison of cumulative rolling 24-hour rest to the configured minimum. Continuous rest never substitutes for cumulative rest.';

-- Existing historical windows remain versioned as computed. Future saves,
-- recommendation calls and explicitly scoped recalculations use version 4.

create or replace function private.working_time_window_metrics_with_phase_json_v4(
 target_person_id bigint,target_window_start timestamptz,target_window_end timestamptz,
 target_timezone_name text,target_night_starts_at time,target_night_ends_at time,
 target_exclude_interval_id bigint,target_phases jsonb,target_minimum_rest_hours numeric
) returns table (work_seconds numeric, rest_seconds numeric, longest_rest_seconds numeric, rest_period_count integer, night_work_seconds numeric, current_day_starts_at timestamptz, current_day_ends_at timestamptz, current_day_work_seconds numeric, maximum_amplitude_seconds numeric, maximum_rest_interval_seconds numeric, calculation_days jsonb)
language sql stable security definer set search_path = '' as $$
 select * from private.working_time_calculation_day_metrics(target_person_id,target_window_start,target_window_end,
  target_timezone_name,target_night_starts_at,target_night_ends_at,target_exclude_interval_id,target_phases,target_minimum_rest_hours);
$$;
revoke all on function private.working_time_window_metrics_with_phase_json_v4(bigint,timestamptz,timestamptz,text,time,time,bigint,jsonb,numeric) from public,anon,authenticated;

create or replace function private.working_time_window_metrics_with_proposals_v4(
 target_person_id bigint,target_window_start timestamptz,target_window_end timestamptz,
 target_timezone_name text,target_night_starts_at time,target_night_ends_at time,
 target_exclude_interval_id bigint,target_first_starts_at timestamptz,target_first_ends_at timestamptz,
 target_second_starts_at timestamptz,target_second_ends_at timestamptz,target_minimum_rest_hours numeric
) returns table (work_seconds numeric, rest_seconds numeric, longest_rest_seconds numeric, rest_period_count integer, night_work_seconds numeric, current_day_starts_at timestamptz, current_day_ends_at timestamptz, current_day_work_seconds numeric, maximum_amplitude_seconds numeric, maximum_rest_interval_seconds numeric, calculation_days jsonb)
language sql stable security definer set search_path = '' as $$
 select * from private.working_time_calculation_day_metrics(target_person_id,target_window_start,target_window_end,
  target_timezone_name,target_night_starts_at,target_night_ends_at,target_exclude_interval_id,
  coalesce((select jsonb_agg(jsonb_build_object('starts_at',starts_at,'ends_at',ends_at)) from
    (values (target_first_starts_at,target_first_ends_at),(target_second_starts_at,target_second_ends_at))
    phases(starts_at,ends_at) where starts_at is not null and ends_at>starts_at),'[]'::jsonb), target_minimum_rest_hours);
$$;
revoke all on function private.working_time_window_metrics_with_proposals_v4(bigint,timestamptz,timestamptz,text,time,time,bigint,timestamptz,timestamptz,timestamptz,timestamptz,numeric) from public,anon,authenticated;

-- Authorization guards in both public recommendation RPCs are unchanged.
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
  from private.working_time_window_metrics_with_proposals_v4(
      p_person_id,
      p_proposed_start - interval '24 hours',
      p_proposed_start,
      p_timezone_name,
      applicable_policy.night_starts_at,
      applicable_policy.night_ends_at,
      p_exclude_interval_id,
      null,
      null,
      null,
      null,
      applicable_policy.min_consecutive_rest_hours
    );
  select * into baseline_7d
  from private.working_time_window_metrics_with_proposals_v4(
      p_person_id,
      p_proposed_start - interval '7 days',
      p_proposed_start,
      p_timezone_name,
      null,
      null,
      p_exclude_interval_id,
      null,
      null,
      null,
      null,
      applicable_policy.min_consecutive_rest_hours
    );
  select * into proposed_24
  from private.working_time_window_metrics_with_proposals_v4(
      p_person_id,
      p_proposed_end - interval '24 hours',
      p_proposed_end,
      p_timezone_name,
      applicable_policy.night_starts_at,
      applicable_policy.night_ends_at,
      p_exclude_interval_id,
      p_proposed_start,
      p_proposed_end,
      null,
      null,
      applicable_policy.min_consecutive_rest_hours
    );
  select * into proposed_7d
  from private.working_time_window_metrics_with_proposals_v4(
      p_person_id,
      p_proposed_end - interval '7 days',
      p_proposed_end,
      p_timezone_name,
      null,
      null,
      p_exclude_interval_id,
      p_proposed_start,
      p_proposed_end,
      null,
      null,
      applicable_policy.min_consecutive_rest_hours
    );

  baseline_compliant := baseline_24.maximum_amplitude_seconds <= applicable_policy.max_amplitude_hours * 3600
    and baseline_24.maximum_rest_interval_seconds <= applicable_policy.max_interval_between_rests_hours * 3600
    and baseline_24.work_seconds <= applicable_policy.max_work_24h * 3600
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

  proposed_compliant := proposed_24.maximum_amplitude_seconds <= applicable_policy.max_amplitude_hours * 3600
    and proposed_24.maximum_rest_interval_seconds <= applicable_policy.max_interval_between_rests_hours * 3600
    and proposed_24.work_seconds <= applicable_policy.max_work_24h * 3600
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
    case when proposed_24.maximum_amplitude_seconds > applicable_policy.max_amplitude_hours * 3600 then 'amplitude' end,
    case when proposed_24.maximum_rest_interval_seconds > applicable_policy.max_interval_between_rests_hours * 3600 then 'rest_interval' end,
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
      cross join lateral private.working_time_window_metrics_with_proposals_v4(
      p_person_id,
      candidate.candidate_end - interval '24 hours',
      candidate.candidate_end,
      p_timezone_name,
      applicable_policy.night_starts_at,
      applicable_policy.night_ends_at,
      p_exclude_interval_id,
      p_proposed_start,
      candidate.candidate_end,
      null,
      null,
      applicable_policy.min_consecutive_rest_hours
    ) metrics_24
      cross join lateral private.working_time_window_metrics_with_proposals_v4(
      p_person_id,
      candidate.candidate_end - interval '7 days',
      candidate.candidate_end,
      p_timezone_name,
      null,
      null,
      p_exclude_interval_id,
      p_proposed_start,
      candidate.candidate_end,
      null,
      null,
      applicable_policy.min_consecutive_rest_hours
    ) metrics_7
    ), evaluated as (
      select measured.*,
        measured.maximum_amplitude_seconds <= applicable_policy.max_amplitude_hours * 3600
    and measured.maximum_rest_interval_seconds <= applicable_policy.max_interval_between_rests_hours * 3600
    and measured.work_seconds <= applicable_policy.max_work_24h * 3600
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
      at_start.maximum_amplitude_seconds as start_amplitude, at_start.maximum_rest_interval_seconds as start_rest_interval,
      at_start.work_seconds as start_work_24h,
      at_start.rest_seconds as start_rest_24h,
      at_start.longest_rest_seconds as start_longest_rest,
      at_start.rest_period_count as start_rest_periods,
      at_start.night_work_seconds as start_night_work,
      start_7d.work_seconds as start_work_7d,
      start_7d.rest_seconds as start_rest_7d,
      at_end.maximum_amplitude_seconds as end_amplitude, at_end.maximum_rest_interval_seconds as end_rest_interval,
      at_end.work_seconds as end_work_24h,
      at_end.rest_seconds as end_rest_24h,
      at_end.longest_rest_seconds as end_longest_rest,
      at_end.rest_period_count as end_rest_periods,
      at_end.night_work_seconds as end_night_work,
      end_7d.work_seconds as end_work_7d,
      end_7d.rest_seconds as end_rest_7d
    from resolved
    cross join lateral private.working_time_window_metrics_with_proposals_v4(
      p_person_id,
      resolved.resume_at - interval '24 hours',
      resolved.resume_at,
      p_timezone_name,
      resolved.night_starts_at,
      resolved.night_ends_at,
      p_exclude_interval_id,
      case when baseline_compliant then p_proposed_start end,
      case when baseline_compliant then p_proposed_end end,
      null,
      null,
      resolved.min_consecutive_rest_hours
    ) at_start
    cross join lateral private.working_time_window_metrics_with_proposals_v4(
      p_person_id,
      resolved.resume_at - interval '7 days',
      resolved.resume_at,
      p_timezone_name,
      null,
      null,
      p_exclude_interval_id,
      case when baseline_compliant then p_proposed_start end,
      case when baseline_compliant then p_proposed_end end,
      null,
      null,
      resolved.min_consecutive_rest_hours
    ) start_7d
    cross join lateral private.working_time_window_metrics_with_proposals_v4(
      p_person_id,
      resolved.resume_at + interval '30 minutes' - interval '24 hours',
      resolved.resume_at + interval '30 minutes',
      p_timezone_name,
      resolved.night_starts_at,
      resolved.night_ends_at,
      p_exclude_interval_id,
      case when baseline_compliant then p_proposed_start end,
      case when baseline_compliant then p_proposed_end end,
      resolved.resume_at,
      resolved.resume_at + interval '30 minutes',
      resolved.min_consecutive_rest_hours
    ) at_end
    cross join lateral private.working_time_window_metrics_with_proposals_v4(
      p_person_id,
      resolved.resume_at + interval '30 minutes' - interval '7 days',
      resolved.resume_at + interval '30 minutes',
      p_timezone_name,
      null,
      null,
      p_exclude_interval_id,
      case when baseline_compliant then p_proposed_start end,
      case when baseline_compliant then p_proposed_end end,
      resolved.resume_at,
      resolved.resume_at + interval '30 minutes',
      resolved.min_consecutive_rest_hours
    ) end_7d
  )
  select min(resume_at) into next_compatible_resume
  from measured
  where start_amplitude <= max_amplitude_hours * 3600 and start_rest_interval <= max_interval_between_rests_hours * 3600
    and start_work_24h <= max_work_24h * 3600
    and private.working_time_rest_24h_satisfied(
      start_rest_24h, start_longest_rest, min_rest_24h, min_consecutive_rest_hours
    )
    and start_longest_rest >= min_consecutive_rest_hours * 3600
    and start_rest_periods <= max_rest_periods_24h
    and start_work_7d <= max_work_7d * 3600
    and start_rest_7d >= min_rest_7d * 3600
    and (max_night_work_24h is null or start_night_work <= max_night_work_24h * 3600)
    and end_amplitude <= max_amplitude_hours * 3600 and end_rest_interval <= max_interval_between_rests_hours * 3600
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
    'current_day_starts_at', proposed_24.current_day_starts_at,
    'current_day_ends_at', proposed_24.current_day_ends_at,
    'current_day_work_seconds', proposed_24.current_day_work_seconds,
    'calculation_days', proposed_24.calculation_days,
    'maximum_amplitude_seconds', proposed_24.maximum_amplitude_seconds,
    'maximum_rest_interval_seconds', proposed_24.maximum_rest_interval_seconds,
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
  from private.working_time_window_metrics_with_phase_json_v4(
      p_person_id,
      first_start - interval '24 hours',
      first_start,
      p_timezone_name,
      policy.night_starts_at,
      policy.night_ends_at,
      p_exclude_interval_id,
      '[]',
      policy.min_consecutive_rest_hours
    );
  select * into baseline7
  from private.working_time_window_metrics_with_phase_json_v4(
      p_person_id,
      first_start - interval '7 days',
      first_start,
      p_timezone_name,
      null,
      null,
      p_exclude_interval_id,
      '[]',
      policy.min_consecutive_rest_hours
    );
  select * into proposed24
  from private.working_time_window_metrics_with_phase_json_v4(
      p_person_id,
      last_end - interval '24 hours',
      last_end,
      p_timezone_name,
      policy.night_starts_at,
      policy.night_ends_at,
      p_exclude_interval_id,
      p_phases,
      policy.min_consecutive_rest_hours
    );
  select * into proposed7
  from private.working_time_window_metrics_with_phase_json_v4(
      p_person_id,
      last_end - interval '7 days',
      last_end,
      p_timezone_name,
      null,
      null,
      p_exclude_interval_id,
      p_phases,
      policy.min_consecutive_rest_hours
    );

  baseline_ok := baseline24.maximum_amplitude_seconds <= policy.max_amplitude_hours * 3600
    and baseline24.maximum_rest_interval_seconds <= policy.max_interval_between_rests_hours * 3600
    and baseline24.work_seconds <= policy.max_work_24h * 3600
    and private.working_time_rest_24h_satisfied(
      baseline24.rest_seconds, baseline24.longest_rest_seconds,
      policy.min_rest_24h, policy.min_consecutive_rest_hours
    )
    and baseline24.longest_rest_seconds >= policy.min_consecutive_rest_hours * 3600
    and baseline24.rest_period_count <= policy.max_rest_periods_24h
    and baseline7.work_seconds <= policy.max_work_7d * 3600
    and baseline7.rest_seconds >= policy.min_rest_7d * 3600;
  proposed_ok := proposed24.maximum_amplitude_seconds <= policy.max_amplitude_hours * 3600
    and proposed24.maximum_rest_interval_seconds <= policy.max_interval_between_rests_hours * 3600
    and proposed24.work_seconds <= policy.max_work_24h * 3600
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
    case when proposed24.maximum_amplitude_seconds > policy.max_amplitude_hours * 3600 then 'amplitude' end,
    case when proposed24.maximum_rest_interval_seconds > policy.max_interval_between_rests_hours * 3600 then 'rest_interval' end,
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
      cross join lateral private.working_time_window_metrics_with_phase_json_v4(
      p_person_id,
      candidates.candidate_end - interval '24 hours',
      candidates.candidate_end,
      p_timezone_name,
      policy.night_starts_at,
      policy.night_ends_at,
      p_exclude_interval_id,
      p_phases || jsonb_build_array(jsonb_build_object('starts_at', last_end, 'ends_at', candidates.candidate_end)),
      policy.min_consecutive_rest_hours
    ) m24
      cross join lateral private.working_time_window_metrics_with_phase_json_v4(
      p_person_id,
      candidates.candidate_end - interval '7 days',
      candidates.candidate_end,
      p_timezone_name,
      null,
      null,
      p_exclude_interval_id,
      p_phases || jsonb_build_array(jsonb_build_object('starts_at', last_end, 'ends_at', candidates.candidate_end)),
      policy.min_consecutive_rest_hours
    ) m7
    ), evaluated as (
      select measured.*,
        maximum_amplitude_seconds <= policy.max_amplitude_hours * 3600
    and maximum_rest_interval_seconds <= policy.max_interval_between_rests_hours * 3600
    and work_seconds <= policy.max_work_24h * 3600
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
      after24.maximum_amplitude_seconds after_amplitude, after24.maximum_rest_interval_seconds after_rest_interval,
      after24.work_seconds after_work24, after24.rest_seconds after_rest24,
      after24.longest_rest_seconds after_longest, after24.rest_period_count after_periods,
      after24.night_work_seconds after_night, after7.work_seconds after_work7,
      after7.rest_seconds after_rest7
    from candidates
    cross join lateral private.working_time_window_metrics_with_phase_json_v4(
      p_person_id,
      resume_at - interval '24 hours',
      resume_at,
      p_timezone_name,
      policy.night_starts_at,
      policy.night_ends_at,
      p_exclude_interval_id,
      p_phases,
      policy.min_consecutive_rest_hours
    ) start24
    cross join lateral private.working_time_window_metrics_with_phase_json_v4(
      p_person_id,
      resume_at - interval '7 days',
      resume_at,
      p_timezone_name,
      null,
      null,
      p_exclude_interval_id,
      p_phases,
      policy.min_consecutive_rest_hours
    ) start7
    cross join lateral private.working_time_window_metrics_with_phase_json_v4(
      p_person_id,
      resume_at - interval '23 hours 30 minutes',
      resume_at + interval '30 minutes',
      p_timezone_name,
      policy.night_starts_at,
      policy.night_ends_at,
      p_exclude_interval_id,
      p_phases || jsonb_build_array(jsonb_build_object(
        'starts_at', resume_at, 'ends_at', resume_at + interval '30 minutes'
      )),
      policy.min_consecutive_rest_hours
    ) after24
    cross join lateral private.working_time_window_metrics_with_phase_json_v4(
      p_person_id,
      resume_at - interval '6 days 23 hours 30 minutes',
      resume_at + interval '30 minutes',
      p_timezone_name,
      null,
      null,
      p_exclude_interval_id,
      p_phases || jsonb_build_array(jsonb_build_object(
        'starts_at', resume_at, 'ends_at', resume_at + interval '30 minutes'
      )),
      policy.min_consecutive_rest_hours
    ) after7
  )
  select min(resume_at) into next_compatible_resume
  from measured
  where maximum_amplitude_seconds <= policy.max_amplitude_hours * 3600
    and maximum_rest_interval_seconds <= policy.max_interval_between_rests_hours * 3600
    and work_seconds <= policy.max_work_24h * 3600
    and private.working_time_rest_24h_satisfied(
      rest_seconds, longest_rest_seconds, policy.min_rest_24h, policy.min_consecutive_rest_hours
    )
    and longest_rest_seconds >= policy.min_consecutive_rest_hours * 3600
    and rest_period_count <= policy.max_rest_periods_24h
    and work7 <= policy.max_work_7d * 3600
    and rest7 >= policy.min_rest_7d * 3600
    and (policy.max_night_work_24h is null
      or night_work_seconds <= policy.max_night_work_24h * 3600)
    and after_amplitude <= policy.max_amplitude_hours * 3600
    and after_rest_interval <= policy.max_interval_between_rests_hours * 3600
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
    'current_day_starts_at', proposed24.current_day_starts_at,
    'current_day_ends_at', proposed24.current_day_ends_at,
    'current_day_work_seconds', proposed24.current_day_work_seconds,
    'calculation_days', proposed24.calculation_days,
    'maximum_amplitude_seconds', proposed24.maximum_amplitude_seconds,
    'maximum_rest_interval_seconds', proposed24.maximum_rest_interval_seconds,
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

drop function public.save_planning_work_rest_policy(bigint,text,text,bigint,date,date,numeric,numeric,numeric,numeric,numeric,integer,time,time,numeric,boolean,boolean,text);
create or replace function public.save_planning_work_rest_policy(
  p_policy_id bigint,
  p_name text,
  p_scope text,
  p_vessel_id bigint,
  p_effective_from date,
  p_effective_to date,
  p_max_work_24h numeric,
  p_min_rest_24h numeric,
  p_max_work_7d numeric,
  p_min_rest_7d numeric,
  p_min_consecutive_rest_hours numeric,
  p_max_rest_periods_24h integer,
  p_night_starts_at time,
  p_night_ends_at time,
  p_max_night_work_24h numeric,
  p_include_handover boolean,
  p_active boolean,
  p_notes text,
  p_max_amplitude_hours numeric default null,
  p_max_interval_between_rests_hours numeric default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  target_id bigint;
begin
  if target_company_id is null
     or not public.has_company_role(target_company_id, array['admin']) then
    raise exception using errcode = '42501', message = 'Seul un administrateur peut gérer les politiques de travail et repos.';
  end if;

  if p_scope not in ('company', 'vessel')
     or (p_scope = 'company' and p_vessel_id is not null)
     or (p_scope = 'vessel' and p_vessel_id is null) then
    raise exception using errcode = '22023', message = 'La portée de la politique est invalide.';
  end if;

  if p_scope = 'vessel' and not exists (
    select 1
    from public.vessels
    where id = p_vessel_id and company_id = target_company_id
  ) then
    raise exception using errcode = '23503', message = 'Le navire ne fait pas partie de l’entreprise active.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      target_company_id::text || ':work-rest:' || p_scope || ':' || coalesce(p_vessel_id::text, 'company'),
      0
    )
  );

  if p_active and exists (
    select 1
    from public.planning_work_rest_policies policy
    where policy.company_id = target_company_id
      and policy.active
      and policy.scope = p_scope
      and policy.vessel_id is not distinct from p_vessel_id
      and policy.id is distinct from p_policy_id
      and daterange(policy.effective_from, coalesce(policy.effective_to, 'infinity'::date), '[]')
          && daterange(p_effective_from, coalesce(p_effective_to, 'infinity'::date), '[]')
  ) then
    raise exception using errcode = '23P01', message = 'Une politique active couvre déjà cette portée et cette période.';
  end if;

  if p_policy_id is null then
    insert into public.planning_work_rest_policies (
      company_id, name, scope, vessel_id, effective_from, effective_to,
      max_work_24h, min_rest_24h, max_work_7d, min_rest_7d,
      min_consecutive_rest_hours, max_rest_periods_24h,
      night_starts_at, night_ends_at, max_night_work_24h,
      include_handover, active, notes, max_amplitude_hours, max_interval_between_rests_hours
    ) values (
      target_company_id, trim(p_name), p_scope, p_vessel_id,
      p_effective_from, p_effective_to,
      p_max_work_24h, p_min_rest_24h, p_max_work_7d, p_min_rest_7d,
      p_min_consecutive_rest_hours, p_max_rest_periods_24h,
      p_night_starts_at, p_night_ends_at, p_max_night_work_24h,
      p_include_handover, p_active, nullif(trim(coalesce(p_notes, '')), ''),
      coalesce(p_max_amplitude_hours,14), coalesce(p_max_interval_between_rests_hours,14)
    ) returning id into target_id;
  else
    update public.planning_work_rest_policies
    set max_amplitude_hours = coalesce(p_max_amplitude_hours,max_amplitude_hours),
        max_interval_between_rests_hours = coalesce(p_max_interval_between_rests_hours,max_interval_between_rests_hours),
        name = trim(p_name),
        scope = p_scope,
        vessel_id = p_vessel_id,
        effective_from = p_effective_from,
        effective_to = p_effective_to,
        max_work_24h = p_max_work_24h,
        min_rest_24h = p_min_rest_24h,
        max_work_7d = p_max_work_7d,
        min_rest_7d = p_min_rest_7d,
        min_consecutive_rest_hours = p_min_consecutive_rest_hours,
        max_rest_periods_24h = p_max_rest_periods_24h,
        night_starts_at = p_night_starts_at,
        night_ends_at = p_night_ends_at,
        max_night_work_24h = p_max_night_work_24h,
        include_handover = p_include_handover,
        active = p_active,
        notes = nullif(trim(coalesce(p_notes, '')), ''),
        updated_at = now(),
        updated_by = auth.uid()
    where id = p_policy_id and company_id = target_company_id
    returning id into target_id;

    if target_id is null then
      raise exception using errcode = 'P0002', message = 'Politique introuvable.';
    end if;
  end if;

  insert into public.planning_change_log (
    company_id, entity_kind, entity_id, action, payload,
    changed_by, changed_by_name, vessel_id, starts_on, ends_on, summary
  ) values (
    target_company_id,
    'work_rest_policy',
    target_id,
    case when p_policy_id is null then 'create' else 'update' end,
    jsonb_build_object('name', trim(p_name), 'scope', p_scope, 'active', p_active),
    auth.uid(),
    public.planning_current_actor_name(),
    p_vessel_id,
    p_effective_from,
    coalesce(p_effective_to, p_effective_from),
    'Politique de travail et repos enregistrée'
  );

  return target_id;
end;
$$;
revoke all on function public.save_planning_work_rest_policy(bigint,text,text,bigint,date,date,numeric,numeric,numeric,numeric,numeric,integer,time,time,numeric,boolean,boolean,text,numeric,numeric) from public,anon,authenticated;
grant execute on function public.save_planning_work_rest_policy(bigint,text,text,bigint,date,date,numeric,numeric,numeric,numeric,numeric,integer,time,time,numeric,boolean,boolean,text,numeric,numeric) to authenticated;

-- Retain legacy internal signatures for callers while sharing the same engine.
create or replace function private.working_time_window_metrics(
  target_person_id bigint,target_window_start timestamptz,target_window_end timestamptz,
  target_timezone_name text,target_night_starts_at time default null,target_night_ends_at time default null
) returns table(work_seconds numeric,rest_seconds numeric,longest_rest_seconds numeric,rest_period_count integer,night_work_seconds numeric)
language sql stable security definer set search_path = '' as $$
  select work_seconds,rest_seconds,longest_rest_seconds,rest_period_count,night_work_seconds
  from private.working_time_calculation_day_metrics(target_person_id,target_window_start,target_window_end,
    target_timezone_name,target_night_starts_at,target_night_ends_at,null,'[]'::jsonb,6);
$$;
create or replace function private.working_time_window_metrics_with_phase_json(
  target_person_id bigint,target_window_start timestamptz,target_window_end timestamptz,
  target_timezone_name text,target_night_starts_at time,target_night_ends_at time,
  target_exclude_interval_id bigint,target_phases jsonb
) returns table(work_seconds numeric,rest_seconds numeric,longest_rest_seconds numeric,rest_period_count integer,night_work_seconds numeric)
language sql stable security definer set search_path = '' as $$
  select work_seconds,rest_seconds,longest_rest_seconds,rest_period_count,night_work_seconds
  from private.working_time_calculation_day_metrics(target_person_id,target_window_start,target_window_end,
    target_timezone_name,target_night_starts_at,target_night_ends_at,target_exclude_interval_id,target_phases,6);
$$;
create or replace function private.working_time_window_metrics_with_proposals(
  target_person_id bigint,target_window_start timestamptz,target_window_end timestamptz,
  target_timezone_name text,target_night_starts_at time default null,target_night_ends_at time default null,
  target_exclude_interval_id bigint default null,target_first_starts_at timestamptz default null,target_first_ends_at timestamptz default null,
  target_second_starts_at timestamptz default null,target_second_ends_at timestamptz default null
) returns table(work_seconds numeric,rest_seconds numeric,longest_rest_seconds numeric,rest_period_count integer,night_work_seconds numeric)
language sql stable security definer set search_path = '' as $$
  select work_seconds,rest_seconds,longest_rest_seconds,rest_period_count,night_work_seconds
  from private.working_time_window_metrics_with_proposals_v4(target_person_id,target_window_start,target_window_end,
    target_timezone_name,target_night_starts_at,target_night_ends_at,target_exclude_interval_id,
    target_first_starts_at,target_first_ends_at,target_second_starts_at,target_second_ends_at,6);
$$;

-- Preserve recipients, fingerprints and notification dispatch; add precise
-- labels for the newly configurable controls without emitting a historical wave.
do $notification_labels$
declare definition text;
begin
  definition := pg_get_functiondef('public.working_time_queue_non_compliance_notification(bigint)'::regprocedure);
  definition := replace(definition, 'travail maximal depuis le dernier repos de 6 h dépassé', 'travail maximal par journée de calcul dépassé');
  definition := replace(definition, 'Travail depuis repos 6 h', 'Travail maximal par journée de calcul');
  definition := replace(definition,
    '  if ''work_7d'' = any(calculation.violation_codes) then',
    '  if ''amplitude'' = any(calculation.violation_codes) then violation_labels := array_append(violation_labels, ''amplitude maximale dépassée''); end if;
  if ''rest_interval'' = any(calculation.violation_codes) then violation_labels := array_append(violation_labels, ''intervalle maximal entre repos dépassé''); end if;
  if ''work_7d'' = any(calculation.violation_codes) then');
  execute definition;
end;
$notification_labels$;
notify pgrst, 'reload schema';
