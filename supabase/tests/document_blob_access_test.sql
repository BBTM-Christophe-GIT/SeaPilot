-- Independent authenticated fixtures; never the UI's simulated role view.
-- All rows, roles, uploads and mappings are rolled back after this test.
begin;
create temporary table blob_roles(user_id uuid,role_key text,person_id bigint,hr_path text);
insert into blob_roles(user_id,role_key) values
 ('bb140000-0000-4000-8000-000000000001','admin'),
 ('bb140000-0000-4000-8000-000000000002','direction'),
 ('bb140000-0000-4000-8000-000000000003','armement'),
 ('bb140000-0000-4000-8000-000000000004','capitaine'),
 ('bb140000-0000-4000-8000-000000000005','marin');
grant select on blob_roles to authenticated,service_role;
insert into auth.users(id,email) select user_id,role_key||'-blob@example.invalid' from blob_roles;
insert into public.profiles(id,email,display_name,active_company_id)
select r.user_id,r.role_key||'-blob@example.invalid','Blob fixture',c.id
from blob_roles r cross join public.companies c where c.code='bbtm';
insert into public.company_memberships(company_id,user_id,active)
select c.id,r.user_id,true from blob_roles r cross join public.companies c where c.code='bbtm'
on conflict(company_id,user_id) do update set active=true;
insert into public.user_roles(user_id,company_id,role_key)
select r.user_id,c.id,r.role_key from blob_roles r cross join public.companies c where c.code='bbtm';
insert into public.people(company_id,user_id,first_name,last_name,active)
select c.id,r.user_id,'BlobFixture',r.role_key,true from blob_roles r cross join public.companies c where c.code='bbtm';
update blob_roles r set person_id=p.id,hr_path='people/'||p.id||'/blob-fixture.pdf'
from public.people p where p.user_id=r.user_id;
insert into public.hr_documents(company_id,person_id,category_key,title,status,source_label,storage_bucket,storage_path,file_size_bytes,mime_type)
select p.company_id,p.id,'administrative','Blob access fixture','valid','blob-test','hr-documents',r.hr_path,7,'application/pdf'
from public.people p join blob_roles r on r.user_id=p.user_id;
insert into public.procedures(procedure_code,title,status,source_label,theme,document_number,
 source_google_drive_file_id,source_google_drive_path,source_file_name,source_mime_type,source_size_bytes)
