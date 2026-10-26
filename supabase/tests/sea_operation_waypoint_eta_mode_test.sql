begin;
select no_plan();

insert into auth.users(id,email)
select ('a6480000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'sea-eta-mode-'||n||'@example.invalid' from generate_series(1,2)n;
insert into public.profiles(id,email,display_name,active_company_id)
select actor.id,actor.email,'ETA TEST'||right(actor.id::text,1),company.id from auth.users actor cross join public.companies company
where actor.id::text like 'a6480000-%' and company.code='bbtm';
insert into public.company_memberships(company_id,user_id,active)
select active_company_id,id,true from public.profiles where id::text like 'a6480000-%' on conflict(company_id,user_id) do nothing;
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,case when right(id::text,1)='1' then 'capitaine' else 'marin' end
from public.profiles where id::text like 'a6480000-%';
insert into public.people(company_id,user_id,first_name,last_name,function_label,active)
select active_company_id,id,'ETA','TEST1','Capitaine',true from public.profiles where id='a6480000-0000-0000-0000-000000000001';
insert into public.vessels(company_id,name,active,asset_kind)
select id,'SEA-ETA-MODE-TEST',true,'vessel' from public.companies where code='bbtm';
insert into public.planning_assignments(company_id,vessel_id,captain_person_id,crew_person_id,starts_on,ends_on,assignment_role,confirmation_status)
select person.company_id,vessel.id,person.id,person.id,(now() at time zone 'Europe/Paris')::date-1,
  (now() at time zone 'Europe/Paris')::date+1,'Capitaine','confirmed'
from public.people person join public.vessels vessel on person.company_id=vessel.company_id and vessel.name='SEA-ETA-MODE-TEST'
where person.user_id='a6480000-0000-0000-0000-000000000001';
insert into public.working_time_profile_signatures(company_id,person_id,version_number,storage_bucket,storage_path,mime_type,file_size_bytes,sha256,created_by)
select company_id,id,1,'working-time-signatures','sea-eta-mode/captain.png','image/png',5,repeat('a',64),user_id
from public.people where user_id='a6480000-0000-0000-0000-000000000001';

create temporary table eta_mode_fixture(payload jsonb,id uuid,version integer,signed_record jsonb);
grant all on eta_mode_fixture to authenticated;
insert into eta_mode_fixture(payload)
select jsonb_build_object('version',1,'project','ETA mode fixture','client','','clientContact','','description','',
  'specialPersonnel','[]'::jsonb,'dapaq','{"method":"","preparedBy":"","agentName":"","agentContact":""}'::jsonb,
  'vessel',jsonb_build_object('id',vessel.id::text,'name',vessel.name,'registrationImo','','captainName','ETA TEST1',
    'departurePort','','departureQuay','','arrivalPort','','arrivalQuay','','etd','','eta',''),
  'applicability','{"towing":"no","cargo":"no","divingSupport":"no","supplies":"no"}'::jsonb,
  'checks',(select jsonb_object_agg(key,'') from unnest(array['vesselCondition','stability','provisions','water','fuel','operationEquipment','navigationEquipment','seaClosures',
    'towingLimits','towingPlan','towingInsurance','towingAuthorization','cargoStability','dangerousGoods','cargoLashing','divingMedicalKit','crewCredentials','crewRoles','watchesAssigned',
    'standingOrders','nauticalDocumentation','navigationNotices','portWorkNotices','portRegulations','berthAvailable','weather'])key),
  'justifications',(select jsonb_object_agg(key,'') from unnest(array['vesselCondition','stability','provisions','water','fuel','operationEquipment','navigationEquipment','seaClosures',
    'towingLimits','towingPlan','towingInsurance','towingAuthorization','cargoStability','dangerousGoods','cargoLashing','divingMedicalKit','crewCredentials','crewRoles','watchesAssigned',
    'standingOrders','nauticalDocumentation','navigationNotices','portWorkNotices','portRegulations','berthAvailable','weather'])key),
  'towedVesselBoarding','{"required":"","measures":"","details":""}'::jsonb,'portServices','[]'::jsonb,'mandatoryServicesNotified',false,
  'supplies','{"delegated":"","shipchandlerName":"","shipchandlerContact":"","items":[],"suppliers":"","customerAccountsPrepared":false}'::jsonb,
  'charts','','waypoints','[{"id":"legacy","number":"1","descriptionVhf":"","latitude":"49 N","longitude":"001 W","ukc":"2.3","eta":"12:00","denseTraffic":false},
    {"id":"auto","number":"2","descriptionVhf":"","latitude":"49 N","longitude":"001 W","ukc":"3.4","eta":"2026-10-27T13:00","etaMode":"automatic","denseTraffic":false},
    {"id":"manual","number":"3","descriptionVhf":"","latitude":"49 N","longitude":"001 W","ukc":"4.5","eta":"2026-10-27T14:00","etaMode":"manual","denseTraffic":false}]'::jsonb,
  'decision','NO_GO','risks','Interruption de la préparation : motif conservé.',
  'signature',jsonb_build_object('captainName','ETA TEST1','date',(now() at time zone 'Europe/Paris')::date,'place','Cherbourg','acknowledged',true))
