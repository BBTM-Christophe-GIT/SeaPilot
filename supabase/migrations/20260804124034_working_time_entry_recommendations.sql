-- Working Time step 7: authoritative, non-destructive entry recommendations.
-- The browser supplies a tentative interval; PostgreSQL merges it with the
-- canonical intervals and evaluates the dated P1.3 policy without persisting it.

create or replace function private.working_time_merged_ranges_with_proposals(
  target_person_id bigint,
  target_window_start timestamptz,
  target_window_end timestamptz,
  target_exclude_interval_id bigint default null,
  target_first_starts_at timestamptz default null,
  target_first_ends_at timestamptz default null,
  target_second_starts_at timestamptz default null,
  target_second_ends_at timestamptz default null
)
returns table(starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  with sources as (
    select work_interval.starts_at, work_interval.ends_at
    from public.working_time_intervals work_interval
    where work_interval.person_id = target_person_id
      and work_interval.voided_at is null
      and (target_exclude_interval_id is null or work_interval.id <> target_exclude_interval_id)
    union all
    select target_first_starts_at, target_first_ends_at
    where target_first_starts_at is not null
      and target_first_ends_at is not null
      and target_first_starts_at < target_first_ends_at
    union all
    select target_second_starts_at, target_second_ends_at
    where target_second_starts_at is not null
      and target_second_ends_at is not null
      and target_second_starts_at < target_second_ends_at
  ), clipped as (
    select
      greatest(source.starts_at, target_window_start) as starts_at,
      least(source.ends_at, target_window_end) as ends_at
    from sources source
    where source.starts_at < target_window_end
      and source.ends_at > target_window_start
  ), ordered as (
    select
      clipped.*,
      max(ends_at) over (
        order by starts_at, ends_at
        rows between unbounded preceding and 1 preceding
      ) as previous_max_end
    from clipped
    where starts_at < ends_at
  ), islands as (
    select
      ordered.*,
      sum(case when previous_max_end is null or starts_at > previous_max_end then 1 else 0 end)
        over (order by starts_at, ends_at) as island_id
    from ordered
  )
  select min(islands.starts_at), max(islands.ends_at)
  from islands
  group by island_id
  order by min(islands.starts_at), max(islands.ends_at);
$$;

create or replace function private.working_time_window_metrics_with_proposals(
  target_person_id bigint,
  target_window_start timestamptz,
  target_window_end timestamptz,
  target_timezone_name text,
  target_night_starts_at time default null,
  target_night_ends_at time default null,
  target_exclude_interval_id bigint default null,
  target_first_starts_at timestamptz default null,
  target_first_ends_at timestamptz default null,
  target_second_starts_at timestamptz default null,
  target_second_ends_at timestamptz default null
)
returns table(
  work_seconds numeric,
  rest_seconds numeric,
  longest_rest_seconds numeric,
  rest_period_count integer,
  night_work_seconds numeric
)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  with merged as materialized (
    select *
    from private.working_time_merged_ranges_with_proposals(
      target_person_id, target_window_start, target_window_end,
      target_exclude_interval_id,
      target_first_starts_at, target_first_ends_at,
      target_second_starts_at, target_second_ends_at
    )
  ), work_total as (
    select coalesce(sum(extract(epoch from (ends_at - starts_at))), 0)::numeric as seconds
    from merged
  ), rest_gaps as (
    select extract(epoch from (
      starts_at - lag(ends_at, 1, target_window_start) over (order by starts_at, ends_at)
    ))::numeric as seconds
    from merged
    union all
    select extract(epoch from (
      target_window_end - coalesce(max(ends_at), target_window_start)
    ))::numeric
    from merged
  ), rest_summary as (
    select
      coalesce(max(seconds) filter (where seconds > 0), 0)::numeric as longest_seconds,
      count(*) filter (where seconds > 0)::integer as period_count
    from rest_gaps
  ), night_dates as (
    select generated_at::date as local_date
    from generate_series(
      (target_window_start at time zone target_timezone_name)::date - 1,
      (target_window_end at time zone target_timezone_name)::date,
      interval '1 day'
    ) generated_at
    where target_night_starts_at is not null and target_night_ends_at is not null
  ), night_spans as (
    select
      (local_date + target_night_starts_at) at time zone target_timezone_name as starts_at,
      (
        local_date
        + case when target_night_ends_at > target_night_starts_at then 0 else 1 end
        + target_night_ends_at
      ) at time zone target_timezone_name as ends_at
    from night_dates
  ), night_total as (
    select coalesce(sum(extract(epoch from (
      least(merged.ends_at, night_spans.ends_at, target_window_end)
      - greatest(merged.starts_at, night_spans.starts_at, target_window_start)
    ))), 0)::numeric as seconds
    from merged
    join night_spans
      on merged.starts_at < least(night_spans.ends_at, target_window_end)
     and merged.ends_at > greatest(night_spans.starts_at, target_window_start)
  )
  select
    round(work_total.seconds, 3),
    round(extract(epoch from (target_window_end - target_window_start))::numeric - work_total.seconds, 3),
    round(rest_summary.longest_seconds, 3),
    rest_summary.period_count,
    case
      when target_night_starts_at is null or target_night_ends_at is null then null
      else round(night_total.seconds, 3)
    end
  from work_total
  cross join rest_summary
  cross join night_total;
$$;

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
    and baseline_24.rest_seconds >= applicable_policy.min_rest_24h * 3600
    and baseline_24.longest_rest_seconds >= applicable_policy.min_consecutive_rest_hours * 3600
    and baseline_24.rest_period_count <= applicable_policy.max_rest_periods_24h
    and baseline_7d.work_seconds <= applicable_policy.max_work_7d * 3600
    and baseline_7d.rest_seconds >= applicable_policy.min_rest_7d * 3600
    and (applicable_policy.max_night_work_24h is null
      or baseline_24.night_work_seconds <= applicable_policy.max_night_work_24h * 3600);

  proposed_compliant := proposed_24.work_seconds <= applicable_policy.max_work_24h * 3600
    and proposed_24.rest_seconds >= applicable_policy.min_rest_24h * 3600
    and proposed_24.longest_rest_seconds >= applicable_policy.min_consecutive_rest_hours * 3600
    and proposed_24.rest_period_count <= applicable_policy.max_rest_periods_24h
    and proposed_7d.work_seconds <= applicable_policy.max_work_7d * 3600
    and proposed_7d.rest_seconds >= applicable_policy.min_rest_7d * 3600
    and (applicable_policy.max_night_work_24h is null
      or proposed_24.night_work_seconds <= applicable_policy.max_night_work_24h * 3600);

  violation_codes := array_remove(array[
    case when proposed_24.work_seconds > applicable_policy.max_work_24h * 3600 then 'work_24h' end,
    case when proposed_24.rest_seconds < applicable_policy.min_rest_24h * 3600 then 'rest_24h' end,
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
        and measured.rest_seconds >= applicable_policy.min_rest_24h * 3600
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
    and start_rest_24h >= min_rest_24h * 3600
    and start_longest_rest >= min_consecutive_rest_hours * 3600
    and start_rest_periods <= max_rest_periods_24h
    and start_work_7d <= max_work_7d * 3600
    and start_rest_7d >= min_rest_7d * 3600
    and (max_night_work_24h is null or start_night_work <= max_night_work_24h * 3600)
    and end_work_24h <= max_work_24h * 3600
    and end_rest_24h >= min_rest_24h * 3600
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

revoke all on function private.working_time_merged_ranges_with_proposals(
  bigint, timestamptz, timestamptz, bigint, timestamptz, timestamptz, timestamptz, timestamptz
) from public, anon, authenticated;
revoke all on function private.working_time_window_metrics_with_proposals(
  bigint, timestamptz, timestamptz, text, time, time, bigint,
  timestamptz, timestamptz, timestamptz, timestamptz
) from public, anon, authenticated;
revoke all on function public.working_time_interval_recommendation(
  bigint, timestamptz, timestamptz, text, bigint, text, bigint
) from public, anon;
grant execute on function public.working_time_interval_recommendation(
  bigint, timestamptz, timestamptz, text, bigint, text, bigint
) to authenticated;

comment on function public.working_time_interval_recommendation(
  bigint, timestamptz, timestamptz, text, bigint, text, bigint
) is 'Simulates a tentative interval against dated P1.3 rules and returns authoritative 24h/7d entry guidance without persisting browser aggregates.';
