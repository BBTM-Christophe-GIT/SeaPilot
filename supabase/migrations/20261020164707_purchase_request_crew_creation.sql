create or replace function public.purchase_request_can_create()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select public.purchase_request_has_company_role(
    public.current_planning_company_id(),
    array['admin', 'direction', 'armement', 'capitaine', 'marin']
  );
$$;

revoke all on function public.purchase_request_can_create() from public, anon;
grant execute on function public.purchase_request_can_create() to authenticated;

comment on function public.purchase_request_can_create() is
  'Autorise les demandes des profils bureau, Capitaine et Marin dans leur entreprise active, avec adhésion active et rôle explicite.';

-- Creation history is written by the secured RPC and cannot be forged by
-- browser roles. It retains ownership even when a vessel is absent or the
-- author's assignment window has ended.
create index if not exists purchase_request_events_creator_idx
  on public.purchase_request_events (actor_user_id, company_id, purchase_request_id)
  where event_type = 'created';

create or replace function public.purchase_request_own_submission_ids()
returns bigint[]
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(array_agg(distinct request.id order by request.id), '{}'::bigint[])
  from public.purchase_request_events event
  join public.purchase_requests request
    on request.id = event.purchase_request_id
   and request.company_id = event.company_id
  where event.event_type = 'created'
    and event.actor_user_id = (select auth.uid())
    and request.company_id = (select public.current_planning_company_id())
    and public.purchase_request_has_company_role(
      request.company_id,
      array['admin', 'direction', 'armement', 'capitaine', 'marin']
    );
$$;

revoke all on function public.purchase_request_own_submission_ids() from public, anon;
grant execute on function public.purchase_request_own_submission_ids() to authenticated;

comment on function public.purchase_request_own_submission_ids() is
  'Demandes soumises par le compte connecté dans son entreprise active, selon les événements de création authentifiés et les règles RLS.';

notify pgrst, 'reload schema';
