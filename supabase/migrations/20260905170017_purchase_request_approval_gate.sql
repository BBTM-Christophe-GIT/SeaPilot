alter table public.purchase_requests
  alter column status set default 'À traiter',
  alter column approval_status set default 'En attente';

create or replace function public.purchase_request_create(p_payload jsonb)
returns public.purchase_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_request public.purchase_requests;
  target_vessel public.vessels;
  actor_name text := public.purchase_request_actor_name();
  target_vessel_id bigint := nullif(p_payload ->> 'vessel_id', '')::bigint;
begin
  if not public.purchase_request_can_create() then
    raise exception 'Vous ne pouvez pas créer de demande d''achat.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_payload ->> 'title'), '') = '' then
    raise exception 'La désignation est obligatoire.' using errcode = '22023';
  end if;

  if target_vessel_id is not null then
    select * into target_vessel
    from public.vessels
    where id = target_vessel_id
      and company_id = public.current_planning_company_id()
      and active;
    if not found then
      raise exception 'Navire invalide.' using errcode = '22023';
    end if;
  end if;

  insert into public.purchase_requests (
    company_id, request_number, title, requested_on, requester_name, supplier_name,
    vessel_id, vessel_name, reference, quantity, unit_label, unit_price_ht, amount_ht,
    currency, status, description, urgent, urgency_reason, delivery_location,
    delivery_details, expected_delivery_on, rebilling_label, category_label, website_url,
    approval_status, source_label
  ) values (
    public.current_planning_company_id(),
    nullif(btrim(p_payload ->> 'request_number'), ''),
    btrim(p_payload ->> 'title'),
    coalesce(nullif(p_payload ->> 'requested_on', '')::date, current_date),
    coalesce(nullif(btrim(p_payload ->> 'requester_name'), ''), actor_name),
    nullif(btrim(p_payload ->> 'supplier_name'), ''),
    target_vessel_id,
    target_vessel.name,
    nullif(btrim(p_payload ->> 'reference'), ''),
    nullif(p_payload ->> 'quantity', '')::numeric,
    nullif(btrim(p_payload ->> 'unit_label'), ''),
    nullif(p_payload ->> 'unit_price_ht', '')::numeric,
    nullif(p_payload ->> 'amount_ht', '')::numeric,
    coalesce(nullif(btrim(p_payload ->> 'currency'), ''), 'EUR'),
    'À traiter',
    nullif(btrim(p_payload ->> 'description'), ''),
    coalesce((p_payload ->> 'urgent')::boolean, false),
    nullif(btrim(p_payload ->> 'urgency_reason'), ''),
    nullif(btrim(p_payload ->> 'delivery_location'), ''),
    nullif(btrim(p_payload ->> 'delivery_details'), ''),
    nullif(p_payload ->> 'expected_delivery_on', '')::date,
    nullif(btrim(p_payload ->> 'rebilling_label'), ''),
    nullif(btrim(p_payload ->> 'category_label'), ''),
    nullif(btrim(p_payload ->> 'website_url'), ''),
    'En attente',
    'seapilot'
  ) returning * into created_request;

  if created_request.request_number is null then
    update public.purchase_requests
    set request_number = created_request.id::text
    where id = created_request.id
    returning * into created_request;
  end if;

  insert into public.purchase_request_events (
    company_id, purchase_request_id, event_type, status_label,
    actor_user_id, actor_name, comment, effective_on
  ) values (
    created_request.company_id, created_request.id, 'created', 'Demande créée',
    auth.uid(), actor_name, created_request.description, created_request.requested_on
  );

  return created_request;
end;
$$;

revoke all on function public.purchase_request_create(jsonb) from public, anon;
grant execute on function public.purchase_request_create(jsonb) to authenticated;

create or replace function public.purchase_request_transition(
  p_request_id bigint,
  p_action text,
  p_comment text default null,
  p_effective_date date default null
)
returns public.purchase_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.purchase_requests;
  actor_name text := public.purchase_request_actor_name();
  event_name text;
  event_status text;
  normalized_status text;
  normalized_approval text;
  is_to_process boolean;
  is_approved boolean;
