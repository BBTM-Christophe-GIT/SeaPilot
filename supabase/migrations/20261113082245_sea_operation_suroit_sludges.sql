-- The SUROIT sludge level is independent of the fuel stock and can come
-- from an older sounding when newer soundings omit this tank.
create function sea_operation_private.suroit_sludge_tank(p_company bigint, p_vessel bigint, p_today date)
returns jsonb
language sql stable set search_path = '' as $$
  with configured as (
    select 'capacity-' || (tank.data->>'id') as key, (tank.data->>'capacityLiters')::numeric as capacity_liters
    from public.vessels vessel
    join public.companies company on company.id = vessel.company_id and company.code = 'bbtm'
    cross join lateral jsonb_array_elements(vessel.capacity_sections)
      with ordinality section(data, position)
    cross join lateral jsonb_array_elements(section.data->'tanks')
      with ordinality tank(data, position)
    where vessel.company_id = p_company and vessel.id = p_vessel
      and vessel.registration_number = '926637' and vessel.mmsi = '227779340'
      and (
        public.normalize_import_label(section.data->>'name') ~ '\m(sludges?|boues?|eaux? huileuses?)\M'
        or public.normalize_import_label(tank.data->>'name') ~ '\m(sludges?|boues?)\M'
      )
    order by (tank.data->'showInSoutes' = 'true'::jsonb) desc, section.position, tank.position
    limit 1
  )
  select jsonb_build_object('capacityLiters', configured.capacity_liters, 'liters', latest.liters)
  from configured
  left join lateral (
    select (tank.data->>'liters')::numeric as liters
    from sea_operation_private.fuel_tank_readings sounding
    cross join lateral jsonb_array_elements(sounding.tanks) tank(data)
    where sounding.company_id = p_company and sounding.vessel_id = p_vessel and sounding.reading_date <= p_today
      and tank.data->>'key' = configured.key
    order by sounding.reading_date desc, sounding.reading_time desc
    limit 1
  ) latest on true;
$$;

revoke all on function sea_operation_private.suroit_sludge_tank(bigint, bigint, date)
  from public, anon, authenticated, service_role;

-- Enrich the existing scoped fleet projection without changing its visibility
-- checks, preferred vessel, fuel stock, navigation profiles or latest sounding.
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
      ) end)
      || case when sludge.data is not null then jsonb_build_object('sludgeTank', sludge.data) else '{}'::jsonb end
      order by row_data.vessel_id), '[]'::jsonb)
    from fleet row_data
    left join profiles normal on normal.vessel_id = row_data.vessel_id and not normal.towing
    left join profiles towing on towing.vessel_id = row_data.vessel_id and towing.towing
    left join lateral (
      select sea_operation_private.suroit_sludge_tank(company, row_data.vessel_id, today) as data
    ) sludge on true
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
