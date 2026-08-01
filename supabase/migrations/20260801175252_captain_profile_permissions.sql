-- Captain profile hardening: HR scope limited to the captain's watch,
-- personal leave requests, and DPR access limited to assigned vessels.

create or replace function public.captain_has_assigned_vessel(
  target_company_id bigint,
  target_vessel_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and target_vessel_id is not null
    and public.user_belongs_to_company(target_company_id)
    and public.has_company_role(target_company_id, array['capitaine'])
    and exists (
      select 1
      from public.planning_assignments assignment
      where assignment.company_id = target_company_id
        and assignment.vessel_id = target_vessel_id
        and assignment.confirmation_status <> 'cancelled'
        and assignment.ends_on >= current_date
        and (
          assignment.crew_person_id = public.current_person_id()
          or assignment.captain_person_id = public.current_person_id()
        )
    );
$$;

create or replace function public.captain_shares_watch_with_person(
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
    and public.has_company_role(target_company_id, array['capitaine'])
    and exists (
      select 1
      from public.planning_assignments captain_assignment
      join public.planning_assignments crew_assignment
        on crew_assignment.company_id = captain_assignment.company_id
       and crew_assignment.vessel_id = captain_assignment.vessel_id
       and lower(trim(coalesce(crew_assignment.watch_group, '')))
         = lower(trim(coalesce(captain_assignment.watch_group, '')))
       and crew_assignment.starts_on <= captain_assignment.ends_on
       and crew_assignment.ends_on >= captain_assignment.starts_on
       and crew_assignment.confirmation_status <> 'cancelled'
      where captain_assignment.company_id = target_company_id
        and captain_assignment.confirmation_status <> 'cancelled'
        and captain_assignment.ends_on >= current_date
        and (
          captain_assignment.crew_person_id = public.current_person_id()
          or captain_assignment.captain_person_id = public.current_person_id()
        )
        and (
          crew_assignment.crew_person_id = target_person_id
          or crew_assignment.captain_person_id = target_person_id
        )
    );
$$;

create or replace function public.dpr_captain_can_access_report(target_dpr_id bigint)
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
      and public.captain_has_assigned_vessel(report.company_id, report.vessel_id)
  );
$$;

revoke all on function public.captain_has_assigned_vessel(bigint, bigint) from public, anon;
revoke all on function public.captain_shares_watch_with_person(bigint, bigint) from public, anon;
revoke all on function public.dpr_captain_can_access_report(bigint) from public, anon;
grant execute on function public.captain_has_assigned_vessel(bigint, bigint) to authenticated;
grant execute on function public.captain_shares_watch_with_person(bigint, bigint) to authenticated;
grant execute on function public.dpr_captain_can_access_report(bigint) to authenticated;

drop policy if exists people_planning_company_read on public.people;
create policy people_planning_company_read on public.people for select to authenticated
using (
  company_id = public.current_planning_company_id()
  and (
    user_id = auth.uid()
    or public.has_any_role(array['admin', 'direction', 'armement'])
    or (
      public.has_role('capitaine')
      and public.captain_shares_watch_with_person(company_id, id)
    )
  )
);

drop policy if exists hr_documents_company_read on public.hr_documents;
create policy hr_documents_company_read on public.hr_documents for select to authenticated
using (
  company_id = public.current_planning_company_id()
  and (
    person_id = public.current_person_id()
    or public.has_any_role(array['admin', 'direction', 'armement'])
    or (
      public.has_role('capitaine')
      and public.captain_shares_watch_with_person(company_id, person_id)
    )
  )
);

drop policy if exists hr_documents_storage_read on storage.objects;
create policy hr_documents_storage_read on storage.objects for select to authenticated
using (
  bucket_id = 'hr-documents'
  and exists (
    select 1
    from public.hr_documents document
    join public.people person on person.id = document.person_id
    where document.storage_bucket = storage.objects.bucket_id
      and document.storage_path = storage.objects.name
      and (
        person.user_id = auth.uid()
        or public.has_any_role(array['admin', 'direction', 'armement'])
        or (
          public.has_role('capitaine')
          and public.captain_shares_watch_with_person(document.company_id, document.person_id)
        )
      )
  )
);

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
      and report.deleted_at is null
      and public.user_belongs_to_company(report.company_id)
      and (
        public.has_company_role(report.company_id, array['admin', 'direction', 'armement'])
        or public.dpr_captain_can_access_report(report.id)
        or (
          public.dpr_marin_is_second_captain(report.company_id)
          and report.created_by = auth.uid()
        )
      )
  );
