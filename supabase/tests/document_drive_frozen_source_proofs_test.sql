-- Rollback-only fixtures. Run after the source-proof migration and, if the
-- registry already contains paths, after loading their reviewed private proofs.
begin;
insert into document_drive_private.frozen_sources(source_bucket,source_path,source_id,source_sha256) values
 ('procedure-documents','sources/test/frozen-proof-a.pdf','dd140000-0000-4000-8000-000000000001',repeat('a',64)),
 ('procedure-documents','sources/test/frozen-proof-b.pdf','dd140000-0000-4000-8000-000000000002',repeat('b',64));

do $$ begin
 assert not has_function_privilege('anon','public.document_drive_sources_frozen(jsonb)','EXECUTE'),'Anonymous callers must not access the frozen-set RPC';
 assert not has_function_privilege('authenticated','public.document_drive_sources_frozen(jsonb)','EXECUTE'),'Authenticated callers must not access the frozen-set RPC';
 assert has_function_privilege('service_role','public.document_drive_sources_frozen(jsonb)','EXECUTE'),'Service role can check the frozen set';
 begin
  insert into document_drive_private.frozen_sources(source_bucket,source_path,source_id)
   values ('procedure-documents','sources/test/frozen-proof-incomplete.pdf','dd140000-0000-4000-8000-000000000003');
  raise exception 'Incomplete freeze fingerprint was accepted';
 exception when check_violation then null; end;
end $$;

set local role authenticated;
do $$ begin
 begin perform public.document_drive_sources_frozen('[]'); raise exception 'Authenticated caller reached the RPC';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$ declare expected jsonb; changed jsonb; begin
 select jsonb_agg(jsonb_build_object('source_bucket',source_bucket,'source_path',source_path,
  'source_id',source_id,'source_sha256',source_sha256) order by source_bucket,source_path)
 into expected from document_drive_private.frozen_sources;
 assert public.document_drive_sources_frozen(expected),'The complete exact frozen set must match';
 assert not public.document_drive_sources_frozen(expected - 0),'A subset must not match';
 assert not public.document_drive_sources_frozen(expected || jsonb_build_array(expected->0)),'An extra path must not match';
 changed := jsonb_set(expected,'{1}',expected->0);
 assert not public.document_drive_sources_frozen(changed),'Duplicates must not match';
 changed := jsonb_set(expected,'{0,source_id}','"dd140000-0000-4000-8000-ffffffffffff"');
 assert not public.document_drive_sources_frozen(changed),'A replacement UUID must not match';
 changed := jsonb_set(expected,'{0,source_sha256}',to_jsonb(repeat('f',64)));
 assert not public.document_drive_sources_frozen(changed),'A different source hash must not match';
 changed := jsonb_set(expected,'{0,source_path}','"sources/test/unregistered-proof.pdf"');
 assert not public.document_drive_sources_frozen(changed),'A different source path must not match';
 changed := jsonb_set(expected,'{0,source_id}','"not-a-uuid"');
 assert not public.document_drive_sources_frozen(changed),'Malformed input must fail closed';
 assert not public.document_drive_sources_frozen('[]'),'An empty set must not match';
 assert not public.document_drive_sources_frozen('{}'),'A non-array must not match';
 assert not public.document_drive_sources_frozen('[false]'),'Malformed records must fail closed';
end $$;
reset role;
alter policy document_drive_freeze_insert on storage.objects to service_role;
set local role service_role;
do $$ declare expected jsonb; begin
 select jsonb_agg(jsonb_build_object('source_bucket',source_bucket,'source_path',source_path,
  'source_id',source_id,'source_sha256',source_sha256)) into expected from document_drive_private.frozen_sources;
 assert not public.document_drive_sources_frozen(expected),'A freeze missing an authenticated write policy must not match';
end $$;
reset role;
select 'PASS: service-only frozen-set proof checks exact count, unique paths, UUIDs and SHA256; malformed or incomplete proofs rejected' as result;
rollback;
