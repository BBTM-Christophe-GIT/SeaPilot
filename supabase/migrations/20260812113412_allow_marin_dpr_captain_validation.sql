-- Allow every Marin to author their own DPR and route each submission to a
-- named, active Capitaine profile. Existing office overrides and historical
-- captain-by-vessel access remain available.

alter table public.dpr_reports
  add column if not exists validator_person_id bigint references public.people(id) on delete restrict,
  add column if not exists validator_name_snapshot text;

create index if not exists dpr_reports_validator_status_idx
  on public.dpr_reports (company_id, validator_person_id, status)
  where deleted_at is null;

create or replace function public.dpr_marin_can_manage_own(target_company_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select auth.uid()) is not null
    and public.user_belongs_to_company(target_company_id)
    and public.has_company_role(target_company_id, array['marin']);
$$;

-- Keep the former helper as a compatibility wrapper because the hardened DPR
-- functions introduced in August reference it by name.
create or replace function public.dpr_marin_is_second_captain(target_company_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.dpr_marin_can_manage_own(target_company_id);
$$;

create or replace function public.dpr_validator_is_eligible(
  target_company_id bigint,
  target_person_id bigint,
  target_date date default current_date
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_person_id is not null and exists (
    select 1
    from public.people person
    join public.user_roles user_role
      on user_role.user_id = person.user_id
     and user_role.company_id = person.company_id
     and user_role.role_key = 'capitaine'
    where person.id = target_person_id
      and person.company_id = target_company_id
      and person.user_id is not null
      and person.active
      and (person.hired_on is null or person.hired_on <= target_date)
      and (person.departed_on is null or person.departed_on >= target_date)
  );
$$;

create or replace function public.dpr_validator_context(target_date date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  actor_person_id bigint := public.current_person_id();
begin
  if (select auth.uid()) is null
     or target_company_id is null
     or not public.user_belongs_to_company(target_company_id) then
    raise exception 'Active company membership required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.user_roles user_role
    join public.role_module_permissions permission
      on permission.role_key = user_role.role_key
     and permission.module_key = 'dpr'
     and permission.is_visible
    where user_role.user_id = (select auth.uid())
      and user_role.company_id = target_company_id
  ) then
    raise exception 'DPR module access required' using errcode = '42501';
  end if;

  return (
    with eligible as (
      select distinct
        person.id,
        person.first_name,
        person.last_name,
        coalesce(nullif(trim(person.function_label), ''), nullif(trim(person.grade_label), ''), 'Capitaine') as function_label,
        coalesce(person.grade_label, '') as grade_label,
        coalesce(person.role_label, '') as role_label
      from public.people person
      join public.user_roles user_role
        on user_role.user_id = person.user_id
       and user_role.company_id = person.company_id
       and user_role.role_key = 'capitaine'
      where person.company_id = target_company_id
        and person.active
        and (person.hired_on is null or person.hired_on <= target_date)
        and (person.departed_on is null or person.departed_on >= target_date)
    ),
    planned_validator as (
      select assignment.captain_person_id
      from public.planning_assignments assignment
      join eligible captain on captain.id = assignment.captain_person_id
      where assignment.company_id = target_company_id
        and target_date between assignment.starts_on and assignment.ends_on
        and coalesce(assignment.confirmation_status, 'confirmed') <> 'cancelled'
        and assignment.crew_person_id = actor_person_id
      order by
        (assignment.confirmation_status = 'confirmed') desc,
        assignment.starts_on desc,
        assignment.id desc
      limit 1
    )
    select jsonb_build_object(
      'defaultValidatorPersonId', (select captain_person_id from planned_validator),
      'people', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', person.id,
          'firstName', person.first_name,
          'lastName', person.last_name,
          'functionLabel', person.function_label,
          'gradeLabel', person.grade_label,
          'roleLabel', person.role_label,
          'isDprValidator', true
        ) order by person.last_name, person.first_name)
        from eligible person
      ), '[]'::jsonb)
    )
  );
end;
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
        public.has_company_role(report.company_id, array['admin', 'direction', 'armement'])
        or (
          report.deleted_at is null
          and (
            public.dpr_captain_can_access_report(report.id)
            or (
              public.has_company_role(report.company_id, array['capitaine'])
              and report.validator_person_id = public.current_person_id()
            )
            or (
              public.dpr_marin_can_manage_own(report.company_id)
              and report.created_by = (select auth.uid())
            )
          )
        )
      )
  );
