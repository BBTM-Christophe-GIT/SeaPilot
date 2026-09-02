-- A multi-phase day used to recalculate the same rolling windows once per
-- inserted phase. This brought the normal Marin validation flow close to the
-- authenticated role's eight-second statement timeout. Defer the row trigger
-- while the phases are inserted, then rebuild the affected range once.

create or replace function public.save_working_time_phases(
  p_register_id bigint,
  p_phases jsonb,
  p_timezone_name text,
  p_vessel_id bigint default null,
  p_watch_group text default null,
  p_comment text default null
)
returns bigint[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.working_time_registers%rowtype;
  phase record;
  first_start timestamptz;
  last_end timestamptz;
  target_local_date date;
  previous_defer_setting text;
  ids bigint[] := array[]::bigint[];
begin
  select * into target
  from public.working_time_registers
  where id = p_register_id
  for update;

  if target.id is null then
    raise exception 'WORKING_TIME_REGISTER_NOT_FOUND';
  end if;

  select min(item.starts_at), max(item.ends_at)
  into first_start, last_end
  from jsonb_to_recordset(p_phases) item(starts_at timestamptz, ends_at timestamptz);

  if first_start is null or last_end is null then
    raise exception using errcode = '22023', message = 'WORKING_TIME_PHASES_INVALID.';
  end if;

  target_local_date := (first_start at time zone p_timezone_name)::date;
  if not public.working_time_actor_can_edit_day(target.id, target_local_date) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: journee verrouillee.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_phases) proposed(starts_at timestamptz, ends_at timestamptz)
    join public.working_time_intervals existing
      on existing.person_id = target.person_id
     and existing.voided_at is null
     and proposed.starts_at < existing.ends_at
     and proposed.ends_at > existing.starts_at
  ) then
    raise exception using errcode = '22023', message = 'WORKING_TIME_PHASES_EXISTING_OVERLAP';
  end if;

  previous_defer_setting := current_setting('seapilot.defer_working_time_recalculation', true);
  perform set_config('seapilot.defer_working_time_recalculation', 'on', true);

  for phase in
    select *
    from jsonb_to_recordset(p_phases) item(starts_at timestamptz, ends_at timestamptz)
    order by starts_at
  loop
    ids := array_append(ids, public.save_working_time_interval(
      p_register_id,
      phase.starts_at,
      phase.ends_at,
      p_timezone_name,
      p_vessel_id,
      p_watch_group,
      p_comment,
      null
    ));
  end loop;

  perform set_config(
    'seapilot.defer_working_time_recalculation',
    coalesce(nullif(previous_defer_setting, ''), 'off'),
    true
  );

  if coalesce(previous_defer_setting, 'off') <> 'on' then
    perform private.working_time_recalculate_person(target.person_id, first_start, last_end);
  end if;

  return ids;
end;
$$;

revoke all on function public.save_working_time_phases(bigint, jsonb, text, bigint, text, text)
from public, anon, authenticated;
grant execute on function public.save_working_time_phases(bigint, jsonb, text, bigint, text, text)
to authenticated;

comment on function public.save_working_time_phases(bigint, jsonb, text, bigint, text, text) is
  'Persists disjoint work phases atomically and recalculates the affected rolling windows once per submitted batch.';

notify pgrst, 'reload schema';
