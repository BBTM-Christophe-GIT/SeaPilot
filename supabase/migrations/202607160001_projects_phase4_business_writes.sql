-- Projects phase 4: controlled business writes.
-- Structured data is written only to Supabase. SharePoint provenance is immutable and
-- documents remain external references. planning_projects intentionally stays separate.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clients_name_not_blank_check'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_name_not_blank_check
      check (nullif(trim(name), '') is not null) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_title_not_blank_check'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_title_not_blank_check
      check (nullif(trim(title), '') is not null) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'project_contracts_extension_bundle_check'
      and conrelid = 'public.project_contracts'::regclass
  ) then
    alter table public.project_contracts
      add constraint project_contracts_extension_bundle_check
      check (
        (
          extension_count is null
          and extension_duration is null
          and nullif(trim(extension_unit), '') is null
        )
        or (
          extension_count > 0
          and extension_duration > 0
          and nullif(trim(extension_unit), '') is not null
        )
      ) not valid;
  end if;
end $$;

create or replace function public.clients_save(
  target_client_id bigint default null,
  target_name text default null,
  target_code text default null,
  target_email text default null,
  target_phone text default null,
  target_address text default null,
  target_city text default null,
  target_country text default null,
  target_active boolean default true,
  target_expected_updated_at timestamptz default null
)
returns public.clients
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  normalized_name text := public.normalize_import_label(target_name);
  result public.clients;
begin
  if not (select public.user_belongs_to_company(target_company_id))
     or not (select public.has_any_role(array['admin', 'direction'])) then
    raise exception 'Insufficient permission to save a client' using errcode = '42501';
  end if;
  if normalized_name is null then
    raise exception 'Client name is required' using errcode = '22023';
  end if;

  -- Serialise SeaPilot client names within one company without changing imported rows.
  perform pg_advisory_xact_lock(hashtextextended('client:' || target_company_id::text || ':' || normalized_name, 0));

  if exists (
    select 1
    from public.clients client
    where client.company_id = target_company_id
      and client.id is distinct from target_client_id
      and client.archived_at is null
      and public.normalize_import_label(client.name) = normalized_name
  ) then
    raise exception 'An active client with this name already exists' using errcode = '23505';
  end if;

  if target_client_id is null then
    insert into public.clients (
      company_id,
      name,
      code,
      email,
      phone,
      address,
      city,
      country,
      active,
      source_label,
      created_by,
      updated_by
    ) values (
      target_company_id,
      trim(target_name),
      nullif(trim(target_code), ''),
      nullif(trim(target_email), ''),
      nullif(trim(target_phone), ''),
      nullif(trim(target_address), ''),
      nullif(trim(target_city), ''),
      nullif(trim(target_country), ''),
      coalesce(target_active, true),
      'seapilot',
      (select auth.uid()),
      (select auth.uid())
    )
    returning * into result;
  else
    update public.clients client
    set name = trim(target_name),
        code = nullif(trim(target_code), ''),
        email = nullif(trim(target_email), ''),
        phone = nullif(trim(target_phone), ''),
        address = nullif(trim(target_address), ''),
        city = nullif(trim(target_city), ''),
        country = nullif(trim(target_country), ''),
        active = coalesce(target_active, true),
        updated_by = (select auth.uid())
    where client.id = target_client_id
      and client.company_id = target_company_id
      and client.archived_at is null
      and (target_expected_updated_at is null or client.updated_at = target_expected_updated_at)
    returning * into result;

    if result.id is null then
      if exists (
        select 1 from public.clients client
        where client.id = target_client_id
          and client.company_id = target_company_id
          and client.archived_at is null
      ) then
        raise exception 'Client was modified by another user' using errcode = '40001';
      end if;
      raise exception 'Active client not found in the active company' using errcode = 'P0002';
    end if;
  end if;

  return result;
end;
$$;

comment on function public.clients_save(bigint, text, text, text, text, text, text, text, boolean, timestamptz) is
  'Creates or updates a client in the active company, preserving immutable SharePoint provenance and rejecting stale writes.';
