alter table sea_operation_private.fuel_tank_readings
  add column reading_time time not null default time '00:00',
  add constraint fuel_tank_readings_whole_minute check (reading_time < time '24:00' and extract(second from reading_time) = 0),
  drop constraint fuel_tank_readings_pkey,
  add primary key (vessel_id, reading_date, reading_time);

create function sea_operation_private.fuel_reading_instant(p_date date, p_time time) returns timestamptz
language plpgsql stable set search_path = '' as $$
declare
  observation timestamptz;
begin
  if not sea_operation_private.valid_fuel_reading_date(p_date) then
    raise exception 'La date du relevé doit être aujourd’hui ou une date passée valide.' using errcode = '22023';
  end if;
  if p_time is null or p_time >= time '24:00' or extract(second from p_time) <> 0 then
    raise exception 'Renseignez une heure de relevé à la minute près.' using errcode = '22023';
  end if;
  observation := (p_date + p_time) at time zone 'Europe/Paris';
  if (observation at time zone 'Europe/Paris') <> p_date + p_time then
    raise exception 'Cette heure n’existe pas dans le fuseau horaire de Paris.' using errcode = '22023';
  end if;
  if observation > statement_timestamp() then
    raise exception 'L’heure du relevé ne peut pas être dans le futur.' using errcode = '22023';
  end if;
  return observation;
end;
$$;

create function sea_operation_private.fuel_tanks(p_vessel_id bigint, p_date date, p_time time) returns jsonb
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
      'superseded', reading.superseded, 'tanks', reading.tanks)) filter (where reading.reading_time = p_time))->0
  into times, saved
  from sea_operation_private.fuel_tank_readings reading
  where reading.company_id = company and reading.vessel_id = vessel.id and reading.reading_date = p_date;
  return jsonb_build_object('vesselId', vessel.id, 'date', p_date,
    'time', to_char(p_date + p_time, 'HH24:MI'), 'times', times,
    'canSetBaseline', coalesce(sea_operation_private.can_set_fuel_baseline(company, vessel.id), false),
    'tanks', sea_operation_private.fuel_tank_configuration(vessel), 'reading', saved);
end;
$$;

create function sea_operation_private.save_fuel_tanks(
  p_vessel_id bigint, p_date date, p_time time, p_expected_version integer, p_readings jsonb, p_legacy_rebase boolean
) returns jsonb
language plpgsql set search_path = '' as $$
declare
  company bigint := sea_operation_private.company_id();
  vessel public.vessels;
  saved_version integer;
  configuration jsonb;
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

  select version into saved_version from sea_operation_private.fuel_tank_readings
  where vessel_id = vessel.id and reading_date = p_date and reading_time = p_time;
  if p_expected_version is distinct from saved_version then
    if p_expected_version is null and not p_legacy_rebase then
      raise exception 'Un relevé existe déjà à cette date et à cette heure.' using errcode = '40001';
    end if;
    raise exception 'Le relevé a été modifié. Rechargez-le avant de continuer.' using errcode = '40001';
  end if;

  configuration := sea_operation_private.fuel_tank_configuration(vessel);
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
    if tank->>'key' <> 'day' then main_liters := main_liters + liters; end if;
    tanks := tanks || jsonb_build_array(tank || jsonb_build_object('unit', unit, 'value', quantity, 'liters', liters));
  end loop;

  recorded_at := clock_timestamp();
  insert into sea_operation_private.fuel_tank_readings(vessel_id, company_id, reading_date, reading_time, version, tanks, main_liters, saved_at, saved_by)
  values (vessel.id, company, p_date, p_time, coalesce(saved_version, 0) + 1, tanks, main_liters, recorded_at, (select auth.uid()))
  on conflict (vessel_id, reading_date, reading_time) do update set version = excluded.version, tanks = excluded.tanks,
    main_liters = excluded.main_liters, saved_at = excluded.saved_at, saved_by = excluded.saved_by, superseded = false;

  if p_legacy_rebase or not exists (
    select 1 from sea_operation_private.fuel_baselines baseline
    where baseline.vessel_id = vessel.id and baseline.company_id = company
      and coalesce(baseline.baseline_date::timestamp at time zone 'Europe/Paris', baseline.measured_at) > observed_at
  ) then
    -- Midnight retains opening-balance semantics; later measurements already include that day's fuel use.
    perform sea_operation_private.write_fuel_baseline(vessel, main_liters,
      case when p_time = time '00:00' then p_date end,
      case when p_time = time '00:00' then recorded_at else observed_at end);
  end if;
  return sea_operation_private.fuel_tanks(vessel.id, p_date, p_time);
