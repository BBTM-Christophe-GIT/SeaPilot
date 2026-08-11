alter table public.project_contract_hire_periods
  add column standby_hire numeric(14, 2),
  add column weather_standby_hire numeric(14, 2);

update public.project_contract_hire_periods
set
  standby_hire = charter_hire,
  weather_standby_hire = charter_hire
where standby_hire is null
   or weather_standby_hire is null;

alter table public.project_contract_hire_periods
  alter column standby_hire set not null,
  alter column weather_standby_hire set not null,
  add constraint project_contract_hire_periods_standby_amount_check
    check (standby_hire >= 0),
  add constraint project_contract_hire_periods_weather_standby_amount_check
    check (weather_standby_hire >= 0);

comment on column public.project_contract_hire_periods.charter_hire is
  'Contract hire applicable while the vessel is in operation during this date range.';
comment on column public.project_contract_hire_periods.standby_hire is
  'Contract hire applicable while the vessel is on stand-by during this date range.';
comment on column public.project_contract_hire_periods.weather_standby_hire is
  'Contract hire applicable while the vessel is on weather stand-by during this date range.';

drop function public.project_contract_hire_at(bigint, date);

create function public.project_contract_hire_at(
  target_project_id bigint,
  target_date date
)
returns table (
  charter_hire numeric,
  standby_hire numeric,
  weather_standby_hire numeric,
  hire_currency text,
  hire_unit text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    period.charter_hire,
    period.standby_hire,
    period.weather_standby_hire,
    period.hire_currency,
    period.hire_unit
  from public.project_contract_hire_periods period
  where period.project_id = target_project_id
    and target_date >= period.starts_on
    and (period.ends_on is null or target_date <= period.ends_on)
  order by period.starts_on desc, period.id desc
  limit 1
$$;

revoke all on function public.project_contract_hire_at(bigint, date)
  from public, anon, authenticated;

create or replace function public.projects_replace_contract_hire_periods(
  target_project_id bigint,
  target_periods jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  target_contract public.project_contracts%rowtype;
  first_period record;
begin
  if target_company_id is null
     or not public.user_belongs_to_company(target_company_id)
     or not public.has_any_role(array['admin', 'direction']) then
    raise exception 'Insufficient permission to manage contract hire periods' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(target_periods, '[]'::jsonb)) <> 'array' then
    raise exception 'Contract hire periods must be a JSON array' using errcode = '22023';
  end if;

  select contract.* into target_contract
  from public.project_contracts contract
  where contract.project_id = target_project_id
    and contract.company_id = target_company_id
    and contract.archived_at is null
  for update;

  if not found then
    raise exception 'Active project contract not found' using errcode = 'P0002';
  end if;

  perform set_config('seapilot.defer_contract_hire_refresh', 'on', true);

  delete from public.project_contract_hire_periods period
  where period.contract_id = target_contract.id;

  insert into public.project_contract_hire_periods (
    company_id,
    project_id,
    contract_id,
    starts_on,
    ends_on,
    charter_hire,
    standby_hire,
    weather_standby_hire,
    hire_currency,
    hire_unit
  )
  select
    target_company_id,
    target_project_id,
    target_contract.id,
    parsed.starts_on,
    parsed.ends_on,
    parsed.charter_hire,
    coalesce(parsed.standby_hire, parsed.charter_hire),
    coalesce(parsed.weather_standby_hire, parsed.charter_hire),
    upper(btrim(parsed.hire_currency)),
    btrim(parsed.hire_unit)
  from jsonb_to_recordset(coalesce(target_periods, '[]'::jsonb)) as parsed(
    starts_on date,
    ends_on date,
    charter_hire numeric,
    standby_hire numeric,
    weather_standby_hire numeric,
    hire_currency text,
    hire_unit text
  );

  perform set_config('seapilot.defer_contract_hire_refresh', 'off', true);

  select period.* into first_period
  from public.project_contract_hire_periods period
  where period.contract_id = target_contract.id
  order by period.starts_on, period.id
  limit 1;

  update public.project_contracts contract
  set
    charter_hire = first_period.charter_hire,
    hire_currency = first_period.hire_currency,
    hire_unit = first_period.hire_unit,
    updated_at = now(),
    updated_by = auth.uid()
  where contract.id = target_contract.id;

  update public.planning_projects occurrence
  set starts_on = occurrence.starts_on, updated_at = now()
  where occurrence.company_id = target_company_id
    and occurrence.catalog_project_id = target_project_id
    and not occurrence.charter_hire_override;
end;
$$;

comment on function public.projects_replace_contract_hire_periods(bigint, jsonb) is
  'Atomically replaces the operation, stand-by and weather stand-by contract hire schedule and refreshes linked operation hires exactly once.';

revoke all on function public.projects_replace_contract_hire_periods(bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.projects_replace_contract_hire_periods(bigint, jsonb)
  to authenticated;
