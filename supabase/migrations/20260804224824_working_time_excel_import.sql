-- Working Time step 10: audited XLSM imports.
-- The browser only reads OpenXML parts. Macro payloads are retained as source
-- evidence in a private bucket and are never interpreted or executed.

create table public.working_time_import_batches (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade
    default public.current_planning_company_id(),
  source_file_name text not null,
  source_storage_bucket text not null default 'working-time-imports',
  source_storage_path text not null unique,
  source_mime_type text not null,
  source_file_size_bytes bigint not null,
  source_sha256 text not null,
  parser_version text,
  detected_person_name text,
  selected_person_id bigint references public.people(id) on delete restrict,
  source_year integer,
  timezone_name text,
  status text not null default 'awaiting_upload',
  workbook_metadata jsonb not null default '{}'::jsonb,
  preview_summary jsonb not null default '{}'::jsonb,
  import_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  previewed_at timestamptz,
  imported_at timestamptz,
  imported_by uuid references public.profiles(id) on delete set null,
  constraint working_time_import_batches_file_name_check
    check (length(trim(source_file_name)) between 6 and 255 and lower(source_file_name) like '%.xlsm'),
  constraint working_time_import_batches_file_size_check
    check (source_file_size_bytes between 1 and 20971520),
  constraint working_time_import_batches_sha256_check
    check (source_sha256 ~ '^[0-9a-f]{64}$'),
  constraint working_time_import_batches_year_check
    check (source_year is null or source_year between 2000 and 2200),
  constraint working_time_import_batches_status_check
    check (status in ('awaiting_upload', 'preview_ready', 'imported', 'cancelled'))
);

create table public.working_time_import_rows (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  batch_id bigint not null references public.working_time_import_batches(id) on delete cascade,
  person_id bigint not null references public.people(id) on delete restrict,
  source_sheet text not null,
  source_row integer not null,
  local_work_date date not null,
  detected_phases jsonb not null default '[]'::jsonb,
  effective_phases jsonb not null default '[]'::jsonb,
  reported_work_seconds integer,
  effective_work_seconds integer not null default 0,
  captain_name text,
  vessel_name text,
  imo_number text,
  flag_state text,
  source_comment text,
  vessel_id bigint references public.vessels(id) on delete restrict,
  watch_group text,
  planning_assignment_id bigint references public.planning_assignments(id) on delete set null,
  status text not null,
  issue_codes text[] not null default '{}'::text[],
  user_note text,
  source_row_hash text not null,
  register_id bigint references public.working_time_registers(id) on delete set null,
  imported_interval_ids jsonb not null default '[]'::jsonb,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint working_time_import_rows_source_check
    check (length(trim(source_sheet)) between 1 and 120 and source_row between 1 and 1000),
  constraint working_time_import_rows_phases_check
    check (jsonb_typeof(detected_phases) = 'array' and jsonb_typeof(effective_phases) = 'array'),
  constraint working_time_import_rows_reported_check
    check (reported_work_seconds is null or reported_work_seconds between 0 and 86400),
  constraint working_time_import_rows_effective_check
    check (effective_work_seconds between 0 and 86400),
  constraint working_time_import_rows_status_check
    check (status in ('ready', 'corrected', 'excluded', 'duplicate', 'inconsistent', 'blocked_workflow', 'blocked_validated', 'imported')),
  constraint working_time_import_rows_hash_check check (source_row_hash ~ '^[0-9a-f]{32}$'),
  constraint working_time_import_rows_unique_source unique (batch_id, source_sheet, source_row),
  constraint working_time_import_rows_unique_date unique (batch_id, local_work_date)
);

create index working_time_import_batches_company_created_idx
  on public.working_time_import_batches (company_id, created_at desc);
create index working_time_import_rows_batch_status_idx
  on public.working_time_import_rows (batch_id, status, local_work_date);
create index working_time_import_rows_person_date_idx
  on public.working_time_import_rows (company_id, person_id, local_work_date);

