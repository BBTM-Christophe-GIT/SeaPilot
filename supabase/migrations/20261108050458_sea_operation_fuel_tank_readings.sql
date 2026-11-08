alter table public.vessels add column daily_fuel_tank_name text,
  add constraint vessels_daily_fuel_tank_name_valid check (daily_fuel_tank_name is null
    or (daily_fuel_tank_capacity_liters is not null and length(daily_fuel_tank_name) between 1 and 80
      and daily_fuel_tank_name = regexp_replace(daily_fuel_tank_name, '^\s+|\s+$', '', 'g')));

create table sea_operation_private.fuel_tank_readings (
  vessel_id bigint not null,
  company_id bigint not null,
  reading_date date not null check (isfinite(reading_date) and reading_date >= date '1900-01-01'),
  version integer not null check (version > 0),
  tanks jsonb not null check (jsonb_typeof(tanks) = 'array' and jsonb_array_length(tanks) between 1 and 21),
  main_liters numeric not null check (main_liters >= 0 and main_liters < 'Infinity'::numeric),
  saved_at timestamptz not null,
  saved_by uuid not null references public.profiles(id) on delete restrict,
  superseded boolean not null default false,
  primary key (vessel_id, reading_date),
  foreign key (vessel_id, company_id) references public.vessels(id, company_id) on delete cascade
);
alter table sea_operation_private.fuel_tank_readings enable row level security;
revoke all on table sea_operation_private.fuel_tank_readings from public, anon, authenticated, service_role;

create function sea_operation_private.fuel_tank_configuration(p_vessel public.vessels) returns jsonb
language sql stable set search_path = '' as $$
  with configuration as (
    select coalesce(p_vessel.fuel_tank_capacities_liters,
      array[sea_operation_private.main_fuel_capacity(null, p_vessel.fuel_capacity_m3)]) as capacities,
      p_vessel.imo_number = '9059262' and p_vessel.registration_number = '941334'
        and p_vessel.fuel_tank_capacities_liters = array[12357, 12357]::numeric[]
        and exists (select 1 from public.companies where id = p_vessel.company_id and code = 'bbtm') as calibrated
  ), main_tanks as (
    select tank.ordinality as position,
      jsonb_build_object('key', 'main-' || tank.ordinality, 'name', case
        when cardinality(configuration.capacities) = 1 then 'Cuve'
        when cardinality(configuration.capacities) = 2 then
          case when tank.ordinality = 1 then 'Cuve Bâbord' else 'Cuve Tribord' end
        else coalesce(p_vessel.fuel_tank_names[array_lower(p_vessel.fuel_tank_names, 1) + tank.ordinality::integer - 1],
          'Cuve ' || tank.ordinality) end, 'capacityLiters', tank.liters)
      || case when configuration.calibrated then '{"calibration":"landemer-v1"}'::jsonb else '{}'::jsonb end as tank_data
    from configuration cross join lateral unnest(configuration.capacities) with ordinality tank(liters, ordinality)
  )
  select jsonb_agg(tank_data order by position) from (
    select position, tank_data from main_tanks
    union all
    select 21, jsonb_build_object('key', 'day', 'name', coalesce(p_vessel.daily_fuel_tank_name, 'Caisse journalière'),
      'capacityLiters', p_vessel.daily_fuel_tank_capacity_liters)
    where p_vessel.daily_fuel_tank_capacity_liters is not null
  ) tanks;
$$;

create function sea_operation_private.valid_fuel_reading_date(p_date date) returns boolean
language sql stable set search_path = '' as $$
  select p_date is not null and isfinite(p_date)
    and p_date between date '1900-01-01' and (statement_timestamp() at time zone 'Europe/Paris')::date;
$$;

create function sea_operation_private.write_fuel_baseline(
  p_vessel public.vessels, p_liters numeric, p_date date, p_measured_at timestamptz
) returns void
language sql set search_path = '' as $$
  insert into sea_operation_private.fuel_baselines(vessel_id, company_id, fuel_liters, measured_at, measured_by, baseline_date)
  values (p_vessel.id, p_vessel.company_id, p_liters, p_measured_at, (select auth.uid()), p_date)
  on conflict (vessel_id) do update set fuel_liters = excluded.fuel_liters, measured_at = excluded.measured_at,
    measured_by = excluded.measured_by, baseline_date = excluded.baseline_date;
$$;

