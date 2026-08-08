-- Approved XLSM imports may replace existing days without re-running the
-- sailor/captain workflow. Exact server-side duplicates are retained as-is.

alter table public.working_time_registers
  add column discarded_at timestamptz,
  add column discarded_by uuid references public.profiles(id) on delete set null,
  add column discard_reason text;

alter table public.working_time_registers
  add constraint working_time_registers_discard_check check (
    (discarded_at is null and discarded_by is null and discard_reason is null)
    or (discarded_at is not null and discard_reason is not null)
  );

alter table public.working_time_validations
  drop constraint working_time_validations_event_check,
  drop constraint working_time_validations_transition_check,
  drop constraint working_time_validations_signature_check;

alter table public.working_time_validations
  add constraint working_time_validations_event_check check (
    event_type in ('signature_requested', 'sailor_signed', 'captain_validated', 'reopened', 'approved_import')
  ),
  add constraint working_time_validations_transition_check check (
    (event_type = 'signature_requested' and previous_status in ('draft', 'reopened') and new_status = 'awaiting_sailor_signature')
    or (event_type = 'sailor_signed' and previous_status = 'awaiting_sailor_signature' and new_status = 'submitted')
    or (event_type = 'captain_validated' and previous_status = 'submitted' and new_status = 'validated')
    or (event_type = 'reopened' and previous_status in ('awaiting_sailor_signature', 'submitted', 'validated') and new_status = 'reopened')
    or (event_type = 'approved_import' and new_status = 'validated')
  ),
  add constraint working_time_validations_signature_check check (
    (event_type in ('sailor_signed', 'captain_validated') and signature_version_id is not null and signature_snapshot is not null)
    or (event_type in ('signature_requested', 'reopened', 'approved_import') and signature_version_id is null and signature_snapshot is null)
  );

alter function public.preview_working_time_import(bigint,bigint,integer,text,text,text,jsonb,jsonb)
  rename to preview_working_time_import_base;
alter function public.commit_working_time_import(bigint)
  rename to commit_working_time_import_base;

revoke all on function public.preview_working_time_import_base(bigint,bigint,integer,text,text,text,jsonb,jsonb)
  from public, anon, authenticated;
revoke all on function public.commit_working_time_import_base(bigint)
  from public, anon, authenticated;

