begin;
select plan(27);
select is(public.projects_drive_folder_label('P144','GUARD VESSEL EMDT',2),'P144 – GUARD VESSEL EMDT','requested number and name');
select is(public.projects_drive_folder_label('P273','BOYARDVILLE => LES SABLES',65),'P273 – BOYARDVILLE → LES SABLES','Windows-safe arrow');
select is(public.projects_drive_folder_label('P1',E'A/B\\C:D*E?F"G<H>I|J',1),'P1 – A-B-C-D-E-F-G-H-I-J','unsafe filename characters sanitized');
select is(public.projects_drive_folder_label('CON.txt','test',9),'P9 – CON.txt – test','reserved Windows device prefix protected');
select is(length(public.projects_drive_folder_label('P1',repeat('a',250),1)),160,'long names bounded');
insert into auth.users (id, email)
values
  ('69092800-0000-0000-0000-000000000001', 'project-drive-admin@example.invalid'),
  ('69092800-0000-0000-0000-000000000002', 'project-drive-direction@example.invalid'),
  ('69092800-0000-0000-0000-000000000003', 'project-drive-armement@example.invalid'),
  ('69092800-0000-0000-0000-000000000004', 'project-drive-capitaine@example.invalid'),
  ('69092800-0000-0000-0000-000000000005', 'project-drive-marin@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (
  values
    ('69092800-0000-0000-0000-000000000001'::uuid, 'project-drive-admin@example.invalid', 'Project Drive admin'),
    ('69092800-0000-0000-0000-000000000002'::uuid, 'project-drive-direction@example.invalid', 'Project Drive direction'),
    ('69092800-0000-0000-0000-000000000003'::uuid, 'project-drive-armement@example.invalid', 'Project Drive armement'),
    ('69092800-0000-0000-0000-000000000004'::uuid, 'project-drive-capitaine@example.invalid', 'Project Drive capitaine'),
    ('69092800-0000-0000-0000-000000000005'::uuid, 'project-drive-marin@example.invalid', 'Project Drive marin')
) fixture(id, email, display_name)
cross join public.companies company
where company.code = 'bbtm';

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (
  values
    ('69092800-0000-0000-0000-000000000001'::uuid, 'admin'),
    ('69092800-0000-0000-0000-000000000002'::uuid, 'direction'),
    ('69092800-0000-0000-0000-000000000003'::uuid, 'armement'),
    ('69092800-0000-0000-0000-000000000004'::uuid, 'capitaine'),
    ('69092800-0000-0000-0000-000000000005'::uuid, 'marin')
) fixture(user_id, role_key)
cross join public.companies company
where company.code = 'bbtm';


