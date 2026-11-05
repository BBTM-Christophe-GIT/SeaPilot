-- An authorized correction of an existing period does not require a comment.
-- The entry check still applies to new periods, and existing authorization,
-- calculation and audit paths continue to govern every mutation.
do $migration$
declare
  definition text := replace(pg_get_functiondef(
    'public.save_working_time_interval(bigint,timestamptz,timestamptz,text,bigint,text,text,bigint)'::regprocedure
  ), chr(13), '');
  previous constant text := $sql$  if not public.working_time_unrestricted_editing_allowed(target_register.company_id)
    and recommendation->>'status' in ('alerte', 'non_conforme')$sql$;
begin
  if (length(definition) - length(replace(definition, previous, ''))) / length(previous) <> 1 then
    raise exception 'Expected interval comment guard missing or ambiguous';
  end if;
  execute replace(definition, previous, $sql$  if p_interval_id is null
    and not public.working_time_unrestricted_editing_allowed(target_register.company_id)
    and recommendation->>'status' in ('alerte', 'non_conforme')$sql$);
end;
$migration$;

create or replace function public.void_working_time_interval(p_interval_id bigint, p_reason text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_interval public.working_time_intervals%rowtype;
begin
  if (select auth.uid()) is null or public.current_person_id() is null then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PROFILE_NOT_LINKED: fiche RH requise.';
  end if;
  select * into target_interval
  from public.working_time_intervals work_interval
  where work_interval.id = p_interval_id and work_interval.voided_at is null
  for update;
  if target_interval.id is null then
    raise exception using errcode = '23503', message = 'WORKING_TIME_INTERVAL_NOT_FOUND.';
  end if;
  if not public.working_time_actor_can_edit_day(target_interval.register_id, target_interval.local_work_date) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: journee verrouillee.';
  end if;
  update public.working_time_intervals
  set voided_at = now(),
      voided_by = (select auth.uid()),
      void_reason = case when length(trim(coalesce(p_reason, ''))) >= 2
        then trim(p_reason) else 'Retrait depuis le registre' end
  where id = target_interval.id;
  return target_interval.id;
end;
$function$;
