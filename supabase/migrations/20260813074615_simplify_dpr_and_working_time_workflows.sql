-- DPR access is driven by the administrator-managed module permission. Roles
-- only affect the history surface: a pure Marin can author and validate their
-- own report through RPCs, but cannot browse persisted DPR rows afterwards.

create or replace function public.dpr_user_has_module_access(target_company_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and public.user_belongs_to_company(target_company_id)
    and exists (
      select 1
      from public.user_roles actor_role
      join public.role_module_permissions permission
        on permission.role_key = actor_role.role_key
       and permission.module_key = 'dpr'
       and permission.is_visible
      where actor_role.user_id = (select auth.uid())
        and actor_role.company_id = target_company_id
    );
$$;

create or replace function public.dpr_user_is_history_restricted_marin(target_company_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_company_role(target_company_id, array['marin'])
    and not public.has_company_role(target_company_id, array['admin', 'direction', 'armement', 'capitaine']);
$$;

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
        or report.created_by = (select auth.uid())
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
      and not public.dpr_user_is_history_restricted_marin(report.company_id)
  );
$$;

create or replace function public.dpr_user_can_edit(target_dpr_id bigint)
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
      and report.status in ('draft', 'reopened')
      and public.dpr_user_can_manage_report(report.id)
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
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  profile_name text;
  created_report public.dpr_reports;
begin
  if target_report_date is null or not public.dpr_user_has_module_access(target_company_id) then
    raise exception 'Insufficient permission to create a DPR draft' using errcode = '42501';
  end if;

  select nullif(trim(profile.display_name), '') into profile_name
  from public.profiles profile where profile.id = (select auth.uid());
  if profile_name is null then
    raise exception 'The authenticated profile must have a display name' using errcode = '23514';
  end if;

  insert into public.dpr_reports (
    company_id, report_date, project_id, unlisted_project_name, vessel_id,
    issuer_user_id, issuer_name_snapshot, description, qhse_note, created_by, updated_by
  ) values (
    target_company_id, target_report_date, target_project_id, nullif(trim(target_unlisted_project_name), ''), target_vessel_id,
    (select auth.uid()), profile_name, nullif(trim(target_description), ''), nullif(trim(target_qhse_note), ''),
    (select auth.uid()), (select auth.uid())
  ) returning * into created_report;

  insert into public.dpr_audit_events (company_id, dpr_id, version_no, event_type, actor_user_id)
  values (target_company_id, created_report.id, created_report.version_no, 'created', (select auth.uid()));
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
set search_path = ''
as $$
declare
  current_report public.dpr_reports;
begin
  select * into current_report from public.dpr_reports where id = target_dpr_id for update;
  if current_report.id is null
     or current_report.status not in ('draft', 'reopened')
     or not public.dpr_user_can_manage_report(current_report.id) then
    raise exception 'Insufficient permission to update this DPR draft' using errcode = '42501';
  end if;

  update public.dpr_reports
  set report_date = target_report_date,
      project_id = target_project_id,
      unlisted_project_name = nullif(trim(target_unlisted_project_name), ''),
      vessel_id = target_vessel_id,
      description = nullif(trim(target_description), ''),
      qhse_note = nullif(trim(target_qhse_note), ''),
      validator_person_id = null,
      validator_name_snapshot = null,
      updated_by = (select auth.uid()),
      updated_at = now()
  where id = target_dpr_id
  returning * into current_report;

  insert into public.dpr_audit_events (company_id, dpr_id, version_no, event_type, actor_user_id)
  values (current_report.company_id, current_report.id, current_report.version_no, 'updated', (select auth.uid()));
  return current_report;
end;
$$;

create or replace function public.dpr_submit(target_dpr_id bigint)
returns public.dpr_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_report public.dpr_reports;
begin
  select * into current_report from public.dpr_reports where id = target_dpr_id for update;
  if current_report.id is null
     or current_report.status not in ('draft', 'reopened')
     or not public.dpr_user_can_manage_report(current_report.id) then
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
      status = 'submitted',
      validator_person_id = null,
      validator_name_snapshot = null,
      submitted_by = (select auth.uid()),
      submitted_at = now(),
      updated_by = (select auth.uid()),
      updated_at = now()
  where id = target_dpr_id
  returning * into current_report;

  insert into public.dpr_audit_events (company_id, dpr_id, version_no, event_type, actor_user_id)
  values (current_report.company_id, current_report.id, current_report.version_no, 'submitted', (select auth.uid()));
  return current_report;
end;
$$;

create or replace function public.dpr_validate(target_dpr_id bigint)
returns public.dpr_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_report public.dpr_reports;
begin
  select * into current_report from public.dpr_reports where id = target_dpr_id for update;
  if current_report.id is null
     or current_report.status <> 'submitted'
     or not public.dpr_user_can_manage_report(current_report.id) then
    raise exception 'Insufficient permission to validate this DPR' using errcode = '42501';
  end if;

  update public.dpr_reports
  set status = 'validated',
      validated_by = (select auth.uid()),
      validated_at = now(),
      updated_by = (select auth.uid()),
      updated_at = now()
  where id = target_dpr_id
  returning * into current_report;

  insert into public.dpr_audit_events (company_id, dpr_id, version_no, event_type, actor_user_id)
  values (current_report.company_id, current_report.id, current_report.version_no, 'validated', (select auth.uid()));
  return current_report;
end;
$$;

create or replace function public.dpr_reopen(target_dpr_id bigint, target_reason text)
returns public.dpr_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_report public.dpr_reports;
begin
  select * into current_report from public.dpr_reports where id = target_dpr_id for update;
  if current_report.id is null
     or current_report.status <> 'validated'
     or nullif(trim(target_reason), '') is null
     or not public.dpr_user_can_manage_report(current_report.id) then
    raise exception 'Insufficient permission to reopen this DPR' using errcode = '42501';
  end if;

  update public.dpr_reports
  set status = 'reopened',
      reopened_from_version = version_no,
      version_no = version_no + 1,
      reopened_by = (select auth.uid()),
      reopened_at = now(),
      reopen_reason = trim(target_reason),
      updated_by = (select auth.uid()),
      updated_at = now()
  where id = target_dpr_id
  returning * into current_report;

  insert into public.dpr_audit_events (company_id, dpr_id, version_no, event_type, actor_user_id, reason)
  values (current_report.company_id, current_report.id, current_report.version_no, 'reopened', (select auth.uid()), trim(target_reason));
  return current_report;
end;
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
  report_owner uuid;
begin
  if (select auth.uid()) is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_table_name = 'dpr_reports' then
    target_dpr_id := coalesce(new.id, old.id);
    report_owner := coalesce(new.created_by, old.created_by);
  elsif tg_table_name = 'dpr_port_call_reasons' then
    select port_call.dpr_id into target_dpr_id
    from public.dpr_port_calls port_call
    where port_call.id = coalesce(new.port_call_id, old.port_call_id);
    select report.created_by into report_owner from public.dpr_reports report where report.id = target_dpr_id;
  else
    target_dpr_id := coalesce(new.dpr_id, old.dpr_id);
    select report.created_by into report_owner from public.dpr_reports report where report.id = target_dpr_id;
  end if;

  if public.dpr_user_has_module_access(target_company_id)
    and (
      not public.dpr_user_is_history_restricted_marin(target_company_id)
      or report_owner = (select auth.uid())
    ) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  raise exception using errcode = '42501', message = 'DPR_PERMISSION_DENIED: acces au module DPR requis.';
end;
$$;

drop policy if exists dpr_reports_role_read on public.dpr_reports;
create policy dpr_reports_role_read on public.dpr_reports for select to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and (select public.dpr_user_has_module_access(company_id))
  and not (select public.dpr_user_is_history_restricted_marin(company_id))
  and (deleted_at is null or (select public.has_any_role(array['admin', 'direction', 'armement'])))
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'dpr_daily_metrics', 'dpr_crew_members', 'dpr_other_people', 'dpr_incidents',
    'dpr_hse_actions', 'dpr_emergency_exercises', 'dpr_port_calls',
    'dpr_supplies', 'dpr_waste_records', 'dpr_files'
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
using (exists (
  select 1 from public.dpr_port_calls port_call
  where port_call.id = dpr_port_call_reasons.port_call_id
    and public.dpr_can_read_report(port_call.dpr_id)
));

drop policy if exists dpr_audit_events_company_read on public.dpr_audit_events;
create policy dpr_audit_events_company_read on public.dpr_audit_events for select to authenticated
using (dpr_id is not null and public.dpr_can_read_report(dpr_id));

revoke all on function public.dpr_user_has_module_access(bigint) from public, anon, authenticated;
revoke all on function public.dpr_user_is_history_restricted_marin(bigint) from public, anon, authenticated;
grant execute on function public.dpr_user_is_history_restricted_marin(bigint) to authenticated;
revoke all on function public.dpr_user_can_manage_report(bigint) from public, anon, authenticated;
revoke all on function public.dpr_can_read_report(bigint) from public, anon, authenticated;
revoke all on function public.dpr_user_can_edit(bigint) from public, anon, authenticated;
revoke all on function public.enforce_dpr_marin_write_scope() from public, anon, authenticated;
grant execute on function public.dpr_user_has_module_access(bigint) to authenticated;
grant execute on function public.dpr_user_can_manage_report(bigint) to authenticated;
grant execute on function public.dpr_can_read_report(bigint) to authenticated;
grant execute on function public.dpr_user_can_edit(bigint) to authenticated;

comment on function public.dpr_user_has_module_access(bigint) is
  'True when one of the actor company roles has administrator-enabled DPR module access.';
comment on function public.dpr_can_read_report(bigint) is
  'DPR history read rule: module access is required and pure Marin profiles are intentionally excluded.';
comment on column public.dpr_reports.validator_person_id is
  'Legacy nullable field retained for historical rows; new DPR workflow has no designated validator.';

-- Working time registers are automatically provisioned for maritime profiles.

alter table public.working_time_registers
  add column if not exists requested_captain_person_id bigint references public.people(id) on delete set null,
  add column if not exists requested_signature_date date;

create or replace function public.working_time_ensure_current_register_for_person(target_person_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_person public.people%rowtype;
  target_start date := date_trunc('month', current_date)::date;
  target_end date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  saved_id bigint;
begin
  select * into target_person from public.people person where person.id = target_person_id;
  if target_person.id is null or not target_person.active or target_person.user_id is null
    or not exists (
      select 1 from public.user_roles actor_role
      where actor_role.user_id = target_person.user_id
        and actor_role.company_id = target_person.company_id
        and actor_role.role_key in ('marin', 'capitaine')
    ) then
    return null;
  end if;

  insert into public.working_time_registers (
    company_id, person_id, period_kind, period_start, period_end, created_by, updated_by
  ) values (
    target_person.company_id, target_person.id, 'monthly', target_start, target_end, null, null
  )
  on conflict (company_id, person_id, period_kind, period_start, period_end)
  do update set updated_at = public.working_time_registers.updated_at
  returning id into saved_id;
  return saved_id;
end;
$$;

create or replace function public.working_time_people_register_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.working_time_ensure_current_register_for_person(new.id);
  return new;
end;
$$;

create or replace function public.working_time_role_register_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_person_id bigint;
begin
  if new.role_key in ('marin', 'capitaine') then
    for target_person_id in
      select person.id from public.people person
      where person.user_id = new.user_id and person.company_id = new.company_id and person.active
    loop
      perform public.working_time_ensure_current_register_for_person(target_person_id);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists working_time_people_register on public.people;
create trigger working_time_people_register
after insert or update of active, user_id, company_id on public.people
for each row execute function public.working_time_people_register_trigger();

drop trigger if exists working_time_role_register on public.user_roles;
create trigger working_time_role_register
after insert or update of role_key, user_id, company_id on public.user_roles
for each row execute function public.working_time_role_register_trigger();

insert into public.working_time_registers (
  company_id, person_id, period_kind, period_start, period_end, created_by, updated_by
)
select person.company_id, person.id, 'monthly', date_trunc('month', current_date)::date,
  (date_trunc('month', current_date) + interval '1 month - 1 day')::date, null, null
from public.people person
where person.active and person.user_id is not null
  and exists (
    select 1 from public.user_roles actor_role
    where actor_role.user_id = person.user_id
      and actor_role.company_id = person.company_id
      and actor_role.role_key in ('marin', 'capitaine')
  )
on conflict (company_id, person_id, period_kind, period_start, period_end) do nothing;

revoke all on function public.working_time_ensure_current_register_for_person(bigint) from public, anon, authenticated;
revoke all on function public.working_time_people_register_trigger() from public, anon, authenticated;
revoke all on function public.working_time_role_register_trigger() from public, anon, authenticated;

create or replace function public.working_time_day_context(
  p_person_id bigint,
  p_local_work_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_person public.people%rowtype;
  target_assignment public.planning_assignments%rowtype;
  candidates jsonb;
begin
  select * into target_person from public.people person where person.id = p_person_id;
  if (select auth.uid()) is null or target_person.id is null or p_local_work_date is null
    or not public.user_belongs_to_company(target_person.company_id) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: contexte planning.';
  end if;

  if public.current_person_id() <> target_person.id
    and not public.working_time_can_manage_entry_scope(target_person.company_id)
    and not public.working_time_captain_can_access_period(
      target_person.company_id, target_person.id, p_local_work_date, p_local_work_date
    ) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: contexte planning.';
  end if;

  select assignment.* into target_assignment
  from public.planning_assignments assignment
  where assignment.company_id = target_person.company_id
    and p_local_work_date between assignment.starts_on and assignment.ends_on
    and coalesce(assignment.confirmation_status, '') <> 'cancelled'
    and (assignment.crew_person_id = target_person.id or assignment.captain_person_id = target_person.id)
  order by
    case when assignment.captain_person_id = target_person.id then 0 else 1 end,
    assignment.id desc
  limit 1;

  if target_assignment.id is null then
    return jsonb_build_object(
      'assignment_id', null,
      'vessel_id', null,
      'watch_group', null,
      'captain_candidates', '[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'person_id', candidate.id,
    'first_name', candidate.first_name,
    'last_name', candidate.last_name,
    'name', trim(candidate.first_name || ' ' || candidate.last_name)
  ) order by
    candidate.id <> target_assignment.captain_person_id,
    candidate.last_name,
    candidate.first_name), '[]'::jsonb)
  into candidates
  from public.people candidate
  where candidate.company_id = target_person.company_id
    and candidate.active
    and candidate.user_id is not null
    and exists (
      select 1 from public.user_roles candidate_role
      where candidate_role.user_id = candidate.user_id
        and candidate_role.company_id = candidate.company_id
        and candidate_role.role_key = 'capitaine'
    )
    and exists (
      select 1
      from public.planning_assignments candidate_assignment
      where candidate_assignment.company_id = target_assignment.company_id
        and candidate_assignment.vessel_id = target_assignment.vessel_id
        and lower(trim(coalesce(candidate_assignment.watch_group, '')))
          = lower(trim(coalesce(target_assignment.watch_group, '')))
        and p_local_work_date between candidate_assignment.starts_on and candidate_assignment.ends_on
        and coalesce(candidate_assignment.confirmation_status, '') <> 'cancelled'
        and (
          candidate_assignment.crew_person_id = candidate.id
          or candidate_assignment.captain_person_id = candidate.id
        )
    );

  return jsonb_build_object(
    'assignment_id', target_assignment.id,
    'vessel_id', target_assignment.vessel_id,
    'watch_group', nullif(trim(coalesce(target_assignment.watch_group, '')), ''),
    'captain_candidates', candidates
  );
end;
$$;

create or replace function public.working_time_captain_matches_day(
  target_company_id bigint,
  target_person_id bigint,
  target_captain_person_id bigint,
  target_local_work_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.people captain
    join public.user_roles captain_role
      on captain_role.user_id = captain.user_id
     and captain_role.company_id = captain.company_id
     and captain_role.role_key = 'capitaine'
    join public.planning_assignments subject_assignment
      on subject_assignment.company_id = captain.company_id
     and target_local_work_date between subject_assignment.starts_on and subject_assignment.ends_on
     and coalesce(subject_assignment.confirmation_status, '') <> 'cancelled'
     and (
       subject_assignment.crew_person_id = target_person_id
       or subject_assignment.captain_person_id = target_person_id
     )
    join public.planning_assignments captain_assignment
      on captain_assignment.company_id = subject_assignment.company_id
     and captain_assignment.vessel_id = subject_assignment.vessel_id
     and lower(trim(coalesce(captain_assignment.watch_group, '')))
       = lower(trim(coalesce(subject_assignment.watch_group, '')))
     and target_local_work_date between captain_assignment.starts_on and captain_assignment.ends_on
     and coalesce(captain_assignment.confirmation_status, '') <> 'cancelled'
     and (
       captain_assignment.crew_person_id = captain.id
       or captain_assignment.captain_person_id = captain.id
     )
    where captain.id = target_captain_person_id
      and captain.company_id = target_company_id
      and captain.active
  );
$$;

create or replace function public.save_working_time_interval(
  p_register_id bigint,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone_name text,
  p_vessel_id bigint default null,
  p_watch_group text default null,
  p_comment text default null,
  p_interval_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_register public.working_time_registers%rowtype;
  target_interval public.working_time_intervals%rowtype;
  target_assignment public.planning_assignments%rowtype;
  actor_person_id bigint := public.current_person_id();
  target_local_date date;
  target_offset_minutes integer;
  recommendation jsonb;
  saved_id bigint;
begin
  if (select auth.uid()) is null or actor_person_id is null then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PROFILE_NOT_LINKED: fiche RH requise.';
  end if;
  select * into target_register from public.working_time_registers register where register.id = p_register_id for update;
  if target_register.id is null or not public.working_time_can_edit_register(target_register.id) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: modification du registre.';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception using errcode = '22023', message = 'WORKING_TIME_INTERVAL_INVALID.';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names zone where zone.name = p_timezone_name) then
    raise exception using errcode = '22023', message = 'WORKING_TIME_TIMEZONE_INVALID.';
  end if;

  target_local_date := (p_starts_at at time zone p_timezone_name)::date;
  target_offset_minutes := (
    extract(epoch from ((p_starts_at at time zone p_timezone_name) - (p_starts_at at time zone 'UTC'))) / 60
  )::integer;
  if target_local_date not between target_register.period_start and target_register.period_end then
    raise exception using errcode = '22023', message = 'WORKING_TIME_INTERVAL_OUTSIDE_REGISTER.';
  end if;

  select assignment.* into target_assignment
  from public.planning_assignments assignment
  where assignment.company_id = target_register.company_id
    and target_local_date between assignment.starts_on and assignment.ends_on
    and coalesce(assignment.confirmation_status, '') <> 'cancelled'
    and (
      assignment.crew_person_id = target_register.person_id
      or assignment.captain_person_id = target_register.person_id
    )
  order by case when assignment.captain_person_id = target_register.person_id then 0 else 1 end, assignment.id desc
  limit 1;
  if target_assignment.id is null then
    raise exception using errcode = '23514', message = 'WORKING_TIME_PLANNING_ASSIGNMENT_REQUIRED.';
  end if;

  if actor_person_id <> target_register.person_id
    and not public.working_time_can_manage_entry_scope(target_register.company_id)
    and not public.working_time_captain_can_access_period(
      target_register.company_id, target_register.person_id,
      target_local_date, target_local_date, target_assignment.vessel_id, target_assignment.watch_group
    ) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: bordee publiee.';
  end if;

  select public.working_time_interval_recommendation(
    target_register.person_id, p_starts_at, p_ends_at, p_timezone_name,
    target_assignment.vessel_id, nullif(trim(coalesce(target_assignment.watch_group, '')), ''), p_interval_id
  ) into recommendation;
  if recommendation->>'status' in ('alerte', 'non_conforme')
    and nullif(trim(coalesce(p_comment, '')), '') is null then
    raise exception using errcode = '23514', message = 'WORKING_TIME_ALERT_COMMENT_REQUIRED.';
  end if;

  if p_interval_id is null then
    insert into public.working_time_intervals (
      company_id, register_id, person_id, local_work_date, starts_at, ends_at,
      timezone_name, utc_offset_minutes, vessel_id, watch_group, comment,
      author_user_id, author_person_id, source_type, source_metadata
    ) values (
      target_register.company_id, target_register.id, target_register.person_id,
      target_local_date, p_starts_at, p_ends_at, p_timezone_name, target_offset_minutes,
      target_assignment.vessel_id, nullif(trim(coalesce(target_assignment.watch_group, '')), ''),
      nullif(trim(coalesce(p_comment, '')), ''), (select auth.uid()), actor_person_id, 'manual',
      jsonb_build_object('planning_assignment_id', target_assignment.id)
    ) returning id into saved_id;
  else
    select * into target_interval
    from public.working_time_intervals work_interval
    where work_interval.id = p_interval_id
    for update;
    if target_interval.id is null or target_interval.register_id <> target_register.id or target_interval.voided_at is not null then
      raise exception using errcode = '23503', message = 'WORKING_TIME_INTERVAL_NOT_FOUND.';
    end if;
    update public.working_time_intervals
    set local_work_date = target_local_date,
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        timezone_name = p_timezone_name,
        utc_offset_minutes = target_offset_minutes,
        vessel_id = target_assignment.vessel_id,
        watch_group = nullif(trim(coalesce(target_assignment.watch_group, '')), ''),
        comment = nullif(trim(coalesce(p_comment, '')), ''),
        source_metadata = coalesce(source_metadata, '{}'::jsonb)
          || jsonb_build_object('planning_assignment_id', target_assignment.id),
        updated_at = now()
    where id = target_interval.id
    returning id into saved_id;
  end if;
  return saved_id;
end;
$$;

create or replace function public.save_working_time_phases(
  p_register_id bigint,
  p_phases jsonb,
  p_timezone_name text,
  p_vessel_id bigint default null,
  p_watch_group text default null,
  p_comment text default null
)
returns bigint[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.working_time_registers%rowtype;
  target_assignment public.planning_assignments%rowtype;
  phase record;
  first_start timestamptz;
  target_local_date date;
  recommendation jsonb;
  ids bigint[] := array[]::bigint[];
begin
  select * into target from public.working_time_registers where id = p_register_id for update;
  if target.id is null then raise exception 'WORKING_TIME_REGISTER_NOT_FOUND'; end if;
  select min(item.starts_at) into first_start
  from jsonb_to_recordset(p_phases) item(starts_at timestamptz, ends_at timestamptz);
  if first_start is null then
    raise exception using errcode = '22023', message = 'WORKING_TIME_PHASES_INVALID.';
  end if;
  target_local_date := (first_start at time zone p_timezone_name)::date;
  select assignment.* into target_assignment
  from public.planning_assignments assignment
  where assignment.company_id = target.company_id
    and target_local_date between assignment.starts_on and assignment.ends_on
    and coalesce(assignment.confirmation_status, '') <> 'cancelled'
    and (assignment.crew_person_id = target.person_id or assignment.captain_person_id = target.person_id)
  order by case when assignment.captain_person_id = target.person_id then 0 else 1 end, assignment.id desc
  limit 1;
  if target_assignment.id is null then
    raise exception using errcode = '23514', message = 'WORKING_TIME_PLANNING_ASSIGNMENT_REQUIRED.';
  end if;

  select public.working_time_phases_recommendation(
    target.person_id, p_phases, p_timezone_name, target_assignment.vessel_id,
    nullif(trim(coalesce(target_assignment.watch_group, '')), ''), null
  ) into recommendation;
  if recommendation->>'status' in ('alerte', 'non_conforme')
    and nullif(trim(coalesce(p_comment, '')), '') is null then
    raise exception using errcode = '23514', message = 'WORKING_TIME_ALERT_COMMENT_REQUIRED.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_phases) proposed(starts_at timestamptz, ends_at timestamptz)
    join public.working_time_intervals existing
      on existing.person_id = target.person_id
     and existing.voided_at is null
     and proposed.starts_at < existing.ends_at
     and proposed.ends_at > existing.starts_at
  ) then
    raise exception using errcode = '22023', message = 'WORKING_TIME_PHASES_EXISTING_OVERLAP';
  end if;
  for phase in
    select * from jsonb_to_recordset(p_phases) item(starts_at timestamptz, ends_at timestamptz) order by starts_at
  loop
    ids := array_append(ids, public.save_working_time_interval(
      p_register_id, phase.starts_at, phase.ends_at, p_timezone_name,
      target_assignment.vessel_id, target_assignment.watch_group, p_comment, null
    ));
  end loop;
  return ids;
end;
$$;

revoke all on function public.working_time_day_context(bigint, date) from public, anon, authenticated;
revoke all on function public.working_time_captain_matches_day(bigint, bigint, bigint, date) from public, anon, authenticated;
revoke all on function public.save_working_time_interval(bigint, timestamptz, timestamptz, text, bigint, text, text, bigint) from public, anon, authenticated;
revoke all on function public.save_working_time_phases(bigint, jsonb, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.working_time_day_context(bigint, date) to authenticated;
grant execute on function public.save_working_time_interval(bigint, timestamptz, timestamptz, text, bigint, text, text, bigint) to authenticated;
grant execute on function public.save_working_time_phases(bigint, jsonb, text, bigint, text, text) to authenticated;

comment on function public.working_time_day_context(bigint, date) is
  'Planning-derived vessel, watch and same-watch Capitaine candidates for one person and day.';
comment on function public.save_working_time_interval(bigint, timestamptz, timestamptz, text, bigint, text, text, bigint) is
  'Saves manual work using server-resolved planning vessel/watch; alert comments are mandatory.';

alter table public.working_time_validations
  drop constraint working_time_validations_event_check,
  drop constraint working_time_validations_transition_check,
  drop constraint working_time_validations_signature_check;

alter table public.working_time_validations
  add constraint working_time_validations_event_check check (
    event_type in (
      'signature_requested', 'captain_signature_requested', 'sailor_signed',
      'captain_validated', 'reopened', 'approved_import'
    )
  ),
  add constraint working_time_validations_transition_check check (
    (event_type = 'signature_requested' and previous_status in ('draft', 'reopened') and new_status = 'awaiting_sailor_signature')
    or (event_type = 'captain_signature_requested' and previous_status in ('draft', 'reopened') and new_status = 'submitted')
    or (event_type = 'sailor_signed' and previous_status = 'awaiting_sailor_signature' and new_status = 'submitted')
    or (event_type = 'captain_validated' and previous_status = 'submitted' and new_status = 'validated')
    or (event_type = 'reopened' and previous_status in ('awaiting_sailor_signature', 'submitted', 'validated') and new_status = 'reopened')
    or (event_type = 'approved_import' and new_status = 'validated')
  ),
  add constraint working_time_validations_signature_check check (
    (event_type in ('sailor_signed', 'captain_validated') and signature_version_id is not null and signature_snapshot is not null)
    or (event_type in ('signature_requested', 'captain_signature_requested', 'reopened', 'approved_import') and signature_version_id is null and signature_snapshot is null)
  );

create or replace function public.working_time_person_identity_snapshot(
  target_person_id bigint,
  target_company_id bigint
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'person_id', person.id,
    'user_id', person.user_id,
    'first_name', person.first_name,
    'last_name', person.last_name,
    'email', person.email,
    'function_label', person.function_label,
    'grade_label', person.grade_label,
    'sailor_number', person.sailor_number,
    'roles', coalesce((
      select jsonb_agg(actor_role.role_key order by actor_role.role_key)
      from public.user_roles actor_role
      where actor_role.user_id = person.user_id and actor_role.company_id = target_company_id
    ), '[]'::jsonb)
  )
  from public.people person
  where person.id = target_person_id and person.company_id = target_company_id;
$$;

create or replace function public.request_working_time_captain_signature(
  p_register_id bigint,
  p_captain_person_id bigint,
  p_local_work_date date
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_register public.working_time_registers%rowtype;
  actor_person public.people%rowtype;
  identity_data jsonb;
  vessels_data jsonb;
  watches_data jsonb;
  intervals_data jsonb;
  saved_id bigint;
begin
  select * into target_register
  from public.working_time_registers register
  where register.id = p_register_id
  for update;
  select * into actor_person
  from public.people person
  where person.user_id = (select auth.uid()) and person.company_id = target_register.company_id
  limit 1;

  if target_register.id is null or actor_person.id is null
    or actor_person.id <> target_register.person_id
    or target_register.status not in ('draft', 'reopened')
    or not public.has_company_role(target_register.company_id, array['marin', 'capitaine']) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: demande de signature capitaine.';
  end if;
  if p_local_work_date not between target_register.period_start and target_register.period_end then
    raise exception using errcode = '22023', message = 'WORKING_TIME_SIGNATURE_DATE_INVALID.';
  end if;
  if not public.working_time_captain_matches_day(
    target_register.company_id, target_register.person_id, p_captain_person_id, p_local_work_date
  ) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_CAPTAIN_NOT_IN_WATCH.';
  end if;
  if not exists (
    select 1 from public.working_time_intervals work_interval
    where work_interval.register_id = target_register.id and work_interval.voided_at is null
  ) then
    raise exception using errcode = '23514', message = 'WORKING_TIME_EMPTY_REGISTER.';
  end if;

  identity_data := public.working_time_person_identity_snapshot(actor_person.id, target_register.company_id);
  select coalesce(jsonb_agg(distinct jsonb_build_object(
    'vessel_id', vessel.id, 'name', vessel.name, 'acronym', vessel.acronym
  )), '[]'::jsonb) into vessels_data
  from public.working_time_intervals work_interval
  join public.vessels vessel on vessel.id = work_interval.vessel_id
  where work_interval.register_id = target_register.id and work_interval.voided_at is null;

  select coalesce(jsonb_agg(distinct trim(work_interval.watch_group)), '[]'::jsonb) into watches_data
  from public.working_time_intervals work_interval
  where work_interval.register_id = target_register.id
    and work_interval.voided_at is null
    and nullif(trim(work_interval.watch_group), '') is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'interval_id', work_interval.id,
    'local_work_date', work_interval.local_work_date,
    'starts_at', work_interval.starts_at,
    'ends_at', work_interval.ends_at,
    'timezone_name', work_interval.timezone_name,
    'vessel_id', work_interval.vessel_id,
    'watch_group', work_interval.watch_group,
    'comment', work_interval.comment
  ) order by work_interval.starts_at), '[]'::jsonb) into intervals_data
  from public.working_time_intervals work_interval
  where work_interval.register_id = target_register.id and work_interval.voided_at is null;

  insert into public.working_time_validations (
    company_id, register_id, person_id, event_type, previous_status, new_status,
    actor_user_id, actor_person_id, subject_identity_snapshot, actor_identity_snapshot,
    vessel_snapshot, watch_snapshot, interval_snapshot, non_compliance_snapshot, occurred_at
  ) values (
    target_register.company_id, target_register.id, target_register.person_id,
    'captain_signature_requested', target_register.status, 'submitted',
    (select auth.uid()), actor_person.id, identity_data, identity_data,
    vessels_data, watches_data, intervals_data, '[]'::jsonb, clock_timestamp()
  ) returning id into saved_id;

  update public.working_time_registers
  set status = 'submitted',
      requested_captain_person_id = p_captain_person_id,
      requested_signature_date = p_local_work_date,
      updated_at = now(),
      updated_by = (select auth.uid())
  where id = target_register.id;
  return saved_id;
end;
$$;

create or replace function public.validate_working_time_register(p_register_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_register public.working_time_registers%rowtype;
  subject_person public.people%rowtype;
  actor_person public.people%rowtype;
  actor_signature public.working_time_profile_signatures%rowtype;
  subject_identity jsonb;
  actor_identity jsonb;
  actor_roles_data jsonb;
  signature_data jsonb;
  vessels_data jsonb;
  watches_data jsonb;
  policy_data jsonb;
  intervals_data jsonb;
  non_compliance_data jsonb;
  saved_id bigint;
  is_management boolean;
  is_captain boolean;
begin
  select * into target_register
  from public.working_time_registers register
  where register.id = p_register_id
  for update;
  select * into subject_person from public.people person where person.id = target_register.person_id;
  select * into actor_person
  from public.people person
  where person.user_id = (select auth.uid()) and person.company_id = target_register.company_id
  limit 1;
  is_management := public.has_company_role(target_register.company_id, array['admin', 'armement']);
  is_captain := public.has_company_role(target_register.company_id, array['capitaine']);

  if target_register.id is null or actor_person.id is null or target_register.status <> 'submitted'
    or not (
      is_management
      or (
        is_captain
        and (
          actor_person.id = target_register.person_id
          or target_register.requested_captain_person_id = actor_person.id
          or (
            target_register.requested_captain_person_id is null
            and public.working_time_captain_can_access_period(
              target_register.company_id, target_register.person_id,
              target_register.period_start, target_register.period_end
            )
          )
        )
      )
    ) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: validation.';
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

  subject_identity := public.working_time_person_identity_snapshot(subject_person.id, target_register.company_id);
  actor_identity := public.working_time_person_identity_snapshot(actor_person.id, target_register.company_id);
  actor_roles_data := actor_identity->'roles';
  signature_data := jsonb_build_object(
    'signature_id', actor_signature.id,
    'signer_person_id', actor_person.id,
    'signer_user_id', actor_person.user_id,
    'signer_name', trim(actor_person.first_name || ' ' || actor_person.last_name),
    'signer_roles', actor_roles_data,
    'signed_at', clock_timestamp(),
    'version_number', actor_signature.version_number,
    'storage_bucket', actor_signature.storage_bucket,
    'storage_path', actor_signature.storage_path,
    'mime_type', actor_signature.mime_type,
    'file_size_bytes', actor_signature.file_size_bytes,
    'sha256', actor_signature.sha256,
    'valid_from', actor_signature.valid_from
  );

  select coalesce(jsonb_agg(distinct jsonb_build_object(
    'vessel_id', vessel.id, 'name', vessel.name, 'acronym', vessel.acronym
  )), '[]'::jsonb) into vessels_data
  from public.working_time_intervals work_interval
  join public.vessels vessel on vessel.id = work_interval.vessel_id
  where work_interval.register_id = target_register.id and work_interval.voided_at is null;
  select coalesce(jsonb_agg(distinct trim(work_interval.watch_group)), '[]'::jsonb) into watches_data
  from public.working_time_intervals work_interval
  where work_interval.register_id = target_register.id and work_interval.voided_at is null
    and nullif(trim(work_interval.watch_group), '') is not null;
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
  from public.planning_work_rest_policies policy where policy.id = target_register.work_rest_policy_id;
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
  ) order by work_interval.starts_at), '[]'::jsonb) into intervals_data
  from public.working_time_intervals work_interval
  where work_interval.register_id = target_register.id and work_interval.voided_at is null;
  select coalesce(jsonb_agg(jsonb_build_object(
    'local_work_date', calculation.local_window_end_date,
    'violation_codes', calculation.violation_codes,
    'work_24h_seconds', calculation.work_24h_seconds,
    'rest_24h_seconds', calculation.rest_24h_seconds,
    'work_7d_seconds', calculation.work_7d_seconds,
    'rest_7d_seconds', calculation.rest_7d_seconds
  ) order by calculation.local_window_end_date), '[]'::jsonb) into non_compliance_data
  from public.working_time_calculation_windows calculation
  where calculation.company_id = target_register.company_id
    and calculation.person_id = target_register.person_id
    and calculation.local_window_end_date between target_register.period_start and target_register.period_end
    and calculation.is_compliant is false;

  insert into public.working_time_validations (
    company_id, register_id, person_id, event_type, previous_status, new_status,
    actor_user_id, actor_person_id, signature_version_id,
    subject_identity_snapshot, actor_identity_snapshot, signature_snapshot,
    vessel_snapshot, watch_snapshot, policy_snapshot,
    interval_snapshot, non_compliance_snapshot, occurred_at
  ) values (
    target_register.company_id, target_register.id, target_register.person_id,
    'captain_validated', 'submitted', 'validated',
    (select auth.uid()), actor_person.id, actor_signature.id,
    subject_identity, actor_identity, signature_data,
    vessels_data, watches_data, policy_data,
    intervals_data, non_compliance_data, clock_timestamp()
  ) returning id into saved_id;

  update public.working_time_registers
  set status = 'validated', updated_at = now(), updated_by = (select auth.uid())
  where id = target_register.id;
  return saved_id;
