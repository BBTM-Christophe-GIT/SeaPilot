begin;
select plan(18);
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

select is(public.projects_set_favorite(current_setting('project.fixture_id')::bigint,true),true,'user A adds a favorite');
select lives_ok($$select public.projects_set_favorite(current_setting('project.fixture_id')::bigint,true)$$,'repeated add is idempotent');
select is((select count(*)::integer from public.project_favorites),1,'one favorite for A');
select set_config('request.jwt.claim.sub','69092800-0000-0000-0000-000000000002',true);
select is((select count(*)::integer from public.project_favorites),0,'user B cannot read A favorites');
select is(public.projects_set_favorite(current_setting('project.fixture_id')::bigint,true),true,'B may independently favorite the same project');
select is((select count(*)::integer from public.project_favorites),1,'B sees only their own favorite');
select throws_ok($$insert into public.project_favorites(user_id,project_id) values('69092800-0000-0000-0000-000000000001',current_setting('project.fixture_id')::bigint)$$,'42501',null,'B cannot insert a preference for A');
select lives_ok($$delete from public.project_favorites where user_id='69092800-0000-0000-0000-000000000001'$$,'B cannot remove A favorite');
select set_config('request.jwt.claim.sub','69092800-0000-0000-0000-000000000001',true);
select is((select count(*)::integer from public.project_favorites),1,'A favorite remains intact');
select is(public.projects_set_favorite(current_setting('project.fixture_id')::bigint,false),false,'A removes own favorite');
select is((select count(*)::integer from public.project_favorites),0,'A selection is now empty');
select set_config('request.jwt.claim.sub','69092800-0000-0000-0000-000000000002',true);
select is((select count(*)::integer from public.project_favorites),1,'B selection is unaffected');
reset role;
insert into public.companies(code,name) values('favorite-test-company','Favorites isolation fixture');
update public.profiles set active_company_id=(select id from public.companies where code='favorite-test-company') where id='69092800-0000-0000-0000-000000000003';
delete from public.user_roles where user_id='69092800-0000-0000-0000-000000000003';
update public.company_memberships set active=false where user_id='69092800-0000-0000-0000-000000000003';
insert into public.company_memberships(company_id,user_id,active) select id,'69092800-0000-0000-0000-000000000003',true from public.companies where code='favorite-test-company';
insert into public.user_roles(user_id,company_id,role_key) select '69092800-0000-0000-0000-000000000003',id,'direction' from public.companies where code='favorite-test-company';
set local role authenticated;
select set_config('request.jwt.claim.sub','69092800-0000-0000-0000-000000000003',true);
select throws_ok($$select public.projects_set_favorite(current_setting('project.fixture_id')::bigint,true)$$,'42501',null,'foreign company cannot favorite inaccessible project');
select set_config('request.jwt.claim.sub','69092800-0000-0000-0000-000000000004',true);
select throws_ok($$select public.projects_set_favorite(current_setting('project.fixture_id')::bigint,true)$$,'42501',null,'real captain profile retains project restrictions');
select set_config('request.jwt.claim.sub','69092800-0000-0000-0000-000000000005',true);
select throws_ok($$select public.projects_set_favorite(current_setting('project.fixture_id')::bigint,true)$$,'42501',null,'real marin profile retains project restrictions');
reset role;
select ok(not has_table_privilege('anon','public.project_favorites','SELECT'),'anonymous users cannot read favorites');
select ok(not has_table_privilege('authenticated','public.project_favorites','UPDATE'),'clients cannot reassign favorite ownership');
update public.projects set archived_at=now() where id=current_setting('project.fixture_id')::bigint;
set local role authenticated;
select set_config('request.jwt.claim.sub','69092800-0000-0000-0000-000000000001',true);
select is(public.projects_set_favorite(current_setting('project.fixture_id')::bigint,true),true,'archived projects may remain personal favorites');
reset role;
select * from finish();
rollback;
