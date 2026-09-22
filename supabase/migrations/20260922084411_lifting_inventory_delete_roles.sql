-- Captains may remove inventory from vessels they can access. Restoration
-- remains an office operation, and removal preserves reports and certificates.
create or replace function public.set_lifting_item_active(p_id bigint, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not (
    public.has_any_role(array['admin','direction','armement'])
    or (p_active is false and public.has_any_role(array['capitaine']))
  ) then
    raise exception using errcode='42501',message='Accès refusé.';
  end if;
  if p_active is null then
    raise exception using errcode='22004',message='Le statut du matériel est obligatoire.';
  end if;
  update public.lifting_inventory
    set active=p_active,updated_at=clock_timestamp(),updated_by=auth.uid()
    where id=p_id and coalesce(public.lifting_can_access(company_id,vessel_id),false);
  if not found then
    raise exception using errcode='42501',message='Matériel introuvable ou accès refusé.';
  end if;
end $$;

revoke all on function public.set_lifting_item_active(bigint,boolean) from public,anon;
grant execute on function public.set_lifting_item_active(bigint,boolean) to authenticated;
comment on function public.set_lifting_item_active(bigint,boolean) is
  'Retrait : Admin, Direction, Armement et Capitaine sur leurs navires accessibles. Restauration : Admin, Direction et Armement. Historique conservé.';
