-- Working-time day workflow: the exact HR function_label = 'Capitaine' is the
-- eligibility source of truth. Both the subject and approver signatures are
-- frozen independently on every validated day.

alter table public.working_time_day_approvals
  drop constraint if exists working_time_day_approvals_no_self_approval_check;

alter table public.working_time_day_approvals
  add column if not exists subject_signature_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists approver_signature_snapshot jsonb not null default '{}'::jsonb;

update public.working_time_day_approvals
set subject_signature_snapshot = signature_snapshot
where status = 'submitted'
  and subject_signature_snapshot = '{}'::jsonb
  and signature_snapshot <> '{}'::jsonb;

update public.working_time_day_approvals
set approver_signature_snapshot = signature_snapshot
where status = 'validated'
  and approver_signature_snapshot = '{}'::jsonb
  and signature_snapshot <> '{}'::jsonb;

create or replace function public.working_time_active_signature_snapshot(
  target_company_id bigint,
  target_person_id bigint
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'signature_id', signature.id,
      'signer_person_id', target_person_id,
      'signer_user_id', person.user_id,
      'signer_name', trim(person.first_name || ' ' || person.last_name),
      'signer_roles', coalesce((
        select jsonb_agg(role.role_key order by role.role_key)
        from public.user_roles role
        where role.user_id = person.user_id and role.company_id = target_company_id
      ), '[]'::jsonb),
      'signed_at', clock_timestamp(),
      'version_number', signature.version_number,
      'storage_bucket', signature.storage_bucket,
      'storage_path', signature.storage_path,
      'mime_type', signature.mime_type,
      'file_size_bytes', signature.file_size_bytes,
      'sha256', signature.sha256,
      'valid_from', signature.valid_from
    )
    from public.working_time_profile_signatures signature
    join public.people person on person.id = signature.person_id and person.company_id = signature.company_id
    where signature.company_id = target_company_id
      and signature.person_id = target_person_id
      and signature.valid_to is null
    order by signature.version_number desc
    limit 1
  ), '{}'::jsonb);
$$;

