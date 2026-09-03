begin;

select plan(3);

select matches(
  pg_get_constraintdef(
    (
      select oid
      from pg_constraint
      where conname = 'project_generated_documents_type_check'
        and conrelid = 'public.project_generated_documents'::regclass
    )
  ),
  'bareboat_charter',
  'bareboat charter PDFs are accepted by the generated document registry'
);

select matches(
  pg_get_functiondef(
    'public.projects_register_generated_storage_document(bigint,bigint,text,integer,text,text,text,text,bigint,text)'::regprocedure
  ),
  'bareboat_charter',
  'the guarded generated-document RPC accepts bareboat charter PDFs'
);

select ok(
  not has_table_privilege('authenticated', 'public.project_generated_documents', 'INSERT'),
  'authenticated users still cannot bypass the guarded registration RPC'
);

select * from finish();
rollback;