insert into public.projects(company_id,title,source_label)
select id,'Drive regression fixture','seapilot' from public.companies where code='bbtm';
select set_config('project.fixture_id',(select id::text from public.projects where title='Drive regression fixture'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','69092800-0000-0000-0000-000000000001',true);
select lives_ok($$select public.projects_save_billing_reference(current_setting('project.fixture_id')::bigint,3,'HIRE-EXPENSE')$$,'manager stores hire and expense reference');
select lives_ok($$select public.projects_save_billing_reference(current_setting('project.fixture_id')::bigint,4,'BBTM-SERVICES')$$,'manager stores independent BBTM reference');
select is((select count(*)::integer from public.project_billing_client_references where project_id=current_setting('project.fixture_id')::bigint),2,'both references remain');
select set_config('project.fixture_folder',public.projects_drive_scope(current_setting('project.fixture_id')::bigint)->>'folder',true);
select is(current_setting('project.fixture_folder'),(select public.projects_drive_folder_label(project_code,title,id) from public.projects where id=current_setting('project.fixture_id')::bigint),'canonical named project folder');
insert into public.project_drive_files(project_id,company_id,source_bucket,source_path,path,sha256,bytes,mime_type)
select id,company_id,'project-files','projects/'||id||'/generated/fixture.pdf',current_setting('project.fixture_folder')||'/Contrat/fixture.pdf',repeat('a',64),100,'application/pdf' from public.projects where id=current_setting('project.fixture_id')::bigint;
select throws_ok($$insert into public.project_drive_files(project_id,company_id,source_bucket,source_path,path,sha256,bytes,mime_type)
select id,company_id,'project-files','projects/'||id||'/wrong.pdf','Other project/Contrat/wrong.pdf',repeat('a',64),100,'application/pdf' from public.projects where id=current_setting('project.fixture_id')::bigint$$,'23514',null,'cross-project folder rejected');
select ok(not has_table_privilege('authenticated','public.project_drive_folders','UPDATE'),'clients cannot rename physical folders alone');
reset role;
update public.projects set title='Changed fixture title' where id=current_setting('project.fixture_id')::bigint;
set local role authenticated;
select is(public.projects_drive_scope(current_setting('project.fixture_id')::bigint)->>'folder',current_setting('project.fixture_folder'),'editing project retains its existing folder');
select lives_ok($$select public.projects_register_generated_storage_document(current_setting('project.fixture_id')::bigint,null,'offer',1,'project-files','projects/'||current_setting('project.fixture_id')||'/generated/fixture.pdf','fixture.pdf','application/pdf',100,repeat('a',64))$$,'verified Drive receipt registers the document');
select throws_ok($$select public.projects_register_generated_storage_document(current_setting('project.fixture_id')::bigint,null,'offer',1,'project-files','projects/'||current_setting('project.fixture_id')||'/generated/fixture.pdf','fixture.pdf','application/pdf',101,repeat('a',64))$$,'22023',null,'mismatched receipt size rejected');
select throws_ok($$select public.projects_register_generated_storage_document(current_setting('project.fixture_id')::bigint,null,'offer',1,'project-files','projects/'||current_setting('project.fixture_id')||'/generated/missing.pdf','missing.pdf','application/pdf',100,repeat('a',64))$$,'22023',null,'unverified document rejected');
select is((public.projects_drive_scope(null,current_setting('project.fixture_folder')||'/Contrat/fixture.pdf')->>'bytes'),'100','read scope returns verified metadata');
select ok(not has_table_privilege('authenticated','public.project_drive_files','DELETE'),'receipts cannot be destroyed by application clients');
select set_config('request.jwt.claim.sub','69092800-0000-0000-0000-000000000002',true);
select lives_ok($$select public.projects_save_billing_reference(current_setting('project.fixture_id')::bigint,3,'DIRECTION-REFERENCE')$$,'direction may edit references');
select set_config('request.jwt.claim.sub','69092800-0000-0000-0000-000000000004',true);
select is((select count(*)::integer from public.project_drive_folders where project_id=current_setting('project.fixture_id')::bigint),0,'captain cannot enumerate commercial folders');
select is((select count(*)::integer from public.project_drive_files where project_id=current_setting('project.fixture_id')::bigint),0,'real captain profile cannot read commercial Drive files');
select throws_ok($$select public.projects_drive_scope(current_setting('project.fixture_id')::bigint)$$,'42501',null,'captain cannot write project files');
select is((select count(*)::integer from public.project_billing_client_references where project_id=current_setting('project.fixture_id')::bigint),0,'captain cannot read commercial references');
select set_config('request.jwt.claim.sub','69092800-0000-0000-0000-000000000005',true);
select is((select count(*)::integer from public.project_drive_folders where project_id=current_setting('project.fixture_id')::bigint),0,'marin cannot enumerate commercial folders');
select is((select count(*)::integer from public.project_drive_files where project_id=current_setting('project.fixture_id')::bigint),0,'real marin profile cannot read commercial Drive files');
select throws_ok($$select public.projects_drive_scope(null,current_setting('project.fixture_folder')||'/Contrat/fixture.pdf')$$,'42501',null,'marin cannot resolve a guessed Drive path');
select throws_ok($$select public.projects_drive_scope(current_setting('project.fixture_id')::bigint)$$,'42501',null,'marin cannot write project files');
select is((select count(*)::integer from public.project_billing_client_references where project_id=current_setting('project.fixture_id')::bigint),0,'marin cannot read commercial references');
reset role;
select * from finish();
rollback;
