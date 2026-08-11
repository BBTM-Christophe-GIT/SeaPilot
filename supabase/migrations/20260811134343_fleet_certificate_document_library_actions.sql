create or replace function public.create_fleet_certificate_document(
  p_vessel_id bigint,
  p_category_key text,
  p_category_label text,
  p_document_title text,
  p_original_file_name text,
  p_normalized_file_name text,
  p_storage_path text,
  p_mime_type text default null,
  p_file_size_bytes bigint default null,
  p_issued_on date default null,
  p_expires_on date default null
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  target_vessel public.vessels%rowtype;
  new_certificate_id bigint;
begin
  if target_company_id is null
    or not public.has_any_role(array['admin', 'direction', 'armement']) then
    raise exception using errcode = '42501', message = 'Accès refusé.';
  end if;

  select *
  into target_vessel
  from public.vessels
  where id = p_vessel_id
    and company_id = target_company_id
    and active
  limit 1;

  if target_vessel.id is null then
    raise exception using errcode = '22023', message = 'Navire introuvable ou inactif.';
  end if;

  if nullif(btrim(p_category_key), '') is null
    or nullif(btrim(p_category_label), '') is null
    or nullif(btrim(p_document_title), '') is null
    or nullif(btrim(p_original_file_name), '') is null
    or nullif(btrim(p_normalized_file_name), '') is null
    or nullif(btrim(p_storage_path), '') is null then
    raise exception using errcode = '22023', message = 'Les informations du document sont incomplètes.';
  end if;

  insert into public.fleet_certificates (
    company_id,
    vessel_id,
    vessel_name,
    category_key,
    category_label,
    document_title,
    title,
    status,
    issued_on,
    expires_on,
    alarm_on,
    workflow_status,
    original_file_name,
    file_name,
    source_label,
    storage_bucket,
    storage_path,
    mime_type,
    file_size_bytes,
    current_version_no,
    is_active_fleet
  )
  values (
    target_company_id,
    target_vessel.id,
    target_vessel.name,
    btrim(p_category_key),
    btrim(p_category_label),
    btrim(p_document_title),
    btrim(p_document_title),
    case
      when p_expires_on is null then 'valid'
      when p_expires_on < current_date then 'expired'
      when p_expires_on <= current_date + 90 then 'renew_due'
      else 'valid'
    end,
    p_issued_on,
    p_expires_on,
    case when p_expires_on is null then null else p_expires_on - 90 end,
    'validated',
    btrim(p_normalized_file_name),
    btrim(p_normalized_file_name),
    'seapilot',
    'fleet-certificates',
    btrim(p_storage_path),
    nullif(btrim(p_mime_type), ''),
    p_file_size_bytes,
    1,
    true
  )
  returning id into new_certificate_id;

  insert into public.fleet_certificate_versions (
    company_id,
    certificate_id,
    version_no,
    status,
    original_file_name,
    normalized_file_name,
    storage_bucket,
    storage_path,
    mime_type,
    file_size_bytes,
    issued_on,
    expires_on,
    is_current,
    source_label,
    uploaded_by,
    validated_by,
    validated_at
  )
  values (
    target_company_id,
    new_certificate_id,
    1,
    'active',
    btrim(p_original_file_name),
    btrim(p_normalized_file_name),
    'fleet-certificates',
    btrim(p_storage_path),
    nullif(btrim(p_mime_type), ''),
    p_file_size_bytes,
    p_issued_on,
    p_expires_on,
    true,
    'seapilot',
    auth.uid(),
    auth.uid(),
    now()
  );

  return new_certificate_id;
end;
$$;

revoke all on function public.create_fleet_certificate_document(
  bigint, text, text, text, text, text, text, text, bigint, date, date
) from public, anon;
grant execute on function public.create_fleet_certificate_document(
  bigint, text, text, text, text, text, text, text, bigint, date, date
) to authenticated;

create or replace function public.delete_fleet_certificate_documents(p_certificate_ids bigint[])
returns table (storage_bucket text, storage_path text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
begin
  if target_company_id is null
    or not public.has_any_role(array['admin', 'direction', 'armement']) then
    raise exception using errcode = '42501', message = 'Accès refusé.';
  end if;

  if coalesce(cardinality(p_certificate_ids), 0) = 0 then
    return;
  end if;

  return query
  select distinct document.storage_bucket, document.storage_path
  from (
    select version.storage_bucket, version.storage_path
    from public.fleet_certificate_versions version
    join public.fleet_certificates certificate on certificate.id = version.certificate_id
    where certificate.company_id = target_company_id
      and certificate.id = any(p_certificate_ids)
    union all
    select certificate.storage_bucket, certificate.storage_path
    from public.fleet_certificates certificate
    where certificate.company_id = target_company_id
      and certificate.id = any(p_certificate_ids)
  ) document
  where nullif(document.storage_bucket, '') is not null
    and nullif(document.storage_path, '') is not null;

  delete from public.fleet_certificates certificate
  where certificate.company_id = target_company_id
    and certificate.id = any(p_certificate_ids);
end;
$$;

revoke all on function public.delete_fleet_certificate_documents(bigint[]) from public, anon;
grant execute on function public.delete_fleet_certificate_documents(bigint[]) to authenticated;
