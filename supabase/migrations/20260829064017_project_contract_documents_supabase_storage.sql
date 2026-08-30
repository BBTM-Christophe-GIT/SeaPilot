-- Keep historical SharePoint provenance while serving migrated contractual
-- documents from the private Supabase project-files bucket.

alter table public.contract_documents
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists storage_sha256 text,
  add column if not exists storage_migrated_at timestamptz;

alter table public.contract_documents
  drop constraint if exists contract_documents_storage_location_check;

alter table public.contract_documents
  add constraint contract_documents_storage_location_check check (
    (
      storage_bucket is null
      and storage_path is null
      and storage_sha256 is null
      and storage_migrated_at is null
    )
    or
    (
      storage_bucket = 'project-files'
      and nullif(btrim(storage_path), '') is not null
      and storage_sha256 ~ '^[a-f0-9]{64}$'
      and storage_migrated_at is not null
    )
  );

create unique index if not exists contract_documents_storage_object_key
  on public.contract_documents (storage_bucket, storage_path)
  where storage_bucket is not null and storage_path is not null;

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
      or exists (
        select 1
        from public.contract_documents document
        where document.storage_bucket = storage.objects.bucket_id
          and document.storage_path = storage.objects.name
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
      or exists (
        select 1
        from public.contract_documents document
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
        and not exists (
          select 1
          from public.contract_documents document
          where document.storage_bucket = storage.objects.bucket_id
            and document.storage_path = storage.objects.name
        )
      )
    )
  );

comment on column public.contract_documents.storage_bucket is
  'Private Supabase Storage bucket containing the migrated contractual file. SharePoint provenance is retained.';
comment on column public.contract_documents.storage_path is
  'Private Supabase Storage object path containing the migrated contractual file.';
comment on column public.contract_documents.storage_sha256 is
  'Lowercase SHA-256 checksum of the migrated Supabase Storage object.';
comment on column public.contract_documents.storage_migrated_at is
  'Timestamp when the historical SharePoint file was copied into Supabase Storage.';
