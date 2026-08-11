create or replace function public.plan_fleet_certificate_renewal(
  p_certificate_id bigint,
  p_planned_on date,
  p_provider_name text default null,
  p_visit_location text default null,
  p_notes text default null
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_company_id bigint;
begin
  if p_planned_on is null then
    raise exception 'La date de planification est obligatoire.';
  end if;

  update public.fleet_certificates
  set planned_on = p_planned_on,
      provider_name = nullif(btrim(p_provider_name), ''),
      visit_location = nullif(btrim(p_visit_location), ''),
      renewal_notes = nullif(btrim(p_notes), ''),
      workflow_status = 'planned',
      updated_at = now()
  where id = p_certificate_id
  returning company_id into target_company_id;

  if target_company_id is null then
    raise exception 'Certificat introuvable ou inaccessible.';
  end if;

  insert into public.fleet_certificate_renewal_events (
    company_id, certificate_id, event_type, planned_on, provider_name,
    visit_location, notes, created_by
  )
  values (
    target_company_id, p_certificate_id, 'planned', p_planned_on,
    nullif(btrim(p_provider_name), ''), nullif(btrim(p_visit_location), ''),
    nullif(btrim(p_notes), ''), auth.uid()
  );

  return p_certificate_id;
end;
$$;

create or replace function public.submit_fleet_certificate_renewal(
  p_certificate_id bigint,
  p_original_file_name text,
  p_normalized_file_name text,
  p_storage_path text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_issued_on date,
  p_expires_on date,
  p_notes text default null
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_certificate public.fleet_certificates%rowtype;
  next_version_no integer;
  created_version_id bigint;
begin
  select * into target_certificate
  from public.fleet_certificates
  where id = p_certificate_id
  for update;

  if target_certificate.id is null then
    raise exception 'Certificat introuvable ou inaccessible.';
  end if;
  if nullif(btrim(p_original_file_name), '') is null
     or nullif(btrim(p_normalized_file_name), '') is null then
    raise exception 'Le nom du document est obligatoire.';
  end if;
  if split_part(p_storage_path, '/', 1) <> target_certificate.company_id::text then
    raise exception 'Le chemin de stockage ne correspond pas à la société.';
  end if;

  select coalesce(max(version_no), 0) + 1
  into next_version_no
  from public.fleet_certificate_versions
  where certificate_id = p_certificate_id;

  insert into public.fleet_certificate_versions (
    company_id, certificate_id, version_no, status, original_file_name,
    normalized_file_name, storage_bucket, storage_path, mime_type,
    file_size_bytes, issued_on, expires_on, is_current, source_label, uploaded_by
  )
  values (
    target_certificate.company_id, p_certificate_id, next_version_no,
    'pending_validation', btrim(p_original_file_name), btrim(p_normalized_file_name),
    'fleet-certificates', p_storage_path, nullif(btrim(p_mime_type), ''),
    p_file_size_bytes, p_issued_on, p_expires_on, false, 'seapilot', auth.uid()
  )
  returning id into created_version_id;

  update public.fleet_certificates
  set status = 'pending_validation',
      workflow_status = 'pending_validation',
      renewal_notes = nullif(btrim(p_notes), ''),
      updated_at = now()
  where id = p_certificate_id;

  insert into public.fleet_certificate_renewal_events (
    company_id, certificate_id, version_id, event_type, notes, created_by
  )
  values (
    target_certificate.company_id, p_certificate_id, created_version_id,
    'submitted', nullif(btrim(p_notes), ''), auth.uid()
  );

  return created_version_id;
end;
$$;

create or replace function public.validate_fleet_certificate_renewal(p_version_id bigint)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_version public.fleet_certificate_versions%rowtype;
  target_certificate public.fleet_certificates%rowtype;
  next_status text;
begin
  select * into target_version
  from public.fleet_certificate_versions
  where id = p_version_id
    and status = 'pending_validation'
  for update;

  if target_version.id is null then
    raise exception 'Version en attente introuvable ou inaccessible.';
  end if;

  select * into target_certificate
  from public.fleet_certificates
  where id = target_version.certificate_id
  for update;

  next_status := case
    when target_version.expires_on is null then 'valid'
    when target_version.expires_on < current_date then 'expired'
    when target_version.expires_on <= current_date + 90 then 'renew_due'
    else 'valid'
  end;

  update public.fleet_certificate_versions
  set is_current = false,
      status = 'archived'
  where certificate_id = target_version.certificate_id
    and is_current;

  update public.fleet_certificate_versions
  set is_current = true,
      status = 'active',
      validated_by = auth.uid(),
      validated_at = now()
  where id = target_version.id;

  update public.fleet_certificates
  set status = next_status,
      issued_on = target_version.issued_on,
      expires_on = target_version.expires_on,
      alarm_on = case when target_version.expires_on is null then null else target_version.expires_on - 90 end,
      original_file_name = target_version.original_file_name,
      file_name = target_version.normalized_file_name,
      storage_bucket = target_version.storage_bucket,
      storage_path = target_version.storage_path,
      mime_type = target_version.mime_type,
      file_size_bytes = target_version.file_size_bytes,
      source_label = 'seapilot',
      file_url = null,
      workflow_status = 'validated',
      current_version_no = target_version.version_no,
      renewed_at = now(),
      updated_at = now()
  where id = target_version.certificate_id;

  insert into public.fleet_certificate_renewal_events (
    company_id, certificate_id, version_id, event_type, notes, created_by
  )
  values (
    target_version.company_id, target_version.certificate_id, target_version.id,
    'validated', 'Nouvelle version validée et activée.', auth.uid()
  );

  return target_version.certificate_id;
end;
$$;

revoke all on function public.plan_fleet_certificate_renewal(bigint, date, text, text, text) from public;
revoke all on function public.submit_fleet_certificate_renewal(bigint, text, text, text, text, bigint, date, date, text) from public;
revoke all on function public.validate_fleet_certificate_renewal(bigint) from public;
grant execute on function public.plan_fleet_certificate_renewal(bigint, date, text, text, text) to authenticated;
grant execute on function public.submit_fleet_certificate_renewal(bigint, text, text, text, text, bigint, date, date, text) to authenticated;
grant execute on function public.validate_fleet_certificate_renewal(bigint) to authenticated;
