-- Authoritative existence coverage: compatible 24h windows may overlap/touch.
-- A single incompatible sliding window does not create an alarm. Raw work,
-- administrator thresholds and already signed historical evidence are retained.
create function private.working_time_window_verdict(
  p_context jsonb,p_end timestamptz,p_timezone text,p_policy_id bigint
) returns jsonb language sql stable security definer set search_path=''
as $$
  with reference_policy as materialized (
    select company_id,vessel_id from public.planning_work_rest_policies where id=p_policy_id
  ), policy as materialized (
    select p.* from public.planning_work_rest_policies p cross join reference_policy r
    where p.company_id=r.company_id and p.active and (p.scope='company' or p.vessel_id=r.vessel_id)
      and p.effective_from<=((p_end-interval '1 microsecond') at time zone p_timezone)::date
      and (p.effective_to is null or p.effective_to>=((p_end-interval '1 microsecond') at time zone p_timezone)::date)
    order by (p.scope='vessel') desc,p.effective_from desc,p.id desc limit 1
  ), source as (
    select * from jsonb_to_recordset(p_context) r(starts_at timestamptz,ends_at timestamptz) where r.ends_at>r.starts_at
  ), ordered_source as (
    select s.*,max(s.ends_at) over(order by s.starts_at,s.ends_at rows between unbounded preceding and 1 preceding) previous_end from source s
  ), islands as (
    select s.*,sum(case when s.previous_end is null or s.starts_at>s.previous_end then 1 else 0 end)
      over(order by s.starts_at,s.ends_at) island from ordered_source s
  ), ranges as materialized (
    select min(r.starts_at) starts_at,max(r.ends_at) ends_at from islands r group by r.island
  ), clipped as materialized (
    select greatest(r.starts_at,p_end-interval '24 hours') starts_at,least(r.ends_at,p_end) ends_at
    from ranges r where r.starts_at<p_end and r.ends_at>p_end-interval '24 hours'
  ), totals as (
    select coalesce(sum(extract(epoch from c.ends_at-c.starts_at)),0) work24 from clipped c
  ), total7 as (
    select coalesce(sum(extract(epoch from least(r.ends_at,p_end)-greatest(r.starts_at,p_end-interval '168 hours'))),0) work7
    from ranges r where r.starts_at<p_end and r.ends_at>p_end-interval '168 hours'
  ), gaps as (
    select c.starts_at-lag(c.ends_at,1,p_end-interval '24 hours') over(order by c.starts_at) duration from clipped c
    union all select p_end-coalesce(max(c.ends_at),p_end-interval '24 hours') from clipped c
  ), rest_summary as (
    select coalesce(max(extract(epoch from g.duration)) filter(where g.duration>interval '0'),0) longest,
      count(*) filter(where g.duration>interval '0') periods from gaps g
  ), ordered_ranges as (
    select r.*,lag(r.ends_at) over(order by r.starts_at) previous_end from ranges r
  ), numbered_ranges as (
    select r.*,sum(case when r.previous_end is null or r.starts_at-r.previous_end>=p.min_consecutive_rest_hours*interval '1 hour'
      then 1 else 0 end) over(order by r.starts_at) cycle from ordered_ranges r cross join policy p
  ), cycles as (
    select min(r.starts_at) starts_at,max(r.ends_at) ends_at,sum(extract(epoch from r.ends_at-r.starts_at)) work
    from numbered_ranges r group by r.cycle
  ), cycle_summary as (
    select coalesce(max(c.work),0) work,coalesce(max(extract(epoch from c.ends_at-c.starts_at)),0) amplitude
    from cycles c where c.starts_at<p_end and c.ends_at>p_end-interval '24 hours'
  ), interval_summary as (
    select coalesce(max(extract(epoch from r.ends_at-r.starts_at)),0) rest_interval from ranges r
    where r.starts_at<p_end and r.ends_at>p_end-interval '24 hours'
  ), nights as (
    select (d::date+p.night_starts_at) at time zone p_timezone starts_at,
      (d::date+case when p.night_ends_at>p.night_starts_at then 0 else 1 end+p.night_ends_at) at time zone p_timezone ends_at
    from policy p cross join lateral generate_series(((p_end-interval '24 hours') at time zone p_timezone)::date-1,
      (p_end at time zone p_timezone)::date,interval '1 day') d
  ), night_summary as (
    select coalesce(sum(extract(epoch from least(c.ends_at,n.ends_at)-greatest(c.starts_at,n.starts_at))),0) work
    from clipped c join nights n on c.starts_at<n.ends_at and c.ends_at>n.starts_at
  ), measured as (
    select p.*,round(86400-t.work24,3) rest24,round(t7.work7,3) work7,round(604800-t7.work7,3) rest7,
      round(rs.longest,3) longest,rs.periods,cs.work cycle_work,cs.amplitude,i.rest_interval,
      case when p.night_starts_at is null or p.night_ends_at is null then null else round(n.work,3) end night_work
    from reference_policy ref left join policy p on true cross join totals t cross join total7 t7
      cross join rest_summary rs cross join cycle_summary cs cross join interval_summary i cross join night_summary n
  ), evaluated as (
    select m.*,array_remove(array[
      case when m.cycle_work>m.max_work_24h*3600 then 'work_24h' end,
      case when m.rest24<m.min_rest_24h*3600 then 'rest_24h' end,
      case when m.longest<m.min_consecutive_rest_hours*3600 then 'consecutive_rest' end,
      case when m.periods>m.max_rest_periods_24h then 'rest_periods_24h' end,
      case when m.work7>m.max_work_7d*3600 then 'work_7d' end,
      case when m.rest7<m.min_rest_7d*3600 then 'rest_7d' end,
      case when m.night_work>m.max_night_work_24h*3600 then 'night_work_24h' end,
      case when m.amplitude>m.max_amplitude_hours*3600 then 'amplitude' end,
      case when m.rest_interval>m.max_interval_between_rests_hours*3600 then 'rest_interval' end
    ],null) codes from measured m
  )
  select case when e.id is null then jsonb_build_object('starts_at',p_end-interval '24 hours','ends_at',p_end,
    'valid',false,'violation_codes',jsonb_build_array('policy_missing')) else
    jsonb_build_object('starts_at',p_end-interval '24 hours','ends_at',p_end,'valid',cardinality(e.codes)=0,'policy_id',e.id,
      'violation_codes',to_jsonb(e.codes),'work_24h_seconds',e.cycle_work,'rest_24h_seconds',e.rest24,
      'longest_rest_24h_seconds',e.longest,'rest_period_count_24h',e.periods,'work_7d_seconds',e.work7,'rest_7d_seconds',e.rest7,
      'maximum_amplitude_seconds',e.amplitude,'maximum_rest_interval_seconds',e.rest_interval,'night_work_24h_seconds',e.night_work) end
  from evaluated e;
