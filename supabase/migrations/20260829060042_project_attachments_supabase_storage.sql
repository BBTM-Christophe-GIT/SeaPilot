-- Store categorized project attachments in private Supabase Storage while
-- preserving the existing SharePoint-backed generated-document history.

insert into public.project_document_categories (
  company_id,
  category_key,
  parent_key,
  label,
  display_order
)
select
  company.id,
  'toilette_de_mer',
  null,
  'Toilette de Mer',
  40
from public.companies company
on conflict (company_id, category_key) do update
set parent_key = excluded.parent_key,
    label = excluded.label,
    display_order = excluded.display_order,
    active = true,
    updated_at = now();

insert into public.project_document_categories (
  company_id,
  category_key,
  parent_key,
  label,
  display_order
)
select
  company.id,
  'toilette_de_mer_attestation_expert_bv',
  'toilette_de_mer',
  'Attestation Expert/BV',
  41
from public.companies company
on conflict (company_id, category_key) do update
set parent_key = excluded.parent_key,
    label = excluded.label,
    display_order = excluded.display_order,
    active = true,
    updated_at = now();

alter table public.project_generated_documents
  add column if not exists storage_bucket text,
  add column if not exists storage_path text;

alter table public.project_generated_documents
  alter column sharepoint_drive_id drop not null,
  alter column sharepoint_drive_item_id drop not null,
  alter column sharepoint_web_url drop not null,
  alter column sharepoint_folder_path drop not null;

alter table public.project_generated_documents
  drop constraint if exists project_generated_documents_storage_provider_check;

alter table public.project_generated_documents
  add constraint project_generated_documents_storage_provider_check check (
    (
      storage_bucket is not null
      and storage_path is not null
      and sharepoint_drive_id is null
      and sharepoint_drive_item_id is null
      and sharepoint_web_url is null
      and sharepoint_folder_path is null
    )
    or
    (
      storage_bucket is null
      and storage_path is null
      and sharepoint_drive_id is not null
      and sharepoint_drive_item_id is not null
      and sharepoint_web_url is not null
      and sharepoint_folder_path is not null
    )
  );

create unique index if not exists project_generated_documents_storage_object_key
  on public.project_generated_documents (storage_bucket, storage_path)
  where storage_bucket is not null and storage_path is not null;

update storage.buckets
set public = false,
    file_size_limit = 52428800,
    allowed_mime_types = array[
      'application/octet-stream',
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/zip',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'text/plain'
    ]
where id = 'project-files';

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

revoke all on function public.projects_register_storage_attachment(
  bigint, text, text, text, text, bigint, text, text, text, date
) from public, anon, authenticated;
grant execute on function public.projects_register_storage_attachment(
  bigint, text, text, text, text, bigint, text, text, text, date
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
          and document.document_type = 'project_attachment'
          and public.user_belongs_to_company(document.company_id)
      )
    )
  );

drop policy if exists project_files_storage_delete on storage.objects;
create policy project_files_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'project-files'
    and public.has_any_role(array['admin', 'direction'])
    and exists (
      select 1
      from public.projects project
      where project.id = case
        when (storage.foldername(storage.objects.name))[2] ~ '^[0-9]+$'
          then (storage.foldername(storage.objects.name))[2]::bigint
        else null
      end
        and public.user_belongs_to_company(project.company_id)
    )
    and (
      exists (
        select 1
        from public.project_billing_documents document
        where document.bucket_name = storage.objects.bucket_id
          and document.object_path = storage.objects.name
      )
      or exists (
        select 1
        from public.project_generated_documents document
        where document.storage_bucket = storage.objects.bucket_id
          and document.storage_path = storage.objects.name
      )
      or (
        storage.objects.owner_id = auth.uid()::text
        and not exists (
          select 1
          from public.project_billing_documents document
          where document.bucket_name = storage.objects.bucket_id
            and document.object_path = storage.objects.name
        )
        and not exists (
          select 1
          from public.project_generated_documents document
          where document.storage_bucket = storage.objects.bucket_id
            and document.storage_path = storage.objects.name
        )
      )
    )
  );

comment on column public.project_generated_documents.storage_bucket is
  'Private Supabase Storage bucket for categorized project attachments. NULL for legacy SharePoint documents.';
comment on column public.project_generated_documents.storage_path is
  'Private Supabase Storage object path for categorized project attachments. NULL for legacy SharePoint documents.';
comment on function public.projects_register_storage_attachment(
  bigint, text, text, text, text, bigint, text, text, text, date
) is
  'Registers one already-uploaded private project attachment after validating company, project, category and Storage path.';
