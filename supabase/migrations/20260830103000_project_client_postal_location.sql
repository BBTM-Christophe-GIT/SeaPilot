-- Store postal codes independently and keep the controlled client write RPC aligned.

alter table public.clients
  add column if not exists postal_code text;

alter table public.clients
  drop constraint if exists clients_postal_code_length_check,
  add constraint clients_postal_code_length_check check (
    postal_code is null or char_length(trim(postal_code)) between 2 and 20
  );

comment on column public.clients.postal_code is
  'Postal code used to propose the client city and resolve the country without a visible country field.';

drop function if exists public.clients_save(
  bigint, text, text, text, text, text, text, text, text, text, text, text,
  boolean, timestamptz
);

create function public.clients_save(
  target_client_id bigint default null,
  target_name text default null,
  target_represented_by text default null,
  target_code text default null,
  target_email text default null,
  target_phone text default null,
  target_address text default null,
  target_postal_code text default null,
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
      postal_code,
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
      nullif(trim(target_postal_code), ''),
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
        postal_code = nullif(trim(target_postal_code), ''),
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
  bigint, text, text, text, text, text, text, text, text, text, text, text, text,
  boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.clients_save(
  bigint, text, text, text, text, text, text, text, text, text, text, text, text,
  boolean, timestamptz
) to authenticated;

comment on function public.clients_save(
  bigint, text, text, text, text, text, text, text, text, text, text, text, text,
  boolean, timestamptz
) is
  'Creates or updates a company client, including its postal location and private catalog logo.';

notify pgrst, 'reload schema';
