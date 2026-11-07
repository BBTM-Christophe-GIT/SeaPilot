-- The register needs the presence of a reading, along with the fleet's weighted reference rates.
create function sea_operation_private.register_consumption(p_ids uuid[], p_include_vessel_averages boolean) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  company bigint := sea_operation_private.company_id();
  recorded_operations jsonb;
  vessel_averages jsonb := '[]'::jsonb;
begin
  if not coalesce(sea_operation_private.can_read(company), false) then
    raise exception 'Accès refusé aux opérations en mer.' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) > 200 or p_include_vessel_averages is null then
    raise exception 'Sélectionnez au plus 200 opérations par lot.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(operation.id order by operation.id), '[]'::jsonb) into recorded_operations
  from public.sea_operations operation
  join sea_operation_private.consumption reading
    on reading.lineage_id = sea_operation_private.consumption_lineage(operation.id)
    and reading.company_id = operation.company_id and reading.vessel_id = operation.vessel_id
  where operation.id = any(p_ids) and operation.company_id = company
    and operation.status = 'signed' and operation.draft->>'decision' = 'GO'
    and sea_operation_private.record_is_current(operation.id);

  if p_include_vessel_averages then
    select coalesce(jsonb_agg(jsonb_build_object(
      'vesselId', vessel.id, 'towageLitersPerNm', rates.towage, 'otherLitersPerNm', rates.other
    ) order by vessel.id), '[]'::jsonb) into vessel_averages
    from public.vessels vessel
    left join (
      select rate.vessel_id,
        max(rate.fuel_liters / nullif(rate.distance_nm, 0)) filter (where rate.towing) as towage,
        max(rate.fuel_liters / nullif(rate.distance_nm, 0)) filter (where not rate.towing) as other
      from public.project_fuel_vessel_rates rate
      where rate.company_id = company
      group by rate.vessel_id
    ) rates on rates.vessel_id = vessel.id
    where vessel.company_id = company and vessel.active and vessel.asset_kind = 'vessel';
  end if;

  return jsonb_build_object('recordedOperationIds', recorded_operations, 'vesselAverages', vessel_averages);
end;
$$;

create function public.sea_operation_register_consumption(p_ids uuid[], p_include_vessel_averages boolean) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select sea_operation_private.register_consumption(p_ids, p_include_vessel_averages);
$$;

revoke all on function sea_operation_private.register_consumption(uuid[], boolean),
  public.sea_operation_register_consumption(uuid[], boolean) from public, anon, authenticated, service_role;
grant execute on function sea_operation_private.register_consumption(uuid[], boolean),
  public.sea_operation_register_consumption(uuid[], boolean) to authenticated;

notify pgrst, 'reload schema';
