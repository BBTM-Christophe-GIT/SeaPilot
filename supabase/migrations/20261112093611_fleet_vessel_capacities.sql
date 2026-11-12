-- Existing fuel capacities, tank names and sounding snapshots stay in place.
create or replace function sea_operation_private.fuel_tank_names_valid(p_names text[], p_capacity_count integer) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(array_ndims(p_names) = 1 and cardinality(p_names) = p_capacity_count
    and p_capacity_count between 1 and 20 and (
      select bool_and(name is not null and name = btrim(name) and length(name) between 1 and 80)
        and count(distinct lower(name)) = count(*) from unnest(p_names) as names(name)
    ), false);
$$;

create function private.fleet_capacity_sections_valid(p_sections jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  section jsonb;
  tank jsonb;
  section_names text[] := array[]::text[];
  tank_names text[];
  tank_ids text[] := array[]::text[];
  section_name text;
  tank_id text;
  capacity numeric;
begin
  if jsonb_typeof(p_sections) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_sections) > 20 then return false; end if;

  for section in select value from jsonb_array_elements(p_sections) loop
    if jsonb_typeof(section) is distinct from 'object' then return false; end if;
    if section - array['name', 'tanks'] <> '{}'::jsonb
      or jsonb_typeof(section->'name') is distinct from 'string'
      or jsonb_typeof(section->'tanks') is distinct from 'array' then return false; end if;
    if jsonb_array_length(section->'tanks') > 20 then return false; end if;

    section_name := section->>'name';
    if lower(section_name) in ('carburant', 'plans') or section_name ~ '^\s|\s$' then return false; end if;
    section_names := array_append(section_names, section_name);
    tank_names := array[]::text[];

    for tank in select value from jsonb_array_elements(section->'tanks') loop
      if jsonb_typeof(tank) is distinct from 'object' then return false; end if;
      if tank - array['id', 'name', 'capacityLiters', 'showInSoutes'] <> '{}'::jsonb
        or jsonb_typeof(tank->'id') is distinct from 'string'
        or jsonb_typeof(tank->'name') is distinct from 'string'
        or jsonb_typeof(tank->'capacityLiters') is distinct from 'number'
        or jsonb_typeof(tank->'showInSoutes') is distinct from 'boolean' then return false; end if;
      tank_id := tank->>'id';
      if tank_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or tank_id = any(tank_ids) then return false; end if;
      capacity := (tank->>'capacityLiters')::numeric;
      if capacity not between 0.001 and 10000000 or capacity <> round(capacity, 3)
        or tank->>'name' ~ '^\s|\s$' then return false; end if;
      tank_names := array_append(tank_names, tank->>'name');
      tank_ids := array_append(tank_ids, tank_id);
    end loop;

    if cardinality(tank_names) > 0
      and not sea_operation_private.fuel_tank_names_valid(tank_names, cardinality(tank_names)) then return false; end if;
  end loop;

  return cardinality(section_names) = 0
    or sea_operation_private.fuel_tank_names_valid(section_names, cardinality(section_names));
end;
$$;
revoke all on function private.fleet_capacity_sections_valid(jsonb) from public, anon;
grant execute on function private.fleet_capacity_sections_valid(jsonb) to authenticated, service_role;

create function private.fleet_hidden_fuel_tank_keys_valid(p_keys text[]) returns boolean
language sql immutable set search_path = '' as $$
  select cardinality(p_keys) = 0 or (
    array_ndims(p_keys) = 1 and cardinality(p_keys) between 1 and 21 and (
      select bool_and(key is not null and key ~ '^(day|main-([1-9]|1[0-9]|20))$')
        and count(distinct key) = count(*)
      from unnest(p_keys) as keys(key)
    )
  );
$$;
revoke all on function private.fleet_hidden_fuel_tank_keys_valid(text[]) from public, anon;
grant execute on function private.fleet_hidden_fuel_tank_keys_valid(text[]) to authenticated, service_role;

alter table public.vessels
  add column capacity_sections jsonb not null default '[]'::jsonb,
  add column hidden_fuel_tank_keys text[] not null default array[]::text[],
  add constraint vessels_capacity_sections_valid check (
    (asset_kind = 'vessel' or capacity_sections = '[]'::jsonb)
    and private.fleet_capacity_sections_valid(capacity_sections)
  ),
  add constraint vessels_hidden_fuel_tank_keys_valid check (
    (asset_kind = 'vessel' or cardinality(hidden_fuel_tank_keys) = 0)
    and private.fleet_hidden_fuel_tank_keys_valid(hidden_fuel_tank_keys)
  );

