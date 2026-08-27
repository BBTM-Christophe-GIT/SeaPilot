create or replace function public.action_item_treat(
  p_action_id bigint,
  p_comments text default null,
  p_realized_action text default null,
  p_close_action boolean default false,
  p_closure_photo_path text default null
)
returns public.action_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.action_items;
  normalized_status text;
  requested_closure_photo_path text := nullif(btrim(p_closure_photo_path), '');
begin
  if auth.uid() is null
     or not public.has_any_role(array['admin', 'direction', 'armement', 'capitaine']) then
    raise exception 'Vous ne pouvez pas traiter cette action.' using errcode = '42501';
  end if;

  select action.* into target
  from public.action_items action
  where action.id = p_action_id
    and action.company_id = public.current_planning_company_id()
  for update;

  if not found then
    raise exception 'Action introuvable ou inaccessible.' using errcode = 'P0002';
  end if;

  normalized_status := public.normalize_import_label(target.status);
  if target.closed_on is not null
     or (
       normalized_status not like '%non sold%'
       and normalized_status not like '%a traiter%'
       and (
         normalized_status like '%sold%'
         or normalized_status like '%clos%'
         or normalized_status like '%termin%'
       )
     ) then
    raise exception 'Une action soldée ne peut plus être traitée.' using errcode = '55000';
  end if;

  if requested_closure_photo_path is distinct from target.closure_photo_path
     and requested_closure_photo_path is not null
     and requested_closure_photo_path not like target.company_id::text || '/' || target.id::text || '/cloture-%' then
    raise exception 'Le chemin de la photo de clôture est invalide.' using errcode = '22023';
  end if;

  update public.action_items
  set comments = nullif(btrim(p_comments), ''),
      realized_action = nullif(btrim(p_realized_action), ''),
      closure_photo_path = coalesce(requested_closure_photo_path, target.closure_photo_path),
      status = case when p_close_action then 'Ecart Soldé' else coalesce(nullif(target.status, ''), 'Ecart Non Soldé') end,
      closed_on = case when p_close_action then current_date else target.closed_on end
  where id = target.id
  returning * into target;

  return target;
end;
$$;

revoke all on function public.action_item_treat(bigint, text, text, boolean, text)
  from public, anon;
grant execute on function public.action_item_treat(bigint, text, text, boolean, text)
  to authenticated;

drop policy if exists action_plan_evidence_storage_insert on storage.objects;
create policy action_plan_evidence_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'action-plan-evidence'
  and split_part(name, '/', 1) = public.current_planning_company_id()::text
  and public.has_any_role(array['admin', 'direction', 'armement', 'capitaine'])
);

comment on function public.action_item_treat(bigint, text, text, boolean, text) is
  'Updates only treatment fields on an open action for office roles and Capitaines in the active company.';
