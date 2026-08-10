create extension if not exists btree_gist with schema extensions;

create unique index if not exists project_contracts_identity_company_project_idx
  on public.project_contracts (id, company_id, project_id);

create table public.project_contract_hire_periods (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete restrict,
  project_id bigint not null,
  contract_id bigint not null,
  starts_on date not null,
  ends_on date,
  charter_hire numeric(14, 2) not null,
  hire_currency text not null,
  hire_unit text not null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_contract_hire_periods_contract_fkey
    foreign key (contract_id, company_id, project_id)
    references public.project_contracts(id, company_id, project_id)
    on delete cascade,
  constraint project_contract_hire_periods_dates_check
    check (ends_on is null or ends_on >= starts_on),
  constraint project_contract_hire_periods_amount_check check (charter_hire >= 0),
  constraint project_contract_hire_periods_currency_check check (hire_currency ~ '^[A-Z]{3}$'),
  constraint project_contract_hire_periods_unit_check check (nullif(btrim(hire_unit), '') is not null),
  constraint project_contract_hire_periods_no_overlap exclude using gist (
    contract_id with =,
    daterange(starts_on, coalesce(ends_on + 1, 'infinity'::date), '[)') with &&
  )
);

create index project_contract_hire_periods_project_date_idx
  on public.project_contract_hire_periods (project_id, starts_on, ends_on);
create index project_contract_hire_periods_company_idx
  on public.project_contract_hire_periods (company_id);

alter table public.project_contract_hire_periods enable row level security;

create policy project_contract_hire_periods_manager_read
  on public.project_contract_hire_periods
  for select
  to authenticated
  using (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction']))
  );

revoke all on table public.project_contract_hire_periods from public, anon, authenticated;
grant select on table public.project_contract_hire_periods to authenticated;

insert into public.project_contract_hire_periods (
  company_id,
  project_id,
  contract_id,
  starts_on,
  ends_on,
  charter_hire,
  hire_currency,
  hire_unit,
  created_by,
  updated_by
)
select
  contract.company_id,
  contract.project_id,
  contract.id,
  coalesce(project.starts_on, contract.created_at::date, date '1900-01-01'),
  null,
  contract.charter_hire,
  contract.hire_currency,
  coalesce(nullif(btrim(contract.hire_unit), ''), 'jour'),
  contract.created_by,
  contract.updated_by
from public.project_contracts contract
join public.projects project on project.id = contract.project_id
where contract.archived_at is null
  and contract.charter_hire is not null
  and contract.hire_currency is not null
on conflict do nothing;