create or replace function sea_operation_private.fuel_tank_configuration(p_vessel public.vessels) returns jsonb
language sql stable set search_path = '' as $$
  with configuration as (
    select coalesce(p_vessel.fuel_tank_capacities_liters,
      array[sea_operation_private.main_fuel_capacity(null, p_vessel.fuel_capacity_m3)]) as capacities,
      p_vessel.imo_number = '9059262' and p_vessel.registration_number = '941334'
        and p_vessel.fuel_tank_capacities_liters = array[12357, 12357]::numeric[]
        and exists (select 1 from public.companies where id = p_vessel.company_id and code = 'bbtm') as calibrated
  ), main_tanks as (
    select tank.ordinality as position,
      jsonb_build_object('key', 'main-' || tank.ordinality, 'name', coalesce(
        p_vessel.fuel_tank_names[array_lower(p_vessel.fuel_tank_names, 1) + tank.ordinality::integer - 1],
        case
          when cardinality(configuration.capacities) = 1 then 'Cuve'
          when cardinality(configuration.capacities) = 2 then
            case when tank.ordinality = 1 then 'Cuve Bâbord' else 'Cuve Tribord' end
          else 'Cuve ' || tank.ordinality
        end), 'capacityLiters', tank.liters)
      || case when configuration.calibrated then '{"calibration":"landemer-v1"}'::jsonb else '{}'::jsonb end as tank_data
    from configuration cross join lateral unnest(configuration.capacities) with ordinality tank(liters, ordinality)
    where not ('main-' || tank.ordinality = any(p_vessel.hidden_fuel_tank_keys))
  )
  select coalesce(jsonb_agg(tank_data order by section_position, tank_position), '[]'::jsonb) from (
    select 0::bigint as section_position, position as tank_position, tank_data from main_tanks
    union all
    select 0, 21, jsonb_build_object('key', 'day', 'name', coalesce(p_vessel.daily_fuel_tank_name, 'Caisse journalière'),
      'capacityLiters', p_vessel.daily_fuel_tank_capacity_liters)
    where p_vessel.daily_fuel_tank_capacity_liters is not null and not ('day' = any(p_vessel.hidden_fuel_tank_keys))
    union all
    select section.position, tank.position, jsonb_build_object(
      'key', 'capacity-' || (tank.data->>'id'), 'name', tank.data->'name',
      'sectionName', section.data->'name', 'capacityLiters', tank.data->'capacityLiters'
    )
    from jsonb_array_elements(p_vessel.capacity_sections) with ordinality section(data, position)
    cross join lateral jsonb_array_elements(section.data->'tanks') with ordinality tank(data, position)
    where tank.data->'showInSoutes' = 'true'::jsonb
  ) tanks;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fleet-capacity-plans', 'fleet-capacity-plans', false, 26214400,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
);

-- Use the invoker's vessel RLS. Check both path identifiers and require the
-- same company admin role as the rest of the vessel editor for plan changes.
create function private.fleet_capacity_plan_allowed(p_path text, p_manage boolean) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1
    from public.vessels vessel
    where vessel.id = case when p_path ~ '^[1-9][0-9]*/[1-9][0-9]{0,17}/[0-9a-f-]{36}[.][A-Za-z0-9_-]+$'
      then split_part(p_path, '/', 2)::bigint end
      and vessel.company_id::text = split_part(p_path, '/', 1)
      and vessel.asset_kind = 'vessel'
      and (
        not p_manage or (
          public.has_company_role(vessel.company_id, array['admin'])
          and public.planning_user_can('manage_vessels', vessel.company_id, vessel.id)
        )
      )
  );
$$;
revoke all on function private.fleet_capacity_plan_allowed(text, boolean) from public, anon;
grant execute on function private.fleet_capacity_plan_allowed(text, boolean) to authenticated;

create policy fleet_capacity_plans_read on storage.objects for select to authenticated
  using (bucket_id = 'fleet-capacity-plans' and private.fleet_capacity_plan_allowed(name, false));

create policy fleet_capacity_plans_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'fleet-capacity-plans' and private.fleet_capacity_plan_allowed(name, true));

