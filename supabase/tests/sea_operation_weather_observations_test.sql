begin;
select no_plan();

select has_table('sea_operation_private','weather_observations','observations have a separate private annex');
select ok((select relrowsecurity from pg_class where oid='sea_operation_private.weather_observations'::regclass),'RLS protects the annex');
select ok(not has_table_privilege('authenticated','sea_operation_private.weather_observations','SELECT,INSERT,UPDATE,DELETE'),'clients cannot read or forge the private queue directly');
select ok(not has_table_privilege('service_role','sea_operation_private.weather_observations','INSERT,UPDATE,DELETE'),'even the worker uses the constrained lease RPC');
select ok(not has_function_privilege('anon','public.sea_operation_weather_observations(uuid)','EXECUTE'),'anonymous accounts cannot read observations');
select ok(not has_function_privilege('authenticated','public.sea_operation_weather_observations_claim(integer)','EXECUTE'),'real users cannot claim worker jobs');
select ok(not has_function_privilege('authenticated','public.sea_operation_weather_observation_complete(uuid,text,uuid,jsonb)','EXECUTE'),'real users cannot forge official measurements');

insert into public.companies(code,name) values('weather-history-other','Weather history other');
insert into auth.users(id,email)
select ('a6380000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'weather-history-'||n||'@example.invalid' from generate_series(1,6) n;
insert into public.profiles(id,email,display_name,active_company_id)
select actor.id,actor.email,'Observation Test '||right(actor.id::text,1),company.id from auth.users actor
join public.companies company on company.code=case when right(actor.id::text,1)='6' then 'weather-history-other' else 'bbtm' end
where actor.id::text like 'a6380000-%';
insert into public.company_memberships(company_id,user_id,active)
select active_company_id,id,true from public.profiles where id::text like 'a6380000-%'
on conflict(company_id,user_id) do update set active=true;
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,(array['admin','direction','armement','capitaine','marin','admin'])[right(id::text,1)::integer]
from public.profiles where id::text like 'a6380000-%';
insert into public.people(company_id,user_id,first_name,last_name,function_label,active)
select active_company_id,id,'Observation','Test '||right(id::text,1),case when right(id::text,1)='4' then 'Capitaine' else 'Matelot' end,true
from public.profiles where id::text like 'a6380000-%';
insert into public.vessels(company_id,name,active,asset_kind)
select id,'WEATHER-HISTORY-TEST',true,'vessel' from public.companies where code='bbtm';
insert into public.planning_assignments(company_id,vessel_id,captain_person_id,crew_person_id,starts_on,ends_on,assignment_role,confirmation_status,source_label)
select captain.company_id,vessel.id,captain.id,captain.id,(now() at time zone 'Europe/Paris')::date-1,(now() at time zone 'Europe/Paris')::date+1,'Capitaine','confirmed','weather-history-test'
from public.people captain join public.vessels vessel on captain.company_id=vessel.company_id and vessel.name='WEATHER-HISTORY-TEST'
where captain.user_id='a6380000-0000-0000-0000-000000000004';
insert into public.working_time_profile_signatures(company_id,person_id,version_number,storage_bucket,storage_path,mime_type,file_size_bytes,sha256,created_by)
select company_id,id,1,'working-time-signatures','weather-history-test/captain.png','image/png',5,repeat('c',64),user_id
from public.people where user_id='a6380000-0000-0000-0000-000000000004';

create temporary table history_fixture(payload jsonb,id uuid,signed_record jsonb);
create temporary table history_jobs(job jsonb);
grant select,insert,update,delete on history_fixture,history_jobs to authenticated,service_role;
insert into history_fixture(payload)
select jsonb_build_object('version',1,'project','Weather history test','client','','clientContact','','description','Mission météo',
  'specialPersonnel','[]'::jsonb,'dapaq','{"method":"","preparedBy":"","agentName":"","agentContact":""}'::jsonb,
  'vessel',jsonb_build_object('id',(select id::text from public.vessels where name='WEATHER-HISTORY-TEST'),'name','WEATHER-HISTORY-TEST','registrationImo','',
    'captainName','Observation TEST 4','departurePort','','departureQuay','','arrivalPort','','arrivalQuay','','etd','','eta',''),
  'applicability','{"towing":"no","cargo":"no","divingSupport":"no","supplies":"no"}'::jsonb,
  'checks',(select jsonb_object_agg(key,'') from unnest(array['vesselCondition','stability','provisions','water','fuel','operationEquipment','navigationEquipment','seaClosures',
    'towingLimits','towingPlan','towingInsurance','towingAuthorization','cargoStability','dangerousGoods','cargoLashing','divingMedicalKit','crewCredentials','crewRoles','watchesAssigned',
    'standingOrders','nauticalDocumentation','navigationNotices','portWorkNotices','portRegulations','berthAvailable','weather']) key),
  'justifications',(select jsonb_object_agg(key,'') from unnest(array['vesselCondition','stability','provisions','water','fuel','operationEquipment','navigationEquipment','seaClosures',
    'towingLimits','towingPlan','towingInsurance','towingAuthorization','cargoStability','dangerousGoods','cargoLashing','divingMedicalKit','crewCredentials','crewRoles','watchesAssigned',
    'standingOrders','nauticalDocumentation','navigationNotices','portWorkNotices','portRegulations','berthAvailable','weather']) key),
  'towedVesselBoarding','{"required":"","measures":"","details":""}'::jsonb,'portServices','[]'::jsonb,'mandatoryServicesNotified',false,
  'supplies','{"delegated":"","shipchandlerName":"","shipchandlerContact":"","items":[],"suppliers":"","customerAccountsPrepared":false}'::jsonb,
  'charts','','waypoints',(select jsonb_agg(jsonb_build_object('id',case when suffix='blank' then ' ' else 'history-'||suffix end,'number',row_number::text,'descriptionVhf','','latitude','49.65','longitude','-1.62','ukc','',
    'eta',case when suffix='legacy' then '12:00'
      when suffix='recent' then to_char((now() at time zone 'Europe/Paris')-interval '30 minutes','YYYY-MM-DD"T"HH24:MI')
      when suffix='mature' then to_char((now() at time zone 'Europe/Paris')-interval '2 hours','YYYY-MM-DD"T"HH24:MI')
      else to_char((now() at time zone 'Europe/Paris')::date+day_offset,'YYYY-MM-DD')||'T12:00' end,'denseTraffic',false))
    from (values('past',-1,1),('partial',-2,2),('future',1,3),('expired',-10,4),('legacy',0,5),('recent',0,6),('mature',0,7),('blank',-1,8),('merge',-1,9)) p(suffix,day_offset,row_number)),
  'decision','NO_GO','risks','Mission suspendue, Armement informé.','signature',jsonb_build_object('captainName','Observation TEST 4','date',(now() at time zone 'Europe/Paris')::date,'place','Cherbourg','acknowledged',true));

set local role authenticated;
select set_config('request.jwt.claim.sub','a6380000-0000-0000-0000-000000000004',true);
update history_fixture set id=(public.sea_operation_save(null,null,payload)->>'id')::uuid;
select is(public.sea_operation_weather_observations((select id from history_fixture))->'points','[]'::jsonb,'a draft does not collect observations');
select lives_ok($$select public.sea_operation_sign((select id from history_fixture),1,'Observation TEST 4',true)$$,'the actual assigned captain signs the persisted revision');
update history_fixture set signed_record=public.sea_operation_detail(id);
select lives_ok(format($$select set_config('request.jwt.claim.sub',%L,true); select public.sea_operation_weather_observations((select id from history_fixture))$$,
  'a6380000-0000-0000-0000-'||lpad(n::text,12,'0')),'real profile '||n||' can read only its company annex') from generate_series(1,5) n;
select set_config('request.jwt.claim.sub','a6380000-0000-0000-0000-000000000006',true);
select throws_ok($$select public.sea_operation_weather_observations((select id from history_fixture))$$,'42501',null,'another company admin cannot read the annex');
select throws_ok($$select public.sea_operation_weather_observations_claim(40)$$,'42501',null,'an authenticated user cannot run the worker');
reset role;
select is((select count(*)::integer from sea_operation_private.weather_observations where operation_id=(select id from history_fixture)),7,'signature enqueues all valid past and future ETAs, excluding time-only ETA and blank legacy IDs');
select lives_ok($$select sea_operation_private.enqueue_weather_observations((select operation from public.sea_operations operation where id=(select id from history_fixture)))$$,'enqueue is idempotent');
select is((select count(*)::integer from sea_operation_private.weather_observations where operation_id=(select id from history_fixture)),7,'repeated enqueue creates no duplicates');

set local role service_role;
select throws_ok($$select public.sea_operation_weather_observations_claim(41)$$,'22023',null,'the worker batch is capped at 40');
insert into history_jobs select value from jsonb_array_elements(public.sea_operation_weather_observations_claim(40));
select is((select count(*)::integer from history_jobs where job->>'operationId'=(select id::text from history_fixture)),4,'only ETA plus one hour inside the seven-day window can be claimed');
select ok(exists(select 1 from history_jobs where job->>'pointId'='history-mature'),'a point two hours after ETA is eligible without waiting for the following day');
select ok(not exists(select 1 from history_jobs where job->>'pointId'='history-recent'),'a point thirty minutes after ETA is still ineligible');
select is(public.sea_operation_weather_observations_claim(40),'[]'::jsonb,'a second worker cannot claim active leases');
select is(public.sea_operation_weather_observation_complete((select id from history_fixture),'history-past',gen_random_uuid(),'{}'::jsonb),false,'an obsolete lease cannot write results');

create temporary table history_results(point_id text primary key,result jsonb);
insert into history_results
select job->>'pointId',jsonb_build_object('pointId',job->>'pointId','latitude',(job->>'latitude')::numeric,'longitude',(job->>'longitude')::numeric,
  'etaUtc',job->>'etaUtc','recordedAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'wind',jsonb_build_object('observedAt',job->>'etaUtc','speedKnots',12,'directionDegrees',245,'instrumentHeightMeters',null,
    'station',jsonb_build_object('id','history-buoy','name','Official fixture buoy','latitude',49.65,'longitude',-1.62,'distanceKm',0),
    'source',jsonb_build_object('provider','Météo-France','sourceUrl','https://www.data.gouv.fr/datasets/archives-annuelles-des-observations-bouees',
      'license','Licence Ouverte 2.0','licenseUrl','https://www.etalab.gouv.fr/licence-ouverte-open-licence/','quality','not_provided')),
  'waves',null,'status','recorded','message','Vent mesuré, houle non publiée.')
