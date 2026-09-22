-- A dated function belongs to the assignment's daily state, never to people.
-- Existing clients retain their RPC signatures and preserve the dated function.
create or replace function public.save_planning_assignment_day_details(
  p_assignment_id bigint, p_work_date date, p_status text, p_note text,
  p_function_label text default null
)
returns bigint
language plpgsql security invoker
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  target_status text := trim(coalesce(p_status, ''));
  target_note text := nullif(trim(coalesce(p_note, '')), '');
  target_function text;
  target_assignment public.planning_assignments%rowtype;
  saved_id bigint;
begin
  if p_assignment_id is null or p_work_date is null
     or target_status not in ('En Mer', 'A Terre', 'Extra', 'Formation', 'Vacance', 'Repos', 'Arrêt Maladie', 'Accident du Travail')
     or (p_function_label is not null and (trim(p_function_label) = '' or char_length(p_function_label) > 120)) then
    raise exception using errcode = '22023', message = 'PLANNING_ASSIGNMENT_DAY_STATE_INVALID';
  end if;
  if char_length(coalesce(p_note, '')) > 32 then
    raise exception using errcode = '22001', message = 'PLANNING_ASSIGNMENT_NOTE_TOO_LONG';
  end if;
  select a.* into target_assignment from public.planning_assignments a
  where a.id = p_assignment_id and a.company_id = target_company_id
    and a.confirmation_status <> 'cancelled' for update;
  if not found or p_work_date < target_assignment.starts_on or p_work_date > target_assignment.ends_on then
    raise exception using errcode = '23503', message = 'PLANNING_ASSIGNMENT_DAY_STATE_ASSIGNMENT_NOT_FOUND';
  end if;
  if not public.planning_user_can('edit_event', target_company_id, target_assignment.vessel_id, p_work_date, p_work_date) then
    raise exception using errcode = '42501', message = 'PLANNING_ASSIGNMENT_DAY_STATE_FORBIDDEN';
  end if;
  select coalesce(nullif(trim(p_function_label), ''), nullif(trim(d.function_label), ''), target_assignment.assignment_role)
    into target_function
  from (select 1) seed left join public.planning_days d
    on d.company_id = target_company_id and d.source_label = 'seapilot-assignment-note'
      and d.slot365 = 'assignment:' || p_assignment_id::text and d.work_date = p_work_date;
  if target_note is null and target_status = target_assignment.status_label
      and target_function is not distinct from target_assignment.assignment_role then
    delete from public.planning_days where company_id = target_company_id
      and slot365 = 'assignment:' || p_assignment_id::text and work_date = p_work_date
      and source_label = 'seapilot-assignment-note' returning id into saved_id;
    return saved_id;
  end if;
  insert into public.planning_days (
    company_id, person_id, vessel_id, crew_name, vessel_name, work_date,
    year_number, month_number, month_label, day_number, function_label,
    sailor_status, day_status, watch_group, slot365, comments, source_label
  ) select target_company_id, target_assignment.crew_person_id, target_assignment.vessel_id,
    trim(concat_ws(' ', person.first_name, person.last_name)), vessel.name, p_work_date,
    extract(year from p_work_date)::integer, extract(month from p_work_date)::integer,
    to_char(p_work_date, 'TMMonth'), extract(day from p_work_date)::integer,
    target_function, target_status, 'État quotidien', target_assignment.watch_group,
    'assignment:' || target_assignment.id::text, coalesce(target_note, ''), 'seapilot-assignment-note'
  from public.people person join public.vessels vessel on vessel.id = target_assignment.vessel_id
  where person.id = target_assignment.crew_person_id
  on conflict (company_id, slot365, work_date) where source_label = 'seapilot-assignment-note'
  do update set person_id = excluded.person_id, vessel_id = excluded.vessel_id,
    crew_name = excluded.crew_name, vessel_name = excluded.vessel_name,
    function_label = excluded.function_label, sailor_status = excluded.sailor_status,
    day_status = excluded.day_status, watch_group = excluded.watch_group,
    comments = excluded.comments, updated_at = now()
  returning id into saved_id;
  return saved_id;
end;
$$;
revoke all on function public.save_planning_assignment_day_details(bigint,date,text,text,text) from public, anon;
grant execute on function public.save_planning_assignment_day_details(bigint,date,text,text,text) to authenticated;

