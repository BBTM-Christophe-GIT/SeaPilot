-- Additive storage routing: existing document rows, URLs, files and audit events are untouched.
create table public.project_drive_files (
  id bigint generated always as identity primary key,
  project_id bigint not null references public.projects(id),
  company_id bigint not null references public.companies(id),
  source_bucket text not null check (source_bucket in ('project-files','sharepoint')),
  source_path text not null,
  path text not null unique,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  bytes bigint not null check (bytes > 0 and bytes <= 52428800),
  mime_type text not null,
  drive_file_id text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (source_bucket, source_path),
  check (path like 'Projet-' || project_id::text || '/%'),
  check (path !~ '(^|/)[.][.]?(/|$)' and path !~ '[\\\\:<>"|?*]' and length(path) < 500)
);
create index project_drive_files_project_idx on public.project_drive_files(project_id);
create index project_drive_files_company_idx on public.project_drive_files(company_id);
alter table public.project_drive_files enable row level security;
-- Each original table retains its own grants and RLS. A caller without SELECT
-- on one source must still be able to read another source that it can access.
create function public.projects_can_read_drive_file(target_company bigint,target_bucket text,target_path text)
returns boolean language plpgsql stable security invoker set search_path='' as $$
begin
  if not public.user_belongs_to_company(target_company) then return false; end if;
  if public.has_any_role(array['admin','direction']) then return true; end if;
  begin
    if exists(select 1 from public.project_generated_documents d where d.storage_bucket=target_bucket and d.storage_path=target_path) then return true; end if;
  exception when insufficient_privilege then null; end;
  begin
    if exists(select 1 from public.contract_documents d where (d.storage_bucket=target_bucket and d.storage_path=target_path) or (target_bucket='sharepoint' and d.file_url=target_path)) then return true; end if;
  exception when insufficient_privilege then null; end;
  begin
    if exists(select 1 from public.project_billing_documents d where d.bucket_name=target_bucket and d.object_path=target_path) then return true; end if;
  exception when insufficient_privilege then null; end;
  return false;
end;
$$;
revoke all on function public.projects_can_read_drive_file(bigint,text,text) from public,anon;
grant execute on function public.projects_can_read_drive_file(bigint,text,text) to authenticated;
create policy project_drive_files_read on public.project_drive_files for select to authenticated using (
  public.projects_can_read_drive_file(company_id,source_bucket,source_path)
);
create policy project_drive_files_insert on public.project_drive_files for insert to authenticated with check (
  public.has_any_role(array['admin','direction']) and public.user_belongs_to_company(company_id)
  and created_by=auth.uid() and exists (select 1 from public.projects p where p.id=project_id and p.company_id=project_drive_files.company_id and p.archived_at is null)
  and source_path like 'projects/' || project_id::text || '/%'
);
revoke all on public.project_drive_files from public, anon, authenticated;
revoke all on sequence public.project_drive_files_id_seq from public, anon, authenticated;
grant select, insert on public.project_drive_files to authenticated;
grant usage, select on sequence public.project_drive_files_id_seq to authenticated;