from history_jobs where job->>'operationId'=(select id::text from history_fixture);
select throws_ok($$select public.sea_operation_weather_observation_complete((select id from history_fixture),'history-past',
  (select (job->>'leaseId')::uuid from history_jobs where job->>'pointId'='history-past'),
  jsonb_set((select result from history_results where point_id='history-past'),'{latitude}','50'))$$,'22023',null,'a result for different coordinates is refused');
select throws_ok($$select public.sea_operation_weather_observation_complete((select id from history_fixture),'history-past',
  (select (job->>'leaseId')::uuid from history_jobs where job->>'pointId'='history-past'),
  jsonb_set((select result from history_results where point_id='history-past'),'{wind,source,sourceUrl}','"https://untrusted.example"'))$$,'22023',null,'an unofficial provider attribution is refused');
select throws_ok(format($$select public.sea_operation_weather_observation_complete((select id from history_fixture),'history-past',
  (select (job->>'leaseId')::uuid from history_jobs where job->>'pointId'='history-past'),
  jsonb_set((select result from history_results where point_id='history-past'),%L::text[],%L::jsonb))$$,path,value),'22023',null,label)
from (values ('{wind,station,distanceKm}','51','a station beyond fifty kilometres is refused'),
  ('{wind,directionDegrees}','361','an invalid wind direction is refused'),
  ('{wind,speedKnots}','-1','a negative observed speed is refused'),
  ('{wind,source,quality}','"good"','Météo-France observations never invent a quality flag')) invalid(path,value,label);