from public.vessels vessel where vessel.name='SEA-ETA-MODE-TEST';

select lives_ok($$select sea_operation_private.validate_draft((select payload from eta_mode_fixture),false)$$,
  'automatic and manual ETA metadata are valid in a draft');
select lives_ok($$select sea_operation_private.validate_draft((select payload from eta_mode_fixture),true)$$,
  'valid ETA metadata does not alter existing NO GO signature rules');
select lives_ok($$select sea_operation_private.validate_draft(jsonb_set((select payload from eta_mode_fixture),'{waypoints}',
  jsonb_build_array((select payload#>'{waypoints,0}' from eta_mode_fixture))),true)$$,
  'a legacy unmarked nonempty ETA remains valid without adding provenance');
select lives_ok($$select sea_operation_private.validate_draft(jsonb_set((select payload from eta_mode_fixture),'{waypoints,1,eta}','""'),true)$$,
  'an unfinished automatic ETA does not prevent signing an interrupted NO GO');
select throws_ok(format($$select sea_operation_private.validate_draft(jsonb_set((select payload from eta_mode_fixture),'{waypoints,1,etaMode}',%L::jsonb),false)$$,bad),
  '22023',null,'invalid ETA provenance is rejected: '||bad)
from (values('null'),('true'),('1'),('{}'),('[]'),('""'),('"suggested"'))item(bad);

set local role authenticated;
select set_config('request.jwt.claim.sub','a6480000-0000-0000-0000-000000000002',true);
select lives_ok($$update eta_mode_fixture set id=(public.sea_operation_save(null,null,payload)->>'id')::uuid,version=1$$,
  'a real Marin saves the same optional waypoint metadata');
select is(public.sea_operation_detail((select id from eta_mode_fixture))#>>'{draft,waypoints,1,etaMode}','automatic',
  'an automatic ETA survives the save/detail round trip');
select is(public.sea_operation_detail((select id from eta_mode_fixture))#>>'{draft,waypoints,2,etaMode}','manual',
  'a manual ETA survives the save/detail round trip');
select ok(not (public.sea_operation_detail((select id from eta_mode_fixture))#>'{draft,waypoints,0}') ? 'etaMode',
  'saving does not backfill a mode into the historical waypoint');
select throws_ok($$select public.sea_operation_sign((select id from eta_mode_fixture),1,'ETA TEST1',true)$$,
  '42501',null,'a Marin does not gain signature permission');
select set_config('request.jwt.claim.sub','a6480000-0000-0000-0000-000000000001',true);
update eta_mode_fixture set payload=jsonb_set(jsonb_set(public.sea_operation_detail(id)->'draft','{waypoints,1,eta}','"2026-10-27T15:30"'),'{waypoints,1,etaMode}','"manual"');
select lives_ok($$update eta_mode_fixture set version=(public.sea_operation_save(id,version,payload)->>'version')::integer$$,
  'the assigned Captain saves a manual override of a generated ETA');
select is(public.sea_operation_detail((select id from eta_mode_fixture))#>>'{draft,waypoints,1,eta}','2026-10-27T15:30',
  'the server preserves the override instead of recalculating its time');
select throws_ok($$select public.sea_operation_save((select id from eta_mode_fixture),(select version from eta_mode_fixture),
  jsonb_set((select payload from eta_mode_fixture),'{waypoints,1,etaMode}','"suggested"'))$$,
  '22023',null,'the public save path rejects an invalid mode before persistence');
select lives_ok($$update eta_mode_fixture set signed_record=public.sea_operation_sign(id,version,'ETA TEST1',true)$$,
  'the real assigned Captain signs the exact saved ETA revision');
select is((select signed_record#>>'{draft,waypoints,1,etaMode}' from eta_mode_fixture),'manual',
  'signature preserves the chosen provenance');
select throws_ok($$select public.sea_operation_save((select id from eta_mode_fixture),
  (select (signed_record->>'version')::integer from eta_mode_fixture),(select payload from eta_mode_fixture))$$,
  '42501',null,'signed ETA metadata cannot be rewritten through the save RPC');
reset role;
select throws_ok($$update public.sea_operations set draft=jsonb_set(draft,'{waypoints,1,etaMode}','"automatic"')
  where id=(select id from eta_mode_fixture)$$,'55000',null,'the immutable trigger also blocks a privileged metadata rewrite');
select is((select operation.draft from public.sea_operations operation join eta_mode_fixture fixture on operation.id=fixture.id),
  (select signed_record->'draft' from eta_mode_fixture),'the signed JSON remains unchanged');

select * from finish();
rollback;
