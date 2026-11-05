-- Keep the existing locations RPC available for older SeaPilot clients.
create function private.work_permit_locations_with_lengths()
returns table (id bigint, name text, asset_kind text, can_sign boolean, length_overall text)
language sql stable security definer set search_path = ''
as $$
  select location.id, location.name, location.asset_kind, location.can_sign, vessel.length_overall
  from private.work_permit_locations() location
  join public.vessels vessel on vessel.id = location.id;
$$;

create function public.list_work_permit_locations_with_lengths()
returns table (id bigint, name text, asset_kind text, can_sign boolean, length_overall text)
language sql stable security invoker set search_path = ''
as $$ select * from private.work_permit_locations_with_lengths(); $$;

create function private.delete_work_permit(p_permit_id uuid, p_expected_updated_at timestamptz)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  active_company_id bigint := public.current_planning_company_id();
  target_updated_at timestamptz;
begin
  if auth.uid() is null
    or not public.has_company_role(active_company_id, array['admin'])
  then
    raise exception 'La suppression d’un permis est réservée à l’administration.' using errcode = '42501';
  end if;

  select permit.updated_at into target_updated_at
  from public.qhse_work_permits permit
  where permit.id = p_permit_id and permit.company_id = active_company_id
    and permit.vessel_id in (select location.id from private.work_permit_locations() location)
  for update;

  if not found then
    raise exception 'Ce permis est inaccessible.' using errcode = '42501';
  end if;
  if target_updated_at is distinct from p_expected_updated_at then
    raise exception 'Le permis a été modifié. Actualisez-le avant de le supprimer.' using errcode = '40001';
  end if;

  delete from public.qhse_work_permits where id = p_permit_id and company_id = active_company_id;
end;
$$;

create function public.delete_work_permit(p_permit_id uuid, p_expected_updated_at timestamptz)
returns void
language sql security invoker set search_path = ''
as $$ select private.delete_work_permit(p_permit_id, p_expected_updated_at); $$;

revoke all on function private.work_permit_locations_with_lengths(),
  public.list_work_permit_locations_with_lengths(),
  private.delete_work_permit(uuid, timestamptz), public.delete_work_permit(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function private.work_permit_locations_with_lengths(),
  public.list_work_permit_locations_with_lengths(),
  private.delete_work_permit(uuid, timestamptz), public.delete_work_permit(uuid, timestamptz)
  to authenticated;

notify pgrst, 'reload schema';