create function public.projects_drive_scope(target_project bigint default null, target_path text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare document public.project_drive_files%rowtype;
begin
  if target_path is not null then
    select * into document from public.project_drive_files where path=target_path;
    if not found then raise exception 'Document inaccessible' using errcode='42501'; end if;
    return jsonb_build_object('directory','Projet','path',document.path,'bytes',document.bytes,'sha256',document.sha256);
  end if;
  if not public.has_any_role(array['admin','direction']) or not exists (select 1 from public.projects p where p.id=target_project and p.archived_at is null) then
    raise exception 'Projet inaccessible' using errcode='42501';
  end if;
  return jsonb_build_object('directory','Projet','folder','Projet-' || target_project::text);
end;
$$;
revoke all on function public.projects_drive_scope(bigint,text) from public,anon;
grant execute on function public.projects_drive_scope(bigint,text) to authenticated;

create table public.project_billing_client_references (
  id bigint generated always as identity primary key,
  project_id bigint not null references public.projects(id),
  company_id bigint not null references public.companies(id),
  scope smallint not null check(scope between 0 and 7),
  reference text not null check(length(btrim(reference)) between 1 and 200),
  updated_at timestamptz not null default now(),
  unique(project_id,scope)
);
create index project_billing_client_references_company_idx on public.project_billing_client_references(company_id);
alter table public.project_billing_client_references enable row level security;
create policy project_billing_client_references_read on public.project_billing_client_references for select to authenticated using (
  public.user_belongs_to_company(company_id) and exists(select 1 from public.projects p where p.id=project_id and p.company_id=project_billing_client_references.company_id)
);
create policy project_billing_client_references_write on public.project_billing_client_references for all to authenticated using (
  public.user_belongs_to_company(company_id) and public.has_any_role(array['admin','direction'])
) with check (
  public.user_belongs_to_company(company_id) and public.has_any_role(array['admin','direction'])
  and exists(select 1 from public.projects p where p.id=project_id and p.company_id=project_billing_client_references.company_id)
);
revoke all on public.project_billing_client_references from public, anon, authenticated;
revoke all on sequence public.project_billing_client_references_id_seq from public, anon, authenticated;
grant select,insert,update on public.project_billing_client_references to authenticated;
grant usage,select on sequence public.project_billing_client_references_id_seq to authenticated;
create function public.projects_save_billing_reference(target_project bigint,target_scope integer,target_reference text)
returns void language sql security invoker set search_path='' as $$
  insert into public.project_billing_client_references(project_id,company_id,scope,reference)
  select id,company_id,target_scope,btrim(target_reference) from public.projects where id=target_project
  on conflict(project_id,scope) do update set reference=excluded.reference,updated_at=now();
$$;
revoke all on function public.projects_save_billing_reference(bigint,integer,text) from public,anon;
grant execute on function public.projects_save_billing_reference(bigint,integer,text) to authenticated;

create or replace function public.projects_register_generated_storage_document(
  target_project_id bigint,
  target_planning_occurrence_id bigint,
  target_document_type text,
  target_revision integer,
  target_bucket text,
  target_path text,
  target_file_name text,
  target_mime_type text,
  target_file_size_bytes bigint,
  target_sha256 text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  registered_document_id bigint;
begin
  if target_company_id is null
     or not public.user_belongs_to_company(target_company_id)
     or not public.has_any_role(array['admin', 'direction']) then
    raise exception 'Insufficient permission to register generated project documents' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.projects project
    where project.id = target_project_id
      and project.company_id = target_company_id
      and project.archived_at is null
  ) then
    raise exception 'Project not found in the active company' using errcode = '22023';
  end if;

  if target_document_type not in ('offer', 'bimco_supplytime', 'towage_contract', 'bareboat_charter', 'operation_attachment')
     or target_revision < 1
     or target_bucket <> 'project-files'
     or nullif(btrim(target_path), '') is null
     or target_path not like 'projects/' || target_project_id::text || '/%'
     or nullif(btrim(target_file_name), '') is null
     or nullif(btrim(target_mime_type), '') is null
     or target_file_size_bytes <= 0
     or target_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid generated project document metadata' using errcode = '22023';
  end if;

  if target_document_type = 'operation_attachment' then
    if target_planning_occurrence_id is null or not exists (
      select 1
      from public.planning_projects occurrence
      where occurrence.id = target_planning_occurrence_id
        and occurrence.catalog_project_id = target_project_id
        and occurrence.company_id = target_company_id
    ) then
      raise exception 'Operation attachment requires an occurrence belonging to the project' using errcode = '22023';
    end if;
  end if;

  if not exists (
    select 1
    from storage.objects object
    where object.bucket_id = target_bucket
      and object.name = target_path
  ) and not exists (
    select 1 from public.project_drive_files drive
    where drive.source_bucket=target_bucket and drive.source_path=target_path
      and drive.project_id=target_project_id and drive.company_id=target_company_id
      and drive.sha256=target_sha256 and drive.bytes=target_file_size_bytes
  ) then
    raise exception 'Uploaded project document was not found in Storage' using errcode = '22023';
  end if;

  insert into public.project_generated_documents (
    company_id,
    project_id,
    planning_occurrence_id,
    document_type,
    revision,
    file_name,
    mime_type,
    file_size_bytes,
    sha256,
    sharepoint_drive_id,
    sharepoint_drive_item_id,
    sharepoint_web_url,
    sharepoint_folder_path,
    storage_bucket,
    storage_path,
    created_by
  ) values (
    target_company_id,
    target_project_id,
    target_planning_occurrence_id,
    target_document_type,
    target_revision,
    btrim(target_file_name),
    btrim(target_mime_type),
    target_file_size_bytes,
    target_sha256,
    null,
    null,
    null,
    null,
    target_bucket,
    target_path,
    auth.uid()
  )
  returning id into registered_document_id;

  return registered_document_id;
end;
$$;

create or replace function public.projects_register_storage_attachment(
  target_project_id bigint,
  target_bucket text,
  target_path text,
  target_file_name text,
  target_mime_type text,
  target_file_size_bytes bigint,
  target_sha256 text,
  target_category_key text,
  target_subcategory_key text default null,
  target_expires_on date default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  registered_document_id bigint;
begin
  if target_company_id is null
     or not public.user_belongs_to_company(target_company_id)
     or not public.has_any_role(array['admin', 'direction']) then
    raise exception 'Insufficient permission to register project attachments' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.projects project
    where project.id = target_project_id
      and project.company_id = target_company_id
      and project.archived_at is null
  ) then
    raise exception 'Project not found in the active company' using errcode = '22023';
  end if;

  if target_bucket <> 'project-files'
     or nullif(btrim(target_path), '') is null
     or target_path not like 'projects/' || target_project_id::text || '/attachments/%'
     or nullif(btrim(target_file_name), '') is null
     or nullif(btrim(target_mime_type), '') is null
     or target_file_size_bytes <= 0
     or target_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid project attachment metadata' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.project_document_categories category
    where category.company_id = target_company_id
      and category.category_key = target_category_key
      and category.parent_key is null
      and category.active
  ) then
    raise exception 'Invalid or inactive project attachment category' using errcode = '22023';
  end if;

  if target_subcategory_key is not null and not exists (
    select 1
    from public.project_document_categories subcategory
    where subcategory.company_id = target_company_id
      and subcategory.category_key = target_subcategory_key
      and subcategory.parent_key = target_category_key
      and subcategory.active
  ) then
    raise exception 'Invalid or inactive project attachment subcategory' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from storage.objects object
    where object.bucket_id = target_bucket
      and object.name = target_path
  ) and not exists (
    select 1 from public.project_drive_files drive
    where drive.source_bucket=target_bucket and drive.source_path=target_path
      and drive.project_id=target_project_id and drive.company_id=target_company_id
      and drive.sha256=target_sha256 and drive.bytes=target_file_size_bytes
  ) then
    raise exception 'Uploaded project attachment was not found in Storage' using errcode = '22023';
  end if;

  insert into public.project_generated_documents (
    company_id,
    project_id,
    planning_occurrence_id,
    document_type,
    revision,
    file_name,
    mime_type,
    file_size_bytes,
    sha256,
    sharepoint_drive_id,
    sharepoint_drive_item_id,
    sharepoint_web_url,
    sharepoint_folder_path,
    storage_bucket,
    storage_path,
    category_key,
    subcategory_key,
    expires_on,
    created_by
  ) values (
    target_company_id,
    target_project_id,
    null,
    'project_attachment',
    1,
    btrim(target_file_name),
    btrim(target_mime_type),
    target_file_size_bytes,
    target_sha256,
    null,
    null,
    null,
    null,
    target_bucket,
    target_path,
    target_category_key,
    target_subcategory_key,
    target_expires_on,
    auth.uid()
  )
  returning id into registered_document_id;

  return registered_document_id;
end;
$$;
