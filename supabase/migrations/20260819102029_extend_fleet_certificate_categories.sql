update public.fleet_certificates
set category_key = '08-levage',
    category_label = '08 - Levage',
    updated_at = now()
where category_key = '08-grue-et-bossoir'
   or lower(replace(coalesce(category_label, ''), '&', 'et')) in (
     '08 - grue et bossoir',
     '08 - grue et  bossoir'
   );

create or replace function public.create_fleet_certificate_line(
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
  target_vessel public.vessels%rowtype;
  new_certificate_id bigint;
begin
  if target_company_id is null
    or not public.has_any_role(array['admin', 'direction', 'armement']) then
    raise exception using errcode = '42501', message = 'Accès refusé.';
  end if;

  if p_vessel_id is null
    or nullif(btrim(p_category_key), '') is null
    or nullif(btrim(p_category_label), '') is null
    or nullif(btrim(p_document_title), '') is null then
    raise exception using errcode = '22023', message = 'Les informations de la ligne sont incomplètes.';
  end if;

  if p_issued_on is not null and p_expires_on is not null and p_expires_on < p_issued_on then
    raise exception using errcode = '22007', message = 'La date d’échéance ne peut pas être antérieure à la date d’émission.';
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
    source_label,
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
    'missing',
    p_issued_on,
    p_expires_on,
    case when p_expires_on is null then null else p_expires_on - 90 end,
    'not_started',
    'manual',
    0,
    true
  )
  returning id into new_certificate_id;

  return new_certificate_id;
end;
$$;

comment on function public.create_fleet_certificate_line(bigint, text, text, text, date, date)
is 'Creates a tracked fleet certificate line without requiring an uploaded file.';

revoke all on function public.create_fleet_certificate_line(
  bigint, text, text, text, date, date
) from public, anon;
grant execute on function public.create_fleet_certificate_line(
  bigint, text, text, text, date, date
) to authenticated;