create or replace function public.preview_working_time_import(
  p_batch_id bigint,
  p_person_id bigint,
  p_source_year integer,
  p_timezone_name text,
  p_detected_person_name text,
  p_parser_version text,
  p_workbook_metadata jsonb,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  import_row public.working_time_import_rows%rowtype;
  existing_data jsonb;
  proposed_data jsonb;
  remaining_issues text[];
  replacement_enabled boolean := coalesce((p_workbook_metadata->>'replace_existing_days')::boolean, false);
  replacement_reason text := trim(coalesce(p_workbook_metadata->>'replacement_reason', ''));
  summary jsonb;
begin
  if replacement_enabled and length(replacement_reason) < 2 then
    raise exception using errcode = '22023', message = 'WORKING_TIME_IMPORT_REPLACEMENT_REASON_REQUIRED.';
  end if;

  perform public.preview_working_time_import_base(
    p_batch_id, p_person_id, p_source_year, p_timezone_name,
    p_detected_person_name, p_parser_version,
    coalesce(p_workbook_metadata, '{}'::jsonb) || jsonb_build_object(
      'replace_existing_days', replacement_enabled,
      'replacement_reason', case when replacement_enabled then replacement_reason else null end,
      'approval_mode', 'approved_xlsm'
    ),
    p_rows
  );

  for import_row in
    select *
    from public.working_time_import_rows row_item
    where row_item.batch_id = p_batch_id
      and row_item.status in ('duplicate', 'blocked_workflow', 'blocked_validated')
    order by row_item.local_work_date, row_item.id
    for update
  loop
    if import_row.vessel_id is null
      and (import_row.imo_number is not null or import_row.vessel_name is not null) then
      update public.working_time_import_rows row_item
      set vessel_id = resolved_vessel.id,
          updated_at = now()
      from lateral (
        select vessel.id
        from public.vessels vessel
        where vessel.company_id = import_row.company_id
          and (
            (import_row.imo_number is not null and vessel.imo_number = import_row.imo_number)
            or lower(trim(vessel.name)) = lower(trim(coalesce(import_row.vessel_name, '')))
          )
        order by case when vessel.imo_number = import_row.imo_number then 0 else 1 end, vessel.id
        limit 1
      ) resolved_vessel
      where row_item.id = import_row.id
      returning row_item.* into import_row;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'start_minute', (
        extract(hour from work_interval.starts_at at time zone work_interval.timezone_name)::integer * 60
        + extract(minute from work_interval.starts_at at time zone work_interval.timezone_name)::integer
      ),
      'end_minute', case
        when (work_interval.ends_at at time zone work_interval.timezone_name)::date > import_row.local_work_date then 1440
        else (
          extract(hour from work_interval.ends_at at time zone work_interval.timezone_name)::integer * 60
          + extract(minute from work_interval.ends_at at time zone work_interval.timezone_name)::integer
        )
      end,
      'vessel_id', work_interval.vessel_id,
      'watch_group', coalesce(trim(work_interval.watch_group), ''),
      'comment', coalesce(trim(work_interval.comment), '')
    ) order by work_interval.starts_at, work_interval.ends_at), '[]'::jsonb)
    into existing_data
    from public.working_time_intervals work_interval
    where work_interval.company_id = import_row.company_id
      and work_interval.person_id = import_row.person_id
      and work_interval.local_work_date = import_row.local_work_date
      and work_interval.voided_at is null;

    select coalesce(jsonb_agg(jsonb_build_object(
      'start_minute', (phase.value->>'start_minute')::integer,
      'end_minute', (phase.value->>'end_minute')::integer,
      'vessel_id', import_row.vessel_id,
      'watch_group', coalesce(trim(import_row.watch_group), ''),
      'comment', coalesce(trim(import_row.source_comment), '')
    ) order by (phase.value->>'start_minute')::integer, (phase.value->>'end_minute')::integer), '[]'::jsonb)
    into proposed_data
    from jsonb_array_elements(import_row.effective_phases) phase(value);

    if existing_data = proposed_data then
      update public.working_time_import_rows
      set status = 'duplicate',
          issue_codes = array['identical_existing_day']::text[],
          updated_at = now()
      where id = import_row.id;
    elsif replacement_enabled then
      remaining_issues := array(
        select issue
        from unnest(import_row.issue_codes) issue
        where issue not in ('validated_day', 'register_not_editable', 'existing_day')
        order by issue
      );
      update public.working_time_import_rows
      set status = case
            when cardinality(remaining_issues) > 0 then 'inconsistent'
            when effective_phases is distinct from detected_phases or user_note is not null then 'corrected'
            else 'ready'
          end,
          issue_codes = remaining_issues || array['will_replace_existing_day']::text[],
          updated_at = now()
      where id = import_row.id;
    end if;
  end loop;

  select jsonb_build_object(
    'total_rows', count(*),
    'ready_rows', count(*) filter (where status in ('ready', 'corrected')),
    'replacement_rows', count(*) filter (
      where status in ('ready', 'corrected') and issue_codes @> array['will_replace_existing_day']::text[]
    ),
    'excluded_rows', count(*) filter (where status = 'excluded'),
    'duplicate_rows', count(*) filter (where status = 'duplicate'),
    'inconsistent_rows', count(*) filter (where status = 'inconsistent'),
    'blocked_rows', count(*) filter (where status in ('blocked_workflow', 'blocked_validated')),
    'reported_work_seconds', coalesce(sum(reported_work_seconds), 0),
    'effective_work_seconds', coalesce(sum(effective_work_seconds) filter (where status in ('ready', 'corrected')), 0)
  ) into summary
  from public.working_time_import_rows
  where batch_id = p_batch_id;

  update public.working_time_import_batches
  set preview_summary = summary,
      workbook_metadata = workbook_metadata || jsonb_build_object(
        'replace_existing_days', replacement_enabled,
        'replacement_reason', case when replacement_enabled then replacement_reason else null end,
        'approval_mode', 'approved_xlsm'
      )
  where id = p_batch_id;

  return jsonb_build_object(
    'batch_id', p_batch_id,
    'status', 'preview_ready',
    'summary', summary,
    'rows', (
      select coalesce(jsonb_agg(to_jsonb(row_item) order by row_item.local_work_date), '[]'::jsonb)
      from public.working_time_import_rows row_item
      where row_item.batch_id = p_batch_id
    )
  );
