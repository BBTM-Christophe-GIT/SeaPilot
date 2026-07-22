begin;

select plan(12);

select has_function('public', 'dpr_save_payload', array['bigint', 'jsonb'], 'transactional six-step save RPC exists');
select has_function('public', 'dpr_prepare_file_upload', array['bigint', 'text', 'text', 'text', 'bigint', 'text', 'integer'], 'trusted file allocation RPC exists');
select has_function('public', 'dpr_complete_file_upload', array['bigint'], 'file completion RPC exists');
select has_function('public', 'dpr_remove_file', array['bigint'], 'logical file removal RPC exists');
select has_function('public', 'dpr_admin_diagnostic', array[]::text[], 'admin diagnostic RPC exists');

select ok(has_function_privilege('authenticated', 'public.dpr_save_payload(bigint,jsonb)', 'EXECUTE'), 'authenticated users can call the save RPC');
select ok(not has_function_privilege('anon', 'public.dpr_save_payload(bigint,jsonb)', 'EXECUTE'), 'anonymous users cannot call the save RPC');
select ok(
  exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'dpr_storage_registered_insert'),
  'Storage upload requires a pre-registered trusted path'
);
select matches(
  pg_get_functiondef('public.dpr_save_payload(bigint,jsonb)'::regprocedure),
  '(?i)dpr_port_call_reasons',
  'save RPC persists multiple port-call reasons'
);
select matches(
  pg_get_functiondef('public.dpr_prepare_file_upload(bigint,text,text,text,bigint,text,integer)'::regprocedure),
  '(?i)at most two photos',
  'file RPC enforces the two-photo limit'
);
select matches(
  pg_get_functiondef('public.dpr_remove_file(bigint)'::regprocedure),
  '(?i)deleted_at\s*=\s*now',
  'file deletion is logical'
);
select matches(
  pg_get_functiondef('public.dpr_admin_diagnostic()'::regprocedure),
  '(?i)array\[''admin''\]',
  'diagnostic is restricted to administrators'
);

select * from finish();
rollback;
