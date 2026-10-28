begin;
select no_plan();

insert into public.companies(code,name) values('sea-selection-other','Sea selection isolation');
insert into auth.users(id,email)
select ('a6330000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'sea-selection-'||n||'@example.invalid' from generate_series(1,6)n;
insert into public.profiles(id,email,display_name,active_company_id)
select fixture.id,fixture.email,'Sea selection fixture',company.id from auth.users fixture join public.companies company
  on company.code = case when right(fixture.id::text,1)='4' then 'sea-selection-other' else 'bbtm' end where fixture.id::text like 'a6330000-%';
insert into public.company_memberships(company_id,user_id,active)
select active_company_id,id,true from public.profiles where id::text like 'a6330000-%'
on conflict(company_id,user_id) do update set active=true;
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,case right(id::text,1) when '1' then 'marin' when '2' then 'capitaine' when '3' then 'armement' when '6' then 'direction' else 'admin' end
from public.profiles where id::text like 'a6330000-%';
insert into public.vessels(company_id,name,active,asset_kind)
select id,'SEA-SELECTION-VESSEL',true,'vessel' from public.companies where code='bbtm';
insert into public.projects(company_id,title,project_code)
select id,'SEA-SELECTION-PROJECT-'||n,'SEA-SELECTION-'||n from public.companies cross join generate_series(1,3)n where code='bbtm';
insert into public.projects(company_id,title,project_code)
select id,'SEA-SELECTION-PROJECT-5','SEA-SELECTION-5' from public.companies where code='bbtm';
insert into public.projects(company_id,title,project_code)
select id,'SEA-SELECTION-PROJECT-4','SEA-SELECTION-4' from public.companies where code='sea-selection-other';
update public.projects set archived_at=now() where title='SEA-SELECTION-PROJECT-3';
insert into public.planning_projects(company_id,title,catalog_project_id,primary_vessel_id,starts_on,ends_on)
select project.company_id,project.title,project.id,vessel.id,current_date,current_date
from public.projects project join public.vessels vessel on vessel.name='SEA-SELECTION-VESSEL' where project.title='SEA-SELECTION-PROJECT-1';
insert into public.project_document_categories(company_id,category_key,parent_key,label,display_order,active)
select id,'sea_selection_billing_child','billing','Historique de facturation',99,false from public.companies where code='bbtm';

create temporary table sea_selection_fixture(key text primary key,project_id bigint,document_id text,path text);
grant all on sea_selection_fixture to authenticated;
insert into sea_selection_fixture(key,project_id) select 'project-'||right(title,1),id from public.projects where title like 'SEA-SELECTION-PROJECT-%';
insert into public.project_generated_documents(company_id,project_id,document_type,revision,file_name,mime_type,file_size_bytes,sha256,storage_bucket,storage_path,category_key,subcategory_key)
select project.company_id,project.id,item.kind,1,'sea-selection-'||item.key||'.pdf','application/pdf',12,repeat('a',64),'project-files',
  'projects/'||project.id||'/attachments/'||item.key||'.pdf',item.category,item.subcategory
from public.projects project cross join (values
  ('safe','project_attachment','hse','hse_procedure'),('operation','operation_attachment',null::text,null::text),
  ('offer','project_attachment','commercial_offer',null::text),('billing-child','project_attachment','billing','sea_selection_billing_child'),
  ('generated-contract','towage_contract','hse',null::text)
) item(key,kind,category,subcategory) where project.title='SEA-SELECTION-PROJECT-1';
insert into public.project_generated_documents(company_id,project_id,document_type,revision,file_name,mime_type,file_size_bytes,sha256,storage_bucket,storage_path)
select company_id,id,'operation_attachment',1,'sea-selection-other-'||right(title,1)||'.pdf','application/pdf',12,repeat('a',64),
  'project-files','projects/'||id||'/attachments/other.pdf' from public.projects where title in ('SEA-SELECTION-PROJECT-2','SEA-SELECTION-PROJECT-3','SEA-SELECTION-PROJECT-4');
insert into sea_selection_fixture(key,project_id,document_id,path)
select replace(replace(file_name,'sea-selection-',''),'.pdf',''),project_id,'generated:'||id,storage_path
from public.project_generated_documents where file_name like 'sea-selection-%.pdf';
insert into public.project_documents(company_id,project_id,title,file_name,mime_type,file_url,category_key,is_folder,sharepoint_drive_id,sharepoint_drive_item_id)
select company_id,id,'sea-selection-legacy','sea-selection-legacy.pdf','application/pdf','https://bbtm668.sharepoint.com/sites/qhse/Documents/selection.pdf',
  'hse',false,'sea-selection-drive','legacy' from public.projects where title='SEA-SELECTION-PROJECT-1';
insert into sea_selection_fixture(key,project_id,document_id,path)
select 'legacy',project_id,'project:'||id,file_url from public.project_documents where title='sea-selection-legacy';
insert into storage.objects(bucket_id,name) select 'project-files',path from sea_selection_fixture where key in('safe','operation');

set local role authenticated;
select set_config('request.jwt.claim.sub','a6330000-0000-0000-0000-000000000001',true);
select is(jsonb_array_length(public.sea_operation_project_documents((select project_id from sea_selection_fixture where key='project-1'))),3,'unconfigured project preserves all eligible documents for real Marin');
select throws_ok($$select public.project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'))$$,'42501',null,'Marin cannot inspect the manager selection catalog');
select throws_ok($$select public.set_project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'),'{}'::text[])$$,'42501',null,'Marin cannot change project document visibility');
select set_config('request.jwt.claim.sub','a6330000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'))$$,'42501',null,'Capitaine cannot inspect the manager selection catalog');
select throws_ok($$select public.set_project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'),'{}'::text[])$$,'42501',null,'Capitaine cannot change project document visibility');
select lives_ok($$select public.sea_operation_project_document_access((select project_id from sea_selection_fixture where key='safe'),(select document_id from sea_selection_fixture where key='safe'))$$,'Capitaine obtains a grant before the document is deselected');
select is(sea_operation_private.can_read_project_document_object('project-files',(select path from sea_selection_fixture where key='safe')),true,'the exact authorized safe object is initially readable');
select set_config('request.jwt.claim.sub','a6330000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.set_project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'),'{}'::text[])$$,'42501',null,'Armement cannot change a Project manager selection');

