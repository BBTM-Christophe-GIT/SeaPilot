create function sea_operation_private.towage_title(p_title text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(public.normalize_import_label(p_title) ~ '\mremorquage\M', false);
$$;

create function sea_operation_private.project_is_towage(p_company bigint, p_project bigint) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.projects project
    where project.company_id = p_company and project.id = p_project and (
      sea_operation_private.towage_title(project.title)
      or coalesce(public.normalize_import_label(project.contract_type) ~ '\m(remorquage|towage)\M', false)
      or exists (
        select 1 from public.project_contracts contract
        where contract.company_id = project.company_id and contract.project_id = project.id
          and contract.archived_at is null and contract.towed_asset_id is not null
      )
    )
  );
$$;

create function sea_operation_private.operation_towing_mode(p_company bigint, p_draft jsonb) returns boolean
language sql stable set search_path = '' as $$
  select case
    when sea_operation_private.towage_title(p_draft->>'project') then true
    when project.id is not null then sea_operation_private.project_is_towage(p_company, project.id)
    when p_draft#>>'{applicability,towing}' = 'yes' then true
    when p_draft#>>'{applicability,towing}' = 'no' then false
  end
  from (select sea_operation_private.preparation_id(p_draft#>>'{planning,projectId}') as id) linked
  left join public.projects project on project.id = linked.id and project.company_id = p_company;
$$;

-- Profiles require measured GPX speed. Consumption also accepts qualified manually entered passages.
create function sea_operation_private.navigation_passages(p_company bigint, p_vessels bigint[], p_profiles boolean)
returns table(vessel_id bigint, towing boolean, arrival_day date, distance_nm numeric, duration_hours numeric,
  fuel_liters numeric, cost_euros numeric, lineage_id uuid, legacy boolean, represented boolean)
language sql stable set search_path = '' as $$
  with clock as (
    select statement_timestamp() as instant, (statement_timestamp() at time zone 'Europe/Paris')::date as today
  ), legacy_vessels as (
    select vessel.id as vessel_id, source.history_key, source.coverage_end
    from public.vessels vessel join public.companies company on company.id = vessel.company_id
    join (values ('937905', '228098070', 'rozel', date '2026-11-05'), ('926637', '227779340', 'suroit', date '2026-10-02'))
      source(registration_number, mmsi, history_key, coverage_end)
      on source.registration_number = vessel.registration_number and source.mmsi = vessel.mmsi
    where vessel.company_id = p_company and company.code = 'bbtm' and vessel.asset_kind = 'vessel'
      and (p_vessels is null or vessel.id = any(p_vessels))
  ), archive_cells as (
    select source.vessel_id, source.history_key, workbook.row_data->'cells' as cells, workbook.position as source_order
    from legacy_vessels source join sea_operation_private.consumption_history history on history.company_id = p_company
    cross join lateral jsonb_array_elements(history.data->source.history_key) with ordinality workbook(row_data, position)
  ), archive_values as materialized (
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
    from archive_values archive cross join clock
    where archive.arrival_serial >= 61 and archive.arrival_serial < clock.today - date '1899-12-30' + 1
    group by archive.vessel_id
  ), archive_times as (
    select archive.*, (archive.arrival_serial - archive.departure_serial) * 24 as duration_hours,
      (timestamp '1899-12-30' + archive.departure_serial * interval '1 day') at time zone 'Europe/Paris' as departed_at,
      (timestamp '1899-12-30' + archive.arrival_serial * interval '1 day') at time zone 'Europe/Paris' as arrived_at
    from archive_values archive cross join clock
    where archive.towing_flag in ('oui', 'non') and archive.departure_port <> archive.arrival_port
      and archive.departure_serial >= 61 and archive.departure_serial < archive.arrival_serial
      and archive.arrival_serial < clock.today - date '1899-12-30' + 1
      and archive.departure_gauge between 0 and archive.max_gauge and archive.arrival_gauge between 0 and archive.departure_gauge
      and archive.distance_nm >= 10 and archive.fuel_liters > 0
  ), archive_passages as materialized (
    select archive.vessel_id, archive.source_order, archive.towing_flag = 'oui' as towing,
      date '1899-12-30' + floor(archive.arrival_serial)::integer as arrival_day,
      archive.distance_nm, archive.duration_hours, archive.fuel_liters,
      case when archive.cost_euros > 0 then archive.cost_euros end as cost_euros,
      tstzrange(archive.departed_at, archive.arrived_at, '[)') as passage
    from archive_times archive cross join clock
    where archive.departed_at < archive.arrived_at and archive.arrived_at <= clock.instant
      -- Long, implausibly slow intervals include stops and are not reliable voyage-speed observations.
      and (not p_profiles or (
        archive.distance_nm <= 100 * archive.duration_hours
        and not (archive.duration_hours > 168 and archive.distance_nm < archive.duration_hours)
      ))
  ), archive_voyages as materialized (
    select archive.* from archive_passages archive
    where not exists (
      select 1 from archive_passages duplicate
      where duplicate.vessel_id = archive.vessel_id and duplicate.passage && archive.passage
        and duplicate.source_order > archive.source_order
    )
  ), live_candidates as materialized (
    select reading.lineage_id, reading.vessel_id, measured.passage, reading.updated_at,
      legacy.vessel_id is not null as legacy,
      (upper(measured.passage) at time zone 'Europe/Paris')::date as arrival_day,
      sea_operation_private.operation_towing_mode(operation.company_id, operation.draft) as towing,
      measured.distance_nm, measured.duration_hours,
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
    cross join clock
    left join lateral (
      select (reading.inputs#>>'{trace,startedAt}')::timestamptz as started_at,
        (reading.inputs#>>'{trace,endedAt}')::timestamptz as ended_at,
        (reading.inputs#>>'{trace,distanceNm}')::numeric as distance_nm
      where p_profiles and jsonb_typeof(reading.inputs->'trace') = 'object'
    ) trace on true
    cross join lateral (
      select case when not p_profiles then reading.actual_period
        when trace.started_at < trace.ended_at then tstzrange(trace.started_at, trace.ended_at, '[)') end as passage,
        case when p_profiles then trace.distance_nm else (reading.results->>'distanceNm')::numeric end as distance_nm,
        case when p_profiles then extract(epoch from trace.ended_at - trace.started_at) / 3600
          else (reading.inputs->>'durationMinutes')::numeric / 60 end as duration_hours
    ) measured
    where operation.company_id = p_company and (p_vessels is null or operation.vessel_id = any(p_vessels))
      and operation.status = 'signed' and operation.draft->>'decision' = 'GO'
      and sea_operation_private.record_is_current(operation.id)
      and measured.passage is not null and upper(measured.passage) <= clock.instant
      and reading.inputs->'completed' = 'true'::jsonb
      and measured.distance_nm > 0 and measured.duration_hours > 0
      and (not p_profiles or measured.distance_nm <= 100 * measured.duration_hours)
      and (p_profiles or legacy.coverage_end is null or (lower(measured.passage) at time zone 'Europe/Paris')::date
        > greatest(legacy.coverage_end, archive_coverage.coverage_end))
      and (not p_profiles or not exists (
        select 1 from archive_voyages archive
        where archive.vessel_id = reading.vessel_id and archive.passage && measured.passage
      ))
  ), classified_live as (
    select live.*,
      case when live.fuel_liters >= 0 and live.fuel_liters < 'Infinity'::numeric then live.fuel_liters end as valid_fuel
    from live_candidates live where live.towing is not null
  )
  select archive.vessel_id, archive.towing, archive.arrival_day, archive.distance_nm, archive.duration_hours,
    archive.fuel_liters, archive.cost_euros, null::uuid, true, false
  from archive_voyages archive
  union all
  select live.vessel_id, live.towing, live.arrival_day, live.distance_nm, live.duration_hours, live.valid_fuel,
    case when live.valid_fuel is not null and live.cost_euros >= 0 and live.cost_euros < 'Infinity'::numeric then live.cost_euros end,
    live.lineage_id, live.legacy, live.represented
  from classified_live live
  where not exists (
    select 1 from classified_live duplicate
    where duplicate.vessel_id = live.vessel_id and duplicate.passage && live.passage
      and (duplicate.represented, duplicate.valid_fuel is not null, duplicate.updated_at, duplicate.lineage_id)
        > (live.represented, live.valid_fuel is not null, live.updated_at, live.lineage_id)
  );
$$;

revoke all on function sea_operation_private.towage_title(text), sea_operation_private.project_is_towage(bigint, bigint),
  sea_operation_private.operation_towing_mode(bigint, jsonb), sea_operation_private.navigation_passages(bigint, bigint[], boolean)
from public, anon, authenticated, service_role;

create or replace function sea_operation_private.register_vessel_consumption_averages(p_company bigint) returns jsonb
language sql stable set search_path = '' as $$
  with bounds as (
    select date_trunc('month', local_today)::date as current_month,
      (date_trunc('month', local_today) - interval '1 month')::date as previous_month,
      local_today as today, '{"litersPerNm":null,"costPerNm":null}'::jsonb as empty_period
    from (select (statement_timestamp() at time zone 'Europe/Paris')::date as local_today) clock
  ), passages as materialized (
    select * from sea_operation_private.navigation_passages(p_company, null, false)
  ), totals as (
    select sample.vessel_id, coalesce(live.towing, sample.towing) as towing, sample.distance_nm, sample.fuel_liters
    from public.vessel_fuel_reference_samples sample
    left join passages live on live.vessel_id = sample.vessel_id and live.represented
      and sample.source_key = 'sea-operation:' || live.lineage_id::text
    where sample.company_id = p_company
    union all
    select live.vessel_id, live.towing, live.distance_nm, live.fuel_liters
    from passages live where not live.legacy and not live.represented and live.fuel_liters is not null
  ), rates as (
    select vessel_id,
      sum(fuel_liters) filter (where towing) / nullif(sum(distance_nm) filter (where towing), 0) as towage,
      sum(fuel_liters) filter (where not towing) / nullif(sum(distance_nm) filter (where not towing), 0) as other
    from totals group by vessel_id
  ), monthly_periods as (
    select voyage.vessel_id,
      (case when voyage.towing then 'towage' else 'other' end) || ':' ||
        (case when voyage.arrival_day >= bounds.current_month then 'current' else 'previous' end) as regime_period,
      jsonb_build_object('litersPerNm', sum(voyage.fuel_liters) / nullif(sum(voyage.distance_nm), 0),
        'costPerNm', sum(voyage.cost_euros) / nullif(sum(voyage.distance_nm) filter (where voyage.cost_euros is not null), 0)) as metrics
    from passages voyage cross join bounds
    where voyage.arrival_day between bounds.previous_month and bounds.today and voyage.fuel_liters is not null
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

-- Add the historical levels only to the fleet read. Stock updates retain their existing response.
create or replace function sea_operation_private.fleet_fuel() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  company bigint := sea_operation_private.company_id();
  current_timepoint timestamptz := statement_timestamp();
  today date := (current_timepoint at time zone 'Europe/Paris')::date;
  actor_person bigint;
begin
  if not coalesce(sea_operation_private.can_read(company), false) then
    raise exception 'Accès refusé aux opérations en mer.' using errcode = '42501';
  end if;
  actor_person := public.current_person_id();
  return (
    with fleet as materialized (
      select * from sea_operation_private.fleet_fuel_rows(company, null)
    ), preferred_vessel as (
      select assignment.vessel_id
      from public.planning_assignments assignment join fleet
        on fleet.vessel_id = assignment.vessel_id and fleet.detail->'canSetBaseline' = 'true'::jsonb
      where assignment.company_id = company and assignment.confirmation_status = 'confirmed'
        and (assignment.crew_person_id = actor_person or assignment.captain_person_id = actor_person)
        and assignment.starts_at < ((today + 1)::timestamp at time zone 'Europe/Paris')
        and assignment.ends_at > (today::timestamp at time zone 'Europe/Paris')
        and public.planning_status_is_working(public.planning_effective_person_status(
          assignment.company_id, actor_person, today, assignment.vessel_id, assignment.status_label))
      order by (assignment.starts_at <= current_timepoint and assignment.ends_at > current_timepoint) desc,
        (assignment.crew_person_id = actor_person) desc, assignment.starts_at desc, assignment.id desc
      limit 1
    ), profiles as (
      select passage.vessel_id, passage.towing, jsonb_build_object(
        'speedKnots', sum(passage.distance_nm) / sum(passage.duration_hours),
        'litersPerNm', sum(passage.fuel_liters) / nullif(sum(passage.distance_nm) filter (where passage.fuel_liters is not null), 0),
        'sampleCount', count(*)
      ) as metrics
      from sea_operation_private.navigation_passages(company, array(select vessel_id from fleet), true) passage
      group by passage.vessel_id, passage.towing
    )
    select coalesce(jsonb_agg(row_data.detail || jsonb_build_object(
      'assignedToday', coalesce(row_data.vessel_id = (select vessel_id from preferred_vessel), false),
      'navigationProfiles', jsonb_build_object('normal', normal.metrics, 'towing', towing.metrics),
      'latestTankReading',
      case when reading.reading_date is not null then jsonb_build_object(
        'date', reading.reading_date, 'time', to_char(reading.reading_date + reading.reading_time, 'HH24:MI'),
        'superseded', reading.superseded, 'tanks', (
          select jsonb_agg(jsonb_build_object('key', tank.data->'key', 'name', tank.data->'name',
            'capacityLiters', tank.data->'capacityLiters', 'liters', tank.data->'liters') order by tank.position)
          from jsonb_array_elements(reading.tanks) with ordinality tank(data, position)
        )
      ) end) order by row_data.vessel_id), '[]'::jsonb)
    from fleet row_data
    left join profiles normal on normal.vessel_id = row_data.vessel_id and not normal.towing
    left join profiles towing on towing.vessel_id = row_data.vessel_id and towing.towing
    left join lateral (
      select snapshot.reading_date, snapshot.reading_time, snapshot.superseded, snapshot.tanks
      from sea_operation_private.fuel_tank_readings snapshot
      where snapshot.vessel_id = row_data.vessel_id and snapshot.company_id = company and snapshot.reading_date <= today
      order by snapshot.reading_date desc, snapshot.reading_time desc limit 1
    ) reading on true
  );
end;
$$;

-- Extend existing scoped projections and the Conso reference writer without replacing their access checks.
do $migration$
declare
  definition text;
  needle text;
begin
  definition := pg_get_functiondef('sea_operation_private.planning_context(date)'::regprocedure);
  needle := '''project'',case when project.id is not null';
  if (length(definition) - length(replace(definition, needle, ''))) / length(needle) <> 1 then
    raise exception 'Expected planning project projection';
  end if;
  execute replace(definition, needle, '''projectIsTowage'',sea_operation_private.project_is_towage(company,project.id),' || needle);

  definition := pg_get_functiondef('sea_operation_private.record_json(public.sea_operations)'::regprocedure);
  needle := '''project_ports'',project_ports)';
  if (length(definition) - length(replace(definition, needle, ''))) / length(needle) <> 1 then
    raise exception 'Expected operation project projection';
  end if;
  execute replace(definition, needle, '''projectIsTowage'',exists(
      select 1 from public.sea_operations linked_record
      where linked_record.id=p_record.id and linked_record.company_id=p_record.company_id
        and sea_operation_private.project_is_towage(linked_record.company_id,
          sea_operation_private.preparation_id(linked_record.draft#>>''{planning,projectId}''))),'
    || needle);

  definition := pg_get_functiondef('sea_operation_private.save_consumption(uuid,integer,jsonb)'::regprocedure);
  needle := 'is_towing := case operation.draft#>>''{applicability,towing}'' when ''yes'' then true when ''no'' then false end;';
  if (length(definition) - length(replace(definition, needle, ''))) / length(needle) <> 1 then
    raise exception 'Expected Conso reference mode';
  end if;
  execute replace(definition, needle,
    'is_towing := sea_operation_private.operation_towing_mode(operation.company_id, operation.draft);');

end;
$migration$;

-- Align previously accepted live reference rows while retaining the workbooks' explicit towing flags.
with live_modes as (
  select reading.company_id, reading.vessel_id, 'sea-operation:' || reading.lineage_id::text as source_key,
    sea_operation_private.operation_towing_mode(operation.company_id, operation.draft) as towing
  from sea_operation_private.consumption reading
  join public.sea_operations operation on operation.company_id = reading.company_id and operation.vessel_id = reading.vessel_id
    and sea_operation_private.consumption_lineage(operation.id) = reading.lineage_id
  where reading.included_in_reference and operation.status = 'signed' and operation.draft->>'decision' = 'GO'
    and sea_operation_private.record_is_current(operation.id)
)
update public.vessel_fuel_reference_samples sample set towing = live.towing
from live_modes live
where live.company_id = sample.company_id and live.vessel_id = sample.vessel_id and live.source_key = sample.source_key
  and live.towing is not null and live.towing is distinct from sample.towing
  and not exists (
    select 1 from public.vessel_fuel_reference_samples other
    where other.company_id = sample.company_id and other.vessel_id = sample.vessel_id
      and other.source_key = sample.source_key and other.towing = live.towing
  );

notify pgrst, 'reload schema';