create function public.project_contract_hire_at(
  target_project_id bigint,
  target_date date
)
returns table (
  charter_hire numeric,
  hire_currency text,
  hire_unit text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    period.charter_hire,
    period.hire_currency,
    period.hire_unit
  from public.project_contract_hire_periods period
  where period.project_id = target_project_id
    and period.starts_on <= target_date
    and (period.ends_on is null or period.ends_on >= target_date)
  order by period.starts_on desc, period.id desc
  limit 1
$$;

revoke all on function public.project_contract_hire_at(bigint, date)
  from public, anon, authenticated;

alter table public.planning_projects
  add column if not exists charter_hire_override boolean not null default false;

comment on column public.planning_projects.charter_hire_override is
  'True only when Admin or Direction explicitly replaces the contract hire for this operation.';

update public.planning_projects occurrence
set charter_hire_override = true
where occurrence.catalog_project_id is not null
  and occurrence.charter_hire is not null
  and exists (
    select 1
    from public.project_contract_hire_periods period
    where period.project_id = occurrence.catalog_project_id
      and period.starts_on <= occurrence.starts_on
      and (period.ends_on is null or period.ends_on >= occurrence.starts_on)
      and (
        occurrence.charter_hire is distinct from period.charter_hire
        or occurrence.hire_currency is distinct from period.hire_currency
        or occurrence.hire_unit is distinct from period.hire_unit
      )
  );

create function public.sync_planning_operation_contract_hire()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved record;
begin
  if new.catalog_project_id is null or new.charter_hire_override then
    return new;
  end if;

  select * into resolved
  from public.project_contract_hire_at(new.catalog_project_id, new.starts_on);

  if found then
    new.charter_hire := resolved.charter_hire;
    new.hire_currency := resolved.hire_currency;
    new.hire_unit := resolved.hire_unit;
  else
    select contract.charter_hire, contract.hire_currency, contract.hire_unit
    into resolved
    from public.project_contracts contract
    where contract.project_id = new.catalog_project_id
      and contract.archived_at is null
    order by contract.id desc
    limit 1;
    new.charter_hire := resolved.charter_hire;
    new.hire_currency := resolved.hire_currency;
    new.hire_unit := resolved.hire_unit;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_planning_operation_contract_hire()
  from public, anon, authenticated;

drop trigger if exists planning_operation_contract_hire_sync on public.planning_projects;
create trigger planning_operation_contract_hire_sync
before insert or update of catalog_project_id, starts_on, charter_hire_override
on public.planning_projects
for each row
execute function public.sync_planning_operation_contract_hire();

create function public.refresh_project_contract_operation_hires()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_project_id bigint := coalesce(new.project_id, old.project_id);
begin
  update public.planning_projects occurrence
  set
    starts_on = occurrence.starts_on,
    updated_at = now()
  where occurrence.catalog_project_id = affected_project_id
    and not occurrence.charter_hire_override;
  return coalesce(new, old);
end;
$$;

revoke all on function public.refresh_project_contract_operation_hires()
  from public, anon, authenticated;

create trigger project_contract_hire_periods_refresh_operations
after insert or update or delete on public.project_contract_hire_periods
for each row
execute function public.refresh_project_contract_operation_hires();

create function public.projects_replace_contract_hire_periods(
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
  where occurrence.catalog_project_id = target_project_id
    and not occurrence.charter_hire_override;
end;
$$;

revoke all on function public.projects_replace_contract_hire_periods(bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.projects_replace_contract_hire_periods(bigint, jsonb)
  to authenticated;

create function public.projects_set_operation_hire_override(
  target_occurrence_id bigint,
  target_project_id bigint,
  target_is_override boolean,
  target_charter_hire numeric,
  target_hire_currency text,
  target_hire_unit text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
begin
  if target_company_id is null
     or not public.user_belongs_to_company(target_company_id)
     or not public.has_any_role(array['admin', 'direction']) then
    raise exception 'Only Admin and Direction may override operation charter hire' using errcode = '42501';
  end if;

  if coalesce(target_is_override, false) and (
    target_charter_hire is null
    or target_charter_hire < 0
    or nullif(upper(btrim(target_hire_currency)), '') !~ '^[A-Z]{3}$'
    or nullif(btrim(target_hire_unit), '') is null
  ) then
    raise exception 'A valid amount, currency and unit are required for an operation hire override' using errcode = '22023';
  end if;

  update public.planning_projects occurrence
  set
    charter_hire_override = coalesce(target_is_override, false),
    charter_hire = case when target_is_override then target_charter_hire else occurrence.charter_hire end,
    hire_currency = case when target_is_override then upper(btrim(target_hire_currency)) else occurrence.hire_currency end,
    hire_unit = case when target_is_override then btrim(target_hire_unit) else occurrence.hire_unit end,
    updated_at = now()
  where occurrence.id = target_occurrence_id
    and occurrence.catalog_project_id = target_project_id
    and occurrence.company_id = target_company_id;

  if not found then
    raise exception 'Project operation not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.projects_set_operation_hire_override(bigint, bigint, boolean, numeric, text, text)
  from public, anon, authenticated;
grant execute on function public.projects_set_operation_hire_override(bigint, bigint, boolean, numeric, text, text)
  to authenticated;

drop function if exists public.projects_planning_occurrences();
create function public.projects_planning_occurrences()
returns table (
  id bigint,
  catalog_project_id bigint,
  starts_on date,
  ends_on date,
  status text,
  description text,
  charter_hire numeric,
  hire_currency text,
  hire_unit text,
  charter_hire_override boolean,
  source_label text,
  created_at timestamptz,
  vessel_ids bigint[],
  vessel_names text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
begin
  if target_company_id is null
     or not public.user_belongs_to_company(target_company_id)
     or not public.has_any_role(array['admin', 'direction']) then
    raise exception 'Insufficient permission to read operation charter hire' using errcode = '42501';
  end if;

  return query
  select
    occurrence.id,
    occurrence.catalog_project_id,
    occurrence.starts_on,
    coalesce(occurrence.ends_on, occurrence.starts_on),
    occurrence.status,
    occurrence.description,
    occurrence.charter_hire,
    occurrence.hire_currency,
    occurrence.hire_unit,
    occurrence.charter_hire_override,
    occurrence.source_label,
    occurrence.created_at,
    coalesce((select array_agg(link.vessel_id order by link.position)
      from public.planning_operation_vessels link
      where link.planning_occurrence_id = occurrence.id), array[]::bigint[]),
    coalesce((select array_agg(vessel.name order by link.position)
      from public.planning_operation_vessels link
      join public.vessels vessel on vessel.id = link.vessel_id
      where link.planning_occurrence_id = occurrence.id), array[]::text[])
  from public.planning_projects occurrence
  where occurrence.company_id = target_company_id
    and occurrence.catalog_project_id is not null
  order by occurrence.id;
end;
$$;

revoke all on function public.projects_planning_occurrences()
  from public, anon, authenticated;
grant execute on function public.projects_planning_occurrences()
  to authenticated;

create function public.projects_contracts()
returns table (
  id bigint,
  project_id bigint,
  owner_identity text,
  vessel_assignment_limit text,
  extension_count integer,
  extension_duration numeric,
  extension_unit text,
  auto_extension_period text,
  max_extension_days integer,
  mobilisation_fee numeric,
  demobilisation_fee numeric,
  fee_currency text,
  charter_hire numeric,
  extension_hire numeric,
  hire_currency text,
  hire_unit text,
  max_audit_period text,
  supplytime_schema_version text,
  supplytime_data jsonb,
  source_label text,
  sharepoint_list_title text,
  sharepoint_item_id text,
  source_modified_at timestamptz,
  archived_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  can_view_hire boolean := public.has_any_role(array['admin', 'direction']);
begin
  if target_company_id is null or not public.user_belongs_to_company(target_company_id) then
    raise exception 'Insufficient permission to read project contracts' using errcode = '42501';
  end if;

  return query
  select
    contract.id,
    contract.project_id,
    contract.owner_identity,
    contract.vessel_assignment_limit,
    contract.extension_count,
    contract.extension_duration,
    contract.extension_unit,
    contract.auto_extension_period,
    contract.max_extension_days,
    contract.mobilisation_fee,
    contract.demobilisation_fee,
    contract.fee_currency,
    case when can_view_hire then contract.charter_hire else null end,
    case when can_view_hire then contract.extension_hire else null end,
    case when can_view_hire then contract.hire_currency else null end,
    case when can_view_hire then contract.hire_unit else null end,
    contract.max_audit_period,
    contract.supplytime_schema_version,
    contract.supplytime_data,
    contract.source_label,
    contract.sharepoint_list_title,
    contract.sharepoint_item_id,
    contract.source_modified_at,
    contract.archived_at
  from public.project_contracts contract
  where contract.company_id = target_company_id
  order by contract.id;
end;
$$;

revoke all on function public.projects_contracts()
  from public, anon, authenticated;
grant execute on function public.projects_contracts()
  to authenticated;

revoke select on table public.project_contracts from authenticated;
grant select (
  id,
  company_id,
  project_id,
  owner_identity,
  vessel_assignment_limit,
  extension_count,
  extension_duration,
  extension_unit,
  auto_extension_period,
  max_extension_days,
  mobilisation_fee,
  demobilisation_fee,
  fee_currency,
  max_audit_period,
  supplytime_schema_version,
  supplytime_data,
  source_label,
  sharepoint_site_url,
  sharepoint_list_id,
  sharepoint_list_title,
  sharepoint_item_id,
  sharepoint_unique_id,
  source_modified_at,
  source_payload,
  created_at,
  updated_at,
  archived_at,
  created_by,
  updated_by,
  archived_by
) on table public.project_contracts to authenticated;

alter table public.project_billing_periods
  add column if not exists include_operations_in_pdf boolean not null default true,
  add column if not exists include_expenses_in_pdf boolean not null default true,
  add column if not exists include_bbtm_in_pdf boolean not null default true,
  add column if not exists excluded_operation_keys text[] not null default array[]::text[];

alter table public.project_chargeable_expenses
  add column if not exists include_in_pdf boolean not null default true;

alter table public.project_billing_services
  add column if not exists include_in_pdf boolean not null default true;

comment on column public.project_billing_periods.excluded_operation_keys is
  'Stable DPR/date keys explicitly hidden from this monthly billing PDF.';
