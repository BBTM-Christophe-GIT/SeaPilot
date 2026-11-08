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
        'date', reading.reading_date, 'superseded', reading.superseded, 'tanks', (
          select jsonb_agg(jsonb_build_object('key', tank.data->'key', 'name', tank.data->'name',
            'capacityLiters', tank.data->'capacityLiters', 'liters', tank.data->'liters') order by tank.position)
          from jsonb_array_elements(reading.tanks) with ordinality tank(data, position)
        )
      ) end) order by row_data.vessel_id), '[]'::jsonb)
    from fleet row_data
    left join lateral (
      select snapshot.reading_date, snapshot.superseded, snapshot.tanks
      from sea_operation_private.fuel_tank_readings snapshot
      where snapshot.vessel_id = row_data.vessel_id and snapshot.company_id = company and snapshot.reading_date <= today
      order by snapshot.reading_date desc limit 1
    ) reading on true
  );
end;
$$;
