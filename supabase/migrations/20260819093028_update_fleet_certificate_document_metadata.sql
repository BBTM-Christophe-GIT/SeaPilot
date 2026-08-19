create or replace function public.update_fleet_certificate_document_metadata(
  p_certificate_id bigint,
  p_vessel_id bigint,
  p_category_key text,
  p_category_label text,
  p_document_title text,
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
  target_certificate public.fleet_certificates%rowtype;
  target_vessel public.vessels%rowtype;
  next_status text;
begin
  if target_company_id is null
    or not public.has_any_role(array['admin', 'direction', 'armement']) then
    raise exception using errcode = '42501', message = 'Accès refusé.';
  end if;

  if p_certificate_id is null
    or p_vessel_id is null
    or nullif(btrim(p_category_key), '') is null
    or nullif(btrim(p_category_label), '') is null
    or nullif(btrim(p_document_title), '') is null then
    raise exception using errcode = '22023', message = 'Les informations du document sont incomplètes.';
  end if;

  if p_issued_on is not null and p_expires_on is not null and p_expires_on < p_issued_on then
    raise exception using errcode = '22007', message = 'La date d’échéance ne peut pas être antérieure à la date d’émission.';
  end if;

  select *
  into target_certificate
  from public.fleet_certificates
  where id = p_certificate_id
    and company_id = target_company_id
  for update;

  if target_certificate.id is null then
    raise exception using errcode = 'P0002', message = 'Document introuvable ou inaccessible.';
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

  next_status := case
    when target_certificate.status in ('missing', 'pending_validation') then target_certificate.status
    when p_expires_on is null then 'valid'
    when p_expires_on < current_date then 'expired'
    when p_expires_on <= current_date + 90 then 'renew_due'
    else 'valid'
  end;

  update public.fleet_certificates
  set vessel_id = target_vessel.id,
      vessel_name = target_vessel.name,
      category_key = btrim(p_category_key),
      category_label = btrim(p_category_label),
      document_title = btrim(p_document_title),
      title = btrim(p_document_title),
      issued_on = p_issued_on,
      expires_on = p_expires_on,
      alarm_on = case when p_expires_on is null then null else p_expires_on - 90 end,
      status = next_status,
      updated_at = now()
  where id = target_certificate.id;

  update public.fleet_certificate_versions
  set issued_on = p_issued_on,
      expires_on = p_expires_on
  where certificate_id = target_certificate.id
    and is_current;

  return target_certificate.id;
end;
$$;

comment on function public.update_fleet_certificate_document_metadata(bigint, bigint, text, text, text, date, date)
is 'Updates editable fleet certificate metadata and keeps the active version dates synchronized.';

revoke all on function public.update_fleet_certificate_document_metadata(
  bigint, bigint, text, text, text, date, date
) from public, anon;
grant execute on function public.update_fleet_certificate_document_metadata(
  bigint, bigint, text, text, text, date, date
) to authenticated;
