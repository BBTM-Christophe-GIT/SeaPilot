-- Closure uses archived_at. Keep the business status, contract, DPRs and
-- Planning occurrences intact so that reactivation restores the same project.
create or replace function public.projects_reactivate(target_project_id bigint)
returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  result public.projects;
begin
  if (select auth.uid()) is null
     or not coalesce(public.user_belongs_to_company(target_company_id), false)
     or not coalesce(public.has_any_role(array['admin', 'direction']), false) then
    raise exception 'Insufficient permission to reactivate a project' using errcode = '42501';
  end if;

  update public.projects
  set archived_at = null,
      archived_by = null,
      updated_by = (select auth.uid())
  where id = target_project_id and company_id = target_company_id
  returning * into result;

  if result.id is null then
    raise exception 'Project not found in the active company';
  end if;
  return result;
end;
$$;
revoke all on function public.projects_reactivate(bigint) from public, anon, authenticated;
grant execute on function public.projects_reactivate(bigint) to authenticated;

create or replace function public.projects_set_status(target_project_id bigint, target_status text)
returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  result public.projects;
begin
  if (select auth.uid()) is null
     or not coalesce(public.user_belongs_to_company(target_company_id), false)
     or not coalesce(public.has_any_role(array['admin', 'direction']), false) then
    raise exception 'Insufficient permission to change project status' using errcode = '42501';
  end if;
  if target_status is null or target_status not in
    ('Brouillon', 'Non validé', 'Validé', 'Stand-by météo', 'Facturé') then
    raise exception 'Invalid project status' using errcode = '23514';
  end if;

  update public.projects
  set status = target_status, updated_by = (select auth.uid())
  where id = target_project_id and company_id = target_company_id and archived_at is null
  returning * into result;

  if result.id is null then
    raise exception 'Active project not found in the active company';
  end if;
  return result;
end;
$$;
revoke all on function public.projects_set_status(bigint, text) from public, anon, authenticated;
grant execute on function public.projects_set_status(bigint, text) to authenticated;

