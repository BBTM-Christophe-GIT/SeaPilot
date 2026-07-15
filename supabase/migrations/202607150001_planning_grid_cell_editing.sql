-- Planning v3.3.2: persisted grid painting, clipboard operations and partial removal.
-- Existing assignments and daily overrides are reused; no parallel business table is created.
--
-- Rollback strategy:
--   1. Redeploy the v3.3.1 client so these RPCs are no longer called.
--   2. Drop move_planning_grid_cells(jsonb, jsonb, text), apply_planning_grid_cells(jsonb)
--      and remove_planning_grid_cells(jsonb, text), in that order.
--   3. Drop planning_assignments_grid_lookup_idx if no other workload uses it.
-- Data created through the grid is deliberately preserved during rollback.

create index if not exists planning_assignments_grid_lookup_idx
  on public.planning_assignments (company_id, crew_person_id, vessel_id, watch_group, starts_on, ends_on)
  where confirmation_status <> 'cancelled';

create or replace function public.apply_planning_grid_cells(p_cells jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  cell jsonb;
  target_person_id bigint;
  target_vessel_id bigint;
  requested_assignment_id bigint;
  target_assignment_id bigint;
  target_date date;
  target_status text;
  target_note text;
  target_watch_group text;
  target_function text;
  target_person_name text;
  target_vessel_name text;
  target_assignment_status text;
  previous_auto_id bigint;
  previous_auto_person_id bigint;
  previous_auto_vessel_id bigint;
  previous_auto_watch_group text;
  previous_auto_function text;
  previous_auto_status text;
  previous_auto_end date;
  created_count integer := 0;
  saved_count integer := 0;
begin
  if target_company_id is null
     or jsonb_typeof(p_cells) <> 'array'
     or jsonb_array_length(p_cells) not between 1 and 744 then
    raise exception using errcode = '22023', message = 'PLANNING_GRID_CELLS_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_company_id::text || ':planning-grid', 0));

  for cell in
    select value
    from jsonb_array_elements(p_cells)
    order by
      nullif(value ->> 'personId', '')::bigint,
      nullif(value ->> 'vesselId', '')::bigint,
      coalesce(value ->> 'watchGroup', ''),
      coalesce(value ->> 'functionLabel', ''),
      nullif(value ->> 'workDate', '')::date
  loop
    target_person_id := nullif(cell ->> 'personId', '')::bigint;
    target_vessel_id := nullif(cell ->> 'vesselId', '')::bigint;
    requested_assignment_id := nullif(cell ->> 'assignmentId', '')::bigint;
    target_date := nullif(cell ->> 'workDate', '')::date;
    target_status := trim(coalesce(cell ->> 'status', ''));
    target_note := nullif(trim(coalesce(cell ->> 'note', '')), '');
    target_watch_group := coalesce(nullif(trim(coalesce(cell ->> 'watchGroup', '')), ''), 'Affectation');
    target_function := nullif(trim(coalesce(cell ->> 'functionLabel', '')), '');
    target_assignment_id := null;
    target_assignment_status := null;

    if target_person_id is null or target_vessel_id is null or target_date is null
       or target_status not in ('En Mer', 'A Terre', 'Vacance', 'Repos')
       or char_length(coalesce(cell ->> 'note', '')) > 32 then
      raise exception using errcode = '22023', message = 'PLANNING_GRID_CELL_INVALID';
    end if;

    select
      trim(concat_ws(' ', person.first_name, person.last_name)),
      coalesce(target_function, nullif(trim(person.function_label), ''), 'Équipage')
    into target_person_name, target_function
    from public.people person
    where person.id = target_person_id
      and person.company_id = target_company_id
      and person.active;
    if not found then
      raise exception using errcode = '23503', message = 'PLANNING_GRID_PERSON_NOT_FOUND';
    end if;

    select vessel.name into target_vessel_name
    from public.vessels vessel
    where vessel.id = target_vessel_id
      and vessel.company_id = target_company_id
      and vessel.active;
    if not found then
      raise exception using errcode = '23503', message = 'PLANNING_GRID_VESSEL_NOT_FOUND';
    end if;
    if not public.planning_user_can('edit_event', target_company_id, target_vessel_id, target_date, target_date) then
      raise exception using errcode = '42501', message = 'PLANNING_GRID_CELL_FORBIDDEN';
    end if;

    if requested_assignment_id is not null then
      select assignment.id, assignment.status_label
      into target_assignment_id, target_assignment_status
      from public.planning_assignments assignment
      where assignment.id = requested_assignment_id
        and assignment.company_id = target_company_id
        and assignment.crew_person_id = target_person_id
        and assignment.vessel_id = target_vessel_id
        and assignment.confirmation_status <> 'cancelled'
        and target_date between assignment.starts_on and assignment.ends_on;
    end if;

    if target_assignment_id is null then
      select assignment.id, assignment.status_label
      into target_assignment_id, target_assignment_status
      from public.planning_assignments assignment
      where assignment.company_id = target_company_id
        and assignment.crew_person_id = target_person_id
        and assignment.vessel_id = target_vessel_id
        and coalesce(nullif(trim(assignment.watch_group), ''), 'Affectation') = target_watch_group
        and assignment.confirmation_status <> 'cancelled'
        and target_date between assignment.starts_on and assignment.ends_on
      order by assignment.updated_at desc, assignment.id desc
      limit 1;
    end if;

    if target_assignment_id is not null then
      if previous_auto_id is not null and previous_auto_end is not null then
        update public.planning_assignments
        set ends_on = previous_auto_end,
            ends_at = (previous_auto_end + time '20:00') at time zone 'Europe/Paris',
            updated_at = now()
        where id = previous_auto_id;
      end if;
      previous_auto_id := null;
      previous_auto_end := null;
    elsif previous_auto_id is not null
      and previous_auto_person_id = target_person_id
      and previous_auto_vessel_id = target_vessel_id
      and previous_auto_watch_group = target_watch_group
      and previous_auto_function = target_function
      and previous_auto_status = target_status
      and target_date = previous_auto_end + 1
    then
      target_assignment_id := previous_auto_id;
      target_assignment_status := previous_auto_status;
      previous_auto_end := target_date;
    else
      if previous_auto_id is not null and previous_auto_end is not null then
        update public.planning_assignments
        set ends_on = previous_auto_end,
            ends_at = (previous_auto_end + time '20:00') at time zone 'Europe/Paris',
            updated_at = now()
        where id = previous_auto_id;
      end if;

      insert into public.planning_assignments (
        company_id, vessel_id, crew_person_id, starts_on, ends_on, starts_at, ends_at,
        assignment_role, status_label, confirmation_status, watch_group, comments, source_label
      ) values (
        target_company_id, target_vessel_id, target_person_id, target_date, target_date,
        (target_date + time '08:00') at time zone 'Europe/Paris',
        (target_date + time '20:00') at time zone 'Europe/Paris',
        target_function, target_status, 'confirmed', target_watch_group, null, 'seapilot-grid'
      ) returning id, status_label into target_assignment_id, target_assignment_status;

      previous_auto_id := target_assignment_id;
      previous_auto_person_id := target_person_id;
      previous_auto_vessel_id := target_vessel_id;
      previous_auto_watch_group := target_watch_group;
      previous_auto_function := target_function;
      previous_auto_status := target_status;
      previous_auto_end := target_date;
      created_count := created_count + 1;
    end if;

    if target_note is null and target_status = target_assignment_status then
      delete from public.planning_days
      where company_id = target_company_id
        and slot365 = 'assignment:' || target_assignment_id::text
        and work_date = target_date
        and source_label = 'seapilot-assignment-note';
    else
      insert into public.planning_days (
        company_id, person_id, vessel_id, crew_name, vessel_name, work_date,
        year_number, month_number, month_label, day_number, function_label,
        sailor_status, day_status, watch_group, slot365, comments, source_label
      ) values (
        target_company_id, target_person_id, target_vessel_id, target_person_name,
        target_vessel_name, target_date, extract(year from target_date)::integer,
        extract(month from target_date)::integer, to_char(target_date, 'TMMonth'),
        extract(day from target_date)::integer, target_function, target_status,
        'État quotidien', target_watch_group, 'assignment:' || target_assignment_id::text,
        coalesce(target_note, ''), 'seapilot-assignment-note'
      )
      on conflict (company_id, slot365, work_date)
        where source_label = 'seapilot-assignment-note'
      do update set
        person_id = excluded.person_id,
        vessel_id = excluded.vessel_id,
        crew_name = excluded.crew_name,
        vessel_name = excluded.vessel_name,
        function_label = excluded.function_label,
        sailor_status = excluded.sailor_status,
        day_status = excluded.day_status,
        watch_group = excluded.watch_group,
        comments = excluded.comments,
        updated_at = now();
    end if;
    saved_count := saved_count + 1;
  end loop;

  if previous_auto_id is not null and previous_auto_end is not null then
    update public.planning_assignments
    set ends_on = previous_auto_end,
        ends_at = (previous_auto_end + time '20:00') at time zone 'Europe/Paris',
        updated_at = now()
    where id = previous_auto_id;
  end if;

  return jsonb_build_object('savedCells', saved_count, 'createdAssignments', created_count);
end;
$$;

revoke all on function public.apply_planning_grid_cells(jsonb) from public, anon, authenticated;
grant execute on function public.apply_planning_grid_cells(jsonb) to authenticated;

create or replace function public.remove_planning_grid_cells(p_cells jsonb, p_reason text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  target_assignment_id bigint;
  target_assignment public.planning_assignments%rowtype;
  removed_dates date[];
  kept_ranges jsonb;
  kept_range jsonb;
  range_start date;
  range_end date;
  first_range boolean;
  split_assignment_id bigint;
  affected_count integer := 0;
  deleted_cell_count integer := 0;
  split_count integer := 0;
  normalized_reason text := trim(coalesce(p_reason, ''));
begin
  if target_company_id is null
     or jsonb_typeof(p_cells) <> 'array'
     or jsonb_array_length(p_cells) not between 1 and 744
     or char_length(normalized_reason) not between 3 and 240 then
    raise exception using errcode = '22023', message = 'PLANNING_GRID_REMOVE_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_company_id::text || ':planning-grid', 0));

  for target_assignment_id in
    select distinct nullif(value ->> 'assignmentId', '')::bigint
    from jsonb_array_elements(p_cells)
    where nullif(value ->> 'assignmentId', '') is not null
    order by 1
  loop
    select assignment.* into target_assignment
    from public.planning_assignments assignment
    where assignment.id = target_assignment_id
      and assignment.company_id = target_company_id
      and assignment.confirmation_status <> 'cancelled'
    for update;
    if not found then
      continue;
    end if;

    select array_agg(distinct work_date order by work_date)
    into removed_dates
    from (
      select nullif(value ->> 'workDate', '')::date as work_date
      from jsonb_array_elements(p_cells)
      where nullif(value ->> 'assignmentId', '')::bigint = target_assignment_id
    ) selected
    where work_date between target_assignment.starts_on and target_assignment.ends_on;

    if coalesce(array_length(removed_dates, 1), 0) = 0 then
      continue;
    end if;
    if not public.planning_user_can(
      'edit_event', target_company_id, target_assignment.vessel_id,
      removed_dates[1], removed_dates[array_length(removed_dates, 1)]
    ) then
      raise exception using errcode = '42501', message = 'PLANNING_GRID_REMOVE_FORBIDDEN';
    end if;

    delete from public.planning_days
    where company_id = target_company_id
      and slot365 = 'assignment:' || target_assignment_id::text
      and work_date = any(removed_dates)
      and source_label = 'seapilot-assignment-note';

    select coalesce(
      jsonb_agg(jsonb_build_object('startsOn', island_start, 'endsOn', island_end) order by island_start),
      '[]'::jsonb
    )
    into kept_ranges
    from (
      select min(work_date) as island_start, max(work_date) as island_end
      from (
        select
          generated.work_date,
          generated.work_date - row_number() over (order by generated.work_date)::integer as island_key
        from (
          select day_value::date as work_date
          from generate_series(target_assignment.starts_on, target_assignment.ends_on, interval '1 day') day_value
          where not (day_value::date = any(removed_dates))
        ) generated
      ) numbered
      group by island_key
    ) islands;

    if jsonb_array_length(kept_ranges) = 0 then
      delete from public.planning_days
      where company_id = target_company_id
        and slot365 = 'assignment:' || target_assignment_id::text
        and source_label = 'seapilot-assignment-note';
      delete from public.planning_assignments where id = target_assignment_id;
    else
      first_range := true;
      for kept_range in select value from jsonb_array_elements(kept_ranges)
      loop
        range_start := (kept_range ->> 'startsOn')::date;
        range_end := (kept_range ->> 'endsOn')::date;
        if first_range then
          update public.planning_assignments
          set starts_on = range_start,
              ends_on = range_end,
              starts_at = (range_start + ((target_assignment.starts_at at time zone 'Europe/Paris')::time)) at time zone 'Europe/Paris',
              ends_at = (range_end + ((target_assignment.ends_at at time zone 'Europe/Paris')::time)) at time zone 'Europe/Paris',
              updated_at = now()
          where id = target_assignment_id;
          first_range := false;
        else
          insert into public.planning_assignments (
            company_id, vessel_id, captain_person_id, crew_person_id, starts_on, ends_on,
            starts_at, ends_at, assignment_role, status_label, confirmation_status,
            watch_group, comments, source_label
          ) values (
            target_assignment.company_id, target_assignment.vessel_id,
            target_assignment.captain_person_id, target_assignment.crew_person_id,
            range_start, range_end,
            (range_start + ((target_assignment.starts_at at time zone 'Europe/Paris')::time)) at time zone 'Europe/Paris',
            (range_end + ((target_assignment.ends_at at time zone 'Europe/Paris')::time)) at time zone 'Europe/Paris',
            target_assignment.assignment_role, target_assignment.status_label,
            target_assignment.confirmation_status, target_assignment.watch_group,
            target_assignment.comments, 'seapilot-grid-split'
          ) returning id into split_assignment_id;

          update public.planning_days
          set slot365 = 'assignment:' || split_assignment_id::text,
              updated_at = now()
          where company_id = target_company_id
            and slot365 = 'assignment:' || target_assignment_id::text
            and work_date between range_start and range_end
            and source_label = 'seapilot-assignment-note';
          split_count := split_count + 1;
        end if;
      end loop;
    end if;

    insert into public.planning_change_log (
      company_id, entity_kind, entity_id, action, payload, changed_by, changed_by_name,
      vessel_id, starts_on, ends_on, summary
    ) values (
      target_company_id, 'assignment', target_assignment_id, 'unassign',
      jsonb_build_object('reason', normalized_reason, 'removed_dates', to_jsonb(removed_dates)),
      (select auth.uid()), coalesce((
        select coalesce(nullif(trim(profile.display_name), ''), profile.email)
        from public.profiles profile
        where profile.id = (select auth.uid())
      ), (select auth.uid())::text), target_assignment.vessel_id,
      removed_dates[1], removed_dates[array_length(removed_dates, 1)],
      'Cases retirées du planning : ' || normalized_reason
    );

    affected_count := affected_count + 1;
    deleted_cell_count := deleted_cell_count + array_length(removed_dates, 1);
  end loop;

  return jsonb_build_object(
    'deletedCells', deleted_cell_count,
    'affectedAssignments', affected_count,
    'createdSplits', split_count
  );
end;
$$;

revoke all on function public.remove_planning_grid_cells(jsonb, text) from public, anon, authenticated;
grant execute on function public.remove_planning_grid_cells(jsonb, text) to authenticated;

create or replace function public.move_planning_grid_cells(
  p_source_cells jsonb,
  p_target_cells jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  applied jsonb;
  removed jsonb;
begin
  -- Both operations run in this function's transaction: a failed removal rolls
  -- back the target write instead of leaving a duplicated assignment behind.
  applied := public.apply_planning_grid_cells(p_target_cells);
  removed := public.remove_planning_grid_cells(p_source_cells, p_reason);
  return jsonb_build_object('applied', applied, 'removed', removed);
end;
$$;

revoke all on function public.move_planning_grid_cells(jsonb, jsonb, text) from public;
revoke all on function public.move_planning_grid_cells(jsonb, jsonb, text) from anon;
revoke all on function public.move_planning_grid_cells(jsonb, jsonb, text) from authenticated;
grant execute on function public.move_planning_grid_cells(jsonb, jsonb, text) to authenticated;

comment on function public.apply_planning_grid_cells(jsonb) is
  'Atomically persists painted or pasted Planning cells and creates compact native assignments for uncovered contiguous dates.';
comment on function public.remove_planning_grid_cells(jsonb, text) is
  'Atomically removes selected assignment dates, trims or splits remaining periods, and records the explicit reason in Planning history.';
comment on function public.move_planning_grid_cells(jsonb, jsonb, text) is
  'Atomically pastes target Planning cells and removes cut source cells so a failed operation cannot leave duplicates.';
