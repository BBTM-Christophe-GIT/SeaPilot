-- Planning fleet daily locations
--
-- Reuses planning_days for a vessel/date free-text location instead of adding a
-- competing table. Technical rows are identified by source_label and have no
-- person_id, so imported personnel days keep their existing meaning.
--
-- Replay safety:
--   * the partial unique index and function are created idempotently;
--   * the migration does not rewrite or delete existing rows.
--
-- Rollback:
--   1. Export rows where source_label = 'seapilot-vessel-location'.
--   2. Drop function public.save_planning_vessel_day_location(bigint, date, text).
--   3. Drop index public.planning_days_vessel_location_unique_idx.
--   4. Delete the exported technical rows only after confirming they are no longer required.

create unique index if not exists planning_days_vessel_location_unique_idx
  on public.planning_days (company_id, vessel_id, work_date)
  where source_label = 'seapilot-vessel-location';

create or replace function public.save_planning_vessel_day_location(
  p_vessel_id bigint,
  p_work_date date,
  p_location text
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  target_location text := nullif(trim(coalesce(p_location, '')), '');
  saved_id bigint;
begin
  if p_vessel_id is null or p_work_date is null then
    raise exception using
      errcode = '22023',
      message = 'PLANNING_VESSEL_LOCATION_INVALID';
  end if;

  if char_length(coalesce(p_location, '')) > 80 then
    raise exception using
      errcode = '22001',
      message = 'PLANNING_VESSEL_LOCATION_TOO_LONG';
  end if;

  if not exists (
    select 1
    from public.vessels vessel
    where vessel.id = p_vessel_id
      and vessel.company_id = target_company_id
      and vessel.active
  ) then
    raise exception using
      errcode = '23503',
      message = 'PLANNING_VESSEL_LOCATION_VESSEL_NOT_FOUND';
  end if;

  if not public.planning_user_can(
    'edit_event',
    target_company_id,
    p_vessel_id,
    p_work_date,
    p_work_date
  ) then
    raise exception using
      errcode = '42501',
      message = 'PLANNING_VESSEL_LOCATION_FORBIDDEN';
  end if;

  if target_location is null then
    delete from public.planning_days
    where company_id = target_company_id
      and vessel_id = p_vessel_id
      and work_date = p_work_date
      and source_label = 'seapilot-vessel-location'
    returning id into saved_id;
    return saved_id;
  end if;

  insert into public.planning_days (
    company_id,
    vessel_id,
    vessel_name,
    work_date,
    year_number,
    month_number,
    month_label,
    day_number,
    comments,
    source_label
  )
  select
    target_company_id,
    vessel.id,
    vessel.name,
    p_work_date,
    extract(year from p_work_date)::integer,
    extract(month from p_work_date)::integer,
    to_char(p_work_date, 'TMMonth'),
    extract(day from p_work_date)::integer,
    target_location,
    'seapilot-vessel-location'
  from public.vessels vessel
  where vessel.id = p_vessel_id
  on conflict (company_id, vessel_id, work_date)
    where source_label = 'seapilot-vessel-location'
  do update set
    vessel_name = excluded.vessel_name,
    comments = excluded.comments,
    updated_at = now()
  returning id into saved_id;

  return saved_id;
end;
$$;

revoke all on function public.save_planning_vessel_day_location(bigint, date, text) from public, anon;
grant execute on function public.save_planning_vessel_day_location(bigint, date, text) to authenticated;

comment on function public.save_planning_vessel_day_location(bigint, date, text) is
  'Atomically saves or removes one company-scoped vessel daily personnel location using planning_days and existing Planning RLS/lock guards.';