end;
$$;

create or replace function public.working_time_record_approved_import(
  p_register_id bigint,
  p_batch_id bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_register public.working_time_registers%rowtype;
  target_batch public.working_time_import_batches%rowtype;
  subject_person public.people%rowtype;
  actor_person public.people%rowtype;
  actor_profile public.profiles%rowtype;
  subject_identity jsonb;
  actor_identity jsonb;
  actor_roles jsonb;
  vessels_data jsonb;
  watches_data jsonb;
  policy_data jsonb;
  intervals_data jsonb;
  saved_id bigint;
begin
  select * into target_register from public.working_time_registers where id = p_register_id for update;
  select * into target_batch from public.working_time_import_batches where id = p_batch_id;
  if target_register.id is null or target_batch.id is null
    or target_register.company_id <> target_batch.company_id
    or not public.working_time_can_manage_imports(target_register.company_id) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_IMPORT_PERMISSION_DENIED.';
  end if;

  select * into subject_person from public.people where id = target_register.person_id;
  select * into actor_person
  from public.people
  where user_id = auth.uid() and company_id = target_register.company_id
  limit 1;
  select * into actor_profile from public.profiles where id = auth.uid();
  select coalesce(jsonb_agg(role_key order by role_key), '[]'::jsonb)
  into actor_roles
  from public.user_roles
  where user_id = auth.uid() and company_id = target_register.company_id;

  subject_identity := jsonb_build_object(
    'person_id', subject_person.id, 'user_id', subject_person.user_id,
    'first_name', subject_person.first_name, 'last_name', subject_person.last_name,
    'email', subject_person.email, 'function_label', subject_person.function_label,
    'grade_label', subject_person.grade_label, 'sailor_number', subject_person.sailor_number
  );
  actor_identity := jsonb_build_object(
    'person_id', actor_person.id, 'user_id', auth.uid(),
    'first_name', actor_person.first_name, 'last_name', actor_person.last_name,
    'display_name', actor_profile.display_name,
    'email', coalesce(actor_person.email, actor_profile.email), 'roles', actor_roles
  );

  select coalesce(jsonb_agg(distinct jsonb_build_object(
    'vessel_id', vessel.id, 'name', vessel.name, 'acronym', vessel.acronym,
    'imo_number', vessel.imo_number, 'flag_state', vessel.flag_state
  )), '[]'::jsonb)
  into vessels_data
  from public.working_time_intervals work_interval
  join public.vessels vessel on vessel.id = work_interval.vessel_id
  where work_interval.register_id = target_register.id and work_interval.voided_at is null;

  select coalesce(jsonb_agg(distinct trim(work_interval.watch_group)), '[]'::jsonb)
  into watches_data
  from public.working_time_intervals work_interval
  where work_interval.register_id = target_register.id
    and work_interval.voided_at is null
    and nullif(trim(work_interval.watch_group), '') is not null;

  select to_jsonb(policy) into policy_data
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
    'source_type', work_interval.source_type,
    'source_reference', work_interval.source_reference,
    'source_metadata', work_interval.source_metadata
  ) order by work_interval.starts_at), '[]'::jsonb)
  into intervals_data
  from public.working_time_intervals work_interval
  where work_interval.register_id = target_register.id and work_interval.voided_at is null;

  insert into public.working_time_validations (
    company_id, register_id, person_id, event_type, previous_status, new_status,
    actor_user_id, actor_person_id, subject_identity_snapshot, actor_identity_snapshot,
    vessel_snapshot, watch_snapshot, policy_snapshot, interval_snapshot,
    non_compliance_snapshot, comment, occurred_at
  ) values (
    target_register.company_id, target_register.id, target_register.person_id,
    'approved_import', target_register.status, 'validated', auth.uid(), actor_person.id,
    subject_identity, actor_identity, vessels_data, watches_data, policy_data,
    intervals_data, '[]'::jsonb,
    'Import XLSM approuve #' || target_batch.id || ' - ' || target_batch.source_file_name
      || ' - SHA-256 ' || target_batch.source_sha256,
    clock_timestamp()
  ) returning id into saved_id;

  update public.working_time_registers
  set status = 'validated', updated_by = auth.uid(), updated_at = now()
  where id = target_register.id;
  return saved_id;