select is(public.sea_operation_weather_observation_complete((select id from history_fixture),'history-past',
  (select (job->>'leaseId')::uuid from history_jobs where job->>'pointId'='history-past'),(select result from history_results where point_id='history-past')),true,'a valid official partial observation is recorded');
select is(public.sea_operation_weather_observation_complete((select id from history_fixture),'history-past',
  (select (job->>'leaseId')::uuid from history_jobs where job->>'pointId'='history-past'),(select result from history_results where point_id='history-past')),false,'a completed lease is single use');
update history_results set result=jsonb_set(result,'{wind,speedKnots}','null') where point_id='history-merge';
select is(public.sea_operation_weather_observation_complete((select id from history_fixture),'history-merge',
  (select (job->>'leaseId')::uuid from history_jobs where job->>'pointId'='history-merge'),(select result from history_results where point_id='history-merge')),true,
  'a measured direction may be retained while its speed remains unavailable');
reset role;
select ok((select completed_at is null and next_attempt_at between now()+interval '22 hours 59 minutes' and now()+interval '23 hours 1 minute'
  from sea_operation_private.weather_observations where operation_id=(select id from history_fixture) and point_id='history-past'),
  'partial retries are eligible after 23 hours, safely before the following daily cron');
select ok((select completed_at is not null and result->>'status'='unavailable' from sea_operation_private.weather_observations where operation_id=(select id from history_fixture) and point_id='history-expired'),'expired historical points stop retrying without invented data');
select ok((select attempt_count=0 from sea_operation_private.weather_observations where operation_id=(select id from history_fixture) and point_id='history-future'),'a future ETA remains queued without an upstream call');

