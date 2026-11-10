-- Assemble one consistent inventory snapshot, with the connected issuer only.
create function pharmacy_private.purchase_order_context(p_vessel_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  actor_id uuid := (select auth.uid());
  issued_on date := (current_timestamp at time zone 'Europe/Paris')::date;
  vessel public.vessels%rowtype;
  signer public.people%rowtype;
  signer_name text;
  temporary_function text;
  signature_path text;
  signature_mime_type text;
  assigned_dotation_key text;
  items jsonb;
  requirements jsonb;
begin
  if actor_id is null or not coalesce(pharmacy_private.can_manage(target_company_id, p_vessel_id), false) then
    raise exception using errcode = '42501', message = 'Vous n’êtes pas autorisé à émettre un bon de commande pour ce navire.';
  end if;

  select v.* into strict vessel from public.vessels v where v.company_id = target_company_id and v.id = p_vessel_id;
  select p.* into signer from public.people p
  where p.company_id = target_company_id and p.user_id = actor_id and p.active
    and (p.hired_on is null or p.hired_on <= issued_on)
    and (p.departed_on is null or p.departed_on >= issued_on);
  signer_name := nullif(btrim(concat_ws(' ', btrim(signer.first_name), btrim(signer.last_name))), '');
  if signer_name is null then
    raise exception using errcode = '23514', message = 'Associez votre compte à une fiche RH active pour émettre le bon de commande.';
  end if;

  select effective.label into temporary_function
  from public.planning_assignments a
  cross join lateral (select nullif(btrim(public.planning_assignment_function_on_date(a.id, issued_on)), '') as label) effective
  where a.company_id = target_company_id and a.crew_person_id = signer.id and a.vessel_id = p_vessel_id
    and issued_on between a.starts_on and a.ends_on and a.confirmation_status <> 'cancelled'
    -- Legacy assignments sometimes store a department instead of a function.
    and (translate(lower(effective.label), 'éèêë', 'eeee') not in ('crew', 'pont', 'machine', 'equipage')
      or translate(lower(effective.label), 'éèêë', 'eeee') <> translate(lower(btrim(a.assignment_role)), 'éèêë', 'eeee'))
    and public.planning_status_is_working(public.planning_effective_person_status(
      a.company_id, signer.id, issued_on, a.vessel_id, a.status_label
    ))
  order by (a.confirmation_status = 'confirmed') desc, a.starts_on desc, a.id desc
  limit 1;

  select s.storage_path, s.mime_type into signature_path, signature_mime_type
  from public.working_time_profile_signatures s
  where s.company_id = target_company_id and s.person_id = signer.id
    and s.valid_to is null and s.valid_from <= current_timestamp
    and s.storage_bucket = 'working-time-signatures' and s.mime_type in ('image/png', 'image/jpeg', 'image/webp')
    and exists (
      select 1 from document_blob_private.objects() o
      where o.bucket_id = s.storage_bucket and o.name = s.storage_path
        and o.metadata->>'mimetype' = s.mime_type and o.metadata->>'size' = s.file_size_bytes::text
        and (o.metadata->>'document_blob_verified' is distinct from 'true' or o.metadata->>'sha256' = s.sha256)
    );
  if signature_path is null then
    raise exception using errcode = '23514', message = 'Ajoutez une signature active dans votre profil pour émettre le bon de commande.';
  end if;

  assigned_dotation_key := pharmacy_private.dotation_key(vessel.medical_dotation);
  select coalesce(jsonb_agg(to_jsonb(i) - array['source_data', 'created_by', 'updated_by', 'created_at'] order by i.id), '[]'::jsonb)
  into items
  from public.pharmacy_inventory i
  where i.company_id = target_company_id and i.vessel_id = p_vessel_id and i.active
    and pharmacy_private.dotation_key(i.medical_dotation) = assigned_dotation_key;

  select coalesce(jsonb_agg(r.value order by r.ordinality), '[]'::jsonb) into requirements
  from jsonb_array_elements(pharmacy_private.list_dotation_requirements(p_vessel_id)) with ordinality as r
  where r.value->>'dotation_key' = assigned_dotation_key;

  return jsonb_build_object(
    'issued_on', issued_on, 'vessel_name', vessel.name,
    'registration_number', nullif(btrim(vessel.registration_number), ''), 'imo_number', nullif(btrim(vessel.imo_number), ''),
    'medical_dotation', btrim(coalesce(vessel.medical_dotation, '')),
    'signer_name', signer_name, 'signer_function', coalesce(temporary_function, nullif(btrim(signer.function_label), '')),
    'signature_path', signature_path, 'signature_mime_type', signature_mime_type,
    'items', items, 'requirements', requirements
  );
end;
$$;

create function public.pharmacy_purchase_order_context(p_vessel_id bigint)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select pharmacy_private.purchase_order_context(p_vessel_id);
$$;

revoke all on function pharmacy_private.purchase_order_context(bigint), public.pharmacy_purchase_order_context(bigint)
  from public, anon, authenticated, service_role;
grant execute on function pharmacy_private.purchase_order_context(bigint), public.pharmacy_purchase_order_context(bigint)
  to authenticated;

notify pgrst, 'reload schema';
