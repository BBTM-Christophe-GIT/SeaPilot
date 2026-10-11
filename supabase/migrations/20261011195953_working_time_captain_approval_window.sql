-- Captain approval is independent of the sailor's entry deadline (the 5th of
-- the following month). Use calendar months and the company's Paris work date.
create or replace function public.working_time_captain_approval_date_allowed(p_local_work_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(p_local_work_date between
    ((statement_timestamp() at time zone 'Europe/Paris')::date - interval '2 months')::date
    and (statement_timestamp() at time zone 'Europe/Paris')::date, false);
$$;

revoke all on function public.working_time_captain_approval_date_allowed(date) from public, anon;
grant execute on function public.working_time_captain_approval_date_allowed(date) to authenticated;

-- Preserve historical Planning attribution, temporary captains, management
-- fallback, signatures, non-compliance evidence and the existing entry rules.
-- Abort on schema drift rather than silently failing to install a guard.
do $migration$
declare
  change record;
  previous_definition text;
begin
  for change in select * from (values
    (
      'public.validate_working_time_day(bigint)',
      $old$        and is_hr_captain$old$,
      $new$        and is_hr_captain
        and public.working_time_captain_approval_date_allowed(target_approval.local_work_date)$new$
    ),
    (
      'public.working_time_can_comment_register(bigint,date)',
      $old$          approval.approver_person_id = actor.id$old$,
      $new$          approval.approver_person_id = actor.id
          and public.working_time_captain_approval_date_allowed(target_local_date)$new$
    ),
    (
      'public.working_time_actor_can_edit_day(bigint,date)',
      $old$          approval.status = 'submitted'
          and approval.approver_person_id = actor.id$old$,
      $new$          approval.status = 'submitted'
          and approval.approver_person_id = actor.id
          and public.working_time_captain_approval_date_allowed(p_local_work_date)$new$
    )
  ) as changes(signature, old_sql, new_sql)
  loop
    change.old_sql := replace(change.old_sql, chr(13), '');
    change.new_sql := replace(change.new_sql, chr(13), '');
    previous_definition := replace(pg_get_functiondef(change.signature::regprocedure), chr(13), '');
    if (length(previous_definition) - length(replace(previous_definition, change.old_sql, '')))
      / length(change.old_sql) <> 1 then
      raise exception 'Expected exactly one captain approval guard in %', change.signature;
    end if;
    execute replace(previous_definition, change.old_sql, change.new_sql);
  end loop;
end;
$migration$;

comment on function public.working_time_captain_approval_date_allowed(date) is
  'Captain approval/correction/justification window: today minus two calendar months through today, inclusive, Europe/Paris. Management and sailor entry deadlines retain their separate rules.';

notify pgrst, 'reload schema';