alter table public.working_time_import_batches enable row level security;
alter table public.working_time_import_rows enable row level security;

create or replace function public.working_time_can_manage_imports(target_company_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and public.user_belongs_to_company(target_company_id)
    and public.has_company_role(target_company_id, array['admin', 'armement']);
$$;

revoke all on public.working_time_import_batches, public.working_time_import_rows from anon, authenticated;
grant select on public.working_time_import_batches, public.working_time_import_rows to authenticated;

create policy working_time_import_batches_management_read
on public.working_time_import_batches for select to authenticated
using (public.working_time_can_manage_imports(company_id));

create policy working_time_import_rows_management_read
on public.working_time_import_rows for select to authenticated
using (public.working_time_can_manage_imports(company_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'working-time-imports', 'working-time-imports', false, 20971520,
  array['application/vnd.ms-excel.sheet.macroEnabled.12']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy working_time_imports_storage_read
on storage.objects for select to authenticated
using (
  bucket_id = 'working-time-imports'
  and exists (
    select 1 from public.working_time_import_batches batch
    where batch.source_storage_path = storage.objects.name
      and public.working_time_can_manage_imports(batch.company_id)
  )
);

create policy working_time_imports_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'working-time-imports'
  and exists (
    select 1 from public.working_time_import_batches batch
    where batch.source_storage_path = storage.objects.name
      and batch.created_by = auth.uid()
      and batch.status = 'awaiting_upload'
      and public.working_time_can_manage_imports(batch.company_id)
  )
);

create or replace function public.working_time_import_upload_context(
  p_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  saved_id bigint;
  safe_name text;
  object_path text;
begin
  if not public.working_time_can_manage_imports(target_company_id) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_IMPORT_PERMISSION_DENIED.';
  end if;
  if length(trim(coalesce(p_file_name, ''))) not between 6 and 255
    or lower(trim(p_file_name)) not like '%.xlsm' then
    raise exception using errcode = '22023', message = 'WORKING_TIME_IMPORT_XLSM_REQUIRED.';
  end if;
  if p_mime_type <> 'application/vnd.ms-excel.sheet.macroEnabled.12' then
    raise exception using errcode = '22023', message = 'WORKING_TIME_IMPORT_MIME_INVALID.';
  end if;
  if p_file_size_bytes not between 1 and 20971520 then
    raise exception using errcode = '22023', message = 'WORKING_TIME_IMPORT_FILE_SIZE_INVALID.';
  end if;
  if lower(trim(coalesce(p_sha256, ''))) !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'WORKING_TIME_IMPORT_SHA256_INVALID.';
  end if;

  safe_name := regexp_replace(trim(p_file_name), '[^A-Za-z0-9._-]+', '-', 'g');
  insert into public.working_time_import_batches (
    company_id, source_file_name, source_storage_path, source_mime_type,
    source_file_size_bytes, source_sha256, created_by
  ) values (
    target_company_id, trim(p_file_name), target_company_id || '/pending/' || gen_random_uuid(), p_mime_type,
    p_file_size_bytes, lower(trim(p_sha256)), auth.uid()
  ) returning id into saved_id;

  object_path := target_company_id || '/' || auth.uid() || '/' || saved_id || '/' || safe_name;
  update public.working_time_import_batches
  set source_storage_path = object_path
  where id = saved_id;

  return jsonb_build_object(
    'batch_id', saved_id,
    'storage_bucket', 'working-time-imports',
    'storage_path', object_path
  );
end;
$$;

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
set search_path = public, storage, pg_temp
as $$
declare
  target_batch public.working_time_import_batches%rowtype;
  row_data jsonb;
  phase_data jsonb;
  original_phases jsonb;
  effective_phases jsonb;
  target_date date;
  source_sheet text;
  source_row integer;
  reported_seconds integer;
  effective_seconds integer;
  phase_start integer;
  phase_end integer;
  previous_end integer;
  issues text[];
  target_status text;
  target_vessel_id bigint;
  target_watch_group text;
  target_assignment_id bigint;
  source_hash text;
  was_corrected boolean;
  summary jsonb;
begin
  select * into target_batch
  from public.working_time_import_batches batch
  where batch.id = p_batch_id
  for update;
  if target_batch.id is null or not public.working_time_can_manage_imports(target_batch.company_id) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_IMPORT_PERMISSION_DENIED.';
  end if;
  if target_batch.status not in ('awaiting_upload', 'preview_ready') then
    raise exception using errcode = '55000', message = 'WORKING_TIME_IMPORT_BATCH_LOCKED.';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = target_batch.source_storage_bucket
      and object.name = target_batch.source_storage_path
  ) then
    raise exception using errcode = '55000', message = 'WORKING_TIME_IMPORT_SOURCE_NOT_UPLOADED.';
  end if;
  if p_source_year not between 2000 and 2200 then
    raise exception using errcode = '22023', message = 'WORKING_TIME_IMPORT_YEAR_INVALID.';
  end if;
  if not exists (select 1 from pg_timezone_names zone where zone.name = p_timezone_name) then
    raise exception using errcode = '22023', message = 'WORKING_TIME_TIMEZONE_INVALID.';
  end if;
  if not exists (
    select 1 from public.people person
    where person.id = p_person_id and person.company_id = target_batch.company_id and person.active
  ) then
    raise exception using errcode = '23503', message = 'WORKING_TIME_IMPORT_PERSON_NOT_FOUND.';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception using errcode = '22023', message = 'WORKING_TIME_IMPORT_ROWS_INVALID.';
  end if;
  if jsonb_array_length(p_rows) not between 1 and 366 then
    raise exception using errcode = '22023', message = 'WORKING_TIME_IMPORT_ROWS_INVALID.';
  end if;
  if (select count(*) from jsonb_array_elements(p_rows)) <>
     (select count(distinct (item->>'date')) from jsonb_array_elements(p_rows) item) then
    raise exception using errcode = '22023', message = 'WORKING_TIME_IMPORT_DUPLICATE_SOURCE_DATES.';
  end if;

  delete from public.working_time_import_rows where batch_id = target_batch.id;

  for row_data in select value from jsonb_array_elements(p_rows) loop
    issues := '{}'::text[];
    source_sheet := left(trim(coalesce(row_data->>'sheet', '')), 120);
    begin
      source_row := (row_data->>'row')::integer;
      target_date := (row_data->>'date')::date;
      reported_seconds := nullif(row_data->>'reported_work_seconds', '')::integer;
    exception when others then
      raise exception using errcode = '22023', message = 'WORKING_TIME_IMPORT_ROW_FORMAT_INVALID.';
    end;
    if source_sheet = '' or source_row not between 1 and 1000
      or extract(year from target_date)::integer <> p_source_year then
      raise exception using errcode = '22023', message = 'WORKING_TIME_IMPORT_ROW_DATE_INVALID.';
    end if;

    original_phases := coalesce(row_data->'detected_phases', '[]'::jsonb);
    effective_phases := coalesce(row_data->'phases', original_phases);
    if jsonb_typeof(original_phases) <> 'array' or jsonb_typeof(effective_phases) <> 'array' then
      issues := array_append(issues, 'invalid_phases');
      original_phases := '[]'::jsonb;
      effective_phases := '[]'::jsonb;
    elsif jsonb_array_length(original_phases) > 48 or jsonb_array_length(effective_phases) > 48 then
      issues := array_append(issues, 'invalid_phases');
      effective_phases := '[]'::jsonb;
    end if;

    effective_seconds := 0;
    previous_end := null;
    begin
      for phase_data in
        select value from jsonb_array_elements(effective_phases)
        order by (value->>'start_minute')::integer, (value->>'end_minute')::integer
      loop
        phase_start := (phase_data->>'start_minute')::integer;
        phase_end := (phase_data->>'end_minute')::integer;
        if phase_start < 0 or phase_end > 1440 or phase_end <= phase_start
          or phase_start % 30 <> 0 or phase_end % 30 <> 0
          or (previous_end is not null and phase_start < previous_end) then
          issues := array_append(issues, 'invalid_phases');
        end if;
        effective_seconds := effective_seconds + greatest(0, phase_end - phase_start) * 60;
        previous_end := greatest(coalesce(previous_end, 0), phase_end);
      end loop;
    exception when others then
      issues := array_append(issues, 'invalid_phases');
      effective_seconds := 0;
    end;
    issues := array(select distinct issue from unnest(issues) issue order by issue);

    if reported_seconds is not null and reported_seconds <> effective_seconds then
      issues := array_append(issues, 'total_mismatch');
    end if;
    if effective_seconds = 0 and coalesce(reported_seconds, 0) > 0 then
      issues := array_append(issues, 'missing_phases');
    end if;

    select vessel.id into target_vessel_id
    from public.vessels vessel
    where vessel.company_id = target_batch.company_id
      and (
        (nullif(trim(row_data->>'imo_number'), '') is not null and vessel.imo_number = trim(row_data->>'imo_number'))
        or lower(trim(vessel.name)) = lower(trim(coalesce(row_data->>'vessel_name', '')))
      )
    order by case when vessel.imo_number = trim(row_data->>'imo_number') then 0 else 1 end, vessel.id
    limit 1;

    select assignment.id, assignment.vessel_id, nullif(trim(assignment.watch_group), '')
    into target_assignment_id, target_vessel_id, target_watch_group
    from public.planning_assignments assignment
    where assignment.company_id = target_batch.company_id
      and (assignment.crew_person_id = p_person_id or assignment.captain_person_id = p_person_id)
      and target_date between assignment.starts_on and assignment.ends_on
      and assignment.confirmation_status <> 'cancelled'
      and (target_vessel_id is null or assignment.vessel_id = target_vessel_id)
      and exists (
        select 1 from public.planning_publications publication
        where publication.published_at is not null
          and publication.current_version > 0
          and target_date between publication.starts_on and publication.ends_on
          and (publication.vessel_id is null or publication.vessel_id = assignment.vessel_id)
      )
    order by assignment.starts_on desc, assignment.id desc
    limit 1;

    was_corrected := effective_phases is distinct from original_phases
      or length(trim(coalesce(row_data->>'user_note', ''))) > 0;
    if coalesce((row_data->>'excluded')::boolean, false) then
      target_status := 'excluded';
    elsif exists (
      select 1 from public.working_time_registers register
      where register.company_id = target_batch.company_id
        and register.person_id = p_person_id
        and target_date between register.period_start and register.period_end
        and register.status = 'validated'
    ) then
      target_status := 'blocked_validated';
      issues := array_append(issues, 'validated_day');
    elsif exists (
      select 1 from public.working_time_registers register
      where register.company_id = target_batch.company_id
        and register.person_id = p_person_id
        and target_date between register.period_start and register.period_end
        and register.status in ('awaiting_sailor_signature', 'submitted')
    ) then
      target_status := 'blocked_workflow';
      issues := array_append(issues, 'register_not_editable');
    elsif exists (
      select 1 from public.working_time_intervals work_interval
      where work_interval.company_id = target_batch.company_id
        and work_interval.person_id = p_person_id
        and work_interval.local_work_date = target_date
        and work_interval.voided_at is null
    ) then
      target_status := 'duplicate';
      issues := array_append(issues, 'existing_day');
    elsif cardinality(issues) > 0 then
      target_status := 'inconsistent';
    elsif was_corrected then
      target_status := 'corrected';
    else
      target_status := 'ready';
    end if;

    source_hash := md5(target_batch.source_sha256 || ':' || source_sheet || ':' || source_row || ':' || target_date);
    insert into public.working_time_import_rows (
      company_id, batch_id, person_id, source_sheet, source_row, local_work_date,
      detected_phases, effective_phases, reported_work_seconds, effective_work_seconds,
      captain_name, vessel_name, imo_number, flag_state, source_comment,
      vessel_id, watch_group, planning_assignment_id, status, issue_codes,
      user_note, source_row_hash
    ) values (
      target_batch.company_id, target_batch.id, p_person_id, source_sheet, source_row, target_date,
      original_phases, effective_phases, reported_seconds, effective_seconds,
      nullif(trim(row_data->>'captain_name'), ''), nullif(trim(row_data->>'vessel_name'), ''),
      nullif(trim(row_data->>'imo_number'), ''), nullif(trim(row_data->>'flag_state'), ''),
      nullif(trim(row_data->>'comment'), ''), target_vessel_id, target_watch_group,
      target_assignment_id, target_status, issues, nullif(trim(row_data->>'user_note'), ''), source_hash
    );
  end loop;

  select jsonb_build_object(
    'total_rows', count(*),
    'ready_rows', count(*) filter (where status in ('ready', 'corrected')),
    'excluded_rows', count(*) filter (where status = 'excluded'),
    'duplicate_rows', count(*) filter (where status = 'duplicate'),
    'inconsistent_rows', count(*) filter (where status = 'inconsistent'),
    'blocked_rows', count(*) filter (where status in ('blocked_workflow', 'blocked_validated')),
    'reported_work_seconds', coalesce(sum(reported_work_seconds), 0),
    'effective_work_seconds', coalesce(sum(effective_work_seconds) filter (where status in ('ready', 'corrected')), 0)
  ) into summary
  from public.working_time_import_rows where batch_id = target_batch.id;

  update public.working_time_import_batches set
    detected_person_name = nullif(trim(coalesce(p_detected_person_name, '')), ''),
    selected_person_id = p_person_id,
    source_year = p_source_year,
    timezone_name = p_timezone_name,
    parser_version = left(trim(coalesce(p_parser_version, 'unknown')), 100),
    workbook_metadata = coalesce(p_workbook_metadata, '{}'::jsonb),
    preview_summary = summary,
    status = 'preview_ready',
    previewed_at = clock_timestamp()
  where id = target_batch.id;

  return jsonb_build_object(
    'batch_id', target_batch.id,
    'status', 'preview_ready',
    'summary', summary,
    'rows', (
      select coalesce(jsonb_agg(to_jsonb(import_row) order by import_row.local_work_date), '[]'::jsonb)
      from public.working_time_import_rows import_row where import_row.batch_id = target_batch.id
    )
  );
end;
$$;

create or replace function public.commit_working_time_import(p_batch_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
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
  imported_rows integer := 0;
  imported_intervals integer := 0;
  blocked_rows integer := 0;
  summary jsonb;
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
  if target_batch.selected_person_id is null or target_batch.timezone_name is null then
    raise exception using errcode = '55000', message = 'WORKING_TIME_IMPORT_PREVIEW_INCOMPLETE.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'working-time-import:' || target_batch.company_id || ':' || target_batch.selected_person_id,
    0
  ));

  for import_row in
    select * from public.working_time_import_rows
    where batch_id = target_batch.id and status in ('ready', 'corrected')
    order by local_work_date, id
    for update
  loop
    if exists (
      select 1 from public.working_time_registers register
      where register.company_id = target_batch.company_id
        and register.person_id = target_batch.selected_person_id
        and import_row.local_work_date between register.period_start and register.period_end
        and register.status = 'validated'
    ) then
      update public.working_time_import_rows
      set status = 'blocked_validated', issue_codes = array_append(issue_codes, 'validated_day'), updated_at = now()
      where id = import_row.id;
      blocked_rows := blocked_rows + 1;
      continue;
    end if;
    if exists (
      select 1 from public.working_time_registers register
      where register.company_id = target_batch.company_id
        and register.person_id = target_batch.selected_person_id
        and import_row.local_work_date between register.period_start and register.period_end
        and register.status in ('awaiting_sailor_signature', 'submitted')
    ) then
      update public.working_time_import_rows
      set status = 'blocked_workflow', issue_codes = array_append(issue_codes, 'register_not_editable'), updated_at = now()
      where id = import_row.id;
      blocked_rows := blocked_rows + 1;
      continue;
    end if;
    if exists (
      select 1 from public.working_time_intervals work_interval
      where work_interval.company_id = target_batch.company_id
        and work_interval.person_id = target_batch.selected_person_id
        and work_interval.local_work_date = import_row.local_work_date
        and work_interval.voided_at is null
    ) then
      update public.working_time_import_rows
      set status = 'duplicate', issue_codes = array_append(issue_codes, 'existing_day'), updated_at = now()
      where id = import_row.id;
      blocked_rows := blocked_rows + 1;
      continue;
    end if;

    select * into target_register
    from public.working_time_registers register
    where register.company_id = target_batch.company_id
      and register.person_id = target_batch.selected_person_id
      and register.period_kind = 'monthly'
      and register.period_start = date_trunc('month', import_row.local_work_date)::date
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
    elsif target_register.status not in ('draft', 'reopened') then
      update public.working_time_import_rows
      set status = case when target_register.status = 'validated' then 'blocked_validated' else 'blocked_workflow' end,
          issue_codes = array_append(issue_codes, 'register_not_editable'), updated_at = now()
      where id = import_row.id;
      blocked_rows := blocked_rows + 1;
      continue;
    end if;

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

      if exists (
        select 1 from public.working_time_intervals work_interval
        where work_interval.person_id = target_batch.selected_person_id
          and work_interval.voided_at is null
          and tstzrange(work_interval.starts_at, work_interval.ends_at, '[)') && tstzrange(starts_at_utc, ends_at_utc, '[)')
      ) then
        raise exception using errcode = '23P01', message = 'WORKING_TIME_IMPORT_CONCURRENT_OVERLAP.';
      end if;

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
          'parser_version', target_batch.parser_version
        )
      ) returning id into saved_interval_id;
      saved_interval_ids := saved_interval_ids || jsonb_build_array(saved_interval_id);
      imported_intervals := imported_intervals + 1;
    end loop;

    update public.working_time_import_rows set
      status = 'imported', register_id = target_register.id,
      imported_interval_ids = saved_interval_ids, imported_at = clock_timestamp(), updated_at = now()
    where id = import_row.id;
    imported_rows := imported_rows + 1;
  end loop;

  summary := jsonb_build_object(
    'imported_rows', imported_rows,
    'imported_intervals', imported_intervals,
    'blocked_during_commit', blocked_rows,
    'remaining_rows', (
      select count(*) from public.working_time_import_rows
      where batch_id = target_batch.id and status <> 'imported'
    )
  );
  update public.working_time_import_batches set
    status = 'imported', import_summary = summary,
    imported_at = clock_timestamp(), imported_by = auth.uid()
  where id = target_batch.id;
  return jsonb_build_object('batch_id', target_batch.id, 'status', 'imported', 'summary', summary);
end;
$$;

revoke all on function public.working_time_can_manage_imports(bigint) from public, anon, authenticated;
revoke all on function public.working_time_import_upload_context(text,text,bigint,text) from public, anon, authenticated;
revoke all on function public.preview_working_time_import(bigint,bigint,integer,text,text,text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.commit_working_time_import(bigint) from public, anon, authenticated;
grant execute on function public.working_time_can_manage_imports(bigint) to authenticated;
grant execute on function public.working_time_import_upload_context(text,text,bigint,text) to authenticated;
grant execute on function public.preview_working_time_import(bigint,bigint,integer,text,text,text,jsonb,jsonb) to authenticated;
grant execute on function public.commit_working_time_import(bigint) to authenticated;

comment on table public.working_time_import_batches is
  'Audited annual XLSM source files. Macro payloads are retained but never executed.';
comment on table public.working_time_import_rows is
  'Server-validated import preview rows preserving detected, corrected and excluded phases.';
comment on function public.commit_working_time_import(bigint) is
  'Imports only conflict-free draft rows and never overwrites a submitted or validated day.';
