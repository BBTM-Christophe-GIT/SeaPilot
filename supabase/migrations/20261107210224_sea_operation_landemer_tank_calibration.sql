-- LANDEMER's two independently measured tanks have identical supplied curves.
create function sea_operation_private.landemer_tank_liters(p_percent numeric) returns numeric
language sql immutable strict set search_path = '' as $$
  with curve(percent, liters) as (
    values (0::numeric, 0), (1, 124), (2.902, 359), (10.601, 1310), (21.980, 2716),
      (34.616, 4277), (47.439, 5862), (60.442, 7469), (73.626, 9098), (81.593, 10082),
      (84.283, 10415), (87.072, 10759), (89.961, 11116), (92.942, 11485),
      (95.965, 11858), (97.900, 12097), (98, 12110), (98.989, 12232), (100, 12357)
  ), spans as (
    select percent, liters, lead(percent) over gauges as next_percent, lead(liters) over gauges as next_liters
    from curve window gauges as (order by percent)
  )
  select liters + (p_percent - percent) * (next_liters - liters) / (next_percent - percent)
  from spans where p_percent between percent and next_percent order by percent limit 1;
$$;

create function sea_operation_private.landemer_tanks_liters(p_gauges jsonb) returns numeric
language plpgsql immutable set search_path = '' as $$
declare
  port_percent numeric;
  starboard_percent numeric;
begin
  if jsonb_typeof(p_gauges) is distinct from 'object'
    or p_gauges - array['port', 'starboard'] <> '{}'::jsonb
    or jsonb_typeof(p_gauges->'port') is distinct from 'number'
    or jsonb_typeof(p_gauges->'starboard') is distinct from 'number' then
    raise exception 'Renseignez les deux jauges bâbord et tribord du LANDEMER.' using errcode = '22023';
  end if;
  port_percent := (p_gauges->>'port')::numeric;
  starboard_percent := (p_gauges->>'starboard')::numeric;
  if port_percent not between 0 and 100 or starboard_percent not between 0 and 100
    or port_percent <> round(port_percent, 3) or starboard_percent <> round(starboard_percent, 3) then
    raise exception 'Les jauges du LANDEMER doivent être comprises entre 0 et 100 %%, avec trois décimales au maximum.'
      using errcode = '22023';
  end if;
  return sea_operation_private.landemer_tank_liters(port_percent)
    + sea_operation_private.landemer_tank_liters(starboard_percent);
end;
$$;

revoke all on function sea_operation_private.landemer_tank_liters(numeric),
  sea_operation_private.landemer_tanks_liters(jsonb) from public, anon, authenticated, service_role;

create or replace function sea_operation_private.consumption_calibration(p_record public.sea_operations) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce((
    select jsonb_build_object('kind', calibration.kind,
      'defaultGaugeUnit', case when calibration.kind = 'suroit' then 'cm' else 'percent' end,
      'nominalCapacityLiters', capacity.liters)
      || case when landemer.matches then '{"tankCalibration":"landemer-v1"}'::jsonb else '{}'::jsonb end
    from public.vessels vessel join public.companies company on company.id = vessel.company_id
    cross join lateral (select sea_operation_private.main_fuel_capacity(vessel.fuel_tank_capacities_liters, vessel.fuel_capacity_m3) as liters) capacity
    cross join lateral (select company.code = 'bbtm' and vessel.imo_number = '9059262'
      and vessel.registration_number = '941334' as matches) landemer
    cross join lateral (select case
      when company.code = 'bbtm' and vessel.registration_number = '937905' and vessel.mmsi = '228098070' then 'rozel'
      when company.code = 'bbtm' and vessel.registration_number = '926637' and vessel.mmsi = '227779340' then 'suroit'
      when landemer.matches or capacity.liters is not null then 'nominal'
      else 'unavailable' end as kind) calibration
    where vessel.id = p_record.vessel_id and vessel.company_id = p_record.company_id and vessel.asset_kind = 'vessel'
  ), '{"kind":"unavailable","defaultGaugeUnit":"percent","nominalCapacityLiters":null}'::jsonb);
$$;