end;
$$;

create or replace function public.commit_working_time_import(p_batch_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_batch public.working_time_import_batches%rowtype;
  import_row public.working_time_import_rows%rowtype;
  target_register public.working_time_registers%rowtype;
  phase_data jsonb;
  phase_number integer;
  phase_start integer;
  phase_end integer;
  local_start timestamp;
  local_end timestamp;
  starts_at_utc timestamptz;
  ends_at_utc timestamptz;
  offset_minutes integer;
  saved_interval_id bigint;
  saved_interval_ids jsonb;
  base_result jsonb;
  base_summary jsonb;
  final_summary jsonb;
  replacement_enabled boolean;
  replacement_reason text;
  replaced_rows integer := 0;
  replaced_intervals integer := 0;
  voided_interval_count integer := 0;
  approved_registers integer := 0;
  register_id_value bigint;
begin
  select * into target_batch
  from public.working_time_import_batches batch
  where batch.id = p_batch_id
  for update;
  if target_batch.id is null or not public.working_time_can_manage_imports(target_batch.company_id) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_IMPORT_PERMISSION_DENIED.';
  end if;
  if target_batch.status <> 'preview_ready' then
    raise exception using errcode = '55000', message = 'WORKING_TIME_IMPORT_PREVIEW_REQUIRED.';
  end if;

  replacement_enabled := coalesce((target_batch.workbook_metadata->>'replace_existing_days')::boolean, false);
  replacement_reason := trim(coalesce(target_batch.workbook_metadata->>'replacement_reason', ''));
  if replacement_enabled and length(replacement_reason) < 2 then
    raise exception using errcode = '22023', message = 'WORKING_TIME_IMPORT_REPLACEMENT_REASON_REQUIRED.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'working-time-import:' || target_batch.company_id || ':' || target_batch.selected_person_id, 0
  ));

  update public.working_time_registers register
  set discarded_at = null, discarded_by = null, discard_reason = null,
      updated_by = auth.uid(), updated_at = now()
  where register.company_id = target_batch.company_id
    and register.person_id = target_batch.selected_person_id
    and register.discarded_at is not null
    and exists (
      select 1
      from public.working_time_import_rows row_item
      where row_item.batch_id = target_batch.id
        and row_item.status in ('ready', 'corrected')
        and row_item.local_work_date between register.period_start and register.period_end
    );

  if replacement_enabled then
    for import_row in
      select * from public.working_time_import_rows row_item
      where row_item.batch_id = target_batch.id
        and row_item.status in ('ready', 'corrected')
        and row_item.issue_codes @> array['will_replace_existing_day']::text[]
      order by row_item.local_work_date, row_item.id
      for update
    loop
      select register.* into target_register
      from public.working_time_registers register
      where register.company_id = target_batch.company_id
        and register.person_id = target_batch.selected_person_id
        and import_row.local_work_date between register.period_start and register.period_end
      order by
        case when exists (
          select 1 from public.working_time_intervals existing
          where existing.register_id = register.id
            and existing.local_work_date = import_row.local_work_date
            and existing.voided_at is null
        ) then 0 else 1 end,
        case when register.period_kind = 'monthly' then 0 else 1 end,
        register.id
      limit 1
      for update;

      if target_register.id is null then
        insert into public.working_time_registers (
          company_id, person_id, period_kind, period_start, period_end, status, created_by, updated_by
        ) values (
          target_batch.company_id, target_batch.selected_person_id, 'monthly',
          date_trunc('month', import_row.local_work_date)::date,
          (date_trunc('month', import_row.local_work_date) + interval '1 month - 1 day')::date,
          'draft', auth.uid(), auth.uid()
        ) returning * into target_register;
      end if;

      update public.working_time_intervals work_interval
      set voided_at = clock_timestamp(), voided_by = auth.uid(),
          void_reason = left('Remplace par import XLSM approuve #' || target_batch.id || ' : ' || replacement_reason, 1000)
      where work_interval.company_id = target_batch.company_id
        and work_interval.person_id = target_batch.selected_person_id
        and work_interval.local_work_date = import_row.local_work_date
        and work_interval.voided_at is null;
      get diagnostics voided_interval_count = row_count;
      replaced_intervals := replaced_intervals + voided_interval_count;

      saved_interval_ids := '[]'::jsonb;
      phase_number := 0;
      for phase_data in
        select value from jsonb_array_elements(import_row.effective_phases)
        order by (value->>'start_minute')::integer
      loop
        phase_number := phase_number + 1;
        phase_start := (phase_data->>'start_minute')::integer;
        phase_end := (phase_data->>'end_minute')::integer;
        local_start := import_row.local_work_date::timestamp + make_interval(mins => phase_start);
        local_end := import_row.local_work_date::timestamp + make_interval(mins => phase_end);
        starts_at_utc := local_start at time zone target_batch.timezone_name;
        ends_at_utc := local_end at time zone target_batch.timezone_name;
        offset_minutes := (
          extract(epoch from ((starts_at_utc at time zone target_batch.timezone_name) - (starts_at_utc at time zone 'UTC'))) / 60
        )::integer;

        insert into public.working_time_intervals (
          company_id, register_id, person_id, local_work_date, starts_at, ends_at,
          timezone_name, utc_offset_minutes, vessel_id, watch_group, comment,
          author_user_id, author_person_id, source_type, source_reference,
          source_record_key, source_metadata
        ) values (
          target_batch.company_id, target_register.id, target_batch.selected_person_id,
          import_row.local_work_date, starts_at_utc, ends_at_utc,
          target_batch.timezone_name, offset_minutes, import_row.vessel_id, import_row.watch_group,
          import_row.source_comment, auth.uid(), public.current_person_id(), 'excel_import',
          target_batch.source_file_name, target_batch.id || ':' || import_row.id || ':' || phase_number,
          jsonb_build_object(
            'import_batch_id', target_batch.id, 'import_row_id', import_row.id,
            'source_sha256', target_batch.source_sha256, 'source_sheet', import_row.source_sheet,
            'source_row', import_row.source_row, 'planning_assignment_id', import_row.planning_assignment_id,
            'parser_version', target_batch.parser_version, 'approval_mode', 'approved_xlsm',
            'replaced_existing_day', true, 'replacement_reason', replacement_reason
          )
        ) returning id into saved_interval_id;
        saved_interval_ids := saved_interval_ids || jsonb_build_array(saved_interval_id);
      end loop;

      update public.working_time_import_rows
      set status = 'imported', register_id = target_register.id,
          imported_interval_ids = saved_interval_ids, imported_at = clock_timestamp(), updated_at = now()
      where id = import_row.id;
      replaced_rows := replaced_rows + 1;
    end loop;
  end if;

  base_result := public.commit_working_time_import_base(p_batch_id);
  base_summary := coalesce(base_result->'summary', '{}'::jsonb);

  for register_id_value in
    select distinct row_item.register_id
    from public.working_time_import_rows row_item
    where row_item.batch_id = p_batch_id
      and row_item.status = 'imported'
      and row_item.register_id is not null
  loop
    perform public.working_time_record_approved_import(register_id_value, p_batch_id);
    approved_registers := approved_registers + 1;
  end loop;

  final_summary := base_summary || jsonb_build_object(
    'imported_rows', coalesce((base_summary->>'imported_rows')::integer, 0) + replaced_rows,
    'replaced_rows', replaced_rows,
    'replaced_intervals', replaced_intervals,
    'approved_registers', approved_registers,
    'identical_rows', (
      select count(*) from public.working_time_import_rows row_item
      where row_item.batch_id = p_batch_id
        and row_item.status = 'duplicate'
        and row_item.issue_codes @> array['identical_existing_day']::text[]
    )
  );
  update public.working_time_import_batches
  set import_summary = final_summary
  where id = p_batch_id;

  return jsonb_build_object('batch_id', p_batch_id, 'status', 'imported', 'summary', final_summary);