create or replace function public.working_time_captain_can_access_period(
  target_company_id bigint,
  target_person_id bigint,
  target_starts_on date,
  target_ends_on date,
  target_vessel_id bigint default null,
  target_watch_group text default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and public.user_belongs_to_company(target_company_id)
    and exists (
      select 1
      from public.people captain
      join public.planning_assignments captain_assignment
        on captain_assignment.company_id = captain.company_id
       and captain_assignment.crew_person_id = captain.id
       and captain_assignment.starts_on <= target_ends_on
       and captain_assignment.ends_on >= target_starts_on
       and captain_assignment.confirmation_status = 'confirmed'
       and captain_assignment.assignment_role = 'Capitaine'
      join public.planning_assignments crew_assignment
        on crew_assignment.company_id = captain_assignment.company_id
       and crew_assignment.vessel_id = captain_assignment.vessel_id
       and lower(trim(coalesce(crew_assignment.watch_group, '')))
         = lower(trim(coalesce(captain_assignment.watch_group, '')))
       and crew_assignment.starts_on <= target_ends_on
       and crew_assignment.ends_on >= target_starts_on
       and crew_assignment.confirmation_status <> 'cancelled'
      where captain.id = public.current_person_id()
        and captain.company_id = target_company_id
        and captain.function_label = 'Capitaine'
        and captain.active
        and crew_assignment.crew_person_id = target_person_id
        and (target_vessel_id is null or crew_assignment.vessel_id = target_vessel_id)
        and (target_watch_group is null
          or lower(trim(coalesce(crew_assignment.watch_group, ''))) = lower(trim(target_watch_group)))
    );
$$;

create or replace function public.working_time_day_context(
  p_person_id bigint,
  p_local_work_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_person public.people%rowtype;
  target_assignment public.planning_assignments%rowtype;
  effective_status text;
  candidates jsonb := '[]'::jsonb;
  preferred_approver_id bigint;
begin
  select * into target_person from public.people person where person.id = p_person_id;
  if (select auth.uid()) is null or target_person.id is null or p_local_work_date is null
    or not public.user_belongs_to_company(target_person.company_id) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: contexte planning.';
  end if;
  if public.current_person_id() <> target_person.id
    and not public.working_time_can_manage_entry_scope(target_person.company_id)
    and not public.working_time_captain_can_access_period(target_person.company_id, target_person.id, p_local_work_date, p_local_work_date) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: contexte planning.';
  end if;

  select assignment.* into target_assignment
  from public.planning_assignments assignment
  where assignment.company_id = target_person.company_id
    and p_local_work_date between assignment.starts_on and assignment.ends_on
    and coalesce(assignment.confirmation_status, '') <> 'cancelled'
    and assignment.crew_person_id = target_person.id
    and public.planning_status_is_working(public.planning_effective_person_status(
      assignment.company_id, target_person.id, p_local_work_date, assignment.vessel_id, assignment.status_label
    ))
  order by (assignment.confirmation_status = 'confirmed') desc, assignment.id desc
  limit 1;

  if target_assignment.id is null then
    return jsonb_build_object(
      'assignment_id', null, 'vessel_id', null, 'watch_group', null,
      'status_label', null, 'approver_person_id', null, 'captain_candidates', '[]'::jsonb
    );
  end if;
  effective_status := public.planning_effective_person_status(
    target_assignment.company_id, target_person.id, p_local_work_date,
    target_assignment.vessel_id, target_assignment.status_label
  );

  if target_person.function_label = 'Capitaine' then
    preferred_approver_id := target_person.id;
    candidates := jsonb_build_array(jsonb_build_object(
      'person_id', target_person.id,
      'first_name', target_person.first_name,
      'last_name', target_person.last_name,
      'name', trim(target_person.first_name || ' ' || target_person.last_name)
    ));
  else
    with eligible as (
      select distinct candidate.id, candidate.first_name, candidate.last_name
      from public.people candidate
      join public.planning_assignments captain_assignment
        on captain_assignment.company_id = candidate.company_id
       and captain_assignment.crew_person_id = candidate.id
       and captain_assignment.vessel_id = target_assignment.vessel_id
       and lower(trim(coalesce(captain_assignment.watch_group, '')))
         = lower(trim(coalesce(target_assignment.watch_group, '')))
       and p_local_work_date between captain_assignment.starts_on and captain_assignment.ends_on
       and coalesce(captain_assignment.confirmation_status, '') = 'confirmed'
       and captain_assignment.assignment_role = 'Capitaine'
      where candidate.company_id = target_person.company_id
        and candidate.function_label = 'Capitaine'
        and candidate.active
        and candidate.user_id is not null
        and public.planning_status_is_working(public.planning_effective_person_status(
          captain_assignment.company_id, candidate.id, p_local_work_date,
          captain_assignment.vessel_id, captain_assignment.status_label
        ))
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'person_id', eligible.id,
        'first_name', eligible.first_name,
        'last_name', eligible.last_name,
        'name', trim(eligible.first_name || ' ' || eligible.last_name)
      ) order by eligible.last_name, eligible.first_name), '[]'::jsonb),
      case when count(*) = 1 then min(eligible.id) else null end
    into candidates, preferred_approver_id
    from eligible;
  end if;

  return jsonb_build_object(
    'assignment_id', target_assignment.id,
    'vessel_id', target_assignment.vessel_id,
    'watch_group', nullif(trim(coalesce(target_assignment.watch_group, '')), ''),
    'status_label', effective_status,
    'approver_person_id', preferred_approver_id,
    'captain_candidates', candidates
  );
end;
$$;

