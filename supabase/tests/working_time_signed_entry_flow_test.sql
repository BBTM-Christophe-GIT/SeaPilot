-- Synthetic LOCAL database regression only; every fixture is rolled back.
-- Exercise the deployed daily workflow under the real authenticator session,
-- rather than the postgres maintenance bypass. Do not run against production.
begin;

select plan(21);
insert into public.companies(code,name) values
  ('wt-signed-entry-test','Synthetic signed entry'),
  ('wt-signed-entry-other','Synthetic other signed entry');
insert into auth.users(id,email)
select ('99515000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'signed-entry-'||n||'@example.invalid' from generate_series(1,7)n;
insert into public.profiles(id,email,display_name,active_company_id)
select u.id,u.email,'Synthetic signed actor',c.id from auth.users u join public.companies c
  on c.code=case when right(u.id::text,1)='6' then 'wt-signed-entry-other' else 'wt-signed-entry-test' end
where u.id::text like '99515000-0000-4000-8000-%';
insert into public.company_memberships(company_id,user_id,active)
select active_company_id,id,true from public.profiles where id::text like '99515000-0000-4000-8000-%'
on conflict(company_id,user_id) do update set active=true;
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,case right(id::text,1)
  when '1' then 'marin' when '2' then 'capitaine' when '3' then 'admin'
  when '4' then 'direction' when '5' then 'armement' when '6' then 'admin' else 'marin' end
from public.profiles where id::text like '99515000-0000-4000-8000-%';
insert into public.people(company_id,user_id,first_name,last_name,function_label,sailor_number,hired_on,active)
select active_company_id,id,'Synthetic','Signed actor '||right(id::text,1),
  case when right(id::text,1)='2' then 'Capitaine' else 'Matelot' end,
  'SIGNED-ENTRY-'||right(id::text,1),current_date-4,true
from public.profiles where id::text like '99515000-0000-4000-8000-%';
select set_config('test.signed_company',(select id::text from public.companies where code='wt-signed-entry-test'),true);
select set_config('test.signed_person',(select id::text from public.people where user_id='99515000-0000-4000-8000-000000000001'),true);
select set_config('test.signed_captain',(select id::text from public.people where user_id='99515000-0000-4000-8000-000000000002'),true);
select set_config('test.signed_day',(current_date-2)::text,true);
insert into public.working_time_registers(company_id,person_id,period_kind,period_start,period_end)
select company_id,id,'monthly',date_trunc('month',current_date-2)::date,
  (date_trunc('month',current_date-2)+interval'1 month -1 day')::date
from public.people where user_id::text like '99515000-0000-4000-8000-%' on conflict do nothing;
select set_config('test.signed_register',(select id::text from public.working_time_registers
  where person_id=current_setting('test.signed_person')::bigint and period_kind='monthly'
  and period_start=date_trunc('month',current_date-2)::date),true);
insert into public.planning_work_rest_policies(company_id,name,scope,effective_from,
  max_work_24h,min_rest_24h,max_work_7d,min_rest_7d,min_consecutive_rest_hours,
  max_rest_periods_24h,night_starts_at,night_ends_at,max_night_work_24h,max_amplitude_hours,max_interval_between_rests_hours,active)
values(current_setting('test.signed_company')::bigint,'Synthetic twelve-ten-six','company',current_date-10,
  12,10,72,77,6,3,'22:00','06:00',8,14,14,true);

-- The cumulative-rest helper and the separate continuous-rest requirement are
-- conjunctive. Completing six hours never replaces ten cumulative hours.
select ok(not private.working_time_rest_24h_satisfied(27000,21600,10,6),'six continuous hours do not replace the ten-hour cumulative requirement');
select ok(not private.working_time_rest_24h_satisfied(35999,21600,10,6),'one second below ten cumulative hours remains insufficient');
select ok(private.working_time_rest_24h_satisfied(36000,21600,10,6),'the cumulative-rest component accepts exactly ten hours');
-- Real API session roles, with synthetic identities only. A draft does not need
-- a signature; submission and approval still require their separate evidence.
set local session authorization authenticator;
set local role authenticated;
select is(session_user::text,'authenticator','workflow checks do not use the postgres maintenance bypass');
select set_config('request.jwt.claim.sub','99515000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"99515000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('test.signed_boundary',public.working_time_phases_recommendation(
  current_setting('test.signed_person')::bigint,
  jsonb_build_array(
    jsonb_build_object('starts_at',current_setting('test.signed_day')||'T05:59:00Z',
      'ends_at',current_setting('test.signed_day')||'T12:00:00Z'),
    jsonb_build_object('starts_at',current_setting('test.signed_day')||'T16:01:00Z',
      'ends_at',(current_setting('test.signed_day')::date+1)||'T00:00:00Z')
  ),'UTC',null,null,null)::text,true);
