-- Register physical folder names separately from immutable document source addresses.
-- Existing folders keep their current names until a verified Drive rename is activated.
create function public.projects_drive_folder_label(project_code text, project_title text, project_id bigint)
returns text language sql immutable security invoker set search_path='' as $$
  with label as (select rtrim(left(regexp_replace(replace(
    coalesce(nullif(btrim(project_code),''),'P'||project_id::text) || ' – ' ||
    coalesce(nullif(btrim(project_title),''),'Projet sans titre'), '=>', '→'),
    '[\\/:<>"|?*[:cntrl:]]','-','g'),160),'. ') as name)
  select case when name ~* '^(con|prn|aux|nul|com[1-9]|lpt[1-9])([.]|$)'
    then 'P'||project_id::text||' – '||left(name,135) else name end from label;
$$;
revoke all on function public.projects_drive_folder_label(text,text,bigint) from public,anon;
grant execute on function public.projects_drive_folder_label(text,text,bigint) to authenticated,service_role;

create table public.project_drive_folders (
  project_id bigint primary key references public.projects(id),
  company_id bigint not null references public.companies(id),
  folder_name text not null check(length(folder_name) between 1 and 200
    and folder_name !~ '[\\/:<>"|?*[:cntrl:]]' and folder_name !~ '[. ]$'
    and folder_name !~* '^(con|prn|aux|nul|com[1-9]|lpt[1-9])([.]|$)'),
  created_at timestamptz not null default now()
);
create unique index project_drive_folders_name_idx on public.project_drive_folders(lower(folder_name));
create index project_drive_folders_company_idx on public.project_drive_folders(company_id);
insert into public.project_drive_folders(project_id,company_id,folder_name)
select id,company_id,'Projet-'||id::text from public.projects;
alter table public.project_drive_folders enable row level security;
create policy project_drive_folders_read on public.project_drive_folders for select to authenticated using (
  public.has_any_role(array['admin','direction']) and public.user_belongs_to_company(company_id)
);
create policy project_drive_folders_insert on public.project_drive_folders for insert to authenticated with check (
  public.has_any_role(array['admin','direction']) and public.user_belongs_to_company(company_id)
  and exists(select 1 from public.projects p where p.id=project_id and p.company_id=project_drive_folders.company_id
    and p.archived_at is null and folder_name in (
      public.projects_drive_folder_label(p.project_code,p.title,p.id),
      public.projects_drive_folder_label(p.project_code,p.title,p.id)||' ['||p.id::text||']'))
);
revoke all on public.project_drive_folders from public,anon,authenticated;
grant select,insert on public.project_drive_folders to authenticated;
grant all on public.project_drive_folders to service_role;

alter table public.project_drive_files drop constraint project_drive_files_check;
create function public.projects_check_drive_folder()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.project_drive_folders f where f.project_id=new.project_id
    and f.company_id=new.company_id and f.folder_name=split_part(new.path,'/',1)) then
    raise exception 'Dossier Google Drive incompatible avec le projet' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function public.projects_check_drive_folder() from public,anon,authenticated;
create trigger project_drive_files_folder_check before insert or update of path,project_id,company_id
on public.project_drive_files for each row execute function public.projects_check_drive_folder();

create or replace function public.projects_drive_scope(target_project bigint default null,target_path text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare document public.project_drive_files%rowtype;
  project public.projects%rowtype;
  folder text;
begin
  if target_path is not null then
    select * into document from public.project_drive_files where path=target_path;
    if not found then raise exception 'Document inaccessible' using errcode='42501'; end if;
    return jsonb_build_object('directory','Projet','path',document.path,'bytes',document.bytes,'sha256',document.sha256);
  end if;
  select * into project from public.projects where id=target_project and archived_at is null;
  if not found or not public.has_any_role(array['admin','direction'])
    or not public.user_belongs_to_company(project.company_id) then
    raise exception 'Projet inaccessible' using errcode='42501';
  end if;
  select folder_name into folder from public.project_drive_folders where project_id=target_project;
  if not found then
    folder := public.projects_drive_folder_label(project.project_code,project.title,project.id);
    begin
      insert into public.project_drive_folders(project_id,company_id,folder_name)
      values(project.id,project.company_id,folder) on conflict(project_id) do nothing;
    exception when unique_violation then
      insert into public.project_drive_folders(project_id,company_id,folder_name)
      values(project.id,project.company_id,folder||' ['||project.id::text||']') on conflict(project_id) do nothing;
    end;
    select folder_name into folder from public.project_drive_folders where project_id=target_project;
  end if;
  return jsonb_build_object('directory','Projet','folder',folder,'company_id',project.company_id);
end;
$$;
comment on table public.project_drive_folders is 'Stable physical Drive folder per project. Renames require a verified cloud rename and atomic receipt-path update; business history is unchanged.';