$$;

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
      and (
        (
          report.status in ('draft', 'reopened')
          and public.has_company_role(report.company_id, array['admin', 'direction', 'armement'])
        )
        or (
          report.status in ('draft', 'submitted', 'reopened')
          and public.dpr_captain_can_access_report(report.id)
        )
        or (
          report.status in ('draft', 'reopened')
          and public.dpr_marin_is_second_captain(report.company_id)
          and report.created_by = auth.uid()
        )
      )
  );
$$;

create or replace function public.dpr_create_draft(
  target_report_date date,
  target_project_id bigint default null,
  target_unlisted_project_name text default null,
  target_vessel_id bigint default null,
  target_description text default null,
  target_qhse_note text default null
)
returns public.dpr_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  profile_name text;
  created_report public.dpr_reports;
begin
  if target_report_date is null or not (
    public.has_company_role(target_company_id, array['admin', 'direction', 'armement'])
    or public.captain_has_assigned_vessel(target_company_id, target_vessel_id)
    or public.dpr_marin_is_second_captain(target_company_id)
  ) then
    raise exception 'Insufficient permission to create a DPR draft' using errcode = '42501';
  end if;

  select nullif(trim(profile.display_name), '') into profile_name
  from public.profiles profile where profile.id = auth.uid();
  if profile_name is null then
    raise exception 'The authenticated profile must have a display name' using errcode = '23514';
  end if;

  insert into public.dpr_reports (
    company_id, report_date, project_id, unlisted_project_name, vessel_id,
    issuer_user_id, issuer_name_snapshot, description, qhse_note, created_by, updated_by
  ) values (
    target_company_id, target_report_date, target_project_id, nullif(trim(target_unlisted_project_name), ''), target_vessel_id,
    auth.uid(), profile_name, nullif(trim(target_description), ''), nullif(trim(target_qhse_note), ''), auth.uid(), auth.uid()
  ) returning * into created_report;

  insert into public.dpr_audit_events (company_id, dpr_id, version_no, event_type, actor_user_id)
  values (target_company_id, created_report.id, created_report.version_no, 'created', auth.uid());
  return created_report;
end;
$$;

create or replace function public.dpr_update_draft(
  target_dpr_id bigint,
  target_report_date date,
  target_project_id bigint default null,
  target_unlisted_project_name text default null,
  target_vessel_id bigint default null,
  target_description text default null,
  target_qhse_note text default null
)
returns public.dpr_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_report public.dpr_reports;
  captain_edit boolean;
begin
  select * into current_report from public.dpr_reports where id = target_dpr_id for update;
  captain_edit := current_report.id is not null and public.dpr_captain_can_access_report(current_report.id);
  if current_report.id is null
     or not public.user_belongs_to_company(current_report.company_id)
     or current_report.deleted_at is not null
     or not (
       (
         current_report.status in ('draft', 'reopened')
         and (
           public.has_company_role(current_report.company_id, array['admin', 'direction', 'armement'])
           or (
             public.dpr_marin_is_second_captain(current_report.company_id)
             and current_report.created_by = auth.uid()
           )
         )
       )
       or (current_report.status in ('draft', 'submitted', 'reopened') and captain_edit)
     )
     or (captain_edit and not public.captain_has_assigned_vessel(current_report.company_id, target_vessel_id)) then
    raise exception 'Insufficient permission to update this DPR draft' using errcode = '42501';
  end if;

  update public.dpr_reports
  set report_date = target_report_date,
      project_id = target_project_id,
      unlisted_project_name = nullif(trim(target_unlisted_project_name), ''),
      vessel_id = target_vessel_id,
      description = nullif(trim(target_description), ''),
      qhse_note = nullif(trim(target_qhse_note), ''),
      updated_by = auth.uid(),
      updated_at = now()
  where id = target_dpr_id
  returning * into current_report;

  insert into public.dpr_audit_events (company_id, dpr_id, version_no, event_type, actor_user_id)
  values (current_report.company_id, current_report.id, current_report.version_no, 'updated', auth.uid());
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
       public.has_company_role(current_report.company_id, array['admin', 'direction', 'armement'])
       or public.dpr_captain_can_access_report(current_report.id)
       or (
         public.dpr_marin_is_second_captain(current_report.company_id)
         and current_report.created_by = auth.uid()
       )
     ) then
    raise exception 'Insufficient permission to submit this DPR' using errcode = '42501';
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

