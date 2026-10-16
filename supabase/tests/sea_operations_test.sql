begin;
select no_plan();

select has_table('public','sea_operations','sea operation declarations are persisted');
select ok((select relrowsecurity from pg_class where oid = 'public.sea_operations'::regclass),'RLS protects declarations');
select ok(not has_table_privilege('anon','public.sea_operations','SELECT,INSERT,UPDATE,DELETE'),'anonymous users have no table grants');
select ok(not has_table_privilege('authenticated','public.sea_operations','INSERT,UPDATE,DELETE'),'direct writes cannot forge identities or signatures');
select ok(not has_function_privilege('anon','public.sea_operations_overview()','EXECUTE'),'anonymous users cannot call the overview');
select ok(not has_function_privilege('anon','public.sea_operation_sign(uuid,integer,text,boolean)','EXECUTE'),'anonymous users cannot sign');
select is((select count(*)::integer from public.role_module_permissions where module_key = 'seaOperations' and is_visible),5,'the module is seeded for all five real profiles');

insert into public.companies(code,name) values ('sea-operation-other','Sea operation other company');
insert into auth.users(id,email)
select ('a6300000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'sea-operation-'||n||'@example.invalid' from generate_series(1,10) n;
insert into public.profiles(id,email,display_name,active_company_id)
select fixture.id,fixture.email,'Sea test '||right(fixture.id::text,1),company.id
from auth.users fixture join public.companies company on company.code = case when right(fixture.id::text,1) = '9' then 'sea-operation-other' else 'bbtm' end
where fixture.id::text like 'a6300000-%';
insert into public.company_memberships(company_id,user_id,active)
select active_company_id,id,true from public.profiles where id::text like 'a6300000-%'
on conflict(company_id,user_id) do update set active = true;
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,case right(id::text,1) when '1' then 'admin' when '2' then 'direction' when '3' then 'armement'
  when '4' then 'capitaine' when '6' then 'capitaine' when '7' then 'capitaine' when '8' then 'capitaine' when '9' then 'admin' else 'marin' end
from public.profiles where id::text like 'a6300000-%';
insert into public.people(company_id,user_id,first_name,last_name,function_label,active)
select active_company_id,id,'Sea','Test '||right(id::text,1),case when right(id::text,1) in ('4','6','7','8') then 'Capitaine' else 'Matelot' end,true
from public.profiles where id::text like 'a6300000-%';
insert into public.vessels(company_id,name,active,asset_kind)
select id,'SEA-OPERATION-TEST',true,'vessel' from public.companies where code = 'bbtm';
insert into public.vessels(company_id,name,active,asset_kind)
select id,'SEA-OPERATION-FOREIGN',true,'vessel' from public.companies where code = 'sea-operation-other';
insert into public.planning_assignments(company_id,vessel_id,captain_person_id,crew_person_id,starts_on,ends_on,assignment_role,confirmation_status,source_label)
select person.company_id,vessel.id,person.id,person.id,
  case when right(person.user_id::text,1) = '7' then (now() at time zone 'Europe/Paris')::date-10 else (now() at time zone 'Europe/Paris')::date-1 end,
  case when right(person.user_id::text,1) = '7' then (now() at time zone 'Europe/Paris')::date-5 else (now() at time zone 'Europe/Paris')::date+1 end,
  'Capitaine',case when right(person.user_id::text,1) = '8' then 'provisional' else 'confirmed' end,'sea-operation-test'
from public.people person join public.vessels vessel on vessel.company_id = person.company_id and vessel.name = 'SEA-OPERATION-TEST'
where person.user_id::text in ('a6300000-0000-0000-0000-000000000004','a6300000-0000-0000-0000-000000000007','a6300000-0000-0000-0000-000000000008');

create temporary table sea_fixture(kind text primary key,payload jsonb,id uuid);
grant select,update,insert on sea_fixture to authenticated;
insert into sea_fixture(kind,payload)
select 'go',jsonb_build_object('version',1,'project','Test sea mission','client','Client','clientContact','Contact client','description','Mission de test',
  'specialPersonnel','[]'::jsonb,'dapaq',jsonb_build_object('method','nomade','preparedBy','captain','agentName','','agentContact',''),
  'vessel',jsonb_build_object('id',(select id::text from public.vessels where name = 'SEA-OPERATION-TEST'),'name','SEA-OPERATION-TEST','registrationImo','12345',
    'captainName','Sea Test 4','departurePort','Cherbourg','departureQuay','A','arrivalPort','Le Havre','arrivalQuay','B','etd','2026-10-17T08:00','eta','2026-10-17T18:00'),
  'applicability','{"towing":"no","cargo":"no","divingSupport":"no","supplies":"no"}'::jsonb,
  'checks',(select jsonb_object_agg(key,'yes') from unnest(array['vesselCondition','stability','provisions','water','fuel','operationEquipment','navigationEquipment','seaClosures',
    'towingLimits','towingPlan','towingInsurance','towingAuthorization','cargoStability','dangerousGoods','cargoLashing','divingMedicalKit','crewCredentials','crewRoles','watchesAssigned',
    'standingOrders','nauticalDocumentation','navigationNotices','portWorkNotices','portRegulations','berthAvailable','weather']) key),
  'justifications',(select jsonb_object_agg(key,'') from unnest(array['vesselCondition','stability','provisions','water','fuel','operationEquipment','navigationEquipment','seaClosures',
    'towingLimits','towingPlan','towingInsurance','towingAuthorization','cargoStability','dangerousGoods','cargoLashing','divingMedicalKit','crewCredentials','crewRoles','watchesAssigned',
    'standingOrders','nauticalDocumentation','navigationNotices','portWorkNotices','portRegulations','berthAvailable','weather']) key),
  'towedVesselBoarding','{"required":"","measures":"","details":""}'::jsonb,'portServices','["none"]'::jsonb,'mandatoryServicesNotified',false,
  'supplies','{"delegated":"","shipchandlerName":"","shipchandlerContact":"","items":[],"suppliers":"","customerAccountsPrepared":false}'::jsonb,
  'charts','SHOM test','waypoints','[{"id":"w1","number":"1","descriptionVhf":"Point test VHF 16","latitude":"49 N","longitude":"001 W","ukc":"2 m","eta":"12:00","denseTraffic":false}]'::jsonb,
  'decision','GO','risks','','signature','{"captainName":"Sea Test 4","date":"2026-10-16","place":"Cherbourg","acknowledged":true}'::jsonb);
insert into sea_fixture(kind,payload)
select 'partial',jsonb_set(jsonb_set(jsonb_set(jsonb_set(payload,'{decision}','"NO_GO"'),'{risks}','"Conditions météo défavorables, Armement informé"'),'{client}','""'),'{waypoints}','[]')
from sea_fixture where kind = 'go';

set local role authenticated;
select set_config('request.jwt.claim.sub','a6300000-0000-0000-0000-000000000005',true);
select throws_ok($$select public.sea_operation_save(null,null,jsonb_set((select payload from sea_fixture where kind = 'go'),'{version}','"1"'))$$,
  '22023',null,'a crafted string schema version cannot poison the shared company register');
select throws_ok(format($$select public.sea_operation_save(null,null,jsonb_set((select payload from sea_fixture where kind = 'go'),%L::text[],%L::jsonb))$$,path,bad_value),
  '22023',null,'malformed draft shape is rejected before persistence: '||label)
from (values
  ('{version}','null','missing schema version'),
  ('{version}','true','boolean schema version'),
  ('{version}','2','unsupported schema version'),
  ('{project}','null','null project'),
  ('{clientContact}','false','boolean client contact'),
  ('{vessel}','[]','array in vessel object'),
  ('{vessel,id}','123','numeric vessel identifier'),
  ('{vessel,captainName}','null','null captain'),
  ('{applicability,towing}','true','boolean applicability'),
  ('{applicability,supplies}','"maybe"','unknown applicability'),
  ('{checks,weather}','true','boolean control answer'),
  ('{checks,crewRoles}','"maybe"','unknown control answer'),
  ('{justifications,weather}','{}','object justification'),
  ('{dapaq,method}','1','numeric DAPAQ mode'),
  ('{dapaq,preparedBy}','"unknown"','unknown DAPAQ author'),
  ('{dapaq,agentContact}','[]','array agent contact'),
  ('{specialPersonnel}','{}','object instead of personnel list'),
  ('{specialPersonnel}','[{"name":false,"phone":"123"}]','malformed personnel contact'),
  ('{towedVesselBoarding,required}','true','boolean boarding answer'),
  ('{towedVesselBoarding,measures}','"unknown"','unknown boarding measure'),
  ('{towedVesselBoarding,details}','null','null boarding details'),
  ('{portServices}','[true]','non-string port service'),
  ('{portServices}','["unknown"]','unknown port service'),
  ('{mandatoryServicesNotified}','"true"','string notification acknowledgment'),
  ('{supplies,delegated}','true','boolean supply answer'),
  ('{supplies,items}','{}','object instead of supply list'),
  ('{supplies,items}','["unknown"]','unknown supply item'),
  ('{supplies,suppliers}','null','null supplier'),
  ('{supplies,customerAccountsPrepared}','"false"','string supply acknowledgment'),
  ('{signature,date}','42','numeric signature date'),
  ('{signature,acknowledged}','"true"','string signature acknowledgment'),
  ('{waypoints}','[null]','null waypoint'),
  ('{waypoints,0,denseTraffic}','"false"','string traffic marker'),
  ('{waypoints,0,latitude}','42','numeric waypoint text'),
  ('{decision}','["GO"]','non-string decision')
) invalid(path,bad_value,label);
select lives_ok($$select sea_operation_private.validate_draft(jsonb_set((select payload from sea_fixture where kind = 'go'),'{version}','1.0'),false)$$,
  'numeric JSON 1.0 remains compatible with strict JavaScript schema version 1');
select lives_ok($$insert into sea_fixture(kind,id) select 'record',(public.sea_operation_save(null,null,(select payload from sea_fixture where kind = 'go'))->>'id')::uuid$$,
  'a real Marin creates a persistent draft');
select is((select created_by::text from public.sea_operations where id = (select id from sea_fixture where kind = 'record')),
  'a6300000-0000-0000-0000-000000000005','the author is taken from auth.uid');
select is((select created_by_name from public.sea_operations where id = (select id from sea_fixture where kind = 'record')),'Sea Test 5','author name comes from the real HR profile');
select is((public.sea_operation_detail((select id from sea_fixture where kind = 'record'))->>'can_sign')::boolean,false,'a Marin cannot sign as a captain');
select lives_ok($$select public.sea_operation_save((select id from sea_fixture where kind = 'record'),1,(select payload from sea_fixture where kind = 'go'))$$,'the real Marin edits their own draft');
select throws_ok($$select public.sea_operation_save((select id from sea_fixture where kind = 'record'),1,(select payload from sea_fixture where kind = 'go'))$$,
  '40001',null,'stale draft revisions cannot overwrite newer work');
select throws_ok($$select public.sea_operation_sign((select id from sea_fixture where kind = 'record'),2,'Sea Test 4',true)$$,
  '42501',null,'typing the captain name does not give a Marin signing authority');
select set_config('request.jwt.claim.sub','a6300000-0000-0000-0000-000000000010',true);
select throws_ok($$select public.sea_operation_save((select id from sea_fixture where kind = 'record'),2,(select payload from sea_fixture where kind = 'go'))$$,
  '42501',null,'a distinct real Marin cannot edit another author draft');

-- Every real role can create a draft and read company records; no profile override is involved.
select lives_ok(format($$select set_config('request.jwt.claim.sub',%L,true); select public.sea_operation_save(null,null,(select payload from sea_fixture where kind = 'go'))$$,
  'a6300000-0000-0000-0000-'||lpad(n::text,12,'0')),'profile '||n||' can create an own draft') from generate_series(1,4) n;
select lives_ok(format($$select set_config('request.jwt.claim.sub',%L,true); select public.sea_operation_detail((select id from sea_fixture where kind = 'record'))$$,
  'a6300000-0000-0000-0000-'||lpad(n::text,12,'0')),'profile '||n||' can read the shared company declaration') from generate_series(1,5) n;

select set_config('request.jwt.claim.sub','a6300000-0000-0000-0000-000000000003',true);
select lives_ok($$select public.sea_operation_save((select id from sea_fixture where kind = 'record'),2,(select payload from sea_fixture where kind = 'go'))$$,'Armement prepares a Marin draft');
select throws_ok($$select public.sea_operation_sign((select id from sea_fixture where kind = 'record'),3,'Sea Test 4',true)$$,'42501',null,'management cannot substitute for captain signature');
select set_config('request.jwt.claim.sub','a6300000-0000-0000-0000-000000000006',true);
select is((public.sea_operation_detail((select id from sea_fixture where kind = 'record'))->>'can_edit')::boolean,false,'unassigned captain cannot edit another author draft');
select throws_ok($$select public.sea_operation_save((select id from sea_fixture where kind = 'record'),3,(select payload from sea_fixture where kind = 'go'))$$,'42501',null,'unassigned captain write is refused by the RPC');
select throws_ok($$select public.sea_operation_sign((select id from sea_fixture where kind = 'record'),3,'Sea Test 4',true)$$,'42501',null,'unassigned captain cannot sign');
select set_config('request.jwt.claim.sub','a6300000-0000-0000-0000-000000000007',true);
select is((public.sea_operation_detail((select id from sea_fixture where kind = 'record'))->>'can_sign')::boolean,false,'an expired assignment does not allow signing');
select set_config('request.jwt.claim.sub','a6300000-0000-0000-0000-000000000008',true);
select is((public.sea_operation_detail((select id from sea_fixture where kind = 'record'))->>'can_sign')::boolean,false,'an unconfirmed assignment does not allow signing');

select set_config('request.jwt.claim.sub','a6300000-0000-0000-0000-000000000004',true);
select is((public.sea_operation_detail((select id from sea_fixture where kind = 'record'))->>'can_sign')::boolean,true,'the real confirmed assigned captain can sign');
select lives_ok($$select public.sea_operation_save((select id from sea_fixture where kind = 'record'),3,(select payload from sea_fixture where kind = 'go'))$$,'the assigned captain can prepare a company draft');
select throws_ok($$select public.sea_operation_sign((select id from sea_fixture where kind = 'record'),3,'Sea Test 4',true)$$,'40001',null,'signing must use the exact saved revision');
select throws_ok($$select public.sea_operation_sign((select id from sea_fixture where kind = 'record'),4,'Sea Test 4',false)$$,'22023',null,'signature acknowledgment is mandatory');
select throws_ok($$select public.sea_operation_sign((select id from sea_fixture where kind = 'record'),4,'Different name',true)$$,'22023',null,'the declared signatory must match the saved snapshot');

-- Exact twelve source blockers are checked server-side; the diving blocker is applicable only in diving support.
select throws_ok(format($$select sea_operation_private.validate_draft(jsonb_set(jsonb_set((select payload from sea_fixture where kind = 'go'),'{applicability,divingSupport}','"yes"'),array['checks',%L], '"no"'),true)$$,key),
  '22023',null,'GO is refused for source blocker '||key)
from unnest(array['vesselCondition','stability','divingMedicalKit','crewCredentials','crewRoles','watchesAssigned',
  'nauticalDocumentation','navigationNotices','portWorkNotices','portRegulations','berthAvailable','weather']) key;
select lives_ok($$select sea_operation_private.validate_draft(jsonb_set((select payload from sea_fixture where kind = 'go'),'{checks,divingMedicalKit}','"no"'),true)$$,'inactive diving check does not block GO');
select lives_ok($$select sea_operation_private.validate_draft(jsonb_set(jsonb_set((select payload from sea_fixture where kind = 'go'),'{applicability,cargo}','"yes"'),'{checks,dangerousGoods}','"no"'),true)$$,'No dangerous goods is a valid answer, not a NO GO');
select throws_ok($$select sea_operation_private.validate_draft(jsonb_set((select payload from sea_fixture where kind = 'go'),'{checks,operationEquipment}','"no"'),true)$$,'22023',null,'a conditional negative needs its justification');
select lives_ok($$select sea_operation_private.validate_draft(jsonb_set(jsonb_set((select payload from sea_fixture where kind = 'go'),'{checks,operationEquipment}','"no"'),'{justifications,operationEquipment}','"Matériel de substitution validé par Armement"'),true)$$,'a justified conditional negative may allow GO');
select throws_ok($$select sea_operation_private.validate_draft(jsonb_set((select payload from sea_fixture where kind = 'go'),'{checks,water}','"no"'),true)$$,'22023',null,'positive-only attestations must be confirmed');
select throws_ok($$select sea_operation_private.validate_draft(jsonb_set((select payload from sea_fixture where kind = 'go'),'{checks,weather}','null'),true)$$,'22023',null,'missing or malformed answers cannot bypass checks');
select throws_ok($$select sea_operation_private.validate_draft(jsonb_set((select payload from sea_fixture where kind = 'go'),'{applicability,towing}','"yes"'),true)$$,'22023',null,'towing requires boarding assessment');
select throws_ok($$select sea_operation_private.validate_draft(jsonb_set((select payload from sea_fixture where kind = 'go'),'{applicability,supplies}','"yes"'),true)$$,'22023',null,'supplies require identified needs and provider responsibility');
select throws_ok($$select sea_operation_private.validate_draft(jsonb_set((select payload from sea_fixture where kind = 'go'),'{waypoints}','[]'),true)$$,'22023',null,'GO requires a passage plan');
select throws_ok($$select sea_operation_private.validate_draft(jsonb_set((select payload from sea_fixture where kind = 'go'),'{dapaq,preparedBy}','"agent"'),true)$$,'22023',null,'NOMADE cannot be delegated to an agent');
select throws_ok($$select sea_operation_private.validate_draft(jsonb_set((select payload from sea_fixture where kind = 'go'),'{portServices}','["none","pilotage"]'),false)$$,'22023',null,'contradictory services are rejected even in drafts');
select throws_ok($$select sea_operation_private.validate_draft(jsonb_set((select payload from sea_fixture where kind = 'go'),'{vessel,eta}','"2026-10-16T01:00"'),false)$$,'22023',null,'arrival cannot precede departure');
select throws_ok($$select sea_operation_private.validate_draft(jsonb_set((select payload from sea_fixture where kind = 'go'),'{vessel,eta}','"infinity"'),false)$$,'22023',null,'non-finite PostgreSQL date values are not accepted as operation dates');
select throws_ok($$select sea_operation_private.validate_draft(jsonb_set((select payload from sea_fixture where kind = 'go'),'{signature,date}','"2026-02-30"'),true)$$,'22023',null,'invalid signature dates are rejected');
select throws_ok($$select sea_operation_private.validate_draft(jsonb_set((select payload from sea_fixture where kind = 'partial'),'{risks}','""'),true)$$,'22023',null,'partial NO GO must record its risks or refusal reason');
select lives_ok($$insert into sea_fixture(kind,id) select 'blocked',(public.sea_operation_save(null,null,
  jsonb_set((select payload from sea_fixture where kind = 'go'),'{checks,weather}','"no"'))->>'id')::uuid$$,'an unsafe assessment can be saved honestly as a draft');
select throws_ok($$select public.sea_operation_sign((select id from sea_fixture where kind = 'blocked'),1,'Sea Test 4',true)$$,'22023',null,'the signing RPC itself rejects a forged GO with a blocker');

select lives_ok($$select public.sea_operation_sign((select id from sea_fixture where kind = 'record'),4,'Sea Test 4',true)$$,'complete GO is signed by the actual assigned captain');
select is((select version from public.sea_operations where id = (select id from sea_fixture where kind = 'record')),5,'signing advances the exact persisted revision');
select is((select signed_by::text from public.sea_operations where id = (select id from sea_fixture where kind = 'record')),'a6300000-0000-0000-0000-000000000004','the actual authenticated captain identity is captured');
select is((select signed_by_name from public.sea_operations where id = (select id from sea_fixture where kind = 'record')),'Sea Test 4','the actual captain HR name is captured');
select ok((select signed_at >= now() from public.sea_operations where id = (select id from sea_fixture where kind = 'record')),'signature timestamp is generated by the server');
select is((public.sea_operation_detail((select id from sea_fixture where kind = 'record'))->>'can_edit')::boolean,false,'signed declarations advertise no edit capability');
select throws_ok($$select public.sea_operation_save((select id from sea_fixture where kind = 'record'),5,(select payload from sea_fixture where kind = 'partial'))$$,'42501',null,'signed GO cannot be changed to NO GO');
select lives_ok($$insert into sea_fixture(kind,id) select 'nogo',(public.sea_operation_save(null,null,(select payload from sea_fixture where kind = 'partial'))->>'id')::uuid$$,'captain can save an interrupted inspection as NO GO');
select lives_ok($$select public.sea_operation_sign((select id from sea_fixture where kind = 'nogo'),1,'Sea Test 4',true)$$,'partial NO GO is signed without pretending all checks were completed');

select set_config('request.jwt.claim.sub','a6300000-0000-0000-0000-000000000009',true);
select is((select count(*)::integer from public.sea_operations),0,'another company cannot read records through RLS');
select is(jsonb_array_length(public.sea_operations_overview()->'records'),0,'another company overview contains no leaked records');
select throws_ok($$select public.sea_operation_detail((select id from sea_fixture where kind = 'record'))$$,'42501',null,'foreign detail IDs do not bypass company access');
select throws_ok($$select public.sea_operation_save((select id from sea_fixture where kind = 'record'),5,(select payload from sea_fixture where kind = 'go'))$$,'42501',null,'foreign company cannot update a known record ID');
select throws_ok($$select public.sea_operation_save(null,null,(select payload from sea_fixture where kind = 'go'))$$,'42501',null,'foreign company cannot create a draft with another company vessel');

reset role;
select throws_ok($$update public.sea_operations set captain_name = 'Forgery' where id = (select id from sea_fixture where kind = 'record')$$,'55000',null,'the immutable trigger also prevents privileged rewriting');
select throws_ok($$delete from public.sea_operations where id = (select id from sea_fixture where kind = 'record')$$,'55000',null,'the immutable trigger prevents signed-record deletion');
update public.company_memberships set active = false where user_id = 'a6300000-0000-0000-0000-000000000005';
set local role authenticated;
select set_config('request.jwt.claim.sub','a6300000-0000-0000-0000-000000000005',true);
select throws_ok($$select public.sea_operations_overview()$$,'42501',null,'inactive membership is refused even with a stale role assignment');

select * from finish();
rollback;
