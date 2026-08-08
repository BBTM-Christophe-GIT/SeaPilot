-- XLSM files are treated as approved source records. Only administrators may
-- use the import workflow, and their import may replace an existing day without
-- reopening the register or asking for a free-text justification. The ordinary
-- edit workflow remains locked for signed, submitted and validated registers.

create or replace function public.working_time_can_manage_imports(target_company_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and public.user_belongs_to_company(target_company_id)
    and public.has_company_role(target_company_id, array['admin']);
$$;

alter function public.preview_working_time_import(
  bigint, bigint, integer, text, text, text, jsonb, jsonb
)
rename to preview_working_time_import_with_legacy_reason;

revoke all on function public.preview_working_time_import_with_legacy_reason(
  bigint, bigint, integer, text, text, text, jsonb, jsonb
) from public, anon, authenticated;

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
set statement_timeout = '30s'
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'WORKING_TIME_IMPORT_PERMISSION_DENIED.';
  end if;

  return public.preview_working_time_import_with_legacy_reason(
    p_batch_id,
    p_person_id,
    p_source_year,
    p_timezone_name,
    p_detected_person_name,
    p_parser_version,
    (coalesce(p_workbook_metadata, '{}'::jsonb) - 'replacement_reason')
      || jsonb_build_object(
        'replacement_reason', 'Import XLSM approuve automatiquement',
        'approval_mode', 'approved_xlsm'
      ),
    p_rows
  );
end;
$$;

create or replace function public.working_time_guard_register_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_register_id bigint := case when tg_op = 'DELETE' then old.register_id else new.register_id end;
  target_status text;
  target_company_id bigint;
  target_person_id bigint;
  import_batch_setting text := nullif(
    current_setting('seapilot.working_time_admin_import_batch_id', true),
    ''
  );
  admin_import_override boolean := false;
begin
  select register.status, register.company_id, register.person_id
  into target_status, target_company_id, target_person_id
  from public.working_time_registers register
  where register.id = target_register_id;

  if import_batch_setting ~ '^[0-9]+$' then
    select exists (
      select 1
      from public.working_time_import_batches batch
      where batch.id = import_batch_setting::bigint
        and batch.company_id = target_company_id
        and batch.selected_person_id = target_person_id
        and batch.status = 'preview_ready'
        and public.working_time_can_manage_imports(batch.company_id)
    ) into admin_import_override;
  end if;

  if admin_import_override then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if target_status = 'validated' then
    raise exception using errcode = '55000', message = 'WORKING_TIME_REGISTER_LOCKED.';
  end if;
  if tg_table_name = 'working_time_intervals' and target_status not in ('draft', 'reopened') then
    raise exception using errcode = '55000', message = 'WORKING_TIME_REGISTER_NOT_EDITABLE.';
  end if;
  if tg_table_name = 'working_time_day_comments' and target_status not in ('draft', 'reopened', 'submitted') then
    raise exception using errcode = '55000', message = 'WORKING_TIME_REGISTER_NOT_COMMENTABLE.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.commit_working_time_import(p_batch_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '60s'
as $$
declare
  target_batch public.working_time_import_batches%rowtype;
  import_result jsonb;
begin
  select batch.*
  into target_batch
  from public.working_time_import_batches batch
  where batch.id = p_batch_id;

  if target_batch.id is null
    or not public.working_time_can_manage_imports(target_batch.company_id) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_IMPORT_PERMISSION_DENIED.';
  end if;

  perform set_config('seapilot.working_time_admin_import_batch_id', p_batch_id::text, true);
  perform set_config('seapilot.defer_working_time_recalculation', 'on', true);

  begin
    import_result := public.commit_working_time_import_unbatched(p_batch_id);
  exception when others then
    perform set_config('seapilot.defer_working_time_recalculation', 'off', true);
    perform set_config('seapilot.working_time_admin_import_batch_id', '', true);
    raise;
  end;

  perform set_config('seapilot.defer_working_time_recalculation', 'off', true);
  perform set_config('seapilot.working_time_admin_import_batch_id', '', true);

  if target_batch.selected_person_id is not null then
    perform private.working_time_recalculate_person(target_batch.selected_person_id, null, null);
  end if;

  return import_result;
end;
$$;

revoke all on function public.working_time_can_manage_imports(bigint)
  from public, anon, authenticated;
revoke all on function public.preview_working_time_import(
  bigint, bigint, integer, text, text, text, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.commit_working_time_import(bigint)
  from public, anon, authenticated;
revoke all on function public.working_time_guard_register_lock()
  from public, anon, authenticated;

grant execute on function public.working_time_can_manage_imports(bigint)
  to authenticated;
grant execute on function public.preview_working_time_import(
  bigint, bigint, integer, text, text, text, jsonb, jsonb
) to authenticated;
grant execute on function public.commit_working_time_import(bigint)
  to authenticated;

comment on function public.working_time_can_manage_imports(bigint) is
  'Returns true only for an authenticated administrator of the target company.';
comment on function public.preview_working_time_import(
  bigint, bigint, integer, text, text, text, jsonb, jsonb
) is
  'Previews an administrator XLSM import without requiring a free-text replacement justification.';
comment on function public.commit_working_time_import(bigint) is
  'Atomically imports approved XLSM data and may replace locked register days for administrators without reopening the register.';
