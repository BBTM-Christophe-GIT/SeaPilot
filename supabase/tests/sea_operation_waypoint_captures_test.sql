begin;
select no_plan();

select has_trigger('public','sea_operations','sea_operations_waypoint_captures','optional captures are guarded at persistence');
select ok(not has_function_privilege('anon','sea_operation_private.validate_waypoint_captures(jsonb)','EXECUTE'),'anonymous callers cannot execute the private capture validator');
select ok(not has_function_privilege('authenticated','sea_operation_private.guard_waypoint_captures()','EXECUTE'),'the trigger function is not a new user RPC');

insert into auth.users(id,email)
select ('a6370000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'waypoint-capture-'||n||'@example.invalid' from generate_series(1,5) n;
insert into public.profiles(id,email,display_name,active_company_id)
select actor.id,actor.email,'Capture Test '||right(actor.id::text,1),company.id
from auth.users actor cross join public.companies company where actor.id::text like 'a6370000-%' and company.code = 'bbtm';
insert into public.company_memberships(company_id,user_id,active)
select active_company_id,id,true from public.profiles where id::text like 'a6370000-%'
on conflict(company_id,user_id) do update set active = true;
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,(array['admin','direction','armement','capitaine','marin'])[right(id::text,1)::integer]
from public.profiles where id::text like 'a6370000-%';
insert into public.people(company_id,user_id,first_name,last_name,function_label,active)
select active_company_id,id,'Capture','Test '||right(id::text,1),case when right(id::text,1) = '4' then 'Capitaine' else 'Matelot' end,true
from public.profiles where id::text like 'a6370000-%';
insert into public.vessels(company_id,name,active,asset_kind)
select id,'WAYPOINT-CAPTURE-TEST',true,'vessel' from public.companies where code = 'bbtm';
insert into public.planning_assignments(company_id,vessel_id,captain_person_id,crew_person_id,starts_on,ends_on,assignment_role,confirmation_status,source_label)
select captain.company_id,vessel.id,captain.id,captain.id,(now() at time zone 'Europe/Paris')::date-1,(now() at time zone 'Europe/Paris')::date+1,'Capitaine','confirmed','waypoint-capture-test'
from public.people captain join public.vessels vessel on captain.company_id = vessel.company_id and vessel.name = 'WAYPOINT-CAPTURE-TEST'
where captain.user_id = 'a6370000-0000-0000-0000-000000000004';
insert into public.working_time_profile_signatures(company_id,person_id,version_number,storage_bucket,storage_path,mime_type,file_size_bytes,sha256,created_by)
select company_id,id,1,'working-time-signatures','waypoint-capture-test/captain.png','image/png',5,repeat('b',64),user_id
from public.people where user_id = 'a6370000-0000-0000-0000-000000000004';

create temporary table capture_fixture(kind text primary key,payload jsonb,id uuid);
grant select,insert,update on capture_fixture to authenticated;
insert into capture_fixture(kind,payload)
select 'legacy',jsonb_build_object('version',1,'project','Waypoint capture test','client','','clientContact','','description','Préparation métier conservée',
  'specialPersonnel','[]'::jsonb,'dapaq','{"method":"","preparedBy":"","agentName":"","agentContact":""}'::jsonb,
  'vessel',jsonb_build_object('id',(select id::text from public.vessels where name = 'WAYPOINT-CAPTURE-TEST'),'name','WAYPOINT-CAPTURE-TEST','registrationImo','',
    'captainName','Capture Test 4','departurePort','','departureQuay','','arrivalPort','','arrivalQuay','','etd','','eta',''),
  'applicability','{"towing":"no","cargo":"no","divingSupport":"no","supplies":"no"}'::jsonb,
  'checks',(select jsonb_object_agg(key,'') from unnest(array['vesselCondition','stability','provisions','water','fuel','operationEquipment','navigationEquipment','seaClosures',
    'towingLimits','towingPlan','towingInsurance','towingAuthorization','cargoStability','dangerousGoods','cargoLashing','divingMedicalKit','crewCredentials','crewRoles','watchesAssigned',
    'standingOrders','nauticalDocumentation','navigationNotices','portWorkNotices','portRegulations','berthAvailable','weather']) key),
  'justifications',(select jsonb_object_agg(key,'') from unnest(array['vesselCondition','stability','provisions','water','fuel','operationEquipment','navigationEquipment','seaClosures',
    'towingLimits','towingPlan','towingInsurance','towingAuthorization','cargoStability','dangerousGoods','cargoLashing','divingMedicalKit','crewCredentials','crewRoles','watchesAssigned',
    'standingOrders','nauticalDocumentation','navigationNotices','portWorkNotices','portRegulations','berthAvailable','weather']) key),
  'towedVesselBoarding','{"required":"","measures":"","details":""}'::jsonb,'portServices','[]'::jsonb,'mandatoryServicesNotified',false,
  'supplies','{"delegated":"","shipchandlerName":"","shipchandlerContact":"","items":[],"suppliers":"","customerAccountsPrepared":false}'::jsonb,
  'charts','SHOM 7000','waypoints','[{"id":"w1","number":"1","descriptionVhf":"Entrée de Cherbourg","latitude":"49.65","longitude":"-1.62","ukc":"2,4 m validés à bord","eta":"12:00","denseTraffic":true}]'::jsonb,
  'decision','NO_GO','risks','Mission suspendue, Armement informé.','signature',jsonb_build_object('captainName','Capture Test 4','date',(now() at time zone 'Europe/Paris')::date,'place','Cherbourg','acknowledged',true));
insert into capture_fixture(kind,payload)
select 'captured',jsonb_set(jsonb_set(jsonb_set(payload,'{waypoints,0,eta}','"2026-10-23T14:00"'),'{waypoints,0,weather}',
  '{"pointId":"w1","latitude":49.65,"longitude":-1.62,"etaUtc":"2026-10-23T12:00:00.000Z","fetchedAt":"2026-10-23T08:00:00Z","wind":{"time":"2026-10-23T12:00:00Z","speedKnots":14,"gustKnots":null,"directionDegrees":245},"waves":{"time":"2026-10-23T12:00:00Z","heightMeters":1.2,"periodSeconds":8,"directionDegrees":260,"component":"swell"},"windMessage":"","wavesMessage":"","attribution":"Météo-France","sourceUrl":"https://www.data.gouv.fr/datasets/paquets-de-modele-de-vagues-mfwam-resolution-0-025deg","model":{"name":"MFWAM","referenceTime":"2026-10-23T06:00:00Z","latitude":49.65,"longitude":-1.625}}'),
  '{waypoints,0,radio}','{"version":1,"latitude":49.65,"longitude":-1.62,"capturedAt":"2026-10-23T08:00:00.000Z","verifiedOn":"2026-10-22","contacts":[{"id":"cherbourg-port","kind":"port","name":"Cherbourg · Capitainerie","area":"Port de Cherbourg","vhf":"12","phone":"+33 2 33 20 41 25","mmsi":"002275100","source":"https://portsdenormandie.fr/en/harbour-masters-office/cherbourg","sourceLabel":"Ports de Normandie","distanceNm":0}]}')
from capture_fixture where kind = 'legacy';

set local role authenticated;
select set_config('request.jwt.claim.sub','a6370000-0000-0000-0000-000000000005',true);
select lives_ok($$select public.sea_operation_save(null,null,(select payload from capture_fixture where kind = 'legacy'))$$,'legacy time-only ETA without captures remains compatible');
select lives_ok($$select public.sea_operation_save(null,null,jsonb_set(jsonb_set((select payload from capture_fixture where kind = 'captured'),'{waypoints,0,latitude}','"49°39′ N"'),'{waypoints,0,longitude}','"001°37′12″ W"'))$$,'DM and DMS coordinates match decimal captures');
select lives_ok($$select public.sea_operation_save(null,null,jsonb_set(jsonb_set((select payload from capture_fixture where kind = 'captured'),'{waypoints,0,latitude}','"49,65"'),'{waypoints,0,longitude}','"1,62 O"'))$$,'French decimal separators and west hemisphere match captures');
select lives_ok($$select public.sea_operation_save(null,null,jsonb_set((select payload from capture_fixture where kind = 'captured'),'{waypoints,0,latitude}',to_jsonb(E'\t49.65'||chr(160))))$$,'pasted coordinate whitespace matches the browser parser');
select lives_ok($$select public.sea_operation_save(null,null,jsonb_set((select payload from capture_fixture where kind = 'captured'),'{waypoints,0,weather,etaUtc}','"2026-10-23T12:00:00Z"'))$$,'UTC timestamps with and without fractional seconds identify the same ETA');
select lives_ok($$select public.sea_operation_save(null,null,jsonb_set(jsonb_set((select payload from capture_fixture where kind = 'captured'),'{waypoints,0,weather,wind}','null'),'{waypoints,0,weather,waves}','null'))$$,'missing provider wind and swell stay explicit nulls');

select throws_ok(format($$select public.sea_operation_save(null,null,jsonb_set((select payload from capture_fixture where kind = 'captured'),%L::text[],%L::jsonb))$$,path,value),
  '22023',null,'invalid optional capture is refused: '||label)
from (values
  ('{waypoints,0,weather}','null','null weather object'),
  ('{waypoints,0,weather,pointId}','"another-point"','another waypoint identifier'),
  ('{waypoints,0,weather,latitude}','"49.65"','string weather latitude'),
  ('{waypoints,0,weather,longitude}','-1.63','different weather longitude'),
  ('{waypoints,0,weather,etaUtc}','"2026-10-23T13:00:00Z"','different weather ETA'),
  ('{waypoints,0,weather,fetchedAt}','"2026-02-31T08:00:00Z"','impossible calendar date'),
  ('{waypoints,0,weather,fetchedAt}','"2026-10-23T24:00:00Z"','normalized midnight timestamp'),
  ('{waypoints,0,weather,fetchedAt}','"2026-10-23T08:00:00.1234Z"','excess timestamp precision'),
  ('{waypoints,0,weather,fetchedAt}','"2026-10-23T08:00:00+00:00"','noncanonical UTC suffix'),
  ('{waypoints,0,weather,fetchedAt}','"0000-10-23T08:00:00Z"','capture year zero'),
  ('{waypoints,0,weather,wind,time}','"2026-10-23T08:00:00"','missing wind timezone'),
  ('{waypoints,0,weather,wind,speedKnots}','"14"','string wind speed'),
  ('{waypoints,0,weather,wind,gustKnots}','-1','negative gust speed'),
  ('{waypoints,0,weather,wind,gustKnots}','1e400','nonfinite JavaScript wind number'),
  ('{waypoints,0,weather,wind,directionDegrees}','361','wind direction out of range'),
  ('{waypoints,0,weather,waves,component}','"combined"','combined waves labeled as swell'),
  ('{waypoints,0,weather,waves,heightMeters}','-1','negative swell height'),
  ('{waypoints,0,weather,waves,heightMeters}','1e400','nonfinite JavaScript swell number'),
  ('{waypoints,0,weather,windMessage}','false','boolean weather message'),
  ('{waypoints,0,weather,attribution}','"Unknown provider"','unknown provider'),
  ('{waypoints,0,weather,sourceUrl}','"https://example.invalid/weather"','provider attribution mismatch'),
  ('{waypoints,0,weather,model}','null','null optional model'),
  ('{waypoints,0,weather,model,name}','false','boolean model name'),
  ('{waypoints,0,weather,model,referenceTime}','"2026-02-31T08:00:00Z"','invalid model reference time'),
  ('{waypoints,0,weather,model,latitude}','91','model grid latitude out of bounds'),
  ('{waypoints,0,radio}','null','null radio object'),
  ('{waypoints,0,radio,version}','"1"','string radio version'),
  ('{waypoints,0,radio,version}','2','unsupported radio version'),
  ('{waypoints,0,radio,latitude}','49.66','different radio latitude'),
  ('{waypoints,0,radio,longitude}','"-1.62"','string radio longitude'),
  ('{waypoints,0,radio,capturedAt}','"2026-02-31T08:00:00Z"','invalid radio capture date'),
  ('{waypoints,0,radio,verifiedOn}','"2026-02-31"','invalid radio verification date'),
  ('{waypoints,0,radio,verifiedOn}','"0999-10-23"','verification year before supported range'),
  ('{waypoints,0,radio,contacts}','null','null contacts'),
  ('{waypoints,0,radio,contacts,0}','null','null contact'),
  ('{waypoints,0,radio,contacts,0,kind}','"commercial"','unknown contact kind'),
  ('{waypoints,0,radio,contacts,0,vhf}','12','numeric channel instead of text'),
  ('{waypoints,0,radio,contacts,0,phone}','false','boolean phone'),
  ('{waypoints,0,radio,contacts,0,mmsi}','null','null optional MMSI'),
  ('{waypoints,0,radio,contacts,0,distanceNm}','-1','negative contact distance'),
  ('{waypoints,0,radio,contacts,0,distanceNm}','1e400','nonfinite JavaScript contact distance'),
  ('{waypoints,0,radio,contacts,0,source}','"http://example.invalid"','insecure source URL'),
  ('{waypoints,0,radio,contacts,0,source}','"https://user:password@example.invalid"','source URL credentials'),
  ('{waypoints,0,radio,contacts,0,source}','"https://example.invalid/source with space"','source URL ASCII space'),
  ('{waypoints,0,latitude}','"91"','waypoint latitude beyond WGS84'),
  ('{waypoints,0,latitude}','"49°60′ N"','invalid coordinate minutes'),
  ('{waypoints,0,longitude}','"-1.62 E"','conflicting coordinate hemisphere'),
  ('{waypoints,0,eta}','"12:00"','time-only ETA cannot identify weather instant'),
  ('{waypoints,0,eta}','"0999-10-23T14:00"','ETA year before supported range'),
  ('{waypoints,0,eta}','"2026-10-25T02:30"','ambiguous Paris DST hour'),
  ('{waypoints,0,eta}','"2026-03-29T02:30"','missing Paris DST hour')
) invalid(path,value,label);
select throws_ok($$select public.sea_operation_save(null,null,jsonb_set((select payload from capture_fixture where kind = 'captured'),'{waypoints,0,radio,contacts}',(select jsonb_agg((select payload #> '{waypoints,0,radio,contacts,0}' from capture_fixture where kind = 'captured')) from generate_series(1,65))))$$,
  '22023',null,'contact captures are capped at 64');
select throws_ok($$select public.sea_operation_save(null,null,jsonb_set((select payload from capture_fixture where kind = 'captured'),'{waypoints,0,weather,windMessage}',to_jsonb(repeat('x',2049))))$$,
  '22023',null,'weather messages have a bounded length');
select throws_ok($$select public.sea_operation_save(null,null,(select payload #- '{waypoints,0,weather,wind,speedKnots}' from capture_fixture where kind = 'captured'))$$,
  '22023',null,'missing weather component fields are refused');

-- Real accounts exercise the existing RPC and RLS; no role simulation is used.
select lives_ok(format($$select set_config('request.jwt.claim.sub',%L,true); insert into capture_fixture(kind,id) select %L,(public.sea_operation_save(null,null,(select payload from capture_fixture where kind = 'captured'))->>'id')::uuid$$,
  'a6370000-0000-0000-0000-'||lpad(n::text,12,'0'),'role-'||n),'real profile '||n||' persists optional captures') from generate_series(1,5) n;
select is((public.sea_operation_detail((select id from capture_fixture where kind = 'role-5')) #> '{draft,waypoints}'),
  (select payload->'waypoints' from capture_fixture where kind = 'captured'),'read detail returns exact saved waypoint captures');
select lives_ok($$select public.sea_operation_save((select id from capture_fixture where kind = 'role-5'),1,jsonb_set((select payload from capture_fixture where kind = 'captured'),'{description}','"Edited mission, identical captures"'))$$,
  'capture guard also permits a valid draft update');
select throws_ok($$select public.sea_operation_save((select id from capture_fixture where kind = 'role-5'),2,jsonb_set((select payload from capture_fixture where kind = 'captured'),'{waypoints,0,radio,version}','2'))$$,
  '22023',null,'capture guard refuses malformed draft updates');
select is((select draft #>> '{waypoints,0,ukc}' from public.sea_operations where id = (select id from capture_fixture where kind = 'role-5')),
  '2,4 m validés à bord','the guard never computes or rewrites manual UKC');

select set_config('request.jwt.claim.sub','a6370000-0000-0000-0000-000000000004',true);
select lives_ok($$select public.sea_operation_sign((select id from capture_fixture where kind = 'role-5'),2,'Capture Test 4',true)$$,'the assigned real captain signs the saved capture revision');
select is((public.sea_operation_detail((select id from capture_fixture where kind = 'role-5')) #> '{draft,waypoints}'),
  (select payload->'waypoints' from capture_fixture where kind = 'captured'),'signing freezes the exact captured weather and radio directory');
select throws_ok($$select public.sea_operation_save((select id from capture_fixture where kind = 'role-5'),3,(select payload from capture_fixture where kind = 'captured'))$$,
  '42501',null,'signed captures remain uneditable through the existing RPC');

reset role;
select throws_ok($$update public.sea_operations set draft = jsonb_set(draft,'{waypoints,0,radio,version}','2') where id = (select id from capture_fixture where kind = 'role-5')$$,
  '55000','Une opération signée est conservée sans modification.','the existing signed freeze runs before the new capture guard');
select is((select count(*)::integer from pg_trigger where tgrelid = 'public.sea_operations'::regclass and tgname = 'sea_operations_immutable'),1,'the signed immutability trigger remains installed');
select * from finish();
rollback;