create or replace function public.dpr_validate(target_dpr_id bigint)
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
     or current_report.status <> 'submitted'
     or not (
       public.has_company_role(current_report.company_id, array['admin', 'direction', 'armement'])
       or public.dpr_captain_can_access_report(current_report.id)
     ) then
    raise exception 'Insufficient permission to validate this DPR' using errcode = '42501';
  end if;

  update public.dpr_reports
  set status = 'validated', validated_by = auth.uid(), validated_at = now(), updated_by = auth.uid(), updated_at = now()
  where id = target_dpr_id returning * into current_report;
  insert into public.dpr_audit_events (company_id, dpr_id, version_no, event_type, actor_user_id)
  values (current_report.company_id, current_report.id, current_report.version_no, 'validated', auth.uid());
  return current_report;
end;
$$;

create or replace function public.dpr_reopen(target_dpr_id bigint, target_reason text)
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
     or current_report.status <> 'validated'
     or nullif(trim(target_reason), '') is null
     or not (
       public.has_company_role(current_report.company_id, array['admin', 'direction', 'armement'])
       or public.dpr_captain_can_access_report(current_report.id)
     ) then
    raise exception 'Insufficient permission to reopen this DPR' using errcode = '42501';
  end if;

  update public.dpr_reports
  set status = 'reopened', reopened_from_version = version_no, version_no = version_no + 1,
      reopened_by = auth.uid(), reopened_at = now(), reopen_reason = trim(target_reason),
      updated_by = auth.uid(), updated_at = now()
  where id = target_dpr_id returning * into current_report;
  insert into public.dpr_audit_events (company_id, dpr_id, version_no, event_type, actor_user_id, reason)
  values (current_report.company_id, current_report.id, current_report.version_no, 'reopened', auth.uid(), trim(target_reason));
  return current_report;
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
  if current_file.id is null or not public.dpr_can_read_report(current_file.dpr_id) then
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
  captain_allowed boolean := false;
begin
  if auth.uid() is null
    or public.has_company_role(target_company_id, array['admin', 'direction', 'armement']) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_table_name = 'dpr_reports' then
    target_dpr_id := coalesce(new.id, old.id);
    report_owner := coalesce(new.created_by, old.created_by);
    if tg_op <> 'DELETE' then
      captain_allowed := public.captain_has_assigned_vessel(target_company_id, new.vessel_id);
    else
      captain_allowed := public.dpr_captain_can_access_report(target_dpr_id);
    end if;
  elsif tg_table_name = 'dpr_port_call_reasons' then
    select port_call.dpr_id into target_dpr_id
    from public.dpr_port_calls port_call
    where port_call.id = coalesce(new.port_call_id, old.port_call_id);
    select report.created_by into report_owner
    from public.dpr_reports report where report.id = target_dpr_id;
    captain_allowed := public.dpr_captain_can_access_report(target_dpr_id);
  else
    target_dpr_id := coalesce(new.dpr_id, old.dpr_id);
    select report.created_by into report_owner
    from public.dpr_reports report where report.id = target_dpr_id;
    captain_allowed := public.dpr_captain_can_access_report(target_dpr_id);
  end if;

  if captain_allowed or (
    public.dpr_marin_is_second_captain(target_company_id)
    and report_owner = auth.uid()
  ) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  raise exception using errcode = '42501', message = 'DPR_PERMISSION_DENIED: navire affecte ou second capitaine auteur requis.';
end;
$$;

drop policy if exists dpr_audit_events_company_read on public.dpr_audit_events;
create policy dpr_audit_events_company_read on public.dpr_audit_events for select to authenticated
using (
  public.dpr_can_read_report(dpr_id)
  or (
    dpr_id is null
    and public.has_company_role(company_id, array['admin', 'direction', 'armement'])
  )
);

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
    not public.has_any_role(array['marin', 'capitaine'])
    or public.has_any_role(array['admin', 'direction', 'armement'])
    or person_id = public.current_person_id()
  )
);

comment on function public.captain_has_assigned_vessel(bigint, bigint) is
  'Returns true when the authenticated captain has a non-cancelled current or future assignment on the vessel.';
comment on function public.captain_shares_watch_with_person(bigint, bigint) is
  'Returns true when a person shares an overlapping vessel and watch assignment with the authenticated captain.';
comment on function public.dpr_captain_can_access_report(bigint) is
  'Restricts captain DPR access to reports belonging to an assigned vessel.';
