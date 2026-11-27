-- A reference without a stock row can receive a first quantity inline.
-- Serializing with other stock saves prevents two first counts for one article.
create function pharmacy_private.initialize_stock_quantity(p_vessel_id bigint, p_item jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  company bigint := public.current_planning_company_id();
  dotation text;
  branch text;
  article text;
begin
  if not coalesce(pharmacy_private.can_manage(company, p_vessel_id), false) then
    raise exception using errcode = '42501', message = 'Accès refusé à la modification de cet inventaire.';
  end if;
  if p_item is null or jsonb_typeof(p_item) <> 'object' or octet_length(p_item::text) > 20000 then
    raise exception using errcode = '22023', message = 'Contenu de l’article invalide.';
  end if;

  dotation := pharmacy_private.dotation_key(p_item->>'medical_dotation');
  branch := p_item->>'medical_section';
  article := pharmacy_private.designation_key(p_item->>'designation');
  if dotation = '' or nullif(article, '') is null or branch is null or branch not in ('medicines', 'equipment')
      or jsonb_typeof(p_item->'stock_quantity') is distinct from 'number'
      or not coalesce((p_item->>'active')::boolean, true)
      or coalesce((p_item->>'outside_dotation')::boolean, false) then
    raise exception using errcode = '22023', message = 'Renseignez une quantité pour un article actif de la dotation.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pharmacy-catalog:' || company::text, 0));
  if not coalesce(pharmacy_private.can_manage(company, p_vessel_id), false) then
    raise exception using errcode = '42501', message = 'Navire inaccessible.';
  end if;
  if exists (
    select 1 from public.pharmacy_inventory i
    where i.company_id = company and i.vessel_id = p_vessel_id and i.active and not i.outside_dotation
      and i.medical_section = branch and pharmacy_private.dotation_key(i.medical_dotation) = dotation
      and pharmacy_private.designation_key(i.designation) = article
  ) then
    raise exception using errcode = '40001', message = 'Le stock de cet article est déjà renseigné. Actualisez l’inventaire.';
  end if;

  return pharmacy_private.save_item(p_vessel_id, p_item, null, null);
end;
$$;

revoke all on function pharmacy_private.initialize_stock_quantity(bigint, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function pharmacy_private.initialize_stock_quantity(bigint, jsonb) to authenticated;

create or replace function public.save_pharmacy_item(
  p_vessel_id bigint, p_item jsonb, p_id bigint default null, p_revision integer default null
)
returns bigint language plpgsql security invoker set search_path = '' as $$
begin
  if p_id is null and p_item->'initialize_stock_quantity' = 'true'::jsonb then
    return pharmacy_private.initialize_stock_quantity(p_vessel_id, p_item);
  end if;
  return pharmacy_private.save_item(p_vessel_id, p_item, p_id, p_revision);
end;
$$;

notify pgrst, 'reload schema';
