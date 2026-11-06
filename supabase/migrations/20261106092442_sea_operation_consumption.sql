-- One independently editable annex per voyage, including revisions of a signed plan.
create table sea_operation_private.consumption (
  lineage_id uuid primary key references public.sea_operations(id) on delete restrict,
  operation_id uuid not null references public.sea_operations(id) on delete restrict,
  company_id bigint not null,
  vessel_id bigint not null,
  version integer not null check (version > 0),
  inputs jsonb not null check (jsonb_typeof(inputs) = 'object'),
  results jsonb not null check (jsonb_typeof(results) = 'object'),
  actual_period tstzrange,
  included_in_reference boolean not null,
  updated_at timestamptz not null,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  foreign key (vessel_id, company_id) references public.vessels(id, company_id) on delete restrict,
  check (not included_in_reference or actual_period is not null)
);
create index sea_operation_consumption_vessel_history_idx on sea_operation_private.consumption(company_id, vessel_id)
  where included_in_reference;
alter table sea_operation_private.consumption enable row level security;
revoke all on sea_operation_private.consumption from public, anon, authenticated, service_role;

create function sea_operation_private.consumption_lineage(p_id uuid) returns uuid
language sql stable set search_path = '' as $$
  with recursive ancestry(id) as (
    select p_id
    union
    select previous.operation_id from ancestry
    join sea_operation_private.record_administration previous on previous.superseded_by_id = ancestry.id
  )
  select id from ancestry where not exists (
    select 1 from sea_operation_private.record_administration where superseded_by_id = ancestry.id
  );
$$;

create function sea_operation_private.can_edit_consumption(p_record public.sea_operations) returns boolean
language sql stable set search_path = '' as $$
  select p_record.status = 'signed' and p_record.draft->>'decision' = 'GO' and p_record.vessel_id is not null
    and sea_operation_private.record_is_current(p_record.id) and sea_operation_private.can_read(p_record.company_id)
    and (public.has_company_role(p_record.company_id, array['admin', 'direction', 'armement'])
      or (p_record.signed_by = (select auth.uid()) and public.has_company_role(p_record.company_id, array['capitaine'])));
$$;

create function sea_operation_private.consumption_calibration(p_record public.sea_operations) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce((
    select jsonb_build_object('kind', calibration.kind,
      'defaultGaugeUnit', case when calibration.kind = 'suroit' then 'cm' else 'percent' end,
      'nominalCapacityLiters', case when vessel.fuel_capacity_m3 > 0 and vessel.fuel_capacity_m3 <> 'NaN'::numeric
        then vessel.fuel_capacity_m3 * 1000 end)
    from public.vessels vessel join public.companies company on company.id = vessel.company_id
    cross join lateral (select case
      when company.code = 'bbtm' and vessel.registration_number = '937905' and vessel.mmsi = '228098070' then 'rozel'
      when company.code = 'bbtm' and vessel.registration_number = '926637' and vessel.mmsi = '227779340' then 'suroit'
      when vessel.fuel_capacity_m3 > 0 and vessel.fuel_capacity_m3 <> 'NaN'::numeric then 'nominal'
      else 'unavailable' end as kind) calibration
    where vessel.id = p_record.vessel_id and vessel.company_id = p_record.company_id and vessel.asset_kind = 'vessel'
  ), '{"kind":"unavailable","defaultGaugeUnit":"percent","nominalCapacityLiters":null}'::jsonb);
$$;

create function sea_operation_private.consumption_gauge_liters(p_kind text, p_unit text, p_gauge numeric, p_capacity numeric) returns numeric
language sql immutable set search_path = '' as $$
  select case
    when p_kind = 'rozel' and p_unit = 'percent' then
      2 * (22684 * power(fraction, 4) - 58886 * power(fraction, 3) + 45082 * power(fraction, 2) - 1048 * fraction + 165.5)
    when p_kind = 'suroit' and p_unit = 'cm' then p_gauge * 34.3
    when p_unit = 'percent' then p_capacity * fraction
  end from (select p_gauge / 100 as fraction) gauge;
$$;

create function sea_operation_private.consumption_reference(p_record public.sea_operations) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('vesselId', p_record.vessel_id,
    'transitLitersPerNm', rates.transit_rate, 'towageLitersPerNm', rates.towage_rate,
    'pricePerLiter', price.price_eur_per_liter_ht, 'priceDate', price.price_date)
  from (
    select max(rate.fuel_liters / nullif(rate.distance_nm, 0)) filter (where not rate.towing) as transit_rate,
      max(rate.fuel_liters / nullif(rate.distance_nm, 0)) filter (where rate.towing) as towage_rate
    from public.project_fuel_vessel_rates rate
    where rate.company_id = p_record.company_id and rate.vessel_id = p_record.vessel_id
  ) rates
  left join lateral (
    select observation.price_eur_per_liter_ht, observation.price_date
    from public.project_fuel_price_observations observation
    where observation.company_id = p_record.company_id and observation.price_date <= (now() at time zone 'Europe/Paris')::date
    order by observation.price_date desc limit 1
  ) price on true;