begin
  select request.* into target
  from public.purchase_requests request
  where request.id = p_request_id
    and public.purchase_request_has_company_role(
      request.company_id,
      array['admin', 'direction', 'armement', 'capitaine', 'marin']
    )
  for update;

  if not found then
    raise exception 'Demande introuvable ou inaccessible.' using errcode = 'P0002';
  end if;

  if p_action = any(array['approve', 'refuse', 'request_information']) then
    if not public.purchase_request_has_company_role(
      target.company_id,
      array['admin', 'direction', 'armement']
    ) then
      raise exception 'Seuls les profils Administrateur, Direction et Armement peuvent décider de cette demande.'
        using errcode = '42501';
    end if;
  elsif p_action = any(array['take_charge', 'plan_delivery', 'mark_received']) then
    if not public.purchase_request_has_company_role(
      target.company_id,
      array['admin', 'direction', 'armement', 'capitaine', 'marin']
    ) then
      raise exception 'Vous ne pouvez pas traiter cette demande.' using errcode = '42501';
    end if;
  else
    raise exception 'Action de traitement inconnue.' using errcode = '22023';
  end if;

  normalized_status := coalesce(public.normalize_import_label(target.status), '');
  normalized_approval := coalesce(public.normalize_import_label(target.approval_status), '');
  is_to_process := normalized_status = ''
    or normalized_status like '%a traiter%'
    or normalized_status like '%à traiter%'
    or (normalized_status like '%approbation%' and normalized_status like '%attente%');
  is_approved := normalized_approval like '%accep%'
    or normalized_approval like '%approuv%';

  case p_action
    when 'approve' then
      if not is_to_process
         or not (
           normalized_approval = ''
           or normalized_approval like '%attente%'
           or normalized_approval like '%compl%'
         ) then
        raise exception 'Cette demande ne peut plus être approuvée.' using errcode = '55000';
      end if;
      update public.purchase_requests
      set approval_status = 'Demande acceptée',
          approval_reason = null,
          approver_name = actor_name,
          updated_at = now()
      where id = p_request_id returning * into target;
      event_name := 'approved';
      event_status := 'Approuvée';
    when 'refuse' then
      if coalesce(btrim(p_comment), '') = '' then
        raise exception 'La justification du refus est obligatoire.' using errcode = '22023';
      end if;
      if not is_to_process
         or not (
           normalized_approval = ''
           or normalized_approval like '%attente%'
           or normalized_approval like '%compl%'
         ) then
        raise exception 'Cette demande ne peut plus être refusée.' using errcode = '55000';
      end if;
      update public.purchase_requests
      set approval_status = 'Demande refusée',
          approval_reason = btrim(p_comment),
          approver_name = actor_name,
          updated_at = now()
      where id = p_request_id returning * into target;
      event_name := 'refused';
      event_status := 'Refusée';
    when 'request_information' then
      if coalesce(btrim(p_comment), '') = '' then
        raise exception 'Le complément demandé est obligatoire.' using errcode = '22023';
      end if;
      if not is_to_process
         or not (
           normalized_approval = ''
           or normalized_approval like '%attente%'
           or normalized_approval like '%compl%'
         ) then
        raise exception 'Un complément ne peut plus être demandé pour cette demande.' using errcode = '55000';
      end if;
      update public.purchase_requests
      set approval_status = 'Complément demandé',
          approval_reason = btrim(p_comment),
          approver_name = actor_name,
          updated_at = now()
      where id = p_request_id returning * into target;
      event_name := 'information_requested';
      event_status := 'Complément demandé';
    when 'take_charge' then
      if not is_to_process then
        raise exception 'Seule une demande à traiter peut être prise en charge.' using errcode = '55000';
      end if;
      if not is_approved then
        raise exception 'La demande doit être approuvée avant sa prise en charge.' using errcode = '55000';
      end if;
      update public.purchase_requests
      set owner_name = actor_name,
          ordered_on = coalesce(ordered_on, current_date),
          status = 'En commande',
          updated_at = now()
      where id = p_request_id returning * into target;
      event_name := 'taken_in_charge';
      event_status := 'Prise en charge';
    when 'plan_delivery' then
      if p_effective_date is null then
        raise exception 'La date de livraison est obligatoire.' using errcode = '22023';
      end if;
      if not is_approved
         or not (
           normalized_status = 'en commande'
           or normalized_status like '%commande%cours%'
           or normalized_status like '%commandes en cours%'
         ) then
        raise exception 'La livraison ne peut être planifiée qu’après la prise en charge.' using errcode = '55000';
      end if;
      update public.purchase_requests
      set expected_delivery_on = p_effective_date,
          status = 'À réception',
          owner_name = coalesce(owner_name, actor_name),
          updated_at = now()
      where id = p_request_id returning * into target;
      event_name := 'delivery_planned';
      event_status := 'Livraison planifiée';
    when 'mark_received' then
      if not is_approved
         or not (
           normalized_status like '%reception%'
           or normalized_status like '%réception%'
         ) then
        raise exception 'La réception ne peut être confirmée qu’après sa planification.' using errcode = '55000';
      end if;
      update public.purchase_requests
      set received_on = coalesce(p_effective_date, current_date),
          status = 'Traitée',
          updated_at = now()
      where id = p_request_id returning * into target;
      event_name := 'received';
      event_status := 'Reçu à bord';
  end case;

  insert into public.purchase_request_events (
    company_id, purchase_request_id, event_type, status_label,
    actor_user_id, actor_name, comment, effective_on
  ) values (
    target.company_id, target.id, event_name, event_status,
    auth.uid(), actor_name, nullif(btrim(p_comment), ''),
    coalesce(p_effective_date, current_date)
  );

  return target;
end;
$$;

revoke all on function public.purchase_request_transition(bigint, text, text, date)
  from public, anon;
grant execute on function public.purchase_request_transition(bigint, text, text, date)
  to authenticated;

comment on function public.purchase_request_create(jsonb) is
  'Crée une demande au statut À traiter avec une décision en attente.';
comment on function public.purchase_request_transition(bigint, text, text, date) is
  'Applique le workflow approbation obligatoire puis traitement logistique, avec décisions réservées aux profils bureau.';
