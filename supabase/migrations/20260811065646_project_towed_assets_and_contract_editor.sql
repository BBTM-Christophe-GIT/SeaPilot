create table public.project_towed_assets (
  id bigint generated always as identity primary key,
  company_id bigint not null default public.current_planning_company_id()
    references public.companies(id) on delete restrict,
  name text not null,
  asset_type text,
  length_overall_m numeric(10, 2),
  breadth_overall_m numeric(10, 2),
  max_draft_m numeric(10, 2),
  light_displacement_t numeric(12, 2),
  flag text,
  classification_society text,
  registration_number text,
  owner_name text,
  hull_machinery_insurer text,
  liability_insurer text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  constraint project_towed_assets_id_company_key unique (id, company_id),
  constraint project_towed_assets_name_check check (nullif(trim(name), '') is not null),
  constraint project_towed_assets_length_check check (length_overall_m is null or length_overall_m >= 0),
  constraint project_towed_assets_breadth_check check (breadth_overall_m is null or breadth_overall_m >= 0),
  constraint project_towed_assets_draft_check check (max_draft_m is null or max_draft_m >= 0),
  constraint project_towed_assets_displacement_check check (light_displacement_t is null or light_displacement_t >= 0),
  constraint project_towed_assets_flag_check check (flag is null or flag ~ '^[A-Z]{2}$')
);

comment on table public.project_towed_assets is
  'Company-scoped reusable catalogue of vessels, barges, pontoons and packages previously towed.';

create unique index project_towed_assets_company_name_unique_idx
  on public.project_towed_assets (company_id, lower(trim(name)));
create index project_towed_assets_company_active_name_idx
  on public.project_towed_assets (company_id, active, name);

alter table public.project_contracts
  add column towed_asset_id bigint;

alter table public.project_contracts
  add constraint project_contracts_towed_asset_company_fkey
  foreign key (towed_asset_id, company_id)
  references public.project_towed_assets(id, company_id)
  on delete restrict;

alter table public.project_change_log
  drop constraint project_change_log_entity_type_check;
alter table public.project_change_log
  add constraint project_change_log_entity_type_check check (
    entity_type in (
      'clients',
      'projects',
      'project_contracts',
      'project_towed_assets',
      'project_documents',
      'contract_documents',
      'towage_options'
    )
  );

create trigger project_towed_assets_touch
before update on public.project_towed_assets
for each row execute function public.touch_project_domain_row();

create trigger project_towed_assets_audit
after insert or update or delete on public.project_towed_assets
for each row execute function public.audit_project_domain_change();

alter table public.project_towed_assets enable row level security;
revoke all on table public.project_towed_assets from public, anon, authenticated;
revoke all on sequence public.project_towed_assets_id_seq from public, anon, authenticated;
grant all on table public.project_towed_assets to service_role;
grant usage, select on sequence public.project_towed_assets_id_seq to service_role;

insert into public.project_towed_assets (
  company_id,
  name,
  asset_type,
  length_overall_m,
  breadth_overall_m,
  max_draft_m,
  light_displacement_t,
  flag
)
select
  company.id,
  'DENVER',
  'AUTOMOTEUR FLUVIAL',
  82.00,
  8.20,
  1.00,
  700.00,
  'FR'
from public.companies company
where lower(company.code) = 'bbtm'
on conflict (company_id, lower(trim(name))) do nothing;

