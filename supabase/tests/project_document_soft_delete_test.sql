begin;
select no_plan();

insert into public.companies(code,name) values('document-delete-other','Document deletion isolation');
insert into auth.users(id,email) select ('a6940000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'document-delete-'||n||'@example.invalid' from generate_series(1,8)n;
insert into public.profiles(id,email,display_name,active_company_id)
select actor.id,actor.email,'Document delete fixture',company.id from auth.users actor join public.companies company
  on company.code=case when right(actor.id::text,1)='6' then 'document-delete-other' else 'bbtm' end where actor.id::text like 'a6940000-%';
insert into public.company_memberships(company_id,user_id,active) select active_company_id,id,true from public.profiles where id::text like 'a6940000-%'
  on conflict(company_id,user_id) do update set active=true;
update public.company_memberships set active=false where user_id='a6940000-0000-0000-0000-000000000007';
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,(array['admin','direction','armement','capitaine','marin','admin','admin'])[right(id::text,1)::integer]
from public.profiles where id::text like 'a6940000-%' and right(id::text,1)<>'8';
insert into public.vessels(company_id,name,active,asset_kind) select id,'DOCUMENT-DELETE-VESSEL',true,'vessel' from public.companies where code='bbtm';
insert into public.projects(company_id,title,project_code) select id,'DOCUMENT-DELETE-PROJECT-'||n,'DOCUMENT-DELETE-'||n from public.companies cross join generate_series(1,3)n where code='bbtm';
insert into public.projects(company_id,title,project_code) select id,'DOCUMENT-DELETE-PROJECT-4','DOCUMENT-DELETE-4' from public.companies where code='document-delete-other';
update public.projects set archived_at=now() where title='DOCUMENT-DELETE-PROJECT-3';
insert into public.planning_projects(company_id,title,catalog_project_id,primary_vessel_id,starts_on,ends_on)
select project.company_id,project.title,project.id,vessel.id,current_date,current_date from public.projects project join public.vessels vessel on vessel.name='DOCUMENT-DELETE-VESSEL' where project.title='DOCUMENT-DELETE-PROJECT-1';

create temporary table delete_doc_refs(key text primary key,project_id bigint,document_id text,bucket text,path text,expected jsonb,acknowledgement jsonb);
grant all on delete_doc_refs to authenticated;
insert into delete_doc_refs(key,project_id) select 'project-'||right(title,1),id from public.projects where title like 'DOCUMENT-DELETE-PROJECT-%';
insert into public.project_generated_documents(company_id,project_id,document_type,revision,file_name,mime_type,file_size_bytes,sha256,storage_bucket,storage_path,category_key,subcategory_key)
select project.company_id,project.id,'project_attachment',1,'document-delete-'||item||'.pdf','application/pdf',12,repeat('a',64),'project-files',
 'projects/'||project.id||'/attachments/document-delete-'||item||'.pdf','hse','hse_procedure'
from public.projects project cross join(values('exclusive'),('shared'))data(item) where project.title='DOCUMENT-DELETE-PROJECT-1';
insert into public.project_generated_documents(company_id,project_id,document_type,revision,file_name,mime_type,file_size_bytes,sha256,storage_bucket,storage_path,category_key)
select company_id,id,'project_attachment',1,'document-delete-other-project.pdf','application/pdf',12,repeat('a',64),'project-files','projects/'||id||'/attachments/other.pdf','hse'
from public.projects where title='DOCUMENT-DELETE-PROJECT-2';
insert into delete_doc_refs(key,project_id,document_id,bucket,path)
select replace(replace(file_name,'document-delete-',''),'.pdf',''),project_id,'generated:'||id,storage_bucket,storage_path
from public.project_generated_documents where file_name like 'document-delete-%';
insert into public.project_documents(company_id,project_id,title,file_name,mime_type,file_url,category_key,is_folder,sharepoint_drive_id,sharepoint_drive_item_id,source_payload,source_modified_at)
select project.company_id,project.id,'document-delete-'||item.key,'document-delete-'||item.key||'.pdf','application/pdf',item.url,'hse',item.folder,'document-delete-drive',item.key,
 '{"test":"retained-source"}'::jsonb,'2026-10-30T08:01:02.123456Z'::timestamptz
from public.projects project cross join(values
 ('imported','https://bbtm668.sharepoint.com/sites/qhse/Documents/delete-imported.pdf',false),
 ('corrupt-url','https://obsolete.example/invalid-historical.pdf',false)
)item(key,url,folder) where project.title='DOCUMENT-DELETE-PROJECT-1';
insert into public.contract_documents(company_id,project_id,title,file_name,mime_type,file_url,category_key,is_folder,sharepoint_drive_id,sharepoint_drive_item_id)
select company_id,id,'document-delete-contract','document-delete-contract.pdf','application/pdf','https://bbtm668.sharepoint.com/sites/qhse/Documents/delete-contract.pdf','contract_document',false,'document-delete-drive','contract'
from public.projects where title='DOCUMENT-DELETE-PROJECT-1';
-- Another project owns the same bytes. Deleting that logical reference must preserve the live attachment.
insert into public.contract_documents(company_id,project_id,title,file_name,mime_type,source_label,storage_bucket,storage_path,storage_sha256,storage_migrated_at)
select project.company_id,project.id,'document-delete-shared-contract','document-delete-shared-contract.pdf','application/pdf','fixture',file.storage_bucket,file.storage_path,repeat('a',64),now()
from public.projects project cross join public.project_generated_documents file where project.title='DOCUMENT-DELETE-PROJECT-2' and file.file_name='document-delete-shared.pdf';
insert into delete_doc_refs(key,project_id,document_id,path)
select replace(title,'document-delete-',''),project_id,'project:'||id,file_url from public.project_documents where title like 'document-delete-%';
insert into delete_doc_refs(key,project_id,document_id,bucket,path)
select replace(title,'document-delete-',''),project_id,'contract:'||id,storage_bucket,coalesce(storage_path,file_url) from public.contract_documents where title like 'document-delete-%';
insert into storage.objects(bucket_id,name) select bucket,path from delete_doc_refs where key in('exclusive','shared');
insert into public.project_drive_files(project_id,company_id,source_bucket,source_path,path,sha256,bytes,mime_type)
select item.project_id,project.company_id,item.bucket,item.path,'Projet-'||item.project_id||'/HSE/document-delete-'||item.key||'.pdf',repeat('a',64),12,'application/pdf'
from delete_doc_refs item join public.projects project on project.id=item.project_id where item.key in('exclusive','shared');
insert into delete_doc_refs(key,project_id,document_id,bucket,path)
select 'alias-'||case when source_path like '%-exclusive.pdf' then 'exclusive' else 'shared' end,project_id,id::text,'project-drive',id::text
from public.project_drive_files where source_path like '%/document-delete-%.pdf';
insert into public.document_drive_files(source_bucket,source_path,drive_file_id,drive_path,file_name,mime_type,bytes,sha256,source_sha256,verified_at)
select bucket,path,'document_delete_gateway_id','Projet/Documents/document-delete-exclusive.pdf','document-delete-exclusive.pdf','application/pdf',12,repeat('a',64),repeat('a',64),now()
from delete_doc_refs where key='exclusive';
insert into public.document_blob_files(source_bucket,source_path,blob_pathname,blob_url,file_name,mime_type,bytes,sha256,source_sha256,verified_at,provenance,uploader_id,upload_context)
select item.bucket,item.path,'documents/document-delete/'||item.key||'.pdf','https://document-delete.private.blob.vercel-storage.com/documents/'||item.key||'.pdf',
 'document-delete-'||item.key||'.pdf','application/pdf',12,repeat('a',64),repeat('a',64),now(),'{}'::jsonb,'a6940000-0000-0000-0000-000000000001'::uuid,jsonb_build_object('project_id',item.project_id)
from delete_doc_refs item where item.key in('exclusive','shared')
union all
select 'project-drive',file.id::text,'documents/document-delete/alias-'||file.id||'.pdf','https://document-delete.private.blob.vercel-storage.com/documents/alias-'||file.id||'.pdf',
 'alias.pdf','application/pdf',file.bytes,file.sha256,file.sha256,now(),jsonb_build_object('source_reference',file.path),null,'{}'::jsonb
from public.project_drive_files file where file.id::text in(select path from delete_doc_refs where key in('alias-exclusive','alias-shared'));
insert into sea_operation_private.project_document_selections(project_id,company_id,document_ids)
select project.id,project.company_id,array_agg(document.id order by document.id)
from public.projects project cross join lateral sea_operation_private.project_document_candidates(project.id,project.company_id) document
where project.title='DOCUMENT-DELETE-PROJECT-1' group by project.id,project.company_id;

create function pg_temp.actor(integer) returns text language sql as $$select set_config('request.jwt.claim.sub','a6940000-0000-0000-0000-'||lpad($1::text,12,'0'),true)$$;
create function pg_temp.ref(text) returns text language sql stable as $$select document_id from delete_doc_refs where key=$1$$;
create function pg_temp.project(text default 'project-1') returns bigint language sql stable as $$select project_id from delete_doc_refs where key=$1$$;
create function pg_temp.raw_document(p_key text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare item record; result jsonb;
begin
 select * into item from pg_temp.delete_doc_refs where key=p_key;
 if item.document_id like 'generated:%' then select to_jsonb(d) into result from public.project_generated_documents d where id=split_part(item.document_id,':',2)::bigint;
 elsif item.document_id like 'project:%' then select to_jsonb(d) into result from public.project_documents d where id=split_part(item.document_id,':',2)::bigint;
 else select to_jsonb(d) into result from public.contract_documents d where id=split_part(item.document_id,':',2)::bigint; end if; return result;
end;
$$;
create function pg_temp.remove(p_key text) returns jsonb language sql as $$
 select public.projects_delete_document(project_id,document_id,expected) from pg_temp.delete_doc_refs where key=p_key;
$$;
create function pg_temp.audit_count(p_key text) returns bigint language sql stable security definer set search_path='' as $$
 select count(*) from public.project_change_log log join pg_temp.delete_doc_refs item on log.entity_id=split_part(item.document_id,':',2)::bigint
 and log.entity_type=case split_part(item.document_id,':',1) when 'generated' then 'project_generated_documents' when 'project' then 'project_documents' else 'contract_documents' end
 where item.key=p_key and log.action='delete';
$$;
update delete_doc_refs set expected=project_document_private.deletion_expected(pg_temp.raw_document(key)) where document_id like '%:%';
create temporary table delete_doc_before as select key,pg_temp.raw_document(key) as value from delete_doc_refs where key in('exclusive','imported','contract');
grant select on delete_doc_before to authenticated;

select ok(not has_table_privilege('authenticated','project_document_private.deleted_documents','SELECT'),'tombstones are private, including to managers');
select ok(not has_table_privilege('authenticated','project_document_private.deleted_documents','INSERT'),'tombstones cannot be forged');
select ok(not has_table_privilege('authenticated','public.project_generated_documents','DELETE'),'physical generated metadata deletion remains revoked');
select ok(not has_table_privilege('authenticated','public.project_documents','DELETE'),'physical source metadata deletion remains revoked');
select ok(not has_function_privilege('anon','public.projects_delete_document(bigint,text,jsonb)','EXECUTE'),'anonymous users cannot invoke delete');
select ok(not has_function_privilege('authenticated','project_document_private.deletion_record(bigint,bigint,text)','EXECUTE'),'raw private snapshot helper cannot be invoked');

set local role authenticated;
select pg_temp.actor(1);
select throws_ok($$select * from project_document_private.deleted_documents$$,'42501',null,'manager cannot read the raw tombstone table');
select is(public.projects_document_deletion_snapshot(pg_temp.project(),pg_temp.ref('exclusive'))->'expected_document',(select expected from delete_doc_refs where key='exclusive'),'manager obtains the exact version for confirmation');
select ok(exists(select 1 from pg_constraint where conname='project_documents_file_only_check'),'the source schema already rejects directory entries');
select throws_ok($$select public.projects_document_deletion_snapshot(pg_temp.project(),pg_temp.ref('other-project'))$$,'42501',null,'same-company foreign project file is not targetable');
select throws_ok($$select public.projects_document_deletion_snapshot(pg_temp.project('project-3'),pg_temp.ref('exclusive'))$$,'42501',null,'closed projects are not mutable');
select throws_ok($$select public.projects_document_deletion_snapshot(pg_temp.project(),'generated:9223372036854775808')$$,'22023',null,'overflow identifiers are rejected');
select throws_ok($$select public.projects_delete_document(pg_temp.project(),pg_temp.ref('exclusive'),'{}')$$,'40001',null,'incomplete confirmation cannot delete a file');
select throws_ok($$select public.projects_delete_document(pg_temp.project(),pg_temp.ref('exclusive'),(select expected||'{"file_name":"changed.pdf"}' from delete_doc_refs where key='exclusive'))$$,'40001',null,'a stale name fails atomically');
select throws_ok($$select public.projects_delete_document(pg_temp.project(),pg_temp.ref('exclusive'),(select expected||'{"file_size_bytes":13}' from delete_doc_refs where key='exclusive'))$$,'40001',null,'a stale file version fails atomically');
select throws_ok($$select public.projects_delete_document(pg_temp.project(),pg_temp.ref('imported'),(select expected||'{"modified_at":"2026-10-30T08:01:02.123457Z"}' from delete_doc_refs where key='imported'))$$,'40001',null,'confirmation preserves full timestamp precision, including sub-millisecond source changes');
select is(pg_temp.audit_count('exclusive'),0::bigint,'failed writes create no deletion audit');
select lives_ok($$select public.document_blob_lookup('project-files',(select path from delete_doc_refs where key='exclusive'))$$,'private Blob bytes are readable before removal');

-- Real field identities retain their operational read while never receiving manager metadata/write rights.
select pg_temp.actor(5);
select ok(exists(select 1 from jsonb_array_elements(public.sea_operation_project_documents(pg_temp.project())) item where item->>'id'=pg_temp.ref('exclusive')),'real Marin sees the selected operational document before removal');
select lives_ok($$select public.sea_operation_project_document_access(pg_temp.project(),pg_temp.ref('exclusive'))$$,'real Marin can obtain the original guarded access grant');
select throws_ok($$select public.projects_document_deletion_snapshot(pg_temp.project(),pg_temp.ref('exclusive'))$$,'42501',null,'real Marin cannot fetch a manager deletion snapshot');
select throws_ok($$select pg_temp.remove('exclusive')$$,'42501',null,'real Marin cannot delete');
select throws_ok($$select public.projects_set_document_category(pg_temp.project(),pg_temp.ref('exclusive'),'billing',null,'hse','hse_procedure')$$,'42501',null,'real Marin cannot modify document classification');
select throws_ok($$select public.set_project_sea_operation_document(pg_temp.project(),pg_temp.ref('exclusive'),false)$$,'42501',null,'real Marin cannot modify document operational selection');
select throws_ok($$update sea_operation_private.project_document_grants set storage_path='forged.pdf'$$,'42501',null,'real Marin cannot modify private document path grants');
select pg_temp.actor(4);
select throws_ok($$select pg_temp.remove('exclusive')$$,'42501',null,'real Capitaine cannot delete');
select throws_ok($$select public.projects_set_document_category(pg_temp.project(),pg_temp.ref('exclusive'),'billing',null,'hse','hse_procedure')$$,'42501',null,'real Capitaine cannot modify document classification');
select throws_ok($$select public.set_project_sea_operation_document(pg_temp.project(),pg_temp.ref('exclusive'),false)$$,'42501',null,'real Capitaine cannot modify document operational selection');
select pg_temp.actor(3);
select throws_ok($$select pg_temp.remove('exclusive')$$,'42501',null,'Armement cannot delete');
select pg_temp.actor(7);
select throws_ok($$select pg_temp.remove('exclusive')$$,'42501',null,'inactive membership cannot delete');
select pg_temp.actor(8);
select throws_ok($$select pg_temp.remove('exclusive')$$,'42501',null,'membership without a manager role cannot delete');
select pg_temp.actor(6);
select throws_ok($$select pg_temp.remove('exclusive')$$,'42501',null,'foreign-company manager cannot delete');

select pg_temp.actor(1);
update delete_doc_refs set acknowledgement=pg_temp.remove(key) where key='exclusive';
select is((select acknowledgement->>'document_id' from delete_doc_refs where key='exclusive'),pg_temp.ref('exclusive'),'Admin deletes exactly the namespaced document');
select is((select count(*) from public.project_generated_documents where id=split_part(pg_temp.ref('exclusive'),':',2)::bigint),0::bigint,'deleted generated metadata is hidden even from managers');
select is(pg_temp.raw_document('exclusive'),(select value from delete_doc_before where key='exclusive'),'all canonical source metadata and paths are physically unchanged');
select is(pg_temp.audit_count('exclusive'),1::bigint,'logical removal has exactly one attributable deletion audit');
select is(pg_temp.remove('exclusive'),(select acknowledgement from delete_doc_refs where key='exclusive'),'a lost acknowledgement can be retried idempotently');
select is(pg_temp.audit_count('exclusive'),1::bigint,'idempotent retry does not duplicate the audit');
select throws_ok($$select public.projects_set_document_category(pg_temp.project(),pg_temp.ref('exclusive'),'billing',null,'hse','hse_procedure')$$,'42501',null,'a deleted item cannot be reclassified through a definer RPC');
select throws_ok($$select public.set_project_sea_operation_document(pg_temp.project(),pg_temp.ref('exclusive'),true)$$,'42501',null,'a deleted item cannot be selected again');
select ok(not exists(select 1 from jsonb_array_elements(public.project_sea_operation_documents(pg_temp.project())->'documents') item where item->>'id'=pg_temp.ref('exclusive')),'manager sea selection candidates exclude removed documents');
select is((select count(*) from storage.objects where bucket_id='project-files' and name=(select path from delete_doc_refs where key='exclusive')),0::bigint,'new native Storage reads are revoked');
select is((select count(*) from public.project_drive_files where id::text=pg_temp.ref('alias-exclusive')),0::bigint,'blanket manager mapping access is intersected by the deletion guard');
select throws_ok($$select public.document_blob_lookup('project-files',(select path from delete_doc_refs where key='exclusive'))$$,'42501',null,'the Blob API refuses fresh access even for the uploader');
select throws_ok($$select public.document_drive_lookup('project-files',(select path from delete_doc_refs where key='exclusive'))$$,'42501',null,'the Drive gateway refuses fresh access');
select throws_ok($$select public.document_blob_lookup('project-drive',pg_temp.ref('alias-exclusive'))$$,'42501',null,'registry-id aliases cannot reopen deleted bytes');

select pg_temp.actor(5);
select ok(not exists(select 1 from jsonb_array_elements(public.sea_operation_project_documents(pg_temp.project())) item where item->>'id'=pg_temp.ref('exclusive')),'real Marin no longer sees the removed operational file');
select throws_ok($$select public.sea_operation_project_document_access(pg_temp.project(),pg_temp.ref('exclusive'))$$,'42501',null,'a former field-profile grant cannot reopen the removed file');
select ok(not sea_operation_private.can_read_project_document_object('project-files',(select path from delete_doc_refs where key='exclusive')),'operational object access is revoked');
select pg_temp.actor(4);
select ok(not exists(select 1 from jsonb_array_elements(public.sea_operation_project_documents(pg_temp.project())) item where item->>'id'=pg_temp.ref('exclusive')),'real Capitaine no longer sees the removed operational file');

select pg_temp.actor(2);
select lives_ok($$select pg_temp.remove('imported')$$,'Direction can logically delete an imported file');
select lives_ok($$select pg_temp.remove('contract')$$,'Direction can logically delete a contract source');
select lives_ok($$select pg_temp.remove('corrupt-url')$$,'an invalid historical URL does not prevent safe logical deletion');
select is((select count(*) from public.project_documents where id=split_part(pg_temp.ref('imported'),':',2)::bigint),0::bigint,'imported metadata is hidden by RLS');
select is((select count(*) from public.contract_documents where id=split_part(pg_temp.ref('contract'),':',2)::bigint),0::bigint,'contract metadata is hidden by RLS');
select is(pg_temp.raw_document('imported'),(select value from delete_doc_before where key='imported'),'imported bytes/provenance remain unchanged');

select pg_temp.actor(1);
select lives_ok($$select pg_temp.remove('shared-contract')$$,'removing another project reference preserves its shared file');
select is((select count(*) from storage.objects where bucket_id='project-files' and name=(select path from delete_doc_refs where key='shared')),1::bigint,'a live shared business reference keeps its bytes readable');
select lives_ok($$select public.document_blob_lookup('project-files',(select path from delete_doc_refs where key='shared'))$$,'shared private mappings remain usable');
select pg_temp.actor(5);
select throws_ok($$select public.sea_operation_project_document_access(pg_temp.project(),pg_temp.ref('shared'))$$,'42501',null,'deleted commercial provenance still blocks an operational alias of those bytes');
select pg_temp.actor(1);
select lives_ok($$select pg_temp.remove('shared')$$,'the final live reference can be removed independently');
select throws_ok($$select public.document_blob_lookup('project-files',(select path from delete_doc_refs where key='shared'))$$,'42501',null,'removing the final live reference revokes the private source');

reset role;
select is((select count(*) from storage.objects where bucket_id='project-files' and name in(select path from delete_doc_refs where key in('exclusive','shared'))),2::bigint,'no physical source Storage row was deleted');
select is((select count(*) from public.document_blob_files where source_path in(select path from delete_doc_refs where key in('exclusive','shared')) and active),2::bigint,'Blob mappings remain intact and active');
select is((select count(*) from sea_operation_private.project_document_grants where document_id=pg_temp.ref('exclusive')),0::bigint,'all temporary field access grants were revoked');
select ok(not exists(select 1 from sea_operation_private.project_document_selections where pg_temp.ref('exclusive')=any(document_ids)),'operational consent arrays no longer contain the removed file');
-- Multiple memberships never broaden the selected-company boundary, even for the original Blob uploader.
insert into public.company_memberships(company_id,user_id,active)
select id,'a6940000-0000-0000-0000-000000000001'::uuid,true from public.companies where code='document-delete-other';
insert into public.user_roles(user_id,company_id,role_key)
select 'a6940000-0000-0000-0000-000000000001'::uuid,id,'direction' from public.companies where code='document-delete-other';
update public.profiles set active_company_id=(select id from public.companies where code='document-delete-other') where id='a6940000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.actor(1);
select ok(public.user_belongs_to_company(public.current_planning_company_id()),'multi-company fixture belongs to its selected company');
select ok(not public.user_belongs_to_company((pg_temp.raw_document('exclusive')->>'company_id')::bigint),'membership in a non-selected company never bypasses the read boundary');
select ok(public.has_any_role(array['admin','direction']),'multi-company fixture still has manager rights in its selected company');
select throws_ok($$select public.document_blob_lookup('project-files',(select path from delete_doc_refs where key='exclusive'))$$,'42501',null,'switching companies cannot bypass deleted Blob scope as the original uploader');
select throws_ok($$select public.document_drive_lookup('project-files',(select path from delete_doc_refs where key='exclusive'))$$,'42501',null,'switching companies cannot reopen the removed Drive mapping');
select throws_ok($$select public.document_blob_lookup('project-drive',pg_temp.ref('alias-exclusive'))$$,'42501',null,'switching companies cannot bypass a registry alias guard');
select ok(not public.document_blob_can_upload('project-files',(select path from delete_doc_refs where key='exclusive'),'application/pdf',12,'{}'),'uploader exception cannot authorize another selected company’s project path');
reset role;
update public.profiles set active_company_id=(select id from public.companies where code='bbtm') where id='a6940000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','',true);
update public.project_documents set file_url='https://bbtm668.sharepoint.com/sites/qhse/Documents/refreshed-deleted.pdf',source_modified_at=now() where id=split_part(pg_temp.ref('imported'),':',2)::bigint;
set local role authenticated;
select pg_temp.actor(1);
select is((select count(*) from public.project_documents where id=split_part(pg_temp.ref('imported'),':',2)::bigint),0::bigint,'a privileged source refresh cannot resurrect a deleted logical entry');
select ok(not project_document_private.location_visible('sharepoint','https://bbtm668.sharepoint.com/sites/qhse/Documents/refreshed-deleted.pdf'),'refreshed source aliases remain denied');
select ok(not project_document_private.location_visible('sharepoint','https://bbtm668.sharepoint.com/sites/qhse/Documents/delete-imported.pdf'),'the original historical location remains denied too');
select * from finish();
rollback;