$$;
revoke all on function private.working_time_window_verdict(jsonb,timestamptz,text,bigint) from public,anon,authenticated;
create function private.working_time_coverage_for_scope(
  p_context jsonb,p_start timestamptz,p_end timestamptz,p_timezone text,p_policy_id bigint
) returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare policy public.planning_work_rest_policies%rowtype; point record; verdict jsonb; previous_t timestamptz;
  previous_valid boolean; middle_valid boolean; lo timestamptz; hi timestamptz; cursor_at timestamptz:=p_start;
  bands jsonb:='[]'; windows jsonb:='[]'; gaps jsonb:='[]'; band record; witness_end timestamptz;
  used_future boolean:=false; missing_policy boolean:=false; nearest jsonb; nearest_count integer:=100;
  blocking_windows jsonb:='[]'; gap record;
  invalid_bands jsonb:='[]'; middle_t timestamptz;
begin
  select * into strict policy from public.planning_work_rest_policies where id=p_policy_id;
  -- Most provisioned planning scopes have no actual work yet. Their metrics
  -- are constant (24h/168h rest); avoid evaluating every night boundary for
  -- every empty assignment on the fleet dashboard.
  if not exists(select 1 from jsonb_to_recordset(p_context) r(starts_at timestamptz,ends_at timestamptz)
      where r.starts_at<p_end+interval '24 hours' and r.ends_at>p_start-interval '168 hours')
    and not exists(select 1 from generate_series((p_start at time zone p_timezone)::date,
      ((p_end-interval '1 microsecond') at time zone p_timezone)::date,interval '1 day') d
      where not exists(select 1 from public.planning_work_rest_policies p where p.company_id=policy.company_id and p.active
        and (p.scope='company' or p.vessel_id=policy.vessel_id) and p.effective_from<=d::date
        and (p.effective_to is null or p.effective_to>=d::date))) then
    witness_end:=least(p_end,p_start+interval '24 hours');
    loop
      windows:=windows||jsonb_build_array(jsonb_build_object('starts_at',witness_end-interval '24 hours','ends_at',witness_end));
      used_future:=used_future or witness_end>now();
      exit when witness_end>=p_end;
      witness_end:=least(p_end,witness_end+interval '24 hours');
    end loop;
    return jsonb_build_object('scope_starts_at',p_start,'scope_ends_at',p_end,
      'status',case when used_future then 'projected' else 'covered' end,
      'windows',windows,'uncovered_ranges','[]'::jsonb,'blocking_windows','[]'::jsonb);
  end if;
  -- Try one inexpensive, fully verified witness chain first. Success is a
  -- complete proof of existence; failure always falls through to the exact
  -- continuous search, so this fast path never creates an incompatibility.
  witness_end:=least(p_end,p_start+interval '24 hours');
  loop
    verdict:=private.working_time_window_verdict(p_context,witness_end,p_timezone,p_policy_id);
    exit when not (verdict->>'valid')::boolean;
    windows:=windows||jsonb_build_array(jsonb_build_object('starts_at',witness_end-interval '24 hours','ends_at',witness_end));
    used_future:=used_future or witness_end>now();
    if witness_end>=p_end then
      return jsonb_build_object('scope_starts_at',p_start,'scope_ends_at',p_end,
        'status',case when used_future then 'projected' else 'covered' end,
        'windows',windows,'uncovered_ranges','[]'::jsonb,'blocking_windows','[]'::jsonb);
    end if;
    witness_end:=least(p_end,witness_end+interval '24 hours');
  end loop;
  windows:='[]'; used_future:=false;
  -- With one applicable policy, a complete known over-limit cycle makes
  -- every intersecting window impossible independently of all other metrics.
  -- Cache that proof locally for the fallback sweep; this is calculated from
  -- the current raw context and never accepted from client/session settings.
  if (select count(*) from public.planning_work_rest_policies p where p.company_id=policy.company_id and p.active
      and (p.scope='company' or p.vessel_id=policy.vessel_id)
      and p.effective_from<=((p_end+interval '24 hours') at time zone p_timezone)::date
      and (p.effective_to is null or p.effective_to>=(p_start at time zone p_timezone)::date))=1 then
    with ranges as materialized (
      select * from private.working_time_merged_ranges_with_phase_json(-1,'-infinity','infinity',null,p_context)
    ), ordered as (select r.*,lag(r.ends_at) over(order by r.starts_at) previous_end from ranges r),
    numbered as (select r.*,sum(case when r.previous_end is null or r.starts_at-r.previous_end>=policy.min_consecutive_rest_hours*interval '1 hour'
      then 1 else 0 end) over(order by r.starts_at) cycle from ordered r),
    cycles as (select min(r.starts_at) starts_at,max(r.ends_at) ends_at,sum(extract(epoch from r.ends_at-r.starts_at)) work
      from numbered r group by r.cycle),
    bad as (
      select c.starts_at,c.ends_at+interval '24 hours' ends_at from cycles c
      where c.work>policy.max_work_24h*3600 or extract(epoch from c.ends_at-c.starts_at)>policy.max_amplitude_hours*3600
      union select r.starts_at,r.ends_at+interval '24 hours' from ranges r
      where extract(epoch from r.ends_at-r.starts_at)>policy.max_interval_between_rests_hours*3600
    ) select coalesce(jsonb_agg(jsonb_build_object('starts_at',b.starts_at,'ends_at',b.ends_at)),'[]') into invalid_bands from bad b;
  end if;
  -- Each cell has constant fragmentation/cycle flags and affine total work,
  -- rest and night work. Add exact threshold crossings. Longest-rest crossings
  -- are explicit, so no hourly or 30-minute sampling governs the verdict.
  for point in
    with ranges as materialized (
      select * from private.working_time_merged_ranges_with_phase_json(-1,'-infinity','infinity',null,p_context)
    ), applicable_policies as materialized (
      select * from public.planning_work_rest_policies p where p.company_id=policy.company_id and p.active
        and (p.scope='company' or p.vessel_id=policy.vessel_id)
    ), events as (select starts_at t from ranges union select ends_at from ranges),
    raw_nights as (
      select p.id policy_id,(d::date+p.night_starts_at) at time zone p_timezone starts_at,
        (d::date+case when p.night_ends_at>p.night_starts_at then 0 else 1 end+p.night_ends_at)
          at time zone p_timezone ends_at
      from generate_series(((p_start-interval '24 hours') at time zone p_timezone)::date-1,
        ((p_end+interval '24 hours') at time zone p_timezone)::date+1,interval '1 day') d
      cross join applicable_policies p
    ), nights as materialized (
      select n.* from raw_nights n where exists(select 1 from ranges r
        where r.starts_at<n.ends_at and r.ends_at>n.starts_at)
    ), anchors as (
      select p_start t union select p_end+interval '24 hours'
      union select t from events union select t+interval '24 hours' from events
      union select t+interval '168 hours' from events
      union select effective_from::timestamp at time zone p_timezone from applicable_policies
      union select (effective_from::timestamp at time zone p_timezone)+interval '0.000001 seconds' from applicable_policies
      union select (effective_to+1)::timestamp at time zone p_timezone from applicable_policies where effective_to is not null
      union select ((effective_to+1)::timestamp at time zone p_timezone)+interval '0.000001 seconds' from applicable_policies where effective_to is not null
      union select ends_at+p.min_consecutive_rest_hours*interval '1 hour' from ranges cross join applicable_policies p
      union select ends_at+p.min_consecutive_rest_hours*interval '1 hour'-interval '0.0005 seconds' from ranges cross join applicable_policies p
      union select starts_at+interval '24 hours'-p.min_consecutive_rest_hours*interval '1 hour' from ranges cross join applicable_policies p
      union select starts_at+interval '24 hours'-p.min_consecutive_rest_hours*interval '1 hour'+interval '0.0005 seconds' from ranges cross join applicable_policies p
      union select starts_at from nights union select ends_at from nights
      union select starts_at+interval '24 hours' from nights union select ends_at+interval '24 hours' from nights
    ), bounded as materialized (select distinct t from anchors where t between p_start and p_end+interval '24 hours'),
    amounts as materialized (
      select t,p.id night_policy_id,
        (select coalesce(sum(extract(epoch from least(r.ends_at,t)-greatest(r.starts_at,t-interval '24 hours'))),0)
          from ranges r where r.starts_at<t and r.ends_at>t-interval '24 hours') work24,
        (select coalesce(sum(extract(epoch from least(r.ends_at,t)-greatest(r.starts_at,t-interval '168 hours'))),0)
          from ranges r where r.starts_at<t and r.ends_at>t-interval '168 hours') work7,
        (select coalesce(sum(extract(epoch from least(r.ends_at,n.ends_at,t)-greatest(r.starts_at,n.starts_at,t-interval '24 hours'))),0)
          from ranges r join nights n on n.policy_id=p.id and r.starts_at<least(n.ends_at,t) and r.ends_at>greatest(n.starts_at,t-interval '24 hours')) night
      from bounded cross join applicable_policies p
    ), segments as (
      select *,lead(t) over(partition by night_policy_id order by t) next_t,lead(work24) over(partition by night_policy_id order by t) next_work24,
        lead(work7) over(partition by night_policy_id order by t) next_work7,lead(night) over(partition by night_policy_id order by t) next_night from amounts
    ), crossing as (
      select t+(next_t-t)*((threshold-value)/nullif(next_value-value,0))::double precision t
      from segments cross join applicable_policies p cross join lateral (values
        (work24,next_work24,86400-p.min_rest_24h*3600),
        (work24,next_work24,86400-p.min_rest_24h*3600+0.0005),
        (work7,next_work7,p.max_work_7d*3600),(work7,next_work7,604800-p.min_rest_7d*3600),
        (work7,next_work7,p.max_work_7d*3600+0.0005),(work7,next_work7,604800-p.min_rest_7d*3600+0.0005),
        (night,next_night,p.max_night_work_24h*3600),(night,next_night,p.max_night_work_24h*3600+0.0005)
      ) r(value,next_value,threshold)
      where next_t>t and threshold between least(value,next_value) and greatest(value,next_value) and next_value<>value
    ), critical as (
      select t from bounded union select t from crossing where t is not null
      -- Existing duration metrics round to milliseconds. Include neighboring
      -- milliseconds around crossings instead of silently losing a narrow cell.
      union select t+interval '0.001 seconds' from crossing where t is not null
      union select t-interval '0.001 seconds' from crossing where t is not null
    ) select distinct t from critical where t between p_start and p_end+interval '24 hours' order by t
  loop
    if exists(select 1 from jsonb_to_recordset(invalid_bands) b(starts_at timestamptz,ends_at timestamptz)
      where point.t>b.starts_at and point.t<b.ends_at) then
      verdict:=jsonb_build_object('valid',false,'violation_codes',jsonb_build_array('work_cycle'));
    else verdict:=private.working_time_window_verdict(p_context,point.t,p_timezone,p_policy_id); end if;
    if jsonb_array_length(verdict->'violation_codes')<nearest_count then
      nearest:=verdict; nearest_count:=jsonb_array_length(verdict->'violation_codes');
    end if;
    if (verdict->>'valid')::boolean then bands:=bands||jsonb_build_array(jsonb_build_object('lo',point.t,'hi',point.t)); end if;
    if previous_t is not null and point.t>previous_t then
      middle_t:=previous_t+(point.t-previous_t)/2;
      if exists(select 1 from jsonb_to_recordset(invalid_bands) b(starts_at timestamptz,ends_at timestamptz)
        where middle_t>b.starts_at and middle_t<b.ends_at) then middle_valid:=false;
      else middle_valid:=(private.working_time_window_verdict(p_context,middle_t,p_timezone,p_policy_id)->>'valid')::boolean; end if;
      if middle_valid then
        lo:=previous_t+case when previous_valid then interval '0' else interval '0.000001 seconds' end;
        hi:=point.t-case when (verdict->>'valid')::boolean then interval '0' else interval '0.000001 seconds' end;
        if hi>=lo then bands:=bands||jsonb_build_array(jsonb_build_object('lo',lo,'hi',hi)); end if;
      end if;
    end if;
    previous_t:=point.t; previous_valid:=(verdict->>'valid')::boolean;
  end loop;
  -- Union good windows and greedily advance the covered frontier. A valid
  -- end interval [lo,hi] covers [lo-24h,hi]; emit actual windows along it so
  -- the displayed witness itself overlaps/touches continuously.
  for band in
    with raw as (select * from jsonb_to_recordset(bands) b(lo timestamptz,hi timestamptz)),
    ordered as (select r.*,max(r.hi) over(order by r.lo,r.hi rows between unbounded preceding and 1 preceding) previous_hi from raw r),
    numbered as (select o.*,sum(case when o.previous_hi is null or o.lo>o.previous_hi+interval '0.000001 seconds'
      then 1 else 0 end) over(order by o.lo,o.hi) island from ordered o)
    select min(n.lo) lo,max(n.hi) hi from numbered n group by n.island order by min(n.lo)
  loop
    if band.hi<=cursor_at or band.lo-interval '24 hours'>=p_end then continue; end if;
    if band.lo-interval '24 hours'>cursor_at then
      gaps:=gaps||jsonb_build_array(jsonb_build_object('starts_at',cursor_at,'ends_at',least(p_end,band.lo-interval '24 hours')));
    end if;
    witness_end:=greatest(band.lo,least(band.hi,cursor_at+interval '24 hours'));
    loop
      windows:=windows||jsonb_build_array(jsonb_build_object('starts_at',witness_end-interval '24 hours','ends_at',witness_end));
      used_future:=used_future or witness_end>now();
      exit when witness_end>=band.hi or witness_end>=p_end;
      witness_end:=least(band.hi,witness_end+interval '24 hours');
    end loop;
    cursor_at:=greatest(cursor_at,band.hi);
    exit when cursor_at>=p_end;
  end loop;
  if cursor_at<p_end then gaps:=gaps||jsonb_build_array(jsonb_build_object('starts_at',cursor_at,'ends_at',p_end)); end if;
  -- A missing policy for an optional boundary candidate must not erase a
  -- proven incompatibility elsewhere. Unknown applies to uncovered scope days
  -- for which there is actually no applicable administrator policy.
  missing_policy:=exists(select 1 from jsonb_to_recordset(gaps) g(starts_at timestamptz,ends_at timestamptz)
    cross join lateral generate_series((g.starts_at at time zone p_timezone)::date,
      ((g.ends_at-interval '1 microsecond') at time zone p_timezone)::date,interval '1 day') d
    where not exists(select 1 from public.planning_work_rest_policies p where p.company_id=policy.company_id and p.active
      and (p.scope='company' or p.vessel_id=policy.vessel_id) and p.effective_from<=d::date
      and (p.effective_to is null or p.effective_to>=d::date)));
  for gap in select * from jsonb_to_recordset(gaps) g(starts_at timestamptz,ends_at timestamptz) loop
    blocking_windows:=blocking_windows||jsonb_build_array(private.working_time_window_verdict(
      p_context,gap.starts_at+(gap.ends_at-gap.starts_at)/2+interval '12 hours',p_timezone,p_policy_id));
  end loop;
  return jsonb_build_object('scope_starts_at',p_start,'scope_ends_at',p_end,
    'status',case when jsonb_array_length(gaps)>0 and missing_policy then 'unknown'
      when jsonb_array_length(gaps)>0 then 'uncovered' when used_future then 'projected' else 'covered' end,
    'windows',windows,'uncovered_ranges',gaps,'blocking_windows',blocking_windows);