create function public.projects_towed_assets()
returns table (
  id bigint,
  name text,
  asset_type text,
  length_overall_m numeric,
  breadth_overall_m numeric,
  max_draft_m numeric,
  light_displacement_t numeric,
  flag text,
  classification_society text,
  registration_number text,
  owner_name text,
  hull_machinery_insurer text,
  liability_insurer text,
  active boolean
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
    raise exception 'Insufficient permission to read towed assets' using errcode = '42501';
  end if;

  return query
  select
    asset.id,
    asset.name,
    asset.asset_type,
    asset.length_overall_m,
    asset.breadth_overall_m,
    asset.max_draft_m,
    asset.light_displacement_t,
    asset.flag,
    asset.classification_society,
    asset.registration_number,
    asset.owner_name,
    asset.hull_machinery_insurer,
    asset.liability_insurer,
    asset.active
  from public.project_towed_assets asset
  where asset.company_id = target_company_id
  order by asset.active desc, asset.name;
end;
$$;

revoke all on function public.projects_towed_assets() from public, anon, authenticated;
grant execute on function public.projects_towed_assets() to authenticated;

create function public.projects_save_towed_asset(
  target_towed_asset_id bigint,
  target_name text,
  target_asset_type text,
  target_length_overall_m numeric,
  target_breadth_overall_m numeric,
  target_max_draft_m numeric,
  target_light_displacement_t numeric,
  target_flag text,
  target_classification_society text,
  target_registration_number text,
  target_owner_name text,
  target_hull_machinery_insurer text,
  target_liability_insurer text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  saved_id bigint;
  normalized_flag text := nullif(upper(trim(target_flag)), '');
begin
  if target_company_id is null
     or not public.user_belongs_to_company(target_company_id)
     or not public.has_any_role(array['admin', 'direction']) then
    raise exception 'Insufficient permission to save a towed asset' using errcode = '42501';
  end if;
  if nullif(trim(target_name), '') is null then
    raise exception 'Towed asset name is required' using errcode = '22023';
  end if;
  if normalized_flag is not null and normalized_flag !~ '^[A-Z]{2}$' then
    raise exception 'Towed asset flag must contain two letters' using errcode = '22023';
  end if;
  if target_length_overall_m < 0
     or target_breadth_overall_m < 0
     or target_max_draft_m < 0
     or target_light_displacement_t < 0 then
    raise exception 'Towed asset dimensions cannot be negative' using errcode = '22023';
  end if;

  if target_towed_asset_id is null then
    insert into public.project_towed_assets (
      company_id,
      name,
      asset_type,
      length_overall_m,
      breadth_overall_m,
      max_draft_m,
      light_displacement_t,
      flag,
      classification_society,
      registration_number,
      owner_name,
      hull_machinery_insurer,
      liability_insurer,
      created_by,
      updated_by
    ) values (
      target_company_id,
      trim(target_name),
      nullif(trim(target_asset_type), ''),
      target_length_overall_m,
      target_breadth_overall_m,
      target_max_draft_m,
      target_light_displacement_t,
      normalized_flag,
      nullif(trim(target_classification_society), ''),
      nullif(trim(target_registration_number), ''),
      nullif(trim(target_owner_name), ''),
      nullif(trim(target_hull_machinery_insurer), ''),
      nullif(trim(target_liability_insurer), ''),
      auth.uid(),
      auth.uid()
    )
    returning id into saved_id;
  else
    update public.project_towed_assets asset
    set name = trim(target_name),
        asset_type = nullif(trim(target_asset_type), ''),
        length_overall_m = target_length_overall_m,
        breadth_overall_m = target_breadth_overall_m,
        max_draft_m = target_max_draft_m,
        light_displacement_t = target_light_displacement_t,
        flag = normalized_flag,
        classification_society = nullif(trim(target_classification_society), ''),
        registration_number = nullif(trim(target_registration_number), ''),
        owner_name = nullif(trim(target_owner_name), ''),
        hull_machinery_insurer = nullif(trim(target_hull_machinery_insurer), ''),
        liability_insurer = nullif(trim(target_liability_insurer), ''),
        updated_by = auth.uid()
    where asset.id = target_towed_asset_id
      and asset.company_id = target_company_id
    returning id into saved_id;

    if saved_id is null then
      raise exception 'Towed asset not found in the active company' using errcode = 'P0002';
    end if;
  end if;

  return saved_id;
exception
  when unique_violation then
    raise exception 'A towed asset with this name already exists' using errcode = '23505';
end;
$$;

revoke all on function public.projects_save_towed_asset(
  bigint, text, text, numeric, numeric, numeric, numeric, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.projects_save_towed_asset(
  bigint, text, text, numeric, numeric, numeric, numeric, text, text, text, text, text, text
) to authenticated;

create function public.projects_save_contract_details(
  target_project_id bigint,
  target_owner_identity text,
  target_vessel_assignment_limit text,
  target_extension_count integer,
  target_extension_duration numeric,
  target_extension_unit text,
  target_auto_extension_period text,
  target_max_extension_days integer,
  target_mobilisation_fee numeric,
  target_demobilisation_fee numeric,
  target_fee_currency text,
  target_charter_hire numeric,
  target_extension_hire numeric,
  target_hire_currency text,
  target_hire_unit text,
  target_max_audit_period text,
  target_supplytime_data jsonb,
  target_towed_asset_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  normalized_fee_currency text := nullif(upper(trim(target_fee_currency)), '');
  normalized_hire_currency text := nullif(upper(trim(target_hire_currency)), '');
  normalized_extension_unit text := nullif(trim(target_extension_unit), '');
begin
  if target_company_id is null
     or not public.user_belongs_to_company(target_company_id)
     or not public.has_any_role(array['admin', 'direction']) then
    raise exception 'Insufficient permission to save project contract details' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.projects project
    where project.id = target_project_id
      and project.company_id = target_company_id
      and project.archived_at is null
  ) then
    raise exception 'Active project not found in the active company' using errcode = 'P0002';
  end if;
  if target_towed_asset_id is not null and not exists (
    select 1
    from public.project_towed_assets asset
    where asset.id = target_towed_asset_id
      and asset.company_id = target_company_id
      and asset.active
  ) then
    raise exception 'Selected towed asset is unavailable in the active company' using errcode = '23503';
  end if;
  if not (
    (target_extension_count is null and target_extension_duration is null and normalized_extension_unit is null)
    or (
      target_extension_count > 0
      and target_extension_duration > 0
      and normalized_extension_unit is not null
    )
  ) then
    raise exception 'Extension count, duration and unit must be provided together with positive values' using errcode = '22023';
  end if;
  if target_max_extension_days is not null and target_max_extension_days < 0 then
    raise exception 'Maximum extension days cannot be negative' using errcode = '22023';
  end if;
  if target_mobilisation_fee is not null or target_demobilisation_fee is not null then
    if normalized_fee_currency is null or normalized_fee_currency !~ '^[A-Z]{3}$' then
      raise exception 'A three-letter fee currency is required' using errcode = '22023';
    end if;
  end if;
  if target_charter_hire is not null or target_extension_hire is not null then
    if normalized_hire_currency is null or normalized_hire_currency !~ '^[A-Z]{3}$' then
      raise exception 'A three-letter hire currency is required' using errcode = '22023';
    end if;
  end if;
  if not public.is_valid_supplytime_data(coalesce(target_supplytime_data, '{}'::jsonb)) then
    raise exception 'Invalid supplytime-2017-v1 payload' using errcode = '22023';
  end if;

  insert into public.project_contracts (
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
    charter_hire,
    extension_hire,
    hire_currency,
    hire_unit,
    max_audit_period,
    supplytime_schema_version,
    supplytime_data,
    towed_asset_id,
    source_label,
    created_by,
    updated_by
  ) values (
    target_company_id,
    target_project_id,
    nullif(trim(target_owner_identity), ''),
    nullif(trim(target_vessel_assignment_limit), ''),
    target_extension_count,
    target_extension_duration,
    normalized_extension_unit,
    coalesce(nullif(trim(target_auto_extension_period), ''), 'Voyage'),
    target_max_extension_days,
    target_mobilisation_fee,
    target_demobilisation_fee,
    normalized_fee_currency,
    target_charter_hire,
    target_extension_hire,
    normalized_hire_currency,
    nullif(trim(target_hire_unit), ''),
    nullif(trim(target_max_audit_period), ''),
    'supplytime-2017-v1',
    coalesce(target_supplytime_data, '{}'::jsonb),
    target_towed_asset_id,
    'seapilot',
    auth.uid(),
    auth.uid()
  )
  on conflict (project_id, company_id) do update
  set owner_identity = excluded.owner_identity,
      vessel_assignment_limit = excluded.vessel_assignment_limit,
      extension_count = excluded.extension_count,
      extension_duration = excluded.extension_duration,
      extension_unit = excluded.extension_unit,
      auto_extension_period = excluded.auto_extension_period,
      max_extension_days = excluded.max_extension_days,
      mobilisation_fee = excluded.mobilisation_fee,
      demobilisation_fee = excluded.demobilisation_fee,
      fee_currency = excluded.fee_currency,
      charter_hire = excluded.charter_hire,
      extension_hire = excluded.extension_hire,
      hire_currency = excluded.hire_currency,
      hire_unit = excluded.hire_unit,
      max_audit_period = excluded.max_audit_period,
      supplytime_schema_version = excluded.supplytime_schema_version,
      supplytime_data = excluded.supplytime_data,
      towed_asset_id = excluded.towed_asset_id,
      updated_by = excluded.updated_by
  where (
    project_contracts.owner_identity,
    project_contracts.vessel_assignment_limit,
    project_contracts.extension_count,
    project_contracts.extension_duration,
    project_contracts.extension_unit,
    project_contracts.auto_extension_period,
    project_contracts.max_extension_days,
    project_contracts.mobilisation_fee,
    project_contracts.demobilisation_fee,
    project_contracts.fee_currency,
    project_contracts.charter_hire,
    project_contracts.extension_hire,
    project_contracts.hire_currency,
    project_contracts.hire_unit,
    project_contracts.max_audit_period,
    project_contracts.supplytime_schema_version,
    project_contracts.supplytime_data,
    project_contracts.towed_asset_id
  ) is distinct from (
    excluded.owner_identity,
    excluded.vessel_assignment_limit,
    excluded.extension_count,
    excluded.extension_duration,
    excluded.extension_unit,
    excluded.auto_extension_period,
    excluded.max_extension_days,
    excluded.mobilisation_fee,
    excluded.demobilisation_fee,
    excluded.fee_currency,
    excluded.charter_hire,
    excluded.extension_hire,
    excluded.hire_currency,
    excluded.hire_unit,
    excluded.max_audit_period,
    excluded.supplytime_schema_version,
    excluded.supplytime_data,
    excluded.towed_asset_id
  );
end;
$$;

revoke all on function public.projects_save_contract_details(
  bigint, text, text, integer, numeric, text, text, integer, numeric, numeric, text,
  numeric, numeric, text, text, text, jsonb, bigint
) from public, anon, authenticated;
grant execute on function public.projects_save_contract_details(
  bigint, text, text, integer, numeric, text, text, integer, numeric, numeric, text,
  numeric, numeric, text, text, text, jsonb, bigint
) to authenticated;

drop function public.projects_contracts();

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
  towed_asset_id bigint,
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
    contract.towed_asset_id,
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

revoke all on function public.projects_contracts() from public, anon, authenticated;
grant execute on function public.projects_contracts() to authenticated;
