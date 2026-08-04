create or replace function private.working_time_merged_ranges_with_phase_json(
  target_person_id bigint,
  target_window_start timestamptz,
  target_window_end timestamptz,
  target_exclude_interval_id bigint,
  target_phases jsonb
) returns table(starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path=public,private,pg_temp
as $$
  with sources as (
    select item.starts_at,item.ends_at from public.working_time_intervals item
    where item.person_id=target_person_id and item.voided_at is null
      and (target_exclude_interval_id is null or item.id<>target_exclude_interval_id)
    union all
    select phase.starts_at,phase.ends_at
    from jsonb_to_recordset(coalesce(target_phases,'[]'::jsonb)) phase(starts_at timestamptz,ends_at timestamptz)
    where phase.starts_at<phase.ends_at
  ), clipped as (
    select greatest(starts_at,target_window_start) starts_at,least(ends_at,target_window_end) ends_at
    from sources where starts_at<target_window_end and ends_at>target_window_start
  ), ordered as (
    select clipped.*,max(ends_at) over(order by starts_at,ends_at rows between unbounded preceding and 1 preceding) previous_max
    from clipped where starts_at<ends_at
  ), islands as (
    select ordered.*,sum(case when previous_max is null or starts_at>previous_max then 1 else 0 end) over(order by starts_at,ends_at) island_id
    from ordered
  )
  select min(starts_at),max(ends_at) from islands group by island_id order by min(starts_at);
$$;

create or replace function private.working_time_window_metrics_with_phase_json(
  target_person_id bigint,target_window_start timestamptz,target_window_end timestamptz,
  target_timezone_name text,target_night_starts_at time,target_night_ends_at time,
  target_exclude_interval_id bigint,target_phases jsonb
) returns table(work_seconds numeric,rest_seconds numeric,longest_rest_seconds numeric,rest_period_count integer,night_work_seconds numeric)
language sql stable security definer set search_path=public,private,pg_temp
as $$
  with merged as materialized (
    select * from private.working_time_merged_ranges_with_phase_json(target_person_id,target_window_start,target_window_end,target_exclude_interval_id,target_phases)
  ), totals as (
    select coalesce(sum(extract(epoch from ends_at-starts_at)),0)::numeric work_seconds from merged
  ), gaps as (
    select extract(epoch from starts_at-lag(ends_at,1,target_window_start) over(order by starts_at,ends_at))::numeric seconds from merged
    union all select extract(epoch from target_window_end-coalesce(max(ends_at),target_window_start))::numeric from merged
  ), rest_summary as (
    select coalesce(max(seconds) filter(where seconds>0),0)::numeric longest_rest,count(*) filter(where seconds>0)::integer periods from gaps
  ), night_dates as (
    select value::date local_date from generate_series((target_window_start at time zone target_timezone_name)::date-1,(target_window_end at time zone target_timezone_name)::date,interval '1 day') value
    where target_night_starts_at is not null and target_night_ends_at is not null
  ), nights as (
    select (local_date+target_night_starts_at) at time zone target_timezone_name starts_at,
      (local_date+case when target_night_ends_at>target_night_starts_at then 0 else 1 end+target_night_ends_at) at time zone target_timezone_name ends_at
    from night_dates
  ), night_total as (
    select coalesce(sum(extract(epoch from least(merged.ends_at,nights.ends_at,target_window_end)-greatest(merged.starts_at,nights.starts_at,target_window_start))),0)::numeric seconds
    from merged join nights on merged.starts_at<least(nights.ends_at,target_window_end) and merged.ends_at>greatest(nights.starts_at,target_window_start)
  )
  select round(totals.work_seconds,3),round(extract(epoch from target_window_end-target_window_start)::numeric-totals.work_seconds,3),
    round(rest_summary.longest_rest,3),rest_summary.periods,
    case when target_night_starts_at is null or target_night_ends_at is null then null else round(night_total.seconds,3) end
  from totals cross join rest_summary cross join night_total;
$$;

create or replace function public.working_time_phases_recommendation(
  p_person_id bigint,p_phases jsonb,p_timezone_name text,p_vessel_id bigint default null,
  p_watch_group text default null,p_exclude_interval_id bigint default null
) returns jsonb
language plpgsql stable security definer set search_path=public,private,pg_temp
as $$
declare
  first_start timestamptz; last_end timestamptz; phase_count integer;
  auth_result jsonb; policy public.planning_work_rest_policies%rowtype;
  baseline24 record; baseline7 record; proposed24 record; proposed7 record;
  violations text[]; baseline_ok boolean; proposed_ok boolean; adjusted_max numeric;
  latest_compatible_end timestamptz; next_compatible_resume timestamptz;
begin
  if p_phases is null or jsonb_typeof(p_phases)<>'array' or jsonb_array_length(p_phases) not between 1 and 48 then
    raise exception using errcode='22023',message='WORKING_TIME_PHASES_INVALID';
  end if;
  with phases as (select * from jsonb_to_recordset(p_phases) phase(starts_at timestamptz,ends_at timestamptz))
  select min(starts_at),max(ends_at),count(*) into first_start,last_end,phase_count from phases;
  if first_start is null or exists(select 1 from jsonb_to_recordset(p_phases) phase(starts_at timestamptz,ends_at timestamptz) where starts_at is null or ends_at is null or ends_at<=starts_at or ends_at>starts_at+interval '24 hours') then
    raise exception using errcode='22023',message='WORKING_TIME_PHASES_INVALID';
  end if;
  if exists(
    select 1 from jsonb_to_recordset(p_phases) a(starts_at timestamptz,ends_at timestamptz)
    join jsonb_to_recordset(p_phases) b(starts_at timestamptz,ends_at timestamptz) on a.starts_at<b.starts_at and a.ends_at>b.starts_at
  ) then raise exception using errcode='22023',message='WORKING_TIME_PHASES_OVERLAP'; end if;
  if exists(select 1 from jsonb_to_recordset(p_phases) phase(starts_at timestamptz,ends_at timestamptz)
    where (phase.starts_at at time zone p_timezone_name)::date<>(first_start at time zone p_timezone_name)::date)
  then raise exception using errcode='22023',message='WORKING_TIME_PHASES_INVALID'; end if;

  select public.working_time_interval_recommendation(p_person_id,first_start,
    (select ends_at from jsonb_to_recordset(p_phases) phase(starts_at timestamptz,ends_at timestamptz) order by starts_at limit 1),
    p_timezone_name,p_vessel_id,p_watch_group,p_exclude_interval_id) into auth_result;
  if auth_result->>'policy_id' is null then return auth_result||jsonb_build_object('phase_count',phase_count); end if;
  select * into policy from public.planning_work_rest_policies where id=(auth_result->>'policy_id')::bigint;
  select * into baseline24 from private.working_time_window_metrics_with_phase_json(p_person_id,first_start-interval '24 hours',first_start,p_timezone_name,policy.night_starts_at,policy.night_ends_at,p_exclude_interval_id,'[]');
  select * into baseline7 from private.working_time_window_metrics_with_phase_json(p_person_id,first_start-interval '7 days',first_start,p_timezone_name,null,null,p_exclude_interval_id,'[]');
  select * into proposed24 from private.working_time_window_metrics_with_phase_json(p_person_id,last_end-interval '24 hours',last_end,p_timezone_name,policy.night_starts_at,policy.night_ends_at,p_exclude_interval_id,p_phases);
  select * into proposed7 from private.working_time_window_metrics_with_phase_json(p_person_id,last_end-interval '7 days',last_end,p_timezone_name,null,null,p_exclude_interval_id,p_phases);
  baseline_ok:=baseline24.work_seconds<=policy.max_work_24h*3600 and baseline24.rest_seconds>=policy.min_rest_24h*3600 and baseline24.longest_rest_seconds>=policy.min_consecutive_rest_hours*3600 and baseline24.rest_period_count<=policy.max_rest_periods_24h and baseline7.work_seconds<=policy.max_work_7d*3600 and baseline7.rest_seconds>=policy.min_rest_7d*3600;
  proposed_ok:=proposed24.work_seconds<=policy.max_work_24h*3600 and proposed24.rest_seconds>=policy.min_rest_24h*3600 and proposed24.longest_rest_seconds>=policy.min_consecutive_rest_hours*3600 and proposed24.rest_period_count<=policy.max_rest_periods_24h and proposed7.work_seconds<=policy.max_work_7d*3600 and proposed7.rest_seconds>=policy.min_rest_7d*3600 and (policy.max_night_work_24h is null or proposed24.night_work_seconds<=policy.max_night_work_24h*3600);
  violations:=array_remove(array[
    case when proposed24.work_seconds>policy.max_work_24h*3600 then 'work_24h' end,case when proposed24.rest_seconds<policy.min_rest_24h*3600 then 'rest_24h' end,
    case when proposed24.longest_rest_seconds<policy.min_consecutive_rest_hours*3600 then 'consecutive_rest' end,case when proposed24.rest_period_count>policy.max_rest_periods_24h then 'rest_periods_24h' end,
    case when proposed7.work_seconds>policy.max_work_7d*3600 then 'work_7d' end,case when proposed7.rest_seconds<policy.min_rest_7d*3600 then 'rest_7d' end,
    case when policy.max_night_work_24h is not null and proposed24.night_work_seconds>policy.max_night_work_24h*3600 then 'night_work_24h' end],null);
  if baseline_ok and proposed_ok then
    with candidates as (
      select candidate_end from generate_series(last_end+interval '30 minutes',last_end+interval '24 hours',interval '30 minutes') candidate_end
    ), measured as (
      select candidates.candidate_end,m24.*,m7.work_seconds work7,m7.rest_seconds rest7
      from candidates
      cross join lateral private.working_time_window_metrics_with_phase_json(
        p_person_id,candidates.candidate_end-interval '24 hours',candidates.candidate_end,p_timezone_name,
        policy.night_starts_at,policy.night_ends_at,p_exclude_interval_id,
        p_phases||jsonb_build_array(jsonb_build_object('starts_at',last_end,'ends_at',candidates.candidate_end))
      ) m24
      cross join lateral private.working_time_window_metrics_with_phase_json(
        p_person_id,candidates.candidate_end-interval '7 days',candidates.candidate_end,p_timezone_name,
        null,null,p_exclude_interval_id,p_phases||jsonb_build_array(jsonb_build_object('starts_at',last_end,'ends_at',candidates.candidate_end))
      ) m7
    ), evaluated as (
      select measured.*,work_seconds<=policy.max_work_24h*3600 and rest_seconds>=policy.min_rest_24h*3600
        and longest_rest_seconds>=policy.min_consecutive_rest_hours*3600 and rest_period_count<=policy.max_rest_periods_24h
        and work7<=policy.max_work_7d*3600 and rest7>=policy.min_rest_7d*3600
        and (policy.max_night_work_24h is null or night_work_seconds<=policy.max_night_work_24h*3600) compliant
      from measured
    ), continuous as (
      select evaluated.*,bool_and(compliant) over(order by candidate_end rows between unbounded preceding and current row) continuous_ok from evaluated
    ) select max(candidate_end) filter(where continuous_ok) into latest_compatible_end from continuous;
  end if;
  adjusted_max:=greatest(0,coalesce(extract(epoch from latest_compatible_end-last_end),0));

  with candidates as (
    select resume_at from generate_series(last_end+policy.min_consecutive_rest_hours*interval '1 hour',last_end+interval '7 days',interval '30 minutes') resume_at
  ), measured as (
    select candidates.resume_at,start24.*,start7.work_seconds work7,start7.rest_seconds rest7,
      after24.work_seconds after_work24,after24.rest_seconds after_rest24,after24.longest_rest_seconds after_longest,
      after24.rest_period_count after_periods,after24.night_work_seconds after_night,after7.work_seconds after_work7,after7.rest_seconds after_rest7
    from candidates
    cross join lateral private.working_time_window_metrics_with_phase_json(p_person_id,resume_at-interval '24 hours',resume_at,p_timezone_name,policy.night_starts_at,policy.night_ends_at,p_exclude_interval_id,p_phases) start24
    cross join lateral private.working_time_window_metrics_with_phase_json(p_person_id,resume_at-interval '7 days',resume_at,p_timezone_name,null,null,p_exclude_interval_id,p_phases) start7
    cross join lateral private.working_time_window_metrics_with_phase_json(p_person_id,resume_at-interval '23 hours 30 minutes',resume_at+interval '30 minutes',p_timezone_name,policy.night_starts_at,policy.night_ends_at,p_exclude_interval_id,p_phases||jsonb_build_array(jsonb_build_object('starts_at',resume_at,'ends_at',resume_at+interval '30 minutes'))) after24
    cross join lateral private.working_time_window_metrics_with_phase_json(p_person_id,resume_at-interval '6 days 23 hours 30 minutes',resume_at+interval '30 minutes',p_timezone_name,null,null,p_exclude_interval_id,p_phases||jsonb_build_array(jsonb_build_object('starts_at',resume_at,'ends_at',resume_at+interval '30 minutes'))) after7
  ) select min(resume_at) into next_compatible_resume from measured
    where work_seconds<=policy.max_work_24h*3600 and rest_seconds>=policy.min_rest_24h*3600 and longest_rest_seconds>=policy.min_consecutive_rest_hours*3600
      and rest_period_count<=policy.max_rest_periods_24h and work7<=policy.max_work_7d*3600 and rest7>=policy.min_rest_7d*3600
      and (policy.max_night_work_24h is null or night_work_seconds<=policy.max_night_work_24h*3600)
      and after_work24<=policy.max_work_24h*3600 and after_rest24>=policy.min_rest_24h*3600 and after_longest>=policy.min_consecutive_rest_hours*3600
      and after_periods<=policy.max_rest_periods_24h and after_work7<=policy.max_work_7d*3600 and after_rest7>=policy.min_rest_7d*3600
      and (policy.max_night_work_24h is null or after_night<=policy.max_night_work_24h*3600);
  return jsonb_build_object('status',case when not baseline_ok or not proposed_ok then 'non_conforme' when adjusted_max<=3600 then 'alerte' else 'conforme' end,
    'policy_id',policy.id,'policy_name',policy.name,'already_non_compliant',not baseline_ok,'phase_count',phase_count,
    'available_24h_seconds',greatest(0,policy.max_work_24h*3600-proposed24.work_seconds),'available_7d_seconds',greatest(0,policy.max_work_7d*3600-proposed7.work_seconds),
    'work_24h_seconds',proposed24.work_seconds,'work_7d_seconds',proposed7.work_seconds,'rest_24h_seconds',proposed24.rest_seconds,'longest_rest_24h_seconds',proposed24.longest_rest_seconds,
    'rest_impact_seconds',proposed24.rest_seconds-baseline24.rest_seconds,'consecutive_rest_impact_seconds',proposed24.longest_rest_seconds-baseline24.longest_rest_seconds,
    'max_additional_seconds',case when baseline_ok and proposed_ok then adjusted_max else 0 end,'latest_end_at',case when baseline_ok and proposed_ok then latest_compatible_end end,
    'next_resume_at',next_compatible_resume,'violation_codes',to_jsonb(violations));
end;
$$;

create or replace function public.save_working_time_phases(
  p_register_id bigint,p_phases jsonb,p_timezone_name text,p_vessel_id bigint default null,
  p_watch_group text default null,p_comment text default null
) returns bigint[]
language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare target public.working_time_registers%rowtype; phase record; ids bigint[]:=array[]::bigint[];
begin
  select * into target from public.working_time_registers where id=p_register_id for update;
  if target.id is null then raise exception 'WORKING_TIME_REGISTER_NOT_FOUND'; end if;
  perform public.working_time_phases_recommendation(target.person_id,p_phases,p_timezone_name,p_vessel_id,p_watch_group,null);
  if exists(select 1 from jsonb_to_recordset(p_phases) proposed(starts_at timestamptz,ends_at timestamptz)
    join public.working_time_intervals existing on existing.person_id=target.person_id and existing.voided_at is null and proposed.starts_at<existing.ends_at and proposed.ends_at>existing.starts_at)
  then raise exception using errcode='22023',message='WORKING_TIME_PHASES_EXISTING_OVERLAP'; end if;
  for phase in select * from jsonb_to_recordset(p_phases) item(starts_at timestamptz,ends_at timestamptz) order by starts_at loop
    ids:=array_append(ids,public.save_working_time_interval(p_register_id,phase.starts_at,phase.ends_at,p_timezone_name,p_vessel_id,p_watch_group,p_comment,null));
  end loop;
  return ids;
end;
$$;

revoke all on function private.working_time_merged_ranges_with_phase_json(bigint,timestamptz,timestamptz,bigint,jsonb) from public,anon,authenticated;
revoke all on function private.working_time_window_metrics_with_phase_json(bigint,timestamptz,timestamptz,text,time,time,bigint,jsonb) from public,anon,authenticated;
revoke all on function public.working_time_phases_recommendation(bigint,jsonb,text,bigint,text,bigint) from public,anon,authenticated;
revoke all on function public.save_working_time_phases(bigint,jsonb,text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.working_time_phases_recommendation(bigint,jsonb,text,bigint,text,bigint) to authenticated;
grant execute on function public.save_working_time_phases(bigint,jsonb,text,bigint,text,text) to authenticated;