end;
$$;

create or replace function public.get_or_create_working_time_register(
  p_person_id bigint,
  p_period_kind text,
  p_period_start date
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  actor_person_id bigint := public.current_person_id();
  target_period_end date;
  target_register public.working_time_registers%rowtype;
begin
  if auth.uid() is null or target_company_id is null or actor_person_id is null then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PROFILE_NOT_LINKED: fiche RH requise.';
  end if;
  if p_period_kind = 'weekly' then
    target_period_end := p_period_start + 6;
  elsif p_period_kind = 'monthly' and p_period_start = date_trunc('month', p_period_start)::date then
    target_period_end := (date_trunc('month', p_period_start) + interval '1 month - 1 day')::date;
  else
    raise exception using errcode = '22023', message = 'WORKING_TIME_PERIOD_INVALID.';
  end if;
  if not exists (
    select 1 from public.people person
    where person.id = p_person_id and person.company_id = target_company_id and person.active
  ) then
    raise exception using errcode = '23503', message = 'WORKING_TIME_PERSON_NOT_FOUND.';
  end if;
  if not (
    public.working_time_can_manage_entry_scope(target_company_id)
    or (p_person_id = actor_person_id and public.has_company_role(target_company_id, array['marin', 'capitaine']))
    or public.working_time_captain_can_access_period(
      target_company_id, p_person_id, p_period_start, target_period_end
    )
  ) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: creation du registre.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'working-time-register:' || target_company_id || ':' || p_person_id || ':' || p_period_kind || ':' || p_period_start,
    0
  ));
  select register.* into target_register
  from public.working_time_registers register
  where register.company_id = target_company_id
    and register.person_id = p_person_id
    and register.period_kind = p_period_kind
    and register.period_start = p_period_start
    and register.period_end = target_period_end
  for update;

  if target_register.id is null then
    insert into public.working_time_registers (
      company_id, person_id, period_kind, period_start, period_end, created_by
    ) values (
      target_company_id, p_person_id, p_period_kind, p_period_start, target_period_end, auth.uid()
    ) returning * into target_register;
  elsif target_register.discarded_at is not null then
    update public.working_time_registers
    set discarded_at = null, discarded_by = null, discard_reason = null,
        updated_by = auth.uid(), updated_at = now()
    where id = target_register.id
    returning * into target_register;
  end if;
  return target_register.id;
