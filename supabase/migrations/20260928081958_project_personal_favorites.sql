-- Personal preferences only: no project, document or audit row is modified.
create table public.project_favorites (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id bigint not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,project_id)
);
create index project_favorites_project_idx on public.project_favorites(project_id);
alter table public.project_favorites enable row level security;
create policy project_favorites_own on public.project_favorites for all to authenticated
using (user_id=(select auth.uid()) and exists (
  select 1 from public.projects p where p.id=project_id and public.user_belongs_to_company(p.company_id)
)) with check (user_id=(select auth.uid()) and exists (
  select 1 from public.projects p where p.id=project_id and public.user_belongs_to_company(p.company_id)
));
revoke all on public.project_favorites from public,anon,authenticated;
grant select,insert,delete on public.project_favorites to authenticated;
grant all on public.project_favorites to service_role;

create function public.projects_set_favorite(target_project bigint, favorite boolean)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null or favorite is null or not exists (
    select 1 from public.projects p where p.id=target_project and public.user_belongs_to_company(p.company_id)
  ) then raise exception 'Projet inaccessible' using errcode='42501'; end if;
  if favorite then
    insert into public.project_favorites(user_id,project_id) values(auth.uid(),target_project)
    on conflict(user_id,project_id) do nothing;
  else
    delete from public.project_favorites where user_id=auth.uid() and project_id=target_project;
  end if;
  return favorite;
end;
$$;
revoke all on function public.projects_set_favorite(bigint,boolean) from public,anon;
grant execute on function public.projects_set_favorite(bigint,boolean) to authenticated;
