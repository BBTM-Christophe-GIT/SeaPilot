-- Working Time step 6: managed PNG signatures, structured non-conformity
-- responses, frozen decision evidence and PDF-ready audit snapshots.

alter table public.working_time_day_comments
  add column cause_category text,
  add column operational_context text,
  add column immediate_action text,
  add column compensatory_rest_plan text;

alter table public.working_time_day_comments
  add constraint working_time_day_comments_cause_category_check check (
    cause_category is null or cause_category in (
      'unexpected_operation',
      'safety_emergency',
      'weather',
      'handover',
      'breakdown_maintenance',
      'understaffing',
      'other'
    )
  ),
  add constraint working_time_day_comments_operational_context_check check (
    operational_context is null or length(trim(operational_context)) between 2 and 4000
  ),
  add constraint working_time_day_comments_immediate_action_check check (
    immediate_action is null or length(trim(immediate_action)) between 2 and 4000
  ),
  add constraint working_time_day_comments_compensatory_rest_check check (
    compensatory_rest_plan is null or length(trim(compensatory_rest_plan)) between 2 and 4000
  );

alter table public.working_time_validations
  add column interval_snapshot jsonb not null default '[]'::jsonb,
  add column non_compliance_snapshot jsonb not null default '[]'::jsonb;

alter table public.working_time_validations
  add constraint working_time_validations_evidence_snapshot_check check (
    jsonb_typeof(interval_snapshot) = 'array'
    and jsonb_typeof(non_compliance_snapshot) = 'array'
  );

