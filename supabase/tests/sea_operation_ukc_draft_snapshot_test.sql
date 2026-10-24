begin;
select no_plan();
select ok(not has_table_privilege('authenticated','public.sea_operations','INSERT,UPDATE,DELETE'),'clients cannot bypass the canonical draught capture through table writes');
select ok(not has_function_privilege('authenticated','sea_operation_private.capture_vessel_draft()','EXECUTE'),'the capture trigger is not a public RPC');

insert into public.companies(code,name) values('sea-ukc-other','Sea UKC other');
insert into auth.users(id,email)
select ('a6400000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'sea-ukc-'||n||'@example.invalid' from generate_series(1,4) n;
insert into public.profiles(id,email,display_name,active_company_id)
select actor.id,actor.email,'UKC Test '||right(actor.id::text,1),company.id from auth.users actor
join public.companies company on company.code=case when right(actor.id::text,1)='4' then 'sea-ukc-other' else 'bbtm' end
where actor.id::text like 'a6400000-%';
insert into public.company_memberships(company_id,user_id,active)
select active_company_id,id,true from public.profiles where id::text like 'a6400000-%'
on conflict(company_id,user_id) do nothing;
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,(array['capitaine','marin','admin','capitaine'])[right(id::text,1)::integer]
from public.profiles where id::text like 'a6400000-%';
insert into public.people(company_id,user_id,first_name,last_name,function_label,active)
select active_company_id,id,'UKC','Test 1','Capitaine',true from public.profiles where id='a6400000-0000-0000-0000-000000000001';
insert into public.vessels(company_id,name,active,asset_kind,draft_m)
select id,'SEA-UKC-KNOWN',true,'vessel',2.65 from public.companies where code='bbtm';
insert into public.vessels(company_id,name,active,asset_kind,draft_m)
select id,'SEA-UKC-UNKNOWN',true,'vessel',null from public.companies where code='bbtm';
insert into public.planning_assignments(company_id,vessel_id,captain_person_id,crew_person_id,starts_on,ends_on,assignment_role,confirmation_status)
select person.company_id,vessel.id,person.id,person.id,(now() at time zone 'Europe/Paris')::date-1,
  (now() at time zone 'Europe/Paris')::date+1,'Capitaine','confirmed'
from public.people person join public.vessels vessel on vessel.company_id=person.company_id and vessel.name='SEA-UKC-KNOWN'
where person.user_id='a6400000-0000-0000-0000-000000000001';
insert into public.working_time_profile_signatures(company_id,person_id,version_number,storage_bucket,storage_path,mime_type,file_size_bytes,sha256,created_by)
select company_id,id,1,'working-time-signatures','sea-ukc/captain.png','image/png',5,repeat('a',64),user_id
from public.people where user_id='a6400000-0000-0000-0000-000000000001';

create temporary table ukc_fixture(kind text primary key,payload jsonb,id uuid,exact_row jsonb);
grant select,insert,update on ukc_fixture to authenticated;
insert into ukc_fixture(kind,payload)
select 'source',jsonb_build_object('version',1,'project','UKC snapshot test','client','','clientContact','','description','',
  'specialPersonnel','[]'::jsonb,'dapaq','{"method":"","preparedBy":"","agentName":"","agentContact":""}'::jsonb,
  'vessel',jsonb_build_object('id',vessel.id::text,'name',vessel.name,'registrationImo','','captainName','UKC Test 1',
    'departurePort','','departureQuay','','arrivalPort','','arrivalQuay','','etd','','eta','','draftMeters',999),
  'applicability','{"towing":"no","cargo":"no","divingSupport":"no","supplies":"no"}'::jsonb,
  'checks',(select jsonb_object_agg(key,'') from unnest(array['vesselCondition','stability','provisions','water','fuel','operationEquipment','navigationEquipment','seaClosures',
    'towingLimits','towingPlan','towingInsurance','towingAuthorization','cargoStability','dangerousGoods','cargoLashing','divingMedicalKit','crewCredentials','crewRoles','watchesAssigned',
    'standingOrders','nauticalDocumentation','navigationNotices','portWorkNotices','portRegulations','berthAvailable','weather']) key),
  'justifications',(select jsonb_object_agg(key,'') from unnest(array['vesselCondition','stability','provisions','water','fuel','operationEquipment','navigationEquipment','seaClosures',
    'towingLimits','towingPlan','towingInsurance','towingAuthorization','cargoStability','dangerousGoods','cargoLashing','divingMedicalKit','crewCredentials','crewRoles','watchesAssigned',
    'standingOrders','nauticalDocumentation','navigationNotices','portWorkNotices','portRegulations','berthAvailable','weather']) key),
  'towedVesselBoarding','{"required":"","measures":"","details":""}'::jsonb,'portServices','[]'::jsonb,'mandatoryServicesNotified',false,
  'supplies','{"delegated":"","shipchandlerName":"","shipchandlerContact":"","items":[],"suppliers":"","customerAccountsPrepared":false}'::jsonb,
  'charts','','waypoints','[]'::jsonb,'decision','NO_GO','risks','Mission suspendue, Armement informe.',
  'signature',jsonb_build_object('captainName','UKC Test 1','date',(now() at time zone 'Europe/Paris')::date,'place','Dieppe','acknowledged',true))
from public.vessels vessel where vessel.name='SEA-UKC-KNOWN';

set local role authenticated;
select set_config('request.jwt.claim.sub','a6400000-0000-0000-0000-000000000001',true);
insert into ukc_fixture(kind,id,payload)
select 'record',(saved->>'id')::uuid,saved->'draft' from (select public.sea_operation_save(null,null,(select payload from ukc_fixture where kind='source')) saved) response;
select is((select payload#>'{vessel,draftMeters}' from ukc_fixture where kind='record'),'2.65'::jsonb,'the actual captain captures Navires draught rather than the supplied 999');
insert into ukc_fixture(kind,id,payload)
select 'unknown',(saved->>'id')::uuid,saved->'draft' from (select public.sea_operation_save(null,null,jsonb_set((select payload from ukc_fixture where kind='source'),
  '{vessel,id}',to_jsonb((select id::text from public.vessels where name='SEA-UKC-UNKNOWN')))) saved) response;
select is((select payload#>'{vessel,draftMeters}' from ukc_fixture where kind='unknown'),'null'::jsonb,'an unknown vessel draught is null and never zero or inherited');

select set_config('request.jwt.claim.sub','a6400000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.sea_operation_save((select id from ukc_fixture where kind='record'),1,(select payload from ukc_fixture where kind='source'))$$,
  '42501',null,'a real Marin cannot rewrite another captain preparation or its capture');
select set_config('request.jwt.claim.sub','a6400000-0000-0000-0000-000000000004',true);
select throws_ok($$select public.sea_operation_detail((select id from ukc_fixture where kind='record'))$$,'42501',null,'a foreign company cannot read the reference snapshot');
select throws_ok($$select public.sea_operation_save(null,null,(select payload from ukc_fixture where kind='source'))$$,'42501',null,'a foreign company cannot obtain a vessel reference through save');
reset role;

update public.vessels set draft_m=2.8 where name='SEA-UKC-KNOWN';
set local role authenticated;
select set_config('request.jwt.claim.sub','a6400000-0000-0000-0000-000000000001',true);
select is(public.sea_operation_save((select id from ukc_fixture where kind='record'),1,(select payload from ukc_fixture where kind='source'))#>'{draft,vessel,draftMeters}',
  '2.8'::jsonb,'saving a draft refreshes the canonical vessel reference');
reset role;
update public.vessels set draft_m=3.1 where name='SEA-UKC-KNOWN';
set local role authenticated;
select set_config('request.jwt.claim.sub','a6400000-0000-0000-0000-000000000001',true);
select is(public.sea_operation_sign((select id from ukc_fixture where kind='record'),2,'UKC Test 1',true)#>'{draft,vessel,draftMeters}',
  '2.8'::jsonb,'signing retains the exact saved reference instead of silently substituting a changed vessel');
reset role;
update ukc_fixture fixture set exact_row=to_jsonb(operation),payload=operation.draft
from public.sea_operations operation where fixture.kind='record' and fixture.id=operation.id;
update public.vessels set draft_m=4.1 where name='SEA-UKC-KNOWN';
select is((select to_jsonb(operation) from public.sea_operations operation where id=(select id from ukc_fixture where kind='record')),
  (select exact_row from ukc_fixture where kind='record'),'later changes in Navires do not rewrite the signed form');

set local role authenticated;
select set_config('request.jwt.claim.sub','a6400000-0000-0000-0000-000000000003',true);
insert into ukc_fixture(kind,id,payload)
select 'revision',(revised->>'id')::uuid,revised->'draft' from (select public.sea_operation_revise((select id from ukc_fixture where kind='record'),3) revised) response;
select is((select payload#>'{vessel,draftMeters}' from ukc_fixture where kind='revision'),'2.8'::jsonb,'administrative revision first preserves an exact historical draught capture');
select is(public.sea_operation_save((select id from ukc_fixture where kind='revision'),1,(select payload from ukc_fixture where kind='revision'))#>'{draft,vessel,draftMeters}',
  '4.1'::jsonb,'an ordinary save of the new preparation refreshes the reference');
reset role;

-- Simulate an already signed legacy declaration without any draught capture.
insert into ukc_fixture(kind,id,payload) select 'legacy',gen_random_uuid(),payload#-'{vessel,draftMeters}' from ukc_fixture where kind='record';
insert into public.sea_operations(id,company_id,vessel_id,status,draft,created_by,created_by_name,updated_by,updated_by_name,signed_by,signed_by_name,signed_at,captain_name,signature_snapshot)
select fixture.id,source.company_id,source.vessel_id,'signed',fixture.payload,source.created_by,source.created_by_name,source.updated_by,source.updated_by_name,
  source.signed_by,source.signed_by_name,source.signed_at,source.captain_name,source.signature_snapshot
from ukc_fixture fixture cross join public.sea_operations source where fixture.kind='legacy' and source.id=(select id from ukc_fixture where kind='record');
select ok((select not (draft->'vessel' ? 'draftMeters') from public.sea_operations where id=(select id from ukc_fixture where kind='legacy')),
  'legacy signed declarations remain without a manufactured draught reference');
set local role authenticated;
select set_config('request.jwt.claim.sub','a6400000-0000-0000-0000-000000000003',true);
select ok(not ((public.sea_operation_revise((select id from ukc_fixture where kind='legacy'),1)#>'{draft,vessel}') ? 'draftMeters'),
  'revising an old signed declaration does not invent a historical reference');
reset role;

select * from finish(true);
rollback;
