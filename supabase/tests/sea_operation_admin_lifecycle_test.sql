begin;
select no_plan();
select has_table('sea_operation_private','record_administration','administrative metadata is separate from signed documents');
select ok((select relrowsecurity from pg_class where oid='sea_operation_private.record_administration'::regclass),'RLS protects lifecycle metadata');
select ok(not has_table_privilege('authenticated','sea_operation_private.record_administration','SELECT,INSERT,UPDATE,DELETE'),'clients cannot forge lifecycle metadata');
select ok(not has_function_privilege('anon','public.sea_operation_revise(uuid,integer)','EXECUTE'),'anonymous callers cannot revise');
select ok(not has_function_privilege('anon','public.sea_operation_delete(uuid,integer)','EXECUTE'),'anonymous callers cannot delete');
select ok(not has_function_privilege('authenticated','sea_operation_private.save_core(uuid,integer,jsonb)','EXECUTE'),'the unguarded internal save entry point remains inaccessible');
insert into public.companies(code,name) values('sea-admin-other','Sea admin other');
insert into auth.users(id,email)
select ('a6390000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'weather-history-'||n||'@example.invalid' from generate_series(1,6) n;
insert into public.profiles(id,email,display_name,active_company_id)
select actor.id,actor.email,'Observation Test '||right(actor.id::text,1),company.id from auth.users actor
join public.companies company on company.code=case when right(actor.id::text,1)='6' then 'sea-admin-other' else 'bbtm' end
where actor.id::text like 'a6390000-%';
insert into public.company_memberships(company_id,user_id,active)
select active_company_id,id,true from public.profiles where id::text like 'a6390000-%'
on conflict(company_id,user_id) do update set active=true;
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,(array['admin','direction','armement','capitaine','marin','admin'])[right(id::text,1)::integer]
from public.profiles where id::text like 'a6390000-%';
insert into public.people(company_id,user_id,first_name,last_name,function_label,active)
select active_company_id,id,'Observation','Test '||right(id::text,1),case when right(id::text,1)='4' then 'Capitaine' else 'Matelot' end,true
from public.profiles where id::text like 'a6390000-%';
insert into public.vessels(company_id,name,active,asset_kind)
select id,'SEA-ADMIN-TEST',true,'vessel' from public.companies where code='bbtm';
insert into public.planning_assignments(company_id,vessel_id,captain_person_id,crew_person_id,starts_on,ends_on,assignment_role,confirmation_status,source_label)
select captain.company_id,vessel.id,captain.id,captain.id,(now() at time zone 'Europe/Paris')::date-1,(now() at time zone 'Europe/Paris')::date+1,'Capitaine','confirmed','weather-history-test'
from public.people captain join public.vessels vessel on captain.company_id=vessel.company_id and vessel.name='SEA-ADMIN-TEST'
where captain.user_id='a6390000-0000-0000-0000-000000000004';
insert into public.working_time_profile_signatures(company_id,person_id,version_number,storage_bucket,storage_path,mime_type,file_size_bytes,sha256,created_by)
select company_id,id,1,'working-time-signatures','weather-history-test/captain.png','image/png',5,repeat('c',64),user_id
from public.people where user_id='a6390000-0000-0000-0000-000000000004';

create temporary table admin_fixture(payload jsonb,id uuid,signed_record jsonb,kind text unique not null default 'original');
create temporary table admin_jobs(job jsonb);
grant select,insert,update,delete on admin_fixture,admin_jobs to authenticated,service_role;
insert into admin_fixture(payload)
select jsonb_build_object('version',1,'project','Sea admin test','client','','clientContact','','description','Mission météo',
  'specialPersonnel','[]'::jsonb,'dapaq','{"method":"","preparedBy":"","agentName":"","agentContact":""}'::jsonb,
  'vessel',jsonb_build_object('id',(select id::text from public.vessels where name='SEA-ADMIN-TEST'),'name','SEA-ADMIN-TEST','registrationImo','',
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

update admin_fixture set payload=jsonb_set(payload,'{waypoints,0,weather}',jsonb_build_object('pointId',payload#>>'{waypoints,0,id}',
  'latitude',49.65,'longitude',-1.62,'etaUtc',to_char(sea_operation_private.capture_eta_utc(payload#>>'{waypoints,0,eta}') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'fetchedAt',to_char((sea_operation_private.capture_eta_utc(payload#>>'{waypoints,0,eta}')-interval '4 hours') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'wind',jsonb_build_object('time',to_char(sea_operation_private.capture_eta_utc(payload#>>'{waypoints,0,eta}') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'speedKnots',12,'gustKnots',null,'directionDegrees',240),
  'waves',jsonb_build_object('time',to_char(sea_operation_private.capture_eta_utc(payload#>>'{waypoints,0,eta}') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'heightMeters',1.2,'periodSeconds',7,'directionDegrees',250,'component','swell'),
  'windMessage','','wavesMessage','','attribution','Météo-France','sourceUrl','https://www.data.gouv.fr/datasets/paquets-de-modele-de-vagues-mfwam-resolution-0-025deg'));
insert into admin_fixture(kind,payload) select 'deletable',payload from admin_fixture where kind='original';
insert into admin_fixture(kind,payload) select 'draft',payload from admin_fixture where kind='original';
set local role authenticated;
select set_config('request.jwt.claim.sub','a6390000-0000-0000-0000-000000000004',true);
update admin_fixture set id=(public.sea_operation_save(null,null,payload)->>'id')::uuid;
select lives_ok(format($$select public.sea_operation_sign(%L::uuid,1,'Observation TEST 4',true)$$,id),'the assigned captain signs '||kind)
from admin_fixture where kind in ('original','deletable');
reset role;
update admin_fixture fixture set signed_record=to_jsonb(operation) from public.sea_operations operation where operation.id=fixture.id;
create temporary table admin_annex_before(operation_id uuid primary key,annex jsonb);
insert into admin_annex_before select operation_id,jsonb_agg(to_jsonb(observation) order by point_id)
from sea_operation_private.weather_observations observation where operation_id in (select id from admin_fixture) group by operation_id;

set local role authenticated;
select lives_ok(format($$select set_config('request.jwt.claim.sub',%L,true); select public.sea_operation_detail((select id from admin_fixture where kind='original'))$$,
  'a6390000-0000-0000-0000-'||lpad(n::text,12,'0')),'real profile '||n||' reads a signed source') from generate_series(1,5) n;
select throws_ok(format($$select set_config('request.jwt.claim.sub',%L,true); select public.sea_operation_revise((select id from admin_fixture where kind='original'),2)$$,
  'a6390000-0000-0000-0000-'||lpad(n::text,12,'0')),'42501',null,'real non-admin profile '||n||' cannot revise signed records') from generate_series(2,6) n;
select throws_ok(format($$select set_config('request.jwt.claim.sub',%L,true); select public.sea_operation_delete((select id from admin_fixture where kind='original'),2)$$,
  'a6390000-0000-0000-0000-'||lpad(n::text,12,'0')),'42501',null,'real non-admin or foreign admin profile '||n||' cannot delete') from generate_series(2,6) n;
select set_config('request.jwt.claim.sub','a6390000-0000-0000-0000-000000000001',true);
select is((public.sea_operation_detail((select id from admin_fixture where kind='original'))->>'can_revise')::boolean,true,'only the actual company admin receives revise capability');
select is((public.sea_operation_detail((select id from admin_fixture where kind='draft'))->>'can_revise')::boolean,false,'draft edits keep the usual save workflow');
select throws_ok($$select public.sea_operation_revise((select id from admin_fixture where kind='original'),1)$$,'40001',null,'a stale expected version cannot revise');
select throws_ok($$select public.sea_operation_delete((select id from admin_fixture where kind='original'),1)$$,'40001',null,'a stale expected version cannot delete');
select throws_ok($$select public.sea_operation_revise((select id from admin_fixture where kind='draft'),1)$$,'22023',null,'a draft cannot be turned into a redundant revision');
insert into admin_fixture(kind,id,payload) select 'revision',(revision->>'id')::uuid,revision->'draft'
from (select public.sea_operation_revise((select id from admin_fixture where kind='original'),2) revision) revised;
select is((public.sea_operation_detail((select id from admin_fixture where kind='revision'))->>'previous_revision_id')::uuid,
  (select id from admin_fixture where kind='original'),'the new draft points to the original signed revision');
select is((public.sea_operation_detail((select id from admin_fixture where kind='original'))->>'superseded_by_id')::uuid,
  (select id from admin_fixture where kind='revision'),'the signed revision points to its successor');
select is(public.sea_operation_detail((select id from admin_fixture where kind='revision'))->>'status','draft','administrative revision never impersonates a captain signature');
select is(public.sea_operation_detail((select id from admin_fixture where kind='revision'))#>'{draft,signature,acknowledged}','false'::jsonb,'captain attestation must be confirmed again');
select is(public.sea_operation_detail((select id from admin_fixture where kind='revision'))#>>'{draft,decision}','','the previous GO/NO GO is not carried as a new decision');
select is(public.sea_operation_detail((select id from admin_fixture where kind='revision'))->'signature_snapshot','{}'::jsonb,'the validated signature image is not reused');
select is(public.sea_operation_detail((select id from admin_fixture where kind='revision'))->'signed_by','null'::jsonb,'the new draft has no signer');
select is((public.sea_operation_detail((select id from admin_fixture where kind='revision'))->>'version')::integer,1,'optimistic versions start at one for the new row');
select is(public.sea_operation_detail((select id from admin_fixture where kind='revision'))->'draft',
  jsonb_set(jsonb_set((select signed_record->'draft' from admin_fixture where kind='original'),'{decision}','""'),'{signature,acknowledged}','false'),
  'all remaining operation, forecast, waypoint and matrix snapshots are cloned exactly');
select throws_ok($$select public.sea_operation_revise((select id from admin_fixture where kind='original'),2)$$,'40001',null,'a second admin revision is refused even though the signed row version is unchanged');
select throws_ok($$select public.sea_operation_delete((select id from admin_fixture where kind='original'),2)$$,'40001',null,'a replaced version cannot be deleted as a current record');
select ok(not exists(select 1 from jsonb_array_elements(public.sea_operations_overview()->'records') record where record->>'id'=(select id::text from admin_fixture where kind='original')),
  'the current register hides the superseded original');
select ok(exists(select 1 from jsonb_array_elements(public.sea_operations_overview()->'records') record where record->>'id'=(select id::text from admin_fixture where kind='revision')),
  'the current register shows the new draft');
select lives_ok($$select public.sea_operation_weather_observations((select id from admin_fixture where kind='original'))$$,'historic observations remain readable for the superseded signed source');
select is((public.sea_operation_detail((select id from admin_fixture where kind='original'))->>'can_edit')::boolean,false,'superseded rows advertise no write permission');
select is((public.sea_operation_detail((select id from admin_fixture where kind='original'))->>'can_sign')::boolean,false,'superseded rows advertise no signing permission');
reset role;
select is((select to_jsonb(operation) from public.sea_operations operation where id=(select id from admin_fixture where kind='original')),
  (select signed_record from admin_fixture where kind='original'),'revision leaves every byte of the original signed row unchanged');
select is((select jsonb_agg(to_jsonb(observation) order by point_id) from sea_operation_private.weather_observations observation where operation_id=(select id from admin_fixture where kind='original')),
  (select annex from admin_annex_before where operation_id=(select id from admin_fixture where kind='original')),'revision does not alter the old observations or worker queue');
select is((select count(*)::integer from sea_operation_private.weather_observations where operation_id=(select id from admin_fixture where kind='revision')),0,'the unsigned clone does not enqueue historical observations');

-- Acquire real queue leases, then suppress a signed source without purging it.
set local role service_role;
insert into admin_jobs select value from jsonb_array_elements(public.sea_operation_weather_observations_claim(40));
reset role;
create temporary table admin_queue_before_delete(operation_id uuid primary key,annex jsonb);
insert into admin_queue_before_delete select operation_id,jsonb_agg(to_jsonb(observation) order by point_id)
from sea_operation_private.weather_observations observation where operation_id=(select id from admin_fixture where kind='deletable') group by operation_id;
set local role authenticated;
select set_config('request.jwt.claim.sub','a6390000-0000-0000-0000-000000000001',true);
select is(public.sea_operation_delete((select id from admin_fixture where kind='deletable'),2),
  jsonb_build_object('id',(select id from admin_fixture where kind='deletable'),'deleted',true),'the admin logically deletes a signed record');
select is(public.sea_operation_delete((select id from admin_fixture where kind='draft'),1),
  jsonb_build_object('id',(select id from admin_fixture where kind='draft'),'deleted',true),'the admin can also delete an unsigned draft');
select is(public.sea_operation_delete((select id from admin_fixture where kind='revision'),1),
  jsonb_build_object('id',(select id from admin_fixture where kind='revision'),'deleted',true),'the admin can delete the latest draft revision');
select ok(not exists(select 1 from jsonb_array_elements(public.sea_operations_overview()->'records') record where record->>'id' in (select id::text from admin_fixture where kind in ('original','revision'))),
  'deleting the latest revision never resurrects its signed ancestor');
select throws_ok($$select public.sea_operation_revise((select id from admin_fixture where kind='deletable'),2)$$,'40001',null,'a deleted record cannot be revised through a stale admin action');
select throws_ok($$select public.sea_operation_save((select id from admin_fixture where kind='draft'),1,(select payload from admin_fixture where kind='draft'))$$,'42501',null,'the old draft save RPC cannot revive a tombstone');
select throws_ok($$select sea_operation_private.sign((select id from admin_fixture where kind='draft'),1,'Observation TEST 4',true)$$,'42501',null,'the private sign entry point cannot bypass a tombstone');
select throws_ok(format($$select set_config('request.jwt.claim.sub',%L,true); select public.sea_operation_detail((select id from admin_fixture where kind='deletable'))$$,
  'a6390000-0000-0000-0000-'||lpad(n::text,12,'0')),'42501',null,'deleted detail is refused for real profile '||n) from generate_series(1,5) n;
select throws_ok($$select public.sea_operation_weather_observations((select id from admin_fixture where kind='deletable'))$$,'42501',null,'deleted weather observations are not exposed through the separate RPC');
select is((select count(*)::integer from public.sea_operations where id in (select id from admin_fixture where kind in ('deletable','draft','revision'))),0,'RLS hides tombstones even through direct table reads');
select set_config('request.jwt.claim.sub','a6390000-0000-0000-0000-000000000004',true);
select throws_ok($$select public.sea_operation_sign((select id from admin_fixture where kind='draft'),1,'Observation TEST 4',true)$$,'42501',null,'the real assigned captain cannot sign a deleted draft');
reset role;
select is((select to_jsonb(operation) from public.sea_operations operation where id=(select id from admin_fixture where kind='deletable')),
  (select signed_record from admin_fixture where kind='deletable'),'deletion preserves the exact signed declaration');
select is((select jsonb_agg(to_jsonb(observation) order by point_id) from sea_operation_private.weather_observations observation where operation_id=(select id from admin_fixture where kind='deletable')),
  (select annex from admin_queue_before_delete where operation_id=(select id from admin_fixture where kind='deletable')),'deletion does not purge or change existing weather/lease data');
select ok(not sea_operation_private.can_sign_record((select operation from public.sea_operations operation where id=(select id from admin_fixture where kind='draft'))),'the low-level signing guard refuses hidden rows');
set local role service_role;
select is(public.sea_operation_weather_observation_complete((select id from admin_fixture where kind='deletable'),'history-past',
  (select (job->>'leaseId')::uuid from admin_jobs where job->>'operationId'=(select id::text from admin_fixture where kind='deletable') and job->>'pointId'='history-past'),'{}'::jsonb),false,
  'a worker response obtained before deletion cannot append a new observation');
reset role;
update sea_operation_private.weather_observations set lease_id=null,lease_expires_at=null,next_attempt_at=now()-interval '1 second'
where operation_id in (select id from admin_fixture where kind in ('original','deletable')) and point_id='history-past';
set local role service_role;
select ok(not exists(select 1 from jsonb_array_elements(public.sea_operation_weather_observations_claim(40)) job where job->>'operationId'=(select id::text from admin_fixture where kind='deletable')),
  'new claims skip deleted records');
reset role;
select ok((select attempt_count>=2 from sea_operation_private.weather_observations where operation_id=(select id from admin_fixture where kind='original') and point_id='history-past'),
  'a superseded signed source continues collecting its own weather history');

-- Legacy signed imports can be revised without any surviving planning or active vessel.
insert into admin_fixture(kind,id,payload)
select 'historic',gen_random_uuid(),jsonb_set(payload,'{planning}',jsonb_build_object('date',(now() at time zone 'Europe/Paris')::date,
  'operationId','999999999:999999999','projectId','999999999','captainPersonId','')) from admin_fixture where kind='original';
insert into public.sea_operations(id,company_id,vessel_id,status,draft,created_by,created_by_name,updated_by,updated_by_name,signed_by,signed_by_name,signed_at,captain_name,signature_snapshot)
select fixture.id,source.company_id,source.vessel_id,'signed',fixture.payload,source.created_by,source.created_by_name,source.updated_by,source.updated_by_name,
  source.signed_by,source.signed_by_name,source.signed_at,source.captain_name,jsonb_set(source.signature_snapshot,'{storage_path}','"sea-admin-only/legacy.png"')
from admin_fixture fixture cross join public.sea_operations source where fixture.kind='historic' and source.id=(select id from admin_fixture where kind='original');
insert into storage.objects(bucket_id,name,metadata) values('working-time-signatures','sea-admin-only/legacy.png','{"mimetype":"image/png","size":5}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claim.sub','a6390000-0000-0000-0000-000000000005',true);
select is((select count(*)::integer from storage.objects where bucket_id='working-time-signatures' and name='sea-admin-only/legacy.png'),1,
  'a signature referenced only by the historical operation is initially readable through Storage RLS');
reset role;
-- A separate source checks the unique signature tombstone path before revision.
insert into admin_fixture(kind,id,payload) select 'signature-delete',gen_random_uuid(),payload from admin_fixture where kind='historic';
insert into public.sea_operations(id,company_id,vessel_id,status,draft,created_by,created_by_name,updated_by,updated_by_name,signed_by,signed_by_name,signed_at,captain_name,signature_snapshot)
select fixture.id,source.company_id,source.vessel_id,'signed',fixture.payload,source.created_by,source.created_by_name,source.updated_by,source.updated_by_name,
  source.signed_by,source.signed_by_name,source.signed_at,source.captain_name,jsonb_set(source.signature_snapshot,'{storage_path}','"sea-admin-only/deleted.png"')
from admin_fixture fixture cross join public.sea_operations source where fixture.kind='signature-delete' and source.id=(select id from admin_fixture where kind='historic');
insert into storage.objects(bucket_id,name,metadata) values('working-time-signatures','sea-admin-only/deleted.png','{"mimetype":"image/png","size":5}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claim.sub','a6390000-0000-0000-0000-000000000001',true);
select public.sea_operation_delete((select id from admin_fixture where kind='signature-delete'),1);
select is(sea_operation_private.can_read_signature('working-time-signatures','sea-admin-only/deleted.png'),false,'a deleted operation no longer grants signature URL access');
select is((select count(*)::integer from storage.objects where bucket_id='working-time-signatures' and name='sea-admin-only/deleted.png'),0,'Storage RLS refuses an object referenced only by a tombstone');
select is(sea_operation_private.can_read_signature('working-time-signatures','sea-admin-only/legacy.png'),true,'independent existing signature references retain access');
reset role;
update public.vessels set active=false where name='SEA-ADMIN-TEST';
set local role authenticated;
select set_config('request.jwt.claim.sub','a6390000-0000-0000-0000-000000000001',true);
insert into admin_fixture(kind,id,payload) select 'historic-revision',(revision->>'id')::uuid,revision->'draft'
from (select public.sea_operation_revise((select id from admin_fixture where kind='historic'),1) revision) revised;
select is(public.sea_operation_detail((select id from admin_fixture where kind='historic-revision'))->'draft',
  jsonb_set(jsonb_set((select payload from admin_fixture where kind='historic'),'{decision}','""'),'{signature,acknowledged}','false'),
  'historical planning, inactive vessel, description and snapshots survive cloning without refreshing planning');
select throws_ok($$select public.sea_operation_save((select id from admin_fixture where kind='historic-revision'),1,(select payload from admin_fixture where kind='historic-revision'))$$,
  '42501',null,'later saves still require valid planning and vessel selection');
select throws_ok($$insert into sea_operation_private.record_administration(operation_id,deleted_at,deleted_by,deleted_by_name)
  values((select id from admin_fixture where kind='historic-revision'),now(),(select auth.uid()),'forged')$$,'42501',null,'the admin cannot forge tombstones by writing the private table');
select * from finish();
rollback;