-- Reclaim an abandoned lease, and reject the delayed response from its old owner.
update sea_operation_private.weather_observations set lease_expires_at=now()-interval '1 second'
where operation_id=(select id from history_fixture) and point_id='history-partial';
set local role service_role;
select is(jsonb_array_length(public.sea_operation_weather_observations_claim(40)),1,'an expired lease can be reclaimed');
select is(public.sea_operation_weather_observation_complete((select id from history_fixture),'history-partial',
  (select (job->>'leaseId')::uuid from history_jobs where job->>'pointId'='history-partial'),(select result from history_results where point_id='history-partial')),false,'a delayed response cannot replace a reclaimed lease');
reset role;
update history_jobs set job=jsonb_set(job,'{leaseId}',to_jsonb((select lease_id::text from sea_operation_private.weather_observations
  where operation_id=(select id from history_fixture) and point_id='history-partial'))) where job->>'pointId'='history-partial';
set local role service_role;
update history_results set result=jsonb_set(result,'{waves}',jsonb_build_object('observedAt',result->>'etaUtc',
  'heightMeters',1.2,'periodSeconds',7,'directionDegrees',230,'component','total','periodKind','peak',
  'station',result#>'{wind,station}','source',result#>'{wind,source}')) where point_id='history-partial';
select is(public.sea_operation_weather_observation_complete((select id from history_fixture),'history-partial',
  (select (job->>'leaseId')::uuid from history_jobs where job->>'pointId'='history-partial'),(select result from history_results where point_id='history-partial')),true,'complete official wind and waves are recorded');
reset role;
select ok((select completed_at is not null and result#>>'{waves,component}'='total' from sea_operation_private.weather_observations
  where operation_id=(select id from history_fixture) and point_id='history-partial'),'complete collection stops retrying and keeps the measured total-sea component explicit');

-- Complement fields only when source, station, instant and instrument are identical.
update sea_operation_private.weather_observations set next_attempt_at=now()-interval '1 second'
where operation_id=(select id from history_fixture) and point_id='history-merge';
set local role service_role;
delete from history_jobs where job->>'pointId'='history-merge';
insert into history_jobs select value from jsonb_array_elements(public.sea_operation_weather_observations_claim(40));
update history_results set result=jsonb_set(jsonb_set(jsonb_set(result,'{wind,speedKnots}','14'),'{wind,directionDegrees}','null'),'{wind,station,id}','"different-station"') where point_id='history-merge';
select is(public.sea_operation_weather_observation_complete((select id from history_fixture),'history-merge',
  (select (job->>'leaseId')::uuid from history_jobs where job->>'pointId'='history-merge'),(select result from history_results where point_id='history-merge')),true,
  'a retry at a different station is processed without constructing a mixed measurement');
reset role;
select is((select result#>'{wind,speedKnots}' from sea_operation_private.weather_observations where operation_id=(select id from history_fixture) and point_id='history-merge'),'null'::jsonb,
  'complementary speed from a different station is never joined to the old direction');
update sea_operation_private.weather_observations set next_attempt_at=now()-interval '1 second'
where operation_id=(select id from history_fixture) and point_id='history-merge';
set local role service_role;
delete from history_jobs where job->>'pointId'='history-merge';
insert into history_jobs select value from jsonb_array_elements(public.sea_operation_weather_observations_claim(40));
update history_results set result=jsonb_set(result,'{wind,station,id}','"history-buoy"') where point_id='history-merge';
select is(public.sea_operation_weather_observation_complete((select id from history_fixture),'history-merge',
  (select (job->>'leaseId')::uuid from history_jobs where job->>'pointId'='history-merge'),(select result from history_results where point_id='history-merge')),true,
  'the same station and instant may fill a previously absent speed');
reset role;
select ok((select result#>>'{wind,speedKnots}'='14' and result#>>'{wind,directionDegrees}'='245'
  from sea_operation_private.weather_observations where operation_id=(select id from history_fixture) and point_id='history-merge'),
  'the complementary speed is added while the original measured direction is preserved');

-- A later source outage cannot erase the measured wind.
update sea_operation_private.weather_observations set next_attempt_at=now()-interval '1 second'
where operation_id=(select id from history_fixture) and point_id='history-past';
set local role service_role;
delete from history_jobs where job->>'pointId'='history-past';
insert into history_jobs select value from jsonb_array_elements(public.sea_operation_weather_observations_claim(40));
select is(public.sea_operation_weather_observation_complete((select id from history_fixture),'history-past',
  (select (job->>'leaseId')::uuid from history_jobs where job->>'pointId'='history-past'),
  jsonb_set(jsonb_set((select result from history_results where point_id='history-past'),'{wind}','null'),'{status}','"pending"')),true,'a source outage is recorded without replacing prior components');
reset role;
select is((select result#>>'{wind,speedKnots}' from sea_operation_private.weather_observations where operation_id=(select id from history_fixture) and point_id='history-past'),'12','the previous official wind is retained');
update sea_operation_private.weather_observations set expires_at=now()-interval '1 second'
where operation_id=(select id from history_fixture) and point_id='history-past';
set local role service_role;
select public.sea_operation_weather_observations_claim(40);
reset role;
select ok((select completed_at is not null and result#>>'{wind,speedKnots}'='12' from sea_operation_private.weather_observations where operation_id=(select id from history_fixture) and point_id='history-past'),'expiry terminates partial collection while preserving recorded measurements');
select is((select to_jsonb(operation) from public.sea_operations operation where id=(select id from history_fixture)),
  (select signed_record-'can_edit'-'can_sign' from history_fixture),'collecting observations never changes the signed row, forecast, signature, version or timestamps');
select throws_ok($$update public.sea_operations set draft=jsonb_set(draft,'{description}','"changed"') where id=(select id from history_fixture)$$,
  '55000',null,'the signed document freeze remains enforced even for privileged writers');

-- Test fair allocation using another genuine captain-signed operation.
-- Isolate the first operation's unfinished jobs from this queue-capacity fixture.
update sea_operation_private.weather_observations set completed_at=now(),lease_id=null,lease_expires_at=null where operation_id=(select id from history_fixture);
create temporary table quota_fixture(id uuid,payload jsonb);
create temporary table quota_jobs(batch integer,job jsonb);
grant select,insert,update,delete on quota_fixture,quota_jobs to authenticated,service_role;
insert into quota_fixture(payload) select jsonb_set(payload,'{waypoints}',(
  select jsonb_agg(jsonb_build_object('id','quota-'||case when n<=60 then 'new-' else 'retry-' end||n,'number',n::text,
    'descriptionVhf','','latitude','49.65','longitude','-1.62','ukc','',
    'eta',to_char((now() at time zone 'Europe/Paris')::date-1,'YYYY-MM-DD')||'T12:00','denseTraffic',false)) from generate_series(1,120) n))
from history_fixture;
set local role authenticated;
select set_config('request.jwt.claim.sub','a6380000-0000-0000-0000-000000000004',true);
update quota_fixture set id=(public.sea_operation_save(null,null,payload)->>'id')::uuid;
select lives_ok($$select public.sea_operation_sign((select id from quota_fixture),1,'Observation TEST 4',true)$$,'a real captain signs the queue capacity fixture');
reset role;
update sea_operation_private.weather_observations set attempt_count=1 where operation_id=(select id from quota_fixture) and point_id like 'quota-retry-%';
set local role service_role;
insert into quota_jobs select 1,value from jsonb_array_elements(public.sea_operation_weather_observations_claim(40));
select is((select count(*)::integer from quota_jobs where batch=1),40,'a busy queue keeps the forty-job bound');
select is((select count(*)::integer from quota_jobs where batch=1 and job->>'pointId' like 'quota-new-%'),30,'new waypoints receive thirty of forty slots when both queues are busy');
select is((select count(*)::integer from quota_jobs where batch=1 and job->>'pointId' like 'quota-retry-%'),10,'partial retries retain ten slots when new points are waiting');
select is((select count(distinct(job->>'operationId',job->>'pointId'))::integer from quota_jobs where batch=1),40,'fair allocation never duplicates a waypoint');
reset role;
-- Reset only fixture leases between capacity scenarios, retaining the signed row.
update sea_operation_private.weather_observations set lease_id=null,lease_expires_at=null,
  attempt_count=case when point_id like 'quota-retry-%' then 1 else 0 end,
  completed_at=case when point_id like 'quota-retry-%' and point_id not in ('quota-retry-61','quota-retry-62') then now() else null end
where operation_id=(select id from quota_fixture);
set local role service_role;
insert into quota_jobs select 2,value from jsonb_array_elements(public.sea_operation_weather_observations_claim(40));
select is((select count(*)::integer from quota_jobs where batch=2 and job->>'pointId' like 'quota-new-%'),38,'unused retry slots return to first-time waypoints');
select is((select count(*)::integer from quota_jobs where batch=2 and job->>'pointId' like 'quota-retry-%'),2,'the two eligible retries are still included');
reset role;
update sea_operation_private.weather_observations set lease_id=null,lease_expires_at=null,
  attempt_count=case when point_id like 'quota-retry-%' then 1 else 0 end,
  completed_at=case when point_id like 'quota-new-%' and point_id not in ('quota-new-1','quota-new-2') then now() else null end
where operation_id=(select id from quota_fixture);
set local role service_role;
insert into quota_jobs select 3,value from jsonb_array_elements(public.sea_operation_weather_observations_claim(40));
select is((select count(*)::integer from quota_jobs where batch=3 and job->>'pointId' like 'quota-new-%'),2,'the two eligible first-time waypoints retain their slots');
select is((select count(*)::integer from quota_jobs where batch=3 and job->>'pointId' like 'quota-retry-%'),38,'unused first-time slots return to retries without exceeding forty');
select is((select count(*)::integer from jsonb_array_elements(public.sea_operation_weather_observations_claim(40)) current_job
  join quota_jobs previous on previous.batch=3 and previous.job->>'operationId'=current_job->>'operationId'
    and previous.job->>'pointId'=current_job->>'pointId'),0,'active fair-allocation leases are not returned to a second worker');
reset role;
select * from finish();
rollback;