values('BLB 9814-A','Blob source fixture','draft','blob-test','BLB','9814',
 'fixture_blob_source_123','BLB-9814-A.docx','BLB-9814-A.docx',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',7);
insert into public.published_procedures(procedure_id,procedure_code,title,status,source_label,theme,document_number,
 storage_bucket,storage_path,file_name,mime_type,size_bytes)
select id,procedure_code,'Blob publication fixture','published','blob-test',theme,document_number,
 'procedure-documents','published/test/blob-published.pdf','blob-published.pdf','application/pdf',7
from public.procedures where procedure_code='BLB 9814-A';
insert into public.document_blob_files(source_bucket,source_path,blob_pathname,blob_url,file_name,mime_type,bytes,sha256,source_sha256,verified_at)
select 'hr-documents',r.hr_path,'documents/test/hr/'||r.person_id,
 'https://fixture.private.blob.vercel-storage.com/documents/test/hr/'||r.person_id,
 'blob-fixture.pdf','application/pdf',7,repeat('a',64),repeat('a',64),now() from blob_roles r;
insert into public.document_blob_files(source_bucket,source_path,blob_pathname,blob_url,file_name,mime_type,bytes,sha256,source_sha256,verified_at)
values
 ('procedure-documents','published/test/blob-published.pdf','documents/test/published','https://fixture.private.blob.vercel-storage.com/documents/test/published','blob-published.pdf','application/pdf',7,repeat('a',64),repeat('a',64),now()),
 ('fleet-certificates','987654321/test/blob-other-company.pdf','documents/test/other','https://fixture.private.blob.vercel-storage.com/documents/test/other','blob-other.pdf','application/pdf',7,repeat('a',64),repeat('a',64),now());
insert into public.document_blob_files(source_bucket,source_path,blob_pathname,blob_url,file_name,mime_type,bytes,sha256,source_sha256,verified_at)
select 'fleet-certificates',c.id||'/test/blob-fleet.pdf','documents/test/fleet','https://fixture.private.blob.vercel-storage.com/documents/test/fleet',
 'blob-fleet.pdf','application/pdf',7,repeat('a',64),repeat('a',64),now()
from public.companies c where c.code='bbtm';
insert into public.document_blob_files(source_bucket,source_path,blob_pathname,blob_url,file_name,mime_type,bytes,sha256,source_sha256,verified_at,active)
select 'fleet-certificates',c.id||'/test/blob-inactive.pdf','documents/test/inactive','https://fixture.private.blob.vercel-storage.com/documents/test/inactive',
 'blob-inactive.pdf','application/pdf',7,repeat('a',64),repeat('a',64),now(),false
from public.companies c where c.code='bbtm';

set local role authenticated;
do $$
declare r record; other record; fleet_path text; response jsonb; batch jsonb; reservation jsonb;
begin
 for r in select * from blob_roles loop
  perform set_config('request.jwt.claim.sub',r.user_id::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',r.user_id,'role','authenticated')::text,true);
  assert public.document_blob_lookup('hr-documents',r.hr_path)->>'sha256'=repeat('a',64),'Every actual profile reads its own RH bytes';
  assert public.document_blob_lookup('procedure-documents','published/test/blob-published.pdf') is not null,'All real profiles read published PDFs';
  fleet_path:=public.current_planning_company_id()||'/test/blob-fleet.pdf';
  assert public.document_blob_lookup('fleet-certificates',fleet_path) is not null,'Existing company fleet access is preserved';
  assert public.document_blob_lookup('hr-documents','no-such-file') is null,'Unmapped references remain distinct from denied mappings';
  batch:=public.document_blob_lookup_batch('fleet-certificates',array[fleet_path,'987654321/test/blob-other-company.pdf','no-such-file']);
  assert batch->0->'document'->>'sha256'=repeat('a',64),'Batch retains allowed metadata';
  assert batch->1->'document'='null'::jsonb and batch->1->>'error'='42501','Batch denies cross-company without metadata';
  assert batch->2->'document'='null'::jsonb and batch->2->>'error' is null,'Batch reports unmapped separately';
  begin perform public.document_blob_lookup('fleet-certificates','987654321/test/blob-other-company.pdf');raise exception 'Cross-company bytes leaked';
  exception when insufficient_privilege then null;end;
  begin perform public.document_blob_lookup('fleet-certificates',public.current_planning_company_id()||'/test/blob-inactive.pdf');raise exception 'Inactive mapping allowed fallback';
  exception when insufficient_privilege then null;end;
  begin perform public.document_blob_lookup_batch('fleet-certificates',array_fill(fleet_path,array[201]));raise exception 'Oversized batch accepted';
  exception when invalid_parameter_value then null;end;
  for other in select * from blob_roles where user_id<>r.user_id loop
   if r.role_key in ('admin','direction','armement') then
    assert public.document_blob_lookup('hr-documents',other.hr_path) is not null,'Office profiles retain RH access';
   else
    begin perform public.document_blob_lookup('hr-documents',other.hr_path);raise exception 'Unassigned RH file leaked';
    exception when insufficient_privilege then null;end;
   end if;
  end loop;
  assert not public.document_blob_can_upload('procedure-documents','sources/test/source.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',7),'Editable Procedure sources stay on Drive';
  begin update public.document_blob_files set sha256=repeat('f',64);raise exception 'Client overwrote verified proof';
  exception when insufficient_privilege then null;end;
  begin perform public.document_blob_register_verified('{}'::jsonb);raise exception 'Client registered a fake verified binary';
  exception when insufficient_privilege then null;end;
  if r.role_key in ('admin','direction','armement') then
   reservation:=public.document_blob_upload_scope('fleet-certificates',public.current_planning_company_id()||'/test/new-'||r.role_key||'.pdf','fixture.pdf','application/pdf',7,repeat('c',64));
   assert reservation->>'uploader_id'=r.user_id::text,'Reservation uses authenticated identity';
   assert public.document_blob_upload_scope('fleet-certificates',reservation->>'source_path','fixture.pdf','application/pdf',7,repeat('c',64))->>'id'=reservation->>'id','Prepare is idempotent';
   assert public.document_blob_upload_revalidate((reservation->>'id')::uuid)->>'id'=reservation->>'id','Complete revalidates the same upload';
  else
   begin perform public.document_blob_upload_scope('fleet-certificates',public.current_planning_company_id()||'/test/new-denied.pdf','fixture.pdf','application/pdf',7,repeat('c',64));raise exception 'Field profile uploaded an office certificate';
   exception when insufficient_privilege then null;end;
  end if;
 end loop;
end $$;
reset role;

-- Register an actual staged upload only through the trusted server role.
do $$
declare reservation jsonb; proof jsonb; result jsonb; actor uuid:='bb140000-0000-4000-8000-000000000001';
begin
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 reservation:=public.document_blob_upload_scope('fleet-certificates',public.current_planning_company_id()||'/test/pending-private.pdf','fixture.pdf','application/pdf',7,repeat('d',64));
 proof:=jsonb_build_object('source_bucket',reservation->>'source_bucket','source_path',reservation->>'source_path',
   'upload_id',reservation->>'id','uploader_id',actor,'blob_pathname','documents/uploads/'||(reservation->>'id'),
   'blob_url','https://fixture.private.blob.vercel-storage.com/documents/uploads/'||(reservation->>'id'),
   'file_name','fixture.pdf','mime_type','application/pdf','bytes',7,'sha256',repeat('d',64),
   'verified_mime_type','application/pdf','verified_bytes',7,'verified_sha256',repeat('d',64));
 execute 'reset role';
 execute 'set local role service_role';
 result:=public.document_blob_register_verified(proof);
 assert result->>'file_name'='fixture.pdf' and result->>'mime_type'='application/pdf',
   'Completed registration returns the metadata required by the client';
 assert result->>'blob_url'=proof->>'blob_url' and result->>'provider'='vercel-blob',
   'Completed registration returns the actual private provider reference';
 assert public.document_blob_register_verified(proof)->>'id'=result->>'id','Verified registration is retryable';
 begin perform public.document_blob_register_verified(proof||jsonb_build_object('verified_sha256',repeat('e',64)));raise exception 'Wrong hash proof accepted';
 exception when invalid_parameter_value then null;end;
 begin perform public.document_blob_register_verified(proof||jsonb_build_object('blob_pathname','documents/uploads/wrong'));raise exception 'Unreserved pathname accepted';
 exception when invalid_parameter_value then null;end;
 execute 'reset role';
 assert not exists(select 1 from storage.objects where bucket_id=reservation->>'source_bucket' and name=reservation->>'source_path'),'No fake Storage object was created';
 execute 'set local role authenticated';
 assert public.document_blob_lookup(reservation->>'source_bucket',reservation->>'source_path') is not null,'Uploader can inspect verified pending bytes';
 perform set_config('request.jwt.claim.sub','bb140000-0000-4000-8000-000000000002',true);
 perform set_config('request.jwt.claims','{"sub":"bb140000-0000-4000-8000-000000000002","role":"authenticated"}',true);
 begin perform public.document_blob_lookup(reservation->>'source_bucket',reservation->>'source_path');raise exception 'Pending upload was visible to another profile';
 exception when insufficient_privilege then null;end;
 begin perform public.document_blob_upload_revalidate((reservation->>'id')::uuid);raise exception 'Another profile completed an upload';
 exception when insufficient_privilege then null;end;
 execute 'reset role';
 update document_blob_private.uploads set expires_at=now()-interval '1 second' where id=(reservation->>'id')::uuid;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 begin perform public.document_blob_upload_revalidate((reservation->>'id')::uuid);raise exception 'Expired upload validated';
 exception when insufficient_privilege then null;end;
 execute 'reset role';
end $$;

-- Sources never become Blob attachments, including through service registration.
do $$ begin
 begin insert into public.document_blob_files(source_bucket,source_path,blob_pathname,blob_url,file_name,mime_type,bytes,sha256,source_sha256,verified_at)
 values('procedure-documents','sources/test/source.docx','documents/test/source','https://fixture.private.blob.vercel-storage.com/documents/test/source',
 'source.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',7,repeat('a',64),repeat('a',64),now());
 raise exception 'Editable source copied into attachment registry';
 exception when check_violation then null;end;
end $$;


-- Test helper stands in for the separately tested byte-reading API. It uses
-- service_role only for registration, returning to the real authenticated actor.
create function pg_temp.complete_blob(reservation jsonb) returns jsonb
language plpgsql security invoker as $$
declare result jsonb; proof jsonb;
begin
 proof:=jsonb_build_object('source_bucket',reservation->>'source_bucket','source_path',reservation->>'source_path',
  'upload_id',reservation->>'id','uploader_id',reservation->>'uploader_id',
  'blob_pathname','documents/uploads/'||(reservation->>'id'),
  'blob_url','https://fixture.private.blob.vercel-storage.com/documents/uploads/'||(reservation->>'id'),
  'file_name',reservation->>'file_name','mime_type',reservation->>'mime_type','bytes',reservation->'bytes','sha256',reservation->>'sha256',
  'verified_mime_type',reservation->>'mime_type','verified_bytes',reservation->'bytes','verified_sha256',reservation->>'sha256');
 execute 'reset role';execute 'set local role service_role';
 result:=public.document_blob_register_verified(proof);
 execute 'reset role';execute 'set local role authenticated';
 return result;
end $$;
grant execute on function pg_temp.complete_blob(jsonb) to authenticated;

do $$
declare reservation jsonb; context jsonb; result jsonb; batch bigint; person bigint; company bigint; project bigint;
 signature bigint; generated bigint; publication public.published_procedures; source public.procedures;
 product uuid:=gen_random_uuid(); attachment uuid:=gen_random_uuid(); vessel bigint; source_path text;
 rows jsonb:='[{"sheet":"January","row":2,"date":"2026-01-01","reported_work_seconds":3600,"detected_phases":[{"start_minute":480,"end_minute":540}],"phases":[{"start_minute":480,"end_minute":540}]}]';
begin
 perform set_config('request.jwt.claim.sub','bb140000-0000-4000-8000-000000000001',true);
 perform set_config('request.jwt.claims','{"sub":"bb140000-0000-4000-8000-000000000001","role":"authenticated"}',true);
 execute 'set local role authenticated';
 person:=public.current_person_id();company:=public.current_planning_company_id();
 -- Canonical RH upload permissions do not trust context to choose another person.
 reservation:=public.document_blob_upload_scope('hr-documents','people/'||person||'/blob-new.pdf','blob-new.pdf','application/pdf',7,repeat('a',64),
  jsonb_build_object('person_id',person));
 perform pg_temp.complete_blob(reservation);
 insert into public.hr_documents(company_id,person_id,category_key,title,status,source_label,storage_bucket,storage_path,file_size_bytes,mime_type)
 values(company,person,'administrative','New Blob RH','valid','blob-test','hr-documents',reservation->>'source_path',7,'application/pdf');
 assert public.document_blob_lookup('hr-documents',reservation->>'source_path')->>'sha256'=repeat('a',64),'New RH works without a Drive copy';

 -- Working-time preview and commit accept the verified source bytes only.
 context:=public.working_time_import_upload_context('BlobFixture - 2026.xlsm','application/vnd.ms-excel.sheet.macroEnabled.12',7,repeat('b',64));
 batch:=(context->>'batch_id')::bigint;source_path:=context->>'storage_path';
 reservation:=public.document_blob_upload_scope('working-time-imports',source_path,'fixture.xlsm',
  'application/vnd.ms-excel.sheet.macroEnabled.12',7,repeat('b',64));
 perform pg_temp.complete_blob(reservation);
 result:=public.preview_working_time_import(batch,person,2026,'Europe/Paris','BlobFixture admin','blob-test','{}',rows);
 assert result->>'status'='preview_ready','Working-time preview accepts verified Blob';
 execute 'reset role';
 update public.document_blob_files d set source_sha256=repeat('c',64) where d.source_bucket='working-time-imports' and d.source_path=reservation->>'source_path';
 execute 'set local role authenticated';
 begin perform public.preview_working_time_import(batch,person,2026,'Europe/Paris','BlobFixture admin','blob-test','{}',rows);raise exception 'Wrong import source hash accepted';
 exception when object_not_in_prerequisite_state then null;end;
 execute 'reset role';
 update public.document_blob_files d set source_sha256=repeat('b',64) where d.source_bucket='working-time-imports' and d.source_path=reservation->>'source_path';
 execute 'set local role authenticated';
 result:=public.commit_working_time_import(batch);
 assert result->>'status'='imported','Working-time commit retains its full validation workflow';

 -- Signature registration still binds person/path and the observed hash.
 source_path:=company||'/'||person||'/blob-signature.png';
 reservation:=public.document_blob_upload_scope('working-time-signatures',source_path,'blob-signature.png','image/png',7,repeat('d',64));
 perform pg_temp.complete_blob(reservation);
 begin perform public.register_working_time_profile_signature(person,source_path,'image/png',7,repeat('e',64));raise exception 'Forged signature hash accepted';
 exception when check_violation then null;end;
 signature:=public.register_working_time_profile_signature(person,source_path,'image/png',7,repeat('d',64));
 assert signature is not null,'Signature finalize reads only verified metadata';

 -- Project registration preserves its company, path, type and metadata checks.
 execute 'reset role';
 insert into public.projects(title,project_code,status,source_label,company_id)
 values('Blob project fixture','BLB9814','Brouillon','seapilot',company) returning id into project;
 execute 'set local role authenticated';
 source_path:='projects/'||project||'/generated/blob-offer.pdf';
 reservation:=public.document_blob_upload_scope('project-files',source_path,'blob-offer.pdf','application/pdf',7,repeat('e',64));
 perform pg_temp.complete_blob(reservation);
 begin perform public.projects_register_generated_storage_document(project,null,'offer',1,'project-files',source_path,'blob-offer.pdf','application/pdf',7,repeat('f',64));raise exception 'Forged project source hash accepted';
 exception when invalid_parameter_value then null;end;
 generated:=public.projects_register_generated_storage_document(project,null,'offer',1,'project-files',source_path,'blob-offer.pdf','application/pdf',7,repeat('e',64));
 assert generated is not null,'Generated project document finalizes without Storage';

 -- Chemical reservation is bound to a live, authorized product before insertion.
 select id into vessel from public.vessels where company_id=company and asset_kind='vessel' limit 1;
 insert into public.chemical_products(id,company_id,vessel_id,brand,product_type)
 values(product,company,vessel,'Blob fixture','Test product');
 reservation:=public.document_blob_upload_scope('chemical-drive',attachment::text,'fixture.pdf','application/pdf',7,repeat('f',64),
  jsonb_build_object('product_id',product));
 perform pg_temp.complete_blob(reservation);
 insert into public.chemical_attachments(id,company_id,product_id,drive_path,file_name,mime_type,size_bytes,kind,sha256)
 values(attachment,company,product,public.chemical_drive_folder(product)||'/'||attachment||'-fixture.pdf','fixture.pdf','application/pdf',7,'fds',repeat('f',64));
 assert public.document_blob_lookup('chemical-drive',attachment::text) is not null,'Chemical attachment becomes readable after business linkage';
 begin perform public.document_blob_upload_scope('chemical-drive',gen_random_uuid()::text,'fixture.pdf','application/pdf',7,repeat('f',64),
  jsonb_build_object('product_id',gen_random_uuid()));raise exception 'Unknown product accepted';
 exception when insufficient_privilege then null;end;

 -- A procedure PDF is unreadable to other profiles until Blob proof exists.
 select * into source from public.procedures where procedure_code='BLB 9814-A';
 publication:=public.prepare_procedure_blob_publication(source.id,public.procedure_drive_pdf_name(source),7,repeat('a',64));
 assert publication.status='draft','Receipt preparation does not publish a missing PDF';
 assert (public.prepare_procedure_blob_publication(source.id,publication.google_drive_path,7,repeat('a',64))).id=publication.id,'Same PDF receipt is idempotent';
 assert public.procedure_drive_scope('read',null,publication.id) is not null,'Author can read the converted draft through the existing bridge';
 begin perform public.publish_procedure_blob(publication.id);raise exception 'Unverified PDF was published';
 exception when object_not_in_prerequisite_state then null;end;
 perform set_config('request.jwt.claim.sub','bb140000-0000-4000-8000-000000000002',true);
 perform set_config('request.jwt.claims','{"sub":"bb140000-0000-4000-8000-000000000002","role":"authenticated"}',true);
 begin perform public.document_blob_upload_scope('procedure-publications-drive',publication.id::text,publication.file_name,'application/pdf',7,repeat('a',64));
  raise exception 'Another Direction author reserved the Admin draft';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','bb140000-0000-4000-8000-000000000001',true);
 perform set_config('request.jwt.claims','{"sub":"bb140000-0000-4000-8000-000000000001","role":"authenticated"}',true);
 reservation:=public.document_blob_upload_scope('procedure-publications-drive',publication.id::text,publication.file_name,'application/pdf',7,repeat('a',64));
 perform pg_temp.complete_blob(reservation);
 perform set_config('request.jwt.claim.sub','bb140000-0000-4000-8000-000000000005',true);
 perform set_config('request.jwt.claims','{"sub":"bb140000-0000-4000-8000-000000000005","role":"authenticated"}',true);
 begin perform public.document_blob_lookup('procedure-publications-drive',publication.id::text);raise exception 'Pending PDF leaked to Marin';
 exception when insufficient_privilege then null;end;
 begin perform public.procedure_drive_scope('read',null,publication.id);raise exception 'Pending Drive PDF leaked to Marin';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','bb140000-0000-4000-8000-000000000001',true);
 perform set_config('request.jwt.claims','{"sub":"bb140000-0000-4000-8000-000000000001","role":"authenticated"}',true);
 publication:=public.publish_procedure_blob(publication.id);
 assert publication.status='published','The PDF is published only after server proof';
 perform set_config('request.jwt.claim.sub','bb140000-0000-4000-8000-000000000005',true);
 perform set_config('request.jwt.claims','{"sub":"bb140000-0000-4000-8000-000000000005","role":"authenticated"}',true);
 assert public.document_blob_lookup('procedure-publications-drive',publication.id::text) is not null,'Actual Marin reads the completed publication';
 execute 'reset role';
 assert not exists(select 1 from storage.objects where name like '%blob-%' or name like '%blob/%'),'New workflows insert no synthetic Storage rows';
end $$;


do $$
declare actor uuid:='bb140000-0000-4000-8000-000000000001'; person bigint; company bigint; legacy_id bigint;
  folder text; proof jsonb; response jsonb;
begin
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
 execute 'set local role authenticated';person:=public.current_person_id();company:=public.current_planning_company_id();
 folder:=public.hr_document_drive_scope(person,null)->>'folder';
 insert into public.hr_documents(company_id,person_id,category_key,title,status,source_label,drive_path,drive_sha256,file_size_bytes,mime_type)
 values(company,person,'administrative','Legacy alias renewal fixture','valid','blob-test',folder||'/old.pdf',repeat('a',64),7,'application/pdf')
 returning id into legacy_id;
 proof:=jsonb_build_object('migration',true,'source_bucket','hr-drive','source_path',legacy_id::text,
  'blob_pathname','documents/test/legacy-hr-'||legacy_id,'blob_url','https://fixture.private.blob.vercel-storage.com/documents/test/legacy-hr-'||legacy_id,
  'file_name','old.pdf','mime_type','application/pdf','bytes',7,'sha256',repeat('a',64),'source_sha256',repeat('a',64),
  'verified_mime_type','application/pdf','verified_bytes',7,'verified_sha256',repeat('a',64));
 execute 'reset role';execute 'set local role service_role';
 perform public.document_blob_register_verified(proof);
 execute 'reset role';execute 'set local role authenticated';
 assert public.document_blob_lookup('hr-drive',legacy_id::text) is not null,'Current legacy alias is authorized';
 update public.hr_documents set drive_sha256=repeat('b',64) where id=legacy_id;
 begin perform public.document_blob_lookup('hr-drive',legacy_id::text);raise exception 'Changed alias SHA served obsolete bytes';
 exception when insufficient_privilege then null;end;
 update public.hr_documents set drive_sha256=repeat('a',64),drive_path=folder||'/new.pdf' where id=legacy_id;
 begin perform public.document_blob_lookup('hr-drive',legacy_id::text);raise exception 'Changed alias path served obsolete bytes';
 exception when insufficient_privilege then null;end;
 update public.hr_documents set drive_path=null,drive_sha256=null,storage_bucket='hr-documents',storage_path='people/'||person||'/new-version.pdf'
 where id=legacy_id;
 begin perform public.document_blob_lookup('hr-drive',legacy_id::text);raise exception 'Renewed canonical RH served old ID alias';
 exception when insufficient_privilege then null;end;
 -- Normal INSERT rights never permit replacing an older physical object.
 execute 'reset role';
 insert into storage.objects(bucket_id,name,owner_id,metadata)
 values('fleet-certificates',company||'/test/existing-native-guard.pdf',actor::text,'{"mimetype":"application/pdf","size":7}');
 execute 'set local role authenticated';
 begin perform public.document_blob_upload_scope('fleet-certificates',company||'/test/existing-native-guard.pdf','existing-native-guard.pdf','application/pdf',7,repeat('b',64));raise exception 'Existing native object replaced through INSERT permission';
 exception when unique_violation then null;end;
 execute 'reset role';
end $$;


do $$
declare company bigint; note bigint; proof jsonb;
begin
 perform set_config('request.jwt.claim.sub','bb140000-0000-4000-8000-000000000001',true);
 perform set_config('request.jwt.claims','{"sub":"bb140000-0000-4000-8000-000000000001","role":"authenticated"}',true);
 company:=public.current_planning_company_id();
 insert into public.qhse_service_notes(company_id,subject,body,scope,status,published_at,source_kind,source_file_name,source_web_url)
 values(company,'External source fixture','Source fixture body','all_accounts','published',now(),'sharepoint','source.docx','https://example.invalid/source-original.docx')
 returning id into note;
 proof:=jsonb_build_object('migration',true,'source_bucket','service-note-source','source_path',note::text,
  'blob_pathname','documents/test/service-source-'||note,'blob_url','https://fixture.private.blob.vercel-storage.com/documents/test/service-source-'||note,
  'file_name','source.docx','mime_type','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'bytes',7,'sha256',repeat('a',64),'source_sha256',repeat('a',64),
  'verified_mime_type','application/vnd.openxmlformats-officedocument.wordprocessingml.document','verified_bytes',7,'verified_sha256',repeat('a',64));
 execute 'set local role service_role';perform public.document_blob_register_verified(proof);
 execute 'reset role';execute 'set local role authenticated';
 assert public.document_blob_lookup('service-note-source',note::text) is not null,'A migrated source retains actual note RLS';
 assert not public.document_blob_can_upload('service-note-source',note::text,'application/pdf',7),'External keys are migration/read-only';
 execute 'reset role';
 update public.qhse_service_notes set source_web_url='https://example.invalid/source-renewed.docx' where id=note;
 execute 'set local role authenticated';
 begin perform public.document_blob_lookup('service-note-source',note::text);raise exception 'Changed external URL retained an obsolete source alias';
 exception when insufficient_privilege then null;end;
 execute 'reset role';
end $$;


do $$
declare actor uuid:='bb140000-0000-4000-8000-000000000001'; company bigint; vessel bigint;
  audit_id uuid:=gen_random_uuid(); file_id uuid:=gen_random_uuid(); source_path text; reservation jsonb; result jsonb;
  files jsonb; payload jsonb; certificate bigint;
begin
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
 company:=public.current_planning_company_id();
 select id into vessel from public.vessels where company_id=company and active and asset_kind='vessel' limit 1;
 insert into public.documentary_audits(id,company_id,kind,site_id,vessel_id,year,title)
 values(audit_id,company,'ovid',vessel,vessel,2098,'Blob evidence fixture');
 execute 'set local role authenticated';
 source_path:=company||'/'||audit_id||'/'||audit_id||'/audit/'||actor||'/'||file_id||'.pdf';
 reservation:=public.document_blob_upload_scope('documentary-audit-files',source_path,'fixture.pdf','application/pdf',7,repeat('a',64));
 perform pg_temp.complete_blob(reservation);
 files:=jsonb_build_array(jsonb_build_object('id',file_id,'fileName','fixture.pdf','storagePath',source_path,'mimeType','application/pdf','sizeBytes',7));
 payload:=jsonb_build_object('id',audit_id,'companyId',company,'kind','ovid','siteId',vessel::text,'year',2098,'title','Blob evidence fixture','files',files);
 result:=public.documentary_audit_save(payload);
 assert result is not null,'New audit evidence finalizes through verified Blob metadata';
 assert public.document_blob_lookup('documentary-audit-files',source_path) is not null,'Linked audit evidence retains authorized read';
 begin perform public.documentary_audit_save(payload||jsonb_build_object('files',
  jsonb_build_array(jsonb_build_object('id',file_id,'fileName','fixture.pdf','storagePath',source_path,'mimeType','application/pdf','sizeBytes',8))));
 raise exception 'Audit evidence metadata was replaced';
 exception when invalid_parameter_value then null;end;
 source_path:=company||'/test/fleet-finalized.pdf';
 reservation:=public.document_blob_upload_scope('fleet-certificates',source_path,'fleet-finalized.pdf','application/pdf',7,repeat('b',64));
 perform pg_temp.complete_blob(reservation);
 certificate:=public.create_fleet_certificate_document(vessel,'04-assurance','04 - Assurance','Blob fleet fixture',
  'fleet-finalized.pdf','fleet-finalized.pdf',source_path,'application/pdf',7,current_date,current_date+365);
 assert certificate is not null,'New fleet certificate business workflow remains intact';
 perform set_config('request.jwt.claim.sub','bb140000-0000-4000-8000-000000000002',true);
 perform set_config('request.jwt.claims','{"sub":"bb140000-0000-4000-8000-000000000002","role":"authenticated"}',true);
 assert public.document_blob_lookup('fleet-certificates',source_path) is not null,'Linked fleet file becomes readable to another authorized real profile';
 execute 'reset role';
 assert not exists(select 1 from storage.objects where (bucket_id='documentary-audit-files' and name=company||'/'||audit_id||'/'||audit_id||'/audit/'||actor||'/'||file_id||'.pdf')
  or (bucket_id='fleet-certificates' and name=source_path)),'Audit and fleet workflows create no fake Storage object';
end $$;

set local role anon;
do $$ begin
 begin perform public.document_blob_lookup('procedure-documents','published/test/blob-published.pdf');raise exception 'Anonymous lookup succeeded';
 exception when insufficient_privilege then null;end;
 begin perform public.document_blob_lookup_batch('procedure-documents',array['published/test/blob-published.pdf']);raise exception 'Anonymous batch succeeded';
 exception when insufficient_privilege then null;end;
 begin select count(*) from public.document_blob_files;raise exception 'Anonymous table access succeeded';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: real profile/company/RH boundaries; private batch; reserved idempotent uploads; service-only verified proof; pending uploader-only; no fake Storage rows; sources kept Drive' result;
rollback;