select ok(
  (current_setting('test.signed_boundary')::jsonb->>'rest_24h_seconds')::numeric=36000
  and (current_setting('test.signed_boundary')::jsonb->>'longest_rest_24h_seconds')::numeric=21540
  and current_setting('test.signed_boundary')::jsonb->'violation_codes' ? 'consecutive_rest'
  and not (current_setting('test.signed_boundary')::jsonb->'violation_codes' ? 'rest_24h'),
  'the real recommendation rejects five hours fifty-nine minutes continuous despite ten cumulative hours');
select lives_ok($$select public.save_working_time_phases(current_setting('test.signed_register')::bigint,
  jsonb_build_array(jsonb_build_object('starts_at',current_setting('test.signed_day')||'T04:00:00Z',
  'ends_at',current_setting('test.signed_day')||'T12:00:00Z')),'UTC',null,null,'Synthetic draft')$$,
  'a real Marin role can save their own draft without a signature or Planning');
select throws_ok($$select public.submit_working_time_day(current_setting('test.signed_register')::bigint,current_setting('test.signed_day')::date)$$,
  '23514','WORKING_TIME_ACTIVE_SIGNATURE_REQUIRED.','submission still requires an active subject signature');
reset role;
reset session authorization;
insert into public.working_time_profile_signatures(company_id,person_id,version_number,storage_path,mime_type,file_size_bytes,sha256)
select company_id,id,1,company_id||'/'||id||'/synthetic.png','image/png',10,repeat('a',64)
from public.people where user_id::text like '99515000-0000-4000-8000-%';
set local session authorization authenticator;
set local role authenticated;
select set_config('test.signed_approval',public.submit_working_time_day(current_setting('test.signed_register')::bigint,current_setting('test.signed_day')::date)::text,true);
select is((select status from public.working_time_day_approvals where id=current_setting('test.signed_approval')::bigint),'submitted','without Planning the signed day enters the management approval queue');
select is((select approver_person_id from public.working_time_day_approvals where id=current_setting('test.signed_approval')::bigint),null::bigint,'the fallback queue does not invent a captain');
select throws_ok($$select public.validate_working_time_day(current_setting('test.signed_approval')::bigint)$$,
  '42501',null,'a Marin cannot approve their own submitted day');
select set_config('request.jwt.claim.sub','99515000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"99515000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.validate_working_time_day(current_setting('test.signed_approval')::bigint)$$,
  '42501',null,'a Capitaine without a matching Planning assignment cannot approve a peer');
select set_config('request.jwt.claim.sub','99515000-0000-4000-8000-000000000006',true);
select set_config('request.jwt.claims','{"sub":"99515000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select throws_ok($$select public.validate_working_time_day(current_setting('test.signed_approval')::bigint)$$,
  '42501',null,'an Admin of another company cannot approve the day');
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select public.validate_working_time_day(current_setting('test.signed_approval')::bigint)$$,
  '42501',null,'a missing JWT identity cannot approve the day');
select set_config('request.jwt.claim.sub','99515000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"99515000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select lives_ok($$select public.validate_working_time_day(current_setting('test.signed_approval')::bigint)$$,
  'Direction can approve the signed conforming day in the fallback queue');
