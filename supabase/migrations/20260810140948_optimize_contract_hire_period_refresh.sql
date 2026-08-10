create or replace function public.refresh_project_contract_operation_hires()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_project_id bigint := coalesce(new.project_id, old.project_id);
  affected_company_id bigint := coalesce(new.company_id, old.company_id);
begin
  if current_setting('seapilot.defer_contract_hire_refresh', true) = 'on' then
    return coalesce(new, old);
  end if;

  update public.planning_projects occurrence
  set
    starts_on = occurrence.starts_on,
    updated_at = now()
  where occurrence.company_id = affected_company_id
    and occurrence.catalog_project_id = affected_project_id
    and not occurrence.charter_hire_override;
  return coalesce(new, old);
end;
$$;

comment on function public.refresh_project_contract_operation_hires() is
  'Refreshes linked operation hires after an isolated tariff change; bulk replacements defer row refreshes and run one final pass.';

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
    upper(btrim(parsed.hire_currency)),
    btrim(parsed.hire_unit)
  from jsonb_to_recordset(coalesce(target_periods, '[]'::jsonb)) as parsed(
    starts_on date,
    ends_on date,
    charter_hire numeric,
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
  'Atomically replaces a contract tariff schedule and refreshes linked operation hires exactly once.';

revoke all on function public.projects_replace_contract_hire_periods(bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.projects_replace_contract_hire_periods(bigint, jsonb)
  to authenticated;
