-- Compare completed voyages by Paris arrival month. Cost uses the saved voyage cost.
create or replace function sea_operation_private.register_vessel_consumption_averages(p_company bigint) returns jsonb
language sql stable set search_path = '' as $$
  with bounds as (
    select date_trunc('month', local_today)::date as current_month,
      (date_trunc('month', local_today) - interval '1 month')::date as previous_month,
      local_today as today, '{"litersPerNm":null,"costPerNm":null}'::jsonb as empty_period
    from (select (now() at time zone 'Europe/Paris')::date as local_today) clock
  ), legacy_vessels as (
    select vessel.id as vessel_id, legacy.history_key, legacy.coverage_end
    from public.vessels vessel join public.companies company on company.id = vessel.company_id
    join (values
      ('937905', '228098070', 'rozel', date '2026-11-05'),
      ('926637', '227779340', 'suroit', date '2026-10-02')
    ) legacy(registration_number, mmsi, history_key, coverage_end)
      on legacy.registration_number = vessel.registration_number and legacy.mmsi = vessel.mmsi
    where company.id = p_company and company.code = 'bbtm' and vessel.asset_kind = 'vessel'
  ), archive_cells as (
    select legacy.vessel_id, legacy.history_key, row_data.entry->'cells' as cells,
      row_data.ordinality as source_order
    from legacy_vessels legacy
    join sea_operation_private.consumption_history history on history.company_id = p_company
    cross join lateral jsonb_array_elements(history.data->legacy.history_key) with ordinality row_data(entry, ordinality)
  ), archive_values as (
    select vessel_id, source_order, lower(btrim(cells->>5)) as towing_flag,
      nullif(lower(btrim(cells->>0)), '') as departure_port, nullif(lower(btrim(cells->>1)), '') as arrival_port,
      case when jsonb_typeof(cells->2) = 'number' then (cells->>2)::numeric end as distance_nm,
      case when jsonb_typeof(cells->3) = 'number' then (cells->>3)::numeric end as departure_serial,
      case when jsonb_typeof(cells->4) = 'number' then (cells->>4)::numeric end as arrival_serial,
      case when jsonb_typeof(cells->8) = 'number' then (cells->>8)::numeric end as departure_gauge,
      case when jsonb_typeof(cells->(case when history_key = 'rozel' then 10 else 9 end)) = 'number'
        then (cells->>(case when history_key = 'rozel' then 10 else 9 end))::numeric end as arrival_gauge,
      case when history_key = 'rozel' then 1 else 1000 end as max_gauge,
      case when jsonb_typeof(cells->12) = 'number' then (cells->>12)::numeric end as fuel_liters,
      case when jsonb_typeof(cells->15) = 'number' then (cells->>15)::numeric end as cost_euros
    from archive_cells
  ), archive_coverage as (
    select archive.vessel_id, max(date '1899-12-30' + floor(archive.arrival_serial)::integer) as coverage_end
    from archive_values archive cross join bounds
    where archive.arrival_serial >= 61 and archive.arrival_serial < bounds.today - date '1899-12-30' + 1
    group by archive.vessel_id
  ), archive_voyages as (
    select distinct on (archive.vessel_id, archive.departure_serial, archive.arrival_serial)
      archive.vessel_id, archive.towing_flag = 'oui' as towing,
      date '1899-12-30' + floor(archive.arrival_serial)::integer as arrival_day,
      archive.distance_nm, archive.fuel_liters, case when archive.cost_euros > 0 then archive.cost_euros end as cost_euros
    from archive_values archive cross join bounds
    where archive.towing_flag in ('oui', 'non') and archive.departure_port <> archive.arrival_port
      and archive.departure_serial >= 61 and archive.departure_serial < archive.arrival_serial
      and archive.arrival_serial >= bounds.previous_month - date '1899-12-30'
      and archive.arrival_serial < bounds.today - date '1899-12-30' + 1
      and archive.departure_gauge between 0 and archive.max_gauge and archive.arrival_gauge between 0 and archive.departure_gauge
      and archive.distance_nm >= 10 and archive.fuel_liters > 0
    order by archive.vessel_id, archive.departure_serial, archive.arrival_serial, archive.source_order desc
  ), live_candidates as (
    select reading.lineage_id, reading.vessel_id, reading.actual_period, reading.updated_at,
      legacy.vessel_id is not null as legacy,
      (upper(reading.actual_period) at time zone 'Europe/Paris')::date as arrival_day,
      (operation.draft#>>'{applicability,towing}') = 'yes' as towing,
      (reading.results->>'distanceNm')::numeric as distance_nm,
      (reading.results->>'consumedLiters')::numeric as fuel_liters,
      (reading.results->>'costEuros')::numeric as cost_euros,
      exists (
        select 1 from public.vessel_fuel_reference_samples existing
        where existing.company_id = p_company and existing.vessel_id = reading.vessel_id
          and existing.source_key = 'sea-operation:' || reading.lineage_id::text
      ) as represented
    from public.sea_operations operation
    join sea_operation_private.consumption reading
      on reading.lineage_id = sea_operation_private.consumption_lineage(operation.id)
      and reading.company_id = operation.company_id and reading.vessel_id = operation.vessel_id
    left join legacy_vessels legacy on legacy.vessel_id = operation.vessel_id
    left join archive_coverage on archive_coverage.vessel_id = operation.vessel_id
    where operation.company_id = p_company and operation.status = 'signed' and operation.draft->>'decision' = 'GO'
      and sea_operation_private.record_is_current(operation.id)
      and operation.draft#>>'{applicability,towing}' in ('yes', 'no')
      and reading.actual_period is not null and reading.inputs->'completed' = 'true'::jsonb
      and (reading.results->>'distanceNm')::numeric > 0 and (reading.results->>'consumedLiters')::numeric >= 0
      and (legacy.coverage_end is null or (lower(reading.actual_period) at time zone 'Europe/Paris')::date
        > greatest(legacy.coverage_end, archive_coverage.coverage_end))
  ), live_voyages as (
    select live.* from live_candidates live
    where not exists (
      select 1 from live_candidates newer where newer.vessel_id = live.vessel_id
        and newer.actual_period && live.actual_period
        and (newer.represented, newer.updated_at, newer.lineage_id) > (live.represented, live.updated_at, live.lineage_id)
    )
  ), totals as (
    select rate.vessel_id, rate.towing, rate.distance_nm, rate.fuel_liters
    from public.project_fuel_vessel_rates rate where rate.company_id = p_company
    union all
    select live.vessel_id, live.towing, live.distance_nm, live.fuel_liters
    from live_voyages live where not live.legacy and not live.represented
  ), rates as (
    select vessel_id,
      sum(fuel_liters) filter (where towing) / nullif(sum(distance_nm) filter (where towing), 0) as towage,
      sum(fuel_liters) filter (where not towing) / nullif(sum(distance_nm) filter (where not towing), 0) as other
    from totals group by vessel_id
  ), monthly_voyages as (
    select vessel_id, towing, arrival_day, distance_nm, fuel_liters, cost_euros from archive_voyages
    union all
    select vessel_id, towing, arrival_day, distance_nm, fuel_liters,
      case when cost_euros >= 0 then cost_euros end from live_voyages
  ), monthly_periods as (
    select voyage.vessel_id,
      (case when voyage.towing then 'towage' else 'other' end) || ':' ||
        (case when voyage.arrival_day >= bounds.current_month then 'current' else 'previous' end) as regime_period,
      jsonb_build_object('litersPerNm', sum(voyage.fuel_liters) / nullif(sum(voyage.distance_nm), 0),
        'costPerNm', sum(voyage.cost_euros) / nullif(sum(voyage.distance_nm) filter (where voyage.cost_euros is not null), 0)) as metrics
    from monthly_voyages voyage cross join bounds
    where voyage.arrival_day between bounds.previous_month and bounds.today
    group by voyage.vessel_id, regime_period
  ), monthly_rates as (
    select vessel_id, jsonb_object_agg(regime_period, metrics) as metrics
    from monthly_periods group by vessel_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'vesselId', vessel.id, 'towageLitersPerNm', rates.towage, 'otherLitersPerNm', rates.other,
    'pricePerLiter', coalesce(vessel_price.price_eur_per_liter_ht, fallback_price.price_eur_per_liter_ht),
    'monthly', jsonb_build_object('currentMonth', to_char(bounds.current_month, 'YYYY-MM'),
      'previousMonth', to_char(bounds.previous_month, 'YYYY-MM'),
      'towage', jsonb_build_object(
        'current', coalesce(monthly.metrics->'towage:current', bounds.empty_period),
        'previous', coalesce(monthly.metrics->'towage:previous', bounds.empty_period)),
      'other', jsonb_build_object(
        'current', coalesce(monthly.metrics->'other:current', bounds.empty_period),
        'previous', coalesce(monthly.metrics->'other:previous', bounds.empty_period)))
  ) order by vessel.id), '[]'::jsonb)
  from public.vessels vessel cross join bounds
  left join rates on rates.vessel_id = vessel.id
  left join monthly_rates monthly on monthly.vessel_id = vessel.id
  left join public.project_fuel_latest_vessel_prices vessel_price
    on vessel_price.company_id = vessel.company_id and vessel_price.vessel_id = vessel.id
  left join public.project_fuel_latest_fallback_price fallback_price
    on fallback_price.company_id = vessel.company_id and vessel_price.vessel_id is null
  where vessel.company_id = p_company and vessel.active and vessel.asset_kind = 'vessel';
$$;

notify pgrst, 'reload schema';
