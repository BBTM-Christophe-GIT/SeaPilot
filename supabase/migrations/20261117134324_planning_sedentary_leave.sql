-- Paid leave for the RH Sédentaire role. Existing leave/RTT periods stay in their original units.
begin;

create schema planning_leave_private;
revoke all on schema planning_leave_private from public, anon, authenticated;
grant usage on schema planning_leave_private to authenticated;
alter default privileges in schema planning_leave_private revoke execute on functions from public;

create table planning_leave_private.sedentary_periods (
  id bigint generated always as identity primary key,
  company_id bigint not null,
  person_id bigint not null,
  starts_on date not null check (
    starts_on between date '1900-06-01' and date '2099-06-01'
    and extract(month from starts_on) = 6 and extract(day from starts_on) = 1
  ),
  ends_on date generated always as ((starts_on + interval '1 year')::date - 1) stored,
  debit_from date not null,
  opening_balance numeric not null check (abs(opening_balance) < 100000 and opening_balance = round(opening_balance, 2)),
  opening_accrued numeric not null check (opening_accrued between 0 and 30 and opening_accrued = round(opening_accrued, 2)),
  days_per_week numeric not null check (days_per_week between 0.5 and 6 and days_per_week = round(days_per_week, 2)),
  normal_days numeric not null check (normal_days between 0 and 366 and normal_days = round(normal_days, 4)),
  normal_weeks numeric not null check (normal_weeks between 0 and 53 and normal_weeks = round(normal_weeks, 4)),
  normal_months numeric not null check (normal_months between 0 and 12 and normal_months = round(normal_months, 4)),
  illness_days numeric not null check (illness_days between 0 and 366 and illness_days = round(illness_days, 4)),
  illness_weeks numeric not null check (illness_weeks between 0 and 53 and illness_weeks = round(illness_weeks, 4)),
  illness_months numeric not null check (illness_months between 0 and 12 and illness_months = round(illness_months, 4)),
  worked_holidays date[] not null default '{}',
  working_weekdays smallint[] not null default '{1,2,3,4,5}',
  acquired_days integer generated always as (
    ceil(least(30, greatest(
      2.5 * normal_months + least(24, 2 * illness_months),
      2.5 * normal_weeks / 4 + least(24, 2 * illness_weeks / 4),
      2.5 * normal_days / nullif(4 * days_per_week, 0) + least(24, 2 * illness_days / nullif(4 * days_per_week, 0))
    )))::integer
  ) stored,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  foreign key (person_id, company_id) references public.people(id, company_id),
  unique (company_id, person_id, starts_on),
  check (debit_from between starts_on and ends_on),
  check (normal_days + illness_days <= 366 and normal_weeks + illness_weeks <= 53 and normal_months + illness_months <= 12)
);
create index sedentary_periods_updated_by_idx on planning_leave_private.sedentary_periods(updated_by);
alter table planning_leave_private.sedentary_periods enable row level security;
revoke all on table planning_leave_private.sedentary_periods from public, anon, authenticated;

comment on table planning_leave_private.sedentary_periods is
  'Validated payroll input for one June–May leave acquisition cycle. No period, credit or opening balance is inferred from Planning.';
comment on column planning_leave_private.sedentary_periods.opening_accrued is
  'Cycle acquisition already accounted for in the signed opening balance. Eligible duration inputs cover the entire cycle including before debit_from.';
comment on column planning_leave_private.sedentary_periods.illness_days is
  'Non-occupational illness at the reduced rate. Payroll includes the conventionally assimilated first month in normal duration.';
comment on column planning_leave_private.sedentary_periods.working_weekdays is
  'Normally worked weekdays (ISO 1–6). Used for the departure and resumption dates, independently of the acquisition equivalence.';

create function planning_leave_private.is_sedentary_role(value text)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select coalesce(lower(btrim(normalize(value, NFC))) in ('sédentaire', 'sedentaire'), false);
$$;
revoke all on function planning_leave_private.is_sedentary_role(text) from public, anon, authenticated;

