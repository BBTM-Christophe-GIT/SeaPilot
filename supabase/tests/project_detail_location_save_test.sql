begin;
set local search_path = public,extensions,pg_temp;
select no_plan();

insert into public.companies(code,name) values ('test-project-detail-map','Dossier map fixtures'),('test-project-detail-foreign','Dossier foreign fixtures');
insert into auth.users(id,email)
select ('c1280000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'project-detail-map-'||n||'@example.invalid' from generate_series(1,7)n;
insert into public.profiles(id,email,display_name,active_company_id)
select actor.id,actor.email,'Dossier map fixture',company.id from auth.users actor cross join public.companies company
where actor.id::text like 'c1280000-%' and company.code=case when right(actor.id::text,1)='5' then 'test-project-detail-foreign' else 'test-project-detail-map' end;
insert into public.company_memberships(user_id,company_id,active)
select id,active_company_id,right(id::text,1)<>'6' from public.profiles where id::text like 'c1280000-%'
on conflict(user_id,company_id) do update set active=excluded.active;
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,case right(id::text,1) when '2' then 'direction' when '3' then 'marin' when '4' then 'capitaine' when '7' then 'armement' else 'admin' end
from public.profiles where id::text like 'c1280000-%';
create temporary table dossier_location_fixture(id bigint,stamp timestamptz,project_snapshot jsonb,contracts_snapshot jsonb);
grant all on dossier_location_fixture to authenticated;

select ok((select not prosecdef and proconfig=array['search_path=""'] from pg_proc where oid='public.projects_set_location(bigint,jsonb,timestamptz)'::regprocedure),'map RPC is invoker with a fixed empty search path');
select ok(not has_function_privilege('anon','public.projects_set_location(bigint,jsonb,timestamptz)','EXECUTE'),'anonymous map writes are revoked');
select ok(not has_table_privilege('authenticated','public.projects','UPDATE'),'map feature does not enable direct table updates');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1280000-0000-0000-0000-000000000001',true);
insert into dossier_location_fixture(id,stamp,project_snapshot)
select saved.id,saved.updated_at,to_jsonb(saved) from public.projects_save(target_title=>'MAP-CONTRACT-UNCHANGED',target_status=>'Non validé',
  target_description=>'Description contractuelle conservée',target_contract_type=>'Offre Commerciale',target_delivery_port=>'Cherbourg',target_redelivery_port=>'Brest',target_charter_hire=>1250,target_hire_currency=>'EUR',target_hire_unit=>'Journalier') saved;
reset role;
update dossier_location_fixture fixture set contracts_snapshot=(select jsonb_agg(to_jsonb(contract) order by contract.id) from public.project_contracts contract where contract.project_id=fixture.id);
set local role authenticated;

select lives_ok($$select public.projects_set_location((select id from dossier_location_fixture),
  '{"version":1,"etd":"","charts":"7000","includeInPdf":true,"waypoints":[],"points":[],"zones":[{"id":"works","name":"Zone de travaux","vertices":[]}]}'::jsonb,
  (select stamp from dossier_location_fixture))$$,'Admin updates an independent project map');
reset role;
select is((select to_jsonb(project)-array['location_plan','updated_at','updated_by'] from public.projects project join dossier_location_fixture fixture on fixture.id=project.id),
  (select project_snapshot-array['location_plan','updated_at','updated_by'] from dossier_location_fixture),'all project commercial and identity fields are preserved');
select is((select jsonb_agg(to_jsonb(contract) order by contract.id) from public.project_contracts contract join dossier_location_fixture fixture on fixture.id=contract.project_id),
  (select contracts_snapshot from dossier_location_fixture),'contract rows and pricing are byte-for-byte preserved');
select is((select location_plan->>'charts' from public.projects project join dossier_location_fixture fixture on fixture.id=project.id),'7000','map is stored separately from project provenance');
set local role authenticated;
select throws_ok($$select public.projects_set_location((select id from dossier_location_fixture),null,(select stamp-interval '1 second' from dossier_location_fixture))$$,'P0001',null,'a stale concurrency token cannot overwrite another edit');
select throws_ok($$select public.projects_set_location((select id from dossier_location_fixture),null,null)$$,'P0001',null,'a missing concurrency token is rejected');
select throws_ok($$select public.projects_set_location((select id from dossier_location_fixture),'{"version":2}'::jsonb,(select updated_at from public.projects where id=(select id from dossier_location_fixture)))$$,'22023',null,'malformed location is rejected by existing normalizer');

select set_config('request.jwt.claim.sub','c1280000-0000-0000-0000-000000000002',true);
select lives_ok($$select public.projects_set_location((select id from dossier_location_fixture),null,(select updated_at from public.projects where id=(select id from dossier_location_fixture)))$$,'Direction retains its existing map write authority');
select set_config('request.jwt.claim.sub','c1280000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.projects_set_location((select id from dossier_location_fixture),null,(select stamp from dossier_location_fixture))$$,'42501',null,'actual Marin cannot change project geography');
select set_config('request.jwt.claim.sub','c1280000-0000-0000-0000-000000000004',true);
select throws_ok($$select public.projects_set_location((select id from dossier_location_fixture),null,(select stamp from dossier_location_fixture))$$,'42501',null,'actual Capitaine cannot change project geography');
select set_config('request.jwt.claim.sub','c1280000-0000-0000-0000-000000000007',true);
select throws_ok($$select public.projects_set_location((select id from dossier_location_fixture),null,(select stamp from dossier_location_fixture))$$,'42501',null,'Armement gains no new Projects write authority');
select set_config('request.jwt.claim.sub','c1280000-0000-0000-0000-000000000005',true);
select throws_ok($$select public.projects_set_location((select id from dossier_location_fixture),null,(select stamp from dossier_location_fixture))$$,'P0002',null,'another-company Admin cannot edit the map');
select set_config('request.jwt.claim.sub','c1280000-0000-0000-0000-000000000006',true);
select throws_ok($$select public.projects_set_location((select id from dossier_location_fixture),null,(select stamp from dossier_location_fixture))$$,'42501',null,'inactive membership cannot edit the map');
select set_config('request.jwt.claim.sub','c1280000-0000-0000-0000-000000000001',true);
select public.projects_archive((select id from dossier_location_fixture));
select throws_ok($$select public.projects_set_location((select id from dossier_location_fixture),null,(select updated_at from public.projects where id=(select id from dossier_location_fixture)))$$,'55000',null,'archived project stays read-only');
reset role;
select * from finish();
rollback;
