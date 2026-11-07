-- Dated references are opening balances; older references keep their exact observation time.
alter table sea_operation_private.fuel_baselines add column baseline_date date
  check (baseline_date is null or (isfinite(baseline_date) and baseline_date >= date '1900-01-01'));

create function sea_operation_private.fuel_tank_names_valid(p_names text[], p_capacity_count integer) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(array_ndims(p_names) = 1 and cardinality(p_names) = p_capacity_count
    and p_capacity_count between 3 and 20 and (
      select bool_and(name is not null and name = btrim(name) and length(name) between 1 and 80)
        and count(distinct lower(name)) = count(*) from unnest(p_names) as names(name)
    ), false);
$$;
revoke all on function sea_operation_private.fuel_tank_names_valid(text[], integer) from public, anon;
grant execute on function sea_operation_private.fuel_tank_names_valid(text[], integer) to authenticated, service_role;

alter table public.vessels add column fuel_tank_names text[],
  add constraint vessels_fuel_tank_names_valid check (fuel_tank_names is null
    or sea_operation_private.fuel_tank_names_valid(fuel_tank_names, cardinality(fuel_tank_capacities_liters)));

create function sea_operation_private.fuel_stock_vessel_supported(p_name text, p_acronym text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(replace(public.normalize_import_label(p_name), ' ', ''), '') <> 'br71'
    and coalesce(replace(public.normalize_import_label(p_acronym), ' ', ''), '') <> 'br71';
$$;

-- The stock is vessel-level. A daily figure must never be added once per project or revision.
create function sea_operation_private.dpr_fuel_used_since(p_company bigint, p_vessel bigint, p_from date, p_through date) returns numeric
language sql stable set search_path = '' as $$
  select coalesce(sum(day.fuel_consumed_liters), 0)
  from (
    select distinct on (report.report_date) metrics.fuel_consumed_liters
    from public.dpr_reports report join public.dpr_daily_metrics metrics
      on metrics.dpr_id = report.id and metrics.company_id = report.company_id
    where report.company_id = p_company and report.vessel_id = p_vessel and report.report_date between p_from and p_through
      and report.status = 'validated' and report.deleted_at is null
      and metrics.fuel_consumed_liters >= 0 and metrics.fuel_consumed_liters < 'Infinity'::numeric
    order by report.report_date, (report.source_label <> 'sharepoint') desc,
      coalesce(report.validated_at, report.source_modified_at, report.submitted_at, report.created_at) desc,
      report.version_no desc, report.id desc
  ) day;
$$;

revoke all on function sea_operation_private.fuel_stock_vessel_supported(text, text),
  sea_operation_private.dpr_fuel_used_since(bigint, bigint, date, date) from public, anon, authenticated, service_role;

create or replace function sea_operation_private.fleet_fuel_rows(p_company bigint, p_vessel bigint) returns table(vessel_id bigint, detail jsonb)
language sql stable set search_path = '' as $$
  with access_scope as (
    select public.has_company_role(p_company, array['admin', 'direction', 'armement']) as office,
      private.assigned_vessel_read_scope(p_company) as assigned_vessels
  ), assets as (
    select vessel.id, vessel.name, vessel.length_overall,
      case when vessel.max_speed_knots > 0 and vessel.max_speed_knots < 'Infinity'::numeric then vessel.max_speed_knots end as max_speed,
      sea_operation_private.main_fuel_capacity(vessel.fuel_tank_capacities_liters, vessel.fuel_capacity_m3) as capacity,
      case when company.code = 'bbtm' and vessel.registration_number = '937905' and vessel.mmsi = '228098070' then 'rozel'
        when company.code = 'bbtm' and vessel.registration_number = '926637' and vessel.mmsi = '227779340' then 'suroit' end as archive_key
    from public.vessels vessel join public.companies company on company.id = vessel.company_id cross join access_scope
    where vessel.company_id = p_company and vessel.active and vessel.asset_kind = 'vessel' and (p_vessel is null or vessel.id = p_vessel)
      and sea_operation_private.fuel_stock_vessel_supported(vessel.name, vessel.acronym)
      and (access_scope.office or vessel.id = any(access_scope.assigned_vessels) or exists (
        select 1 from public.sea_operations operation where operation.company_id = p_company and operation.vessel_id = vessel.id
          and sea_operation_private.record_is_current(operation.id)
      ))
  ), readings as (
    select reading.vessel_id, reading.lineage_id, reading.first_recorded_at, reading.actual_period, measured.draft,
      sea_operation_private.fuel_measurement_time(reading.actual_period, reading.inputs, measured.draft, reading.first_recorded_at) as measured_at,
      (reading.results->>'arrivalLiters')::numeric as arrival_liters, (reading.results->>'consumedLiters')::numeric as used_liters,
      (reading.inputs->>'refuelLiters')::numeric as refuel_liters,
      (reading.results->>'distanceNm')::numeric as distance_nm, (reading.inputs->>'durationMinutes')::numeric / 60 as duration_hours,
      (reading.inputs->>'averageSpeedKnots')::numeric as speed_knots, reading.inputs#>>'{trace,endedAt}' is not null as has_trace
    from assets
    join public.sea_operations operation on operation.company_id = p_company and operation.vessel_id = assets.id
    join sea_operation_private.consumption reading on reading.lineage_id = sea_operation_private.consumption_lineage(operation.id)
      and reading.company_id = operation.company_id and reading.vessel_id = operation.vessel_id
    join public.sea_operations measured on measured.id = reading.operation_id
    where operation.status = 'signed' and operation.draft->>'decision' = 'GO'
      and sea_operation_private.record_is_current(operation.id) and reading.inputs->'completed' = 'true'::jsonb
  ), stock_measurements as (
    select reading.vessel_id, reading.measured_at, reading.arrival_liters, reading.refuel_liters,
      reading.first_recorded_at, reading.lineage_id
    from readings reading join assets on assets.id = reading.vessel_id
    where reading.measured_at <= statement_timestamp() and reading.arrival_liters >= 0
      and reading.arrival_liters < 'Infinity'::numeric and (assets.capacity is null or reading.arrival_liters <= assets.capacity)
  ), latest_operations as (
    select distinct on (reading.vessel_id) reading.vessel_id, reading.measured_at, reading.arrival_liters
    from stock_measurements reading
    order by reading.vessel_id, reading.measured_at desc, reading.first_recorded_at desc nulls last, reading.lineage_id
  ), latest_refuels as (
    select distinct on (reading.vessel_id) reading.vessel_id, reading.measured_at, reading.arrival_liters, reading.refuel_liters
    from stock_measurements reading
    where reading.refuel_liters > 0 and reading.refuel_liters < 'Infinity'::numeric
    order by reading.vessel_id, reading.measured_at desc, reading.first_recorded_at desc nulls last, reading.lineage_id
  ), archive_cells as (
    select asset.id as vessel_id, row_data.ordinality as source_order, row_data.entry->'cells' as cells,
      case when asset.archive_key = 'rozel' then 10 else 9 end as arrival_gauge_index,
      case when asset.archive_key = 'rozel' then 1 else 1000 end as max_gauge
    from assets asset join sea_operation_private.consumption_history history on history.company_id = p_company
    cross join lateral jsonb_array_elements(history.data->asset.archive_key) with ordinality row_data(entry, ordinality)
    where asset.archive_key is not null and asset.max_speed is not null
  ), archive_values as (
    select vessel_id, source_order, max_gauge,
      case when jsonb_typeof(cells->2) = 'number' then (cells->>2)::numeric end as distance_nm,
      case when jsonb_typeof(cells->3) = 'number' then (cells->>3)::numeric end as departure_serial,
      case when jsonb_typeof(cells->4) = 'number' then (cells->>4)::numeric end as arrival_serial,
      case when jsonb_typeof(cells->8) = 'number' then (cells->>8)::numeric end as departure_gauge,
      case when jsonb_typeof(cells->arrival_gauge_index) = 'number' then (cells->>arrival_gauge_index)::numeric end as arrival_gauge,
      case when jsonb_typeof(cells->12) = 'number' then (cells->>12)::numeric end as used_liters
    from archive_cells
    where lower(btrim(cells->>5)) = 'non'
      and nullif(lower(btrim(cells->>0)), '') <> nullif(lower(btrim(cells->>1)), '')
  ), archive_times as (
    select vessel_id, source_order, distance_nm, used_liters,
      (timestamp '1899-12-30' + departure_serial * interval '1 day') at time zone 'Europe/Paris' as departed_at,
      (timestamp '1899-12-30' + arrival_serial * interval '1 day') at time zone 'Europe/Paris' as arrived_at
    from archive_values
    where departure_serial >= 61 and departure_serial < arrival_serial and arrival_serial < 2958466
      and departure_gauge between 0 and max_gauge and arrival_gauge between 0 and departure_gauge
      and distance_nm >= 10 and used_liters > 0
  ), archive_passages as (
    select vessel_id, source_order, distance_nm, used_liters,
      extract(epoch from arrived_at - departed_at) / 3600 as duration_hours,
      tstzrange(departed_at, arrived_at, '[)') as passage
    from archive_times where departed_at < arrived_at and arrived_at <= statement_timestamp()
  ), live_passages as (
    select reading.vessel_id, reading.lineage_id, reading.first_recorded_at, reading.used_liters, reading.duration_hours, reading.speed_knots,
      coalesce(reading.actual_period, tstzrange(reading.measured_at - reading.duration_hours * interval '1 hour', reading.measured_at, '[)')) as passage
    from readings reading join assets on assets.id = reading.vessel_id
    where reading.measured_at <= statement_timestamp() and (reading.actual_period is not null or reading.has_trace)
      and jsonb_typeof(reading.draft->'transit') = 'object' and reading.draft#>>'{applicability,towing}' = 'no'
      and nullif(lower(btrim(reading.draft#>>'{vessel,departurePort}')), '') <> nullif(lower(btrim(reading.draft#>>'{vessel,arrivalPort}')), '')
      and reading.used_liters > 0 and reading.used_liters < 'Infinity'::numeric and reading.distance_nm > 0 and reading.duration_hours > 0
      and assets.max_speed is not null
  ), distinct_passages as (
    select voyage.vessel_id, voyage.used_liters, voyage.duration_hours, voyage.distance_nm / nullif(voyage.duration_hours, 0) as speed_knots
    from archive_passages voyage
    where not exists (select 1 from archive_passages duplicate where duplicate.vessel_id = voyage.vessel_id
      and duplicate.passage && voyage.passage and duplicate.source_order > voyage.source_order)
    union all
    select voyage.vessel_id, voyage.used_liters, voyage.duration_hours, voyage.speed_knots
    from live_passages voyage
    where not exists (select 1 from archive_passages archive where archive.vessel_id = voyage.vessel_id and archive.passage && voyage.passage)
    and not exists (select 1 from live_passages duplicate where duplicate.vessel_id = voyage.vessel_id and duplicate.passage && voyage.passage
      and (coalesce(duplicate.first_recorded_at, '-infinity'::timestamptz), duplicate.lineage_id)
        > (coalesce(voyage.first_recorded_at, '-infinity'::timestamptz), voyage.lineage_id))
  ), rates as (
    select voyage.vessel_id, sum(voyage.used_liters) / nullif(sum(voyage.duration_hours), 0) as liters_per_hour, count(*) as sample_count
    from distinct_passages voyage join assets asset on asset.id = voyage.vessel_id
    where voyage.speed_knots between asset.max_speed * 0.4 and asset.max_speed * 0.6
    group by voyage.vessel_id
  ), stock_anchors as (
    select baseline.vessel_id, baseline.fuel_liters, baseline.measured_at, 'baseline'::text as source,
      coalesce(baseline.baseline_date, (baseline.measured_at at time zone 'Europe/Paris')::date) as reference_date,
      coalesce(baseline.baseline_date, (baseline.measured_at at time zone 'Europe/Paris')::date + 1) as first_dpr_day,
      coalesce(baseline.baseline_date::timestamp at time zone 'Europe/Paris', baseline.measured_at) as effective_at,
      null::numeric as refuel_liters
    from assets asset join sea_operation_private.fuel_baselines baseline on baseline.vessel_id = asset.id and baseline.company_id = p_company
    union all
    -- The arrival gauge already includes the refuelling and the passage. Daily DPR data cannot split this day.
    select refuel.vessel_id, refuel.arrival_liters, refuel.measured_at, 'refuel',
      (refuel.measured_at at time zone 'Europe/Paris')::date, (refuel.measured_at at time zone 'Europe/Paris')::date + 1,
      refuel.measured_at, refuel.refuel_liters
    from latest_refuels refuel
  ), balances as materialized (
    select distinct on (anchor.vessel_id) anchor.*,
      sea_operation_private.dpr_fuel_used_since(p_company, anchor.vessel_id, anchor.first_dpr_day,
        (statement_timestamp() at time zone 'Europe/Paris')::date) as deducted_liters
    from stock_anchors anchor
    order by anchor.vessel_id, anchor.effective_at desc, anchor.source
  )
  select asset.id, jsonb_build_object('vesselId', asset.id, 'vesselName', asset.name, 'lengthOverall', asset.length_overall,
    'maxSpeedKnots', asset.max_speed, 'capacityLiters', asset.capacity,
    'fuelLiters', case when balance.vessel_id is not null then greatest(balance.fuel_liters - balance.deducted_liters, 0)
      else operation.arrival_liters end,
    'measuredAt', coalesce(balance.measured_at, operation.measured_at),
    -- Older clients already understand operation; refuelLiters identifies the restart.
    'source', case when balance.source = 'refuel' then 'operation'
      else coalesce(balance.source, case when operation.measured_at is not null then 'operation' end) end,
    'baselineDate', balance.reference_date, 'baselineFuelLiters', balance.fuel_liters, 'deductedFuelLiters', balance.deducted_liters,
    'refuelLiters', balance.refuel_liters,
    'canSetBaseline', coalesce(sea_operation_private.can_set_fuel_baseline(p_company, asset.id), false),
    'rateLitersPerHour', rates.liters_per_hour, 'rateSampleCount', coalesce(rates.sample_count, 0))
  from assets asset
  left join balances balance on balance.vessel_id = asset.id
  left join latest_operations operation on operation.vessel_id = asset.id and balance.vessel_id is null
  left join rates on rates.vessel_id = asset.id;
$$;

create function sea_operation_private.save_fuel_baseline(p_vessel_id bigint, p_unit text, p_value numeric, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  company bigint := sea_operation_private.company_id();
  vessel public.vessels;
  capacity numeric;
  liters numeric;
begin
  if not coalesce(sea_operation_private.can_read(company), false)
    or not coalesce(sea_operation_private.can_set_fuel_baseline(company, p_vessel_id), false) then
    raise exception 'La saisie du stock de carburant est réservée au Capitaine affecté ou aux responsables habilités.' using errcode = '42501';
  end if;
  select * into vessel from public.vessels where id = p_vessel_id and company_id = company and active and asset_kind = 'vessel'
    and sea_operation_private.fuel_stock_vessel_supported(name, acronym) for update;
  if not found then raise exception 'Navire inaccessible.' using errcode = '42501'; end if;

  if p_date is not null and (not isfinite(p_date) or p_date < date '1900-01-01'
    or p_date > (clock_timestamp() at time zone 'Europe/Paris')::date) then
    raise exception 'La date du stock doit être aujourd’hui ou une date passée valide.' using errcode = '22023';
  end if;

  capacity := sea_operation_private.main_fuel_capacity(vessel.fuel_tank_capacities_liters, vessel.fuel_capacity_m3);
  if p_unit is null or p_unit not in ('liters', 'percent') or p_value is null or p_value < 0
    or p_value >= 'Infinity'::numeric or p_value <> round(p_value, 3) then
    raise exception 'Saisissez un stock de carburant valide.' using errcode = '22023';
  end if;
  if p_unit = 'percent' then
    if capacity is null or p_value > 100 then
      raise exception 'La saisie en pourcentage exige une capacité de soutes et une valeur entre 0 et 100.' using errcode = '22023';
    end if;
    liters := round(capacity * p_value / 100, 3);
  else
    if p_value > coalesce(capacity, 10000000) then
      raise exception 'Le stock dépasse la capacité des soutes ou la limite de saisie.' using errcode = '22023';
    end if;
    liters := p_value;
  end if;

  insert into sea_operation_private.fuel_baselines(vessel_id, company_id, fuel_liters, measured_at, measured_by, baseline_date)
  values (vessel.id, company, liters, clock_timestamp(), (select auth.uid()), p_date)
  on conflict (vessel_id) do update set fuel_liters = excluded.fuel_liters, measured_at = excluded.measured_at,
    measured_by = excluded.measured_by, baseline_date = excluded.baseline_date;

  return (select row_data.detail from sea_operation_private.fleet_fuel_rows(company, vessel.id) row_data);
end;
$$;

-- The old three-argument API still stores a timestamp-style measurement.
create or replace function sea_operation_private.save_fuel_baseline(p_vessel_id bigint, p_unit text, p_value numeric) returns jsonb
language sql security invoker set search_path = '' as $$
  select sea_operation_private.save_fuel_baseline(p_vessel_id, p_unit, p_value, null::date);
$$;

create function public.sea_operation_save_fuel_baseline(p_vessel_id bigint, p_unit text, p_value numeric, p_date date) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  if p_date is null then raise exception 'Renseignez la date du stock.' using errcode = '22023'; end if;
  return sea_operation_private.save_fuel_baseline(p_vessel_id, p_unit, p_value, p_date);
end;
$$;

revoke all on function sea_operation_private.save_fuel_baseline(bigint, text, numeric, date),
  public.sea_operation_save_fuel_baseline(bigint, text, numeric, date) from public, anon, authenticated, service_role;
grant execute on function sea_operation_private.save_fuel_baseline(bigint, text, numeric, date),
  public.sea_operation_save_fuel_baseline(bigint, text, numeric, date) to authenticated;

notify pgrst, 'reload schema';