end;
$$;

create or replace function public.discard_working_time_draft(p_register_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_register public.working_time_registers%rowtype;
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
  if target_register.status <> 'draft' or exists (
    select 1 from public.working_time_validations validation where validation.register_id = target_register.id
  ) then
    raise exception using errcode = '55000', message = 'WORKING_TIME_DRAFT_DISCARD_FORBIDDEN.';
  end if;
  if not (
    public.working_time_can_manage_entry_scope(target_register.company_id)
    or target_register.person_id = public.current_person_id()
    or public.working_time_captain_can_access_period(
      target_register.company_id, target_register.person_id,
      target_register.period_start, target_register.period_end
    )
  ) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: suppression du brouillon.';
  end if;
  delete from public.working_time_day_comments where register_id = target_register.id;
  delete from public.working_time_intervals where register_id = target_register.id;
  update public.working_time_registers
  set discarded_at = clock_timestamp(), discarded_by = auth.uid(),
      discard_reason = 'Brouillon abandonne sans enregistrement',
      updated_by = auth.uid(), updated_at = now()
  where id = target_register.id;
  return target_register.id;
end;
$$;

revoke all on function public.preview_working_time_import(bigint,bigint,integer,text,text,text,jsonb,jsonb)
  from public, anon, authenticated;
revoke all on function public.commit_working_time_import(bigint)
  from public, anon, authenticated;
revoke all on function public.working_time_record_approved_import(bigint,bigint)
  from public, anon, authenticated;
revoke all on function public.discard_working_time_draft(bigint)
  from public, anon, authenticated;

grant execute on function public.preview_working_time_import(bigint,bigint,integer,text,text,text,jsonb,jsonb)
  to authenticated;
grant execute on function public.commit_working_time_import(bigint)
  to authenticated;
grant execute on function public.discard_working_time_draft(bigint)
  to authenticated;

comment on function public.preview_working_time_import(bigint,bigint,integer,text,text,text,jsonb,jsonb) is
  'Detects strict existing-day duplicates and previews explicit approved-XLSM replacements.';
comment on function public.commit_working_time_import(bigint) is
  'Imports approved XLSM days, replaces only explicitly confirmed differences and preserves immutable audit evidence.';
comment on function public.discard_working_time_draft(bigint) is
  'Hides an unsigned draft, removes its unsaved content and retains an immutable audit trail after explicit confirmation.';
