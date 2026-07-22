-- DPR phase 7: transactional full-form persistence, governed file uploads,
-- signed-download audit and administrator diagnostics.

alter table public.dpr_audit_events drop constraint if exists dpr_audit_events_type_check;
alter table public.dpr_audit_events add constraint dpr_audit_events_type_check check (
  event_type in (
    'created', 'updated', 'submitted', 'validated', 'reopened', 'pdf-generated',
    'file-registered', 'file-deleted', 'signed-url-issued', 'soft-deleted', 'restored',
    'imported', 'migration-corrected'
  )
);

create or replace function public.dpr_user_can_edit(target_dpr_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.dpr_reports report
    where report.id = target_dpr_id
      and report.deleted_at is null
      and report.status in ('draft', 'reopened')
      and (
        public.has_company_role(report.company_id, array['admin', 'direction', 'armement', 'capitaine'])
        or (
          public.has_company_role(report.company_id, array['marin'])
          and report.created_by = (select auth.uid())
        )
      )
  );
$$;

revoke all on function public.dpr_user_can_edit(bigint) from public, anon;
grant execute on function public.dpr_user_can_edit(bigint) to authenticated;

create or replace function public.dpr_save_payload(target_dpr_id bigint, target_payload jsonb)
returns public.dpr_reports
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  current_report public.dpr_reports;
  target_company_id bigint;
  item jsonb;
  reason_item jsonb;
  created_port_call_id bigint;
  hse jsonb := coalesce(target_payload -> 'hseActions', '{}'::jsonb);
