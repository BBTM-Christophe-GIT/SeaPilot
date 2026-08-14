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
        'title', title
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
