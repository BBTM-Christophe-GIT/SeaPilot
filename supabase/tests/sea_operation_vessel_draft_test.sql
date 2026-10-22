begin;
select no_plan();

select col_type_is('public','vessels','draft_m','numeric','vessel draught uses a numeric measurement');
select col_is_null('public','vessels','draft_m','unknown vessel draught is nullable');
select col_hasnt_default('public','vessels','draft_m','no invented draught is applied to existing vessels');
select ok((select relrowsecurity from pg_class where oid = 'public.vessels'::regclass),'existing vessel RLS stays enabled');

-- Independent fictional fixtures, never production vessel values.
insert into public.companies(code,name) values ('sea-draft-foreign','Sea draught foreign company');
insert into auth.users(id,email)
select ('a6310000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'sea-draft-'||n||'@example.invalid' from generate_series(1,6) n;
insert into public.profiles(id,email,display_name,active_company_id)
select fixture.id,fixture.email,'Draught test '||right(fixture.id::text,1),company.id
from auth.users fixture join public.companies company on company.code = case when right(fixture.id::text,1) = '6' then 'sea-draft-foreign' else 'bbtm' end
where fixture.id::text like 'a6310000-%';
insert into public.company_memberships(company_id,user_id,active)
select active_company_id,id,true from public.profiles where id::text like 'a6310000-%'
on conflict(company_id,user_id) do update set active = true;
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,case right(id::text,1) when '1' then 'admin' when '2' then 'direction' when '3' then 'armement'
  when '4' then 'capitaine' when '5' then 'marin' else 'admin' end
from public.profiles where id::text like 'a6310000-%';
insert into public.people(company_id,user_id,first_name,last_name,function_label,active)
select active_company_id,id,'Draught','Test '||right(id::text,1),case when right(id::text,1) = '4' then 'Capitaine' else 'Matelot' end,true
from public.profiles where id::text like 'a6310000-%';

insert into public.vessels(company_id,name,active,asset_kind,draft_m)
select id,'SEA-DRAFT-MEASURED',true,'vessel',2.1 from public.companies where code = 'bbtm';
insert into public.vessels(company_id,name,active,asset_kind)
select id,'SEA-DRAFT-UNKNOWN',true,'vessel' from public.companies where code = 'bbtm';
insert into public.vessels(company_id,name,active,asset_kind,draft_m)
select id,'SEA-DRAFT-INACTIVE',false,'vessel',4.5 from public.companies where code = 'bbtm';
insert into public.vessels(company_id,name,active,asset_kind,draft_m)
select id,'SEA-DRAFT-OFFICE',true,'office',1.1 from public.companies where code = 'bbtm';
insert into public.vessels(company_id,name,active,asset_kind,draft_m)
select id,'SEA-DRAFT-FOREIGN',true,'vessel',9.5 from public.companies where code = 'sea-draft-foreign';
create temporary table sea_draft_company_fixture as
  select id from public.companies where code = 'sea-draft-foreign';
grant select on sea_draft_company_fixture to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','a6310000-0000-0000-0000-000000000005',true);
select is((select draft_m from public.vessels where name = 'SEA-DRAFT-MEASURED'),2.1::numeric,'real Marin can read vessel reference draught');
select is((select (vessel->>'draft_m')::numeric from jsonb_array_elements(public.sea_operations_overview()->'vessels') vessel
  where vessel->>'name' = 'SEA-DRAFT-MEASURED'),2.1::numeric,'real Marin overview exposes the measured draught');
select is((select vessel->'draft_m' from jsonb_array_elements(public.sea_operations_overview()->'vessels') vessel
  where vessel->>'name' = 'SEA-DRAFT-UNKNOWN'),'null'::jsonb,'real Marin overview preserves unknown draught as JSON null');
select is((select count(*)::integer from jsonb_array_elements(public.sea_operations_overview()->'vessels') vessel
  where vessel->>'name' in ('SEA-DRAFT-FOREIGN','SEA-DRAFT-INACTIVE','SEA-DRAFT-OFFICE')),0,'overview keeps company, active and vessel-kind boundaries');
select is((select count(*)::integer from public.vessels where name = 'SEA-DRAFT-FOREIGN'),0,'real Marin cannot read another company vessel');
with changed as (update public.vessels set draft_m = 3 where name = 'SEA-DRAFT-MEASURED' returning id)
select is((select count(*)::integer from changed),0,'real Marin cannot edit reference measurements');
select throws_ok($$insert into public.vessels(company_id,name,draft_m) values (public.current_planning_company_id(),'SEA-DRAFT-DENIED',3)$$,
  '42501',null,'real Marin cannot create a vessel through the new field');

select set_config('request.jwt.claim.sub','a6310000-0000-0000-0000-000000000004',true);
select is((select draft_m from public.vessels where name = 'SEA-DRAFT-MEASURED'),2.1::numeric,'real Capitaine can read vessel reference draught');
select is((select (vessel->>'draft_m')::numeric from jsonb_array_elements(public.sea_operations_overview()->'vessels') vessel
  where vessel->>'name' = 'SEA-DRAFT-MEASURED'),2.1::numeric,'real Capitaine overview exposes the same measurement');
with changed as (update public.vessels set draft_m = 3 where name = 'SEA-DRAFT-MEASURED' returning id)
select is((select count(*)::integer from changed),0,'real Capitaine cannot edit vessel characteristics');
select is((select count(*)::integer from public.vessels where name = 'SEA-DRAFT-FOREIGN'),0,'real Capitaine cannot read another company vessel');

select set_config('request.jwt.claim.sub','a6310000-0000-0000-0000-000000000002',true);
with changed as (update public.vessels set draft_m = 3 where name = 'SEA-DRAFT-MEASURED' returning id)
select is((select count(*)::integer from changed),0,'Direction keeps its existing read-only vessel permissions');
select set_config('request.jwt.claim.sub','a6310000-0000-0000-0000-000000000003',true);
with changed as (update public.vessels set draft_m = 3 where name = 'SEA-DRAFT-MEASURED' returning id)
select is((select count(*)::integer from changed),0,'Armement keeps its existing read-only vessel permissions');

select set_config('request.jwt.claim.sub','a6310000-0000-0000-0000-000000000001',true);
with changed as (update public.vessels set draft_m = 3.25 where name = 'SEA-DRAFT-MEASURED' returning id)
select is((select count(*)::integer from changed),1,'authenticated fleet administrator can edit vessel draught');
select is((select (vessel->>'draft_m')::numeric from jsonb_array_elements(public.sea_operations_overview()->'vessels') vessel
  where vessel->>'name' = 'SEA-DRAFT-MEASURED'),3.25::numeric,'overview reads the current canonical Navire measurement');
select lives_ok($$update public.vessels set draft_m = null where name = 'SEA-DRAFT-MEASURED'$$,'administrator can clear an unknown draught');
select is((select draft_m from public.vessels where name = 'SEA-DRAFT-MEASURED'),null::numeric,'clearing the measurement persists NULL');
select lives_ok($$update public.vessels set draft_m = 0.001 where name = 'SEA-DRAFT-MEASURED'$$,'a positive small measurement retains its precision');
select is((select draft_m from public.vessels where name = 'SEA-DRAFT-MEASURED'),0.001::numeric,'database does not round a positive measurement to zero');
select lives_ok($$update public.vessels set draft_m = 50 where name = 'SEA-DRAFT-MEASURED'$$,'the 50 metre bound is inclusive');
select throws_ok(format($$update public.vessels set draft_m = %L::numeric where name = 'SEA-DRAFT-MEASURED'$$,invalid),
  '23514',null,'authenticated writes reject invalid draught: '||invalid)
from (values ('0'),('-1'),('50.01'),('NaN'),('Infinity'),('-Infinity')) invalid_values(invalid);
with changed as (update public.vessels set draft_m = 3 where name = 'SEA-DRAFT-FOREIGN' returning id)
select is((select count(*)::integer from changed),0,'administrator cannot change a foreign company vessel');
select throws_ok($$insert into public.vessels(company_id,name,draft_m)
  values ((select id from sea_draft_company_fixture),'SEA-DRAFT-CROSS-COMPANY',3)$$,
  '42501',null,'administrator cannot insert a measurement into another company');

reset role;
update public.company_memberships set active = false where user_id = 'a6310000-0000-0000-0000-000000000005';
set local role authenticated;
select set_config('request.jwt.claim.sub','a6310000-0000-0000-0000-000000000005',true);
select throws_ok($$select public.sea_operations_overview()$$,'42501',null,'inactive membership cannot read the vessel overview');
reset role;
set local role anon;
select throws_ok($$select public.sea_operations_overview()$$,'42501',null,'anonymous users cannot read the vessel overview');

select * from finish();
rollback;
