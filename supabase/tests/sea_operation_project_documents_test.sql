begin;
select no_plan();

insert into public.companies(code,name) values('sea-doc-other','Sea document isolation');
insert into auth.users(id,email) select ('a6320000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'sea-document-'||n||'@example.invalid' from generate_series(1,4)n;
insert into public.profiles(id,email,display_name,active_company_id)
select fixture.id,fixture.email,'Sea document fixture',company.id from auth.users fixture join public.companies company
on company.code = case when right(fixture.id::text,1)='4' then 'sea-doc-other' else 'bbtm' end where fixture.id::text like 'a6320000-%';
insert into public.company_memberships(company_id,user_id,active) select active_company_id,id,true from public.profiles where id::text like 'a6320000-%'
on conflict(company_id,user_id) do update set active=true;
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,case right(id::text,1) when '1' then 'marin' when '2' then 'capitaine' when '3' then 'armement' else 'admin' end from public.profiles where id::text like 'a6320000-%';
insert into public.vessels(company_id,name,active,asset_kind) select id,'SEA-DOC-VESSEL',true,'vessel' from public.companies where code='bbtm';
insert into public.projects(company_id,title,project_code) select id,'SEA-DOC-PROJECT-'||n,'SEA-DOC-'||n from public.companies cross join generate_series(1,3)n where code='bbtm';
insert into public.planning_projects(company_id,title,catalog_project_id,primary_vessel_id,starts_on,ends_on)
select project.company_id,project.title,project.id,vessel.id,current_date,current_date from public.projects project join public.vessels vessel on vessel.name='SEA-DOC-VESSEL'
where project.title in ('SEA-DOC-PROJECT-1','SEA-DOC-PROJECT-2');
insert into public.project_document_categories(company_id,category_key,parent_key,label,display_order,active)
select company.id,item.key,item.parent,item.label,99,item.active from public.companies company cross join (values
 ('sea_doc_billing_child','billing','Historique facturation',false),('sea_doc_hse_retired','hse','Procédure retirée',false),
 ('sea_doc_offer_custom',null::text,'Offre Commerciale',true),('sea_doc_offer_custom_child','sea_doc_offer_custom','Annexe personnalisée',true)
) item(key,parent,label,active) where company.code='bbtm';

create temporary table sea_doc_fixture(key text primary key,project_id bigint,document_id text,bucket text,path text);
grant all on sea_doc_fixture to authenticated;
insert into sea_doc_fixture(key,project_id) select 'project-'||right(title,1),id from public.projects where title like 'SEA-DOC-PROJECT-%';
insert into public.project_generated_documents(company_id,project_id,document_type,revision,file_name,mime_type,file_size_bytes,sha256,storage_bucket,storage_path,category_key,subcategory_key)
select project.company_id,project.id,item.kind,1,'sea-doc-'||item.key||'.pdf','application/pdf',12,repeat('a',64),'project-files',
 'projects/'||project.id||'/attachments/'||item.key||'.pdf',item.category,item.subcategory
from public.projects project cross join (values
 ('safe','project_attachment','hse','hse_procedure'),('retired','project_attachment','hse','sea_doc_hse_retired'),
 ('offer','project_attachment','commercial_offer',null::text),('contract','project_attachment','commercial_offer','commercial_contract'),
 ('billing','project_attachment','billing',null::text),('billing-child','project_attachment','billing','sea_doc_billing_child'),
 ('custom-offer','project_attachment','sea_doc_offer_custom','sea_doc_offer_custom_child'),
 ('generated-offer','offer','hse',null::text),('generated-contract','towage_contract','hse',null::text),
 ('operation','operation_attachment',null::text,null::text),('collision','project_attachment','hse',null::text),
 ('alias','project_attachment','hse',null::text),('drive','project_attachment','hse',null::text)
) item(key,kind,category,subcategory) where project.title='SEA-DOC-PROJECT-1';
insert into public.project_generated_documents(company_id,project_id,document_type,revision,file_name,mime_type,file_size_bytes,sha256,storage_bucket,storage_path,category_key)
select company_id,id,'project_attachment',1,'sea-doc-other-project.pdf','application/pdf',12,repeat('a',64),'project-files','projects/'||id||'/attachments/other.pdf','hse'
from public.projects where title='SEA-DOC-PROJECT-2';
insert into public.contract_documents(company_id,project_id,title,file_name,mime_type,source_label,storage_bucket,storage_path,storage_sha256,storage_migrated_at)
select company_id,project_id,'sea-doc-collision-contract','contract.pdf','application/pdf','fixture',storage_bucket,storage_path,repeat('a',64),now()
from public.project_generated_documents where file_name='sea-doc-collision.pdf';
insert into sea_doc_fixture(key,project_id,document_id,bucket,path)
select replace(replace(file_name,'sea-doc-',''),'.pdf',''),project_id,'generated:'||id,storage_bucket,storage_path from public.project_generated_documents where file_name like 'sea-doc-%.pdf';

insert into public.project_documents(company_id,project_id,title,file_name,mime_type,file_url,category_key,is_folder,sharepoint_drive_id,sharepoint_drive_item_id)
select project.company_id,project.id,'sea-doc-legacy-'||item.key,'legacy-'||item.key||'.pdf','application/pdf',
 'https://bbtm668.sharepoint.com/sites/qhse/Documents/'||item.key||'.pdf',item.category,item.folder,'sea-doc-drive',item.key
from public.projects project cross join(values ('safe','hse',false),('billing','billing',false),('offer','commercial_offer',false),
 ('unknown','project_document',false),('evil-host','hse',false)) item(key,category,folder) where project.title='SEA-DOC-PROJECT-1';
update public.project_documents set file_url='https://bbtm668.sharepoint.com.evil.example/sites/qhse/attack.pdf' where title='sea-doc-legacy-evil-host';
insert into sea_doc_fixture(key,project_id,document_id,path)
select replace(title,'sea-doc-',''),project_id,'project:'||id,file_url from public.project_documents where title like 'sea-doc-legacy-%';
insert into public.contract_documents(company_id,project_id,title,file_name,mime_type,file_url,category_key,is_folder,sharepoint_drive_id,sharepoint_drive_item_id)
select company_id,id,'sea-doc-legacy-contract','contract.pdf','application/pdf','https://bbtm668.sharepoint.com/sites/qhse/Documents/contract.pdf','contract_document',false,'sea-doc-drive','legacy-contract'
from public.projects where title='SEA-DOC-PROJECT-1';
insert into sea_doc_fixture(key,project_id,document_id) select 'legacy-contract',project_id,'contract:'||id from public.contract_documents where title='sea-doc-legacy-contract';

insert into storage.objects(bucket_id,name) select bucket,path from sea_doc_fixture where bucket='project-files' and key not in('alias','drive','collision-offer');
insert into public.project_drive_files(project_id,company_id,source_bucket,source_path,path,sha256,bytes,mime_type)
select fixture.project_id,project.company_id,fixture.bucket,fixture.path,'Projet-'||fixture.project_id||'/HSE/'||fixture.key||'.pdf',repeat('a',64),12,'application/pdf'
from sea_doc_fixture fixture join public.projects project on project.id=fixture.project_id where fixture.key in('alias','offer');
insert into sea_doc_fixture(key,project_id,path)
select 'alias-'||case when source_path like '%/alias.pdf' then 'safe' else 'offer' end,project_id,id::text from public.project_drive_files where source_path like '%/attachments/alias.pdf' or source_path like '%/attachments/offer.pdf';
insert into public.document_drive_files(source_bucket,source_path,drive_file_id,drive_path,file_name,mime_type,bytes,sha256,source_sha256,verified_at)
select bucket,path,'sea_doc_drive_file_id','Projet/Documents/drive.pdf','drive.pdf','application/pdf',12,repeat('a',64),repeat('a',64),now() from sea_doc_fixture where key='drive';
insert into public.document_blob_files(source_bucket,source_path,blob_pathname,blob_url,file_name,mime_type,bytes,sha256,source_sha256,verified_at,provenance)
select bucket,path,'documents/sea-doc/'||key||'.pdf','https://sea-doc-fixture.private.blob.vercel-storage.com/documents/'||key||'.pdf',key||'.pdf',
 'application/pdf',12,repeat('a',64),repeat('a',64),now(),'{}'::jsonb from sea_doc_fixture where key in('safe','offer','billing')
union all
select 'project-drive',file.id::text,'documents/sea-doc/alias-'||file.id||'.pdf','https://sea-doc-fixture.private.blob.vercel-storage.com/documents/alias-'||file.id||'.pdf',
 'alias.pdf','application/pdf',file.bytes,file.sha256,file.sha256,now(),jsonb_build_object('source_reference',file.path)
from public.project_drive_files file where file.id::text in(select path from sea_doc_fixture where key in('alias-safe','alias-offer'));

-- Explicit project selections are fixture setup. The opt-in workflow itself is
-- covered by project_sea_operation_document_selection_test.sql.
insert into sea_operation_private.project_document_selections(project_id,company_id,document_ids)
select project.id,project.company_id,array_agg(document.id order by document.id)
from public.projects project cross join lateral sea_operation_private.project_document_candidates(project.id,project.company_id) document
where project.title in('SEA-DOC-PROJECT-1','SEA-DOC-PROJECT-2') group by project.id,project.company_id;

-- Real profile identities, with no admin role override or simulated UI profile.
set local role authenticated;
select set_config('request.jwt.claim.sub','a6320000-0000-0000-0000-000000000001',true);
select is(jsonb_array_length(public.sea_operation_project_documents((select project_id from sea_doc_fixture where key='project-1'))),8,'real Marin sees only operational attachment and classified historical metadata');
select is((select count(*)::integer from jsonb_array_elements(public.sea_operation_project_documents((select project_id from sea_doc_fixture where key='project-1'))) document
  where document->>'title' in('sea-doc-offer.pdf','sea-doc-contract.pdf','sea-doc-billing.pdf','sea-doc-billing-child.pdf','sea-doc-custom-offer.pdf','sea-doc-generated-offer.pdf','sea-doc-generated-contract.pdf')),0,'commercial, billing, retired children, custom commercial categories and generated contracts are excluded server-side');
select ok(not exists(select 1 from jsonb_array_elements(public.sea_operation_project_documents((select project_id from sea_doc_fixture where key='project-1'))) document
  where document ? 'storage_path' or document ? 'sharepoint_url' or document ? 'file_url'),'list contains no private location or access URL');
select is((select count(*)::integer from public.project_documents where title like 'sea-doc-%'),0,'Marin receives no broad historical Project table access');
select is((select count(*)::integer from public.contract_documents where title like 'sea-doc-%'),0,'Marin receives no commercial contract table access');
select is(sea_operation_private.can_read_project_document_object('project-files',(select path from sea_doc_fixture where key='safe')),false,'knowing a safe path alone does not grant new Storage access');
select throws_ok($$select public.document_blob_lookup('project-files',(select path from sea_doc_fixture where key='safe'))$$,'42501',null,'private Blob wrapper requires an exact prior document authorization');
select lives_ok($$select public.sea_operation_project_document_access((select project_id from sea_doc_fixture where key='safe'),(select document_id from sea_doc_fixture where key='safe'))$$,'real Marin opens its selected project safe document');
select is(sea_operation_private.can_read_project_document_object('project-files',(select path from sea_doc_fixture where key='safe')),true,'exact authorized object receives a temporary read grant');
select is((select count(*)::integer from storage.objects where bucket_id='project-files' and name=(select path from sea_doc_fixture where key='safe')),1,'Storage RLS accepts the authorized safe object');
select is(public.document_blob_can_read('project-files',(select path from sea_doc_fixture where key='safe')),true,'private Blob gateway evaluates the same narrow Storage grant');
select is((public.document_blob_lookup('project-files',(select path from sea_doc_fixture where key='safe'))->>'provider'),'vercel-blob','the actual private Blob lookup and row policy accept the authorized safe document');
select is(sea_operation_private.can_read_project_document_object('project-files',(select path from sea_doc_fixture where key='offer')),false,'offer path never receives the new grant');
select is(public.document_blob_can_read('project-files',(select path from sea_doc_fixture where key='offer')),false,'private Blob gateway cannot sign an offer for real Marin');
select is((select count(*)::integer from storage.objects where bucket_id='project-files' and name=(select path from sea_doc_fixture where key='offer')),0,'a forged offer Storage path remains hidden');
select throws_ok($$select public.document_blob_lookup('project-files',(select path from sea_doc_fixture where key='offer'))$$,'42501',null,'actual private Blob lookup refuses a forged offer location');
select throws_ok($$select public.document_blob_lookup('project-files',(select path from sea_doc_fixture where key='billing'))$$,'42501',null,'actual private Blob lookup refuses a forged billing location');
select throws_ok($$select public.sea_operation_project_document_access((select project_id from sea_doc_fixture where key='project-1'),(select document_id from sea_doc_fixture where key='offer'))$$,'42501',null,'forged excluded document ID is rejected');
select throws_ok($$select public.sea_operation_project_document_access((select project_id from sea_doc_fixture where key='project-1'),(select document_id from sea_doc_fixture where key='billing-child'))$$,'42501',null,'forged retired billing child ID is rejected');
select throws_ok($$select public.sea_operation_project_document_access((select project_id from sea_doc_fixture where key='project-1'),(select document_id from sea_doc_fixture where key='generated-contract'))$$,'42501',null,'relabeling a generated contract as HSE does not expose it');
select throws_ok($$select public.sea_operation_project_document_access((select project_id from sea_doc_fixture where key='project-1'),(select document_id from sea_doc_fixture where key='legacy-contract'))$$,'42501',null,'unclassified historical commercial contracts cannot be forged into the allowlist');
select throws_ok($$select public.sea_operation_project_document_access((select project_id from sea_doc_fixture where key='project-1'),(select document_id from sea_doc_fixture where key='other-project'))$$,'42501',null,'safe document from another project cannot be substituted');
select throws_ok($$select public.sea_operation_project_documents((select project_id from sea_doc_fixture where key='project-3'))$$,'42501',null,'an unplanned catalog project is not an operational context');
select throws_ok($$select public.sea_operation_project_document_access((select project_id from sea_doc_fixture where key='collision'),(select document_id from sea_doc_fixture where key='collision'))$$,'42501',null,'an operational alias of commercial bytes is refused');
select is((public.sea_operation_project_document_access((select project_id from sea_doc_fixture where key='legacy-safe'),(select document_id from sea_doc_fixture where key='legacy-safe'))->>'sharepoint_url'),
 (select path from sea_doc_fixture where key='legacy-safe'),'only an allowed exact historical document returns its trusted SharePoint link');
select throws_ok($$select public.sea_operation_project_document_access((select project_id from sea_doc_fixture where key='legacy-evil-host'),(select document_id from sea_doc_fixture where key='legacy-evil-host'))$$,'22023',null,'a lookalike external host cannot be returned as a legacy link');
select is((public.sea_operation_project_document_access((select project_id from sea_doc_fixture where key='alias'),(select document_id from sea_doc_fixture where key='alias'))->>'bucket'),'project-drive','registered private Drive copy is preferred to a stale source');
select is((select count(*)::integer from public.project_drive_files where id::text=(select path from sea_doc_fixture where key='alias-safe')),1,'authorized private Drive alias metadata is readable');
select is((select count(*)::integer from public.project_drive_files where id::text=(select path from sea_doc_fixture where key='alias-offer')),0,'forged commercial Drive alias stays hidden');
select is(public.document_blob_can_read('project-drive',(select path from sea_doc_fixture where key='alias-safe')),true,'authorized private Blob Drive alias is readable');
select is(public.document_blob_can_read('project-drive',(select path from sea_doc_fixture where key='alias-offer')),false,'private Blob Drive alias does not bypass commercial exclusions');
select is((public.document_blob_lookup('project-drive',(select path from sea_doc_fixture where key='alias-safe'))->>'provider'),'vercel-blob','actual private Blob lookup verifies the authorized Drive alias and source checksum');
select throws_ok($$select public.document_blob_lookup('project-drive',(select path from sea_doc_fixture where key='alias-offer'))$$,'42501',null,'actual private Blob alias lookup refuses commercial bytes');
select lives_ok($$select public.sea_operation_project_document_access((select project_id from sea_doc_fixture where key='drive'),(select document_id from sea_doc_fixture where key='drive'))$$,'Google Drive source receives an exact document grant');
select lives_ok($$select public.document_drive_lookup('project-files',(select path from sea_doc_fixture where key='drive'))$$,'authenticated Google Drive gateway accepts the safe operational grant');

select set_config('request.jwt.claim.sub','a6320000-0000-0000-0000-000000000002',true);
select is(jsonb_array_length(public.sea_operation_project_documents((select project_id from sea_doc_fixture where key='project-1'))),8,'real Capitaine sees the same operational projection');
select is(sea_operation_private.can_read_project_document_object('project-files',(select path from sea_doc_fixture where key='safe')),false,'Capitaine cannot reuse the Marin private grant');
select lives_ok($$select public.sea_operation_project_document_access((select project_id from sea_doc_fixture where key='safe'),(select document_id from sea_doc_fixture where key='safe'))$$,'real Capitaine obtains its own authorized document grant');
select lives_ok($$select public.document_blob_lookup('project-files',(select path from sea_doc_fixture where key='safe'))$$,'real Capitaine opens an allowed file through the actual private Blob wrapper');
select throws_ok($$select public.document_blob_lookup('project-files',(select path from sea_doc_fixture where key='offer'))$$,'42501',null,'real Capitaine cannot bypass the RPC through private Blob lookup');
select throws_ok($$select public.sea_operation_project_document_access((select project_id from sea_doc_fixture where key='offer'),(select document_id from sea_doc_fixture where key='offer'))$$,'42501',null,'real Capitaine cannot sign a commercial document URL');
select throws_ok($$select public.sea_operation_project_document_access((select project_id from sea_doc_fixture where key='billing'),(select document_id from sea_doc_fixture where key='billing'))$$,'42501',null,'real Capitaine cannot sign a billing document URL');

select set_config('request.jwt.claim.sub','a6320000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.sea_operation_project_document_access((select project_id from sea_doc_fixture where key='offer'),(select document_id from sea_doc_fixture where key='offer'))$$,'42501',null,'Armement projection also excludes commercial categories regardless of its other module rights');
select set_config('request.jwt.claim.sub','a6320000-0000-0000-0000-000000000004',true);
select throws_ok($$select public.sea_operation_project_documents((select project_id from sea_doc_fixture where key='project-1'))$$,'42501',null,'foreign company admin cannot list operational documents');
select throws_ok($$select public.sea_operation_project_document_access((select project_id from sea_doc_fixture where key='safe'),(select document_id from sea_doc_fixture where key='safe'))$$,'42501',null,'foreign company admin cannot authorize a forged safe document ID');
select is(sea_operation_private.can_read_project_document_object('project-files',(select path from sea_doc_fixture where key='safe')),false,'foreign company cannot reuse another user grant');

reset role;
update sea_operation_private.project_document_grants set expires_at=now()-interval '1 second' where user_id='a6320000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','a6320000-0000-0000-0000-000000000001',true);
select is(sea_operation_private.can_read_project_document_object('project-files',(select path from sea_doc_fixture where key='safe')),false,'expired private access grant cannot sign more URLs');
select lives_ok($$select public.sea_operation_project_document_access((select project_id from sea_doc_fixture where key='safe'),(select document_id from sea_doc_fixture where key='safe'))$$,'opening again reauthorizes the document');
reset role;
update public.project_generated_documents set category_key='billing',subcategory_key=null where file_name='sea-doc-safe.pdf';
set local role authenticated;
select set_config('request.jwt.claim.sub','a6320000-0000-0000-0000-000000000001',true);
select is(sea_operation_private.can_read_project_document_object('project-files',(select path from sea_doc_fixture where key='safe')),false,'category change revokes the private grant immediately');
select throws_ok($$select public.document_blob_lookup('project-files',(select path from sea_doc_fixture where key='safe'))$$,'42501',null,'private Blob wrapper rechecks reclassification after a document was opened');
select throws_ok($$select public.sea_operation_project_document_access((select project_id from sea_doc_fixture where key='safe'),(select document_id from sea_doc_fixture where key='safe'))$$,'42501',null,'previously listed metadata cannot authorize a newly classified billing file');
reset role;
update public.role_module_permissions set is_visible=false where role_key='marin' and module_key='seaOperations';
set local role authenticated;
select set_config('request.jwt.claim.sub','a6320000-0000-0000-0000-000000000001',true);
select throws_ok($$select public.sea_operation_project_documents((select project_id from sea_doc_fixture where key='project-1'))$$,'42501',null,'module permission revocation removes the operational projection');
reset role;
update public.planning_projects set cancelled_at=now() where title='SEA-DOC-PROJECT-1';
set local role authenticated;
select set_config('request.jwt.claim.sub','a6320000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.sea_operation_project_documents((select project_id from sea_doc_fixture where key='project-1'))$$,'42501',null,'cancelling the only planning occurrence removes its operational context');
reset role;
select ok(not has_function_privilege('anon','public.sea_operation_project_documents(bigint)','execute'),'anonymous callers cannot list project documents');
select ok(not has_function_privilege('anon','public.sea_operation_project_document_access(bigint,text)','execute'),'anonymous callers cannot obtain a document URL');
select ok(not has_table_privilege('authenticated','sea_operation_private.project_document_grants','select,insert,update,delete'),'application cannot create or inspect its own private access grants');
select ok(not has_function_privilege('authenticated','sea_operation_private.project_document_location(bigint,text)','execute'),'internal unprojected location resolver is not callable by application roles');
select * from finish();
rollback;
