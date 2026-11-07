create function sea_operation_private.fuel_tank_capacities_valid(p_values numeric[]) returns boolean
language sql immutable set search_path = '' as $$
  select array_ndims(p_values) = 1 and cardinality(p_values) between 1 and 20
    and (select bool_and(value is not null and value > 0 and value <= 10000000 and value = round(value, 3))
      from unnest(p_values) as capacities(value));
$$;
revoke all on function sea_operation_private.fuel_tank_capacities_valid(numeric[]) from public, anon;
grant execute on function sea_operation_private.fuel_tank_capacities_valid(numeric[]) to authenticated, service_role;

alter table public.vessels
  add column fuel_tank_capacities_liters numeric[],
  add column daily_fuel_tank_capacity_liters numeric,
  add constraint vessels_fuel_tank_capacities_valid check (fuel_tank_capacities_liters is null
    or sea_operation_private.fuel_tank_capacities_valid(fuel_tank_capacities_liters)),
  add constraint vessels_daily_fuel_capacity_valid check (daily_fuel_tank_capacity_liters is null
    or (daily_fuel_tank_capacity_liters > 0 and daily_fuel_tank_capacity_liters <= 10000000
      and daily_fuel_tank_capacity_liters = round(daily_fuel_tank_capacity_liters, 3)));

comment on column public.vessels.fuel_tank_capacities_liters is 'Individual main fuel tank capacities in litres. A null array retains the legacy nominal capacity.';
comment on column public.vessels.daily_fuel_tank_capacity_liters is 'Separate day tank capacity in litres. Excluded from the main fuel capacity sum.';

create function sea_operation_private.main_fuel_capacity(p_tanks numeric[], p_legacy_m3 numeric) returns numeric
language sql immutable set search_path = '' as $$
  select coalesce((select sum(value) from unnest(p_tanks) as capacities(value)),
    case when p_legacy_m3 > 0 and p_legacy_m3 < 'Infinity'::numeric then p_legacy_m3 * 1000 end);
$$;

create or replace function sea_operation_private.consumption_calibration(p_record public.sea_operations) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce((
    select jsonb_build_object('kind', calibration.kind,
      'defaultGaugeUnit', case when calibration.kind = 'suroit' then 'cm' else 'percent' end,
      'nominalCapacityLiters', capacity.liters)
    from public.vessels vessel join public.companies company on company.id = vessel.company_id
    cross join lateral (select sea_operation_private.main_fuel_capacity(vessel.fuel_tank_capacities_liters, vessel.fuel_capacity_m3) as liters) capacity
    cross join lateral (select case
      when company.code = 'bbtm' and vessel.registration_number = '937905' and vessel.mmsi = '228098070' then 'rozel'
      when company.code = 'bbtm' and vessel.registration_number = '926637' and vessel.mmsi = '227779340' then 'suroit'
      when capacity.liters is not null then 'nominal'
      else 'unavailable' end as kind) calibration
    where vessel.id = p_record.vessel_id and vessel.company_id = p_record.company_id and vessel.asset_kind = 'vessel'
  ), '{"kind":"unavailable","defaultGaugeUnit":"percent","nominalCapacityLiters":null}'::jsonb);
$$;

-- Do not turn a correction of an undated annex into a newer stock measurement.
alter table sea_operation_private.consumption add column first_recorded_at timestamptz;
update sea_operation_private.consumption set first_recorded_at = updated_at where version = 1;
alter table sea_operation_private.consumption alter column first_recorded_at set default clock_timestamp();

create function sea_operation_private.reset_fuel_reading_timestamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.first_recorded_at := clock_timestamp();
  return new;
end;
$$;
create trigger sea_operation_fuel_reading_vessel_changed before update of vessel_id on sea_operation_private.consumption
for each row when (new.vessel_id is distinct from old.vessel_id)
execute function sea_operation_private.reset_fuel_reading_timestamp();