end;
$$;
revoke all on function private.working_time_coverage_for_scope(jsonb,timestamptz,timestamptz,text,bigint) from public,anon,authenticated;

create function private.working_time_assignment_analysis_batch(
  p_person_id bigint,p_start timestamptz,p_end timestamptz,p_timezone text,
  p_phases jsonb default '[]',p_exclude_interval_id bigint default null,
  p_vessel_id bigint default null,p_watch_group text default null,p_exclude_interval_ids bigint[] default '{}',
  p_include_slots boolean default true
) returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare person public.people%rowtype; scope record; policy public.planning_work_rest_policies%rowtype;
  context jsonb; baseline_context jsonb; answer jsonb; baseline jsonb; coverages jsonb:='[]';
  blocked boolean:=false; changed boolean:=false; old_blocked boolean:=false;
  context_start timestamptz; context_end timestamptz;
  slots jsonb:='[]'; slot record; slot_analysis jsonb; attempts integer:=0;
  context_rest_hours numeric;
begin
  select * into strict person from public.people where id=p_person_id;
  for scope in
    select a.id assignment_id,coalesce(a.starts_at,a.starts_on::timestamp at time zone p_timezone) starts_at,
      coalesce(a.ends_at,(a.ends_on+1)::timestamp at time zone p_timezone) ends_at,a.vessel_id,a.watch_group
    from public.planning_assignments a where a.company_id=person.company_id and a.crew_person_id=p_person_id
      and a.confirmation_status<>'cancelled' and a.starts_on<=((p_end-interval '1 microsecond') at time zone p_timezone)::date
      and a.ends_on>=(p_start at time zone p_timezone)::date
      and (p_vessel_id is null or a.vessel_id=p_vessel_id)
      and (p_watch_group is null or lower(trim(a.watch_group))=lower(trim(p_watch_group)))
    union all select null,p_start,p_end,p_vessel_id,p_watch_group where not exists(
      select 1 from public.planning_assignments a where a.company_id=person.company_id and a.crew_person_id=p_person_id
        and a.confirmation_status<>'cancelled' and a.starts_on<=((p_end-interval '1 microsecond') at time zone p_timezone)::date
        and a.ends_on>=(p_start at time zone p_timezone)::date)
    order by starts_at
  loop
    if scope.assignment_id is null then
      coverages:=coverages||jsonb_build_array(jsonb_build_object('assignment_id',null,
        'scope_starts_at',scope.starts_at,'scope_ends_at',scope.ends_at,'status','unknown',
        'windows','[]'::jsonb,'uncovered_ranges','[]'::jsonb)); continue;
    end if;
    select * into policy from public.planning_work_rest_policies p where p.company_id=person.company_id and p.active
      and (p.scope='company' or p.vessel_id=scope.vessel_id)
      and p.effective_from<=((scope.ends_at+interval '24 hours') at time zone p_timezone)::date
      and (p.effective_to is null or p.effective_to>=(scope.starts_at at time zone p_timezone)::date)
    order by (p.scope='vessel') desc,p.effective_from,p.id desc limit 1;
    if policy.id is null then
      coverages:=coverages||jsonb_build_array(jsonb_build_object('assignment_id',scope.assignment_id,
        'scope_starts_at',scope.starts_at,'scope_ends_at',scope.ends_at,'status','unknown','windows','[]'::jsonb,'uncovered_ranges','[]'::jsonb)); continue;
    end if;
    -- Load complete known cycles on both sides. Existing work beyond the
    -- assignment remains context, not unrelated displayed assignment alerts.
    select max(p.min_consecutive_rest_hours) into context_rest_hours
    from public.planning_work_rest_policies p where p.company_id=person.company_id and p.active
      and (p.scope='company' or p.vessel_id=scope.vessel_id);
    with ranges as materialized (
      select * from private.working_time_merged_ranges_with_phase_json(p_person_id,'-infinity','infinity',null,p_phases)
    ), ordered as (select *,lag(ends_at) over(order by starts_at) previous_end from ranges)
    select max(previous_end) filter(where starts_at<=scope.starts_at-interval '168 hours'),
      min(starts_at) filter(where previous_end>=scope.ends_at+interval '24 hours')
    into context_start,context_end from ordered
    where starts_at-previous_end>=context_rest_hours*interval '1 hour';
    context_start:=coalesce(context_start,'-infinity'::timestamptz);
    context_end:=coalesce(context_end,'infinity'::timestamptz);
    select coalesce(jsonb_agg(jsonb_build_object('starts_at',starts_at,'ends_at',ends_at)),'[]') into baseline_context
    from public.working_time_intervals where person_id=p_person_id and voided_at is null
      and starts_at<context_end and ends_at>context_start;
    select coalesce(jsonb_agg(jsonb_build_object('starts_at',starts_at,'ends_at',ends_at)),'[]')||p_phases into context
    from public.working_time_intervals where person_id=p_person_id and voided_at is null
      and id<>all(p_exclude_interval_ids||array_remove(array[p_exclude_interval_id],null))
      and starts_at<context_end and ends_at>context_start;
    answer:=private.working_time_coverage_for_scope(context,scope.starts_at,scope.ends_at,p_timezone,policy.id);
    baseline:=case when p_phases='[]'::jsonb and p_exclude_interval_id is null and cardinality(p_exclude_interval_ids)=0 then answer else
      private.working_time_coverage_for_scope(baseline_context,scope.starts_at,scope.ends_at,p_timezone,policy.id) end;
    blocked:=blocked or answer->>'status'='uncovered'; old_blocked:=old_blocked or baseline->>'status'='uncovered';
    -- Baseline gaps alone do not prohibit every new period. A proposal may not
    -- introduce a new gap or enlarge an already uncovered part of the chain.
    if exists(select 1 from jsonb_to_recordset(answer->'uncovered_ranges') g(starts_at timestamptz,ends_at timestamptz)
      where not exists(select 1 from jsonb_to_recordset(baseline->'uncovered_ranges') b(starts_at timestamptz,ends_at timestamptz)
        where b.starts_at<=g.starts_at and b.ends_at>=g.ends_at)) then changed:=true; end if;
    coverages:=coverages||jsonb_build_array(answer||jsonb_build_object('assignment_id',scope.assignment_id,
      'vessel_id',scope.vessel_id,'watch_group',scope.watch_group,
      'policy_id',policy.id,'policy_name',policy.name,'already_present',baseline->>'status'='uncovered'));
    -- Concrete individual suggestions, never a claim that all can be added
    -- together. Use rest gaps as candidates, then verify the WHOLE chain again.
    -- A historical unrelated gap may remain, but no new gap is allowed and the
    -- proposed slot itself must be covered. The entry API rechecks combinations.
    if p_include_slots then
    for slot in
      with ranges as materialized (
        select * from private.working_time_merged_ranges_with_phase_json(-1,'-infinity','infinity',null,context)
      ), gaps as (
        select lag(ends_at,1,scope.starts_at-policy.min_consecutive_rest_hours*interval '1 hour') over(order by starts_at) starts_at,
          starts_at ends_at from ranges
        union all select coalesce(max(ends_at),scope.starts_at-policy.min_consecutive_rest_hours*interval '1 hour'),scope.ends_at from ranges
      ), candidates as (
        select greatest(scope.starts_at,g.starts_at+policy.min_consecutive_rest_hours*interval '1 hour') starts_at,g.ends_at
        from gaps g where g.ends_at>scope.starts_at and g.starts_at<scope.ends_at
      ) select distinct c.starts_at,c.starts_at+interval '30 minutes' ends_at from candidates c
      where c.starts_at+interval '30 minutes'<=least(c.ends_at,scope.ends_at)
      order by c.starts_at limit 6
    loop
      exit when jsonb_array_length(slots)>=3 or attempts>=6;
      attempts:=attempts+1;
      slot_analysis:=private.working_time_coverage_for_scope(context||jsonb_build_array(jsonb_build_object(
        'starts_at',slot.starts_at,'ends_at',slot.ends_at)),scope.starts_at,scope.ends_at,p_timezone,policy.id);
      if slot_analysis->>'status'='unknown' then continue; end if;
      if not exists(select 1 from jsonb_to_recordset(slot_analysis->'uncovered_ranges') g(starts_at timestamptz,ends_at timestamptz)
          where (g.starts_at<slot.ends_at and g.ends_at>slot.starts_at) or not exists(
            select 1 from jsonb_to_recordset(answer->'uncovered_ranges') b(starts_at timestamptz,ends_at timestamptz)
              where b.starts_at<=g.starts_at and b.ends_at>=g.ends_at)) then
        slots:=slots||jsonb_build_array(jsonb_build_object('starts_at',slot.starts_at,'ends_at',slot.ends_at,'assignment_id',scope.assignment_id));
      end if;
    end loop;
    end if;
  end loop;
  return jsonb_build_object('analysis_version',3,'analysis_starts_at',p_start-interval '168 hours','analysis_ends_at',p_end+interval '24 hours',
    'assignment_coverage',coverages,'analysis_periods','[]'::jsonb,'analysis_windows','[]'::jsonb,
    'violation_codes',case when blocked then (select coalesce(jsonb_agg(distinct code),'["assignment_coverage"]'::jsonb)
      from jsonb_array_elements(coverages) c cross join lateral jsonb_array_elements(c->'blocking_windows') w
      cross join lateral jsonb_array_elements_text(w->'violation_codes') code) else '[]'::jsonb end,
    'already_non_compliant',old_blocked,'new_incompatibility',changed,
    'status',case when blocked then 'non_conforme' else 'conforme' end,'available_slots',slots);
