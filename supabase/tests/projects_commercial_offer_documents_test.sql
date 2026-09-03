begin;

select plan(20);

select has_table(
  'public',
  'project_document_categories',
  'editable project document categories are stored'
);
select has_column(
  'public',
  'project_generated_documents',
  'category_key',
  'project attachments have a category'
);
select has_column(
  'public',
  'project_generated_documents',
  'subcategory_key',
  'project attachments may have a subcategory'
);
select has_column(
  'public',
  'project_generated_documents',
  'expires_on',
  'project attachments may have a validity end date'
);
select has_column(
  'public',
  'project_generated_documents',
  'storage_bucket',
  'project attachments record their private Storage bucket'
);
select has_column(
  'public',
  'project_generated_documents',
  'storage_path',
  'project attachments record their private Storage path'
);
select has_function(
  'public',
  'projects_save_document_categories',
  array['jsonb'],
  'document categories are changed through one guarded RPC'
);
select has_function(
  'public',
  'projects_register_storage_attachment',
  array['bigint', 'text', 'text', 'text', 'text', 'bigint', 'text', 'text', 'text', 'date'],
  'private project attachments are registered through one guarded RPC'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.project_document_categories'::regclass),
  'RLS is enabled on project document categories'
);
select ok(
  has_table_privilege('authenticated', 'public.project_document_categories', 'SELECT'),
  'authenticated users may read their company document categories'
);
select ok(
  not has_table_privilege('authenticated', 'public.project_document_categories', 'INSERT'),
  'authenticated users cannot bypass the category RPC'
);
select ok(
  not has_table_privilege('anon', 'public.project_document_categories', 'SELECT'),
  'anonymous users cannot read document categories'
);
select ok(
  not has_table_privilege('authenticated', 'public.project_generated_documents', 'INSERT'),
  'authenticated users cannot bypass the attachment registration RPC'
);
select is(
  (select public from storage.buckets where id = 'project-files'),
  false,
  'the shared project-files bucket remains private'
);
select matches(
  (
    select qual
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_files_storage_read'
  ),
  'project_generated_documents',
  'private Storage reads include registered project attachments'
);
select is(
  (
    select count(*)
    from public.project_document_categories category
    join public.companies company on company.id = category.company_id
    where company.code = 'bbtm'
      and category.parent_key is null
      and category.active
  ),
  4::bigint,
  'the four requested root categories are seeded'
);
select is(
  (
    select count(*)
    from public.project_document_categories category
    join public.companies company on company.id = category.company_id
    where company.code = 'bbtm'
      and category.parent_key is not null
      and category.active
  ),
  7::bigint,
  'the requested document subcategories are seeded'
);
select is(
  (
    select count(*)
    from public.project_document_categories category
    join public.companies company on company.id = category.company_id
    where company.code = 'bbtm'
      and category.category_key = 'toilette_de_mer_attestation_expert_bv'
      and category.parent_key = 'toilette_de_mer'
      and category.label = 'Attestation Expert/BV'
      and category.active
  ),
  1::bigint,
  'Attestation Expert/BV is active below Toilette de Mer'
);
select matches(
  pg_get_constraintdef(
    (
      select oid
      from pg_constraint
      where conname = 'project_generated_documents_type_check'
        and conrelid = 'public.project_generated_documents'::regclass
    )
  ),
  'project_attachment',
  'project attachments are accepted by the document registry'
);
select matches(
  pg_get_constraintdef(
    (
      select oid
      from pg_constraint
      where conname = 'project_generated_documents_storage_provider_check'
        and conrelid = 'public.project_generated_documents'::regclass
    )
  ),
  'storage_bucket',
  'each registry row identifies either Supabase Storage or SharePoint'
);

select * from finish();
rollback;