create or replace function public.working_time_can_manage_signature_person(
  target_company_id bigint,
  target_person_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and public.user_belongs_to_company(target_company_id)
    and exists (
      select 1
      from public.people person
      where person.id = target_person_id
        and person.company_id = target_company_id
        and person.active
    )
    and (
      target_person_id = public.current_person_id()
      or public.has_company_role(target_company_id, array['admin', 'armement'])
    );
$$;

create or replace function public.working_time_can_upload_signature_object(
  target_bucket text,
  target_path text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage, pg_temp
as $$
declare
  path_parts text[] := string_to_array(target_path, '/');
  target_company_id bigint;
  target_person_id bigint;
begin
  if auth.uid() is null
    or target_bucket <> 'working-time-signatures'
    or cardinality(path_parts) <> 3
    or path_parts[1] !~ '^[0-9]+$'
    or path_parts[2] !~ '^[0-9]+$'
    or lower(split_part(path_parts[3], '.', -1)) <> 'png' then
    return false;
  end if;

  target_company_id := path_parts[1]::bigint;
  target_person_id := path_parts[2]::bigint;

  return public.working_time_can_manage_signature_person(target_company_id, target_person_id);
end;
$$;

create or replace function public.working_time_signature_upload_context(p_person_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint;
  next_version integer;
begin
  select person.company_id into target_company_id
  from public.people person
  where person.id = p_person_id and person.active;

  if target_company_id is null
    or not public.working_time_can_manage_signature_person(target_company_id, p_person_id) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: gestion de signature.';
  end if;

  select coalesce(max(signature.version_number), 0) + 1 into next_version
  from public.working_time_profile_signatures signature
  where signature.company_id = target_company_id and signature.person_id = p_person_id;

  return jsonb_build_object(
    'company_id', target_company_id,
    'person_id', p_person_id,
    'next_version', next_version,
    'path_prefix', target_company_id || '/' || p_person_id || '/',
    'max_file_size_bytes', 1048576,
    'mime_type', 'image/png'
  );
end;
$$;

create or replace function public.register_working_time_profile_signature(
  p_person_id bigint,
  p_storage_path text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_sha256 text
)
returns bigint
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  target_company_id bigint;
  target_object storage.objects%rowtype;
  next_version integer;
  saved_id bigint;
begin
  select person.company_id into target_company_id
  from public.people person
  where person.id = p_person_id and person.active;

  if target_company_id is null
    or not public.working_time_can_manage_signature_person(target_company_id, p_person_id) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: signature.';
  end if;
  if not public.working_time_can_upload_signature_object('working-time-signatures', p_storage_path)
    or p_mime_type <> 'image/png'
    or p_file_size_bytes not between 1 and 1048576
    or lower(p_sha256) !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'WORKING_TIME_SIGNATURE_INVALID.';
  end if;

  select object.* into target_object
  from storage.objects object
  where object.bucket_id = 'working-time-signatures' and object.name = p_storage_path;
  if target_object.id is null then
    raise exception using errcode = '23514', message = 'WORKING_TIME_SIGNATURE_NOT_UPLOADED.';
  end if;
  if coalesce(target_object.metadata->>'mimetype', '') <> 'image/png'
    or coalesce((target_object.metadata->>'size')::bigint, 0) <> p_file_size_bytes then
    raise exception using errcode = '23514', message = 'WORKING_TIME_SIGNATURE_METADATA_MISMATCH.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'working-time-signature:' || target_company_id || ':' || p_person_id,
    0
  ));

  update public.working_time_profile_signatures
  set valid_to = now(), revoked_by = auth.uid(), revocation_reason = 'Remplacée par une nouvelle version'
  where company_id = target_company_id and person_id = p_person_id and valid_to is null;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.working_time_profile_signatures
  where company_id = target_company_id and person_id = p_person_id;

  insert into public.working_time_profile_signatures (
    company_id, person_id, version_number, storage_path, mime_type,
    file_size_bytes, sha256, created_by
  ) values (
    target_company_id, p_person_id, next_version, trim(p_storage_path),
    p_mime_type, p_file_size_bytes, lower(p_sha256), auth.uid()
  ) returning id into saved_id;

  return saved_id;
end;
$$;

drop function public.save_working_time_day_comment(bigint, date, text);

create function public.save_working_time_day_comment(
  p_register_id bigint,
  p_local_work_date date,
  p_cause_category text,
  p_operational_context text,
  p_immediate_action text,
  p_compensatory_rest_plan text,
  p_comment text
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_register public.working_time_registers%rowtype;
  saved_id bigint;
begin
  if p_cause_category not in (
    'unexpected_operation', 'safety_emergency', 'weather', 'handover',
    'breakdown_maintenance', 'understaffing', 'other'
  )
    or length(trim(coalesce(p_operational_context, ''))) < 2
    or length(trim(coalesce(p_immediate_action, ''))) < 2
    or length(trim(coalesce(p_compensatory_rest_plan, ''))) < 2
    or length(trim(coalesce(p_comment, ''))) < 2 then
    raise exception using errcode = '22023', message = 'WORKING_TIME_NON_COMPLIANCE_DETAILS_REQUIRED.';
  end if;

  select * into target_register
  from public.working_time_registers register
  where register.id = p_register_id
  for update;
  if target_register.id is null or not public.working_time_can_comment_register(
    target_register.id, p_local_work_date
  ) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: commentaire capitaine.';
  end if;
  if not exists (
    select 1 from public.working_time_calculation_windows calculation
    where calculation.company_id = target_register.company_id
      and calculation.person_id = target_register.person_id
      and calculation.local_window_end_date = p_local_work_date
      and calculation.is_compliant is false
  ) then
    raise exception using errcode = '22023', message = 'WORKING_TIME_COMMENT_DAY_IS_COMPLIANT.';
  end if;

  insert into public.working_time_day_comments (
    company_id, register_id, person_id, local_work_date,
    cause_category, operational_context, immediate_action,
    compensatory_rest_plan, comment, authored_by, authored_by_person_id
  ) values (
    target_register.company_id, target_register.id, target_register.person_id,
    p_local_work_date, p_cause_category, trim(p_operational_context),
    trim(p_immediate_action), trim(p_compensatory_rest_plan), trim(p_comment),
    auth.uid(), public.current_person_id()
  )
  on conflict (register_id, local_work_date) do update
  set cause_category = excluded.cause_category,
      operational_context = excluded.operational_context,
      immediate_action = excluded.immediate_action,
      compensatory_rest_plan = excluded.compensatory_rest_plan,
      comment = excluded.comment,
      authored_by = excluded.authored_by,
      authored_by_person_id = excluded.authored_by_person_id,
      updated_at = now()
  returning id into saved_id;
  return saved_id;
end;
$$;

create or replace function public.transition_working_time_register(
  p_register_id bigint,
  p_action text,
  p_comment text default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_register public.working_time_registers%rowtype;
  subject_person public.people%rowtype;
  actor_person public.people%rowtype;
  actor_signature public.working_time_profile_signatures%rowtype;
  target_status text;
  event_name text;
  decision_at timestamptz := clock_timestamp();
  subject_roles_data jsonb;
  actor_roles_data jsonb;
  subject_identity jsonb;
  actor_identity jsonb;
  signature_data jsonb;
  vessels_data jsonb;
  watches_data jsonb;
  policy_data jsonb;
  intervals_data jsonb;
  non_compliance_data jsonb;
  saved_id bigint;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: authentification requise.';
  end if;

  select * into target_register
  from public.working_time_registers register
  where register.id = p_register_id
  for update;
  if target_register.id is null or not public.user_belongs_to_company(target_register.company_id) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: registre.';
  end if;

  select * into subject_person from public.people where id = target_register.person_id;
  select * into actor_person
  from public.people
  where user_id = auth.uid() and company_id = target_register.company_id
  limit 1;
  if actor_person.id is null then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PROFILE_NOT_LINKED: fiche RH requise.';
  end if;

  if p_action = 'request_sailor_signature'
    and target_register.status in ('draft', 'reopened') then
    if not (
      (
        actor_person.id = target_register.person_id
        and public.has_company_role(target_register.company_id, array['marin', 'capitaine'])
      )
      or public.has_company_role(target_register.company_id, array['admin', 'armement'])
      or public.working_time_captain_can_access_period(
        target_register.company_id, target_register.person_id,
        target_register.period_start, target_register.period_end
      )
    ) then
      raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: demande de signature.';
    end if;
    if not exists (
      select 1 from public.working_time_intervals work_interval
      where work_interval.register_id = target_register.id and work_interval.voided_at is null
    ) then
      raise exception using errcode = '23514', message = 'WORKING_TIME_EMPTY_REGISTER.';
    end if;
    target_status := 'awaiting_sailor_signature';
    event_name := 'signature_requested';
  elsif p_action = 'sailor_sign'
    and target_register.status = 'awaiting_sailor_signature' then
    if actor_person.id <> target_register.person_id then
      raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: signature du marin.';
    end if;
    if not public.has_company_role(target_register.company_id, array['marin', 'capitaine']) then
      raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: profil marin ou capitaine requis.';
    end if;
    target_status := 'submitted';
    event_name := 'sailor_signed';
  elsif p_action = 'captain_validate'
    and target_register.status = 'submitted' then
    if actor_person.id = target_register.person_id then
      raise exception using errcode = '42501', message = 'WORKING_TIME_SELF_VALIDATION_FORBIDDEN.';
    end if;
    if not public.has_company_role(target_register.company_id, array['admin', 'armement'])
      and not public.working_time_captain_can_access_period(
        target_register.company_id, target_register.person_id,
        target_register.period_start, target_register.period_end
      ) then
      raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: validation.';
    end if;
    if public.has_company_role(target_register.company_id, array['capitaine'])
      and not public.has_company_role(target_register.company_id, array['admin', 'armement'])
      and exists (
        select 1
        from public.working_time_intervals work_interval
        where work_interval.register_id = target_register.id
          and work_interval.voided_at is null
          and not public.working_time_captain_can_access_period(
            target_register.company_id, target_register.person_id,
            work_interval.local_work_date, work_interval.local_work_date,
            work_interval.vessel_id, work_interval.watch_group
          )
      ) then
      raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: période hors bordée publiée.';
    end if;
    if exists (
      select 1
      from (
        select distinct calculation.local_window_end_date
        from public.working_time_calculation_windows calculation
        where calculation.company_id = target_register.company_id
          and calculation.person_id = target_register.person_id
          and calculation.local_window_end_date between target_register.period_start and target_register.period_end
          and calculation.is_compliant is false
      ) non_compliant_day
      where not exists (
        select 1
        from public.working_time_day_comments day_comment
        join public.user_roles captain_role
          on captain_role.user_id = day_comment.authored_by
         and captain_role.company_id = target_register.company_id
         and captain_role.role_key = 'capitaine'
        where day_comment.register_id = target_register.id
          and day_comment.local_work_date = non_compliant_day.local_window_end_date
          and day_comment.cause_category is not null
          and length(trim(coalesce(day_comment.operational_context, ''))) >= 2
          and length(trim(coalesce(day_comment.immediate_action, ''))) >= 2
          and length(trim(coalesce(day_comment.compensatory_rest_plan, ''))) >= 2
          and length(trim(day_comment.comment)) >= 2
      )
    ) then
      raise exception using errcode = '23514', message = 'WORKING_TIME_NON_COMPLIANCE_DETAILS_REQUIRED.';
    end if;
    target_status := 'validated';
    event_name := 'captain_validated';
  elsif p_action = 'reopen'
    and target_register.status in ('awaiting_sailor_signature', 'submitted', 'validated') then
    if length(trim(coalesce(p_comment, ''))) < 2 then
      raise exception using errcode = '22023', message = 'WORKING_TIME_REOPEN_COMMENT_REQUIRED.';
    end if;
    if not public.has_company_role(target_register.company_id, array['admin', 'armement'])
      and not public.working_time_captain_can_access_period(
        target_register.company_id, target_register.person_id,
        target_register.period_start, target_register.period_end
      ) then
      raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: réouverture.';
    end if;
    target_status := 'reopened';
    event_name := 'reopened';
  else
    raise exception using errcode = '22023', message = 'WORKING_TIME_INVALID_TRANSITION.';
  end if;

  select coalesce(jsonb_agg(role.role_key order by role.role_key), '[]'::jsonb)
  into subject_roles_data
  from public.user_roles role
  where role.user_id = subject_person.user_id and role.company_id = target_register.company_id;

  select coalesce(jsonb_agg(role.role_key order by role.role_key), '[]'::jsonb)
  into actor_roles_data
  from public.user_roles role
  where role.user_id = actor_person.user_id and role.company_id = target_register.company_id;

  if event_name in ('sailor_signed', 'captain_validated') then
    select * into actor_signature
    from public.working_time_profile_signatures signature
    where signature.company_id = target_register.company_id
      and signature.person_id = actor_person.id
      and signature.valid_to is null
    order by signature.version_number desc
    limit 1;
    if actor_signature.id is null then
      raise exception using errcode = '23514', message = 'WORKING_TIME_ACTIVE_SIGNATURE_REQUIRED.';
    end if;
    signature_data := jsonb_build_object(
      'signature_id', actor_signature.id,
      'signer_person_id', actor_person.id,
      'signer_user_id', actor_person.user_id,
      'signer_name', trim(actor_person.first_name || ' ' || actor_person.last_name),
      'signer_roles', actor_roles_data,
      'signed_at', decision_at,
      'version_number', actor_signature.version_number,
      'storage_bucket', actor_signature.storage_bucket,
      'storage_path', actor_signature.storage_path,
      'mime_type', actor_signature.mime_type,
      'file_size_bytes', actor_signature.file_size_bytes,
      'sha256', actor_signature.sha256,
      'valid_from', actor_signature.valid_from
    );
  end if;

  subject_identity := jsonb_build_object(
    'person_id', subject_person.id, 'user_id', subject_person.user_id,
    'first_name', subject_person.first_name, 'last_name', subject_person.last_name,
    'email', subject_person.email, 'function_label', subject_person.function_label,
    'grade_label', subject_person.grade_label, 'sailor_number', subject_person.sailor_number,
    'roles', subject_roles_data
  );
  actor_identity := jsonb_build_object(
    'person_id', actor_person.id, 'user_id', actor_person.user_id,
    'first_name', actor_person.first_name, 'last_name', actor_person.last_name,
    'email', actor_person.email, 'function_label', actor_person.function_label,
    'grade_label', actor_person.grade_label, 'sailor_number', actor_person.sailor_number,
    'roles', actor_roles_data
  );

  select coalesce(jsonb_agg(item order by item->>'name'), '[]'::jsonb) into vessels_data
  from (
    select distinct jsonb_build_object(
      'vessel_id', vessel.id, 'name', vessel.name, 'acronym', vessel.acronym
    ) as item
    from public.working_time_intervals work_interval
    join public.vessels vessel on vessel.id = work_interval.vessel_id
    where work_interval.register_id = target_register.id and work_interval.voided_at is null
  ) vessels;

  select coalesce(jsonb_agg(watch_group order by watch_group), '[]'::jsonb) into watches_data
  from (
    select distinct trim(work_interval.watch_group) as watch_group
    from public.working_time_intervals work_interval
    where work_interval.register_id = target_register.id
      and work_interval.voided_at is null
      and nullif(trim(work_interval.watch_group), '') is not null
  ) watches;

  select jsonb_build_object(
    'policy_id', policy.id, 'name', policy.name, 'scope', policy.scope,
    'vessel_id', policy.vessel_id, 'effective_from', policy.effective_from,
    'effective_to', policy.effective_to, 'max_work_24h', policy.max_work_24h,
    'min_rest_24h', policy.min_rest_24h, 'max_work_7d', policy.max_work_7d,
    'min_rest_7d', policy.min_rest_7d,
    'min_consecutive_rest_hours', policy.min_consecutive_rest_hours,
    'max_rest_periods_24h', policy.max_rest_periods_24h,
    'night_starts_at', policy.night_starts_at, 'night_ends_at', policy.night_ends_at,
    'max_night_work_24h', policy.max_night_work_24h,
    'include_handover', policy.include_handover
  ) into policy_data
  from public.planning_work_rest_policies policy
  where policy.id = target_register.work_rest_policy_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'interval_id', work_interval.id,
    'local_work_date', work_interval.local_work_date,
    'starts_at', work_interval.starts_at,
    'ends_at', work_interval.ends_at,
    'timezone_name', work_interval.timezone_name,
    'utc_offset_minutes', work_interval.utc_offset_minutes,
    'vessel_id', work_interval.vessel_id,
    'watch_group', work_interval.watch_group,
    'comment', work_interval.comment,
    'author_user_id', work_interval.author_user_id,
    'author_person_id', work_interval.author_person_id,
    'source_type', work_interval.source_type
  ) order by work_interval.starts_at), '[]'::jsonb)
  into intervals_data
  from public.working_time_intervals work_interval
  where work_interval.register_id = target_register.id and work_interval.voided_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'local_work_date', non_compliant_day.local_work_date,
    'status', 'NON CONFORME',
    'calculations', non_compliant_day.calculations,
    'response', case when day_comment.id is null then null else jsonb_build_object(
      'comment_id', day_comment.id,
      'cause_category', day_comment.cause_category,
      'operational_context', day_comment.operational_context,
      'immediate_action', day_comment.immediate_action,
      'compensatory_rest_plan', day_comment.compensatory_rest_plan,
      'comment', day_comment.comment,
      'authored_by', day_comment.authored_by,
      'authored_by_person_id', day_comment.authored_by_person_id,
      'updated_at', day_comment.updated_at
    ) end
  ) order by non_compliant_day.local_work_date), '[]'::jsonb)
  into non_compliance_data
  from (
    select calculation.local_window_end_date as local_work_date,
      jsonb_agg(jsonb_build_object(
        'window_end', calculation.window_end,
        'violation_codes', calculation.violation_codes,
        'work_24h_seconds', calculation.work_24h_seconds,
        'rest_24h_seconds', calculation.rest_24h_seconds,
        'longest_rest_24h_seconds', calculation.longest_rest_24h_seconds,
        'rest_period_count_24h', calculation.rest_period_count_24h,
        'work_7d_seconds', calculation.work_7d_seconds,
        'rest_7d_seconds', calculation.rest_7d_seconds,
        'night_work_24h_seconds', calculation.night_work_24h_seconds,
        'policy_id', calculation.work_rest_policy_id,
        'calculation_version', calculation.calculation_version,
        'calculated_at', calculation.calculated_at
      ) order by calculation.window_end) as calculations
    from public.working_time_calculation_windows calculation
    where calculation.company_id = target_register.company_id
      and calculation.person_id = target_register.person_id
      and calculation.local_window_end_date between target_register.period_start and target_register.period_end
      and calculation.is_compliant is false
    group by calculation.local_window_end_date
  ) non_compliant_day
  left join public.working_time_day_comments day_comment
    on day_comment.register_id = target_register.id
   and day_comment.local_work_date = non_compliant_day.local_work_date;

  insert into public.working_time_validations (
    company_id, register_id, person_id, event_type, previous_status, new_status,
    actor_user_id, actor_person_id, signature_version_id,
    subject_identity_snapshot, actor_identity_snapshot, signature_snapshot,
    vessel_snapshot, watch_snapshot, policy_snapshot,
    interval_snapshot, non_compliance_snapshot, comment, occurred_at
  ) values (
    target_register.company_id, target_register.id, target_register.person_id,
    event_name, target_register.status, target_status,
    auth.uid(), actor_person.id, actor_signature.id,
    subject_identity, actor_identity, signature_data,
    vessels_data, watches_data, policy_data,
    intervals_data, non_compliance_data,
    nullif(trim(coalesce(p_comment, '')), ''), decision_at
  ) returning id into saved_id;

  update public.working_time_registers
  set status = target_status, updated_at = now(), updated_by = auth.uid()
  where id = target_register.id;
  return saved_id;
