-- GRY - Dossier de Stabilité, chapitre 8, CAP JEAN (OMI 9213870).
-- Points [hauteur de référence Z/0H en mm, volume en L], sans assiette ni gîte.
-- Les lignes 0 % et 100 % n'indiquent aucune hauteur.
create function sea_operation_private.goury_fuel_sounding(p_code text, p_capacity_liters numeric) returns jsonb
language sql immutable strict set search_path = '' as $$
  select calibration.points
  from (values
    -- 20S p. 46
    (array['20S'], 16790,
      '[[800,840],[1050,1680],[1460,3360],[1810,5040],[2150,6720],[2480,8400],[2810,10070],[3140,11750],[3440,13430],[3730,15110],[3870,15950],[3960,16450]]'::jsonb),
    -- 25P p. 47
    (array['25P'], 13280,
      '[[740,660],[950,1330],[1300,2660],[1590,3980],[1870,5310],[2130,6640],[2400,7970],[2660,9300],[3070,10630],[3540,11950],[3780,12620],[3920,13020]]'::jsonb),
    -- 30S p. 49, 30P p. 50
    (array['30S', '30P'], 11980,
      '[[350,600],[430,1200],[540,2400],[640,3590],[720,4790],[810,5990],[890,7190],[970,8380],[1050,9580],[1130,10780],[1180,11380],[1230,11740]]'::jsonb),
    -- 40S p. 51, 40P p. 52
    (array['40S', '40P'], 13040,
      '[[180,650],[260,1300],[380,2610],[470,3910],[550,5220],[630,6520],[710,7820],[790,9130],[870,10430],[950,11740],[1000,12390],[1040,12780]]'::jsonb),
    -- 60S p. 56, 60P p. 57
    (array['60S', '60P'], 11750,
      '[[2280,590],[2460,1180],[2680,2350],[2860,3530],[3020,4700],[3170,5880],[3310,7050],[3450,8230],[3580,9400],[3710,10580],[3780,11170],[3820,11520]]'::jsonb),
    -- 70S p. 60, 70P p. 61
    (array['70S', '70P'], 6210,
      '[[2890,310],[3020,620],[3190,1240],[3320,1860],[3430,2480],[3520,3100],[3610,3720],[3700,4350],[3780,4970],[3860,5590],[3900,5900],[3940,6080]]'::jsonb),
    -- 80P p. 62
    (array['80P'], 2380,
      '[[3950,120],[4060,240],[4280,480],[4500,710],[4720,950],[4940,1190],[5160,1430],[5380,1670],[5600,1900],[5820,2140],[5930,2260],[5990,2330]]'::jsonb)
  ) as calibration(codes, capacity_liters, points)
  where p_code = any(calibration.codes) and p_capacity_liters = calibration.capacity_liters;
$$;

create function sea_operation_private.fuel_sounding_liters(p_points jsonb, p_height_m numeric) returns numeric
language sql immutable strict set search_path = '' as $$
  with points as (
    select (point->>0)::numeric as height_mm, (point->>1)::numeric as liters
    from jsonb_array_elements(p_points) as point
  ), intervals as (
    select height_mm, liters,
      lead(height_mm) over (order by height_mm) as next_height_mm,
      lead(liters) over (order by height_mm) as next_liters
    from points
  )
  select round(liters + (p_height_m * 1000 - height_mm) * (next_liters - liters) / (next_height_mm - height_mm), 3)
  from intervals
  where p_height_m * 1000 between height_mm and next_height_mm
  order by height_mm
  limit 1;
$$;

revoke all on function sea_operation_private.goury_fuel_sounding(text, numeric),
  sea_operation_private.fuel_sounding_liters(jsonb, numeric)
  from public, anon, authenticated, service_role;