end;
$$;
revoke all on function private.working_time_assignment_analysis_batch(bigint,timestamptz,timestamptz,text,jsonb,bigint,bigint,text,bigint[],boolean) from public,anon,authenticated;

create function private.working_time_assignment_analysis(
  p_person_id bigint,p_start timestamptz,p_end timestamptz,p_timezone text,p_phases jsonb default '[]',
  p_exclude_interval_id bigint default null,p_vessel_id bigint default null,p_watch_group text default null
) returns jsonb language sql stable security definer set search_path='' as $$
  select private.working_time_assignment_analysis_batch(p_person_id,p_start,p_end,p_timezone,p_phases,
    p_exclude_interval_id,p_vessel_id,p_watch_group,'{}',false);
$$;
revoke all on function private.working_time_assignment_analysis(bigint,timestamptz,timestamptz,text,jsonb,bigint,bigint,text) from public,anon,authenticated;

-- A Captain's month can include assignments on other vessels. Keep their
-- real Planning visibility when exposing the trusted calculation results.
create function private.working_time_filter_assignment_analysis(p_result jsonb,p_person_id bigint,p_timezone text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare company bigint; coverages jsonb; slots jsonb; blocked boolean;
begin
  select company_id into company from public.people where id=p_person_id;
  if p_person_id=public.current_person_id() or public.has_company_role(company,array['admin','direction','armement']) then return p_result; end if;
  select coalesce(jsonb_agg(c),'[]') into coverages from jsonb_array_elements(p_result->'assignment_coverage') c
  where c->>'assignment_id' is not null and public.working_time_captain_can_access_period(company,p_person_id,
    ((c->>'scope_starts_at')::timestamptz at time zone p_timezone)::date,
    (((c->>'scope_ends_at')::timestamptz-interval '1 microsecond') at time zone p_timezone)::date,
    (c->>'vessel_id')::bigint,c->>'watch_group');
  select coalesce(jsonb_agg(s),'[]') into slots from jsonb_array_elements(p_result->'available_slots') s
    where exists(select 1 from jsonb_array_elements(coverages) c where c->>'assignment_id'=s->>'assignment_id');
  blocked:=exists(select 1 from jsonb_array_elements(coverages) c where c->>'status'='uncovered');
  return p_result||jsonb_build_object('assignment_coverage',coverages,'available_slots',slots,
    'status',case when blocked then 'non_conforme' else 'conforme' end,
    'violation_codes',case when blocked then (select coalesce(jsonb_agg(distinct code),'["assignment_coverage"]'::jsonb)
      from jsonb_array_elements(coverages) c cross join lateral jsonb_array_elements(c->'blocking_windows') w
      cross join lateral jsonb_array_elements_text(w->'violation_codes') code) else '[]'::jsonb end,
    'already_non_compliant',exists(select 1 from jsonb_array_elements(coverages) c where (c->>'already_present')::boolean));
end;
$$;
revoke all on function private.working_time_filter_assignment_analysis(jsonb,bigint,text) from public,anon,authenticated;

create function public.working_time_assignment_analysis(
  p_person_id bigint,p_period_start date,p_period_end date,p_timezone_name text,
  p_vessel_id bigint default null,p_watch_group text default null,
  p_phases jsonb default '[]',p_exclude_interval_ids bigint[] default '{}'
) returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare phase record; person public.people%rowtype;
begin
  if p_period_start is null or p_period_end is null or p_period_end<p_period_start or p_period_end>p_period_start+62
    or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone_name) then
    raise exception using errcode='22023',message='WORKING_TIME_ANALYSIS_PERIOD_INVALID.';
  end if;
  select * into person from public.people where id=p_person_id and active;
  if auth.uid() is null or person.id is null or not coalesce(public.user_belongs_to_company(person.company_id),false)
    or not (coalesce(person.id=public.current_person_id() and public.has_company_role(person.company_id,array['marin','capitaine']),false)
      or coalesce(public.has_company_role(person.company_id,array['admin','direction','armement']),false)
      or public.working_time_captain_can_access_period(person.company_id,p_person_id,p_period_start,p_period_end,p_vessel_id,p_watch_group)) then
    raise exception using errcode='42501',message='WORKING_TIME_PERMISSION_DENIED: analyse des affectations.';
  end if;
  if p_phases is null or jsonb_typeof(p_phases)<>'array' or jsonb_array_length(p_phases)>1536
    or p_exclude_interval_ids is null or cardinality(p_exclude_interval_ids)>1536 then
    raise exception using errcode='22023',message='WORKING_TIME_PHASES_INVALID';
  end if;
  for phase in select * from jsonb_to_recordset(p_phases) p(starts_at timestamptz,ends_at timestamptz) loop
    if phase.starts_at is null or phase.ends_at is null or phase.ends_at<=phase.starts_at
      or phase.ends_at>phase.starts_at+interval '24 hours'
      or (phase.starts_at at time zone p_timezone_name)::date not between p_period_start and p_period_end then
      raise exception using errcode='22023',message='WORKING_TIME_PHASES_INVALID';
    end if;
    perform private.working_time_recommendation_policy(p_person_id,phase.starts_at,phase.ends_at,p_timezone_name,p_vessel_id,p_watch_group,null);
  end loop;
  if exists(select 1 from unnest(p_exclude_interval_ids) i(id) where not exists(
    select 1 from public.working_time_intervals w where w.id=i.id and w.person_id=p_person_id and w.voided_at is null)) then
    raise exception using errcode='22023',message='WORKING_TIME_INTERVAL_NOT_FOUND.';
  end if;
  return private.working_time_filter_assignment_analysis(private.working_time_assignment_analysis_batch(
    p_person_id,p_period_start::timestamp at time zone p_timezone_name,
    (p_period_end+1)::timestamp at time zone p_timezone_name,p_timezone_name,p_phases,null,p_vessel_id,p_watch_group,p_exclude_interval_ids,true),
    p_person_id,p_timezone_name);