create policy fleet_capacity_plans_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fleet-capacity-plans' and private.fleet_capacity_plan_allowed(name, true));

-- A partial main-tank selection can be recorded without changing the fuel
-- reference. The implicit legacy input counts as one main tank.
create function sea_operation_private.fuel_tank_selection_covers_main(p_vessel public.vessels) returns boolean
language sql immutable set search_path = '' as $$
  select not exists (
    select 1
    from generate_series(1, coalesce(cardinality(p_vessel.fuel_tank_capacities_liters), 1)) as main(position)
    where 'main-' || main.position = any(p_vessel.hidden_fuel_tank_keys)
  );
$$;
revoke all on function sea_operation_private.fuel_tank_selection_covers_main(public.vessels)
  from public, anon, authenticated, service_role;

alter table sea_operation_private.fuel_tank_readings
  add column updates_fuel_baseline boolean not null default true,
  drop constraint fuel_tank_readings_tanks_check,
  add constraint fuel_tank_readings_tanks_check check (
    jsonb_typeof(tanks) = 'array' and jsonb_array_length(tanks) between 1 and 421
  );

create or replace function sea_operation_private.fuel_tanks(p_vessel_id bigint, p_date date, p_time time) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  company bigint := sea_operation_private.company_id();
  vessel public.vessels;
  saved jsonb;
  times jsonb;
begin
  if auth.uid() is null or not coalesce(sea_operation_private.can_read(company), false) then
    raise exception 'Navire inaccessible.' using errcode = '42501';
  end if;
  select * into vessel from public.vessels asset
  where asset.id = p_vessel_id and asset.company_id = company and asset.active and asset.asset_kind = 'vessel'
    and sea_operation_private.fuel_stock_vessel_supported(asset.name, asset.acronym)
    and (public.has_company_role(company, array['admin', 'direction', 'armement'])
      or asset.id = any(private.assigned_vessel_read_scope(company)) or exists (
        select 1 from public.sea_operations operation where operation.company_id = company and operation.vessel_id = asset.id
          and sea_operation_private.record_is_current(operation.id)
      ));
  if not found then raise exception 'Navire inaccessible.' using errcode = '42501'; end if;
  if not sea_operation_private.valid_fuel_reading_date(p_date) then
    raise exception 'La date du relevé doit être aujourd’hui ou une date passée valide.' using errcode = '22023';
  end if;
  if p_time is not null then
    perform sea_operation_private.fuel_reading_instant(p_date, p_time);
  end if;

  select coalesce(jsonb_agg(to_char(reading.reading_date + reading.reading_time, 'HH24:MI') order by reading.reading_time), '[]'::jsonb),
    (jsonb_agg(jsonb_build_object('version', reading.version, 'savedAt', reading.saved_at, 'mainLiters', reading.main_liters,
      'superseded', reading.superseded, 'updatesFuelBaseline', reading.updates_fuel_baseline, 'tanks', reading.tanks)) filter (where reading.reading_time = p_time))->0
  into times, saved
  from sea_operation_private.fuel_tank_readings reading
  where reading.company_id = company and reading.vessel_id = vessel.id and reading.reading_date = p_date;
  return jsonb_build_object('vesselId', vessel.id, 'date', p_date,
    'time', to_char(p_date + p_time, 'HH24:MI'), 'times', times,
    'canSetBaseline', coalesce(sea_operation_private.can_set_fuel_baseline(company, vessel.id), false),
    'updatesFuelBaseline', sea_operation_private.fuel_tank_selection_covers_main(vessel),
    'tanks', sea_operation_private.fuel_tank_configuration(vessel), 'reading', saved);
end;
$$;

create or replace function sea_operation_private.save_fuel_tanks(
  p_vessel_id bigint, p_date date, p_time time, p_expected_version integer, p_readings jsonb, p_legacy_rebase boolean
) returns jsonb
language plpgsql set search_path = '' as $$
declare
  company bigint := sea_operation_private.company_id();
  vessel public.vessels;
  saved_version integer;
  saved_tanks jsonb;
  saved_covers_main boolean;
  configuration jsonb;
  covers_main boolean;
  tank jsonb;
  reading jsonb;
  unit text;
  quantity numeric;
  capacity numeric;
  liters numeric;
  main_liters numeric := 0;
  tanks jsonb := '[]'::jsonb;
  observed_at timestamptz;
  recorded_at timestamptz;
