-- The twelve-hour ceiling applies to the current work cycle. A continuous
-- six-hour rest closes the previous cycle, while the other 24-hour and
-- seven-day controls remain rolling-window measurements.

alter table public.working_time_calculation_windows
  drop constraint if exists working_time_calculation_windows_total_24h_check;

comment on column public.working_time_calculation_windows.work_24h_seconds is
  'Work counted in the current cycle within the rolling 24-hour analysis window. The counter resets after a continuous rest of at least six hours.';
comment on column public.working_time_calculation_windows.rest_24h_seconds is
  'Total rest in the rolling 24-hour analysis window; intentionally independent from the reset work-cycle counter.';
comment on column public.working_time_calculation_windows.work_24h_compliant is
  'Whether the current work cycle, reset by a continuous rest of at least six hours, stays within the configured maximum.';

create or replace function private.working_time_window_metrics(
  target_person_id bigint,
  target_window_start timestamptz,
  target_window_end timestamptz,
  target_timezone_name text,
  target_night_starts_at time default null,
  target_night_ends_at time default null
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
    from private.working_time_merged_ranges(
      target_person_id,
      target_window_start,
      target_window_end
    )
  ), work_total as (
    select coalesce(sum(extract(epoch from (ends_at - starts_at))), 0)::numeric as seconds
    from merged
  ), rest_gaps as (
    select
      lag(ends_at, 1, target_window_start) over (order by starts_at, ends_at) as starts_at,
      starts_at as ends_at
    from merged
    union all
    select
      coalesce(max(ends_at), target_window_start),
      target_window_end
    from merged
  ), rest_summary as (
    select
      coalesce(max(extract(epoch from (ends_at - starts_at)))
        filter (where ends_at > starts_at), 0)::numeric as longest_seconds,
      count(*) filter (where ends_at > starts_at)::integer as period_count,
      coalesce(max(ends_at)
        filter (where ends_at - starts_at >= interval '6 hours'), target_window_start) as cycle_reset_at
    from rest_gaps
  ), work_cycle as (
    select coalesce(sum(extract(epoch from (
      merged.ends_at - greatest(merged.starts_at, rest_summary.cycle_reset_at)
    ))) filter (where merged.ends_at > rest_summary.cycle_reset_at), 0)::numeric as seconds
    from merged
    cross join rest_summary
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
    round(case
      when target_window_end - target_window_start = interval '24 hours' then work_cycle.seconds
      else work_total.seconds
    end, 3),
    round(extract(epoch from (target_window_end - target_window_start))::numeric - work_total.seconds, 3),
    round(rest_summary.longest_seconds, 3),
    rest_summary.period_count,
    case
      when target_night_starts_at is null or target_night_ends_at is null then null
      else round(night_total.seconds, 3)
    end
  from work_total
  cross join work_cycle
  cross join rest_summary
  cross join night_total;
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
    select
      lag(ends_at, 1, target_window_start) over (order by starts_at, ends_at) as starts_at,
      starts_at as ends_at
    from merged
    union all
    select coalesce(max(ends_at), target_window_start), target_window_end
    from merged
  ), rest_summary as (
    select
      coalesce(max(extract(epoch from (ends_at - starts_at)))
        filter (where ends_at > starts_at), 0)::numeric as longest_seconds,
      count(*) filter (where ends_at > starts_at)::integer as period_count,
      coalesce(max(ends_at)
        filter (where ends_at - starts_at >= interval '6 hours'), target_window_start) as cycle_reset_at
    from rest_gaps
  ), work_cycle as (
    select coalesce(sum(extract(epoch from (
      merged.ends_at - greatest(merged.starts_at, rest_summary.cycle_reset_at)
    ))) filter (where merged.ends_at > rest_summary.cycle_reset_at), 0)::numeric as seconds
    from merged
    cross join rest_summary
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
    round(case
      when target_window_end - target_window_start = interval '24 hours' then work_cycle.seconds
      else work_total.seconds
    end, 3),
    round(extract(epoch from (target_window_end - target_window_start))::numeric - work_total.seconds, 3),
    round(rest_summary.longest_seconds, 3),
    rest_summary.period_count,
    case
      when target_night_starts_at is null or target_night_ends_at is null then null
      else round(night_total.seconds, 3)
    end
  from work_total
  cross join work_cycle
  cross join rest_summary
  cross join night_total;
$$;

create or replace function private.working_time_window_metrics_with_phase_json(
  target_person_id bigint,
  target_window_start timestamptz,
  target_window_end timestamptz,
  target_timezone_name text,
  target_night_starts_at time,
  target_night_ends_at time,
  target_exclude_interval_id bigint,
  target_phases jsonb
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
    from private.working_time_merged_ranges_with_phase_json(
      target_person_id, target_window_start, target_window_end,
      target_exclude_interval_id, target_phases
    )
  ), work_total as (
    select coalesce(sum(extract(epoch from (ends_at - starts_at))), 0)::numeric as seconds
    from merged
  ), rest_gaps as (
    select
      lag(ends_at, 1, target_window_start) over (order by starts_at, ends_at) as starts_at,
      starts_at as ends_at
    from merged
    union all
    select coalesce(max(ends_at), target_window_start), target_window_end
    from merged
  ), rest_summary as (
    select
      coalesce(max(extract(epoch from (ends_at - starts_at)))
        filter (where ends_at > starts_at), 0)::numeric as longest_seconds,
      count(*) filter (where ends_at > starts_at)::integer as period_count,
      coalesce(max(ends_at)
        filter (where ends_at - starts_at >= interval '6 hours'), target_window_start) as cycle_reset_at
    from rest_gaps
  ), work_cycle as (
    select coalesce(sum(extract(epoch from (
      merged.ends_at - greatest(merged.starts_at, rest_summary.cycle_reset_at)
    ))) filter (where merged.ends_at > rest_summary.cycle_reset_at), 0)::numeric as seconds
    from merged
    cross join rest_summary
  ), night_dates as (
    select value::date as local_date
    from generate_series(
      (target_window_start at time zone target_timezone_name)::date - 1,
      (target_window_end at time zone target_timezone_name)::date,
      interval '1 day'
    ) value
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
    round(case
      when target_window_end - target_window_start = interval '24 hours' then work_cycle.seconds
      else work_total.seconds
    end, 3),
    round(extract(epoch from (target_window_end - target_window_start))::numeric - work_total.seconds, 3),
    round(rest_summary.longest_seconds, 3),
    rest_summary.period_count,
    case
      when target_night_starts_at is null or target_night_ends_at is null then null
      else round(night_total.seconds, 3)
    end
  from work_total
  cross join work_cycle
  cross join rest_summary
  cross join night_total;
$$;

create or replace function public.working_time_queue_non_compliance_notification(
  p_calculation_id bigint
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  calculation public.working_time_calculation_windows%rowtype;
  sailor_name text;
  target_title text;
  target_severity text;
  violation_labels text[] := array[]::text[];
  target_body text;
  affected integer := 0;
begin
  select * into calculation
  from public.working_time_calculation_windows
  where id = p_calculation_id;

  if calculation.id is null or calculation.is_compliant is distinct from false then
    return 0;
  end if;

  select trim(concat_ws(' ', person.first_name, person.last_name))
  into sailor_name
  from public.people person
  where person.id = calculation.person_id
    and person.company_id = calculation.company_id;
  sailor_name := coalesce(nullif(sailor_name, ''), 'Marin #' || calculation.person_id::text);

  if 'work_24h' = any(calculation.violation_codes) then
    violation_labels := array_append(violation_labels, 'travail maximal depuis le dernier repos de 6 h dépassé');
  end if;
  if 'work_7d' = any(calculation.violation_codes) then violation_labels := array_append(violation_labels, 'travail maximal sur 7 jours dépassé'); end if;
  if 'night_work_24h' = any(calculation.violation_codes) then violation_labels := array_append(violation_labels, 'travail de nuit dépassé'); end if;
  if 'rest_24h' = any(calculation.violation_codes) then violation_labels := array_append(violation_labels, 'repos total sur 24 h insuffisant'); end if;
  if 'consecutive_rest' = any(calculation.violation_codes) then violation_labels := array_append(violation_labels, 'repos consécutif insuffisant'); end if;
  if 'rest_periods_24h' = any(calculation.violation_codes) then violation_labels := array_append(violation_labels, 'repos trop fractionné'); end if;
  if 'rest_7d' = any(calculation.violation_codes) then violation_labels := array_append(violation_labels, 'repos sur 7 jours insuffisant'); end if;

  if calculation.violation_codes && array['work_24h', 'work_7d', 'night_work_24h']::text[]
    and calculation.violation_codes && array['rest_24h', 'consecutive_rest', 'rest_periods_24h', 'rest_7d']::text[] then
    target_title := 'Travail dépassé et repos insuffisant — ' || sailor_name;
  elsif calculation.violation_codes && array['work_24h', 'work_7d', 'night_work_24h']::text[] then
    target_title := 'Temps de travail dépassé — ' || sailor_name;
  elsif calculation.violation_codes && array['rest_24h', 'consecutive_rest', 'rest_periods_24h', 'rest_7d']::text[] then
    target_title := 'Temps de repos insuffisant — ' || sailor_name;
  else
    target_title := 'Temps de travail non conforme — ' || sailor_name;
  end if;

  target_severity := case
    when calculation.violation_codes && array['work_24h', 'work_7d', 'rest_24h', 'consecutive_rest', 'rest_7d']::text[] then 'critical'
    else 'warning'
  end;
  target_body := 'Journée du ' || calculation.local_window_end_date::text
    || ' · ' || coalesce(array_to_string(violation_labels, ' · '), 'écart détecté')
    || ' · Travail depuis repos 6 h : ' || round(calculation.work_24h_seconds / 3600.0, 2)::text || ' h'
    || ' · Repos 24 h : ' || round(calculation.rest_24h_seconds / 3600.0, 2)::text || ' h'
    || ' · Repos consécutif : ' || round(calculation.longest_rest_24h_seconds / 3600.0, 2)::text || ' h'
    || ' · Travail 7 j : ' || round(calculation.work_7d_seconds / 3600.0, 2)::text || ' h'
    || ' · Repos 7 j : ' || round(calculation.rest_7d_seconds / 3600.0, 2)::text || ' h.';

  with recipients as (
    select distinct role.user_id
    from public.user_roles role
    where role.company_id = calculation.company_id
      and role.role_key in ('admin', 'direction', 'armement')
  )
  insert into public.planning_notifications (
    company_id, recipient_user_id, notification_type, severity, title, body,
    entity_kind, entity_id, person_id, vessel_id, due_on, fingerprint
  )
  select calculation.company_id, recipient.user_id, 'working_time_non_compliance',
    target_severity, target_title, target_body, 'working_time_calculation',
    calculation.id, calculation.person_id, calculation.vessel_id,
    calculation.local_window_end_date,
    'working-time-non-compliance:' || calculation.id::text
  from recipients recipient
  where recipient.user_id is not null
  on conflict (company_id, recipient_user_id, fingerprint) do update set
    severity = excluded.severity,
    title = excluded.title,
    body = excluded.body,
    person_id = excluded.person_id,
    vessel_id = excluded.vessel_id,
    due_on = excluded.due_on,
    created_at = case
      when public.planning_notifications.body is distinct from excluded.body then now()
      else public.planning_notifications.created_at
    end,
    read_at = case
      when public.planning_notifications.body is distinct from excluded.body then null
      else public.planning_notifications.read_at
    end;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.working_time_queue_non_compliance_notification(bigint)
  from public, anon, authenticated;

create or replace function private.working_time_set_cycle_calculation_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.calculation_version := greatest(new.calculation_version, 2);
  return new;
end;
$$;

revoke all on function private.working_time_set_cycle_calculation_version()
  from public, anon, authenticated;

drop trigger if exists working_time_calculation_cycle_version
  on public.working_time_calculation_windows;
create trigger working_time_calculation_cycle_version
before insert or update on public.working_time_calculation_windows
for each row execute function private.working_time_set_cycle_calculation_version();

-- Rebuild existing windows without creating a wave of duplicate notifications.
alter table public.working_time_calculation_windows
  disable trigger working_time_calculation_non_compliance_notify;

with measured as (
  select
    calculation.id,
    calculation.work_rest_policy_id,
    metrics.work_seconds as cycle_work_seconds,
    case
      when calculation.work_rest_policy_id is null then null
      else metrics.work_seconds <= policy.max_work_24h * 3600
    end as cycle_work_compliant
  from public.working_time_calculation_windows calculation
  left join public.planning_work_rest_policies policy
    on policy.id = calculation.work_rest_policy_id
  cross join lateral private.working_time_window_metrics(
    calculation.person_id,
    calculation.window_end - interval '24 hours',
    calculation.window_end,
    calculation.timezone_name,
    policy.night_starts_at,
    policy.night_ends_at
  ) metrics
), evaluated as (
  select
    calculation.*,
    measured.cycle_work_seconds,
    measured.cycle_work_compliant
  from public.working_time_calculation_windows calculation
  join measured on measured.id = calculation.id
)
update public.working_time_calculation_windows calculation
set
  work_24h_seconds = evaluated.cycle_work_seconds,
  work_24h_compliant = evaluated.cycle_work_compliant,
  is_compliant = case
    when evaluated.work_rest_policy_id is null then null
    else evaluated.cycle_work_compliant
      and evaluated.rest_24h_compliant
      and evaluated.consecutive_rest_compliant
      and evaluated.rest_period_count_compliant
      and evaluated.work_7d_compliant
      and evaluated.rest_7d_compliant
      and evaluated.night_work_compliant
  end,
  violation_codes = case
    when evaluated.work_rest_policy_id is null then '{}'::text[]
    else array_remove(array[
      case when evaluated.cycle_work_compliant is false then 'work_24h' end,
      case when evaluated.rest_24h_compliant is false then 'rest_24h' end,
      case when evaluated.consecutive_rest_compliant is false then 'consecutive_rest' end,
      case when evaluated.rest_period_count_compliant is false then 'rest_periods_24h' end,
      case when evaluated.work_7d_compliant is false then 'work_7d' end,
      case when evaluated.rest_7d_compliant is false then 'rest_7d' end,
      case when evaluated.night_work_compliant is false then 'night_work_24h' end
    ], null)
  end,
  calculation_version = greatest(calculation.calculation_version, 2),
  calculated_at = now()
from evaluated
where calculation.id = evaluated.id;

alter table public.working_time_calculation_windows
  enable trigger working_time_calculation_non_compliance_notify;

revoke all on function private.working_time_window_metrics(
  bigint, timestamptz, timestamptz, text, time, time
) from public, anon, authenticated;
revoke all on function private.working_time_window_metrics_with_proposals(
  bigint, timestamptz, timestamptz, text, time, time, bigint,
  timestamptz, timestamptz, timestamptz, timestamptz
) from public, anon, authenticated;
revoke all on function private.working_time_window_metrics_with_phase_json(
  bigint, timestamptz, timestamptz, text, time, time, bigint, jsonb
) from public, anon, authenticated;
