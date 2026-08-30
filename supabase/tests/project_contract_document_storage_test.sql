begin;

select plan(8);

select has_column(
  'public',
  'contract_documents',
  'storage_bucket',
  'contract documents record their private Storage bucket'
);
select has_column(
  'public',
  'contract_documents',
  'storage_path',
  'contract documents record their private Storage path'
);
select has_column(
  'public',
  'contract_documents',
  'storage_sha256',
  'contract documents record the migrated file checksum'
);
select has_column(
  'public',
  'contract_documents',
  'storage_migrated_at',
  'contract documents record their migration timestamp'
);
select matches(
  pg_get_constraintdef(
    (
      select oid
      from pg_constraint
      where conname = 'contract_documents_storage_location_check'
        and conrelid = 'public.contract_documents'::regclass
    )
  ),
  'storage_sha256',
  'partial Storage metadata cannot be saved'
);
select has_index(
  'public',
  'contract_documents',
  'contract_documents_storage_object_key',
  'one Storage object can only belong to one contract document'
);
select matches(
  (
    select qual
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_files_storage_read'
  ),
  'contract_documents',
  'private Storage reads include migrated contract documents'
);
select matches(
  (
    select qual
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_files_storage_delete'
  ),
  'contract_documents',
  'private Storage deletes recognize migrated contract documents'
);

select * from finish();
rollback;
