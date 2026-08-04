-- Working Time step 4: authoritative server-side rolling calculations.
-- Raw intervals remain the only source of truth. Overlaps are preserved and
-- merged inside the calculation engine before any duration is derived.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.working_time_intervals
  drop constraint if exists working_time_intervals_no_overlap;

create index if not exists working_time_intervals_person_timestamps_idx
  on public.working_time_intervals (company_id, person_id, starts_at, ends_at)
  where voided_at is null;

create table public.working_time_calculation_windows (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  person_id bigint not null references public.people(id) on delete cascade,
  window_end timestamptz not null,
  local_window_end_date date not null,
  timezone_name text not null,
  vessel_id bigint references public.vessels(id) on delete set null,
  work_rest_policy_id bigint references public.planning_work_rest_policies(id) on delete set null,
  work_24h_seconds numeric(14, 3) not null,
  rest_24h_seconds numeric(14, 3) not null,
  longest_rest_24h_seconds numeric(14, 3) not null,
  rest_period_count_24h integer not null,
  work_7d_seconds numeric(14, 3) not null,
  rest_7d_seconds numeric(14, 3) not null,
  night_work_24h_seconds numeric(14, 3),
  work_24h_compliant boolean,
  rest_24h_compliant boolean,
  consecutive_rest_compliant boolean,
  rest_period_count_compliant boolean,
  work_7d_compliant boolean,
  rest_7d_compliant boolean,
  night_work_compliant boolean,
  is_compliant boolean,
  violation_codes text[] not null default '{}'::text[],
  calculation_version integer not null default 1,
  calculated_at timestamptz not null default now(),
  constraint working_time_calculation_windows_timezone_check
    check (length(trim(timezone_name)) between 1 and 100),
  constraint working_time_calculation_windows_24h_check check (
    work_24h_seconds between 0 and 86400
    and rest_24h_seconds between 0 and 86400
    and longest_rest_24h_seconds between 0 and 86400
    and rest_period_count_24h >= 0
    and (
      night_work_24h_seconds is null
      or night_work_24h_seconds between 0 and 86400
    )
  ),
  constraint working_time_calculation_windows_7d_check check (
    work_7d_seconds between 0 and 604800
    and rest_7d_seconds between 0 and 604800
  ),
  constraint working_time_calculation_windows_total_24h_check
    check (work_24h_seconds + rest_24h_seconds = 86400),
  constraint working_time_calculation_windows_total_7d_check
    check (work_7d_seconds + rest_7d_seconds = 604800),
  constraint working_time_calculation_windows_version_check
    check (calculation_version > 0),
  constraint working_time_calculation_windows_policy_check check (
    (work_rest_policy_id is null
      and work_24h_compliant is null
      and rest_24h_compliant is null
      and consecutive_rest_compliant is null
      and rest_period_count_compliant is null
      and work_7d_compliant is null
      and rest_7d_compliant is null
      and night_work_compliant is null
      and is_compliant is null)
    or work_rest_policy_id is not null
  ),
  constraint working_time_calculation_windows_unique
    unique nulls not distinct (company_id, person_id, window_end, timezone_name, vessel_id)
);

create index working_time_calculation_windows_person_date_idx
  on public.working_time_calculation_windows (
    company_id, person_id, local_window_end_date, window_end
  );
create index working_time_calculation_windows_alert_idx
  on public.working_time_calculation_windows (
    company_id, local_window_end_date, person_id
  ) where is_compliant is false;
create index working_time_calculation_windows_policy_idx
  on public.working_time_calculation_windows (work_rest_policy_id)
  where work_rest_policy_id is not null;

