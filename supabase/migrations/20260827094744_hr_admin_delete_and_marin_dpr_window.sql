-- Human Resources deletion is restricted to Administrators. Direction and
-- Armement retain their existing create/update permissions.
drop policy if exists people_company_office_write on public.people;
drop policy if exists people_office_write on public.people;
drop policy if exists people_company_office_insert on public.people;
drop policy if exists people_company_office_update on public.people;
drop policy if exists people_company_admin_delete on public.people;

create policy people_company_office_insert on public.people
for insert to authenticated
with check (
  company_id = (select public.current_planning_company_id())
  and (select public.has_any_role(array['admin', 'direction', 'armement']))
);

create policy people_company_office_update on public.people
for update to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and (select public.has_any_role(array['admin', 'direction', 'armement']))
)
with check (
  company_id = (select public.current_planning_company_id())
  and (select public.has_any_role(array['admin', 'direction', 'armement']))
);

create policy people_company_admin_delete on public.people
for delete to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and (select public.has_role('admin'))
);

-- A pure Marin can read only the reports they created. They can manage those
-- reports for 72 hours from creation; users with another DPR-enabled profile
-- keep their existing management window.
create or replace function public.dpr_user_can_manage_report(target_dpr_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.dpr_reports report
    where report.id = target_dpr_id
      and report.deleted_at is null
      and public.dpr_user_has_module_access(report.company_id)
      and (
        not public.dpr_user_is_history_restricted_marin(report.company_id)
        or (
          report.created_by = (select auth.uid())
          and now() < report.created_at + interval '3 days'
        )
      )
  );
$$;

create or replace function public.dpr_can_read_report(target_dpr_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.dpr_reports report
    where report.id = target_dpr_id
      and report.deleted_at is null
      and public.dpr_user_has_module_access(report.company_id)
      and (
        not public.dpr_user_is_history_restricted_marin(report.company_id)
        or report.created_by = (select auth.uid())
      )
  );
$$;

create or replace function public.enforce_dpr_marin_write_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := coalesce(new.company_id, old.company_id);
  target_dpr_id bigint;
begin
  if (select auth.uid()) is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- A report does not exist yet during its BEFORE INSERT trigger, so validate
  -- creation against the actor and company directly.
  if tg_table_name = 'dpr_reports' and tg_op = 'INSERT' then
    if public.dpr_user_has_module_access(target_company_id)
      and (
        not public.dpr_user_is_history_restricted_marin(target_company_id)
        or new.created_by = (select auth.uid())
      ) then
      return new;
    end if;
    raise exception using errcode = '42501', message = 'DPR_PERMISSION_DENIED: acces au module DPR requis.';
  end if;

  if tg_table_name = 'dpr_reports' then
    target_dpr_id := coalesce(new.id, old.id);
  elsif tg_table_name = 'dpr_port_call_reasons' then
    select port_call.dpr_id into target_dpr_id
    from public.dpr_port_calls port_call
    where port_call.id = coalesce(new.port_call_id, old.port_call_id);
  else
    target_dpr_id := coalesce(new.dpr_id, old.dpr_id);
  end if;

  if exists (
    select 1
    from public.dpr_reports report
    where report.id = target_dpr_id
      and report.company_id = target_company_id
      and public.dpr_user_has_module_access(report.company_id)
      and (
        not public.dpr_user_is_history_restricted_marin(report.company_id)
        or public.dpr_user_can_manage_report(report.id)
      )
  ) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  raise exception using errcode = '42501', message = 'DPR_PERMISSION_DENIED: acces au module DPR requis.';
end;
$$;

drop policy if exists dpr_reports_role_read on public.dpr_reports;
create policy dpr_reports_role_read on public.dpr_reports
for select to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and (
    (select public.dpr_can_read_report(id))
    or (
      deleted_at is not null
      and (select public.has_any_role(array['admin', 'direction', 'armement']))
    )
  )
);

-- Direct validation is kept as the single finalization action, now with the
-- same ownership and 72-hour rule as draft editing and file mutations.
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
     or not public.dpr_user_can_manage_report(current_report.id) then
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

revoke all on function public.dpr_user_can_manage_report(bigint) from public, anon, authenticated;
revoke all on function public.dpr_can_read_report(bigint) from public, anon, authenticated;
revoke all on function public.enforce_dpr_marin_write_scope() from public, anon, authenticated;
revoke all on function public.dpr_validate(bigint) from public, anon, authenticated;
grant execute on function public.dpr_user_can_manage_report(bigint) to authenticated;
grant execute on function public.dpr_can_read_report(bigint) to authenticated;
grant execute on function public.dpr_validate(bigint) to authenticated;

comment on policy people_company_admin_delete on public.people is
  'Only Administrators can delete a person in their active company.';
comment on function public.dpr_user_can_manage_report(bigint) is
  'Allows pure Marin authors to manage their own DPR for 72 hours; other DPR-enabled profiles are unrestricted by age.';
comment on function public.dpr_can_read_report(bigint) is
  'Allows pure Marin authors to read their own DPR and other DPR-enabled profiles to read company reports.';
comment on function public.dpr_validate(bigint) is
  'Validates a complete DPR while enforcing the report management scope and Marin 72-hour window.';