create function planning_leave_private.save_sedentary_period(
  p_person_id bigint, p_starts_on date, p_debit_from date, p_opening_balance numeric, p_opening_accrued numeric,
  p_days_per_week numeric, p_normal_days numeric, p_normal_weeks numeric, p_normal_months numeric,
  p_illness_days numeric, p_illness_weeks numeric, p_illness_months numeric, p_worked_holidays date[],
  p_working_weekdays smallint[]
)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  target_company bigint;
  period_end date;
  period_id bigint;
begin
  if not public.planning_absence_balance_has_access(p_person_id, true) then
    raise exception 'PLANNING_PERMISSION_DENIED: droits du personnel sédentaire.' using errcode = '42501';
  end if;
  select p.company_id into target_company
  from public.people p
  where p.id = p_person_id and p.company_id = public.current_planning_company_id()
    and planning_leave_private.is_sedentary_role(p.role_label)
  for share;
  if target_company is null then
    raise exception 'PLANNING_PERMISSION_DENIED: droits du personnel sédentaire.' using errcode = '42501';
  end if;

  if p_starts_on is null or p_starts_on not between date '1900-06-01' and date '2099-06-01'
    or extract(month from p_starts_on) <> 6 or extract(day from p_starts_on) <> 1 then
    raise exception 'PLANNING_SEDENTARY_LEAVE_PERIOD_INVALID' using errcode = '22023';
  end if;
  period_end := (p_starts_on + interval '1 year')::date - 1;
  if p_worked_holidays is null or cardinality(p_worked_holidays) > 366
    or exists (select 1 from unnest(p_worked_holidays) as holiday(day)
      where holiday.day is null or holiday.day not between p_starts_on and period_end) then
    raise exception 'PLANNING_SEDENTARY_LEAVE_PERIOD_INVALID' using errcode = '22023';
  end if;
  if p_working_weekdays is null or cardinality(p_working_weekdays) not between 1 and 6
    or exists (select 1 from unnest(p_working_weekdays) as weekday(day)
      where weekday.day is null or weekday.day not between 1 and 6)
    or cardinality(p_working_weekdays) <> (select count(distinct day) from unnest(p_working_weekdays) as weekday(day)) then
    raise exception 'PLANNING_SEDENTARY_LEAVE_PERIOD_INVALID' using errcode = '22023';
  end if;

  insert into planning_leave_private.sedentary_periods (
    company_id, person_id, starts_on, debit_from, opening_balance, opening_accrued, days_per_week,
    normal_days, normal_weeks, normal_months, illness_days, illness_weeks, illness_months, worked_holidays, working_weekdays, updated_by
  ) values (
    target_company, p_person_id, p_starts_on, p_debit_from, p_opening_balance, p_opening_accrued, p_days_per_week,
    p_normal_days, p_normal_weeks, p_normal_months, p_illness_days, p_illness_weeks, p_illness_months,
    array(select distinct holiday.day from unnest(p_worked_holidays) as holiday(day) order by holiday.day),
    array(select weekday.day from unnest(p_working_weekdays) as weekday(day) order by weekday.day), auth.uid()
  ) on conflict (company_id, person_id, starts_on) do update set
    debit_from = excluded.debit_from,
    opening_balance = excluded.opening_balance,
    opening_accrued = excluded.opening_accrued,
    days_per_week = excluded.days_per_week,
    normal_days = excluded.normal_days,
    normal_weeks = excluded.normal_weeks,
    normal_months = excluded.normal_months,
    illness_days = excluded.illness_days,
    illness_weeks = excluded.illness_weeks,
    illness_months = excluded.illness_months,
    worked_holidays = excluded.worked_holidays,
    working_weekdays = excluded.working_weekdays,
    updated_at = clock_timestamp(),
    updated_by = excluded.updated_by
  returning id into period_id;
  return period_id;