select is((select status from public.working_time_day_approvals where id=current_setting('test.signed_approval')::bigint),'validated','the day is validated after the authorized decision');
select ok((select subject_signature_snapshot->>'signer_person_id'=current_setting('test.signed_person')
  and approver_signature_snapshot->>'signer_person_id'=(
    select id::text from public.people where user_id='99515000-0000-4000-8000-000000000004')
  and subject_signature_snapshot->>'signature_id'<>approver_signature_snapshot->>'signature_id'
  from public.working_time_day_approvals where id=current_setting('test.signed_approval')::bigint),
  'frozen snapshots identify the exact subject and Direction with distinct signature versions');
select set_config('request.jwt.claim.sub','99515000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"99515000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.save_working_time_phases(current_setting('test.signed_register')::bigint,
  jsonb_build_array(jsonb_build_object('starts_at',current_setting('test.signed_day')||'T14:00:00Z',
  'ends_at',current_setting('test.signed_day')||'T15:00:00Z')),'UTC',null,null,'Locked draft')$$,
  '42501',null,'a validated day remains locked for its holder');
reset role;
reset session authorization;

-- A distinct Marin/Capitaine pair proves that Planning still selects the real
-- approver and that the normal signed daily chain works with the cumulative and continuous rest requirements.
insert into public.vessels(company_id,name,acronym,active)
values(current_setting('test.signed_company')::bigint,'Synthetic signed vessel','SIGNED',true);
select set_config('test.signed_vessel',(select id::text from public.vessels where company_id=current_setting('test.signed_company')::bigint and acronym='SIGNED'),true);
select set_config('test.signed_peer',(select id::text from public.people where user_id='99515000-0000-4000-8000-000000000007'),true);
select set_config('test.signed_peer_register',(select id::text from public.working_time_registers
  where person_id=current_setting('test.signed_peer')::bigint and period_kind='monthly'
  and period_start=date_trunc('month',current_setting('test.signed_day')::date)::date),true);
insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,starts_at,ends_at,
  assignment_role,status_label,confirmation_status,watch_group,source_label)
select p.company_id,current_setting('test.signed_vessel')::bigint,p.id,current_setting('test.signed_day')::date,
  current_setting('test.signed_day')::date,(current_setting('test.signed_day')||'T00:00:00Z')::timestamptz,
  (current_setting('test.signed_day')||'T23:59:59Z')::timestamptz,p.function_label,'En mer','confirmed','Synthetic A','signed-entry-test'
from public.people p where p.id in(current_setting('test.signed_peer')::bigint,current_setting('test.signed_captain')::bigint);
set local session authorization authenticator;
set local role authenticated;
select set_config('request.jwt.claim.sub','99515000-0000-4000-8000-000000000007',true);
select set_config('request.jwt.claims','{"sub":"99515000-0000-4000-8000-000000000007","role":"authenticated"}',true);
select lives_ok($$select public.save_working_time_phases(current_setting('test.signed_peer_register')::bigint,
  jsonb_build_array(jsonb_build_object('starts_at',current_setting('test.signed_day')||'T08:00:00Z',
  'ends_at',current_setting('test.signed_day')||'T12:00:00Z')),'UTC',current_setting('test.signed_vessel')::bigint,'Synthetic A','Assigned draft')$$,
  'a second Marin saves their own planned phases');
select is((public.working_time_day_context(current_setting('test.signed_peer')::bigint,current_setting('test.signed_day')::date)->>'approver_person_id')::bigint,
  current_setting('test.signed_captain')::bigint,'Planning resolves the matching real Capitaine');
select set_config('test.signed_peer_approval',public.submit_working_time_day(current_setting('test.signed_peer_register')::bigint,current_setting('test.signed_day')::date)::text,true);
select set_config('request.jwt.claim.sub','99515000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"99515000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select lives_ok($$select public.validate_working_time_day(current_setting('test.signed_peer_approval')::bigint)$$,
  'the assigned Capitaine can validate the signed conforming peer day');
select is((select status from public.working_time_day_approvals where id=current_setting('test.signed_peer_approval')::bigint),
  'validated','the assigned approval records a validated state');
reset role;
reset session authorization;

select * from finish();
rollback;
