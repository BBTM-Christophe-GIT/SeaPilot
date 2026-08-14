-- Provision one monthly working-time register for every month of employment.
-- Historical coverage starts on the hire month and ends on the departure month
-- for former personnel, or on the current month for personnel still employed.

create or replace function public.working_time_ensure_monthly_registers_for_person(target_person_id bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_person public.people%rowtype;
  target_start_month date;
  target_end_month date;
  affected_rows integer := 0;
begin
  select *
  into target_person
  from public.people person
  where person.id = target_person_id;

  if target_person.id is null or target_person.hired_on is null then
    return 0;
  end if;

  if target_person.departed_on is not null
    and target_person.departed_on < target_person.hired_on then
    return 0;
  end if;

  target_start_month := date_trunc('month', target_person.hired_on)::date;
  target_end_month := date_trunc(
    'month',
    least(coalesce(target_person.departed_on, current_date), current_date)
  )::date;

  -- A future hire receives its hire-month register immediately, without creating
  -- any month before the employment starts.
  if target_start_month > target_end_month then
    target_end_month := target_start_month;
  end if;

  insert into public.working_time_registers (
    company_id,
    person_id,
    period_kind,
    period_start,
    period_end,
    created_by,
    updated_by
  )
  select
    target_person.company_id,
    target_person.id,
    'monthly',
    month_start::date,
    (month_start + interval '1 month - 1 day')::date,
    null,
    null
  from generate_series(
    target_start_month::timestamp,
    target_end_month::timestamp,
    interval '1 month'
  ) month_start
  on conflict (company_id, person_id, period_kind, period_start, period_end)
  do update set
    discarded_at = null,
    discarded_by = null,
    discard_reason = null,
    updated_at = case
      when public.working_time_registers.discarded_at is null
        then public.working_time_registers.updated_at
      else clock_timestamp()
    end;

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

comment on function public.working_time_ensure_monthly_registers_for_person(bigint) is
  'Idempotently provisions every monthly register from the HR hire month through the departure month or current month.';

create or replace function public.working_time_ensure_current_register_for_person(target_person_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id bigint;
begin
  perform public.working_time_ensure_monthly_registers_for_person(target_person_id);

  select register.id
  into saved_id
  from public.working_time_registers register
  where register.person_id = target_person_id
    and register.period_kind = 'monthly'
    and register.period_start = date_trunc('month', current_date)::date
    and register.period_end = (date_trunc('month', current_date) + interval '1 month - 1 day')::date
    and register.discarded_at is null
  order by register.id desc
  limit 1;

  return saved_id;
end;
$$;

comment on function public.working_time_ensure_current_register_for_person(bigint) is
  'Compatibility wrapper that provisions employment history and returns the current-month register when applicable.';

create or replace function public.working_time_people_register_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.working_time_ensure_monthly_registers_for_person(new.id);
  return new;
end;
$$;

drop trigger if exists working_time_people_register on public.people;
create trigger working_time_people_register
after insert or update of active, user_id, company_id, hired_on, departed_on on public.people
for each row execute function public.working_time_people_register_trigger();

create or replace function public.ensure_working_time_registers_for_period(
  p_starts_on date,
  p_ends_on date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  actor_person_id bigint := public.current_person_id();
  can_browse_company boolean;
  affected_rows integer := 0;
begin
  if (select auth.uid()) is null or target_company_id is null then
    raise exception using errcode = '42501', message = 'WORKING_TIME_COMPANY_REQUIRED.';
  end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then
    raise exception using errcode = '22023', message = 'WORKING_TIME_PERIOD_INVALID.';
  end if;

  can_browse_company := public.has_company_role(
    target_company_id,
    array['admin', 'direction', 'armement']
  );
  if actor_person_id is null and not can_browse_company then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PROFILE_NOT_LINKED: fiche RH requise.';
  end if;

  insert into public.working_time_registers (
    company_id,
    person_id,
    period_kind,
    period_start,
    period_end,
    created_by,
    updated_by
  )
  select
    person.company_id,
    person.id,
    'monthly',
    month_start::date,
    (month_start + interval '1 month - 1 day')::date,
    null,
    null
  from public.people person
  cross join lateral generate_series(
    greatest(
      date_trunc('month', person.hired_on)::date,
      date_trunc('month', p_starts_on)::date
    )::timestamp,
    least(
      date_trunc('month', coalesce(person.departed_on, current_date))::date,
      date_trunc('month', current_date)::date,
      date_trunc('month', p_ends_on)::date
    )::timestamp,
    interval '1 month'
  ) month_start
  where person.company_id = target_company_id
    and person.hired_on is not null
    and person.hired_on <= p_ends_on
    and (person.departed_on is null or person.departed_on >= p_starts_on)
  on conflict (company_id, person_id, period_kind, period_start, period_end)
  do update set
    discarded_at = null,
    discarded_by = null,
    discard_reason = null,
    updated_at = case
      when public.working_time_registers.discarded_at is null
        then public.working_time_registers.updated_at
      else clock_timestamp()
    end;

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

comment on function public.ensure_working_time_registers_for_period(date, date) is
  'Ensures monthly registers for the authenticated company before the requested working-time range is read.';

-- Backfill every existing HR employment history. Profiles without a hire date
-- are intentionally skipped because no reliable first month can be inferred.
do $$
declare
  target_person_id bigint;
begin
  for target_person_id in
    select person.id
    from public.people person
    where person.hired_on is not null
  loop
    perform public.working_time_ensure_monthly_registers_for_person(target_person_id);
  end loop;
end;
$$;

revoke all on function public.working_time_ensure_monthly_registers_for_person(bigint)
  from public, anon, authenticated;
revoke all on function public.working_time_ensure_current_register_for_person(bigint)
  from public, anon, authenticated;
revoke all on function public.working_time_people_register_trigger()
  from public, anon, authenticated;
revoke all on function public.ensure_working_time_registers_for_period(date, date)
  from public, anon;
grant execute on function public.ensure_working_time_registers_for_period(date, date)
  to authenticated;
