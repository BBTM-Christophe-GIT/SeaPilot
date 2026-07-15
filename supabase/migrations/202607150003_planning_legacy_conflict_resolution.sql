-- Planning conflict resolution across native assignments and historical imports.
--
-- Replay safety: CREATE OR REPLACE plus idempotent grants make this migration safe
-- to apply more than once. It does not mutate Planning data until the RPC is called.
-- Rollback: restore the previous function definition (or drop this overload) after
-- deploying a client that no longer calls resolve_planning_grid_conflict_cells.

create or replace function public.resolve_planning_grid_conflict_cells(
  p_cells jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  normalized_reason text := trim(coalesce(p_reason, ''));
  assignment_result jsonb;
  target_event_id bigint;
  target_period public.planning_periods%rowtype;
  target_day public.planning_days%rowtype;
  removed_dates date[];
  kept_ranges jsonb;
  kept_range jsonb;
  range_start date;
  range_end date;
  first_range boolean;
  legacy_deleted_cells integer := 0;
  legacy_affected_events integer := 0;
  legacy_split_count integer := 0;
  actor_name text;
begin
  if target_company_id is null
     or jsonb_typeof(p_cells) <> 'array'
     or jsonb_array_length(p_cells) not between 1 and 744
     or char_length(normalized_reason) not between 3 and 240 then
    raise exception using errcode = '22023', message = 'PLANNING_GRID_CONFLICT_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_cells) cell
    where nullif(cell ->> 'assignmentId', '') is null
      and (
        cell ->> 'eventKind' not in ('period', 'day')
        or coalesce(cell ->> 'eventId', '') !~ '^[1-9][0-9]*$'
      )
  ) then
    raise exception using errcode = '22023', message = 'PLANNING_GRID_CONFLICT_EVENT_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_company_id::text || ':planning-grid', 0));

  -- The existing function keeps assignment trimming/splitting behavior in one
  -- place. Legacy cells have no assignmentId and are intentionally ignored by it.
  assignment_result := public.remove_planning_grid_cells(p_cells, normalized_reason);

  select coalesce(nullif(trim(profile.display_name), ''), profile.email)
  into actor_name
  from public.profiles profile
  where profile.id = (select auth.uid());
  actor_name := coalesce(actor_name, (select auth.uid())::text);

  for target_event_id in
    select distinct (cell ->> 'eventId')::bigint
    from jsonb_array_elements(p_cells) cell
    where cell ->> 'eventKind' = 'period'
    order by 1
  loop
    select period_record.*
    into target_period
    from public.planning_periods period_record
    where period_record.id = target_event_id
      and period_record.company_id = target_company_id
    for update;
    if not found then
      continue;
    end if;

    select array_agg(distinct work_date order by work_date)
    into removed_dates
    from (
      select nullif(cell ->> 'workDate', '')::date as work_date
      from jsonb_array_elements(p_cells) cell
      where cell ->> 'eventKind' = 'period'
        and (cell ->> 'eventId')::bigint = target_event_id
    ) selected
    where work_date between target_period.starts_on and target_period.ends_on;

    if coalesce(array_length(removed_dates, 1), 0) = 0 then
      continue;
    end if;
    if not public.planning_user_can(
      'edit_event', target_company_id, target_period.vessel_id,
      removed_dates[1], removed_dates[array_length(removed_dates, 1)]
    ) then
      raise exception using errcode = '42501', message = 'PLANNING_GRID_CONFLICT_FORBIDDEN';
    end if;

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
          from generate_series(target_period.starts_on, target_period.ends_on, interval '1 day') day_value
          where not (day_value::date = any(removed_dates))
        ) generated
      ) numbered
      group by island_key
    ) islands;

    if jsonb_array_length(kept_ranges) = 0 then
      delete from public.planning_periods where id = target_event_id;
    else
      first_range := true;
      for kept_range in select value from jsonb_array_elements(kept_ranges)
      loop
        range_start := (kept_range ->> 'startsOn')::date;
        range_end := (kept_range ->> 'endsOn')::date;
        if first_range then
          update public.planning_periods
          set starts_on = range_start,
              ends_on = range_end,
              year_number = extract(year from range_start)::integer,
              source_label = 'seapilot-grid-trim',
              slot365_source_id = null,
              slot365_source_key = null,
              sharepoint_site_url = null,
              sharepoint_list_id = null,
              sharepoint_list_title = null,
              sharepoint_item_id = null,
              sharepoint_unique_id = null,
              sharepoint_file_ref = null,
              sharepoint_encoded_abs_url = null,
              source_modified_at = null,
              updated_at = now()
          where id = target_event_id;
          first_range := false;
        else
          insert into public.planning_periods (
            company_id, person_id, vessel_id, crew_name, vessel_name,
            manual_vessel_name, watch_group, function_label, sailor_status,
            starts_on, ends_on, year_number, comments, source_label
          ) values (
            target_period.company_id, target_period.person_id, target_period.vessel_id,
            target_period.crew_name, target_period.vessel_name,
            target_period.manual_vessel_name, target_period.watch_group,
            target_period.function_label, target_period.sailor_status,
            range_start, range_end, extract(year from range_start)::integer,
            target_period.comments, 'seapilot-grid-split'
          );
          legacy_split_count := legacy_split_count + 1;
        end if;
      end loop;
    end if;

    insert into public.planning_change_log (
      company_id, entity_kind, entity_id, action, payload, changed_by,
      changed_by_name, vessel_id, starts_on, ends_on, summary
    ) values (
      target_company_id, 'period', target_event_id, 'unassign',
      jsonb_build_object('reason', normalized_reason, 'removed_dates', to_jsonb(removed_dates)),
      (select auth.uid()), actor_name, target_period.vessel_id,
      removed_dates[1], removed_dates[array_length(removed_dates, 1)],
      'Chevauchement historique retiré du planning : ' || normalized_reason
    );

    legacy_affected_events := legacy_affected_events + 1;
    legacy_deleted_cells := legacy_deleted_cells + array_length(removed_dates, 1);
  end loop;

  for target_event_id in
    select distinct (cell ->> 'eventId')::bigint
    from jsonb_array_elements(p_cells) cell
    where cell ->> 'eventKind' = 'day'
    order by 1
  loop
    select day_record.*
    into target_day
    from public.planning_days day_record
    where day_record.id = target_event_id
      and day_record.company_id = target_company_id
    for update;
    if not found then
      continue;
    end if;

    if not exists (
      select 1
      from jsonb_array_elements(p_cells) cell
      where cell ->> 'eventKind' = 'day'
        and (cell ->> 'eventId')::bigint = target_event_id
        and nullif(cell ->> 'workDate', '')::date = target_day.work_date
    ) then
      continue;
    end if;
    if not public.planning_user_can(
      'edit_event', target_company_id, target_day.vessel_id,
      target_day.work_date, target_day.work_date
    ) then
      raise exception using errcode = '42501', message = 'PLANNING_GRID_CONFLICT_FORBIDDEN';
    end if;

    delete from public.planning_days where id = target_event_id;

    insert into public.planning_change_log (
      company_id, entity_kind, entity_id, action, payload, changed_by,
      changed_by_name, vessel_id, starts_on, ends_on, summary
    ) values (
      target_company_id, 'day', target_event_id, 'unassign',
      jsonb_build_object('reason', normalized_reason, 'removed_dates', jsonb_build_array(target_day.work_date)),
      (select auth.uid()), actor_name, target_day.vessel_id,
      target_day.work_date, target_day.work_date,
      'Chevauchement journalier retiré du planning : ' || normalized_reason
    );

    legacy_affected_events := legacy_affected_events + 1;
    legacy_deleted_cells := legacy_deleted_cells + 1;
  end loop;

  return jsonb_build_object(
    'deletedCells', coalesce((assignment_result ->> 'deletedCells')::integer, 0) + legacy_deleted_cells,
    'affectedAssignments', coalesce((assignment_result ->> 'affectedAssignments')::integer, 0),
    'createdAssignmentSplits', coalesce((assignment_result ->> 'createdSplits')::integer, 0),
    'affectedLegacyEvents', legacy_affected_events,
    'createdLegacySplits', legacy_split_count
  );
end;
$$;

revoke all on function public.resolve_planning_grid_conflict_cells(jsonb, text) from public, anon, authenticated;
grant execute on function public.resolve_planning_grid_conflict_cells(jsonb, text) to authenticated;

comment on function public.resolve_planning_grid_conflict_cells(jsonb, text) is
  'Atomically resolves selected Planning overlaps across native assignments and historical period/day imports, preserving adjacent dates and recording the explicit reason.';