create or replace function public.working_time_actor_can_edit_day(p_register_id bigint, p_local_work_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.working_time_registers register
    join public.people subject on subject.id = register.person_id and subject.company_id = register.company_id
    left join public.working_time_day_approvals approval
      on approval.register_id = register.id and approval.local_work_date = p_local_work_date
    left join public.people actor
      on actor.id = public.current_person_id() and actor.company_id = register.company_id
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
            register.company_id, register.person_id, actor.id, p_local_work_date
          )
        )
        or (
          approval.id is null
          and register.person_id = actor.id
          and (actor.function_label = 'Capitaine'
            or public.has_company_role(register.company_id, array['marin', 'capitaine']))
        )
      )
  );
$$;

create or replace function public.working_time_captain_matches_day(
  target_company_id bigint,
  target_person_id bigint,
  target_captain_person_id bigint,
  target_local_work_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.people subject
    join public.people captain on captain.id = target_captain_person_id and captain.company_id = subject.company_id
    join public.planning_assignments subject_assignment
      on subject_assignment.company_id = subject.company_id
     and subject_assignment.crew_person_id = subject.id
     and target_local_work_date between subject_assignment.starts_on and subject_assignment.ends_on
     and coalesce(subject_assignment.confirmation_status, '') <> 'cancelled'
    where subject.id = target_person_id
      and subject.company_id = target_company_id
      and captain.function_label = 'Capitaine'
      and captain.active
      and (
        (subject.id = captain.id and subject.function_label = 'Capitaine')
        or (
          subject.id <> captain.id
          and exists (
            select 1 from public.planning_assignments captain_assignment
            where captain_assignment.company_id = subject_assignment.company_id
              and captain_assignment.crew_person_id = captain.id
              and captain_assignment.vessel_id = subject_assignment.vessel_id
              and lower(trim(coalesce(captain_assignment.watch_group, '')))
                = lower(trim(coalesce(subject_assignment.watch_group, '')))
              and target_local_work_date between captain_assignment.starts_on and captain_assignment.ends_on
              and captain_assignment.confirmation_status = 'confirmed'
              and captain_assignment.assignment_role = 'Capitaine'
              and public.planning_status_is_working(public.planning_effective_person_status(
                captain_assignment.company_id, captain.id, target_local_work_date,
                captain_assignment.vessel_id, captain_assignment.status_label
              ))
          )
        )
      )
      and public.planning_status_is_working(public.planning_effective_person_status(
        subject_assignment.company_id, subject.id, target_local_work_date,
        subject_assignment.vessel_id, subject_assignment.status_label
      ))
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
  actor_person_id bigint := public.current_person_id();
  context_data jsonb;
  approver_person_id bigint;
  assignment_id bigint;
  resolved_vessel_id bigint;
  resolved_watch_group text;
  intervals_data jsonb;
  subject_signature_data jsonb;
  saved_approval public.working_time_day_approvals%rowtype;
  previous_status text;
  next_status text := 'submitted';
  self_captain boolean := false;
begin
  select * into target_register from public.working_time_registers register where register.id = p_register_id for update;
  select * into target_person from public.people person where person.id = target_register.person_id;
  if (select auth.uid()) is null or actor_person_id is null or target_register.id is null
    or target_register.person_id <> actor_person_id
    or not (
      target_person.function_label = 'Capitaine'
      or public.has_company_role(target_register.company_id, array['marin', 'capitaine'])
    ) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: soumission de la journee.';
  end if;
  if p_local_work_date not between target_register.period_start and target_register.period_end then
    raise exception using errcode = '22023', message = 'WORKING_TIME_SUBMISSION_DATE_INVALID.';
  end if;
  if not exists (
    select 1 from public.working_time_intervals work_interval
    where work_interval.register_id = target_register.id
      and work_interval.local_work_date = p_local_work_date
      and work_interval.voided_at is null
  ) then
    raise exception using errcode = '23514', message = 'WORKING_TIME_EMPTY_DAY.';
  end if;

  subject_signature_data := public.working_time_active_signature_snapshot(target_register.company_id, actor_person_id);
  if subject_signature_data = '{}'::jsonb then
    raise exception using errcode = '23514', message = 'WORKING_TIME_ACTIVE_SIGNATURE_REQUIRED.';
  end if;
  context_data := public.working_time_day_context(target_register.person_id, p_local_work_date);
  approver_person_id := nullif(context_data->>'approver_person_id', '')::bigint;
  assignment_id := nullif(context_data->>'assignment_id', '')::bigint;
  resolved_vessel_id := nullif(context_data->>'vessel_id', '')::bigint;
  resolved_watch_group := nullif(trim(coalesce(context_data->>'watch_group', '')), '');
  if assignment_id is null then
    raise exception using errcode = '23514', message = 'WORKING_TIME_PLANNING_ASSIGNMENT_REQUIRED.';
  end if;
  if approver_person_id is null or not public.working_time_captain_matches_day(
    target_register.company_id, target_register.person_id, approver_person_id, p_local_work_date
  ) then
    raise exception using errcode = '23514', message = 'WORKING_TIME_CAPTAIN_APPROVER_REQUIRED.';
  end if;

  self_captain := target_person.function_label = 'Capitaine' and approver_person_id = target_person.id;
  if self_captain and not public.working_time_day_has_non_compliance(target_register.id, p_local_work_date) then
    next_status := 'validated';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'interval_id', work_interval.id, 'local_work_date', work_interval.local_work_date,
    'starts_at', work_interval.starts_at, 'ends_at', work_interval.ends_at,
    'timezone_name', work_interval.timezone_name, 'vessel_id', work_interval.vessel_id,
    'watch_group', work_interval.watch_group, 'comment', work_interval.comment
  ) order by work_interval.starts_at), '[]'::jsonb)
  into intervals_data
  from public.working_time_intervals work_interval
  where work_interval.register_id = target_register.id
    and work_interval.local_work_date = p_local_work_date
    and work_interval.voided_at is null;

  select approval.status into previous_status
  from public.working_time_day_approvals approval
  where approval.register_id = target_register.id and approval.local_work_date = p_local_work_date
  for update;
  if previous_status = 'validated' then raise exception using errcode = '55000', message = 'WORKING_TIME_DAY_LOCKED.'; end if;

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
    auth.uid(), actor_person_id, clock_timestamp(),
    case when next_status = 'validated' then auth.uid() else null end,
    case when next_status = 'validated' then actor_person_id else null end,
    case when next_status = 'validated' then clock_timestamp() else null end,
    public.working_time_person_identity_snapshot(actor_person_id, target_register.company_id),
    public.working_time_person_identity_snapshot(approver_person_id, target_register.company_id),
    coalesce((select jsonb_build_object('vessel_id', vessel.id, 'name', vessel.name, 'acronym', vessel.acronym)
      from public.vessels vessel where vessel.id = resolved_vessel_id), '{}'::jsonb),
    jsonb_build_object('watch_group', resolved_watch_group),
    subject_signature_data, subject_signature_data,
    case when next_status = 'validated' then subject_signature_data else '{}'::jsonb end,
    intervals_data, '[]'::jsonb, now()
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
    target_register.company_id, saved_approval.id, target_register.id, target_register.person_id,
    p_local_work_date, case when next_status = 'validated' then 'validated' else 'submitted' end,
    previous_status, next_status, auth.uid(), actor_person_id,
    public.working_time_person_identity_snapshot(actor_person_id, target_register.company_id),
    intervals_data, '[]'::jsonb
  );
  return saved_approval.id;