$$;

create or replace function public.dpr_assign_validator(
  target_dpr_id bigint,
  target_validator_person_id bigint
)
returns public.dpr_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_report public.dpr_reports;
  validator_name text;
begin
  select * into current_report
  from public.dpr_reports
  where id = target_dpr_id
  for update;

  if current_report.id is null or current_report.deleted_at is not null then
    raise exception 'DPR not found' using errcode = 'P0002';
  end if;

  if current_report.status = 'submitted' then
    if current_report.validator_person_id is distinct from target_validator_person_id
       or not public.dpr_user_can_edit(current_report.id) then
      raise exception 'Insufficient permission to assign this DPR validator' using errcode = '42501';
    end if;

    return current_report;
  end if;

  if current_report.status not in ('draft', 'reopened')
     or not public.dpr_user_can_edit(current_report.id) then
    raise exception 'Insufficient permission to assign this DPR validator' using errcode = '42501';
  end if;

  if target_validator_person_id is not null then
    if not public.dpr_validator_is_eligible(
      current_report.company_id,
      target_validator_person_id,
      current_report.report_date
    ) then
      raise exception 'The selected DPR validator must have an active Capitaine profile' using errcode = '23514';
    end if;

    select concat_ws(' ', person.first_name, upper(person.last_name))
    into validator_name
    from public.people person
    where person.id = target_validator_person_id;
  end if;

  update public.dpr_reports
  set validator_person_id = target_validator_person_id,
      validator_name_snapshot = nullif(trim(validator_name), ''),
      updated_by = (select auth.uid()),
      updated_at = now()
  where id = current_report.id
  returning * into current_report;

  insert into public.dpr_audit_events (
    company_id, dpr_id, version_no, event_type, actor_user_id, metadata
  ) values (
    current_report.company_id,
    current_report.id,
    current_report.version_no,
    'updated',
    (select auth.uid()),
    jsonb_build_object(
      'field', 'validator_person_id',
      'validator_person_id', current_report.validator_person_id,
      'validator_name', current_report.validator_name_snapshot
    )
  );

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
         public.dpr_marin_can_manage_own(current_report.company_id)
         and current_report.created_by = (select auth.uid())
       )
     ) then
    raise exception 'Insufficient permission to submit this DPR' using errcode = '42501';
  end if;

  if current_report.vessel_id is null
     or (current_report.project_id is null and current_report.unlisted_project_name is null)
     or current_report.description is null then
    raise exception 'Vessel, project and daily description are required before submission' using errcode = '23514';
  end if;

  if current_report.validator_person_id is null
     or not public.dpr_validator_is_eligible(
       current_report.company_id,
       current_report.validator_person_id,
       current_report.report_date
     ) then
    raise exception 'An active Capitaine validator is required before submission' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.dpr_files file
    where file.dpr_id = current_report.id
      and file.status = 'pending'
      and file.deleted_at is null
  ) then
    raise exception 'All DPR files must finish uploading before submission' using errcode = '23514';
  end if;

  update public.dpr_reports
  set dpr_number = coalesce(dpr_number, public.dpr_allocate_next_number(company_id)),
      status = 'submitted',
      submitted_by = (select auth.uid()),
      submitted_at = now(),
      updated_by = (select auth.uid()),
      updated_at = now()
  where id = target_dpr_id
  returning * into current_report;

  insert into public.dpr_audit_events (
    company_id, dpr_id, version_no, event_type, actor_user_id, metadata
  ) values (
    current_report.company_id,
    current_report.id,
    current_report.version_no,
    'submitted',
    (select auth.uid()),
    jsonb_build_object(
      'validator_person_id', current_report.validator_person_id,
      'validator_name', current_report.validator_name_snapshot
    )
  );
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
     or not coalesce((
       public.has_company_role(current_report.company_id, array['admin', 'direction', 'armement'])
       or (
         current_report.validator_person_id is not null
         and current_report.validator_person_id = public.current_person_id()
         and public.dpr_validator_is_eligible(
           current_report.company_id,
           current_report.validator_person_id,
           current_report.report_date
         )
       )
       or (
         current_report.validator_person_id is null
         and public.dpr_captain_can_access_report(current_report.id)
       )
     ), false) then
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

  insert into public.dpr_audit_events (
    company_id, dpr_id, version_no, event_type, actor_user_id
  ) values (
    current_report.company_id,
    current_report.id,
    current_report.version_no,
    'validated',
    (select auth.uid())
  );
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
     or not coalesce((
       public.has_company_role(current_report.company_id, array['admin', 'direction', 'armement'])
       or (
         current_report.validator_person_id is not null
         and current_report.validator_person_id = public.current_person_id()
         and public.dpr_validator_is_eligible(
           current_report.company_id,
           current_report.validator_person_id,
           current_report.report_date
         )
       )
       or (
         current_report.validator_person_id is null
         and public.dpr_captain_can_access_report(current_report.id)
       )
     ), false) then
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

  insert into public.dpr_audit_events (
    company_id, dpr_id, version_no, event_type, actor_user_id, reason
  ) values (
    current_report.company_id,
    current_report.id,
    current_report.version_no,
    'reopened',
    (select auth.uid()),
    trim(target_reason)
  );
  return current_report;
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
  if (select auth.uid()) is null
    or public.has_company_role(target_company_id, array['admin', 'direction', 'armement']) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_table_name = 'dpr_reports' then
    target_dpr_id := coalesce(new.id, old.id);
    report_owner := coalesce(new.created_by, old.created_by);
    if tg_op <> 'DELETE' then
      captain_allowed := public.captain_has_assigned_vessel(target_company_id, new.vessel_id)
        or (
          public.has_company_role(target_company_id, array['capitaine'])
          and new.validator_person_id = public.current_person_id()
        );
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
    captain_allowed := public.dpr_captain_can_access_report(target_dpr_id)
      or (
        public.has_company_role(target_company_id, array['capitaine'])
        and exists (
          select 1 from public.dpr_reports report
          where report.id = target_dpr_id
            and report.validator_person_id = public.current_person_id()
        )
      );
  end if;

  if captain_allowed or (
    public.dpr_marin_can_manage_own(target_company_id)
    and report_owner = (select auth.uid())
  ) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  raise exception using errcode = '42501', message = 'DPR_PERMISSION_DENIED: Marin auteur ou Capitaine autorise requis.';
