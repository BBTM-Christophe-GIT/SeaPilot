-- New project documents are written to SeaPilot's private Supabase Storage.
-- Existing SharePoint rows remain readable as historical provenance only.

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

  if target_document_type not in ('offer', 'bimco_supplytime', 'towage_contract', 'operation_attachment')
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
        and occurrence.project_id = target_project_id
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

revoke all on function public.projects_register_generated_storage_document(
  bigint, bigint, text, integer, text, text, text, text, bigint, text
) from public, anon, authenticated;
grant execute on function public.projects_register_generated_storage_document(
  bigint, bigint, text, integer, text, text, text, text, bigint, text
) to authenticated;

drop policy if exists project_files_storage_read on storage.objects;
create policy project_files_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'project-files'
    and (
      exists (
        select 1
        from public.project_billing_documents document
        where document.bucket_name = storage.objects.bucket_id
          and document.object_path = storage.objects.name
          and public.user_belongs_to_company(document.company_id)
      )
      or exists (
        select 1
        from public.project_generated_documents document
        where document.storage_bucket = storage.objects.bucket_id
          and document.storage_path = storage.objects.name
          and public.user_belongs_to_company(document.company_id)
      )
      or exists (
        select 1
        from public.contract_documents document
        where document.storage_bucket = storage.objects.bucket_id
          and document.storage_path = storage.objects.name
          and public.user_belongs_to_company(document.company_id)
      )
    )
  );

comment on table public.project_generated_documents is
  'Immutable project-document metadata. New files use private Supabase Storage; SharePoint columns identify historical rows only.';
comment on function public.projects_register_generated_storage_document(
  bigint, bigint, text, integer, text, text, text, text, bigint, text
) is
  'Registers a generated document or operation attachment already uploaded to private SeaPilot Supabase Storage.';
