alter table public.clients
  add column if not exists website text,
  add column if not exists logo_url text,
  add column if not exists logo_storage_path text;

alter table public.project_towed_assets
  add column if not exists photo_url text,
  add column if not exists photo_storage_path text;

comment on column public.clients.website is
  'Official client website used to propose its favicon as an automatically discovered logo.';
comment on column public.clients.logo_url is
  'Optional external raster logo URL. A private Storage object takes precedence when logo_storage_path is set.';
comment on column public.clients.logo_storage_path is
  'Private project-catalog-media object path for a user-supplied client logo.';
comment on column public.project_towed_assets.photo_url is
  'Optional external raster photo URL for a reusable towed asset.';
comment on column public.project_towed_assets.photo_storage_path is
  'Private project-catalog-media object path for a user-supplied towed-asset photo.';

alter table public.clients
  drop constraint if exists clients_website_url_check,
  drop constraint if exists clients_logo_url_check,
  drop constraint if exists clients_logo_storage_path_check,
  add constraint clients_website_url_check check (
    website is null or website ~* '^https?://[^[:space:]]+$'
  ),
  add constraint clients_logo_url_check check (
    logo_url is null or logo_url ~* '^https?://[^[:space:]]+$'
  ),
  add constraint clients_logo_storage_path_check check (
    logo_storage_path is null or logo_storage_path ~ '^clients/[0-9]+/[^/]+$'
  );

alter table public.project_towed_assets
  drop constraint if exists project_towed_assets_photo_url_check,
  drop constraint if exists project_towed_assets_photo_storage_path_check,
  add constraint project_towed_assets_photo_url_check check (
    photo_url is null or photo_url ~* '^https?://[^[:space:]]+$'
  ),
  add constraint project_towed_assets_photo_storage_path_check check (
    photo_storage_path is null or photo_storage_path ~ '^towed-assets/[0-9]+/[^/]+$'
  );

drop index if exists public.project_towed_assets_company_name_unique_idx;
create unique index project_towed_assets_company_name_unique_idx
  on public.project_towed_assets (company_id, lower(trim(name)))
  where active;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-catalog-media',
  'project-catalog-media',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.project_catalog_media_can_access(
  target_name text,
  require_manager boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  entity_kind text := split_part(target_name, '/', 1);
  entity_id bigint;
begin
  if auth.uid() is null
     or target_company_id is null
     or not public.user_belongs_to_company(target_company_id)
     or (require_manager and not public.has_any_role(array['admin', 'direction']))
     or target_name !~ '^(clients|towed-assets)/[0-9]+/[^/]+$' then
    return false;
  end if;

  entity_id := split_part(target_name, '/', 2)::bigint;
  if entity_kind = 'clients' then
    return exists (
      select 1
      from public.clients client
      where client.id = entity_id
        and client.company_id = target_company_id
    );
  end if;

  return exists (
    select 1
    from public.project_towed_assets asset
    where asset.id = entity_id
      and asset.company_id = target_company_id
  );
end;
$$;

revoke all on function public.project_catalog_media_can_access(text, boolean)
  from public, anon, authenticated;
grant execute on function public.project_catalog_media_can_access(text, boolean)
  to authenticated;

drop policy if exists project_catalog_media_read on storage.objects;
create policy project_catalog_media_read on storage.objects
for select to authenticated
using (
  bucket_id = 'project-catalog-media'
  and public.project_catalog_media_can_access(name, false)
);

drop policy if exists project_catalog_media_insert on storage.objects;
create policy project_catalog_media_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'project-catalog-media'
  and public.project_catalog_media_can_access(name, true)
);

drop policy if exists project_catalog_media_delete on storage.objects;
create policy project_catalog_media_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'project-catalog-media'
  and public.project_catalog_media_can_access(name, true)
);

drop function if exists public.clients_save(
  bigint, text, text, text, text, text, text, text, text, boolean, timestamptz
);

create function public.clients_save(
  target_client_id bigint default null,
  target_name text default null,
  target_represented_by text default null,
  target_code text default null,
  target_email text default null,
  target_phone text default null,
  target_address text default null,
  target_city text default null,
  target_country text default null,
  target_website text default null,
  target_logo_url text default null,
  target_logo_storage_path text default null,
  target_active boolean default true,
  target_expected_updated_at timestamptz default null
)
returns public.clients
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  normalized_name text := public.normalize_import_label(target_name);
  normalized_logo_path text := nullif(trim(target_logo_storage_path), '');
  result public.clients;