end;
$$;
revoke all on function public.working_time_assignment_analysis(bigint,date,date,text,bigint,text,jsonb,bigint[]) from public,anon;
grant execute on function public.working_time_assignment_analysis(bigint,date,date,text,bigint,text,jsonb,bigint[]) to authenticated;
-- Preserve prior validation and authorization exactly, without exposing helpers.
do $migration$
declare target regprocedure; definition text;
begin
  for target in select unnest(array[
    'public.working_time_interval_recommendation(bigint,timestamptz,timestamptz,text,bigint,text,bigint)'::regprocedure,
    'public.working_time_phases_recommendation(bigint,jsonb,text,bigint,text,bigint)'::regprocedure
  ]) loop
    select pg_get_functiondef(target) into definition;
    definition:=replace(definition,'FUNCTION public.working_time_interval_recommendation(',
      'FUNCTION private.working_time_interval_recommendation_endpoints(');
    definition:=replace(definition,'FUNCTION public.working_time_phases_recommendation(',
      'FUNCTION private.working_time_phases_recommendation_endpoints(');
    execute definition;
  end loop;
end;
$migration$;
revoke all on function private.working_time_interval_recommendation_endpoints(bigint,timestamptz,timestamptz,text,bigint,text,bigint) from public,anon,authenticated;
revoke all on function private.working_time_phases_recommendation_endpoints(bigint,jsonb,text,bigint,text,bigint) from public,anon,authenticated;