create or replace function sea_operation_private.save_consumption(p_id uuid, p_expected_version integer, p_inputs jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  operation public.sea_operations;
  previous sea_operation_private.consumption;
  lineage uuid;
  reference_key text;
  calibration jsonb;
  kind text;
  gauge_unit text;
  duration_minutes integer;
  trace jsonb;
  speed numeric;
  departure_gauge numeric;
  arrival_gauge numeric;
  tank_gauges jsonb;
  refuel_liters numeric;
  price_per_liter numeric;
  actual_arrival timestamptz;
  passage_period tstzrange;
  cutoff date;
  distance_nm numeric;
  departure_liters numeric;
  arrival_liters numeric;
  consumed_liters numeric;
  is_towing boolean;
  included boolean;
  vessel_name text;
  field text;
begin
  select * into operation from public.sea_operations where id = p_id for update;
  if operation.id is null or not coalesce(sea_operation_private.can_edit_consumption(operation), false) then
    raise exception 'La saisie Conso est réservée au Capitaine signataire ou aux responsables de l’opération GO.' using errcode = '42501';
  end if;

  lineage := sea_operation_private.consumption_lineage(p_id);
  reference_key := 'sea-operation:' || lineage::text;
  select * into previous from sea_operation_private.consumption where lineage_id = lineage for update;
  if p_expected_version is distinct from (case when previous.vessel_id = operation.vessel_id then previous.version end) then
    raise exception 'Le relevé a été modifié. Rechargez-le avant de continuer.' using errcode = '40001';
  end if;

  if jsonb_typeof(p_inputs) is distinct from 'object' or p_inputs->'completed' is distinct from 'true'::jsonb
    or p_inputs - array['durationMinutes', 'averageSpeedKnots', 'gaugeUnit', 'departureGauge', 'arrivalGauge',
      'refuelLiters', 'pricePerLiter', 'actualArrival', 'completed', 'trace', 'tankGauges'] <> '{}'::jsonb then
    raise exception 'Confirmez que la navigation est terminée et vérifiez le relevé.' using errcode = '22023';
  end if;
  foreach field in array array['durationMinutes', 'averageSpeedKnots'] loop
    if jsonb_typeof(p_inputs->field) is distinct from 'number' then
      raise exception 'Les champs numériques obligatoires du relevé sont invalides.' using errcode = '22023';
    end if;
  end loop;
  foreach field in array array['refuelLiters', 'pricePerLiter'] loop
    if p_inputs ? field and jsonb_typeof(p_inputs->field) not in ('number', 'null') then
      raise exception 'Les champs d’avitaillement du relevé sont invalides.' using errcode = '22023';
    end if;
  end loop;

  calibration := sea_operation_private.consumption_calibration(operation);
  kind := calibration->>'kind';
  gauge_unit := p_inputs->>'gaugeUnit';
  if jsonb_typeof(p_inputs->'gaugeUnit') is distinct from 'string'
    or not (gauge_unit = 'percent' or (gauge_unit = 'cm' and kind = 'suroit')) then
    raise exception 'L’unité de jauge ne correspond pas au navire.' using errcode = '22023';
  end if;

  speed := (p_inputs->>'averageSpeedKnots')::numeric;
  tank_gauges := p_inputs->'tankGauges';
  if tank_gauges is null then
    if jsonb_typeof(p_inputs->'departureGauge') is distinct from 'number'
      or jsonb_typeof(p_inputs->'arrivalGauge') is distinct from 'number' then
      raise exception 'Les champs numériques obligatoires du relevé sont invalides.' using errcode = '22023';
    end if;
    departure_gauge := (p_inputs->>'departureGauge')::numeric;
    arrival_gauge := (p_inputs->>'arrivalGauge')::numeric;
    if previous.vessel_id = operation.vessel_id and previous.inputs ? 'tankGauges' then
      -- Older clients can update other fields without replacing independently measured tanks.
      if departure_gauge is distinct from (previous.inputs->>'departureGauge')::numeric
        or arrival_gauge is distinct from (previous.inputs->>'arrivalGauge')::numeric then
        raise exception 'Rechargez le relevé pour modifier les jauges bâbord et tribord du LANDEMER.' using errcode = '22023';
      end if;
      tank_gauges := previous.inputs->'tankGauges';
    end if;
  end if;

  if tank_gauges is not null then
    if calibration->>'tankCalibration' is distinct from 'landemer-v1' or gauge_unit <> 'percent' then
      raise exception 'La saisie bâbord et tribord est réservée au LANDEMER.' using errcode = '22023';
    end if;
    if jsonb_typeof(tank_gauges) is distinct from 'object'
      or tank_gauges - array['departure', 'arrival'] <> '{}'::jsonb then
      raise exception 'Renseignez les jauges du LANDEMER au départ et à l’arrivée.' using errcode = '22023';
    end if;
    departure_liters := sea_operation_private.landemer_tanks_liters(tank_gauges->'departure');
    arrival_liters := sea_operation_private.landemer_tanks_liters(tank_gauges->'arrival');
    -- Preserve the original scalar wire fields as the calibrated percentage of total capacity.
    departure_gauge := round(departure_liters * 100 / 24714, 6);
    arrival_gauge := round(arrival_liters * 100 / 24714, 6);
  end if;

  refuel_liters := (p_inputs->>'refuelLiters')::numeric;
  price_per_liter := (p_inputs->>'pricePerLiter')::numeric;
  if (p_inputs->>'durationMinutes')::numeric not between 1 and 525600
    or (p_inputs->>'durationMinutes')::numeric <> trunc((p_inputs->>'durationMinutes')::numeric)
    or speed not between 0 and 100
    or departure_gauge not between 0 and (case when gauge_unit = 'cm' then 1000 else 100 end)
    or arrival_gauge not between 0 and (case when gauge_unit = 'cm' then 1000 else 100 end)
    or refuel_liters not between 0 and 10000000
    or (price_per_liter is not null and (price_per_liter not between 0.0001 and 10000 or price_per_liter <> round(price_per_liter, 4))) then
    raise exception 'Durée, vitesse, jauges ou avitaillement hors limites.' using errcode = '22023';
  end if;
  duration_minutes := (p_inputs->>'durationMinutes')::numeric::integer;
  if (tank_gauges is null and arrival_gauge > departure_gauge)
    or (tank_gauges is not null and arrival_liters > departure_liters) then
    raise exception 'La jauge à l’arrivée dépasse celle du départ. Vérifiez les deux relevés et saisissez la jauge de départ après l’avitaillement.' using errcode = '22023';
  end if;

  if p_inputs->>'actualArrival' is not null then
    actual_arrival := sea_operation_private.capture_eta_utc(p_inputs->>'actualArrival');
    if jsonb_typeof(p_inputs->'actualArrival') <> 'string' or actual_arrival is null or actual_arrival > clock_timestamp() then
      raise exception 'L’arrivée réelle doit être une date et une heure de Paris valides et passées.' using errcode = '22023';
    end if;
    passage_period := tstzrange(actual_arrival - make_interval(mins => duration_minutes), actual_arrival, '[)');
  end if;

  if p_inputs ? 'trace' then
    if p_inputs->'trace' <> 'null'::jsonb then
      trace := p_inputs->'trace';
      perform sea_operation_private.validate_consumption_trace(trace, duration_minutes, speed);
    end if;
  elsif previous.vessel_id = operation.vessel_id
    and (previous.inputs->>'durationMinutes')::integer = duration_minutes
    and (previous.inputs->>'averageSpeedKnots')::numeric = speed then
    -- Older clients omit the trace field. A manual change to its navigation values clears it.
    trace := previous.inputs->'trace';
  end if;

  distance_nm := coalesce((trace->>'distanceNm')::numeric, round(speed * duration_minutes / 60, 3));
  if tank_gauges is null then
    departure_liters := sea_operation_private.consumption_gauge_liters(kind, gauge_unit, departure_gauge, (calibration->>'nominalCapacityLiters')::numeric);
    arrival_liters := sea_operation_private.consumption_gauge_liters(kind, gauge_unit, arrival_gauge, (calibration->>'nominalCapacityLiters')::numeric);
  end if;
  -- The starting gauge already includes any fuel taken on before departure.
  if departure_liters >= arrival_liters then
    consumed_liters := departure_liters - arrival_liters;
  end if;

  -- The supplied workbooks cover trips through these dates. Reserve distinct,
  -- chronologically confirmed, calibrated voyages for the learned rate.
  cutoff := case when kind = 'rozel' and gauge_unit = 'percent' then date '2026-11-05'
    when kind = 'suroit' and gauge_unit = 'cm' then date '2026-10-02' end;
  is_towing := case operation.draft#>>'{applicability,towing}' when 'yes' then true when 'no' then false end;
  -- Lock the vessel before checking other measurements of the same passage interval.
  select name into vessel_name from public.vessels where id = operation.vessel_id and company_id = operation.company_id for update;
  included := coalesce(cutoff is not null and (lower(passage_period) at time zone 'Europe/Paris')::date > cutoff
    and distance_nm >= 10 and round(consumed_liters, 3) > 0 and is_towing is not null
    and nullif(lower(btrim(operation.draft#>>'{vessel,departurePort}')), '')
      <> nullif(lower(btrim(operation.draft#>>'{vessel,arrivalPort}')), '')
    and not exists (select 1 from sea_operation_private.consumption other
      where other.company_id = operation.company_id and other.vessel_id = operation.vessel_id and other.lineage_id <> lineage
        and other.included_in_reference and other.actual_period && passage_period), false);

  if previous.included_in_reference then
    delete from public.vessel_fuel_reference_samples
    where company_id = previous.company_id and vessel_id = previous.vessel_id and source_key = reference_key;
  end if;
  if included then
    insert into public.vessel_fuel_reference_samples(company_id, vessel_id, towing, source_key, source_label, voyage_count, distance_nm, fuel_liters)
    values (operation.company_id, operation.vessel_id, is_towing, reference_key, 'Relevé Conso · Opération en mer', 1, distance_nm, round(consumed_liters, 3));
  end if;

  if price_per_liter is not null and price_per_liter is distinct from (previous.inputs->>'pricePerLiter')::numeric then
    insert into public.vessel_fuel_price_observations(company_id, vessel_id, price_date, price_eur_per_liter_ht, source_label)
    values (operation.company_id, operation.vessel_id, (clock_timestamp() at time zone 'Europe/Paris')::date,
      price_per_liter, left('Relevé Conso · ' || vessel_name, 160))
    on conflict (company_id, vessel_id, price_date) do update
    set price_eur_per_liter_ht = excluded.price_eur_per_liter_ht, source_label = excluded.source_label;
  end if;

  insert into sea_operation_private.consumption(lineage_id, operation_id, company_id, vessel_id, version,
    inputs, results, actual_period, included_in_reference, updated_at, updated_by)
  values (lineage, p_id, operation.company_id, operation.vessel_id, coalesce(previous.version, 0) + 1,
    jsonb_build_object('durationMinutes', duration_minutes, 'averageSpeedKnots', speed, 'gaugeUnit', gauge_unit,
      'departureGauge', departure_gauge, 'arrivalGauge', arrival_gauge, 'refuelLiters', refuel_liters,
      'pricePerLiter', price_per_liter, 'actualArrival', p_inputs->>'actualArrival', 'completed', true)
      || case when trace is null then '{}'::jsonb else jsonb_build_object('trace', trace) end
      || case when tank_gauges is null then '{}'::jsonb else jsonb_build_object('tankGauges', tank_gauges) end,
    jsonb_build_object('distanceNm', distance_nm, 'departureLiters', round(departure_liters, 3), 'arrivalLiters', round(arrival_liters, 3),
      'consumedLiters', round(consumed_liters, 3), 'litersPerHour', round(consumed_liters * 60 / duration_minutes, 3),
      'litersPerNm', round(consumed_liters / nullif(distance_nm, 0), 3), 'costEuros', round(consumed_liters * price_per_liter, 2)),
    passage_period, included, clock_timestamp(), (select auth.uid()))
  on conflict (lineage_id) do update set operation_id = excluded.operation_id, vessel_id = excluded.vessel_id,
    version = excluded.version, inputs = excluded.inputs, results = excluded.results, actual_period = excluded.actual_period,
    included_in_reference = excluded.included_in_reference, updated_at = excluded.updated_at, updated_by = excluded.updated_by;

  return sea_operation_private.consumption_detail(p_id);
end;
$$;

notify pgrst, 'reload schema';
