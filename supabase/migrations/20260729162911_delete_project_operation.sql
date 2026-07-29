create or replace function public.projects_delete_planning_occurrence(
  target_occurrence_id bigint,
  target_project_id bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  deleted_occurrence_id bigint;
begin
  if target_company_id is null
     or not public.user_belongs_to_company(target_company_id)
     or not public.has_any_role(array['admin', 'direction']) then
    raise exception 'Insufficient permission to delete a project operation' using errcode = '42501';
  end if;

  if target_occurrence_id is null or target_occurrence_id <= 0
     or target_project_id is null or target_project_id <= 0 then
    raise exception 'A valid project operation and catalog project are required' using errcode = '22023';
  end if;

  delete from public.planning_projects occurrence
  where occurrence.id = target_occurrence_id
    and occurrence.company_id = target_company_id
    and occurrence.catalog_project_id = target_project_id
  returning occurrence.id into deleted_occurrence_id;

  if deleted_occurrence_id is null then
    raise exception 'Project operation not found' using errcode = 'P0002';
  end if;

  return deleted_occurrence_id;
end;
$$;

revoke all on function public.projects_delete_planning_occurrence(bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.projects_delete_planning_occurrence(bigint, bigint)
  to authenticated;

comment on function public.projects_delete_planning_occurrence(bigint, bigint) is
  'Deletes one Planning occurrence linked to a catalog project. Existing generated-document metadata keeps its project link and clears only the occurrence link through ON DELETE SET NULL.';
