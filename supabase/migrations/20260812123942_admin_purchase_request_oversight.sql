create or replace function public.purchase_request_has_company_role(
  target_company_id bigint,
  required_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_company_id is not null
    and (select auth.uid()) is not null
    and exists (
      select 1
      from public.user_roles role_assignment
      join public.company_memberships membership
        on membership.company_id = role_assignment.company_id
       and membership.user_id = role_assignment.user_id
       and membership.active
      where role_assignment.user_id = (select auth.uid())
        and role_assignment.company_id = target_company_id
        and role_assignment.role_key = any(required_roles)
    )
$$;

comment on function public.purchase_request_has_company_role(bigint, text[]) is
  'Checks purchase-request access against the role assignment company instead of the currently selected company.';

revoke all on function public.purchase_request_has_company_role(bigint, text[]) from public, anon;
grant execute on function public.purchase_request_has_company_role(bigint, text[]) to authenticated;

drop policy if exists purchase_requests_role_read on public.purchase_requests;
create policy purchase_requests_role_read on public.purchase_requests
for select to authenticated
using (
  public.purchase_request_has_company_role(
    company_id,
    array['admin', 'direction', 'armement', 'capitaine', 'marin']
  )
);

drop policy if exists purchase_requests_office_write on public.purchase_requests;
create policy purchase_requests_office_write on public.purchase_requests
for all to authenticated
using (
  public.purchase_request_has_company_role(company_id, array['admin', 'direction', 'armement'])
)
with check (
  public.purchase_request_has_company_role(company_id, array['admin', 'direction', 'armement'])
);

drop policy if exists purchase_request_attachments_read on public.purchase_request_attachments;
create policy purchase_request_attachments_read on public.purchase_request_attachments
for select to authenticated
using (
  public.purchase_request_has_company_role(
    company_id,
    array['admin', 'direction', 'armement', 'capitaine', 'marin']
  )
);

drop policy if exists purchase_request_events_read on public.purchase_request_events;
create policy purchase_request_events_read on public.purchase_request_events
for select to authenticated
using (
  public.purchase_request_has_company_role(
    company_id,
    array['admin', 'direction', 'armement', 'capitaine', 'marin']
  )
);

create or replace function public.purchase_request_transition(
  p_request_id bigint,
  p_action text,
  p_comment text default null,
  p_effective_date date default null
)
returns public.purchase_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.purchase_requests;
  actor_name text := public.purchase_request_actor_name();
  event_name text;
  event_status text;
begin
  select request.* into target
  from public.purchase_requests request
  where request.id = p_request_id
    and public.purchase_request_has_company_role(
      request.company_id,
      array['admin', 'direction', 'armement', 'capitaine']
    )
  for update;

  if not found then
    raise exception 'Demande introuvable ou inaccessible.' using errcode = 'P0002';
  end if;

  case p_action
    when 'take_charge' then
      update public.purchase_requests
      set owner_name = actor_name,
          status = 'Commandes en cours',
          updated_at = now()
      where id = p_request_id returning * into target;
      event_name := 'taken_in_charge'; event_status := 'Prise en charge';
    when 'plan_delivery' then
      if p_effective_date is null then
        raise exception 'La date de livraison est obligatoire.' using errcode = '22023';
      end if;
      update public.purchase_requests
      set expected_delivery_on = p_effective_date,
          status = 'Commandes en cours',
          owner_name = coalesce(owner_name, actor_name),
          updated_at = now()
      where id = p_request_id returning * into target;
      event_name := 'delivery_planned'; event_status := 'Livraison planifiée';
    when 'mark_received' then
      update public.purchase_requests
      set received_on = coalesce(p_effective_date, current_date),
          status = 'Commandes traitées',
          updated_at = now()
      where id = p_request_id returning * into target;
      event_name := 'received'; event_status := 'Reçu à bord';
    when 'approve' then
      update public.purchase_requests
      set approval_status = 'Demande acceptée', approval_reason = null,
          approver_name = actor_name, updated_at = now()
      where id = p_request_id returning * into target;
      event_name := 'approved'; event_status := 'Approuvée';
    when 'refuse' then
      if coalesce(btrim(p_comment), '') = '' then
        raise exception 'La justification du refus est obligatoire.' using errcode = '22023';
      end if;
      update public.purchase_requests
      set approval_status = 'Demande refusée', approval_reason = btrim(p_comment),
          approver_name = actor_name, updated_at = now()
      where id = p_request_id returning * into target;
      event_name := 'refused'; event_status := 'Refusée';
    when 'request_information' then
      if coalesce(btrim(p_comment), '') = '' then
        raise exception 'Le complément demandé est obligatoire.' using errcode = '22023';
      end if;
      update public.purchase_requests
      set approval_status = 'Complément demandé', approval_reason = btrim(p_comment),
          approver_name = actor_name, updated_at = now()
      where id = p_request_id returning * into target;
      event_name := 'information_requested'; event_status := 'Complément demandé';
    else
      raise exception 'Action de traitement inconnue.' using errcode = '22023';
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

revoke all on function public.purchase_request_transition(bigint, text, text, date) from public, anon;
grant execute on function public.purchase_request_transition(bigint, text, text, date) to authenticated;

comment on function public.purchase_request_transition(bigint, text, text, date) is
  'Transitions métier sécurisées par entreprise de rôle, avec intervention administrateur et traçabilité.';