create or replace function private.working_time_merged_ranges(
  target_person_id bigint,
  target_window_start timestamptz,
  target_window_end timestamptz
)
returns table(starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  with clipped as (
    select
      greatest(work_interval.starts_at, target_window_start) as starts_at,
      least(work_interval.ends_at, target_window_end) as ends_at
    from public.working_time_intervals work_interval
    where work_interval.person_id = target_person_id
      and work_interval.voided_at is null
      and work_interval.starts_at < target_window_end
      and work_interval.ends_at > target_window_start
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
      sum(
        case when previous_max_end is null or starts_at > previous_max_end then 1 else 0 end
      ) over (order by starts_at, ends_at) as island_id
    from ordered
  )
  select min(islands.starts_at), max(islands.ends_at)
  from islands
  group by island_id
  order by min(islands.starts_at), max(islands.ends_at);
$$;

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

create or replace function private.working_time_recalculate_person(
  target_person_id bigint,
  target_impact_start timestamptz default null,
  target_impact_end timestamptz default null
)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  target_company_id bigint;
  calculation_start timestamptz;
  calculation_end timestamptz;
  changed_count integer := 0;
begin
  select person.company_id into target_company_id
  from public.people person
  where person.id = target_person_id;

  if target_company_id is null then
    return 0;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('working-time-calculation:' || target_person_id, 0));

  if target_impact_start is null or target_impact_end is null then
    select min(work_interval.starts_at), max(work_interval.ends_at) + interval '7 days'
    into calculation_start, calculation_end
    from public.working_time_intervals work_interval
    where work_interval.person_id = target_person_id
      and work_interval.voided_at is null;

    delete from public.working_time_calculation_windows calculation
    where calculation.person_id = target_person_id;

    if calculation_start is null or calculation_end is null then
      return 0;
    end if;
  else
    calculation_start := target_impact_start;
    calculation_end := target_impact_end + interval '7 days';

    delete from public.working_time_calculation_windows calculation
    where calculation.person_id = target_person_id
      and calculation.window_end between calculation_start and calculation_end;
  end if;

  with interval_events as (
    select
      work_interval.starts_at as event_at,
      work_interval.timezone_name,
      work_interval.vessel_id
    from public.working_time_intervals work_interval
    where work_interval.person_id = target_person_id
      and work_interval.voided_at is null
    union all
    select
      work_interval.ends_at,
      work_interval.timezone_name,
      work_interval.vessel_id
    from public.working_time_intervals work_interval
    where work_interval.person_id = target_person_id
      and work_interval.voided_at is null
  ), candidates as (
    select event_at as window_end, timezone_name, vessel_id from interval_events
    union all
    select event_at + interval '24 hours', timezone_name, vessel_id from interval_events
    union all
    select event_at + interval '7 days', timezone_name, vessel_id from interval_events
  ), scoped_candidates as (
    select distinct window_end, timezone_name, vessel_id
    from candidates
    where window_end between calculation_start and calculation_end
  ), resolved as (
    select
      candidate.*,
      ((candidate.window_end - interval '1 microsecond') at time zone candidate.timezone_name)::date
        as local_window_end_date,
      applicable_policy.id as policy_id,
      applicable_policy.max_work_24h,
      applicable_policy.min_rest_24h,
      applicable_policy.max_work_7d,
      applicable_policy.min_rest_7d,
      applicable_policy.min_consecutive_rest_hours,
      applicable_policy.max_rest_periods_24h,
      applicable_policy.night_starts_at,
      applicable_policy.night_ends_at,
      applicable_policy.max_night_work_24h
    from scoped_candidates candidate
    left join lateral (
      select policy.*
      from public.planning_work_rest_policies policy
      where policy.company_id = target_company_id
        and policy.active
        and policy.effective_from <= (
          (candidate.window_end - interval '1 microsecond') at time zone candidate.timezone_name
        )::date
        and (
          policy.effective_to is null
          or policy.effective_to >= (
            (candidate.window_end - interval '1 microsecond') at time zone candidate.timezone_name
          )::date
        )
        and (
          policy.scope = 'company'
          or (policy.scope = 'vessel' and policy.vessel_id = candidate.vessel_id)
        )
      order by (policy.scope = 'vessel') desc, policy.effective_from desc, policy.id desc
      limit 1
    ) applicable_policy on true
  ), measured as (
    select
      resolved.*,
      metrics_24h.work_seconds as work_24h_seconds,
      metrics_24h.rest_seconds as rest_24h_seconds,
      metrics_24h.longest_rest_seconds as longest_rest_24h_seconds,
      metrics_24h.rest_period_count as rest_period_count_24h,
      metrics_24h.night_work_seconds as night_work_24h_seconds,
      metrics_7d.work_seconds as work_7d_seconds,
      metrics_7d.rest_seconds as rest_7d_seconds
    from resolved
    cross join lateral private.working_time_window_metrics(
      target_person_id,
      resolved.window_end - interval '24 hours',
      resolved.window_end,
      resolved.timezone_name,
      resolved.night_starts_at,
      resolved.night_ends_at
    ) metrics_24h
    cross join lateral private.working_time_window_metrics(
      target_person_id,
      resolved.window_end - interval '7 days',
      resolved.window_end,
      resolved.timezone_name,
      null,
      null
    ) metrics_7d
  ), evaluated as (
    select
      measured.*,
      case when policy_id is null then null else work_24h_seconds <= max_work_24h * 3600 end
        as work_24h_compliant,
      case when policy_id is null then null else rest_24h_seconds >= min_rest_24h * 3600 end
        as rest_24h_compliant,
      case when policy_id is null then null else longest_rest_24h_seconds >= min_consecutive_rest_hours * 3600 end
        as consecutive_rest_compliant,
      case when policy_id is null then null else rest_period_count_24h <= max_rest_periods_24h end
        as rest_period_count_compliant,
      case when policy_id is null then null else work_7d_seconds <= max_work_7d * 3600 end
        as work_7d_compliant,
      case when policy_id is null then null else rest_7d_seconds >= min_rest_7d * 3600 end
        as rest_7d_compliant,
      case when policy_id is null then null else night_work_24h_seconds <= max_night_work_24h * 3600 end
        as night_work_compliant
    from measured
  )
  insert into public.working_time_calculation_windows (
    company_id, person_id, window_end, local_window_end_date, timezone_name,
    vessel_id, work_rest_policy_id,
    work_24h_seconds, rest_24h_seconds, longest_rest_24h_seconds,
    rest_period_count_24h, work_7d_seconds, rest_7d_seconds,
    night_work_24h_seconds,
    work_24h_compliant, rest_24h_compliant, consecutive_rest_compliant,
    rest_period_count_compliant, work_7d_compliant, rest_7d_compliant,
    night_work_compliant, is_compliant, violation_codes,
    calculation_version, calculated_at
  )
  select
    target_company_id, target_person_id, evaluated.window_end,
    evaluated.local_window_end_date, evaluated.timezone_name,
    evaluated.vessel_id, evaluated.policy_id,
    evaluated.work_24h_seconds, evaluated.rest_24h_seconds,
    evaluated.longest_rest_24h_seconds, evaluated.rest_period_count_24h,
    evaluated.work_7d_seconds, evaluated.rest_7d_seconds,
    evaluated.night_work_24h_seconds,
    evaluated.work_24h_compliant, evaluated.rest_24h_compliant,
    evaluated.consecutive_rest_compliant, evaluated.rest_period_count_compliant,
    evaluated.work_7d_compliant, evaluated.rest_7d_compliant,
    evaluated.night_work_compliant,
    case
      when evaluated.policy_id is null then null
      else evaluated.work_24h_compliant
        and evaluated.rest_24h_compliant
        and evaluated.consecutive_rest_compliant
        and evaluated.rest_period_count_compliant
        and evaluated.work_7d_compliant
        and evaluated.rest_7d_compliant
        and evaluated.night_work_compliant
    end,
    array_remove(array[
      case when evaluated.work_24h_compliant is false then 'work_24h' end,
      case when evaluated.rest_24h_compliant is false then 'rest_24h' end,
      case when evaluated.consecutive_rest_compliant is false then 'consecutive_rest' end,
      case when evaluated.rest_period_count_compliant is false then 'rest_periods_24h' end,
      case when evaluated.work_7d_compliant is false then 'work_7d' end,
      case when evaluated.rest_7d_compliant is false then 'rest_7d' end,
      case when evaluated.night_work_compliant is false then 'night_work_24h' end
    ], null),
    1,
    now()
  from evaluated
  on conflict on constraint working_time_calculation_windows_unique
  do update set
    local_window_end_date = excluded.local_window_end_date,
    work_rest_policy_id = excluded.work_rest_policy_id,
    work_24h_seconds = excluded.work_24h_seconds,
    rest_24h_seconds = excluded.rest_24h_seconds,
    longest_rest_24h_seconds = excluded.longest_rest_24h_seconds,
    rest_period_count_24h = excluded.rest_period_count_24h,
    work_7d_seconds = excluded.work_7d_seconds,
    rest_7d_seconds = excluded.rest_7d_seconds,
    night_work_24h_seconds = excluded.night_work_24h_seconds,
    work_24h_compliant = excluded.work_24h_compliant,
    rest_24h_compliant = excluded.rest_24h_compliant,
    consecutive_rest_compliant = excluded.consecutive_rest_compliant,
    rest_period_count_compliant = excluded.rest_period_count_compliant,
    work_7d_compliant = excluded.work_7d_compliant,
    rest_7d_compliant = excluded.rest_7d_compliant,
    night_work_compliant = excluded.night_work_compliant,
    is_compliant = excluded.is_compliant,
    violation_codes = excluded.violation_codes,
    calculation_version = excluded.calculation_version,
    calculated_at = excluded.calculated_at;

  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