revoke all on function public.clients_save(bigint, text, text, text, text, text, text, text, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.clients_save(bigint, text, text, text, text, text, text, text, boolean, timestamptz)
  to authenticated;

create or replace function public.projects_save(
  target_project_id bigint default null,
  target_title text default null,
  target_client_id bigint default null,
  target_primary_vessel_id bigint default null,
  target_secondary_vessel_id bigint default null,
  target_status text default null,
  target_description text default null,
  target_starts_on date default null,
  target_ends_on date default null,
  target_delivery_at timestamptz default null,
  target_redelivery_at timestamptz default null,
  target_charter_starts_at timestamptz default null,
  target_charter_ends_at timestamptz default null,
  target_delivery_port text default null,
  target_redelivery_port text default null,
  target_contract_type text default null,
  target_operation_area text default null,
  target_is_rov_support boolean default false,
  target_is_diving_support boolean default false,
  target_owner_identity text default null,
  target_vessel_assignment_limit text default null,
  target_extension_count integer default null,
  target_extension_duration numeric default null,
  target_extension_unit text default null,
  target_auto_extension_period text default 'Voyage',
  target_max_extension_days integer default null,
  target_mobilisation_fee numeric default null,
  target_demobilisation_fee numeric default null,
  target_fee_currency text default null,
  target_charter_hire numeric default null,
  target_extension_hire numeric default null,
  target_hire_currency text default null,
  target_hire_unit text default null,
  target_max_audit_period text default null,
  target_supplytime_data jsonb default '{}'::jsonb,
  target_expected_updated_at timestamptz default null
)
returns public.projects
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  current_project public.projects;
  result public.projects;
  resolved_client_name text;
  resolved_client_sharepoint_id text;
  resolved_primary_vessel_name text;
  resolved_primary_vessel_sharepoint_id text;
  resolved_secondary_vessel_name text;
  resolved_secondary_vessel_sharepoint_id text;
  normalized_fee_currency text := nullif(upper(trim(target_fee_currency)), '');
  normalized_hire_currency text := nullif(upper(trim(target_hire_currency)), '');
  normalized_extension_unit text := nullif(trim(target_extension_unit), '');
begin
  if not (select public.user_belongs_to_company(target_company_id))
     or not (select public.has_any_role(array['admin', 'direction'])) then
    raise exception 'Insufficient permission to save a project' using errcode = '42501';
  end if;
  if nullif(trim(target_title), '') is null then
    raise exception 'Project title is required' using errcode = '22023';
  end if;

  if target_project_id is not null then
    select project.*
    into current_project
    from public.projects project
    where project.id = target_project_id
      and project.company_id = target_company_id
    for update;

    if current_project.id is null then
      raise exception 'Project not found in the active company' using errcode = 'P0002';
    end if;
    if current_project.archived_at is not null then
      raise exception 'An archived project cannot be modified' using errcode = '55000';
    end if;
    if target_expected_updated_at is not null and current_project.updated_at <> target_expected_updated_at then
      raise exception 'Project was modified by another user' using errcode = '40001';
    end if;
  end if;

  if target_ends_on is not null and target_starts_on is not null and target_ends_on < target_starts_on then
    raise exception 'Project end date cannot precede its start date' using errcode = '22023';
  end if;
  if target_redelivery_at is not null and target_delivery_at is not null and target_redelivery_at < target_delivery_at then
    raise exception 'Redelivery cannot precede delivery' using errcode = '22023';
  end if;
  if target_charter_ends_at is not null and target_charter_starts_at is not null and target_charter_ends_at < target_charter_starts_at then
    raise exception 'Charter end cannot precede charter start' using errcode = '22023';
  end if;
  if target_primary_vessel_id is not null and target_primary_vessel_id = target_secondary_vessel_id then
    raise exception 'Primary and secondary vessels must be different' using errcode = '22023';
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

  if target_client_id is not null then
    select client.name, client.sharepoint_item_id
    into resolved_client_name, resolved_client_sharepoint_id
    from public.clients client
    where client.id = target_client_id
      and client.company_id = target_company_id
      and client.archived_at is null
      and (
        client.active
        or (current_project.id is not null and current_project.client_id = client.id)
      );
    if not found then
      raise exception 'Selected client is unavailable in the active company' using errcode = '23503';
    end if;
  end if;

  if target_primary_vessel_id is not null then
    select vessel.name, vessel.sharepoint_item_id
    into resolved_primary_vessel_name, resolved_primary_vessel_sharepoint_id
    from public.vessels vessel
    where vessel.id = target_primary_vessel_id
      and vessel.company_id = target_company_id
      and (
        (vessel.active and (vessel.fleet_exit_on is null or vessel.fleet_exit_on >= current_date))
        or (current_project.id is not null and current_project.primary_vessel_id = vessel.id)
      );
    if not found then
      raise exception 'Selected primary vessel is unavailable in the active company' using errcode = '23503';
    end if;
  end if;

  if target_secondary_vessel_id is not null then
    select vessel.name, vessel.sharepoint_item_id
    into resolved_secondary_vessel_name, resolved_secondary_vessel_sharepoint_id
    from public.vessels vessel
    where vessel.id = target_secondary_vessel_id
      and vessel.company_id = target_company_id
      and (
        (vessel.active and (vessel.fleet_exit_on is null or vessel.fleet_exit_on >= current_date))
        or (current_project.id is not null and current_project.secondary_vessel_id = vessel.id)
      );
    if not found then
      raise exception 'Selected secondary vessel is unavailable in the active company' using errcode = '23503';
    end if;
  end if;

  if target_project_id is null then
    insert into public.projects (
      company_id,
      title,
      client_id,
      client_sharepoint_item_id,
      client_name,
      primary_vessel_id,
      primary_vessel_sharepoint_item_id,
      primary_vessel_name,
      secondary_vessel_id,
      secondary_vessel_sharepoint_item_id,
      secondary_vessel_name,
      starts_on,
      ends_on,
      status,
      description,
      delivery_at,
      redelivery_at,
      charter_starts_at,
      charter_ends_at,
      delivery_port,
      redelivery_port,
      contract_type,
      operation_area,
      is_rov_support,
      is_diving_support,
      source_label,
      created_by,
      updated_by
    ) values (
      target_company_id,
      trim(target_title),
      target_client_id,
      resolved_client_sharepoint_id,
      resolved_client_name,
      target_primary_vessel_id,
      resolved_primary_vessel_sharepoint_id,
      resolved_primary_vessel_name,
      target_secondary_vessel_id,
      resolved_secondary_vessel_sharepoint_id,
      resolved_secondary_vessel_name,
      target_starts_on,
      target_ends_on,
      nullif(trim(target_status), ''),
      nullif(trim(target_description), ''),
      target_delivery_at,
      target_redelivery_at,
      target_charter_starts_at,
      target_charter_ends_at,
      nullif(trim(target_delivery_port), ''),
      nullif(trim(target_redelivery_port), ''),
      nullif(trim(target_contract_type), ''),
      nullif(trim(target_operation_area), ''),
      coalesce(target_is_rov_support, false),
      coalesce(target_is_diving_support, false),
      'seapilot',
      (select auth.uid()),
      (select auth.uid())
    )
    returning * into result;
  else
    update public.projects project
    set title = trim(target_title),
        client_id = target_client_id,
        client_sharepoint_item_id = resolved_client_sharepoint_id,
        client_name = resolved_client_name,
        primary_vessel_id = target_primary_vessel_id,
        primary_vessel_sharepoint_item_id = resolved_primary_vessel_sharepoint_id,
        primary_vessel_name = resolved_primary_vessel_name,
        secondary_vessel_id = target_secondary_vessel_id,
        secondary_vessel_sharepoint_item_id = resolved_secondary_vessel_sharepoint_id,
        secondary_vessel_name = resolved_secondary_vessel_name,
        starts_on = target_starts_on,
        ends_on = target_ends_on,
        status = nullif(trim(target_status), ''),
        description = nullif(trim(target_description), ''),
        delivery_at = target_delivery_at,
        redelivery_at = target_redelivery_at,
        charter_starts_at = target_charter_starts_at,
        charter_ends_at = target_charter_ends_at,
        delivery_port = nullif(trim(target_delivery_port), ''),
        redelivery_port = nullif(trim(target_redelivery_port), ''),
        contract_type = nullif(trim(target_contract_type), ''),
        operation_area = nullif(trim(target_operation_area), ''),
        is_rov_support = coalesce(target_is_rov_support, false),
        is_diving_support = coalesce(target_is_diving_support, false),
        updated_by = (select auth.uid())
    where project.id = target_project_id
      and project.company_id = target_company_id
    returning * into result;
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
    source_label,
    created_by,
    updated_by
  ) values (
    target_company_id,
    result.id,
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
    'seapilot',
    (select auth.uid()),
    (select auth.uid())
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
      updated_by = excluded.updated_by;

  return result;
end;
$$;

comment on function public.projects_save(bigint, text, bigint, bigint, bigint, text, text, date, date, timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, text, boolean, boolean, text, text, integer, numeric, text, text, integer, numeric, numeric, text, numeric, numeric, text, text, text, jsonb, timestamptz) is
  'Atomically creates or updates one catalog project and its typed/SUPPLYTIME contract, resolves same-company snapshots server-side, and rejects stale writes.';
revoke all on function public.projects_save(bigint, text, bigint, bigint, bigint, text, text, date, date, timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, text, boolean, boolean, text, text, integer, numeric, text, text, integer, numeric, numeric, text, numeric, numeric, text, text, text, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.projects_save(bigint, text, bigint, bigint, bigint, text, text, date, date, timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, text, boolean, boolean, text, text, integer, numeric, text, text, integer, numeric, numeric, text, numeric, numeric, text, text, text, jsonb, timestamptz)
  to authenticated;

-- Keep the phase-1 RPC compatible while routing all new creation through phase-4 validation.
create or replace function public.projects_create(
  target_title text,
  target_client_id bigint default null,
  target_primary_vessel_id bigint default null,
  target_secondary_vessel_id bigint default null,
  target_status text default null,
  target_description text default null,
  target_delivery_at timestamptz default null,
  target_redelivery_at timestamptz default null,
  target_charter_starts_at timestamptz default null,
  target_charter_ends_at timestamptz default null,
  target_delivery_port text default null,
  target_redelivery_port text default null,
  target_contract_type text default null,
  target_operation_area text default null,
  target_is_rov_support boolean default false,
  target_is_diving_support boolean default false
)
returns public.projects
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  result public.projects;
begin
  if not (select public.user_belongs_to_company(target_company_id))
     or not (select public.has_any_role(array['admin', 'direction'])) then
    raise exception 'Insufficient permission to create a project' using errcode = '42501';
  end if;

  result := public.projects_save(
    target_project_id => null,
    target_title => target_title,
    target_client_id => target_client_id,
    target_primary_vessel_id => target_primary_vessel_id,
    target_secondary_vessel_id => target_secondary_vessel_id,
    target_status => target_status,
    target_description => target_description,
    target_delivery_at => target_delivery_at,
    target_redelivery_at => target_redelivery_at,
    target_charter_starts_at => target_charter_starts_at,
    target_charter_ends_at => target_charter_ends_at,
    target_delivery_port => target_delivery_port,
    target_redelivery_port => target_redelivery_port,
    target_contract_type => target_contract_type,
    target_operation_area => target_operation_area,
    target_is_rov_support => target_is_rov_support,
    target_is_diving_support => target_is_diving_support
  );
  return result;
end;
$$;

revoke all on function public.projects_create(text, bigint, bigint, bigint, text, text, timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.projects_create(text, bigint, bigint, bigint, text, text, timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, text, boolean, boolean)
  to authenticated;

create or replace function public.projects_catalog_options()
returns table (
  id bigint,
  project_code text,
  title text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
begin
  if not (select public.user_belongs_to_company(target_company_id))
     or not (select public.has_any_role(array['admin', 'direction', 'armement'])) then
    raise exception 'Insufficient permission to read project catalog options' using errcode = '42501';
  end if;

  return query
  select project.id, project.project_code, project.title
  from public.projects project
  where project.company_id = target_company_id
    and project.archived_at is null
  order by project.project_code nulls last, project.title;
end;
$$;

comment on function public.projects_catalog_options() is
  'Minimal active project catalog for dependent modules. It does not expose clients, commercial fields or contracts and never joins planning_projects.';
revoke all on function public.projects_catalog_options() from public, anon, authenticated;
grant execute on function public.projects_catalog_options() to authenticated;

-- Application writes for the three core entities must pass through controlled RPCs.
-- service_role keeps import access and document metadata retains its separate phase-1 policy.
revoke insert, update on public.clients from authenticated;
revoke insert, update on public.projects from authenticated;
revoke insert, update on public.project_contracts from authenticated;