create or replace function sea_operation_private.fuel_tank_configuration(p_vessel public.vessels) returns jsonb
language sql stable set search_path = '' as $$
  with configuration as (
    select coalesce(p_vessel.fuel_tank_capacities_liters,
      array[sea_operation_private.main_fuel_capacity(null, p_vessel.fuel_capacity_m3)]) as capacities,
      p_vessel.imo_number = '9059262' and p_vessel.registration_number = '941334'
        and p_vessel.fuel_tank_capacities_liters = array[12357, 12357]::numeric[]
        and exists (select 1 from public.companies where id = p_vessel.company_id and code = 'bbtm') as landemer_calibrated,
      p_vessel.imo_number = '9213870' and p_vessel.registration_number = '934968'
        and exists (select 1 from public.companies where id = p_vessel.company_id and code = 'bbtm') as goury_calibrated
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
      || case when configuration.landemer_calibrated then '{"calibration":"landemer-v1"}'::jsonb else '{}'::jsonb end as tank_data
    from configuration cross join lateral unnest(configuration.capacities) with ordinality tank(liters, ordinality)
  ), fuel_tanks as (
    select position, tank_data from main_tanks
    union all
    select 21, jsonb_build_object('key', 'day', 'name', coalesce(p_vessel.daily_fuel_tank_name, 'Caisse journalière'),
      'capacityLiters', p_vessel.daily_fuel_tank_capacity_liters)
    where p_vessel.daily_fuel_tank_capacity_liters is not null
  ), named_tanks as (
    select position, tank_data,
      regexp_replace(substring(upper(tank_data->>'name') from '(?:^|[^[:alnum:]])([0-9]{2}[[:space:]-]*[PS])$'),
        '[[:space:]-]', '', 'g') as sounding_code
    from fuel_tanks
  ), coded_tanks as (
    select position, tank_data, sounding_code, count(*) over (partition by sounding_code) as code_count
    from named_tanks
  )
  select coalesce(jsonb_agg(tank_data order by section_position, tank_position), '[]'::jsonb) from (
    select 0::bigint as section_position, tank.position as tank_position,
      tank.tank_data || case when sounding.points is not null
        then jsonb_build_object('soundingCode', tank.sounding_code, 'soundingPoints', sounding.points)
        else '{}'::jsonb end as tank_data
    from configuration cross join coded_tanks tank
    cross join lateral (
      select case when configuration.goury_calibrated and tank.code_count = 1
        and (tank.tank_data->>'key' = 'day') = (tank.sounding_code = '80P')
        then sea_operation_private.goury_fuel_sounding(tank.sounding_code, (tank.tank_data->>'capacityLiters')::numeric) end as points
    ) sounding
    where not (tank.tank_data->>'key' = any(p_vessel.hidden_fuel_tank_keys))
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
    if jsonb_typeof(reading) is distinct from 'object' or reading - array['key', 'unit', 'value', 'soundingCode'] <> '{}'::jsonb
      or jsonb_typeof(reading->'unit') is distinct from 'string'
      or jsonb_typeof(reading->'value') is distinct from 'number' then
      raise exception 'Vérifiez le relevé de la soute %.', tank->>'name' using errcode = '22023';
    end if;
    unit := reading->>'unit';
    quantity := (reading->>'value')::numeric;
    capacity := (tank->>'capacityLiters')::numeric;
    if unit not in ('percent', 'liters', 'm3', 'm') or quantity < 0 or quantity <> round(quantity, 3) then
      raise exception 'Saisissez une quantité positive ou nulle, avec trois décimales au maximum.' using errcode = '22023';
    end if;
    if unit = 'm' then
      if jsonb_typeof(reading->'soundingCode') is distinct from 'string'
        or reading->>'soundingCode' is distinct from tank->>'soundingCode' then
        raise exception 'Le barème de la soute % est indisponible ou a changé. Rechargez le relevé.', tank->>'name' using errcode = '22023';
      end if;
      liters := sea_operation_private.fuel_sounding_liters(tank->'soundingPoints', quantity);
      if liters is null then
        raise exception 'La hauteur de référence est hors barème ou indisponible pour la soute %.', tank->>'name' using errcode = '22023';
      end if;
      tank := tank - 'soundingPoints';
    elsif reading ? 'soundingCode' then
      raise exception 'Vérifiez le relevé de la soute %.', tank->>'name' using errcode = '22023';
    elsif unit = 'percent' then
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
    if unit <> 'm' then tank := tank - array['soundingCode', 'soundingPoints']; end if;
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