create function private.working_time_feasible_recommendation(
  p_result jsonb,p_person_id bigint,p_phases jsonb,p_timezone text,p_exclude_interval_id bigint,p_vessel_id bigint,p_watch_group text
) returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare analysis jsonb; first_start timestamptz; last_end timestamptz; rejected boolean;
begin
  if p_result->>'policy_id' is null then return p_result; end if;
  select min(starts_at),max(ends_at) into first_start,last_end from jsonb_to_recordset(p_phases) p(starts_at timestamptz,ends_at timestamptz);
  analysis:=private.working_time_filter_assignment_analysis(private.working_time_assignment_analysis(
    p_person_id,first_start-interval '24 hours',last_end+interval '168 hours',
    p_timezone,p_phases,p_exclude_interval_id,p_vessel_id,p_watch_group),p_person_id,p_timezone);
  if not exists(select 1 from jsonb_array_elements(analysis->'assignment_coverage') c
      where c->>'assignment_id' is not null and (c->>'scope_starts_at')::timestamptz<last_end
        and (c->>'scope_ends_at')::timestamptz>first_start) then
    return p_result||(analysis-'status'-'violation_codes'-'already_non_compliant');
  end if;
  rejected:=coalesce((analysis->>'new_incompatibility')::boolean,false);
  rejected:=rejected or exists(select 1 from jsonb_array_elements(analysis->'assignment_coverage') c
    cross join lateral jsonb_to_recordset(c->'uncovered_ranges') g(starts_at timestamptz,ends_at timestamptz)
    cross join lateral jsonb_to_recordset(p_phases) p(starts_at timestamptz,ends_at timestamptz)
    where g.starts_at<p.ends_at and g.ends_at>p.starts_at);
  -- Existing blocked periods remain separate evidence; they do not make every
  -- later entry impossible. Only the proposed periods or lost witnesses reject.
  p_result:=p_result||analysis||jsonb_build_object('status',case when rejected then 'non_conforme' else 'conforme' end,
    'available_24h_seconds',null,'available_7d_seconds',null,'max_additional_seconds',null,
    'latest_end_at',null,'next_resume_at',null);
  return p_result;
