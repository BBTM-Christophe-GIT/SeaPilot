-- Keep legacy locations as provenance while the actual bytes live only in Drive.
create schema if not exists document_drive_private;
revoke all on schema document_drive_private from public, anon;
grant usage on schema document_drive_private to authenticated, service_role;

create table public.document_drive_files (
  id uuid primary key default gen_random_uuid(),
  source_bucket text not null,
  source_path text not null,
  drive_file_id text not null check (drive_file_id ~ '^[a-zA-Z0-9_-]{10,200}$'),
  drive_path text not null check (length(drive_path) between 1 and 1000
    and drive_path !~ '(^/|(^|/)\.\.?(/|$)|[\\[:cntrl:]])'),
  file_name text not null check (length(file_name) between 1 and 255 and file_name !~ '[/\\[:cntrl:]]'),
  mime_type text not null check (length(mime_type) between 1 and 200),
  bytes bigint not null check (bytes between 1 and 104857600),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz not null,
  active boolean not null default true,
  purged_at timestamptz,
  archive_drive_file_id text check (archive_drive_file_id is null or archive_drive_file_id ~ '^[a-zA-Z0-9_-]{10,200}$'),
  created_at timestamptz not null default now(),
  constraint document_drive_files_source_unique unique (source_bucket, source_path),
  constraint document_drive_files_source_location_check check (
    length(source_bucket) between 1 and 100 and length(source_path) between 1 and 2000
    and source_path !~ '(^/|(^|/)\.\.?(/|$)|[[:cntrl:]])'
  )
);

comment on table public.document_drive_files is
  'Verified Google Drive documents. source_bucket/source_path are legacy references, never a second binary storage provider.';
comment on column public.document_drive_files.source_sha256 is
  'Hash of the former Supabase object; may differ from sha256 when a newer Drive version was preserved.';
comment on column public.document_drive_files.archive_drive_file_id is
  'Optional private Drive archive preserving an older Supabase version without replacing the current Drive file.';

alter table public.document_drive_files enable row level security;
revoke all on public.document_drive_files from public, anon, authenticated;
grant select on public.document_drive_files to authenticated;
grant all on public.document_drive_files to service_role;

-- Invoker queries deliberately retain each business table's own RLS. In
-- particular, reading a project or HR record is not equivalent to membership.
create function public.document_drive_can_read(target_bucket text, target_path text)
returns boolean language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null then return false; end if;
  case target_bucket
    when 'procedure-documents' then
      if target_path like 'sources/%' then
        return public.has_any_role(array['admin','direction']) and exists (
          select 1 from public.procedures d
          where d.source_storage_bucket=target_bucket and d.source_storage_path=target_path
        );
      end if;
      return target_path like 'published/%' and exists (
        select 1 from public.published_procedures d
        where d.storage_bucket=target_bucket and d.storage_path=target_path
      );
    when 'fleet-certificates' then
      return split_part(target_path,'/',1)=public.current_planning_company_id()::text
        and public.has_any_role(array['admin','direction','armement','capitaine','marin']);
    when 'hr-documents' then
      return exists (select 1 from public.hr_documents d
        where d.storage_bucket=target_bucket and d.storage_path=target_path);
    when 'project-files' then
      return exists (select 1 from public.project_drive_files d
          where d.source_bucket=target_bucket and d.source_path=target_path)
        or exists (select 1 from public.project_generated_documents d
          where d.storage_bucket=target_bucket and d.storage_path=target_path)
        or exists (select 1 from public.contract_documents d
          where d.storage_bucket=target_bucket and d.storage_path=target_path)
        or exists (select 1 from public.project_billing_documents d
          where d.bucket_name=target_bucket and d.object_path=target_path);
    when 'expense-note-pdfs' then
      return exists (select 1 from public.expense_notes d where d.pdf_path=target_path);
    when 'working-time-imports' then
      return exists (select 1 from public.working_time_import_batches d
        where d.source_storage_bucket=target_bucket and d.source_storage_path=target_path
          and public.working_time_can_manage_imports(d.company_id));
    when 'documentary-audit-files' then
      return documentary_audit_private.can_read_file(target_path);
    when 'purchase-request-attachments' then
      return exists (select 1 from public.purchase_request_attachments d
        where d.storage_bucket=target_bucket and d.storage_path=target_path);
    when 'lifting-certificates' then
      return public.lifting_certificate_path_access(target_path);
    when 'annual-review-reports' then
      return exists (select 1 from public.annual_reviews d
        where ((d.manager_report_bucket=target_bucket and d.manager_report_path=target_path)
          or (d.final_report_bucket=target_bucket and d.final_report_path=target_path))
          and public.annual_review_can_read(d.id));
    when 'vessel-visits' then
      return exists (select 1 from public.vessel_visit_attachments d
        where d.bucket_name=target_bucket and d.object_path=target_path);
    else return false;
  end case;