end;
$$;

revoke all on function public.dpr_marin_can_manage_own(bigint) from public, anon;
revoke all on function public.dpr_marin_is_second_captain(bigint) from public, anon;
revoke all on function public.dpr_validator_is_eligible(bigint, bigint, date) from public, anon, authenticated;
revoke all on function public.dpr_validator_context(date) from public, anon;
revoke all on function public.dpr_can_read_report(bigint) from public, anon;
revoke all on function public.dpr_assign_validator(bigint, bigint) from public, anon;
revoke all on function public.dpr_submit(bigint) from public, anon;
revoke all on function public.dpr_validate(bigint) from public, anon;
revoke all on function public.dpr_reopen(bigint, text) from public, anon;
revoke all on function public.enforce_dpr_marin_write_scope() from public, anon, authenticated;

grant execute on function public.dpr_marin_can_manage_own(bigint) to authenticated;
grant execute on function public.dpr_marin_is_second_captain(bigint) to authenticated;
grant execute on function public.dpr_validator_context(date) to authenticated;
grant execute on function public.dpr_can_read_report(bigint) to authenticated;
grant execute on function public.dpr_assign_validator(bigint, bigint) to authenticated;
grant execute on function public.dpr_submit(bigint) to authenticated;
grant execute on function public.dpr_validate(bigint) to authenticated;
grant execute on function public.dpr_reopen(bigint, text) to authenticated;

comment on column public.dpr_reports.validator_person_id is
  'Active company person with the Capitaine role designated to validate the submitted DPR.';
comment on column public.dpr_reports.validator_name_snapshot is
  'Immutable display snapshot of the designated Capitaine at assignment time.';
comment on function public.dpr_marin_can_manage_own(bigint) is
  'Allows a Marin company member to create, read, edit and submit only DPRs they authored.';
comment on function public.dpr_marin_is_second_captain(bigint) is
  'Compatibility wrapper retained for older DPR functions; delegates to standard Marin author permissions.';
comment on function public.dpr_validator_context(date) is
  'Returns active Capitaine profile candidates and the actor planning captain for DPR assignment.';
comment on function public.dpr_assign_validator(bigint, bigint) is
  'Assigns or clears the active Capitaine profile responsible for validating an editable DPR.';
