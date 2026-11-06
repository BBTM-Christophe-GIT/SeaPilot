-- Match the positions copied into a fiche even when their coordinate notation
-- differs. Only icon values and existing operation point IDs leave the server.
create or replace function sea_operation_private.match_project_point_icons(p_operation_points jsonb,p_project_points jsonb) returns jsonb
language sql immutable set search_path='' as $$
  with operation_points as materialized (
    select point->>'id' as id,
      round(sea_operation_private.capture_coordinate(point->>'latitude','latitude'),6) as latitude,
      round(sea_operation_private.capture_coordinate(point->>'longitude','longitude'),6) as longitude
    from jsonb_array_elements(p_operation_points) point
  ), project_points as materialized (
    select point->>'isolatedPointIcon' as icon,
      round(sea_operation_private.capture_coordinate(point->>'latitude','latitude'),6) as latitude,
      round(sea_operation_private.capture_coordinate(point->>'longitude','longitude'),6) as longitude
    from jsonb_array_elements(p_project_points) point
  )
  select jsonb_object_agg(id,icon)
  from (
    select operation.id,min(project.icon) as icon
    from operation_points operation
    join project_points project using(latitude,longitude)
    where operation.id is not null
    group by operation.id
    having count(distinct coalesce(project.icon,''))=1
  ) matches;
$$;
revoke all on function sea_operation_private.match_project_point_icons(jsonb,jsonb) from public,anon,authenticated,service_role;

-- Read the project link from the stored, company-scoped operation. Icons are
-- presentation metadata for the interactive map, including signed records.
create or replace function sea_operation_private.record_json(p_record public.sea_operations) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare administration sea_operation_private.record_administration; previous_id uuid; project_ports jsonb; project_point_icons jsonb;
begin
  if not coalesce(sea_operation_private.can_read(p_record.company_id),false) or sea_operation_private.record_is_deleted(p_record.id)
    or not exists(select 1 from public.sea_operations where id=p_record.id and company_id=p_record.company_id) then
    raise exception 'Opération inaccessible.' using errcode='42501'; end if;
  select * into administration from sea_operation_private.record_administration where operation_id=p_record.id;
  select operation_id into previous_id from sea_operation_private.record_administration where superseded_by_id=p_record.id;
  select case when operation.status='draft' and sea_operation_private.record_is_current(operation.id)
      then jsonb_build_object('projectId',project.id::text,'departurePort',coalesce(project.delivery_port,''),'arrivalPort',coalesce(project.redelivery_port,'')) end,
    case when jsonb_typeof(operation.draft#>'{locationOverlay,points}')='array'
      and jsonb_typeof(project.location_plan->'points')='array'
      and operation.draft#>'{locationOverlay,points}'<>'[]'::jsonb and project.location_plan->'points'<>'[]'::jsonb
      then sea_operation_private.match_project_point_icons(operation.draft#>'{locationOverlay,points}',project.location_plan->'points') end
    into project_ports,project_point_icons from public.sea_operations operation
    join public.projects project on project.id=sea_operation_private.preparation_id(operation.draft#>>'{planning,projectId}')
      and project.company_id=operation.company_id
    where operation.id=p_record.id and operation.company_id=p_record.company_id and project.archived_at is null;
  return to_jsonb(p_record)||jsonb_build_object('can_edit',sea_operation_private.can_edit(p_record),
    'can_sign',sea_operation_private.can_sign_record(p_record),
    'can_revise',p_record.status='signed' and sea_operation_private.record_is_current(p_record.id) and sea_operation_private.can_admin(p_record.company_id),
    'can_delete',sea_operation_private.record_is_current(p_record.id) and sea_operation_private.can_admin(p_record.company_id),
    'previous_revision_id',previous_id,'superseded_by_id',administration.superseded_by_id,'project_ports',project_ports)
    || case when project_point_icons is null then '{}'::jsonb else jsonb_build_object('project_point_icons',project_point_icons) end;
end;
$$;
