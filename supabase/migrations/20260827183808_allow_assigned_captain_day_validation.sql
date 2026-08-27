-- Keep the Captain workflow coherent from entry through validation. The exact
-- HR Capitaine assigned to the same vessel/watch may prepare an unsubmitted
-- sailor day and submit it. A compliant day is validated atomically; a
-- non-compliant day remains submitted until the Captain records the required
-- justification. The audit keeps the real apposition actor explicitly.

create or replace function public.working_time_actor_can_edit_day(
  p_register_id bigint,
  p_local_work_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.working_time_registers register
    join public.people subject
      on subject.id = register.person_id
     and subject.company_id = register.company_id
    left join public.working_time_day_approvals approval
      on approval.register_id = register.id
     and approval.local_work_date = p_local_work_date
    left join public.people actor
      on actor.id = public.current_person_id()
     and actor.company_id = register.company_id
    where register.id = p_register_id
      and public.user_belongs_to_company(register.company_id)
      and coalesce(approval.status, 'draft') <> 'validated'
      and (
        public.working_time_can_manage_entry_scope(register.company_id)
        or (
          approval.status = 'submitted'
          and approval.approver_person_id = actor.id
          and actor.function_label = 'Capitaine'
          and public.working_time_captain_matches_day(
            register.company_id,
            register.person_id,
            actor.id,
            p_local_work_date
          )
        )
        or (
          approval.id is null
          and register.person_id = actor.id
          and (
            actor.function_label = 'Capitaine'
            or public.has_company_role(register.company_id, array['marin', 'capitaine'])
          )
        )
        or (
          approval.id is null
          and actor.id <> register.person_id
          and actor.function_label = 'Capitaine'
          and public.working_time_captain_matches_day(
            register.company_id,
            register.person_id,
            actor.id,
            p_local_work_date
          )
        )
      )
  );
$$;