select set_config('request.jwt.claim.sub','a6330000-0000-0000-0000-000000000005',true);
select is(public.project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'))->'configured','false'::jsonb,'missing selection is distinct from an explicit empty selection');
select is(jsonb_array_length(public.project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'))->'documents'),3,'manager catalog contains eligible generated and historical documents');
select is((select count(*)::integer from jsonb_array_elements(public.project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'))->'documents') document where (document->>'selected')::boolean),3,'all legacy eligible documents are initially selected');
select ok(not exists(select 1 from jsonb_array_elements(public.project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'))->'documents') document
  where document ? 'source_path' or document ? 'storage_path' or document ? 'sharepoint_url' or document ? 'file_url'),'manager catalog does not disclose private locations or URLs');
select throws_ok($$select public.set_project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'),array[(select document_id from sea_selection_fixture where key='offer')])$$,'42501',null,'commercial offer cannot be selected by forged ID');
select throws_ok($$select public.set_project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'),array[(select document_id from sea_selection_fixture where key='billing-child')])$$,'42501',null,'retired billing descendants cannot be selected');
select throws_ok($$select public.set_project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'),array[(select document_id from sea_selection_fixture where key='generated-contract')])$$,'42501',null,'a generated commercial contract labeled HSE stays excluded');
select throws_ok($$select public.set_project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'),array[(select document_id from sea_selection_fixture where key='other-2')])$$,'42501',null,'eligible document from another project cannot be selected');
select throws_ok($$select public.set_project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'),array[(select document_id from sea_selection_fixture where key='other-4')])$$,'42501',null,'eligible document from another company cannot be selected');
select throws_ok($$select public.set_project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'),array['generated:0'])$$,'22023',null,'malformed document ID is rejected');
select throws_ok($$select public.set_project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'),null::text[])$$,'22023',null,'null is not silently converted into an empty selection');
select throws_ok($$select public.set_project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'),array[null::text])$$,'22023',null,'null array element is rejected');
select throws_ok($$select public.set_project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'),array[['generated:1'],['generated:2']])$$,'22023',null,'multidimensional array is rejected');
select is(public.project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'))->'configured','false'::jsonb,'rejected selections leave legacy behavior unchanged');
select is(public.set_project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'),array[(select document_id from sea_selection_fixture where key='operation')])->'configured','true'::jsonb,'first manager save creates the explicit selection');

select set_config('request.jwt.claim.sub','a6330000-0000-0000-0000-000000000002',true);
select is(jsonb_array_length(public.sea_operation_project_documents((select project_id from sea_selection_fixture where key='project-1'))),1,'real Capitaine sees only the selected document');
select throws_ok($$select public.sea_operation_project_document_access((select project_id from sea_selection_fixture where key='safe'),(select document_id from sea_selection_fixture where key='safe'))$$,'42501',null,'deselected document ID cannot be reopened directly');
select is(sea_operation_private.can_read_project_document_object('project-files',(select path from sea_selection_fixture where key='safe')),false,'deselection revokes the previous object grant');
select is((select count(*)::integer from storage.objects where bucket_id='project-files' and name=(select path from sea_selection_fixture where key='safe')),0,'Storage RLS cannot reuse the deselected object grant');
select lives_ok($$select public.sea_operation_project_document_access((select project_id from sea_selection_fixture where key='operation'),(select document_id from sea_selection_fixture where key='operation'))$$,'selected document remains accessible');
select set_config('request.jwt.claim.sub','a6330000-0000-0000-0000-000000000001',true);
select is(jsonb_array_length(public.sea_operation_project_documents((select project_id from sea_selection_fixture where key='project-1'))),1,'real Marin receives the same allow-list');

reset role;
insert into public.project_generated_documents(company_id,project_id,document_type,revision,file_name,mime_type,file_size_bytes,sha256,storage_bucket,storage_path)
select company_id,id,'operation_attachment',1,'sea-selection-new.pdf','application/pdf',12,repeat('a',64),'project-files','projects/'||id||'/attachments/new.pdf'
from public.projects where title='SEA-SELECTION-PROJECT-1';
insert into sea_selection_fixture(key,project_id,document_id,path)
select 'new',project_id,'generated:'||id,storage_path from public.project_generated_documents where file_name='sea-selection-new.pdf';
set local role authenticated;
select set_config('request.jwt.claim.sub','a6330000-0000-0000-0000-000000000005',true);
select is((select document->'selected' from jsonb_array_elements(public.project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'))->'documents') document where document->>'id'=(select document_id from sea_selection_fixture where key='new')),'false'::jsonb,'a document added after configuration starts unchecked');
select lives_ok($$select public.set_project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'),
  array(select document->>'id' from jsonb_array_elements(public.project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'))->'documents') document))$$,'manager may explicitly select every eligible current document');
select is((select count(*)::integer from jsonb_array_elements(public.project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'))->'documents') document where (document->>'selected')::boolean),4,'select all persists the complete allow-list');
select is(jsonb_array_length(public.set_project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'),'{}'::text[])->'documents'),4,'explicit empty selection keeps the entire manager catalog');
select is((select count(*)::integer from jsonb_array_elements(public.project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'))->'documents') document where (document->>'selected')::boolean),0,'explicit empty selection unchecks every manager candidate');
select set_config('request.jwt.claim.sub','a6330000-0000-0000-0000-000000000001',true);
select is(public.sea_operation_project_documents((select project_id from sea_selection_fixture where key='project-1')),'[]'::jsonb,'explicit empty selection exposes no operational documents');
select set_config('request.jwt.claim.sub','a6330000-0000-0000-0000-000000000006',true);
select lives_ok($$select public.set_project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'),array[(select document_id from sea_selection_fixture where key='legacy'),(select document_id from sea_selection_fixture where key='legacy')])$$,'Direction may select a historical document and duplicate IDs normalize safely');
select is((select count(*)::integer from jsonb_array_elements(public.project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'))->'documents') document where (document->>'selected')::boolean),1,'duplicate IDs do not duplicate selected documents');
select set_config('request.jwt.claim.sub','a6330000-0000-0000-0000-000000000002',true);
select lives_ok($$select public.sea_operation_project_document_access((select project_id from sea_selection_fixture where key='legacy'),(select document_id from sea_selection_fixture where key='legacy'))$$,'selected historical SharePoint document uses its existing trusted resolver');
select set_config('request.jwt.claim.sub','a6330000-0000-0000-0000-000000000004',true);
select throws_ok($$select public.project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'))$$,'42501',null,'foreign company admin cannot inspect the selection');
select throws_ok($$select public.set_project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'),'{}'::text[])$$,'42501',null,'foreign company admin cannot overwrite the selection');

reset role;
update public.role_module_permissions set is_visible=false where role_key in('admin','direction') and module_key='seaOperations';
set local role authenticated;
select set_config('request.jwt.claim.sub','a6330000-0000-0000-0000-000000000005',true);
select is(jsonb_array_length(public.project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'))->'documents'),4,'manager catalog works when Sea Operations module is hidden');
select is(jsonb_array_length(public.project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-2'))->'documents'),1,'manager configures a project before any planning occurrence exists');
select is(public.project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-5')),
  '{"configured":false,"documents":[]}'::jsonb,'empty candidate catalog preserves the missing configuration marker');
select is(public.set_project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-5'),'{}'::text[]),
  '{"configured":true,"documents":[]}'::jsonb,'empty candidate catalog can persist an explicitly empty selection');
select lives_ok($$select public.set_project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-2'),array[(select document_id from sea_selection_fixture where key='other-2')])$$,'manager saves an unplanned project while Sea Operations is hidden');
select throws_ok($$select public.sea_operation_project_documents((select project_id from sea_selection_fixture where key='project-1'))$$,'42501',null,'manager configuration does not bypass hidden Sea Operations module access');
select lives_ok($$select public.project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-3'))$$,'manager may inspect an archived project selection');
select throws_ok($$select public.set_project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-3'),'{}'::text[])$$,'42501',null,'archived project selection cannot be edited');
reset role;
update public.company_memberships set active=false where user_id='a6330000-0000-0000-0000-000000000005';
set local role authenticated;
select set_config('request.jwt.claim.sub','a6330000-0000-0000-0000-000000000005',true);
select throws_ok($$select public.project_sea_operation_documents((select project_id from sea_selection_fixture where key='project-1'))$$,'42501',null,'revoked company membership denies manager catalog');
reset role;

select ok(not has_function_privilege('anon','public.project_sea_operation_documents(bigint)','execute'),'anonymous caller cannot inspect manager selection');
select ok(not has_function_privilege('anon','public.set_project_sea_operation_documents(bigint,text[])','execute'),'anonymous caller cannot change selection');
select ok(not has_table_privilege('authenticated','sea_operation_private.project_document_selections','select,insert,update,delete'),'application cannot bypass guarded selection RPCs');
select ok(not has_function_privilege('authenticated','sea_operation_private.project_document_candidates(bigint,bigint)','execute'),'raw candidate catalog is not callable by the application');
select ok(not has_function_privilege('authenticated','sea_operation_private.project_document_category_eligible(bigint,text)','execute'),'raw category eligibility is not callable by the application');
select * from finish();
rollback;