end;
$$;

create or replace function public.validate_working_time_day(p_day_approval_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_approval public.working_time_day_approvals%rowtype;
  target_register public.working_time_registers%rowtype;
  actor_person public.people%rowtype;
  actor_person_id bigint := public.current_person_id();
  intervals_data jsonb;
  non_compliance_data jsonb;
  approver_signature_data jsonb;
  saved_event_id bigint;
  is_management boolean;
  is_hr_captain boolean;
begin
  select * into target_approval from public.working_time_day_approvals approval where approval.id = p_day_approval_id for update;
  select * into target_register from public.working_time_registers register where register.id = target_approval.register_id;
  select * into actor_person from public.people person where person.id = actor_person_id;
  is_management := public.has_company_role(target_approval.company_id, array['admin', 'armement']);
  is_hr_captain := actor_person.company_id = target_approval.company_id and actor_person.function_label = 'Capitaine';

  if auth.uid() is null or actor_person_id is null or target_approval.id is null or target_approval.status <> 'submitted'
    or not (
      (is_management and actor_person_id <> target_approval.person_id)
      or (
        target_approval.approver_person_id = actor_person_id
        and is_hr_captain
        and public.working_time_captain_matches_day(
          target_approval.company_id, target_approval.person_id, actor_person_id, target_approval.local_work_date
        )
      )
    ) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: validation de la journee.';
  end if;
  if target_approval.subject_signature_snapshot = '{}'::jsonb then
    raise exception using errcode = '23514', message = 'WORKING_TIME_SUBJECT_SIGNATURE_REQUIRED.';
  end if;
  if public.working_time_day_has_non_compliance(target_register.id, target_approval.local_work_date)
    and not exists (
      select 1 from public.working_time_day_comments day_comment
      where day_comment.register_id = target_register.id
        and day_comment.local_work_date = target_approval.local_work_date
        and day_comment.cause_category is not null
        and length(trim(coalesce(day_comment.operational_context, ''))) >= 2
        and length(trim(coalesce(day_comment.immediate_action, ''))) >= 2
        and length(trim(coalesce(day_comment.compensatory_rest_plan, ''))) >= 2
        and length(trim(day_comment.comment)) >= 2
        and (day_comment.authored_by_person_id = actor_person_id or is_management)
    ) then
    raise exception using errcode = '23514', message = 'WORKING_TIME_NON_COMPLIANCE_DETAILS_REQUIRED.';
  end if;

  approver_signature_data := public.working_time_active_signature_snapshot(target_approval.company_id, actor_person_id);
  if approver_signature_data = '{}'::jsonb then
    raise exception using errcode = '23514', message = 'WORKING_TIME_ACTIVE_SIGNATURE_REQUIRED.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'interval_id', work_interval.id, 'local_work_date', work_interval.local_work_date,
    'starts_at', work_interval.starts_at, 'ends_at', work_interval.ends_at,
    'timezone_name', work_interval.timezone_name, 'vessel_id', work_interval.vessel_id,
    'watch_group', work_interval.watch_group, 'comment', work_interval.comment,
    'author_user_id', work_interval.author_user_id, 'author_person_id', work_interval.author_person_id,
    'source_type', work_interval.source_type
  ) order by work_interval.starts_at), '[]'::jsonb)
  into intervals_data from public.working_time_intervals work_interval
  where work_interval.register_id = target_register.id
    and work_interval.local_work_date = target_approval.local_work_date
    and work_interval.voided_at is null;
  select coalesce(jsonb_agg(jsonb_build_object(
    'local_work_date', calculation.local_window_end_date,
    'violation_codes', calculation.violation_codes,
    'work_24h_seconds', calculation.work_24h_seconds,
    'rest_24h_seconds', calculation.rest_24h_seconds,
    'work_7d_seconds', calculation.work_7d_seconds,
    'rest_7d_seconds', calculation.rest_7d_seconds
  ) order by calculation.window_end), '[]'::jsonb)
  into non_compliance_data from public.working_time_calculation_windows calculation
  where calculation.company_id = target_register.company_id
    and calculation.person_id = target_register.person_id
    and calculation.local_window_end_date = target_approval.local_work_date
    and calculation.is_compliant is false
    and public.working_time_day_has_non_compliance(target_register.id, target_approval.local_work_date);

  update public.working_time_day_approvals
  set status = 'validated', validated_by = auth.uid(), validated_by_person_id = actor_person_id,
      validated_at = clock_timestamp(),
      approver_identity_snapshot = public.working_time_person_identity_snapshot(actor_person_id, target_approval.company_id),
      signature_snapshot = approver_signature_data,
      approver_signature_snapshot = approver_signature_data,
      interval_snapshot = intervals_data, non_compliance_snapshot = non_compliance_data, updated_at = now()
  where id = target_approval.id;
  insert into public.working_time_day_approval_events (
    company_id, day_approval_id, register_id, person_id, local_work_date,
    event_type, previous_status, new_status, actor_user_id, actor_person_id,
    actor_identity_snapshot, interval_snapshot, non_compliance_snapshot
  ) values (
    target_approval.company_id, target_approval.id, target_approval.register_id, target_approval.person_id,
    target_approval.local_work_date, 'validated', 'submitted', 'validated', auth.uid(), actor_person_id,
    public.working_time_person_identity_snapshot(actor_person_id, target_approval.company_id),
    intervals_data, non_compliance_data
  ) returning id into saved_event_id;
  return saved_event_id;