exception when check_violation or not_null_violation then
  raise exception 'PLANNING_SEDENTARY_LEAVE_PERIOD_INVALID' using errcode = '22023';
end;
$$;

create function public.save_planning_sedentary_leave_period(
  p_person_id bigint, p_starts_on date, p_debit_from date, p_opening_balance numeric, p_opening_accrued numeric,
  p_days_per_week numeric, p_normal_days numeric, p_normal_weeks numeric, p_normal_months numeric,
  p_illness_days numeric, p_illness_weeks numeric, p_illness_months numeric, p_worked_holidays date[],
  p_working_weekdays smallint[]
)
returns bigint language sql security invoker set search_path = '' as $$
  select planning_leave_private.save_sedentary_period(
    p_person_id, p_starts_on, p_debit_from, p_opening_balance, p_opening_accrued, p_days_per_week,
    p_normal_days, p_normal_weeks, p_normal_months, p_illness_days, p_illness_weeks, p_illness_months,
    p_worked_holidays, p_working_weekdays
  );
$$;
revoke all on function
  planning_leave_private.save_sedentary_period(bigint, date, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, date[], smallint[]),
  public.save_planning_sedentary_leave_period(bigint, date, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, date[], smallint[])
from public, anon, authenticated;
grant execute on function
  planning_leave_private.save_sedentary_period(bigint, date, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, date[], smallint[]),
  public.save_planning_sedentary_leave_period(bigint, date, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, date[], smallint[])
to authenticated;

-- Keep the original projection and its scope checks together for crew and RTT.
alter function public.get_planning_absence_balance_context(bigint) set schema planning_leave_private;
revoke all on function planning_leave_private.get_planning_absence_balance_context(bigint) from public, anon, authenticated;

create function public.get_planning_absence_balance_context(p_person_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  legacy_context jsonb;
  sedentary_periods jsonb;
  manager_can_read_inputs boolean;
  target_company bigint;
begin
  legacy_context := planning_leave_private.get_planning_absence_balance_context(p_person_id);
  select p.company_id into target_company
  from public.people p
  where p.id = p_person_id and p.company_id = public.current_planning_company_id()
    and planning_leave_private.is_sedentary_role(p.role_label);
  if target_company is null then
    return legacy_context || jsonb_build_object('sedentary_leave', null::jsonb);
  end if;

  manager_can_read_inputs := public.planning_absence_balance_has_access(p_person_id, true);
  select coalesce(jsonb_agg(
    jsonb_build_object('id', p.id, 'starts_on', p.starts_on, 'ends_on', p.ends_on, 'debit_from', p.debit_from,
      'opening_balance', p.opening_balance, 'opening_accrued', p.opening_accrued,
      'acquired_days', p.acquired_days, 'worked_holidays', p.worked_holidays, 'working_weekdays', p.working_weekdays)
    || case when manager_can_read_inputs then jsonb_build_object(
      'days_per_week', p.days_per_week, 'normal_days', p.normal_days, 'normal_weeks', p.normal_weeks,
      'normal_months', p.normal_months, 'illness_days', p.illness_days, 'illness_weeks', p.illness_weeks,
      'illness_months', p.illness_months) else '{}'::jsonb end
    order by p.starts_on desc
  ), '[]'::jsonb) into sedentary_periods
  from planning_leave_private.sedentary_periods p
  where p.company_id = target_company and p.person_id = p_person_id;
  return legacy_context || jsonb_build_object('sedentary_leave', sedentary_periods);
end;
$$;
revoke all on function public.get_planning_absence_balance_context(bigint) from public, anon, authenticated;
grant execute on function public.get_planning_absence_balance_context(bigint) to authenticated;
comment on function public.get_planning_absence_balance_context(bigint) is
  'Selected-person Planning balances with additive payroll-backed Sédentaire periods. Individual employees see totals; eligible office managers also see calculation inputs.';

notify pgrst, 'reload schema';

commit;
