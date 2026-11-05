set local lock_timeout = '4s';

-- The same vessel permission applies to every inventory row and control for
-- that company and vessel. Evaluate it once per vessel in each policy query.
create function pharmacy_private.readable_vessels()
returns table(company_id bigint, vessel_id bigint)
language sql stable security definer set search_path = '' as $$
  select v.company_id, v.id
  from public.vessels v
  where (select auth.uid()) is not null
    and v.active
    and v.asset_kind = 'vessel'
    and pharmacy_private.can_access(v.company_id, v.id);
$$;

revoke all on function pharmacy_private.readable_vessels() from public, anon, authenticated;
grant execute on function pharmacy_private.readable_vessels() to authenticated;

alter policy pharmacy_inventory_read on public.pharmacy_inventory
  using ((company_id, vessel_id) in (select company_id, vessel_id from pharmacy_private.readable_vessels()));

alter policy pharmacy_controls_read on public.pharmacy_controls
  using ((company_id, vessel_id) in (select company_id, vessel_id from pharmacy_private.readable_vessels()));
