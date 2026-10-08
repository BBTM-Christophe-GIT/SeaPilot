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

  if p_action = 'approve' then
    if not public.purchase_request_has_company_role(
      target.company_id,
      array['admin', 'direction', 'armement', 'marin']
    ) then
      raise exception 'Vous ne pouvez pas approuver cette demande.' using errcode = '42501';
    end if;
  elsif p_action = any(array['refuse', 'request_information']) then
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

comment on function public.purchase_request_transition(bigint, text, text, date) is
  'Applique le workflow approbation obligatoire puis traitement logistique, avec approbation ouverte au profil Marin et refus réservé aux profils bureau.';