create table sea_operation_private.fuel_baselines (
  vessel_id bigint primary key,
  company_id bigint not null,
  fuel_liters numeric not null check (fuel_liters >= 0 and fuel_liters < 'Infinity'::numeric),
  measured_at timestamptz not null,
  measured_by uuid not null references public.profiles(id) on delete restrict,
  foreign key (vessel_id, company_id) references public.vessels(id, company_id) on delete cascade
);
alter table sea_operation_private.fuel_baselines enable row level security;
revoke all on table sea_operation_private.fuel_baselines from public, anon, authenticated, service_role;

create function sea_operation_private.can_set_fuel_baseline(p_company bigint, p_vessel bigint) returns boolean
language sql stable set search_path = '' as $$
  select public.has_company_role(p_company, array['admin', 'direction', 'armement'])
    or (public.has_company_role(p_company, array['capitaine']) and sea_operation_private.can_sign_vessel(p_company, p_vessel));
$$;

create function sea_operation_private.fuel_measurement_time(p_actual_period tstzrange, p_inputs jsonb, p_draft jsonb,
  p_first_recorded_at timestamptz) returns timestamptz
language plpgsql stable set search_path = '' as $$
declare
  operation_day date;
  day_text text;
begin
  if upper(p_actual_period) is not null then return upper(p_actual_period); end if;
  if p_inputs#>>'{trace,endedAt}' is not null then return (p_inputs#>>'{trace,endedAt}')::timestamptz; end if;
  day_text := coalesce(nullif(p_draft#>>'{planning,date}', ''), nullif(p_draft#>>'{transit,date}', ''),
    nullif(split_part(p_draft#>>'{vessel,etd}', 'T', 1), ''));
  if day_text is null then return null; end if;
  operation_day := sea_operation_private.preparation_date(day_text);
  if (p_first_recorded_at at time zone 'Europe/Paris')::date = operation_day then return p_first_recorded_at; end if;
  return operation_day::timestamp at time zone 'Europe/Paris';
exception when invalid_parameter_value or invalid_datetime_format or datetime_field_overflow then
  return null;
end;
$$;

create function sea_operation_private.fleet_fuel_rows(p_company bigint, p_vessel bigint) returns table(vessel_id bigint, detail jsonb)
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
      and (access_scope.office or vessel.id = any(access_scope.assigned_vessels) or exists (
        select 1 from public.sea_operations operation where operation.company_id = p_company and operation.vessel_id = vessel.id
          and sea_operation_private.record_is_current(operation.id)
      ))
  ), readings as (
    select reading.vessel_id, reading.lineage_id, reading.first_recorded_at, reading.actual_period, measured.draft,
      sea_operation_private.fuel_measurement_time(reading.actual_period, reading.inputs, measured.draft, reading.first_recorded_at) as measured_at,
      (reading.results->>'arrivalLiters')::numeric as arrival_liters, (reading.results->>'consumedLiters')::numeric as used_liters,
      (reading.results->>'distanceNm')::numeric as distance_nm, (reading.inputs->>'durationMinutes')::numeric / 60 as duration_hours,
      (reading.inputs->>'averageSpeedKnots')::numeric as speed_knots, reading.inputs#>>'{trace,endedAt}' is not null as has_trace
    from assets
    join public.sea_operations operation on operation.company_id = p_company and operation.vessel_id = assets.id
    join sea_operation_private.consumption reading on reading.lineage_id = sea_operation_private.consumption_lineage(operation.id)
      and reading.company_id = operation.company_id and reading.vessel_id = operation.vessel_id
    join public.sea_operations measured on measured.id = reading.operation_id
    where operation.status = 'signed' and operation.draft->>'decision' = 'GO'
      and sea_operation_private.record_is_current(operation.id) and reading.inputs->'completed' = 'true'::jsonb
  ), latest_operations as (
    select distinct on (reading.vessel_id) reading.vessel_id, reading.measured_at, reading.arrival_liters
    from readings reading join assets on assets.id = reading.vessel_id
    where reading.measured_at <= statement_timestamp() and reading.arrival_liters >= 0
      and reading.arrival_liters < 'Infinity'::numeric and (assets.capacity is null or reading.arrival_liters <= assets.capacity)
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
  )
  select asset.id, jsonb_build_object('vesselId', asset.id, 'vesselName', asset.name, 'lengthOverall', asset.length_overall,
    'maxSpeedKnots', asset.max_speed, 'capacityLiters', asset.capacity,
    'fuelLiters', case when stock.use_operation then operation.arrival_liters else baseline.fuel_liters end,
    'measuredAt', case when stock.use_operation then operation.measured_at else baseline.measured_at end,
    'source', case when stock.use_operation then 'operation' when baseline.vessel_id is not null then 'baseline' end,
    'canSetBaseline', coalesce(sea_operation_private.can_set_fuel_baseline(p_company, asset.id), false),
    'rateLitersPerHour', rates.liters_per_hour, 'rateSampleCount', coalesce(rates.sample_count, 0))
  from assets asset
  left join sea_operation_private.fuel_baselines baseline on baseline.vessel_id = asset.id and baseline.company_id = p_company
  left join latest_operations operation on operation.vessel_id = asset.id
  left join rates on rates.vessel_id = asset.id
  cross join lateral (select operation.measured_at is not null and
    (baseline.measured_at is null or operation.measured_at > baseline.measured_at) as use_operation) stock;
$$;

create function sea_operation_private.fleet_fuel() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare company bigint := sea_operation_private.company_id();
begin
  if not coalesce(sea_operation_private.can_read(company), false) then
    raise exception 'Accès refusé aux opérations en mer.' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(row_data.detail order by row_data.vessel_id), '[]'::jsonb)
    from sea_operation_private.fleet_fuel_rows(company, null) row_data);
end;
$$;

create function sea_operation_private.save_fuel_baseline(p_vessel_id bigint, p_unit text, p_value numeric) returns jsonb
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
  select * into vessel from public.vessels where id = p_vessel_id and company_id = company and active and asset_kind = 'vessel' for update;
  if not found then raise exception 'Navire inaccessible.' using errcode = '42501'; end if;

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

  insert into sea_operation_private.fuel_baselines(vessel_id, company_id, fuel_liters, measured_at, measured_by)
  values (vessel.id, company, liters, clock_timestamp(), (select auth.uid()))
  on conflict (vessel_id) do update set fuel_liters = excluded.fuel_liters, measured_at = excluded.measured_at,
    measured_by = excluded.measured_by;

  return (select row_data.detail from sea_operation_private.fleet_fuel_rows(company, vessel.id) row_data);
end;
$$;

create function public.sea_operation_fleet_fuel() returns jsonb
language sql stable security invoker set search_path = '' as $$ select sea_operation_private.fleet_fuel(); $$;
create function public.sea_operation_save_fuel_baseline(p_vessel_id bigint, p_unit text, p_value numeric) returns jsonb
language sql security invoker set search_path = '' as $$
  select sea_operation_private.save_fuel_baseline(p_vessel_id, p_unit, p_value);
$$;

revoke all on function sea_operation_private.main_fuel_capacity(numeric[], numeric),
  sea_operation_private.reset_fuel_reading_timestamp(), sea_operation_private.can_set_fuel_baseline(bigint, bigint),
  sea_operation_private.fuel_measurement_time(tstzrange, jsonb, jsonb, timestamptz),
  sea_operation_private.fleet_fuel_rows(bigint, bigint), sea_operation_private.fleet_fuel(),
  sea_operation_private.save_fuel_baseline(bigint, text, numeric), public.sea_operation_fleet_fuel(),
  public.sea_operation_save_fuel_baseline(bigint, text, numeric) from public, anon, authenticated, service_role;
grant execute on function sea_operation_private.fleet_fuel(), sea_operation_private.save_fuel_baseline(bigint, text, numeric),
  public.sea_operation_fleet_fuel(), public.sea_operation_save_fuel_baseline(bigint, text, numeric) to authenticated;

notify pgrst, 'reload schema';