end;
$$;

create or replace function public.approve_own_working_time_register(
  p_register_id bigint,
  p_local_work_date date
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_register public.working_time_registers%rowtype;
  actor_person_id bigint := public.current_person_id();
begin
  select * into target_register
  from public.working_time_registers register
  where register.id = p_register_id;
  if target_register.id is null
    or target_register.person_id <> actor_person_id
    or not public.has_company_role(target_register.company_id, array['capitaine']) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: auto-validation capitaine.';
  end if;
  if target_register.status in ('draft', 'reopened') then
    perform public.request_working_time_captain_signature(p_register_id, actor_person_id, p_local_work_date);
  end if;
  return public.validate_working_time_register(p_register_id);
end;
$$;

revoke all on function public.working_time_person_identity_snapshot(bigint, bigint) from public, anon, authenticated;
revoke all on function public.request_working_time_captain_signature(bigint, bigint, date) from public, anon, authenticated;
revoke all on function public.validate_working_time_register(bigint) from public, anon, authenticated;
revoke all on function public.approve_own_working_time_register(bigint, date) from public, anon, authenticated;
grant execute on function public.request_working_time_captain_signature(bigint, bigint, date) to authenticated;
grant execute on function public.validate_working_time_register(bigint) to authenticated;
grant execute on function public.approve_own_working_time_register(bigint, date) to authenticated;

comment on function public.request_working_time_captain_signature(bigint, bigint, date) is
  'Submits a Marin register directly to a Capitaine assigned to the same planning watch on the selected day.';
comment on function public.validate_working_time_register(bigint) is
  'Validates a submitted register for its requested Capitaine, management, or the Capitaine who owns it.';
comment on function public.approve_own_working_time_register(bigint, date) is
  'Atomically submits and validates a Capitaine own register.';
