begin;
select no_plan();

insert into public.companies(code,name) values('category-edit-other','Category edit other company');
insert into auth.users(id,email) select ('a6810000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'category-edit-'||n||'@example.invalid' from generate_series(1,8)n;
insert into public.profiles(id,email,display_name,active_company_id)
select actor.id,actor.email,'Category edit fixture',company.id from auth.users actor join public.companies company
  on company.code=case when right(actor.id::text,1)='6' then 'category-edit-other' else 'bbtm' end where actor.id::text like 'a6810000-%';
insert into public.company_memberships(company_id,user_id,active) select active_company_id,id,true from public.profiles where id::text like 'a6810000-%'
  on conflict(company_id,user_id) do update set active=true;
update public.company_memberships set active=false where user_id='a6810000-0000-0000-0000-000000000007';
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,(array['admin','direction','armement','capitaine','marin','admin','admin'])[right(id::text,1)::integer]
from public.profiles where id::text like 'a6810000-%' and right(id::text,1)<>'8';
insert into public.vessels(company_id,name,active,asset_kind) select id,'CATEGORY-EDIT-VESSEL',true,'vessel' from public.companies where code='bbtm';
insert into public.projects(company_id,title,project_code) select id,'CATEGORY-EDIT-PROJECT-'||n,'CATEGORY-EDIT-'||n from public.companies cross join generate_series(1,3)n where code='bbtm';
insert into public.projects(company_id,title,project_code) select id,'CATEGORY-EDIT-PROJECT-4','CATEGORY-EDIT-4' from public.companies where code='category-edit-other';
update public.projects set archived_at=now() where title='CATEGORY-EDIT-PROJECT-3';
insert into public.planning_projects(company_id,title,catalog_project_id,primary_vessel_id,starts_on,ends_on)
select project.company_id,project.title,project.id,vessel.id,current_date,current_date from public.projects project join public.vessels vessel on vessel.name='CATEGORY-EDIT-VESSEL' where project.title='CATEGORY-EDIT-PROJECT-1';
insert into public.project_document_categories(company_id,category_key,parent_key,label,display_order,active)
select company.id,item.key,item.parent,item.label,99,item.active from public.companies company cross join(values
  ('category_edit_retired',null::text,'Classement retiré',false),('category_edit_sub_retired','hse','Sous-classement retiré',false),
  ('category_edit_import_sub','hse','Documents importés',true),('category_edit_original_commercial',null::text,'Facturation',true)
)item(key,parent,label,active) where company.code='bbtm';
insert into public.project_document_categories(company_id,category_key,parent_key,label,display_order,active)
select id,'category_edit_foreign_only',null,'Foreign category',99,true from public.companies where code='category-edit-other';

create temporary table category_refs(key text primary key,value text);
grant all on category_refs to authenticated;
insert into category_refs select 'project-'||right(title,1),id::text from public.projects where title like 'CATEGORY-EDIT-PROJECT-%';
create function pg_temp.ref(text) returns text language sql stable as $$select value from category_refs where key=$1$$;
create function pg_temp.actor(integer) returns text language sql as $$select set_config('request.jwt.claim.sub','a6810000-0000-0000-0000-'||lpad($1::text,12,'0'),true)$$;

insert into public.project_generated_documents(company_id,project_id,document_type,revision,file_name,mime_type,file_size_bytes,sha256,storage_bucket,storage_path,category_key,subcategory_key,sharepoint_web_url,sharepoint_drive_id,sharepoint_drive_item_id,sharepoint_folder_path)
select project.company_id,project.id,item.kind,1,'category-edit-'||item.key||'.pdf','application/pdf',12,repeat('a',64),case when item.url is null then 'project-files' end,
 case when item.url is null then 'projects/'||project.id||'/attachments/category-edit-'||item.path||'.pdf' end,item.category,item.subcategory,item.url,case when item.url is not null then 'category-edit-drive' end,case when item.url is not null then item.key end,case when item.url is not null then '/category-edit/' end
from public.projects project cross join(values
 ('generated-safe','project_attachment','hse','hse_procedure','safe',null::text),
 ('generated-operation','operation_attachment',null::text,null::text,'operation',null::text),
 ('generated-billing','project_attachment','billing',null::text,'commercial-bytes',null::text),
 ('generated-storage-alias','project_attachment','hse',null::text,'storage-alias',null::text),
 ('generated-subcategory-alias','project_attachment','hse',null::text,'subcategory-alias',null::text),
 ('generated-contract','bimco_supplytime',null::text,null::text,'contract',null::text),
 ('generated-offer','offer',null::text,null::text,'offer',null::text),
 ('generated-custom-commercial','project_attachment','category_edit_original_commercial',null::text,'custom-commercial',null::text),
 ('generated-url-alias','project_attachment','hse',null::text,'url-alias','https://bbtm668.sharepoint.com/sites/qhse/Documents/category-edit-commercial.pdf')
)item(key,kind,category,subcategory,path,url) where project.title='CATEGORY-EDIT-PROJECT-1';
insert into public.project_generated_documents(company_id,project_id,document_type,revision,file_name,mime_type,file_size_bytes,sha256,storage_bucket,storage_path,category_key)
select company_id,id,'project_attachment',1,'category-edit-generated-other.pdf','application/pdf',12,repeat('a',64),'project-files','projects/'||id||'/attachments/other.pdf','hse' from public.projects where title='CATEGORY-EDIT-PROJECT-2';
insert into public.project_documents(company_id,project_id,title,file_name,mime_type,file_url,category_key,is_folder,source_payload,sharepoint_drive_id,sharepoint_drive_item_id)
select project.company_id,project.id,'category-edit-'||item.key,'category-edit-'||item.key||'.pdf','application/pdf',item.url,item.category,item.folder,
 '{"source":"immutable fixture"}'::jsonb,'category-edit-drive',item.key
from public.projects project cross join(values
 ('project-safe','hse',false,'https://bbtm668.sharepoint.com/sites/qhse/Documents/category-edit-safe.pdf'),
 ('project-unknown','project_document',false,'https://bbtm668.sharepoint.com/sites/qhse/Documents/category-edit-unknown.pdf'),
 ('project-commercial','contractDocument',false,'https://bbtm668.sharepoint.com/sites/qhse/Documents/category-edit-commercial.pdf'),
 ('project-storage-commercial','contractDocument',false,'storage-commercial-placeholder'),
 ('project-subcategory-alias','hse',false,'storage-subcategory-placeholder')
)item(key,category,folder,url) where project.title='CATEGORY-EDIT-PROJECT-1';
update public.project_documents document set file_url='projects/'||document.project_id||'/attachments/category-edit-storage-alias.pdf' where document.title='category-edit-project-storage-commercial';
update public.project_documents document set file_url='projects/'||document.project_id||'/attachments/category-edit-subcategory-alias.pdf' where document.title='category-edit-project-subcategory-alias';
insert into public.contract_documents(company_id,project_id,title,file_name,mime_type,file_url,category_key,is_folder,source_payload,sharepoint_drive_id,sharepoint_drive_item_id)
select company_id,id,'category-edit-contract-safe','category-edit-contract-safe.pdf','application/pdf','https://bbtm668.sharepoint.com/sites/qhse/Documents/category-edit-contract.pdf',
 'contract_document',false,'{"source":"immutable fixture"}'::jsonb,'category-edit-drive','contract-safe' from public.projects where title='CATEGORY-EDIT-PROJECT-1';
insert into category_refs select replace(replace(file_name,'category-edit-',''),'.pdf',''),'generated:'||id from public.project_generated_documents where file_name like 'category-edit-%';
insert into category_refs select replace(title,'category-edit-',''),'project:'||id from public.project_documents where title like 'category-edit-%';
insert into category_refs select replace(title,'category-edit-',''),'contract:'||id from public.contract_documents where title like 'category-edit-%';
insert into storage.objects(bucket_id,name) select distinct storage_bucket,storage_path from public.project_generated_documents where file_name like 'category-edit-%' and storage_bucket is not null;

create function pg_temp.document(p_key text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; namespaced text:=(select value from pg_temp.category_refs where key=p_key); kind text:=split_part(namespaced,':',1); document_id bigint:=split_part(namespaced,':',2)::bigint;
begin
 if kind='generated' then select to_jsonb(item) into result from public.project_generated_documents item where item.id=document_id;
 elsif kind='project' then select to_jsonb(item) into result from public.project_documents item where item.id=document_id;
 else select to_jsonb(item) into result from public.contract_documents item where item.id=document_id; end if; return result;
end;
$$;
create function pg_temp.change(p_key text,p_category text,p_subcategory text,p_expected_category text,p_expected_subcategory text) returns jsonb language sql as $$
 select public.projects_set_document_category(pg_temp.ref('project-1')::bigint,pg_temp.ref(p_key),p_category,p_subcategory,p_expected_category,p_expected_subcategory);
$$;
create function pg_temp.excluded(p_key text) returns boolean language sql stable security definer set search_path='' as $$
 select project_document_private.was_commercial(split_part(value,':',1),split_part(value,':',2)::bigint) from pg_temp.category_refs where key=p_key;
$$;
create function pg_temp.audit_count(p_key text) returns bigint language sql stable security definer set search_path='' as $$
 select count(*) from public.project_change_log where entity_id=split_part((select value from pg_temp.category_refs where key=p_key),':',2)::bigint
 and entity_type=case split_part((select value from pg_temp.category_refs where key=p_key),':',1) when 'generated' then 'project_generated_documents' when 'project' then 'project_documents' else 'contract_documents' end and action='update';
$$;
create temporary table category_data(key text primary key,value jsonb);
grant all on category_data to authenticated;
insert into category_data values('generated-before',pg_temp.document('generated-safe')),('project-before',pg_temp.document('project-safe')),('contract-before',pg_temp.document('contract-safe'));

select ok(not (select prosecdef from pg_proc where oid='public.projects_set_document_category(bigint,text,text,text,text,text)'::regprocedure),'public classification API remains an invoker wrapper');
select ok(not has_function_privilege('anon','public.projects_set_document_category(bigint,text,text,text,text,text)','EXECUTE'),'anonymous cannot classify project files');
select ok(not has_function_privilege('authenticated','project_document_private.was_commercial(text,bigint)','EXECUTE'),'private provenance helper cannot be called directly');
select ok((select relrowsecurity from pg_class where oid='project_document_private.original_classifications'::regclass),'provenance table is protected by RLS');
select ok(pg_temp.excluded('project-commercial'),'reserved raw imported contract key is intrinsically protected even without catalog row');
select ok(not pg_temp.excluded('project-unknown'),'unknown legacy key is not confused with commercial provenance');
select ok(pg_temp.excluded('generated-billing'),'original billing attachment is commercial provenance');
select ok(pg_temp.excluded('generated-custom-commercial'),'original commercial label is captured');

set local role authenticated;
select pg_temp.actor(1);
select throws_ok($$select * from project_document_private.original_classifications$$,'42501',null,'real manager cannot read private provenance');
select throws_ok($$update project_document_private.original_classifications set sea_operation_excluded=false$$,'42501',null,'real manager cannot rewrite provenance');
select is(pg_temp.change('generated-safe','hse','hse_audits','hse','hse_procedure'),jsonb_build_object('project_id',pg_temp.ref('project-1'),'document_id',pg_temp.ref('generated-safe'),'category_key','hse','subcategory_key','hse_audits'),'Admin changes generated classification with typed acknowledgement');
select is(pg_temp.document('generated-safe')->>'subcategory_key','hse_audits','generated subcategory is persisted');
select is(pg_temp.audit_count('generated-safe'),1::bigint,'generated metadata change has one classification audit entry');
select is(pg_temp.document('generated-safe')-array['category_key','subcategory_key'],(select value from category_data where key='generated-before')-array['category_key','subcategory_key'],'generated file bytes/hash/revision/paths and original type remain unchanged');
select lives_ok($$select pg_temp.change('generated-safe','hse','hse_audits','billing',null)$$,'same desired classification is an idempotent retry');
select is(pg_temp.audit_count('generated-safe'),1::bigint,'idempotent retry creates no duplicate audit');
select throws_ok($$select pg_temp.change('generated-safe','billing',null,'hse','hse_procedure')$$,'40001',null,'stale classification fails instead of overwriting another manager');
select is(pg_temp.document('generated-safe')->>'subcategory_key','hse_audits','stale write is atomic');
select throws_ok($$select pg_temp.change('generated-safe','category_edit_retired',null,'hse','hse_audits')$$,'22023',null,'retired target root is rejected');
select throws_ok($$select pg_temp.change('generated-safe','hse','category_edit_sub_retired','hse','hse_audits')$$,'22023',null,'retired target subcategory is rejected');
select throws_ok($$select pg_temp.change('generated-safe','billing','hse_procedure','hse','hse_audits')$$,'22023',null,'subcategory must belong to requested root');
select throws_ok($$select pg_temp.change('generated-safe','hse_procedure',null,'hse','hse_audits')$$,'22023',null,'subcategory cannot be used as root');
select throws_ok($$select pg_temp.change('generated-safe','category_edit_foreign_only',null,'hse','hse_audits')$$,'22023',null,'category from another company is rejected');
select throws_ok($$select public.projects_set_document_category(pg_temp.ref('project-1')::bigint,'generated:9223372036854775808','hse',null,null,null)$$,'22023',null,'overflow IDs fail validation');
select throws_ok($$select public.projects_set_document_category(pg_temp.ref('project-1')::bigint,'other:12','hse',null,null,null)$$,'22023',null,'unknown document namespace is rejected');
select throws_ok($$select public.projects_set_document_category(pg_temp.ref('project-1')::bigint,'project:9223372036854775807','hse',null,null,null)$$,'42501',null,'missing imported documents are rejected');
select throws_ok($$select pg_temp.change('generated-other','hse','hse_procedure','hse',null)$$,'42501',null,'a file from another same-company project cannot be targeted by forged ID');
select throws_ok($$select public.projects_set_document_category(pg_temp.ref('project-4')::bigint,pg_temp.ref('generated-safe'),'hse',null,'hse','hse_audits')$$,'42501',null,'foreign project is refused');
select throws_ok($$select public.projects_set_document_category(pg_temp.ref('project-3')::bigint,pg_temp.ref('generated-safe'),'hse',null,'hse','hse_audits')$$,'42501',null,'closed project cannot be classified');

select pg_temp.actor(2);
select lives_ok($$select pg_temp.change('project-safe','hse','category_edit_import_sub','hse',null)$$,'Direction changes an imported project document');
select is(pg_temp.document('project-safe')->>'subcategory_key','category_edit_import_sub','imported project subcategory is persisted');
select is(pg_temp.document('project-safe')-array['category_key','subcategory_key','updated_at','updated_by'],(select value from category_data where key='project-before')-array['category_key','subcategory_key','updated_at','updated_by'],'source payload and every imported binary/source identity remain unchanged');
select is(pg_temp.document('project-safe')->>'updated_by','a6810000-0000-0000-0000-000000000002','imported update records real Direction actor');
select lives_ok($$select pg_temp.change('contract-safe','hse','hse_audits','contract_document',null)$$,'Direction may reclassify contract-source metadata');
select is(pg_temp.document('contract-safe')->>'subcategory_key','hse_audits','contract-source subcategory persists');
select is(pg_temp.document('contract-safe')-array['category_key','subcategory_key','updated_at','updated_by'],(select value from category_data where key='contract-before')-array['category_key','subcategory_key','updated_at','updated_by'],'contract source identity and private URL remain unchanged');
select ok(pg_temp.excluded('contract-safe'),'contract source stays intrinsically excluded');

reset role;
select set_config('request.jwt.claim.sub','',true);
update public.project_documents set category_key='project_document',subcategory_key=null,source_payload='{"source":"refreshed fixture"}'::jsonb
  where id=split_part(pg_temp.ref('project-safe'),':',2)::bigint;
update public.contract_documents set category_key='contract_document',subcategory_key=null,source_payload='{"source":"refreshed fixture"}'::jsonb
  where id=split_part(pg_temp.ref('contract-safe'),':',2)::bigint;
select is(pg_temp.document('project-safe')->>'category_key','hse','service refresh preserves imported manual root classification');
select is(pg_temp.document('project-safe')->>'subcategory_key','category_edit_import_sub','service refresh preserves imported manual child classification');
select is(pg_temp.document('contract-safe')->>'category_key','hse','service refresh preserves contract-source manual root classification');
select is(pg_temp.document('contract-safe')->>'subcategory_key','hse_audits','service refresh preserves contract-source manual child classification');
select is(pg_temp.document('project-safe')->'source_payload','{"source":"refreshed fixture"}'::jsonb,'service refresh still updates unrelated project source metadata');
select is(pg_temp.document('contract-safe')->'source_payload','{"source":"refreshed fixture"}'::jsonb,'service refresh still updates unrelated contract source metadata');
set local role authenticated;
select pg_temp.actor(2);
select lives_ok($$select pg_temp.change('project-safe','hse','hse_procedure','hse','category_edit_import_sub')$$,'genuine subsequent manager edit replaces manual imported classification');
select lives_ok($$select pg_temp.change('project-safe','hse','category_edit_import_sub','hse','hse_procedure')$$,'manager may restore prior classification after refresh');

select lives_ok($$select pg_temp.change('project-unknown','hse','hse_procedure','project_document',null)$$,'unknown legacy document can receive a valid operational classification');
select lives_ok($$select public.set_project_sea_operation_document(pg_temp.ref('project-1')::bigint,pg_temp.ref('project-unknown'),true)$$,'newly classified ordinary document is explicitly selectable');
select lives_ok($$select public.set_project_sea_operation_document(pg_temp.ref('project-1')::bigint,pg_temp.ref('generated-safe'),true)$$,'ordinary generated document is explicitly selectable');
select lives_ok($$select public.set_project_sea_operation_document(pg_temp.ref('project-1')::bigint,pg_temp.ref('project-safe'),true)$$,'ordinary imported document is explicitly selectable');
select lives_ok($$select pg_temp.change('generated-safe','billing',null,'hse','hse_audits')$$,'ordinary HSE document can be moved to billing');
select ok(not exists(select 1 from jsonb_array_elements(public.project_sea_operation_documents(pg_temp.ref('project-1')::bigint)->'documents') item where item->>'id'=pg_temp.ref('generated-safe')),'billing document disappears from operational selection catalog');
select lives_ok($$select pg_temp.change('generated-safe','hse','hse_procedure','billing',null)$$,'ordinary document may return from billing to HSE');
select ok(not pg_temp.excluded('generated-safe'),'first HSE provenance remains false after temporary billing assignment');
select is((select (item->>'selected')::boolean from jsonb_array_elements(public.project_sea_operation_documents(pg_temp.ref('project-1')::bigint)->'documents') item where item->>'id'=pg_temp.ref('generated-safe')),false,'returning to HSE never automatically reselects the document');
select is((select (item->>'selected')::boolean from jsonb_array_elements(public.project_sea_operation_documents(pg_temp.ref('project-1')::bigint)->'documents') item where item->>'id'=pg_temp.ref('project-safe')),true,'reclassifying one document preserves other explicit document selections');
select lives_ok($$select pg_temp.change('project-commercial','hse',null,'contractDocument',null)$$,'imported commercial metadata can be reorganized without changing commercial provenance');
select lives_ok($$select pg_temp.change('project-storage-commercial','hse',null,'contractDocument',null)$$,'original imported commercial storage alias can be relabeled but retains provenance');
select lives_ok($$select pg_temp.change('generated-billing','hse',null,'billing',null)$$,'original billing metadata can be reorganized without granting SeaOps access');
select lives_ok($$select pg_temp.change('generated-contract','hse',null,null,null)$$,'generated contract classification may change without changing original document type');
select lives_ok($$select pg_temp.change('generated-offer','hse',null,null,null)$$,'generated offer classification may change without changing original type');
select throws_ok($$select public.set_project_sea_operation_document(pg_temp.ref('project-1')::bigint,pg_temp.ref('project-commercial'),true)$$,'42501',null,'reclassified imported contract cannot be exposed to SeaOps');
select throws_ok($$select public.set_project_sea_operation_document(pg_temp.ref('project-1')::bigint,pg_temp.ref('generated-billing'),true)$$,'42501',null,'reclassified original billing attachment cannot be exposed');
select throws_ok($$select public.set_project_sea_operation_document(pg_temp.ref('project-1')::bigint,pg_temp.ref('generated-contract'),true)$$,'42501',null,'reclassified generated contract remains excluded by intrinsic type');
select throws_ok($$select public.set_project_sea_operation_document(pg_temp.ref('project-1')::bigint,pg_temp.ref('generated-offer'),true)$$,'42501',null,'reclassified generated offer remains excluded by type');
select throws_ok($$select public.set_project_sea_operation_document(pg_temp.ref('project-1')::bigint,pg_temp.ref('contract-safe'),true)$$,'22023',null,'contract source never becomes an operational selection namespace');
select lives_ok($$select public.set_project_sea_operation_document(pg_temp.ref('project-1')::bigint,pg_temp.ref('generated-url-alias'),true)$$,'safe-looking URL alias can be selected as metadata');
select lives_ok($$select public.set_project_sea_operation_document(pg_temp.ref('project-1')::bigint,pg_temp.ref('generated-storage-alias'),true)$$,'safe-looking Storage alias can be selected as metadata');

select lives_ok($$select public.set_project_sea_operation_document(pg_temp.ref('project-1')::bigint,pg_temp.ref('generated-subcategory-alias'),true)$$,'safe-looking subcategory storage alias can be selected as metadata');
reset role;
update public.project_documents set subcategory_key='commercial_contract' where title='category-edit-project-subcategory-alias';
set local role authenticated;
select pg_temp.actor(4);
select throws_ok($$select public.sea_operation_project_document_access(pg_temp.ref('project-1')::bigint,pg_temp.ref('generated-subcategory-alias'))$$,'42501',null,'imported current commercial subcategory blocks shared storage alias even when original category was HSE');
select throws_ok($$select public.sea_operation_project_document_access(pg_temp.ref('project-1')::bigint,pg_temp.ref('generated-url-alias'))$$,'42501',null,'real Capitaine cannot open alias to a reclassified imported commercial URL');
select throws_ok($$select public.sea_operation_project_document_access(pg_temp.ref('project-1')::bigint,pg_temp.ref('generated-storage-alias'))$$,'42501',null,'real Capitaine cannot open alias to reclassified original billing bytes');
select throws_ok($$select pg_temp.change('project-safe','billing',null,'hse','category_edit_import_sub')$$,'42501',null,'real Capitaine cannot use Project manager classification API');
select pg_temp.actor(5);
select throws_ok($$select pg_temp.change('project-safe','billing',null,'hse','category_edit_import_sub')$$,'42501',null,'real Marin cannot use Project manager classification API');
select pg_temp.actor(3);
select throws_ok($$select pg_temp.change('project-safe','billing',null,'hse','category_edit_import_sub')$$,'42501',null,'Armement does not gain new Project-manager RPC rights');
select lives_ok($$update public.project_documents set category_key='billing',subcategory_key=null where id=split_part(pg_temp.ref('project-safe'),':',2)::bigint$$,'pre-existing Armement canonical metadata DML permission remains unchanged');
select ok(not pg_temp.excluded('project-safe'),'legacy direct metadata update cannot overwrite original provenance');
select pg_temp.actor(7);
select throws_ok($$select pg_temp.change('project-safe','hse',null,'billing',null)$$,'42501',null,'inactive manager membership is rejected');
select pg_temp.actor(8);
select throws_ok($$select pg_temp.change('project-safe','hse',null,'billing',null)$$,'42501',null,'membership without a Project manager role is rejected');
select pg_temp.actor(6);
select throws_ok($$select pg_temp.change('project-safe','hse',null,'billing',null)$$,'42501',null,'foreign-company manager cannot reclassify own-company document ID');
reset role;
select throws_ok($$update public.project_document_categories set parent_key='billing' where category_key='category_edit_import_sub' and company_id=(select company_id from public.projects where id=pg_temp.ref('project-1')::bigint)$$,'22023',null,'an imported referenced subcategory cannot be reparented');
update public.project_document_categories set label='Archives' where category_key='category_edit_original_commercial' and company_id=(select company_id from public.projects where id=pg_temp.ref('project-1')::bigint);
set local role authenticated;
select pg_temp.actor(1);
select lives_ok($$select pg_temp.change('generated-custom-commercial','hse',null,'category_edit_original_commercial',null)$$,'renamed commercial original category may be reorganized');
select ok(pg_temp.excluded('generated-custom-commercial'),'commercial boolean survives later category-label renaming');
select throws_ok($$select public.set_project_sea_operation_document(pg_temp.ref('project-1')::bigint,pg_temp.ref('generated-custom-commercial'),true)$$,'42501',null,'renaming original commercial label never unlocks later HSE relabel');

reset role;
select pg_temp.actor(1);
set local role authenticated;
select lives_ok($$select public.set_project_sea_operation_document(pg_temp.ref('project-1')::bigint,pg_temp.ref('generated-operation'),true)$$,'manager explicitly selects never-overridden file before privileged import');
reset role;
select set_config('request.jwt.claim.sub','',true);
select lives_ok($$update public.project_generated_documents set category_key='hse',subcategory_key='hse_audits' where id=split_part(pg_temp.ref('generated-operation'),':',2)::bigint$$,'system metadata import without auth.uid can prune an existing selection');
select pg_temp.actor(1);
set local role authenticated;
select is((select (item->>'selected')::boolean from jsonb_array_elements(public.project_sea_operation_documents(pg_temp.ref('project-1')::bigint)->'documents') item where item->>'id'=pg_temp.ref('generated-operation')),false,'system reclassification leaves file unchecked');
select * from finish();
rollback;