end;
$$;

update storage.buckets
set public = false,
    file_size_limit = 1048576,
    allowed_mime_types = array['image/png']::text[]
where id = 'working-time-signatures';

drop policy if exists working_time_signatures_storage_read on storage.objects;
create policy working_time_signatures_storage_read on storage.objects
for select to authenticated
using (
  bucket_id = 'working-time-signatures'
  and (
    public.working_time_can_upload_signature_object(bucket_id, name)
    or exists (
      select 1
      from public.working_time_profile_signatures signature
      where signature.storage_bucket = storage.objects.bucket_id
        and signature.storage_path = storage.objects.name
        and public.working_time_can_read_signature(signature.id)
    )
  )
);

drop policy if exists working_time_signatures_storage_insert on storage.objects;
create policy working_time_signatures_storage_insert on storage.objects
for insert to authenticated
with check (public.working_time_can_upload_signature_object(bucket_id, name));

drop policy if exists working_time_signatures_storage_delete_unregistered on storage.objects;
create policy working_time_signatures_storage_delete_unregistered on storage.objects
for delete to authenticated
using (
  public.working_time_can_upload_signature_object(bucket_id, name)
  and not exists (
    select 1
    from public.working_time_profile_signatures signature
    where signature.storage_bucket = storage.objects.bucket_id
      and signature.storage_path = storage.objects.name
  )
);