create function sea_operation_private.fuel_tanks(p_vessel_id bigint, p_date date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  company bigint := sea_operation_private.company_id();
  vessel public.vessels;
  saved jsonb;
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

  select jsonb_build_object('version', reading.version, 'savedAt', reading.saved_at, 'mainLiters', reading.main_liters,
    'superseded', reading.superseded, 'tanks', reading.tanks) into saved
  from sea_operation_private.fuel_tank_readings reading
  where reading.company_id = company and reading.vessel_id = vessel.id and reading.reading_date = p_date;
  return jsonb_build_object('vesselId', vessel.id, 'date', p_date,
    'canSetBaseline', coalesce(sea_operation_private.can_set_fuel_baseline(company, vessel.id), false),
    'tanks', sea_operation_private.fuel_tank_configuration(vessel), 'reading', saved);
end;
$$;

create function sea_operation_private.save_fuel_tanks(
  p_vessel_id bigint, p_date date, p_expected_version integer, p_readings jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
  measured_at timestamptz;
begin
  if auth.uid() is null or not coalesce(sea_operation_private.can_read(company), false)
    or not coalesce(sea_operation_private.can_set_fuel_baseline(company, p_vessel_id), false) then
    raise exception 'La saisie des soutes est réservée au Capitaine affecté ou aux responsables habilités.' using errcode = '42501';
  end if;
  select * into vessel from public.vessels where id = p_vessel_id and company_id = company and active and asset_kind = 'vessel'
    and sea_operation_private.fuel_stock_vessel_supported(name, acronym) for update;
  if not found then raise exception 'Navire inaccessible.' using errcode = '42501'; end if;
  if not sea_operation_private.valid_fuel_reading_date(p_date) then
    raise exception 'La date du relevé doit être aujourd’hui ou une date passée valide.' using errcode = '22023';
  end if;

  select version into saved_version from sea_operation_private.fuel_tank_readings
  where vessel_id = vessel.id and reading_date = p_date;
  if p_expected_version is distinct from saved_version then
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

  measured_at := clock_timestamp();
  insert into sea_operation_private.fuel_tank_readings(vessel_id, company_id, reading_date, version, tanks, main_liters, saved_at, saved_by)
  values (vessel.id, company, p_date, coalesce(saved_version, 0) + 1, tanks, main_liters, measured_at, (select auth.uid()))
  on conflict (vessel_id, reading_date) do update set version = excluded.version, tanks = excluded.tanks,
    main_liters = excluded.main_liters, saved_at = excluded.saved_at, saved_by = excluded.saved_by, superseded = false;

  perform sea_operation_private.write_fuel_baseline(vessel, main_liters, p_date, measured_at);
  return sea_operation_private.fuel_tanks(vessel.id, p_date);
end;
$$;

create function public.sea_operation_fuel_tanks(p_vessel_id bigint, p_date date) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select sea_operation_private.fuel_tanks(p_vessel_id, p_date);
$$;

create function public.sea_operation_save_fuel_tanks(
  p_vessel_id bigint, p_date date, p_expected_version integer, p_readings jsonb
) returns jsonb
language sql security invoker set search_path = '' as $$
  select sea_operation_private.save_fuel_tanks(p_vessel_id, p_date, p_expected_version, p_readings);
$$;

revoke all on function sea_operation_private.fuel_tank_configuration(public.vessels),
  sea_operation_private.valid_fuel_reading_date(date),
  sea_operation_private.write_fuel_baseline(public.vessels, numeric, date, timestamptz),
  sea_operation_private.fuel_tanks(bigint, date), sea_operation_private.save_fuel_tanks(bigint, date, integer, jsonb),
  public.sea_operation_fuel_tanks(bigint, date), public.sea_operation_save_fuel_tanks(bigint, date, integer, jsonb)
from public, anon, authenticated, service_role;
grant execute on function sea_operation_private.fuel_tanks(bigint, date),
  sea_operation_private.save_fuel_tanks(bigint, date, integer, jsonb),
  public.sea_operation_fuel_tanks(bigint, date), public.sea_operation_save_fuel_tanks(bigint, date, integer, jsonb)
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
  where vessel_id = vessel.id and reading_date = coalesce(p_date, (measured_at at time zone 'Europe/Paris')::date);

  return (select row_data.detail from sea_operation_private.fleet_fuel_rows(company, vessel.id) row_data);
end;
$$;

notify pgrst, 'reload schema';
