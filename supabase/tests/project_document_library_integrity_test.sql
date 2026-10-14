-- Synthetic companies and real authenticated role contexts, entirely rolled back.
begin;
select no_plan();

insert into public.companies(code,name) values
  ('project-library-fixture','Synthetic project library'),
  ('project-library-other','Synthetic other project library');
insert into auth.users(id,email)
select ('91420000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'project-library-' || n || '@example.invalid' from generate_series(1,7) n;
insert into public.profiles(id,email,display_name,active_company_id)
select u.id,u.email,'Synthetic library actor',c.id
from auth.users u join public.companies c
  on c.code=case when right(u.id::text,1)='6' then 'project-library-other' else 'project-library-fixture' end
where u.id::text like '91420000-0000-4000-8000-%';
insert into public.company_memberships(company_id,user_id,active)
select active_company_id,id,true from public.profiles
where id::text like '91420000-0000-4000-8000-%'
on conflict(company_id,user_id) do update set active=true;
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,case right(id::text,1)
  when '1' then 'admin' when '2' then 'direction' when '3' then 'armement'
  when '4' then 'capitaine' when '5' then 'marin' else 'admin' end
from public.profiles where id::text like '91420000-0000-4000-8000-%';
update public.company_memberships set active=false
where user_id='91420000-0000-4000-8000-000000000007';
insert into public.projects(company_id,title,source_label)
select id,'Synthetic project library fixture','seapilot'
from public.companies where code in('project-library-fixture','project-library-other');
select set_config('test.library_company',(select id::text from public.companies where code='project-library-fixture'),true);
select set_config('test.library_project',(select id::text from public.projects
  where company_id=current_setting('test.library_company')::bigint and title='Synthetic project library fixture'),true);
select set_config('test.library_other_project',(select p.id::text from public.projects p
  join public.companies c on c.id=p.company_id where c.code='project-library-other' and p.title='Synthetic project library fixture'),true);
select set_config('test.library_path','projects/'||current_setting('test.library_project')||'/attachments/safety/manual/fixture.pdf',true);

create function pg_temp.library_register(overrides jsonb default '{}'::jsonb) returns bigint
language sql security invoker as $$
  select public.projects_register_storage_attachment(
    coalesce((overrides->>'project')::bigint,current_setting('test.library_project')::bigint),
    coalesce(overrides->>'bucket','project-files'),coalesce(overrides->>'path',current_setting('test.library_path')),
    coalesce(overrides->>'name','fixture.pdf'),coalesce(overrides->>'mime','application/pdf'),
    coalesce((overrides->>'bytes')::bigint,10),coalesce(overrides->>'sha',repeat('a',64)),
    coalesce(overrides->>'category','safety'),coalesce(overrides->>'subcategory','manual'),
    (overrides->>'expires')::date
  );
$$;
grant execute on function pg_temp.library_register(jsonb) to authenticated;

-- This helper only supplies a verified synthetic receipt. The actual API's byte
-- and SHA checks are tested separately; no provider or network is contacted.
create function pg_temp.library_complete(target_path text) returns void
language plpgsql security invoker as $$
declare reservation jsonb;
begin
  reservation:=public.document_blob_upload_scope('project-files',target_path,
    'fixture.pdf','application/pdf',10,repeat('a',64));
  execute 'reset role'; execute 'set local role service_role';
  perform public.document_blob_register_verified(jsonb_build_object(
    'source_bucket','project-files','source_path',target_path,'upload_id',reservation->>'id',
    'uploader_id',reservation->>'uploader_id','file_name','fixture.pdf','mime_type','application/pdf',
    'bytes',10,'sha256',repeat('a',64),'verified_mime_type','application/pdf',
    'verified_bytes',10,'verified_sha256',repeat('a',64),
    'blob_pathname','documents/uploads/'||(reservation->>'id'),
    'blob_url','https://fixture.private.blob.vercel-storage.com/documents/uploads/'||(reservation->>'id')));
  execute 'reset role'; execute 'set local role authenticated';
end;
$$;
grant execute on function pg_temp.library_complete(text) to authenticated;

select ok(not has_function_privilege('anon','public.projects_save_document_categories(jsonb)','EXECUTE'),'anonymous category writes remain closed');
select ok(not has_function_privilege('anon','public.projects_register_storage_attachment(bigint,text,text,text,text,bigint,text,text,text,date)','EXECUTE'),'anonymous registrations remain closed');
select ok(not has_table_privilege('authenticated','public.project_document_categories','INSERT'),'clients cannot bypass the catalog RPC');
select ok(not has_table_privilege('authenticated','public.project_generated_documents','INSERT'),'clients cannot bypass registration');
set local session authorization authenticator;
set local role authenticated;
select is(session_user::text,'authenticator','scope uses the API session role');
select set_config('request.jwt.claim.sub','91420000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"91420000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select lives_ok($$select public.projects_save_document_categories('[
  {"category_key":"safety","label":"Sécurité","display_order":10,"active":true},
  {"category_key":"manual","parent_key":"safety","label":"Manuel","display_order":11,"active":true},
  {"category_key":"billing","label":"Facturation","display_order":20,"active":true}
]'::jsonb)$$,'Admin creates the company catalog');
select is((select count(*)::integer from public.project_document_categories where active),3,'only this company active categories are visible');
select throws_ok($$select public.projects_save_document_categories('[]'::jsonb)$$,'22023',null,'an empty snapshot cannot silently reset the catalog');
select throws_ok($$select public.projects_save_document_categories('[{"category_key":"missing","label":"","active":false}]'::jsonb)$$,'22023',null,'retired rows also require labels');
select throws_ok($$select public.projects_save_document_categories('[{"label":"Sans clé"}]'::jsonb)$$,'22023',null,'a missing key is rejected deliberately');
select throws_ok($$select public.projects_save_document_categories('[{"category_key":"safety","label":"A"},{"category_key":"safety","label":"B"}]'::jsonb)$$,'22023',null,'duplicate keys are rejected before any update');
select throws_ok($$select public.projects_save_document_categories('[{"category_key":"first","label":"Même"},{"category_key":"second","label":"même"}]'::jsonb)$$,'22023',null,'active sibling names are unique without case distinctions');
select throws_ok($$select public.projects_save_document_categories('[{"category_key":"first","parent_key":"second","label":"A","active":false},{"category_key":"second","parent_key":"first","label":"B","active":false}]'::jsonb)$$,'22023',null,'inactive cycles cannot corrupt the hierarchy');
select throws_ok($$select public.projects_save_document_categories('[{"category_key":"first","label":"A","active":false},{"category_key":"second","parent_key":"first","label":"B","active":true}]'::jsonb)$$,'22023',null,'an active child requires an active root');
select is((select count(*)::integer from public.project_document_categories where active),3,'invalid writes leave the catalog untouched');
select lives_ok($$select pg_temp.library_complete(current_setting('test.library_path'))$$,'Admin prepares and verifies a private project upload');
select set_config('test.library_document',pg_temp.library_register()::text,true);
select is(pg_temp.library_register(),current_setting('test.library_document')::bigint,'an identical registration acknowledges the same document');
select is((select count(*)::integer from public.project_generated_documents where storage_path=current_setting('test.library_path')),1,'a retry creates no duplicate document');
select throws_ok($$select pg_temp.library_register('{"name":"different.pdf"}'::jsonb)$$,'22023','PROJECT_ATTACHMENT_PATH_CONFLICT','a retry cannot rename the immutable document');
select throws_ok($$select pg_temp.library_register('{"category":"billing"}'::jsonb)$$,'22023','PROJECT_ATTACHMENT_PATH_CONFLICT','a retry cannot reclassify the document');
select throws_ok($$select pg_temp.library_register('{"expires":"2030-01-01"}'::jsonb)$$,'22023','PROJECT_ATTACHMENT_PATH_CONFLICT','a retry cannot change expiry');
select throws_ok($$select pg_temp.library_register('{"sha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}'::jsonb)$$,'22023',null,'registration still checks the verified SHA');
select throws_ok($$select pg_temp.library_register('{"bytes":11}'::jsonb)$$,'22023',null,'registration still checks the verified bytes');
select throws_ok($$select pg_temp.library_register('{"mime":"image/png"}'::jsonb)$$,'22023',null,'registration still checks the verified MIME');
select throws_ok($$select pg_temp.library_register(jsonb_build_object('project',current_setting('test.library_other_project')::bigint))$$,'22023',null,'a company manager cannot target another company project');
select throws_ok($$select public.document_blob_upload_scope('project-files','projects/'||current_setting('test.library_other_project')||'/attachments/other.pdf','fixture.pdf','application/pdf',10,repeat('a',64))$$,'42501',null,'Blob reservation denies another company project');
select throws_ok($$select public.projects_save_document_categories('[
  {"category_key":"safety","label":"Sécurité","active":true},
  {"category_key":"billing","label":"Facturation","active":true},
  {"category_key":"manual","parent_key":"billing","label":"Manuel","active":true}
]'::jsonb)$$,'22023',null,'a referenced subcategory cannot move to another root');
select throws_ok($$select public.projects_save_document_categories('[
  {"category_key":"billing","label":"Facturation","active":true},
  {"category_key":"safety","parent_key":"billing","label":"Sécurité","active":true},
  {"category_key":"manual","parent_key":"billing","label":"Manuel","active":true}
]'::jsonb)$$,'22023',null,'a referenced category cannot become a subcategory');

select set_config('request.jwt.claim.sub','91420000-0000-4000-8000-000000000002',true);
select lives_ok($$select public.projects_save_document_categories('[
  {"category_key":"safety","label":"Sécurité historique","display_order":10,"active":false},
  {"category_key":"manual","parent_key":"safety","label":"Manuel historique","display_order":11,"active":false},
  {"category_key":"billing","label":"Facturation","display_order":20,"active":false}
]'::jsonb)$$,'Direction can retire every choice without deleting history');
select is((select count(*)::integer from public.project_document_categories where active),0,'there is no implicit re-seeding when every choice is retired');
select is((select label from public.project_document_categories where category_key='manual'),'Manuel historique','retired category labels remain readable');
select is((select count(*)::integer from public.project_generated_documents where id=current_setting('test.library_document')::bigint),1,'retiring the catalog keeps the existing document visible');
select is(pg_temp.library_register(),current_setting('test.library_document')::bigint,'a committed retry remains an acknowledgement after retirement');
select ok(public.document_blob_lookup('project-files',current_setting('test.library_path')) is not null,'retired categories do not revoke authorized document reads');
select lives_ok($$select pg_temp.library_complete('projects/'||current_setting('test.library_project')||'/attachments/new-retired.pdf')$$,'a private upload is still scoped to the project');
select throws_ok($$select pg_temp.library_register(jsonb_build_object('path','projects/'||current_setting('test.library_project')||'/attachments/new-retired.pdf'))$$,'22023',null,'a new document cannot use retired categories');
select lives_ok($$select public.projects_save_document_categories('[{"category_key":"new_root","label":"Nouveau choix","active":true}]'::jsonb)$$,'a later catalog can omit historical keys without deleting them');
select is((select count(*)::integer from public.project_document_categories where category_key in('safety','manual','billing')),3,'omitted historical keys remain retired');

select set_config('request.jwt.claim.sub','91420000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.projects_save_document_categories('[{"category_key":"forbidden","label":"Interdit"}]'::jsonb)$$,'42501',null,'Armement cannot manage the catalog');
select throws_ok($$select pg_temp.library_register()$$,'42501',null,'Armement cannot register project attachments');
select ok(public.document_blob_lookup('project-files',current_setting('test.library_path')) is not null,'Armement retains the existing project document read scope');
select set_config('request.jwt.claim.sub','91420000-0000-4000-8000-000000000004',true);
select throws_ok($$select public.projects_save_document_categories('[{"category_key":"forbidden","label":"Interdit"}]'::jsonb)$$,'42501',null,'Capitaine cannot manage the catalog');
select throws_ok($$select pg_temp.library_register()$$,'42501',null,'Capitaine cannot register project attachments');
select is((select count(*)::integer from public.project_generated_documents where id=current_setting('test.library_document')::bigint),0,'Capitaine cannot enumerate general project attachments');
select set_config('request.jwt.claim.sub','91420000-0000-4000-8000-000000000005',true);
select throws_ok($$select public.projects_save_document_categories('[{"category_key":"forbidden","label":"Interdit"}]'::jsonb)$$,'42501',null,'Marin cannot manage the catalog');
select throws_ok($$select pg_temp.library_register()$$,'42501',null,'Marin cannot register project attachments');
select is((select count(*)::integer from public.project_generated_documents where id=current_setting('test.library_document')::bigint),0,'Marin cannot enumerate general project attachments');
select set_config('request.jwt.claim.sub','91420000-0000-4000-8000-000000000006',true);
select is((select count(*)::integer from public.project_document_categories where company_id=current_setting('test.library_company')::bigint),0,'another company catalog is invisible');
select throws_ok($$select pg_temp.library_register()$$,'22023',null,'another company Admin cannot register this project');
select throws_ok($$select public.document_blob_lookup('project-files',current_setting('test.library_path'))$$,'42501',null,'another company Admin cannot resolve its private bytes');
select set_config('request.jwt.claim.sub','91420000-0000-4000-8000-000000000007',true);
select throws_ok($$select public.projects_save_document_categories('[{"category_key":"forbidden","label":"Interdit"}]'::jsonb)$$,'42501',null,'an inactive membership cannot manage categories');
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select public.projects_save_document_categories('[{"category_key":"forbidden","label":"Interdit"}]'::jsonb)$$,'42501',null,'a missing JWT identity cannot manage categories');
select throws_ok($$select pg_temp.library_register()$$,'42501',null,'a missing JWT identity cannot register documents');
reset role;
reset session authorization;
select ok(not exists(select 1 from storage.objects where bucket_id='project-files' and name=current_setting('test.library_path')),'Blob completion creates no fake Storage row');
select * from finish();
rollback;