revoke all on function public.working_time_can_manage_signature_person(bigint, bigint) from public, anon;
revoke all on function public.working_time_can_upload_signature_object(text, text) from public, anon;
revoke all on function public.working_time_signature_upload_context(bigint) from public, anon;
revoke all on function public.register_working_time_profile_signature(bigint, text, text, bigint, text) from public, anon;
revoke all on function public.save_working_time_day_comment(bigint, date, text, text, text, text, text) from public, anon;
revoke all on function public.transition_working_time_register(bigint, text, text) from public, anon;

grant execute on function public.working_time_can_manage_signature_person(bigint, bigint) to authenticated;
grant execute on function public.working_time_can_upload_signature_object(text, text) to authenticated;
grant execute on function public.working_time_signature_upload_context(bigint) to authenticated;
grant execute on function public.register_working_time_profile_signature(bigint, text, text, bigint, text) to authenticated;
grant execute on function public.save_working_time_day_comment(bigint, date, text, text, text, text, text) to authenticated;
grant execute on function public.transition_working_time_register(bigint, text, text) to authenticated;

comment on function public.working_time_signature_upload_context(bigint) is
  'Returns the authorized private PNG upload scope for a profile-signature version.';
comment on function public.register_working_time_profile_signature(bigint, text, text, bigint, text) is
  'Registers an uploaded private PNG as a versioned profile signature with its SHA-256 digest.';
comment on function public.save_working_time_day_comment(bigint, date, text, text, text, text, text) is
  'Stores the mandatory structured captain response without altering calculated non-compliance.';
comment on column public.working_time_validations.interval_snapshot is
  'Frozen active intervals captured at each workflow decision.';
comment on column public.working_time_validations.non_compliance_snapshot is
  'Frozen server calculations and structured captain responses captured at each workflow decision.';