begin
  if target_payload is null or jsonb_typeof(target_payload) <> 'object' then
    raise exception 'DPR payload must be a JSON object' using errcode = '22023';
  end if;

  if target_dpr_id is null then
    select * into current_report
    from public.dpr_create_draft(
      nullif(target_payload ->> 'reportDate', '')::date,
      nullif(target_payload ->> 'projectId', '')::bigint,
      target_payload ->> 'unlistedProjectName',
      nullif(target_payload ->> 'vesselId', '')::bigint,
      target_payload ->> 'description',
      target_payload ->> 'qhseNote'
    );
  else
    if not public.dpr_user_can_edit(target_dpr_id) then
      raise exception 'Insufficient permission to save this DPR' using errcode = '42501';
    end if;
    select * into current_report
    from public.dpr_update_draft(
      target_dpr_id,
      nullif(target_payload ->> 'reportDate', '')::date,
      nullif(target_payload ->> 'projectId', '')::bigint,
      target_payload ->> 'unlistedProjectName',
      nullif(target_payload ->> 'vesselId', '')::bigint,
      target_payload ->> 'description',
      target_payload ->> 'qhseNote'
    );
  end if;

  target_company_id := current_report.company_id;

  delete from public.dpr_port_call_reasons where port_call_id in (
    select id from public.dpr_port_calls where dpr_id = current_report.id
  );
  delete from public.dpr_port_calls where dpr_id = current_report.id;
  delete from public.dpr_crew_members where dpr_id = current_report.id;
  delete from public.dpr_other_people where dpr_id = current_report.id;
  delete from public.dpr_incidents where dpr_id = current_report.id;
  delete from public.dpr_hse_actions where dpr_id = current_report.id;
  delete from public.dpr_emergency_exercises where dpr_id = current_report.id;
  delete from public.dpr_supplies where dpr_id = current_report.id;
  delete from public.dpr_waste_records where dpr_id = current_report.id;
  delete from public.dpr_daily_metrics where dpr_id = current_report.id;

  insert into public.dpr_daily_metrics (
    dpr_id, company_id, fuel_consumed_liters, fuel_on_board_liters
  ) values (
    current_report.id,
    target_company_id,
    nullif(target_payload #>> '{metrics,fuelConsumedLiters}', '')::numeric,
    nullif(target_payload #>> '{metrics,fuelOnBoardLiters}', '')::numeric
  );

  for item in select value from jsonb_array_elements(coalesce(target_payload -> 'crewMembers', '[]'::jsonb)) loop
    insert into public.dpr_crew_members (
      dpr_id, company_id, person_id, crew_function, roster_group, display_name_snapshot, display_order
    ) values (
      current_report.id,
      target_company_id,
      (item ->> 'personId')::bigint,
      item ->> 'crewFunction',
      nullif(item ->> 'rosterGroup', ''),
      item ->> 'displayName',
      coalesce((item ->> 'displayOrder')::integer, 0)
    );
  end loop;

  for item in select value from jsonb_array_elements(coalesce(target_payload -> 'otherPeople', '[]'::jsonb)) loop
    insert into public.dpr_other_people (
      dpr_id, company_id, person_id, display_name_snapshot, display_order
    ) values (
      current_report.id,
      target_company_id,
      nullif(item ->> 'personId', '')::bigint,
      item ->> 'displayName',
      coalesce((item ->> 'displayOrder')::integer, 0)
    );
  end loop;

  for item in select value from jsonb_array_elements(coalesce(target_payload -> 'incidents', '[]'::jsonb)) loop
    insert into public.dpr_incidents (dpr_id, company_id, category, level, notes)
    values (
      current_report.id,
      target_company_id,
      item ->> 'category',
      item ->> 'level',
      nullif(item ->> 'notes', '')
    );
  end loop;

  insert into public.dpr_hse_actions (
    dpr_id, company_id, tbt_performed, tbt_theme, hse_visit_performed,
    hse_audit_performed, good_practices_count, dangerous_situations_count, stop_work_count
  ) values (
    current_report.id,
    target_company_id,
    coalesce((hse ->> 'tbtPerformed')::boolean, false),
    case when coalesce((hse ->> 'tbtPerformed')::boolean, false) then nullif(hse ->> 'tbtTheme', '') else null end,
    coalesce((hse ->> 'hseVisitPerformed')::boolean, false),
    coalesce((hse ->> 'hseAuditPerformed')::boolean, false),
    coalesce(nullif(hse ->> 'goodPracticesCount', '')::integer, 0),
    coalesce(nullif(hse ->> 'dangerousSituationsCount', '')::integer, 0),
    coalesce(nullif(hse ->> 'stopWorkCount', '')::integer, 0)
  );

  for item in select value from jsonb_array_elements(coalesce(target_payload -> 'emergencyExercises', '[]'::jsonb)) loop
    insert into public.dpr_emergency_exercises (dpr_id, company_id, exercise_type_key, notes)
    values (current_report.id, target_company_id, item ->> 'key', nullif(item ->> 'notes', ''));
  end loop;

  for item in select value from jsonb_array_elements(coalesce(target_payload -> 'portCalls', '[]'::jsonb)) loop
    insert into public.dpr_port_calls (
      dpr_id, company_id, port_name, arrival_at, departure_at, display_order
    ) values (
      current_report.id,
      target_company_id,
      nullif(item ->> 'portName', ''),
      nullif(item ->> 'arrivalAt', '')::timestamptz,
      nullif(item ->> 'departureAt', '')::timestamptz,
      coalesce((item ->> 'displayOrder')::integer, 0)
    ) returning id into created_port_call_id;

    for reason_item in select value from jsonb_array_elements(coalesce(item -> 'reasons', '[]'::jsonb)) loop
      insert into public.dpr_port_call_reasons (port_call_id, company_id, reason_type_key)
      values (created_port_call_id, target_company_id, trim(both '"' from reason_item::text));
    end loop;
  end loop;

  if target_payload ? 'supplies' then
    insert into public.dpr_supplies (dpr_id, company_id, fuel_m3, oil_liters, water_m3)
    values (
      current_report.id,
      target_company_id,
      nullif(target_payload #>> '{supplies,fuelM3}', '')::numeric,
      nullif(target_payload #>> '{supplies,oilLiters}', '')::numeric,
      nullif(target_payload #>> '{supplies,waterM3}', '')::numeric
    );
  end if;

  for item in select value from jsonb_array_elements(coalesce(target_payload -> 'wasteRecords', '[]'::jsonb)) loop
    insert into public.dpr_waste_records (dpr_id, company_id, waste_type_key, quantity, unit)
    values (
      current_report.id,
      target_company_id,
      item ->> 'key',
      coalesce(nullif(item ->> 'quantity', '')::numeric, 0),
      item ->> 'unit'
    );
  end loop;

  select * into current_report from public.dpr_reports where id = current_report.id;
  return current_report;
end;
$$;

create or replace function public.dpr_submit(target_dpr_id bigint)
returns public.dpr_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_report public.dpr_reports;
begin
  select * into current_report from public.dpr_reports where id = target_dpr_id for update;
  if current_report.id is null
     or current_report.deleted_at is not null
     or current_report.status not in ('draft', 'reopened')
     or not (
       public.has_company_role(current_report.company_id, array['admin', 'direction', 'armement', 'capitaine'])
       or (public.has_company_role(current_report.company_id, array['marin']) and current_report.created_by = auth.uid())
     ) then
    raise exception 'Insufficient permission to submit this DPR' using errcode = '42501';
  end if;
  if current_report.vessel_id is null
     or (current_report.project_id is null and current_report.unlisted_project_name is null)
     or current_report.description is null then
    raise exception 'Vessel, project and daily description are required before submission' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.dpr_files file
    where file.dpr_id = current_report.id and file.status = 'pending' and file.deleted_at is null
  ) then
    raise exception 'All DPR files must finish uploading before submission' using errcode = '23514';
  end if;

  update public.dpr_reports
  set dpr_number = coalesce(dpr_number, public.dpr_allocate_next_number(company_id)),
      status = 'submitted', submitted_by = auth.uid(), submitted_at = now(),
      updated_by = auth.uid(), updated_at = now()
  where id = target_dpr_id returning * into current_report;
  insert into public.dpr_audit_events (company_id, dpr_id, version_no, event_type, actor_user_id)
  values (current_report.company_id, current_report.id, current_report.version_no, 'submitted', auth.uid());
  return current_report;
end;
$$;

create or replace function public.dpr_prepare_file_upload(
  target_dpr_id bigint,
  target_file_kind text,
  target_filename text,
  target_mime_type text,
  target_size_bytes bigint,
  target_sha256 text,
  target_display_order integer default 0
)
returns public.dpr_files
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  current_report public.dpr_reports;
  created_file public.dpr_files;
  target_bucket text;
  target_version integer;
  safe_filename text;
begin
  select * into current_report from public.dpr_reports where id = target_dpr_id;
  if current_report.id is null or current_report.deleted_at is not null then
    raise exception 'DPR not found' using errcode = 'P0002';
  end if;
  if target_file_kind in ('photo', 'attachment') and not public.dpr_user_can_edit(target_dpr_id) then
    raise exception 'This DPR is locked for file changes' using errcode = '42501';
  end if;
  if target_file_kind = 'pdf' and not public.has_company_role(
    current_report.company_id, array['admin', 'direction', 'armement', 'capitaine']
  ) then
    raise exception 'Insufficient permission to generate a DPR PDF' using errcode = '42501';
  end if;
  if target_file_kind not in ('pdf', 'photo', 'attachment')
     or target_size_bytes < 0
     or target_sha256 !~ '^[0-9a-f]{64}$'
     or nullif(trim(target_filename), '') is null then
    raise exception 'Invalid DPR file metadata' using errcode = '22023';
  end if;
  if target_file_kind = 'pdf' and target_mime_type <> 'application/pdf' then
    raise exception 'A generated DPR document must be a PDF' using errcode = '22023';
  end if;
  if target_file_kind = 'photo' and (
    select count(*) from public.dpr_files file
    where file.dpr_id = target_dpr_id
      and file.file_kind = 'photo'
      and file.status in ('pending', 'ready')
      and file.deleted_at is null
  ) >= 2 then
    raise exception 'A DPR can contain at most two photos' using errcode = '23514';
  end if;

  target_bucket := case target_file_kind
    when 'pdf' then 'dpr-pdfs'
    when 'photo' then 'dpr-photos'
    else 'dpr-attachments'
  end;
  target_version := case when target_file_kind = 'pdf' then coalesce((
    select max(file.version_no) + 1 from public.dpr_files file
    where file.dpr_id = target_dpr_id and file.file_kind = 'pdf'
  ), 1) else null end;
  safe_filename := regexp_replace(trim(target_filename), '[^A-Za-z0-9._-]+', '-', 'g');

  insert into public.dpr_files (
    company_id, dpr_id, file_kind, bucket_name, object_path, original_filename,
    display_filename, mime_type, size_bytes, sha256, status, version_no,
    is_current, display_order, created_by
  ) values (
    current_report.company_id,
    current_report.id,
    target_file_kind,
    target_bucket,
    'company/' || current_report.company_id || '/dpr/' || current_report.id || '/' || gen_random_uuid() || '-' || safe_filename,
    trim(target_filename),
    trim(target_filename),
    target_mime_type,
    target_size_bytes,
    target_sha256,
    'pending',
    target_version,
    false,
    greatest(coalesce(target_display_order, 0), 0),
    auth.uid()
  ) returning * into created_file;
  return created_file;
end;
$$;

create or replace function public.dpr_can_upload_object(target_bucket text, target_object_path text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.dpr_files file
    where file.bucket_name = target_bucket
      and file.object_path = target_object_path
      and file.status = 'pending'
      and file.deleted_at is null
      and file.created_by = (select auth.uid())
      and (
        public.dpr_user_can_edit(file.dpr_id)
        or (
          file.file_kind = 'pdf'
          and public.has_company_role(file.company_id, array['admin', 'direction', 'armement', 'capitaine'])
        )
      )
  );
$$;

create or replace function public.dpr_complete_file_upload(target_file_id bigint)
returns public.dpr_files
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  current_file public.dpr_files;
  current_report public.dpr_reports;
begin
  select * into current_file from public.dpr_files where id = target_file_id for update;
  select * into current_report from public.dpr_reports where id = current_file.dpr_id;
  if current_file.id is null
     or current_file.status <> 'pending'
     or current_file.created_by <> auth.uid()
     or not exists (
       select 1 from storage.objects object
       where object.bucket_id = current_file.bucket_name and object.name = current_file.object_path
     ) then
    raise exception 'The registered DPR file was not uploaded' using errcode = '23514';
  end if;
  if current_file.file_kind = 'pdf' then
    update public.dpr_files set is_current = false
    where dpr_id = current_file.dpr_id and file_kind = 'pdf' and id <> current_file.id;
  end if;
  update public.dpr_files
  set status = 'ready', ready_at = now(), is_current = (file_kind = 'pdf')
  where id = current_file.id returning * into current_file;
  insert into public.dpr_audit_events (
    company_id, dpr_id, version_no, event_type, actor_user_id, metadata
  ) values (
    current_file.company_id,
    current_file.dpr_id,
    current_report.version_no,
    case when current_file.file_kind = 'pdf' then 'pdf-generated' else 'file-registered' end,
    auth.uid(),
    jsonb_build_object('file_id', current_file.id, 'filename', current_file.display_filename, 'kind', current_file.file_kind)
  );
  return current_file;
end;
$$;

create or replace function public.dpr_remove_file(target_file_id bigint)
returns public.dpr_files
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_file public.dpr_files;
  current_report public.dpr_reports;
begin
  select * into current_file from public.dpr_files where id = target_file_id for update;
  select * into current_report from public.dpr_reports where id = current_file.dpr_id;
  if current_file.id is null
     or current_file.deleted_at is not null
     or (current_file.file_kind <> 'pdf' and not public.dpr_user_can_edit(current_file.dpr_id))
     or (current_file.file_kind = 'pdf' and not public.has_company_role(
       current_file.company_id, array['admin', 'direction', 'armement']
     )) then
    raise exception 'Insufficient permission to remove this DPR file' using errcode = '42501';
  end if;
  update public.dpr_files
  set deleted_at = now(), deleted_by = auth.uid(), is_current = false
  where id = current_file.id returning * into current_file;
  insert into public.dpr_audit_events (
    company_id, dpr_id, version_no, event_type, actor_user_id, metadata
  ) values (
    current_file.company_id, current_file.dpr_id, current_report.version_no,
    'file-deleted', auth.uid(), jsonb_build_object('file_id', current_file.id)
  );
  return current_file;
end;
$$;

create or replace function public.dpr_record_signed_url(target_file_id bigint)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_file public.dpr_files;
  current_report public.dpr_reports;
begin
  select * into current_file from public.dpr_files
  where id = target_file_id and status = 'ready' and deleted_at is null;
  select * into current_report from public.dpr_reports where id = current_file.dpr_id;
  if current_file.id is null or not public.has_company_role(
    current_file.company_id, array['admin', 'direction', 'armement', 'capitaine', 'marin']
  ) then
    raise exception 'Insufficient permission to download this DPR file' using errcode = '42501';
  end if;
  insert into public.dpr_audit_events (
    company_id, dpr_id, version_no, event_type, actor_user_id, metadata
  ) values (
    current_file.company_id, current_file.dpr_id, current_report.version_no,
    'signed-url-issued', auth.uid(), jsonb_build_object('file_id', current_file.id)
  );
end;
$$;

create or replace function public.dpr_admin_diagnostic()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
begin
  if not public.has_company_role(target_company_id, array['admin']) then
    raise exception 'Administrator role required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'reports', (select count(*) from public.dpr_reports where company_id = target_company_id and deleted_at is null),
    'drafts', (select count(*) from public.dpr_reports where company_id = target_company_id and status in ('draft', 'reopened') and deleted_at is null),
    'submitted', (select count(*) from public.dpr_reports where company_id = target_company_id and status = 'submitted' and deleted_at is null),
    'validated', (select count(*) from public.dpr_reports where company_id = target_company_id and status = 'validated' and deleted_at is null),
    'ready_files', (select count(*) from public.dpr_files where company_id = target_company_id and status = 'ready' and deleted_at is null),
    'pending_files', (select count(*) from public.dpr_files where company_id = target_company_id and status = 'pending' and deleted_at is null),
    'orphan_files', (select count(*) from public.dpr_files file left join public.dpr_reports report on report.id = file.dpr_id where file.company_id = target_company_id and report.id is null),
    'migration_errors', (select count(*) from public.migration_errors where company_id = target_company_id and resolved_at is null)
  );
end;
$$;

revoke all on function public.dpr_save_payload(bigint, jsonb) from public, anon;
revoke all on function public.dpr_prepare_file_upload(bigint, text, text, text, bigint, text, integer) from public, anon;
revoke all on function public.dpr_can_upload_object(text, text) from public, anon;
revoke all on function public.dpr_complete_file_upload(bigint) from public, anon;
revoke all on function public.dpr_remove_file(bigint) from public, anon;
revoke all on function public.dpr_record_signed_url(bigint) from public, anon;
revoke all on function public.dpr_admin_diagnostic() from public, anon;
grant execute on function public.dpr_save_payload(bigint, jsonb) to authenticated;
grant execute on function public.dpr_prepare_file_upload(bigint, text, text, text, bigint, text, integer) to authenticated;
grant execute on function public.dpr_can_upload_object(text, text) to authenticated;
grant execute on function public.dpr_complete_file_upload(bigint) to authenticated;
grant execute on function public.dpr_remove_file(bigint) to authenticated;
grant execute on function public.dpr_record_signed_url(bigint) to authenticated;
grant execute on function public.dpr_admin_diagnostic() to authenticated;

drop policy if exists dpr_storage_registered_insert on storage.objects;
create policy dpr_storage_registered_insert on storage.objects
for insert to authenticated
with check (public.dpr_can_upload_object(bucket_id, name));

comment on function public.dpr_save_payload(bigint, jsonb) is
  'Atomically saves the six-step native DPR form while preserving workflow and tenant rules.';
comment on function public.dpr_prepare_file_upload(bigint, text, text, text, bigint, text, integer) is
  'Allocates a trusted private Storage object path before an authenticated upload.';