-- Resolve project labels only through DPRs the caller can read. The projects
-- table stays restricted to commercial roles; no financial fields are exposed.
drop function public.dpr_report_projects();
create function public.dpr_report_projects()
returns table (id bigint, project_code text, title text, archived_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
begin
  if (select auth.uid()) is null
    or target_company_id is null
    or not public.user_belongs_to_company(target_company_id)
    or not public.dpr_user_has_module_access(target_company_id) then
    raise exception 'DPR module access required' using errcode = '42501';
  end if;
  return query
  select project.id, project.project_code, project.title, project.archived_at
  from public.projects project
  where project.company_id = target_company_id
    and exists (
      select 1 from public.dpr_reports report
      where report.project_id = project.id
        and report.company_id = target_company_id
        and report.deleted_at is null
        and public.dpr_can_read_report(report.id)
    )
  order by project.project_code, project.id;
end;
$$;
revoke all on function public.dpr_report_projects() from public, anon, authenticated;
grant execute on function public.dpr_report_projects() to authenticated;


-- Expose the Planning-selected project through the DPR context RPC. Field
-- profiles may use DPR without receiving broad read access to the project
-- catalog, so the selected project is returned as a narrow dated snapshot.
create or replace function public.dpr_entry_context(
  target_date date default current_date,
  target_vessel_id bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_company_id bigint;
  actor_person_id bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  target_company_id := public.current_planning_company_id();
  actor_person_id := public.current_person_id();
  if target_company_id is null or not public.user_belongs_to_company(target_company_id) then
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
    with actor as (
      select person.id, person.first_name, person.last_name
      from public.people person
      where person.company_id = target_company_id and person.id = actor_person_id
      limit 1
    ),
    actor_assignment as (
      select assignment.vessel_id,
        nullif(trim(assignment.watch_group), '') as watch_group,
        assignment.captain_person_id
      from public.planning_assignments assignment
      where assignment.company_id = target_company_id
        and target_date between assignment.starts_on and assignment.ends_on
        and coalesce(assignment.confirmation_status, 'confirmed') <> 'cancelled'
        and (assignment.crew_person_id = actor_person_id or assignment.captain_person_id = actor_person_id)
        and public.planning_status_is_working(public.planning_effective_person_status(
          assignment.company_id, actor_person_id, target_date,
          assignment.vessel_id, assignment.status_label
        ))
      order by (assignment.crew_person_id = actor_person_id) desc,
        (assignment.confirmation_status = 'confirmed') desc,
        assignment.starts_on desc, assignment.id desc
      limit 1
    ),
    selected_scope as (
      select coalesce(target_vessel_id, (select vessel_id from actor_assignment)) as vessel_id,
        case when target_vessel_id is null then (select watch_group from actor_assignment) else null end as watch_group
    ),
    active_people as (
      select person.id, person.first_name, person.last_name,
        coalesce(nullif(trim(person.function_label), ''), nullif(trim(person.grade_label), ''), 'Sans fonction') as function_label,
        coalesce(person.grade_label, '') as grade_label,
        coalesce(person.role_label, '') as role_label
      from public.people person
      where person.company_id = target_company_id
        and person.active
        and (person.hired_on is null or person.hired_on <= target_date)
        and (person.departed_on is null or person.departed_on >= target_date)
    ),
    selected_crew as (
      select distinct assignment.crew_person_id as person_id,
        coalesce(assignment.watch_group, '') as watch_group
      from public.planning_assignments assignment
      cross join selected_scope scope
      where assignment.company_id = target_company_id
        and scope.vessel_id is not null
        and assignment.vessel_id = scope.vessel_id
        and target_date between assignment.starts_on and assignment.ends_on
        and coalesce(assignment.confirmation_status, 'confirmed') <> 'cancelled'
        and (scope.watch_group is null
          or lower(trim(coalesce(assignment.watch_group, ''))) = lower(trim(scope.watch_group)))
        and assignment.crew_person_id is not null
        and public.planning_status_is_working(public.planning_effective_person_status(
          assignment.company_id, assignment.crew_person_id, target_date,
          assignment.vessel_id, assignment.status_label
        ))
      union
      select distinct assignment.captain_person_id,
        coalesce(assignment.watch_group, '')
      from public.planning_assignments assignment
      cross join selected_scope scope
      where assignment.company_id = target_company_id
        and scope.vessel_id is not null
        and assignment.vessel_id = scope.vessel_id
        and target_date between assignment.starts_on and assignment.ends_on
        and coalesce(assignment.confirmation_status, 'confirmed') <> 'cancelled'
        and (scope.watch_group is null
          or lower(trim(coalesce(assignment.watch_group, ''))) = lower(trim(scope.watch_group)))
        and assignment.captain_person_id is not null
        and public.planning_status_is_working(public.planning_effective_person_status(
          assignment.company_id, assignment.captain_person_id, target_date,
          assignment.vessel_id, assignment.status_label
        ))
    ),
    matching_project as (
      select occurrence.catalog_project_id,
        project.project_code,
        project.title
      from public.planning_projects occurrence
      join public.projects project
        on project.id = occurrence.catalog_project_id
       and project.company_id = target_company_id
       and project.archived_at is null
      cross join selected_scope scope
      where occurrence.company_id = target_company_id
        and occurrence.catalog_project_id is not null
        and occurrence.cancelled_at is null
        and target_date between coalesce(occurrence.starts_on, target_date)
          and coalesce(occurrence.ends_on, occurrence.starts_on, target_date)
        and scope.vessel_id in (occurrence.primary_vessel_id, occurrence.secondary_vessel_id)
      order by (occurrence.primary_vessel_id = scope.vessel_id) desc,
        occurrence.starts_on desc nulls last, occurrence.id desc
      limit 1
    )
    select jsonb_build_object(
      'issuerPersonId', actor_person_id,
      'issuerName', coalesce(
        (select concat_ws(' ', actor.first_name, upper(actor.last_name)) from actor),
        (select coalesce(nullif(trim(profile.display_name), ''), profile.email)
          from public.profiles profile where profile.id = (select auth.uid())),
        'Utilisateur'
      ),
      'vesselId', (select vessel_id from selected_scope),
      'projectId', (select catalog_project_id from matching_project),
      'project', (select jsonb_build_object(
        'id', catalog_project_id,
        'code', project_code,
        'title', title,
        'archivedAt', null
      ) from matching_project),
      'watchGroup', coalesce((select watch_group from selected_scope), ''),
      'people', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', person.id, 'firstName', person.first_name, 'lastName', person.last_name,
          'functionLabel', person.function_label, 'gradeLabel', person.grade_label,
          'roleLabel', person.role_label
        ) order by person.function_label, person.last_name, person.first_name)
        from active_people person
      ), '[]'::jsonb),
      'crewPersonIds', coalesce((
        select jsonb_agg(crew.person_id order by crew.person_id)
        from (select distinct selected.person_id from selected_crew selected where selected.person_id is not null) crew
        join active_people person on person.id = crew.person_id
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.dpr_entry_context(date, bigint) from public, anon, authenticated;
grant execute on function public.dpr_entry_context(date, bigint) to authenticated;

comment on function public.dpr_entry_context(date, bigint) is
  'Returns DPR Planning defaults, the selected project snapshot and only En mer/A terre crew for the selected date and optional vessel.';

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

  -- Closed projects cannot be selected for a new report. Lock against a
  -- concurrent closure until this transaction finishes.
  if target_project_id is not null then
    perform project.id from public.projects project
    where project.id = target_project_id and project.company_id = target_company_id
      and project.archived_at is null
    for share;
    if not found then
      raise exception 'Active project not found in the active company' using errcode = '23514';
    end if;
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

  -- Keep a historical DPR editable with its original project. A change to a
  -- different project must select an active project from the same company.
  if target_project_id is not null and target_project_id is distinct from current_report.project_id then
    perform project.id from public.projects project
    where project.id = target_project_id and project.company_id = current_report.company_id
      and project.archived_at is null
    for share;
    if not found then
      raise exception 'Active project not found in the active company' using errcode = '23514';
    end if;
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
