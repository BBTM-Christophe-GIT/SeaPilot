alter table public.hr_documents
  add column if not exists medical_restriction text,
  add column if not exists medical_bridge_watch boolean,
  add column if not exists medical_unfit boolean,
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists file_size_bytes bigint,
  add column if not exists mime_type text,
  add column if not exists renewed_at timestamptz;

create index if not exists hr_documents_storage_object_idx
  on public.hr_documents (storage_bucket, storage_path);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hr-documents', 'hr-documents', false, 52428800, null)
on conflict (id) do update
set public = false,
    file_size_limit = 52428800,
    allowed_mime_types = null;

drop policy if exists hr_documents_storage_read on storage.objects;
create policy hr_documents_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'hr-documents'
    and (
      public.has_any_role(array['admin', 'direction', 'armement'])
      or exists (
        select 1
        from public.hr_documents document
        join public.people person
          on person.id = document.person_id
        where document.storage_bucket = storage.objects.bucket_id
          and document.storage_path = storage.objects.name
          and person.user_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.hr_documents document
        where document.storage_bucket = storage.objects.bucket_id
          and document.storage_path = storage.objects.name
          and public.is_captain_for_person(document.person_id)
      )
    )
  );

drop policy if exists hr_documents_storage_insert on storage.objects;
create policy hr_documents_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'hr-documents'
    and public.has_any_role(array['admin', 'direction', 'armement'])
  );

drop policy if exists hr_documents_storage_update on storage.objects;
create policy hr_documents_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'hr-documents'
    and public.has_any_role(array['admin', 'direction', 'armement'])
  )
  with check (
    bucket_id = 'hr-documents'
    and public.has_any_role(array['admin', 'direction', 'armement'])
  );

drop policy if exists hr_documents_storage_delete on storage.objects;
create policy hr_documents_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'hr-documents'
    and public.has_any_role(array['admin', 'direction', 'armement'])
  );

insert into public.sharepoint_field_mappings (
  source_key,
  field_label,
  internal_name,
  data_type,
  target_table,
  target_column,
  required,
  notes
)
values
  ('library-brevets-visites-medicales', 'Restriction Medicale', 'RestrictionM_x00e9_dicale', 'Text', 'hr_documents', 'medical_restriction', false, null),
  ('library-brevets-visites-medicales', 'Veille Passerelle', 'VeillePasserelle', 'Boolean', 'hr_documents', 'medical_bridge_watch', false, null),
  ('library-brevets-visites-medicales', 'Inapte Navigation', 'InapteNavigation', 'Boolean', 'hr_documents', 'medical_unfit', false, null),
  ('library-brevets-visites-medicales', 'Taille fichier', 'FileSizeDisplay/File_x0020_Size', 'Number', 'hr_documents', 'file_size_bytes', false, null)
on conflict do nothing;
