-- Keep calibrated archive and Project rates, and use confirmed live passages for the other vessels.
create function sea_operation_private.register_vessel_consumption_averages(p_company bigint) returns jsonb
language sql stable set search_path = '' as $$
  with live_candidates as (
    select reading.lineage_id, reading.vessel_id, reading.actual_period, reading.updated_at,
      (operation.draft#>>'{applicability,towing}') = 'yes' as towing,
      (reading.results->>'distanceNm')::numeric as distance_nm,
      (reading.results->>'consumedLiters')::numeric as fuel_liters,
      exists (
        select 1 from public.vessel_fuel_reference_samples existing
        where existing.company_id = p_company and existing.vessel_id = reading.vessel_id
          and existing.source_key = 'sea-operation:' || reading.lineage_id::text
      ) as represented
    from public.sea_operations operation
    join sea_operation_private.consumption reading
      on reading.lineage_id = sea_operation_private.consumption_lineage(operation.id)
      and reading.company_id = operation.company_id and reading.vessel_id = operation.vessel_id
    where operation.company_id = p_company and operation.status = 'signed' and operation.draft->>'decision' = 'GO'
      and sea_operation_private.record_is_current(operation.id)
      and operation.draft#>>'{applicability,towing}' in ('yes', 'no')
      and sea_operation_private.consumption_calibration(operation)->>'kind' not in ('rozel', 'suroit')
      and reading.actual_period is not null and reading.inputs->'completed' = 'true'::jsonb
      and (reading.results->>'distanceNm')::numeric > 0 and (reading.results->>'consumedLiters')::numeric >= 0
  ), totals as (
    select rate.vessel_id, rate.towing, rate.distance_nm, rate.fuel_liters
    from public.project_fuel_vessel_rates rate where rate.company_id = p_company
    union all
    select live.vessel_id, live.towing, live.distance_nm, live.fuel_liters
    from live_candidates live
    -- Give existing references precedence, then keep the latest overlapping live confirmation.
    where not live.represented and not exists (
      select 1 from live_candidates newer where newer.vessel_id = live.vessel_id
        and newer.actual_period && live.actual_period
        and (newer.represented or (newer.updated_at, newer.lineage_id) > (live.updated_at, live.lineage_id))
    )
  ), rates as (
    select vessel_id,
      sum(fuel_liters) filter (where towing) / nullif(sum(distance_nm) filter (where towing), 0) as towage,
      sum(fuel_liters) filter (where not towing) / nullif(sum(distance_nm) filter (where not towing), 0) as other
    from totals group by vessel_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'vesselId', vessel.id, 'towageLitersPerNm', rates.towage, 'otherLitersPerNm', rates.other
  ) order by vessel.id), '[]'::jsonb)
  from public.vessels vessel left join rates on rates.vessel_id = vessel.id
  where vessel.company_id = p_company and vessel.active and vessel.asset_kind = 'vessel';
$$;

revoke all on function sea_operation_private.register_vessel_consumption_averages(bigint)
from public, anon, authenticated, service_role;

create or replace function sea_operation_private.register_consumption(p_ids uuid[], p_include_vessel_averages boolean) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  company bigint := sea_operation_private.company_id();
  recorded_operations jsonb;
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

  return jsonb_build_object('recordedOperationIds', recorded_operations, 'vesselAverages',
    case when p_include_vessel_averages then sea_operation_private.register_vessel_consumption_averages(company) else '[]'::jsonb end);
end;
$$;

notify pgrst, 'reload schema';