end;
$$;
revoke all on function private.working_time_feasible_recommendation(jsonb,bigint,jsonb,text,bigint,bigint,text) from public,anon,authenticated;
create or replace function public.working_time_interval_recommendation(
  p_person_id bigint,p_proposed_start timestamptz,p_proposed_end timestamptz,p_timezone_name text,
  p_vessel_id bigint default null,p_watch_group text default null,p_exclude_interval_id bigint default null
) returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare result jsonb;
begin
  result:=private.working_time_interval_recommendation_endpoints(p_person_id,p_proposed_start,p_proposed_end,p_timezone_name,p_vessel_id,p_watch_group,p_exclude_interval_id);
  return private.working_time_feasible_recommendation(result,p_person_id,jsonb_build_array(jsonb_build_object('starts_at',p_proposed_start,'ends_at',p_proposed_end)),
    p_timezone_name,p_exclude_interval_id,p_vessel_id,p_watch_group);
end;
$$;
create or replace function public.working_time_phases_recommendation(
  p_person_id bigint,p_phases jsonb,p_timezone_name text,p_vessel_id bigint default null,p_watch_group text default null,p_exclude_interval_id bigint default null
) returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare result jsonb;
begin
  result:=private.working_time_phases_recommendation_endpoints(p_person_id,p_phases,p_timezone_name,p_vessel_id,p_watch_group,p_exclude_interval_id);
  return private.working_time_feasible_recommendation(result,p_person_id,p_phases,p_timezone_name,p_exclude_interval_id,p_vessel_id,p_watch_group);
end;
$$;
revoke all on function public.working_time_interval_recommendation(bigint,timestamptz,timestamptz,text,bigint,text,bigint) from public,anon;
revoke all on function public.working_time_phases_recommendation(bigint,jsonb,text,bigint,text,bigint) from public,anon;
grant execute on function public.working_time_interval_recommendation(bigint,timestamptz,timestamptz,text,bigint,text,bigint) to authenticated;
grant execute on function public.working_time_phases_recommendation(bigint,jsonb,text,bigint,text,bigint) to authenticated;
notify pgrst,'reload schema';