begin
  if auth.uid() is null or not coalesce(sea_operation_private.can_read(company), false)
    or not coalesce(sea_operation_private.can_set_fuel_baseline(company, p_vessel_id), false) then
    raise exception 'La saisie des soutes est réservée au Capitaine affecté ou aux responsables habilités.' using errcode = '42501';
  end if;
  select * into vessel from public.vessels where id = p_vessel_id and company_id = company and active and asset_kind = 'vessel'
    and sea_operation_private.fuel_stock_vessel_supported(name, acronym) for update;
  if not found then raise exception 'Navire inaccessible.' using errcode = '42501'; end if;
  observed_at := sea_operation_private.fuel_reading_instant(p_date, p_time);

  select snapshot.version, snapshot.tanks, snapshot.updates_fuel_baseline into saved_version, saved_tanks, saved_covers_main
  from sea_operation_private.fuel_tank_readings snapshot
  where vessel_id = vessel.id and reading_date = p_date and reading_time = p_time;
  if p_expected_version is distinct from saved_version then
    if p_expected_version is null and not p_legacy_rebase then
      raise exception 'Un relevé existe déjà à cette date et à cette heure.' using errcode = '40001';
    end if;
    raise exception 'Le relevé a été modifié. Rechargez-le avant de continuer.' using errcode = '40001';
  end if;

  configuration := sea_operation_private.fuel_tank_configuration(vessel);
  covers_main := sea_operation_private.fuel_tank_selection_covers_main(vessel);
  if saved_version is not null and (
    covers_main is distinct from saved_covers_main
    or (select array_agg(tank_data->>'key' order by tank_data->>'key') from jsonb_array_elements(saved_tanks) tank_data)
      is distinct from (select array_agg(tank_data->>'key' order by tank_data->>'key') from jsonb_array_elements(configuration) tank_data)
  ) then
    raise exception 'Les cuves suivies ont changé. Saisissez un nouveau relevé à une autre heure.' using errcode = '22023';
  end if;
  if jsonb_array_length(configuration) = 0 then
    raise exception 'Activez au moins une cuve dans les capacités du navire.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_readings) is distinct from 'array' then
    raise exception 'Renseignez le niveau de chaque soute configurée.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_readings) <> jsonb_array_length(configuration) then
    raise exception 'Renseignez le niveau de chaque soute configurée.' using errcode = '22023';
  end if;

  for tank in select value from jsonb_array_elements(configuration) loop
    select value into reading from jsonb_array_elements(p_readings) where value->>'key' = tank->>'key';
    if jsonb_typeof(reading) is distinct from 'object' or reading - array['key', 'unit', 'value'] <> '{}'::jsonb
      or jsonb_typeof(reading->'unit') is distinct from 'string'
      or jsonb_typeof(reading->'value') is distinct from 'number' then
      raise exception 'Vérifiez le relevé de la soute %.', tank->>'name' using errcode = '22023';
    end if;
    unit := reading->>'unit';
    quantity := (reading->>'value')::numeric;
    capacity := (tank->>'capacityLiters')::numeric;
    if unit not in ('percent', 'liters', 'm3') or quantity < 0 or quantity <> round(quantity, 3) then
      raise exception 'Saisissez une quantité positive ou nulle, avec trois décimales au maximum.' using errcode = '22023';
    end if;
    if unit = 'percent' then
      if capacity is null or quantity > 100 then
        raise exception 'La saisie en pourcentage exige une capacité connue et une valeur entre 0 et 100.' using errcode = '22023';
      end if;
      liters := case when tank->>'calibration' = 'landemer-v1' then sea_operation_private.landemer_tank_liters(quantity)
        else capacity * quantity / 100 end;
    else
      if quantity > coalesce(capacity, 10000000) / (case when unit = 'm3' then 1000 else 1 end) then
        raise exception 'Le relevé dépasse la capacité ou la limite de la soute %.', tank->>'name' using errcode = '22023';
      end if;
      liters := quantity * (case when unit = 'm3' then 1000 else 1 end);
    end if;
    liters := round(liters, 3);
    if tank->>'key' like 'main-%' then main_liters := main_liters + liters; end if;
    tanks := tanks || jsonb_build_array(tank || jsonb_build_object('unit', unit, 'value', quantity, 'liters', liters));
  end loop;

  recorded_at := clock_timestamp();
  insert into sea_operation_private.fuel_tank_readings(
    vessel_id, company_id, reading_date, reading_time, version, tanks, main_liters, saved_at, saved_by, updates_fuel_baseline
  )
  values (vessel.id, company, p_date, p_time, coalesce(saved_version, 0) + 1, tanks, main_liters,
    recorded_at, (select auth.uid()), covers_main)
  on conflict (vessel_id, reading_date, reading_time) do update set version = excluded.version, tanks = excluded.tanks,
    main_liters = excluded.main_liters, saved_at = excluded.saved_at, saved_by = excluded.saved_by, superseded = false,
    updates_fuel_baseline = excluded.updates_fuel_baseline;

  if covers_main and (p_legacy_rebase or not exists (
    select 1 from sea_operation_private.fuel_baselines baseline
    where baseline.vessel_id = vessel.id and baseline.company_id = company
      and coalesce(baseline.baseline_date::timestamp at time zone 'Europe/Paris', baseline.measured_at) > observed_at
  )) then
    -- Midnight retains opening-balance semantics; later measurements already include that day's fuel use.
    perform sea_operation_private.write_fuel_baseline(vessel, main_liters,
      case when p_time = time '00:00' then p_date end,
      case when p_time = time '00:00' then recorded_at else observed_at end);
  end if;
  return sea_operation_private.fuel_tanks(vessel.id, p_date, p_time);
