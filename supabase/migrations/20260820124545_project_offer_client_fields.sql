-- Persist the client representative displayed on commercial offers.
-- Existing company-scoped RLS policies continue to protect the clients table.

alter table public.clients
  add column if not exists represented_by text;

comment on column public.clients.represented_by is
  'Display name of the person representing the client on commercial and contractual documents.';

drop function if exists public.clients_save(
  bigint, text, text, text, text, text, text, text, boolean, timestamptz
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
      represented_by,
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
      nullif(trim(target_represented_by), ''),
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
        represented_by = nullif(trim(target_represented_by), ''),
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

comment on function public.clients_save(
  bigint, text, text, text, text, text, text, text, text, boolean, timestamptz
) is
  'Creates or updates a client and its representative in the active company, preserving immutable SharePoint provenance and rejecting stale writes.';

revoke all on function public.clients_save(
  bigint, text, text, text, text, text, text, text, text, boolean, timestamptz
) from public, anon, authenticated;

grant execute on function public.clients_save(
  bigint, text, text, text, text, text, text, text, text, boolean, timestamptz
) to authenticated;