$$;

create function sea_operation_private.consumption_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  operation public.sea_operations;
  measurement jsonb;
begin
  select * into operation from public.sea_operations where id = p_id;
  if operation.id is null or not coalesce(sea_operation_private.can_read(operation.company_id), false)
    or sea_operation_private.record_is_deleted(p_id) then
    raise exception 'Opération inaccessible.' using errcode = '42501';
  end if;

  if operation.status = 'signed' and operation.draft->>'decision' = 'GO' then
    select reading.inputs || reading.results || jsonb_build_object('version', reading.version,
      'updatedAt', reading.updated_at, 'includedInReference', reading.included_in_reference)
    into measurement from sea_operation_private.consumption reading
    where reading.lineage_id = sea_operation_private.consumption_lineage(p_id)
      and reading.company_id = operation.company_id and reading.vessel_id = operation.vessel_id;
  end if;

  return jsonb_build_object('operationId', p_id, 'canEdit', coalesce(sea_operation_private.can_edit_consumption(operation), false),
    'calibration', sea_operation_private.consumption_calibration(operation), 'record', measurement,
    'reference', sea_operation_private.consumption_reference(operation));
end;
$$;

create function sea_operation_private.save_consumption(p_id uuid, p_expected_version integer, p_inputs jsonb) returns jsonb
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
      'refuelLiters', 'pricePerLiter', 'actualArrival', 'completed'] <> '{}'::jsonb then
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

  distance_nm := round(speed * duration_minutes / 60, 3);
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
    insert into public.project_fuel_price_observations(company_id, price_date, price_eur_per_liter_ht, source_label)
    values (operation.company_id, (clock_timestamp() at time zone 'Europe/Paris')::date,
      price_per_liter, left('Relevé Conso · ' || vessel_name, 160))
    on conflict (company_id, price_date) do update
    set price_eur_per_liter_ht = excluded.price_eur_per_liter_ht, source_label = excluded.source_label;
  end if;

  insert into sea_operation_private.consumption(lineage_id, operation_id, company_id, vessel_id, version,
    inputs, results, actual_period, included_in_reference, updated_at, updated_by)
  values (lineage, p_id, operation.company_id, operation.vessel_id, coalesce(previous.version, 0) + 1,
    jsonb_build_object('durationMinutes', duration_minutes, 'averageSpeedKnots', speed, 'gaugeUnit', gauge_unit,
      'departureGauge', departure_gauge, 'arrivalGauge', arrival_gauge, 'refuelLiters', refuel_liters,
      'pricePerLiter', price_per_liter, 'actualArrival', p_inputs->>'actualArrival', 'completed', true),
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

create function sea_operation_private.remove_consumption_reference_on_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  lineage uuid := sea_operation_private.consumption_lineage(new.operation_id);
  reading sea_operation_private.consumption;
begin
  update sea_operation_private.consumption set included_in_reference = false
  where lineage_id = lineage and included_in_reference returning * into reading;
  if found then
    delete from public.vessel_fuel_reference_samples
    where company_id = reading.company_id and vessel_id = reading.vessel_id and source_key = 'sea-operation:' || lineage::text;
  end if;
  return new;
end;
$$;
create trigger sea_operation_consumption_reference_deleted after insert on sea_operation_private.record_administration
for each row when (new.deleted_at is not null) execute function sea_operation_private.remove_consumption_reference_on_delete();

create function public.sea_operation_consumption(p_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select sea_operation_private.consumption_detail(p_id); $$;
create function public.sea_operation_save_consumption(p_id uuid, p_expected_version integer, p_inputs jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select sea_operation_private.save_consumption(p_id, p_expected_version, p_inputs); $$;

revoke all on function sea_operation_private.consumption_lineage(uuid),
  sea_operation_private.can_edit_consumption(public.sea_operations), sea_operation_private.consumption_calibration(public.sea_operations),
  sea_operation_private.consumption_gauge_liters(text, text, numeric, numeric), sea_operation_private.consumption_reference(public.sea_operations),
  sea_operation_private.consumption_detail(uuid),
  sea_operation_private.save_consumption(uuid, integer, jsonb), sea_operation_private.remove_consumption_reference_on_delete(),
  public.sea_operation_consumption(uuid), public.sea_operation_save_consumption(uuid, integer, jsonb)
from public, anon, authenticated, service_role;
grant execute on function sea_operation_private.consumption_detail(uuid), sea_operation_private.save_consumption(uuid, integer, jsonb),
  public.sea_operation_consumption(uuid), public.sea_operation_save_consumption(uuid, integer, jsonb) to authenticated;
