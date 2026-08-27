begin;

select plan(12);

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
select has_function(
  'public',
  'projects_save_document_categories',
  array['jsonb'],
  'document categories are changed through one guarded RPC'
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
select is(
  (
    select count(*)
    from public.project_document_categories category
    join public.companies company on company.id = category.company_id
    where company.code = 'bbtm'
      and category.parent_key is null
      and category.active
  ),
  3::bigint,
  'the three requested root categories are seeded'
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
  6::bigint,
  'the requested document subcategories are seeded'
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

select * from finish();
rollback;
