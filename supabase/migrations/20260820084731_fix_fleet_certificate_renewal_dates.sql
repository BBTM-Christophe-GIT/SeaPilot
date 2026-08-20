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
  if p_issued_on is null then
    raise exception 'La date d''émission du document est obligatoire.';
  end if;
  if p_expires_on is not null and p_expires_on < p_issued_on then
    raise exception 'La date d''échéance ne peut pas être antérieure à la date d''émission.';
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
      issued_on = p_issued_on,
      expires_on = p_expires_on,
      alarm_on = case when p_expires_on is null then null else p_expires_on - 90 end,
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

revoke all on function public.submit_fleet_certificate_renewal(bigint, text, text, text, text, bigint, date, date, text) from public;
grant execute on function public.submit_fleet_certificate_renewal(bigint, text, text, text, text, bigint, date, date, text) to authenticated;

-- Les renouvellements déjà soumis avant ce correctif portent les bonnes dates
-- sur leur version, mais pas toujours sur la fiche du document.
with latest_pending_version as (
  select distinct on (certificate_id)
    certificate_id,
    issued_on,
    expires_on
  from public.fleet_certificate_versions
  where status = 'pending_validation'
  order by certificate_id, version_no desc
)
update public.fleet_certificates certificate
set issued_on = version.issued_on,
    expires_on = version.expires_on,
    alarm_on = case when version.expires_on is null then null else version.expires_on - 90 end,
    updated_at = now()
from latest_pending_version version
where certificate.id = version.certificate_id
  and certificate.status = 'pending_validation'
  and (
    certificate.issued_on is distinct from version.issued_on
    or certificate.expires_on is distinct from version.expires_on
  );