create or replace function public.submit_working_time_day(
  p_register_id bigint,
  p_local_work_date date
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_register public.working_time_registers%rowtype;
  target_person public.people%rowtype;
  actor_person public.people%rowtype;
  actor_person_id bigint := public.current_person_id();
  context_data jsonb;
  approver_person_id bigint;
  assignment_id bigint;
  resolved_vessel_id bigint;
  resolved_watch_group text;
  intervals_data jsonb;
  subject_signature_data jsonb;
  approver_signature_data jsonb := '{}'::jsonb;
  saved_approval public.working_time_day_approvals%rowtype;
  previous_status text;
  next_status text := 'submitted';
  self_captain boolean := false;
  is_subject_actor boolean := false;
  is_assigned_captain boolean := false;
begin
  select * into target_register
  from public.working_time_registers register
  where register.id = p_register_id
  for update;

  select * into target_person
  from public.people person
  where person.id = target_register.person_id;

  select * into actor_person
  from public.people person
  where person.id = actor_person_id;

  if (select auth.uid()) is null
    or actor_person_id is null
    or target_register.id is null
    or target_person.id is null then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: soumission de la journee.';
  end if;

  context_data := public.working_time_day_context(target_register.person_id, p_local_work_date);
  approver_person_id := nullif(context_data->>'approver_person_id', '')::bigint;
  assignment_id := nullif(context_data->>'assignment_id', '')::bigint;
  resolved_vessel_id := nullif(context_data->>'vessel_id', '')::bigint;
  resolved_watch_group := nullif(trim(coalesce(context_data->>'watch_group', '')), '');

  is_subject_actor := target_register.person_id = actor_person_id;
  is_assigned_captain := not is_subject_actor
    and actor_person.company_id = target_register.company_id
    and actor_person.function_label = 'Capitaine'
    and approver_person_id = actor_person_id
    and public.working_time_captain_matches_day(
      target_register.company_id,
      target_register.person_id,
      actor_person_id,
      p_local_work_date
    );

  if not (
    (
      is_subject_actor
      and (
        target_person.function_label = 'Capitaine'
        or public.has_company_role(target_register.company_id, array['marin', 'capitaine'])
      )
    )
    or is_assigned_captain
  ) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: soumission de la journee.';
  end if;

  if p_local_work_date not between target_register.period_start and target_register.period_end then
    raise exception using errcode = '22023', message = 'WORKING_TIME_SUBMISSION_DATE_INVALID.';
  end if;

  if not exists (
    select 1
    from public.working_time_intervals work_interval
    where work_interval.register_id = target_register.id
      and work_interval.local_work_date = p_local_work_date
      and work_interval.voided_at is null
  ) then
    raise exception using errcode = '23514', message = 'WORKING_TIME_EMPTY_DAY.';
  end if;

  subject_signature_data := public.working_time_active_signature_snapshot(
    target_register.company_id,
    target_register.person_id
  );
  if subject_signature_data = '{}'::jsonb then
    if is_assigned_captain then
      raise exception using errcode = '23514', message = 'WORKING_TIME_SUBJECT_SIGNATURE_REQUIRED.';
    end if;
    raise exception using errcode = '23514', message = 'WORKING_TIME_ACTIVE_SIGNATURE_REQUIRED.';
  end if;

  if is_assigned_captain then
    subject_signature_data := subject_signature_data || jsonb_build_object(
      'apposition_mode', 'assigned_captain',
      'apposed_by_user_id', (select auth.uid()),
      'apposed_by_person_id', actor_person_id,
      'apposed_at', clock_timestamp()
    );
  end if;

  if assignment_id is null then
    raise exception using errcode = '23514', message = 'WORKING_TIME_PLANNING_ASSIGNMENT_REQUIRED.';
  end if;
  if approver_person_id is null or not public.working_time_captain_matches_day(
    target_register.company_id,
    target_register.person_id,
    approver_person_id,
    p_local_work_date
  ) then
    raise exception using errcode = '23514', message = 'WORKING_TIME_CAPTAIN_APPROVER_REQUIRED.';
  end if;

  self_captain := target_person.function_label = 'Capitaine'
    and approver_person_id = target_person.id;
  if (self_captain or is_assigned_captain)
    and not public.working_time_day_has_non_compliance(target_register.id, p_local_work_date) then
    next_status := 'validated';
  end if;

  if next_status = 'validated' then
    approver_signature_data := case
      when is_assigned_captain then public.working_time_active_signature_snapshot(
        target_register.company_id,
        actor_person_id
      )
      else subject_signature_data
    end;
    if approver_signature_data = '{}'::jsonb then
      raise exception using errcode = '23514', message = 'WORKING_TIME_ACTIVE_SIGNATURE_REQUIRED.';
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'interval_id', work_interval.id,
    'local_work_date', work_interval.local_work_date,
    'starts_at', work_interval.starts_at,
    'ends_at', work_interval.ends_at,
    'timezone_name', work_interval.timezone_name,
    'vessel_id', work_interval.vessel_id,
    'watch_group', work_interval.watch_group,
    'comment', work_interval.comment
  ) order by work_interval.starts_at), '[]'::jsonb)
  into intervals_data
  from public.working_time_intervals work_interval
  where work_interval.register_id = target_register.id
    and work_interval.local_work_date = p_local_work_date
    and work_interval.voided_at is null;

  select approval.status
  into previous_status
  from public.working_time_day_approvals approval
  where approval.register_id = target_register.id
    and approval.local_work_date = p_local_work_date
  for update;

  if previous_status = 'validated' then
    raise exception using errcode = '55000', message = 'WORKING_TIME_DAY_LOCKED.';
  end if;

  insert into public.working_time_day_approvals (
    company_id, register_id, person_id, local_work_date, status,
    planning_assignment_id, vessel_id, watch_group, approver_person_id,
    submitted_by, submitted_by_person_id, submitted_at,
    validated_by, validated_by_person_id, validated_at,
    subject_identity_snapshot, approver_identity_snapshot, vessel_snapshot, watch_snapshot,
    signature_snapshot, subject_signature_snapshot, approver_signature_snapshot,
    interval_snapshot, non_compliance_snapshot, updated_at
  ) values (
    target_register.company_id, target_register.id, target_register.person_id, p_local_work_date, next_status,
    assignment_id, resolved_vessel_id, resolved_watch_group, approver_person_id,
    (select auth.uid()), actor_person_id, clock_timestamp(),
    case when next_status = 'validated' then (select auth.uid()) else null end,
    case when next_status = 'validated' then actor_person_id else null end,
    case when next_status = 'validated' then clock_timestamp() else null end,
    public.working_time_person_identity_snapshot(target_register.person_id, target_register.company_id),
    public.working_time_person_identity_snapshot(approver_person_id, target_register.company_id),
    coalesce((
      select jsonb_build_object(
        'vessel_id', vessel.id,
        'name', vessel.name,
        'acronym', vessel.acronym
      )
      from public.vessels vessel
      where vessel.id = resolved_vessel_id
    ), '{}'::jsonb),
    jsonb_build_object('watch_group', resolved_watch_group),
    case when next_status = 'validated' then approver_signature_data else subject_signature_data end,
    subject_signature_data,
    approver_signature_data,
    intervals_data,
    '[]'::jsonb,
    now()
  )
  on conflict (register_id, local_work_date) do update
  set status = excluded.status,
      planning_assignment_id = excluded.planning_assignment_id,
      vessel_id = excluded.vessel_id,
      watch_group = excluded.watch_group,
      approver_person_id = excluded.approver_person_id,
      submitted_by = excluded.submitted_by,
      submitted_by_person_id = excluded.submitted_by_person_id,
      submitted_at = excluded.submitted_at,
      validated_by = excluded.validated_by,
      validated_by_person_id = excluded.validated_by_person_id,
      validated_at = excluded.validated_at,
      subject_identity_snapshot = excluded.subject_identity_snapshot,
      approver_identity_snapshot = excluded.approver_identity_snapshot,
      vessel_snapshot = excluded.vessel_snapshot,
      watch_snapshot = excluded.watch_snapshot,
      signature_snapshot = excluded.signature_snapshot,
      subject_signature_snapshot = excluded.subject_signature_snapshot,
      approver_signature_snapshot = excluded.approver_signature_snapshot,
      interval_snapshot = excluded.interval_snapshot,
      non_compliance_snapshot = excluded.non_compliance_snapshot,
      updated_at = now()
  returning * into saved_approval;

  insert into public.working_time_day_approval_events (
    company_id, day_approval_id, register_id, person_id, local_work_date,
    event_type, previous_status, new_status, actor_user_id, actor_person_id,
    actor_identity_snapshot, interval_snapshot, non_compliance_snapshot
  ) values (
    target_register.company_id,
    saved_approval.id,
    target_register.id,
    target_register.person_id,
    p_local_work_date,
    case when next_status = 'validated' then 'validated' else 'submitted' end,
    previous_status,
    next_status,
    (select auth.uid()),
    actor_person_id,
    public.working_time_person_identity_snapshot(actor_person_id, target_register.company_id),
    intervals_data,
    '[]'::jsonb
  );

  return saved_approval.id;
end;
$$;

revoke all on function public.working_time_actor_can_edit_day(bigint, date)
from public, anon, authenticated;
revoke all on function public.submit_working_time_day(bigint, date)
from public, anon, authenticated;
grant execute on function public.submit_working_time_day(bigint, date)
to authenticated;

comment on function public.working_time_actor_can_edit_day(bigint, date) is
  'Allows management, the subject, or the exact assigned HR Capitaine to edit an unlocked work day in their published Planning scope.';
comment on function public.submit_working_time_day(bigint, date) is
  'Submits a subject day or lets its exact assigned HR Capitaine appose the active subject profile signature with explicit on-behalf audit metadata and validate a compliant day atomically.';

notify pgrst, 'reload schema';