create or replace function public.save_planning_assignment_day_details_range(
  p_assignment_id bigint, p_starts_on date, p_ends_on date, p_status text, p_note text, p_function_label text
)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare work_date date := p_starts_on; saved_days integer := 0;
begin
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then
    raise exception using errcode = '22023', message = 'PLANNING_ASSIGNMENT_DAY_STATE_INVALID';
  end if;
  perform 1 from public.planning_assignments a
  where a.id = p_assignment_id and a.company_id = public.current_planning_company_id()
    and a.confirmation_status <> 'cancelled' and a.starts_on <= p_starts_on and a.ends_on >= p_ends_on for update;
  if not found then
    raise exception using errcode = '23503', message = 'PLANNING_ASSIGNMENT_DAY_STATE_ASSIGNMENT_NOT_FOUND';
  end if;
  while work_date <= p_ends_on loop
    perform public.save_planning_assignment_day_details(p_assignment_id, work_date, p_status, p_note, p_function_label);
    saved_days := saved_days + 1;
    work_date := work_date + 1;
  end loop;
  return saved_days;
end;
$$;
revoke all on function public.save_planning_assignment_day_details_range(bigint,date,date,text,text,text) from public, anon;
grant execute on function public.save_planning_assignment_day_details_range(bigint,date,date,text,text,text) to authenticated;

create or replace function public.save_planning_assignment_day_state(
  p_assignment_id bigint, p_work_date date, p_status text, p_note text
)
returns bigint language sql security invoker set search_path = ''
as $$ select public.save_planning_assignment_day_details(p_assignment_id, p_work_date, p_status, p_note, null); $$;

create or replace function public.save_planning_assignment_day_note(
  p_assignment_id bigint, p_work_date date, p_note text
)
returns bigint language plpgsql security invoker set search_path = ''
as $$
declare target_status text;
begin
  select coalesce(d.sailor_status, a.status_label) into target_status
  from public.planning_assignments a left join public.planning_days d
    on d.company_id = a.company_id and d.slot365 = 'assignment:' || a.id::text
      and d.source_label = 'seapilot-assignment-note' and d.work_date = p_work_date
  where a.id = p_assignment_id and a.company_id = public.current_planning_company_id();
  return public.save_planning_assignment_day_details(p_assignment_id, p_work_date, target_status, p_note, null);
end;
$$;

create or replace function public.planning_assignment_function_on_date(p_assignment_id bigint, p_work_date date)
returns text language sql stable security invoker set search_path = ''
as $$
  select coalesce(nullif(trim(d.function_label), ''), a.assignment_role)
  from public.planning_assignments a left join public.planning_days d
    on d.company_id = a.company_id and d.slot365 = 'assignment:' || a.id::text
      and d.source_label = 'seapilot-assignment-note' and d.work_date = p_work_date
  where a.id = p_assignment_id and a.company_id = public.current_planning_company_id()
    and a.confirmation_status <> 'cancelled' and p_work_date between a.starts_on and a.ends_on;
$$;
revoke all on function public.planning_assignment_function_on_date(bigint,date) from public, anon;
grant execute on function public.planning_assignment_function_on_date(bigint,date) to authenticated;

-- Preserve all subsequent guards already installed in these existing RPCs.
-- Fail closed if the expected source no longer matches.
do $migration$
declare previous_definition text; next_definition text;
begin
  select pg_get_functiondef('public.apply_planning_grid_cells(jsonb)'::regprocedure) into previous_definition;
  next_definition := replace(previous_definition,
    'if target_note is null and target_status = target_assignment_status then',
    'if target_note is null and target_status = target_assignment_status and target_function is not distinct from (select a.assignment_role from public.planning_assignments a where a.id = target_assignment_id) then');
  if next_definition = previous_definition then raise exception 'Planning grid daily-state predicate changed'; end if;
  execute next_definition;

  select pg_get_functiondef('public.planning_staffing_board_status(bigint,text,date)'::regprocedure) into previous_definition;
  next_definition := replace(previous_definition, 'assignment.assignment_role',
    'public.planning_assignment_function_on_date(assignment.id, p_work_date)');
  if next_definition = previous_definition then raise exception 'Planning staffing function predicates changed'; end if;
  execute next_definition;
end;
$migration$;

notify pgrst, 'reload schema';
