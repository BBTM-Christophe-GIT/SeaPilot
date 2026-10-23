-- Move the same physical item; service generations, documents and report snapshots remain intact.
alter table public.lifting_inventory
  add column assignment_version bigint not null default 1 check (assignment_version > 0);
comment on column public.lifting_inventory.assignment_version is
  'Server-owned vessel assignment generation. Incremented by transfer, independently from physical replacement service_version.';

create function private.transfer_lifting_item(
  p_id bigint, p_source_vessel_id bigint, p_target_vessel_id bigint, p_updated_at timestamptz
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  company bigint := public.current_planning_company_id();
  item public.lifting_inventory%rowtype;
begin
  if actor is null or not exists (
    select 1 from public.company_memberships membership
    join public.companies organization on organization.id = membership.company_id and organization.active
    join public.user_roles permission on permission.company_id = membership.company_id and permission.user_id = membership.user_id
    join auth.users account on account.id = membership.user_id and account.deleted_at is null
      and (account.banned_until is null or account.banned_until <= current_timestamp) and not coalesce(account.is_anonymous, false)
    where membership.company_id = company and membership.user_id = actor and membership.active
      and permission.role_key in ('admin', 'direction', 'armement')
  ) then raise exception using errcode = '42501', message = 'Le transfert est réservé aux profils de gestion de votre société.'; end if;
  if p_id is null or p_id <= 0 or p_source_vessel_id is null or p_source_vessel_id <= 0
    or p_target_vessel_id is null or p_target_vessel_id <= 0 or p_updated_at is null
    or p_source_vessel_id = p_target_vessel_id then
    raise exception using errcode = '22023', message = 'Choisissez un autre navire de destination et rechargez le matériel avant de confirmer.';
  end if;

  select * into item from public.lifting_inventory where id = p_id and company_id = company for update;
  if item.id is null or not coalesce(public.lifting_can_access(company, item.vessel_id), false) then
    raise exception using errcode = '42501', message = 'Matériel introuvable ou accès refusé.';
  end if;
  if item.vessel_id is distinct from p_source_vessel_id or item.updated_at is distinct from p_updated_at then
    raise exception using errcode = '40001', message = 'Ce matériel a été modifié ou transféré. Rechargez son inventaire avant de confirmer.';
  end if;
  if not item.active then raise exception using errcode = '22023', message = 'Restaurez ce matériel retiré avant de le transférer.'; end if;

  -- Stable lock order also prevents a destination being deactivated during the move.
  perform vessel.id from public.vessels vessel where vessel.company_id = company
    and vessel.id in (p_source_vessel_id, p_target_vessel_id) order by vessel.id for share;
  if not exists(select 1 from public.vessels where id = p_source_vessel_id and company_id = company and asset_kind in ('vessel', 'quay'))
    or not exists(select 1 from public.vessels where id = p_target_vessel_id and company_id = company and active and asset_kind = 'vessel')
    or not coalesce(public.lifting_can_access(company, p_target_vessel_id), false) then
    raise exception using errcode = '42501', message = 'Choisissez un navire actif et accessible de la même société.';
  end if;

  -- Reserve an incoming numeric reference against concurrent/later automatic creation.
  if item.reference ~ '^[0-9]+$' then
    if item.reference::numeric <= 9223372036854775806 then
      insert into public.lifting_inventory_counters(company_id, vessel_id, kind, last_number)
        values(company, p_target_vessel_id, item.kind, item.reference::bigint)
        on conflict(company_id, vessel_id, kind) do update
          set last_number = greatest(public.lifting_inventory_counters.last_number, excluded.last_number);
    end if;
  end if;
  if exists(select 1 from public.lifting_inventory where company_id = company and vessel_id = p_target_vessel_id
    and kind = item.kind and reference = item.reference) then
    raise exception using errcode = '23505', message = 'Cette référence existe déjà dans le registre du navire de destination. Faites corriger les références avant le transfert.';
  end if;
  begin
    update public.lifting_inventory set vessel_id = p_target_vessel_id, assignment_version = assignment_version + 1,
      updated_at = clock_timestamp(), updated_by = actor where id = item.id;
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'Cette référence existe déjà dans le registre du navire de destination. Faites corriger les références avant le transfert.';
  end;
  return item.id;
end $$;
revoke all on function private.transfer_lifting_item(bigint, bigint, bigint, timestamptz) from public, anon, authenticated;
grant execute on function private.transfer_lifting_item(bigint, bigint, bigint, timestamptz) to authenticated;

create function public.transfer_lifting_item(
  p_id bigint, p_source_vessel_id bigint, p_target_vessel_id bigint, p_updated_at timestamptz
) returns bigint language sql security invoker set search_path = '' as $$
  select private.transfer_lifting_item(p_id, p_source_vessel_id, p_target_vessel_id, p_updated_at);
$$;
revoke all on function public.transfer_lifting_item(bigint, bigint, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.transfer_lifting_item(bigint, bigint, bigint, timestamptz) to authenticated;

-- Recorded attachments keep their original vessel-prefixed object names. Reading follows the
-- current item's authorized vessel only, never an arbitrary historical prefix or an orphan upload.
create function private.lifting_certificate_transfer_read(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(auth.uid() is not null
    and p_path ~ '^[0-9]+/[0-9]+/[0-9]+/([1-9][0-9]*/)?[0-9a-f-]+[.](pdf|jpg|png)$'
    and exists(select 1 from public.lifting_inventory item
      where item.id::text = split_part(p_path, '/', 3) and item.company_id::text = split_part(p_path, '/', 1)
      and private.can_read_lifting_vessel(item.company_id, item.vessel_id)
      and (item.vessel_id::text = split_part(p_path, '/', 2)
        or exists(select 1 from public.lifting_item_certificates certificate
          where certificate.item_id = item.id and certificate.storage_path = p_path))), false);
$$;
revoke all on function private.lifting_certificate_transfer_read(text) from public, anon, authenticated;
grant execute on function private.lifting_certificate_transfer_read(text) to authenticated;
create or replace function public.lifting_certificate_path_access(p_path text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.lifting_certificate_transfer_read(p_path);
$$;
revoke all on function public.lifting_certificate_path_access(text) from public, anon, authenticated;
grant execute on function public.lifting_certificate_path_access(text) to authenticated;
-- Keep lifting_certificate_path_upload and its original write-scope helper unchanged:
-- all new uploads must use the item's current vessel and the allowed service generation.

create or replace function public.lifting_update_visit_after_publication() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.lifting_inventory item set last_control_on = greatest(item.last_control_on, new.issued_on)
    from public.lifting_inspection_entries entry where entry.inspection_id = new.id and entry.item_id = item.id
    and entry.condition not in ('pending', 'not_present')
    and item.company_id = new.company_id and item.vessel_id = new.vessel_id
    and coalesce((entry.item_snapshot->>'assignment_version')::bigint, 1) = item.assignment_version
    and coalesce((entry.item_snapshot->>'service_version')::integer, 1) = item.service_version
    and (item.replaced_on is null or new.issued_on >= item.replaced_on);
  return new;
end $$;
revoke all on function public.lifting_update_visit_after_publication() from public, anon, authenticated;
notify pgrst, 'reload schema';