end;
$$;

create or replace function sea_operation_private.fuel_tanks(p_vessel_id bigint, p_date date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select sea_operation_private.fuel_tanks(p_vessel_id, p_date, time '00:00') - array['time', 'times'];
$$;

create or replace function sea_operation_private.save_fuel_tanks(
  p_vessel_id bigint, p_date date, p_expected_version integer, p_readings jsonb
) returns jsonb
language sql security definer set search_path = '' as $$
  select sea_operation_private.save_fuel_tanks(p_vessel_id, p_date, time '00:00', p_expected_version, p_readings, true)
    - array['time', 'times'];
$$;

create function sea_operation_private.save_fuel_tanks(
  p_vessel_id bigint, p_date date, p_time time, p_expected_version integer, p_readings jsonb
) returns jsonb
language sql security definer set search_path = '' as $$
  select sea_operation_private.save_fuel_tanks(p_vessel_id, p_date, p_time, p_expected_version, p_readings, false);
$$;

create function public.sea_operation_fuel_tanks(p_vessel_id bigint, p_date date, p_time time) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select sea_operation_private.fuel_tanks(p_vessel_id, p_date, p_time);
$$;

create function public.sea_operation_save_fuel_tanks(
  p_vessel_id bigint, p_date date, p_time time, p_expected_version integer, p_readings jsonb
) returns jsonb
language sql security invoker set search_path = '' as $$
  select sea_operation_private.save_fuel_tanks(p_vessel_id, p_date, p_time, p_expected_version, p_readings);
$$;

revoke all on function sea_operation_private.fuel_reading_instant(date, time),
  sea_operation_private.fuel_tanks(bigint, date, time),
  sea_operation_private.save_fuel_tanks(bigint, date, time, integer, jsonb, boolean),
  sea_operation_private.save_fuel_tanks(bigint, date, time, integer, jsonb),
  public.sea_operation_fuel_tanks(bigint, date, time),
  public.sea_operation_save_fuel_tanks(bigint, date, time, integer, jsonb)
from public, anon, authenticated, service_role;
grant execute on function sea_operation_private.fuel_tanks(bigint, date, time),
  sea_operation_private.save_fuel_tanks(bigint, date, time, integer, jsonb),
  public.sea_operation_fuel_tanks(bigint, date, time),
  public.sea_operation_save_fuel_tanks(bigint, date, time, integer, jsonb)
to authenticated;

-- A legacy whole-vessel adjustment supersedes a same-day detailed anchor while preserving its readings.
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
  where vessel_id = vessel.id and reading_time = time '00:00'
    and reading_date = coalesce(p_date, (measured_at at time zone 'Europe/Paris')::date);

  return (select row_data.detail from sea_operation_private.fleet_fuel_rows(company, vessel.id) row_data);
end;
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
    )
    select coalesce(jsonb_agg(row_data.detail || jsonb_build_object(
      'assignedToday', coalesce(row_data.vessel_id = (select vessel_id from preferred_vessel), false),
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
    left join lateral (
      select snapshot.reading_date, snapshot.reading_time, snapshot.superseded, snapshot.tanks
      from sea_operation_private.fuel_tank_readings snapshot
      where snapshot.vessel_id = row_data.vessel_id and snapshot.company_id = company and snapshot.reading_date <= today
      order by snapshot.reading_date desc, snapshot.reading_time desc limit 1
    ) reading on true
  );
end;
$$;

notify pgrst, 'reload schema';
