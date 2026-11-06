-- Validate the bounded measurements supplied by the GPX importer. The raw file and positions are not retained.
create function sea_operation_private.validate_consumption_trace(p_trace jsonb, p_duration integer, p_speed numeric) returns void
language plpgsql stable set search_path = '' as $$
declare
  field text;
  started_at timestamptz;
  ended_at timestamptz;
  elapsed_seconds numeric;
  distance_nm numeric;
  point_count numeric;
  sample jsonb;
  sample_minute numeric;
  previous_minute numeric := -1;
  sample_speed numeric;
begin
  if jsonb_typeof(p_trace) is distinct from 'object' or octet_length(p_trace::text) > 32768
    or p_trace - array['startedAt', 'endedAt', 'durationMinutes', 'distanceNm', 'averageSpeedKnots', 'pointCount',
      'segmentCount', 'gapCount', 'reorderedPointCount', 'excludedPointCount', 'profile'] <> '{}'::jsonb then
    raise exception 'Le résumé de la trace GPS est invalide.' using errcode = '22023';
  end if;

  foreach field in array array['startedAt', 'endedAt'] loop
    if jsonb_typeof(p_trace->field) is distinct from 'string'
      or p_trace->>field !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' then
      raise exception 'Les dates UTC de la trace GPS sont invalides.' using errcode = '22023';
    end if;
  end loop;
  started_at := (p_trace->>'startedAt')::timestamptz;
  ended_at := (p_trace->>'endedAt')::timestamptz;
  if to_char(started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> p_trace->>'startedAt'
    or to_char(ended_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> p_trace->>'endedAt'
    or ended_at <= started_at or ended_at > statement_timestamp() then
    raise exception 'Les dates UTC de la trace GPS sont invalides.' using errcode = '22023';
  end if;

  foreach field in array array['durationMinutes', 'distanceNm', 'averageSpeedKnots'] loop
    if jsonb_typeof(p_trace->field) is distinct from 'number' then
      raise exception 'Les mesures de la trace GPS sont invalides.' using errcode = '22023';
    end if;
  end loop;
  elapsed_seconds := extract(epoch from ended_at - started_at);
  distance_nm := (p_trace->>'distanceNm')::numeric;
  if (p_trace->>'durationMinutes')::numeric <> p_duration or round(elapsed_seconds / 60) <> p_duration
    or (p_trace->>'averageSpeedKnots')::numeric <> p_speed or p_speed <> round(p_speed, 4)
    or distance_nm not between 0 and 876000 or distance_nm <> round(distance_nm, 4)
    -- Distance and speed are independently rounded. UTC timestamps retain milliseconds.
    or abs(p_speed * elapsed_seconds / 3600 - distance_nm)
      > 0.000051 * (1 + elapsed_seconds / 3600) + p_speed * 0.001 / 3600 then
    raise exception 'La durée, la vitesse ou la distance ne correspond pas à la trace GPS.' using errcode = '22023';
  end if;

  foreach field in array array['pointCount', 'segmentCount', 'gapCount', 'reorderedPointCount', 'excludedPointCount'] loop
    if jsonb_typeof(p_trace->field) is distinct from 'number' then
      raise exception 'Les compteurs de la trace GPS sont invalides.' using errcode = '22023';
    end if;
    if (p_trace->>field)::numeric <> trunc((p_trace->>field)::numeric) then
      raise exception 'Les compteurs de la trace GPS sont invalides.' using errcode = '22023';
    end if;
  end loop;
  point_count := (p_trace->>'pointCount')::numeric;
  if point_count not between 2 and 50000 or (p_trace->>'segmentCount')::numeric not between 1 and point_count
    or (p_trace->>'gapCount')::numeric not between 0 and point_count - 1
    or (p_trace->>'reorderedPointCount')::numeric not between 0 and point_count - 1
    or (p_trace->>'excludedPointCount')::numeric not between 0 and point_count - 2 then
    raise exception 'Les compteurs de la trace GPS sont invalides.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_trace->'profile') is distinct from 'array' then
    raise exception 'Le profil de vitesse GPS est invalide.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_trace->'profile') not between 1 and 240 then
    raise exception 'Le profil de vitesse GPS est invalide.' using errcode = '22023';
  end if;
  for sample in select value from jsonb_array_elements(p_trace->'profile') loop
    if jsonb_typeof(sample) is distinct from 'object'
      or jsonb_typeof(sample->'elapsedMinutes') is distinct from 'number'
      or not (sample ? 'speedKnots') or jsonb_typeof(sample->'speedKnots') not in ('number', 'null')
      or sample - array['elapsedMinutes', 'speedKnots'] <> '{}'::jsonb then
      raise exception 'Le profil de vitesse GPS est invalide.' using errcode = '22023';
    end if;
    sample_minute := (sample->>'elapsedMinutes')::numeric;
    sample_speed := (sample->>'speedKnots')::numeric;
    if sample_minute <= previous_minute or sample_minute not between 0 and round(elapsed_seconds / 60, 4)
      or sample_minute <> round(sample_minute, 4)
      or sample_speed not between 0 and 100 or sample_speed <> round(sample_speed, 4) then
      raise exception 'Le profil de vitesse GPS est invalide.' using errcode = '22023';
    end if;
    previous_minute := sample_minute;
  end loop;
exception when invalid_datetime_format or datetime_field_overflow then
  raise exception 'Les dates UTC de la trace GPS sont invalides.' using errcode = '22023';
end;
$$;

revoke all on function sea_operation_private.validate_consumption_trace(jsonb, integer, numeric)
from public, anon, authenticated, service_role;

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
      'refuelLiters', 'pricePerLiter', 'actualArrival', 'completed', 'trace'] <> '{}'::jsonb then
    raise exception 'Confirmez que la navigation est terminée et vérifiez le relevé.' using errcode = '22023';
  end if;
  foreach field in array array['durationMinutes', 'averageSpeedKnots', 'departureGauge', 'arrivalGauge'] loop
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
  departure_gauge := (p_inputs->>'departureGauge')::numeric;
  arrival_gauge := (p_inputs->>'arrivalGauge')::numeric;
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
  if arrival_gauge > departure_gauge then
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
  departure_liters := sea_operation_private.consumption_gauge_liters(kind, gauge_unit, departure_gauge, (calibration->>'nominalCapacityLiters')::numeric);
  arrival_liters := sea_operation_private.consumption_gauge_liters(kind, gauge_unit, arrival_gauge, (calibration->>'nominalCapacityLiters')::numeric);
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
      || case when trace is null then '{}'::jsonb else jsonb_build_object('trace', trace) end,
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

-- Excel needs the trace summary. Keep the speed series on the detail RPC.
create or replace function sea_operation_private.consumption_export(p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  company bigint := sea_operation_private.company_id();
begin
  if not coalesce(sea_operation_private.can_read(company), false) then
    raise exception 'Accès refusé aux opérations en mer.' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) > 200 then
    raise exception 'Sélectionnez au plus 200 opérations par lot.' using errcode = '22023';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'operationId', operation.id,
      'record', (reading.inputs #- '{trace,profile}') || reading.results || jsonb_build_object(
        'version', reading.version,
        'updatedAt', reading.updated_at,
        'includedInReference', reading.included_in_reference
      )
    ) order by array_position(p_ids, operation.id))
    from public.sea_operations operation
    join sea_operation_private.consumption reading
      on reading.lineage_id = sea_operation_private.consumption_lineage(operation.id)
      and reading.company_id = operation.company_id and reading.vessel_id = operation.vessel_id
    where operation.id = any(p_ids) and operation.company_id = company
      and operation.status = 'signed' and operation.draft->>'decision' = 'GO'
      and sea_operation_private.record_is_current(operation.id)
  ), '[]'::jsonb);
end;
$$;

notify pgrst, 'reload schema';
