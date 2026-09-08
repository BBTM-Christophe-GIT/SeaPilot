-- A missing daily captain must not prevent recording or signing actual work.
-- A NULL approver routes the submitted day to company management. Direction
-- gains approval/correction rights only for these submitted fallback days.
alter table public.working_time_day_approvals
  drop constraint working_time_day_approvals_submit_check;
alter table public.working_time_day_approvals
  add constraint working_time_day_approvals_submit_check check (
    status = 'draft'
    or (submitted_at is not null and submitted_by_person_id is not null)
  );

-- Preserve the latest calculation, entry-window and signature implementations.
-- Each replacement must match exactly once; schema drift aborts the migration.
do $migration$
declare
  change record;
  previous_definition text;
begin
  for change in select * from (values
    (
      'public.save_working_time_interval(bigint,timestamptz,timestamptz,text,bigint,text,text,bigint)',
      $old$  if target_assignment.id is null then
    raise exception using errcode = '23514', message = 'WORKING_TIME_PLANNING_ASSIGNMENT_REQUIRED.';
  end if;$old$,
      $new$  -- With no effective assignment, keep vessel/watch/assignment NULL.
  -- Client-supplied vessel and watch values never replace Planning truth.$new$
    ),
    (
      'public.submit_working_time_day(bigint,date)',
      $old$  if assignment_id is null then
    raise exception using errcode = '23514', message = 'WORKING_TIME_PLANNING_ASSIGNMENT_REQUIRED.';
  end if;
  if approver_person_id is null or not public.working_time_captain_matches_day($old$,
      $new$  -- No resolved captain: retain NULL for the management approval queue.
  if approver_person_id is not null and not public.working_time_captain_matches_day($new$
    ),
    (
      'public.submit_working_time_day(bigint,date)',
      $old$    and approver_person_id = actor_person_id$old$,
      $new$    and approver_person_id is not distinct from actor_person_id$new$
    ),
    (
      'public.working_time_interval_recommendation(bigint,timestamptz,timestamptz,text,bigint,text,bigint)',
      $old$      or public.has_company_role(target_person.company_id, array['admin', 'armement'])$old$,
      $new$      or public.has_company_role(target_person.company_id, array['admin', 'armement'])
      or (
        public.has_company_role(target_person.company_id, array['direction'])
        and target_person.id <> public.current_person_id()
        and exists (
          select 1 from public.working_time_day_approvals approval
          where approval.company_id = target_person.company_id
            and approval.person_id = target_person.id
            and approval.local_work_date = (p_proposed_start at time zone p_timezone_name)::date
            and approval.status = 'submitted'
            and approval.approver_person_id is null
        )
      )$new$
    ),
    (
      'public.validate_working_time_day(bigint)',
      $old$        target_approval.approver_person_id = actor_person_id$old$,
      $new$        target_approval.approver_person_id is not distinct from actor_person_id$new$
    ),
    (
      'public.submit_working_time_day(bigint,date)',
      $old$    public.working_time_person_identity_snapshot(approver_person_id, target_register.company_id),$old$,
      $new$    coalesce(public.working_time_person_identity_snapshot(approver_person_id, target_register.company_id), '{}'::jsonb),$new$
    ),
    (
      'public.submit_working_time_day(bigint,date)',
      $old$  if previous_status = 'validated' then$old$,
      $new$  if previous_status in ('submitted', 'validated') then$new$
    ),
    (
      'public.working_time_day_context(bigint,date)',
      $old$    and not public.working_time_can_manage_entry_scope(target_person.company_id)$old$,
      $new$    and not public.has_company_role(target_person.company_id, array['admin', 'direction', 'armement'])$new$
    ),
    (
      'public.working_time_actor_can_edit_day(bigint,date)',
      $old$        public.working_time_can_manage_entry_scope(register.company_id)$old$,
      $new$        public.working_time_can_manage_entry_scope(register.company_id)
        or (
          approval.status = 'submitted'
          and approval.approver_person_id is null
          and actor.id <> register.person_id
          and public.has_company_role(register.company_id, array['direction'])
        )$new$
    ),
    (
      'public.working_time_can_comment_register(bigint,date)',
      $old$        public.working_time_can_manage_entry_scope(register.company_id)$old$,
      $new$        public.working_time_can_manage_entry_scope(register.company_id)
        or (
          approval.approver_person_id is null
          and actor.id <> register.person_id
          and public.has_company_role(register.company_id, array['direction'])
        )$new$
    ),
    (
      'public.validate_working_time_day(bigint)',
      $old$  is_management := public.has_company_role(target_approval.company_id, array['admin', 'armement']);$old$,
      $new$  is_management := public.has_company_role(target_approval.company_id, array['admin', 'armement'])
    or (target_approval.approver_person_id is null
      and public.has_company_role(target_approval.company_id, array['direction']));$new$
    )
  ) as changes(signature, old_sql, new_sql)
  loop
    change.old_sql := replace(change.old_sql, chr(13), '');
    change.new_sql := replace(change.new_sql, chr(13), '');
    previous_definition := replace(pg_get_functiondef(change.signature::regprocedure), chr(13), '');
    if (length(previous_definition) - length(replace(previous_definition, change.old_sql, '')))
      / length(change.old_sql) <> 1 then
      raise exception 'Expected exactly one workflow guard in %: %', change.signature, change.old_sql;
    end if;
    execute replace(previous_definition, change.old_sql, change.new_sql);
  end loop;
end;
$migration$;

comment on column public.working_time_day_approvals.approver_person_id is
  'Resolved daily HR captain; NULL routes approval to Admin, Direction or Armement of the same company. The actual signer is retained in validated_by_person_id and frozen snapshots.';
comment on column public.working_time_day_approvals.approver_signature_snapshot is
  'Immutable active signature snapshot of the exact HR Capitaine or fallback Admin/Direction/Armement approver.';

notify pgrst, 'reload schema';