create or replace function private.working_time_recalculate_interval_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  old_person_id bigint;
  new_person_id bigint;
  impact_start timestamptz;
  impact_end timestamptz;
begin
  old_person_id := case when tg_op in ('UPDATE', 'DELETE') then old.person_id end;
  new_person_id := case when tg_op in ('INSERT', 'UPDATE') then new.person_id end;
  impact_start := least(
    case when tg_op in ('UPDATE', 'DELETE') then old.starts_at end,
    case when tg_op in ('INSERT', 'UPDATE') then new.starts_at end
  );
  impact_end := greatest(
    case when tg_op in ('UPDATE', 'DELETE') then old.ends_at end,
    case when tg_op in ('INSERT', 'UPDATE') then new.ends_at end
  );

  if impact_start is null then
    impact_start := case when tg_op = 'DELETE' then old.starts_at else new.starts_at end;
  end if;
  if impact_end is null then
    impact_end := case when tg_op = 'DELETE' then old.ends_at else new.ends_at end;
  end if;

  if old_person_id is not null and old_person_id is distinct from new_person_id then
    perform private.working_time_recalculate_person(old_person_id, impact_start, impact_end);
  end if;
  if new_person_id is not null then
    perform private.working_time_recalculate_person(new_person_id, impact_start, impact_end);
  elsif old_person_id is not null then
    perform private.working_time_recalculate_person(old_person_id, impact_start, impact_end);
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function private.working_time_recalculate_policy_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  target_person record;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    for target_person in
      select distinct work_interval.person_id
      from public.working_time_intervals work_interval
      where work_interval.company_id = old.company_id
        and work_interval.voided_at is null
        and (old.scope = 'company' or work_interval.vessel_id = old.vessel_id)
    loop
      perform private.working_time_recalculate_person(target_person.person_id, null, null);
    end loop;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    for target_person in
      select distinct work_interval.person_id
      from public.working_time_intervals work_interval
      where work_interval.company_id = new.company_id
        and work_interval.voided_at is null
        and (new.scope = 'company' or work_interval.vessel_id = new.vessel_id)
    loop
      perform private.working_time_recalculate_person(target_person.person_id, null, null);
    end loop;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.working_time_can_read_calculation(
  target_company_id bigint,
  target_person_id bigint,
  target_local_date date,
  target_vessel_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and public.user_belongs_to_company(target_company_id)
    and (
      target_person_id = public.current_person_id()
      or public.has_company_role(target_company_id, array['admin', 'direction', 'armement'])
      or public.working_time_captain_can_access_period(
        target_company_id,
        target_person_id,
        target_local_date - 6,
        target_local_date,
        target_vessel_id,
        null
      )
    );
$$;

revoke all on function private.working_time_merged_ranges(bigint, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function private.working_time_window_metrics(bigint, timestamptz, timestamptz, text, time, time)
  from public, anon, authenticated;
revoke all on function private.working_time_recalculate_person(bigint, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function private.working_time_recalculate_interval_trigger()
  from public, anon, authenticated;
revoke all on function private.working_time_recalculate_policy_trigger()
  from public, anon, authenticated;
revoke all on function public.working_time_can_read_calculation(bigint, bigint, date, bigint)
  from public, anon;
grant execute on function public.working_time_can_read_calculation(bigint, bigint, date, bigint)
  to authenticated;

create trigger working_time_intervals_recalculate
after insert or update or delete on public.working_time_intervals
for each row execute function private.working_time_recalculate_interval_trigger();

create trigger planning_work_rest_policies_recalculate_working_time
after insert or update or delete on public.planning_work_rest_policies
for each row execute function private.working_time_recalculate_policy_trigger();

alter table public.working_time_calculation_windows enable row level security;

create policy working_time_calculation_windows_read
on public.working_time_calculation_windows
for select to authenticated
using ((select public.working_time_can_read_calculation(
  company_id, person_id, local_window_end_date, vessel_id
)));

revoke all on table public.working_time_calculation_windows from anon, authenticated;
grant select on table public.working_time_calculation_windows to authenticated;
revoke all on sequence public.working_time_calculation_windows_id_seq from anon, authenticated;

do $$
declare
  target_person record;
begin
  for target_person in
    select distinct person_id
    from public.working_time_intervals
    where voided_at is null
  loop
    perform private.working_time_recalculate_person(target_person.person_id, null, null);
  end loop;
end;
$$;

comment on table public.working_time_calculation_windows is
  'Server-calculated candidate rolling windows derived exclusively from timestamped working_time_intervals. Clients have read-only access.';
comment on column public.working_time_calculation_windows.window_end is
  'Candidate boundary at which exact rolling 24-hour and 7-day windows end; generated from interval boundaries and their 24-hour/7-day shifts.';
comment on column public.working_time_calculation_windows.violation_codes is
  'Strict server evaluation: work is anomalous only above a maximum and rest only below a minimum; equality remains compliant.';
comment on table public.working_time_intervals is
  'Canonical raw source of truth for worked time. Overlaps are preserved and merged only by the authoritative server calculation engine.';