end;
$$;

create or replace function sea_operation_private.save_fuel_baseline(p_vessel_id bigint, p_unit text, p_value numeric, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  company bigint := sea_operation_private.company_id();
  vessel public.vessels;
  capacity numeric;
  liters numeric;
  measured_at timestamptz;
begin
  if not coalesce(sea_operation_private.can_read(company), false)
    or not coalesce(sea_operation_private.can_set_fuel_baseline(company, p_vessel_id), false) then
    raise exception 'La saisie du stock de carburant est réservée au Capitaine affecté ou aux responsables habilités.' using errcode = '42501';
  end if;
  select * into vessel from public.vessels where id = p_vessel_id and company_id = company and active and asset_kind = 'vessel'
    and sea_operation_private.fuel_stock_vessel_supported(name, acronym) for update;
  if not found then raise exception 'Navire inaccessible.' using errcode = '42501'; end if;

  if p_date is not null and not sea_operation_private.valid_fuel_reading_date(p_date) then
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

  measured_at := clock_timestamp();
  perform sea_operation_private.write_fuel_baseline(vessel, liters, p_date, measured_at);
  update sea_operation_private.fuel_tank_readings set version = version + 1, superseded = true
  where vessel_id = vessel.id and updates_fuel_baseline and reading_time = time '00:00'
    and reading_date = coalesce(p_date, (measured_at at time zone 'Europe/Paris')::date);

  return (select row_data.detail from sea_operation_private.fleet_fuel_rows(company, vessel.id) row_data);
end;
$$;

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
        'superseded', reading.superseded, 'updatesFuelBaseline', reading.updates_fuel_baseline, 'tanks', (
          select jsonb_agg(jsonb_build_object('key', tank.data->'key', 'name', tank.data->'name',
            'capacityLiters', tank.data->'capacityLiters', 'liters', tank.data->'liters')
            || case when tank.data ? 'sectionName' then jsonb_build_object('sectionName', tank.data->'sectionName')
              else '{}'::jsonb end order by tank.position)
          from jsonb_array_elements(reading.tanks) with ordinality tank(data, position)
        )
      ) end) order by row_data.vessel_id), '[]'::jsonb)
    from fleet row_data
    left join profiles normal on normal.vessel_id = row_data.vessel_id and not normal.towing
    left join profiles towing on towing.vessel_id = row_data.vessel_id and towing.towing
    left join lateral (
      select snapshot.reading_date, snapshot.reading_time, snapshot.superseded, snapshot.updates_fuel_baseline, snapshot.tanks
      from sea_operation_private.fuel_tank_readings snapshot
      where snapshot.vessel_id = row_data.vessel_id and snapshot.company_id = company and snapshot.reading_date <= today
      order by snapshot.reading_date desc, snapshot.reading_time desc limit 1
    ) reading on true
  );
end;
$$;

notify pgrst, 'reload schema';
