-- Keep the Planning project picker ordered by the numeric part of the
-- project code, independently from prefixes such as P or SP.

create or replace function public.planning_project_catalog()
returns table (
  id bigint,
  project_code text,
  title text,
  client_name text,
  status text,
  description text,
  starts_on date,
  ends_on date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
begin
  if target_company_id is null
     or not public.user_belongs_to_company(target_company_id)
     or not public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin']) then
    raise exception 'Insufficient permission to read project catalog' using errcode = '42501';
  end if;

  return query
  select
    project.id,
    project.project_code,
    project.title,
    project.client_name,
    project.status,
    project.description,
    project.starts_on,
    project.ends_on
  from public.projects project
  where project.company_id = target_company_id
    and project.archived_at is null
  order by
    case
      when project.project_code ~ '\d'
        then substring(project.project_code from '\d+')::numeric
      else null
    end desc nulls last,
    project.project_code desc nulls last,
    project.title;
end;
$$;

revoke all on function public.planning_project_catalog() from public, anon, authenticated;
grant execute on function public.planning_project_catalog() to authenticated;

comment on function public.planning_project_catalog() is
  'Read-only project catalog used by the Planning vessel-cell picker, ordered by descending numeric project code. Commercial and contractual fields remain excluded.';
