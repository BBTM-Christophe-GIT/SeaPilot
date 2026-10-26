begin;
select no_plan();

select ok(not (select prosecdef from pg_proc where oid='public.sea_operations_overview()'::regprocedure),
  'the exposed overview remains an invoker wrapper');
select ok(not has_function_privilege('anon','public.sea_operations_overview()','EXECUTE'),
  'anonymous clients cannot read vessel speeds');
select ok(has_function_privilege('authenticated','public.sea_operations_overview()','EXECUTE'),
  'the existing authenticated overview grant remains available');
select ok(not has_table_privilege('authenticated','public.sea_operations','INSERT,UPDATE,DELETE'),
  'the display reference adds no direct operation writes');

insert into public.companies(code,name) values('sea-speed-other','Sea speed other');
insert into auth.users(id,email)
select ('a6470000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'sea-speed-'||n||'@example.invalid'
from generate_series(1,5)n;
insert into public.profiles(id,email,display_name,active_company_id)
select actor.id,actor.email,'Sea speed test '||right(actor.id::text,1),company.id
from auth.users actor join public.companies company on company.code=case when right(actor.id::text,1)='4' then 'sea-speed-other' else 'bbtm' end
where actor.id::text like 'a6470000-%';
insert into public.company_memberships(company_id,user_id,active)
select active_company_id,id,true from public.profiles where id::text like 'a6470000-%'
on conflict(company_id,user_id) do nothing;
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,(array['capitaine','marin','admin','capitaine'])[right(id::text,1)::integer]
from public.profiles where id::text like 'a6470000-%' and right(id::text,1)<>'5';
insert into public.vessels(company_id,name,active,asset_kind,max_speed_knots)
select company.id,item.name,item.active,item.kind,item.speed
from public.companies company cross join (values
  ('SEA-SPEED-MAIN',true,'vessel',12.5::numeric),('SEA-SPEED-UNKNOWN',true,'vessel',null::numeric),
  ('SEA-SPEED-INACTIVE',false,'vessel',15::numeric),('SEA-SPEED-OFFICE',true,'office',20::numeric))item(name,active,kind,speed)
where company.code='bbtm';
insert into public.vessels(company_id,name,active,asset_kind,max_speed_knots)
select id,'SEA-SPEED-FOREIGN',true,'vessel',9 from public.companies where code='sea-speed-other';

set local role authenticated;
select set_config('request.jwt.claim.sub','a6470000-0000-0000-0000-000000000001',true);
select is((select item->'max_speed_knots' from jsonb_array_elements(public.sea_operations_overview()->'vessels')item
  where item->>'name'='SEA-SPEED-MAIN'),'12.5'::jsonb,'a real Captain reads the canonical vessel speed through Sea Operations');
select is((select item->'max_speed_knots' from jsonb_array_elements(public.sea_operations_overview()->'vessels')item
  where item->>'name'='SEA-SPEED-UNKNOWN'),'null'::jsonb,'an unknown speed stays explicitly null');
select ok((select item ?& array['id','name','registration_imo','length_overall','draft_m','weather_matrix','can_sign','max_speed_knots']
  from jsonb_array_elements(public.sea_operations_overview()->'vessels')item where item->>'name'='SEA-SPEED-MAIN'),
  'the speed extends rather than replaces the previous vessel contract');
select is((select count(*)::integer from jsonb_array_elements(public.sea_operations_overview()->'vessels')item
  where item->>'name' in ('SEA-SPEED-INACTIVE','SEA-SPEED-OFFICE','SEA-SPEED-FOREIGN')),0,
  'inactive assets, offices and foreign-company vessels stay out of the Captain overview');
select set_config('request.jwt.claim.sub','a6470000-0000-0000-0000-000000000002',true);
select is((select item->'max_speed_knots' from jsonb_array_elements(public.sea_operations_overview()->'vessels')item
  where item->>'name'='SEA-SPEED-MAIN'),'12.5'::jsonb,'a real Marin uses the same operational read permission');
select set_config('request.jwt.claim.sub','a6470000-0000-0000-0000-000000000003',true);
select is((select item->'max_speed_knots' from jsonb_array_elements(public.sea_operations_overview()->'vessels')item
  where item->>'name'='SEA-SPEED-MAIN'),'12.5'::jsonb,'a real Administrator sees the same canonical speed');
select set_config('request.jwt.claim.sub','a6470000-0000-0000-0000-000000000004',true);
select is((select item->'max_speed_knots' from jsonb_array_elements(public.sea_operations_overview()->'vessels')item
  where item->>'name'='SEA-SPEED-FOREIGN'),'9'::jsonb,'a foreign-company Captain reads only their own vessel speed');
select is((select count(*)::integer from jsonb_array_elements(public.sea_operations_overview()->'vessels')item
  where item->>'name' like 'SEA-SPEED-%' and item->>'name'<>'SEA-SPEED-FOREIGN'),0,
  'the foreign-company Captain cannot obtain another company fixture speeds');
select set_config('request.jwt.claim.sub','a6470000-0000-0000-0000-000000000005',true);
select throws_ok($$select public.sea_operations_overview()$$,'42501',null,'an account without an authorized real role stays denied');
reset role;
update public.company_memberships set active=false where user_id='a6470000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','a6470000-0000-0000-0000-000000000001',true);
select throws_ok($$select public.sea_operations_overview()$$,'42501',null,'an inactive company membership stays denied');
reset role;

select * from finish();
rollback;