end;
$$;

create or replace function public.working_time_can_comment_register(target_register_id bigint, target_local_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.working_time_registers register
    join public.working_time_day_approvals approval
      on approval.register_id = register.id
     and approval.local_work_date = target_local_date
     and approval.status = 'submitted'
    left join public.people actor on actor.id = public.current_person_id() and actor.company_id = register.company_id
    where register.id = target_register_id
      and public.user_belongs_to_company(register.company_id)
      and (
        public.working_time_can_manage_entry_scope(register.company_id)
        or (
          approval.approver_person_id = actor.id
          and actor.function_label = 'Capitaine'
          and public.working_time_captain_matches_day(register.company_id, register.person_id, actor.id, target_local_date)
        )
      )
  );
$$;

create or replace function public.validate_working_time_day_with_comment(
  p_day_approval_id bigint,
  p_cause_category text,
  p_operational_context text,
  p_immediate_action text,
  p_compensatory_rest_plan text,
  p_comment text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_approval public.working_time_day_approvals%rowtype;
begin
  select * into target_approval
  from public.working_time_day_approvals approval
  where approval.id = p_day_approval_id;
  if target_approval.id is null then
    raise exception using errcode = '23503', message = 'WORKING_TIME_DAY_APPROVAL_NOT_FOUND.';
  end if;
  perform public.save_working_time_day_comment(
    target_approval.register_id,
    target_approval.local_work_date,
    p_cause_category,
    p_operational_context,
    p_immediate_action,
    p_compensatory_rest_plan,
    p_comment
  );
  return public.validate_working_time_day(target_approval.id);
end;
$$;

revoke all on function public.working_time_active_signature_snapshot(bigint, bigint) from public, anon, authenticated;
revoke all on function public.working_time_captain_can_access_period(bigint, bigint, date, date, bigint, text) from public, anon, authenticated;
revoke all on function public.working_time_day_context(bigint, date) from public, anon, authenticated;
revoke all on function public.working_time_captain_matches_day(bigint, bigint, bigint, date) from public, anon, authenticated;
revoke all on function public.working_time_actor_can_edit_day(bigint, date) from public, anon, authenticated;
revoke all on function public.submit_working_time_day(bigint, date) from public, anon, authenticated;
revoke all on function public.validate_working_time_day(bigint) from public, anon, authenticated;
revoke all on function public.working_time_can_comment_register(bigint, date) from public, anon, authenticated;
revoke all on function public.validate_working_time_day_with_comment(bigint, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.working_time_day_context(bigint, date) to authenticated;
grant execute on function public.submit_working_time_day(bigint, date) to authenticated;
grant execute on function public.validate_working_time_day(bigint) to authenticated;
grant execute on function public.validate_working_time_day_with_comment(bigint, text, text, text, text, text) to authenticated;

comment on column public.working_time_day_approvals.subject_signature_snapshot is
  'Immutable active signature snapshot of the person whose working day was submitted.';
comment on column public.working_time_day_approvals.approver_signature_snapshot is
  'Immutable active signature snapshot of the exact HR Capitaine or fallback Admin/Armement approver.';
