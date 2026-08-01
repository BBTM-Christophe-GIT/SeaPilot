-- Marin profile hardening: personal Planning requests and DPR access restricted
-- to active second captains who created the report.

create or replace function public.dpr_marin_is_second_captain(target_company_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and public.user_belongs_to_company(target_company_id)
    and public.has_company_role(target_company_id, array['marin'])
    and exists (
      select 1
      from public.people person
      where person.company_id = target_company_id
        and person.user_id = auth.uid()
        and person.active
        and (person.departed_on is null or person.departed_on >= current_date)
        and lower(trim(coalesce(person.function_label, '') || ' ' || coalesce(person.grade_label, '')))
          ~ '(2nd|second)[[:space:]]+capitaine'
    );
$$;

create or replace function public.dpr_can_read_report(target_dpr_id bigint)
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
      and public.user_belongs_to_company(report.company_id)
      and (
        public.has_company_role(report.company_id, array['admin', 'direction', 'armement', 'capitaine'])
        or (
          public.dpr_marin_is_second_captain(report.company_id)
          and report.created_by = auth.uid()
        )
      )
  );
$$;

revoke all on function public.dpr_marin_is_second_captain(bigint) from public, anon;
revoke all on function public.dpr_can_read_report(bigint) from public, anon;
grant execute on function public.dpr_marin_is_second_captain(bigint) to authenticated;
grant execute on function public.dpr_can_read_report(bigint) to authenticated;

drop policy if exists dpr_reports_company_read on public.dpr_reports;
create policy dpr_reports_company_read on public.dpr_reports for select to authenticated
using (public.dpr_can_read_report(id));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'dpr_daily_metrics', 'dpr_crew_members', 'dpr_other_people', 'dpr_incidents',
    'dpr_hse_actions', 'dpr_emergency_exercises', 'dpr_port_calls',
    'dpr_supplies', 'dpr_waste_records'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_company_read', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.dpr_can_read_report(dpr_id))',
      table_name || '_company_read', table_name
    );
  end loop;
end $$;

drop policy if exists dpr_port_call_reasons_company_read on public.dpr_port_call_reasons;
create policy dpr_port_call_reasons_company_read on public.dpr_port_call_reasons for select to authenticated
using (
  exists (
    select 1
    from public.dpr_port_calls port_call
    where port_call.id = dpr_port_call_reasons.port_call_id
      and public.dpr_can_read_report(port_call.dpr_id)
  )
);

drop policy if exists dpr_audit_events_company_read on public.dpr_audit_events;
create policy dpr_audit_events_company_read on public.dpr_audit_events for select to authenticated
using (
  public.dpr_can_read_report(dpr_id)
  or (
    dpr_id is null
    and public.has_company_role(company_id, array['admin', 'direction', 'armement', 'capitaine'])
  )
);

drop policy if exists dpr_files_company_read on public.dpr_files;
create policy dpr_files_company_read on public.dpr_files for select to authenticated
using (
  public.dpr_can_read_report(dpr_id)
  and (
    file_kind <> 'pdf'
    or public.has_company_role(company_id, array['admin', 'direction', 'armement', 'capitaine'])
  )
);

drop policy if exists dpr_storage_company_read on storage.objects;
create policy dpr_storage_company_read on storage.objects
for select to authenticated
using (
  bucket_id in ('dpr-pdfs', 'dpr-photos', 'dpr-attachments')
  and exists (
    select 1
    from public.dpr_files file
    where file.bucket_name = storage.objects.bucket_id
      and file.object_path = storage.objects.name
      and file.status = 'ready'
      and file.deleted_at is null
      and public.dpr_can_read_report(file.dpr_id)
      and (
        file.file_kind <> 'pdf'
        or public.has_company_role(file.company_id, array['admin', 'direction', 'armement', 'capitaine'])
      )
  )
);

create or replace function public.enforce_dpr_marin_write_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := coalesce(new.company_id, old.company_id);
  target_dpr_id bigint;
  report_owner uuid;
begin
  if auth.uid() is null
    or public.has_company_role(target_company_id, array['admin', 'direction', 'armement', 'capitaine']) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_table_name = 'dpr_reports' then
    target_dpr_id := coalesce(new.id, old.id);
    report_owner := coalesce(new.created_by, old.created_by);
  elsif tg_table_name = 'dpr_port_call_reasons' then
    select port_call.dpr_id into target_dpr_id
    from public.dpr_port_calls port_call
    where port_call.id = coalesce(new.port_call_id, old.port_call_id);
    select report.created_by into report_owner
    from public.dpr_reports report
    where report.id = target_dpr_id;
  else
    target_dpr_id := coalesce(new.dpr_id, old.dpr_id);
    select report.created_by into report_owner
    from public.dpr_reports report
    where report.id = target_dpr_id;
  end if;

  if public.dpr_marin_is_second_captain(target_company_id) and report_owner = auth.uid() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  raise exception using errcode = '42501', message = 'DPR_PERMISSION_DENIED: second capitaine auteur requis.';
end;
$$;

revoke all on function public.enforce_dpr_marin_write_scope() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'dpr_reports', 'dpr_daily_metrics', 'dpr_crew_members', 'dpr_other_people',
    'dpr_incidents', 'dpr_hse_actions', 'dpr_emergency_exercises', 'dpr_port_calls',
    'dpr_port_call_reasons', 'dpr_supplies', 'dpr_waste_records', 'dpr_files', 'dpr_audit_events'
  ] loop
    execute format('drop trigger if exists dpr_marin_write_scope on public.%I', table_name);
    execute format(
      'create trigger dpr_marin_write_scope before insert or update or delete on public.%I for each row execute function public.enforce_dpr_marin_write_scope()',
      table_name
    );
  end loop;
end $$;

drop policy if exists planning_absences_read on public.planning_absences;
create policy planning_absences_read on public.planning_absences for select to authenticated
using (
  (
    public.planning_can_read_row(
      company_id, null, person_id,
      (starts_at at time zone 'Europe/Paris')::date,
      (ends_at at time zone 'Europe/Paris')::date
    )
    or exists (
      select 1
      from public.planning_assignments assignment
      where assignment.company_id = planning_absences.company_id
        and assignment.crew_person_id = planning_absences.person_id
        and assignment.confirmation_status <> 'cancelled'
        and assignment.starts_at < planning_absences.ends_at
        and assignment.ends_at > planning_absences.starts_at
        and public.planning_user_can(
          'read', assignment.company_id, assignment.vessel_id,
          assignment.starts_on, assignment.ends_on
        )
    )
  )
  and (
    not public.has_role('marin')
    or public.has_any_role(array['admin', 'direction', 'armement', 'capitaine'])
    or person_id = public.current_person_id()
  )
);

comment on function public.dpr_marin_is_second_captain(bigint) is
  'Returns true only for an active Marin linked to the company whose HR function is 2nd/Second Capitaine.';
comment on function public.dpr_can_read_report(bigint) is
  'Office and captain profiles read company DPRs; Marin second captains read only DPRs they created.';