end;
$$;
revoke all on function public.document_drive_can_read(text,text) from public, anon;
grant execute on function public.document_drive_can_read(text,text) to authenticated, service_role;

create policy document_drive_files_authorized_read on public.document_drive_files
for select to authenticated using (active and public.document_drive_can_read(source_bucket,source_path));

-- This narrowly privileged existence check prevents an unauthorized mapped
-- request from silently falling back to a stale Storage copy. It returns no
-- Drive ID, path, content, name, or other document metadata.
create function document_drive_private.has_mapping(target_bucket text,target_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.document_drive_files d
    where d.source_bucket=target_bucket and d.source_path=target_path
  );
$$;
revoke all on function document_drive_private.has_mapping(text,text) from public, anon;
grant execute on function document_drive_private.has_mapping(text,text) to authenticated, service_role;

create function public.document_drive_lookup(target_bucket text,target_path text)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare d public.document_drive_files%rowtype;
begin
  if auth.uid() is null then raise exception 'Connexion SeaPilot requise.' using errcode='42501'; end if;
  select * into d from public.document_drive_files
    where source_bucket=target_bucket and source_path=target_path and active;
  if not found then
    if document_drive_private.has_mapping(target_bucket,target_path) then
      raise exception 'Document inaccessible pour ce profil.' using errcode='42501';
    end if;
    return null;
  end if;
  return jsonb_build_object('drive_file_id',d.drive_file_id,'drive_path',d.drive_path,
    'file_name',d.file_name,'mime_type',d.mime_type,'bytes',d.bytes,'sha256',d.sha256,'verified_at',d.verified_at);
end;
$$;
revoke all on function public.document_drive_lookup(text,text) from public, anon;
grant execute on function public.document_drive_lookup(text,text) to authenticated, service_role;

-- Preview is the only existing-source import operation that required a
-- physical Storage row. Keep its original Admin/company guard, parsed-row
-- validation and workflow; accept the verified original source hash in Drive.
CREATE OR REPLACE FUNCTION public.preview_working_time_import_base(p_batch_id bigint, p_person_id bigint, p_source_year integer, p_timezone_name text, p_detected_person_name text, p_parser_version text, p_workbook_metadata jsonb, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage', 'pg_temp'
AS $function$
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
  if exists (
    select 1 from public.document_drive_files drive
    where drive.source_bucket = target_batch.source_storage_bucket
      and drive.source_path = target_batch.source_storage_path and not drive.active
  ) or (not exists (
    select 1 from storage.objects object
    where object.bucket_id = target_batch.source_storage_bucket
      and object.name = target_batch.source_storage_path
  ) and not exists (
    select 1 from public.document_drive_files drive
    where drive.source_bucket = target_batch.source_storage_bucket
      and drive.source_path = target_batch.source_storage_path
      and drive.active and drive.verified_at is not null
      and drive.source_sha256 = target_batch.source_sha256
      and lower(drive.mime_type) = lower(target_batch.source_mime_type)
  )) then
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
$function$;
