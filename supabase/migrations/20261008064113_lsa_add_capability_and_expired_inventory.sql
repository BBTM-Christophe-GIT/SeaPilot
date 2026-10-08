-- The browser and inventory RLS use the same guarded creation capability as save/numbering.
create function private.lsa_can_add_item(p_vessel_id bigint) returns boolean
language sql stable security definer set search_path='' as $$
  select private.can_access_lsa_vessel(public.current_planning_company_id(),p_vessel_id);
$$;
revoke all on function private.lsa_can_add_item(bigint) from public,anon;
grant execute on function private.lsa_can_add_item(bigint) to authenticated;

create function public.lsa_can_add_item(p_vessel_id bigint) returns boolean
language sql stable security invoker set search_path='' as $$
  select private.lsa_can_add_item(p_vessel_id);
$$;
revoke all on function public.lsa_can_add_item(bigint) from public,anon;
grant execute on function public.lsa_can_add_item(bigint) to authenticated;

-- Current vessel access includes expired equipment. Preserve the previous historical scope.
alter policy lsa_items_read on public.lsa_items using (
  (select private.lsa_has_access())
  and company_id=(select public.current_planning_company_id())
  and (
    public.planning_can_read_row(company_id,vessel_id,null,coalesce(issued_on,current_date),coalesce(expires_on,current_date))
    or public.lsa_can_add_item(vessel_id)
  )
);

notify pgrst,'reload schema';