begin
  if target_company_id is null
     or not public.user_belongs_to_company(target_company_id)
     or not public.has_any_role(array['admin', 'direction']) then
    raise exception 'Insufficient permission to save a client' using errcode = '42501';
  end if;
  if normalized_name is null then
    raise exception 'Client name is required' using errcode = '22023';
  end if;
  if normalized_logo_path is not null and (
    target_client_id is null
    or normalized_logo_path !~ ('^clients/' || target_client_id::text || '/[^/]+$')
    or not exists (
      select 1 from storage.objects object
      where object.bucket_id = 'project-catalog-media'
        and object.name = normalized_logo_path
    )
  ) then
    raise exception 'Invalid client logo storage path' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('client:' || target_company_id::text || ':' || normalized_name, 0)
  );

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
      represented_by,
      code,
      email,
      phone,
      address,
      city,
      country,
      website,
      logo_url,
      active,
      source_label,
      created_by,
      updated_by
    ) values (
      target_company_id,
      trim(target_name),
      nullif(trim(target_represented_by), ''),
      nullif(trim(target_code), ''),
      nullif(trim(target_email), ''),
      nullif(trim(target_phone), ''),
      nullif(trim(target_address), ''),
      nullif(trim(target_city), ''),
      nullif(trim(target_country), ''),
      nullif(trim(target_website), ''),
      nullif(trim(target_logo_url), ''),
      coalesce(target_active, true),
      'seapilot',
      auth.uid(),
      auth.uid()
    )
    returning * into result;
  else
    update public.clients client
    set name = trim(target_name),
        represented_by = nullif(trim(target_represented_by), ''),
        code = nullif(trim(target_code), ''),
        email = nullif(trim(target_email), ''),
        phone = nullif(trim(target_phone), ''),
        address = nullif(trim(target_address), ''),
        city = nullif(trim(target_city), ''),
        country = nullif(trim(target_country), ''),
        website = nullif(trim(target_website), ''),
        logo_url = nullif(trim(target_logo_url), ''),
        logo_storage_path = normalized_logo_path,
        active = coalesce(target_active, true),
        updated_by = auth.uid()
    where client.id = target_client_id
      and client.company_id = target_company_id
      and client.archived_at is null
      and (target_expected_updated_at is null or client.updated_at = target_expected_updated_at)
    returning * into result;

    if result.id is null then
      if exists (
        select 1
        from public.clients client
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

revoke all on function public.clients_save(
  bigint, text, text, text, text, text, text, text, text, text, text, text,
  boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.clients_save(
  bigint, text, text, text, text, text, text, text, text, text, text, text,
  boolean, timestamptz
) to authenticated;

create or replace function public.clients_archive(target_client_id bigint)
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
    raise exception 'Insufficient permission to archive a client' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.projects project
    where project.client_id = target_client_id
      and project.company_id = target_company_id
      and project.archived_at is null
  ) then
    raise exception 'Ce client est utilisé par un projet actif et ne peut pas être supprimé.' using errcode = '23503';
  end if;

  update public.clients client
  set active = false,
      archived_at = now(),
      updated_by = auth.uid()
  where client.id = target_client_id
    and client.company_id = target_company_id
    and client.archived_at is null;

  if not found then
    raise exception 'Client not found in the active company' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.clients_archive(bigint) from public, anon, authenticated;
grant execute on function public.clients_archive(bigint) to authenticated;

drop function if exists public.projects_towed_assets();
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
  photo_url text,
  photo_storage_path text,
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
    asset.photo_url,
    asset.photo_storage_path,
    asset.active
  from public.project_towed_assets asset
  where asset.company_id = target_company_id
  order by asset.active desc, asset.name;
end;
$$;

revoke all on function public.projects_towed_assets() from public, anon, authenticated;
grant execute on function public.projects_towed_assets() to authenticated;

drop function if exists public.projects_save_towed_asset(
  bigint, text, text, numeric, numeric, numeric, numeric, text, text, text, text, text, text
);

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
  target_liability_insurer text,
  target_photo_url text,
  target_photo_storage_path text
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
  normalized_photo_path text := nullif(trim(target_photo_storage_path), '');
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
  if normalized_photo_path is not null and (
    target_towed_asset_id is null
    or normalized_photo_path !~ ('^towed-assets/' || target_towed_asset_id::text || '/[^/]+$')
    or not exists (
      select 1 from storage.objects object
      where object.bucket_id = 'project-catalog-media'
        and object.name = normalized_photo_path
    )
  ) then
    raise exception 'Invalid towed-asset photo storage path' using errcode = '22023';
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
      photo_url,
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
      nullif(trim(target_photo_url), ''),
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
        photo_url = nullif(trim(target_photo_url), ''),
        photo_storage_path = normalized_photo_path,
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
  bigint, text, text, numeric, numeric, numeric, numeric, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.projects_save_towed_asset(
  bigint, text, text, numeric, numeric, numeric, numeric, text, text, text, text, text, text, text, text
) to authenticated;

create or replace function public.projects_archive_towed_asset(target_towed_asset_id bigint)
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
    raise exception 'Insufficient permission to archive a towed asset' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.project_contracts contract
    join public.projects project
      on project.id = contract.project_id
     and project.company_id = contract.company_id
    where contract.towed_asset_id = target_towed_asset_id
      and contract.company_id = target_company_id
      and project.archived_at is null
  ) then
    raise exception 'Ce remorqué est utilisé par un projet actif et ne peut pas être supprimé.' using errcode = '23503';
  end if;

  update public.project_towed_assets asset
  set active = false,
      updated_by = auth.uid()
  where asset.id = target_towed_asset_id
    and asset.company_id = target_company_id
    and asset.active;

  if not found then
    raise exception 'Towed asset not found in the active company' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.projects_archive_towed_asset(bigint)
  from public, anon, authenticated;
grant execute on function public.projects_archive_towed_asset(bigint)
  to authenticated;
