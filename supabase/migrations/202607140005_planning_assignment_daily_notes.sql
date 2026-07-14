-- Planning assignment daily notes
--
-- Reuses planning_days for one short note per assignment/day. Technical rows
-- are linked to their assignment through slot365 = 'assignment:<id>' and are
-- excluded from normal crew events by source_label.
--
-- Replay safety:
--   * the partial unique index and RPC are created idempotently;
--   * no existing row is rewritten or deleted.
--
-- Rollback:
--   1. Export rows where source_label = 'seapilot-assignment-note'.
--   2. Drop function public.save_planning_assignment_day_note(bigint, date, text).
--   3. Drop index public.planning_days_assignment_note_unique_idx.
--   4. Delete exported technical rows only after confirming they are no longer required.

create unique index if not exists planning_days_assignment_note_unique_idx
  on public.planning_days (company_id, slot365, work_date)
  where source_label = 'seapilot-assignment-note';

create or replace function public.save_planning_assignment_day_note(
  p_assignment_id bigint,
  p_work_date date,
  p_note text
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  target_note text := nullif(trim(coalesce(p_note, '')), '');
  target_assignment public.planning_assignments%rowtype;
  saved_id bigint;
begin
  if p_assignment_id is null or p_work_date is null then
    raise exception using
      errcode = '22023',
      message = 'PLANNING_ASSIGNMENT_NOTE_INVALID';
  end if;

  if char_length(coalesce(p_note, '')) > 32 then
    raise exception using
      errcode = '22001',
      message = 'PLANNING_ASSIGNMENT_NOTE_TOO_LONG';
  end if;

  select assignment.*
  into target_assignment
  from public.planning_assignments assignment
  where assignment.id = p_assignment_id
    and assignment.company_id = target_company_id
    and assignment.confirmation_status <> 'cancelled';

  if not found or p_work_date < target_assignment.starts_on or p_work_date > target_assignment.ends_on then
    raise exception using
      errcode = '23503',
      message = 'PLANNING_ASSIGNMENT_NOTE_ASSIGNMENT_NOT_FOUND';
  end if;

  if not public.planning_user_can(
    'edit_event',
    target_company_id,
    target_assignment.vessel_id,
    p_work_date,
    p_work_date
  ) then
    raise exception using
      errcode = '42501',
      message = 'PLANNING_ASSIGNMENT_NOTE_FORBIDDEN';
  end if;

  if target_note is null then
    delete from public.planning_days
    where company_id = target_company_id
      and slot365 = 'assignment:' || p_assignment_id::text
      and work_date = p_work_date
      and source_label = 'seapilot-assignment-note'
    returning id into saved_id;
    return saved_id;
  end if;

  insert into public.planning_days (
    company_id,
    person_id,
    vessel_id,
    crew_name,
    vessel_name,
    work_date,
    year_number,
    month_number,
    month_label,
    day_number,
    function_label,
    sailor_status,
    day_status,
    watch_group,
    slot365,
    comments,
    source_label
  )
  select
    target_company_id,
    target_assignment.crew_person_id,
    target_assignment.vessel_id,
    trim(concat_ws(' ', person.first_name, person.last_name)),
    vessel.name,
    p_work_date,
    extract(year from p_work_date)::integer,
    extract(month from p_work_date)::integer,
    to_char(p_work_date, 'TMMonth'),
    extract(day from p_work_date)::integer,
    target_assignment.assignment_role,
    target_assignment.status_label,
    'Annotation affectation',
    target_assignment.watch_group,
    'assignment:' || target_assignment.id::text,
    target_note,
    'seapilot-assignment-note'
  from public.people person
  join public.vessels vessel on vessel.id = target_assignment.vessel_id
  where person.id = target_assignment.crew_person_id
  on conflict (company_id, slot365, work_date)
    where source_label = 'seapilot-assignment-note'
  do update set
    person_id = excluded.person_id,
    vessel_id = excluded.vessel_id,
    crew_name = excluded.crew_name,
    vessel_name = excluded.vessel_name,
    function_label = excluded.function_label,
    sailor_status = excluded.sailor_status,
    watch_group = excluded.watch_group,
    comments = excluded.comments,
    updated_at = now()
  returning id into saved_id;

  return saved_id;
end;
$$;

revoke all on function public.save_planning_assignment_day_note(bigint, date, text) from public, anon;
grant execute on function public.save_planning_assignment_day_note(bigint, date, text) to authenticated;

comment on function public.save_planning_assignment_day_note(bigint, date, text) is
  'Saves or removes a short company-scoped note for one colored assignment cell while preserving Planning RLS and publication locks.';
