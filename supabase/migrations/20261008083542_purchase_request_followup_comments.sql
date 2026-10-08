-- Follow-up comments share the existing append-only purchase request history.
alter table public.purchase_request_events
  drop constraint if exists purchase_request_events_type_check;

alter table public.purchase_request_events
  add constraint purchase_request_events_type_check check (event_type in (
    'created', 'taken_in_charge', 'delivery_planned', 'received',
    'approved', 'refused', 'information_requested', 'attachment_added', 'comment_added'
  ));

-- A history row must belong to an accessible request in the same company.
drop policy if exists purchase_request_events_read on public.purchase_request_events;
create policy purchase_request_events_read on public.purchase_request_events
for select to authenticated
using (
  public.purchase_request_has_company_role(
    company_id, array['admin', 'direction', 'armement', 'capitaine', 'marin']
  )
  and exists (
    select 1 from public.purchase_requests request
    where request.id = purchase_request_events.purchase_request_id
      and request.company_id = purchase_request_events.company_id
  )
);

-- The privileged writer is outside the Data API's exposed schemas. The public
-- invoker below checks the request's actual SELECT/RLS access before calling it.
create schema if not exists purchase_request_private;
revoke all on schema purchase_request_private from public, anon, authenticated;
grant usage on schema purchase_request_private to authenticated;

create or replace function purchase_request_private.add_comment(
  p_request_id bigint,
  p_comment text
)
returns public.purchase_request_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.purchase_requests;
  added_event public.purchase_request_events;
  actor_id uuid := auth.uid();
  trimmed_comment text := regexp_replace(coalesce(p_comment, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
begin
  if actor_id is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  select request.* into target
  from public.purchase_requests request
  where request.id = p_request_id
    and public.purchase_request_has_company_role(
      request.company_id, array['admin', 'direction', 'armement', 'capitaine', 'marin']
    )
  for key share;

  if not found then
    raise exception 'Demande introuvable ou inaccessible.' using errcode = 'P0002';
  end if;
  if trimmed_comment = '' then
    raise exception 'Le commentaire est obligatoire.' using errcode = '22023';
  end if;
  if char_length(trimmed_comment) > 4000 then
    raise exception 'Le commentaire ne peut pas dépasser 4 000 caractères.' using errcode = '22023';
  end if;

  insert into public.purchase_request_events (
    company_id, purchase_request_id, event_type, status_label,
    actor_user_id, actor_name, comment, created_at
  ) values (
    target.company_id, target.id, 'comment_added', 'Commentaire de suivi',
    actor_id, public.purchase_request_actor_name(), trimmed_comment, clock_timestamp()
  ) returning * into added_event;

  return added_event;
end;
$$;

create or replace function public.purchase_request_add_comment(
  p_request_id bigint,
  p_comment text
)
returns public.purchase_request_events
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.purchase_requests where id = p_request_id) then
    raise exception 'Demande introuvable ou inaccessible.' using errcode = 'P0002';
  end if;

  return purchase_request_private.add_comment(p_request_id, p_comment);
end;
$$;

revoke all on function purchase_request_private.add_comment(bigint, text) from public, anon;
revoke all on function public.purchase_request_add_comment(bigint, text) from public, anon;
grant execute on function purchase_request_private.add_comment(bigint, text) to authenticated;
grant execute on function public.purchase_request_add_comment(bigint, text) to authenticated;

-- Browser roles cannot forge, rewrite, or remove author/timestamp/history rows.
revoke insert, update, delete on public.purchase_request_events from public, anon, authenticated;

comment on function public.purchase_request_add_comment(bigint, text) is
  'Ajoute un commentaire de suivi horodaté et signé par le serveur, sans modifier le workflow de la demande.';
