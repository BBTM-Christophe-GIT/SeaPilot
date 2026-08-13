-- DPR validation is now the only finalization action. Any authenticated user
-- whose company role exposes the DPR module may validate a company DPR
-- directly from draft, reopened, or legacy submitted state.
create or replace function public.dpr_validate(target_dpr_id bigint)
returns public.dpr_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_report public.dpr_reports;
begin
  select * into current_report
  from public.dpr_reports
  where id = target_dpr_id
  for update;

  if current_report.id is null
     or current_report.deleted_at is not null
     or current_report.status not in ('draft', 'reopened', 'submitted')
     or not public.dpr_user_has_module_access(current_report.company_id) then
    raise exception 'Insufficient permission to validate this DPR' using errcode = '42501';
  end if;

  if current_report.vessel_id is null
     or (current_report.project_id is null and current_report.unlisted_project_name is null)
     or current_report.description is null then
    raise exception 'Vessel, project and daily description are required before validation' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.dpr_files file
    where file.dpr_id = current_report.id
      and file.status = 'pending'
      and file.deleted_at is null
  ) then
    raise exception 'All DPR files must finish uploading before validation' using errcode = '23514';
  end if;

  update public.dpr_reports
  set dpr_number = coalesce(dpr_number, public.dpr_allocate_next_number(company_id)),
      status = 'validated',
      validator_person_id = null,
      validator_name_snapshot = null,
      submitted_by = coalesce(submitted_by, (select auth.uid())),
      submitted_at = coalesce(submitted_at, now()),
      validated_by = (select auth.uid()),
      validated_at = now(),
      updated_by = (select auth.uid()),
      updated_at = now()
  where id = target_dpr_id
  returning * into current_report;

  insert into public.dpr_audit_events (
    company_id, dpr_id, version_no, event_type, actor_user_id
  ) values (
    current_report.company_id, current_report.id, current_report.version_no,
    'validated', (select auth.uid())
  );

  return current_report;
end;
$$;

-- The legacy submission RPC remains available during the rolling deployment,
-- but the application no longer calls it.
revoke all on function public.dpr_validate(bigint) from public, anon, authenticated;
grant execute on function public.dpr_validate(bigint) to authenticated;

comment on function public.dpr_validate(bigint) is
  'Directly validates a complete company DPR for any user with DPR module access.';
