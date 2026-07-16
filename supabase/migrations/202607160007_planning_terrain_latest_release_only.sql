-- Terrain roles must only receive metadata for the latest global release.
-- Office roles keep the complete immutable release history.

create or replace function public.planning_release_history()
returns table (
  id bigint,
  publication_id bigint,
  version_number integer,
  comment text,
  created_at timestamptz,
  created_by uuid,
  created_by_name text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  office_role boolean := public.has_any_role(array['admin', 'direction', 'armement']);
begin
  if target_company_id is null
    or not public.user_belongs_to_company(target_company_id)
    or not public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin']) then
    raise exception using
      errcode = '42501',
      message = 'PLANNING_PERMISSION_DENIED: historique des diffusions.';
  end if;

  return query
  select
    release.id,
    release.id,
    release.version_number,
    ''::text,
    release.published_at,
    release.published_by,
    release.published_by_name
  from public.planning_releases release
  where release.company_id = target_company_id
    and (
      office_role
      or release.version_number = (
        select max(latest_release.version_number)
        from public.planning_releases latest_release
        where latest_release.company_id = target_company_id
      )
    )
  order by release.version_number desc;
end;
$$;

revoke execute on function public.planning_release_history() from public, anon;
grant execute on function public.planning_release_history() to authenticated;
