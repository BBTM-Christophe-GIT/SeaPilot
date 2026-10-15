-- LOCAL regression only. Synthetic Marin/Capitaine accounts use the real API
-- session roles with a year of source intervals. All fixtures are rolled back.
begin;
-- Run with the local cluster superuser so session authorization can switch to
-- authenticator after seeding closed historical periods as postgres.
set local session authorization postgres;
select plan(19);

insert into public.companies(code,name) values ('wt-history-latency','Synthetic working-time history');
insert into auth.users(id,email) values
  ('91500000-0000-4000-8000-000000000001','history-marin@example.invalid'),
  ('91500000-0000-4000-8000-000000000002','history-capitaine@example.invalid');
insert into public.profiles(id,email,display_name,active_company_id)
select actor.id, actor.email, 'Synthetic history actor', company.id
from auth.users actor cross join public.companies company
where actor.id in ('91500000-0000-4000-8000-000000000001','91500000-0000-4000-8000-000000000002')
  and company.code='wt-history-latency';
insert into public.company_memberships(company_id,user_id,active)
select active_company_id,id,true from public.profiles where email like 'history-%@example.invalid'
on conflict(company_id,user_id) do update set active=true;
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,case when email='history-capitaine@example.invalid' then 'capitaine' else 'marin' end
from public.profiles where email like 'history-%@example.invalid';
insert into public.people(company_id,user_id,first_name,last_name,function_label,sailor_number,active)
select active_company_id,id,'Synthetic','History actor',
  case when email='history-capitaine@example.invalid' then 'Capitaine' else 'Matelot' end,
  case when email='history-capitaine@example.invalid' then 'HISTORY-915-C' else 'HISTORY-915-M' end,true
from public.profiles where email like 'history-%@example.invalid';
insert into public.planning_work_rest_policies(company_id,name,scope,effective_from,
  max_work_24h,min_rest_24h,max_work_7d,min_rest_7d,min_consecutive_rest_hours,
  max_rest_periods_24h,night_starts_at,night_ends_at,max_night_work_24h,max_amplitude_hours,max_interval_between_rests_hours,active)
select id,'History company policy','company',current_date-400,
  12,12,84,84,6,3,'22:00','06:00',8,13,24,true
from public.companies where code='wt-history-latency';
insert into public.working_time_registers(company_id,person_id,period_kind,period_start,period_end)
select person.company_id,person.id,'monthly',month_start::date,(month_start+interval '1 month -1 day')::date
from public.people person cross join generate_series(
  date_trunc('month',current_date-365),date_trunc('month',current_date),interval '1 month'
) month_start where person.sailor_number in ('HISTORY-915-M','HISTORY-915-C');
-- Seed raw historical import evidence without generating thousands of unrelated
-- rolling windows. Restore the trigger before exercising the API workflows.
alter table public.working_time_intervals disable trigger working_time_intervals_recalculate;
do $$
declare person public.people%rowtype;
begin
  for person in select * from public.people where sailor_number in ('HISTORY-915-M','HISTORY-915-C') loop
    perform set_config('request.jwt.claim.sub',person.user_id::text,true);
    insert into public.working_time_intervals(company_id,register_id,person_id,local_work_date,
      starts_at,ends_at,timezone_name,utc_offset_minutes,source_type)
    select person.company_id,register.id,person.id,work_date::date,
      (work_date::date+time '08:00') at time zone 'UTC',
      (work_date::date+time '16:00') at time zone 'UTC','UTC',0,'migration'
    from generate_series(current_date-365,current_date-10,interval '1 day') work_date
    join public.working_time_registers register on register.period_kind='monthly'
      and work_date::date between register.period_start and register.period_end
    where register.person_id=person.id;
  end loop;
end;
$$;
alter table public.working_time_intervals enable trigger working_time_intervals_recalculate;
select set_config('test.history_marin',(select id::text from public.people where sailor_number='HISTORY-915-M'),true);
select set_config('test.history_captain',(select id::text from public.people where sailor_number='HISTORY-915-C'),true);
select set_config('test.history_phases',jsonb_build_array(
  jsonb_build_object('starts_at',current_date||'T07:30:00Z','ends_at',current_date||'T12:00:00Z'),
  jsonb_build_object('starts_at',current_date||'T12:30:00Z','ends_at',current_date||'T15:00:00Z')
)::text,true);

select ok(not has_function_privilege('authenticated',
  'private.working_time_recommendation_policy(bigint,timestamptz,timestamptz,text,bigint,text,bigint)','EXECUTE'),
  'authenticated callers cannot invoke the internal authorization helper');
select ok(not has_function_privilege('anon',
  'private.working_time_recommendation_policy(bigint,timestamptz,timestamptz,text,bigint,text,bigint)','EXECUTE'),
  'anonymous callers cannot invoke the internal authorization helper');

set local session authorization authenticator;
set local role authenticated;
set local statement_timeout='8s';
select set_config('request.jwt.claim.sub','91500000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"91500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(session_user::text,'authenticator','history tests use the API session rather than the maintenance bypass');
create temp table history_marin_response as
select public.working_time_phases_recommendation(current_setting('test.history_marin')::bigint,
  current_setting('test.history_phases')::jsonb,'UTC',null,null,null) recommendation;
select is((select recommendation->>'status' from history_marin_response),'conforme','a Marin with a year of history is analysed within the API timeout');
select is((select (recommendation->>'work_24h_seconds')::numeric from history_marin_response),25200::numeric,'seven hours of work exclude the break');
select is((select (recommendation->>'available_24h_seconds')::numeric from history_marin_response),18000::numeric,'the configured work quota is retained');
select is((select (recommendation->>'latest_end_at')::timestamptz from history_marin_response),
  (current_date+time '20:00') at time zone 'UTC','extension still stops at the first failing half-hour');
select is((select (recommendation->>'next_resume_at')::timestamptz from history_marin_response),
  (current_date+time '21:00') at time zone 'UTC','restart still selects the earliest compatible half-hour');
select is((select recommendation->'violation_codes' from history_marin_response),'[]'::jsonb,'no compliance rule is relaxed');
select throws_ok($$select public.working_time_phases_recommendation(current_setting('test.history_captain')::bigint,
  current_setting('test.history_phases')::jsonb,'UTC',null,null,null)$$,
  '42501','WORKING_TIME_PERMISSION_DENIED: recommandation.','a Marin cannot analyse another profile');
select throws_ok($$select public.working_time_phases_recommendation(current_setting('test.history_marin')::bigint,
  current_setting('test.history_phases')::jsonb,'UTC',null,null,-1)$$,
  '22023','WORKING_TIME_INTERVAL_NOT_FOUND.','excluding an unknown interval remains rejected');
select throws_ok($$select public.working_time_phases_recommendation(current_setting('test.history_marin')::bigint,
  current_setting('test.history_phases')::jsonb,'UTC',-1,null,null)$$,
  '22023','WORKING_TIME_VESSEL_INVALID.','an unknown vessel remains rejected');

select set_config('request.jwt.claim.sub','91500000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"91500000-0000-4000-8000-000000000002","role":"authenticated"}',true);
create temp table history_captain_response as
select public.working_time_phases_recommendation(current_setting('test.history_captain')::bigint,
  current_setting('test.history_phases')::jsonb,'UTC',null,null,null) recommendation;
select is((select recommendation from history_captain_response),(select recommendation from history_marin_response),
  'a real Capitaine account retains the same calculations for identical historical intervals');
select is((public.working_time_interval_recommendation(current_setting('test.history_captain')::bigint,
  (current_date+time '07:30') at time zone 'UTC',(current_date+time '12:00') at time zone 'UTC','UTC',null,null,null)->>'latest_end_at')::timestamptz,
  (current_date+time '19:30') at time zone 'UTC','the single-interval extension retains its first failing boundary');
select throws_ok($$select public.working_time_phases_recommendation(current_setting('test.history_marin')::bigint,
  current_setting('test.history_phases')::jsonb,'UTC',null,null,null)$$,
  '42501','WORKING_TIME_PERMISSION_DENIED: recommandation.','a Capitaine without matching Planning cannot analyse a peer');
select is((select count(*)::integer from public.working_time_intervals where person_id=current_setting('test.history_captain')::bigint),
  356,'recommendations never persist proposed intervals');
select is((select count(*)::integer from public.planning_assignments where crew_person_id=current_setting('test.history_captain')::bigint),
  0,'the real Capitaine fixture does not depend on simulated Planning');
select lives_ok($$select public.save_working_time_phases(
  (select id from public.working_time_registers where person_id=current_setting('test.history_captain')::bigint
    and period_kind='monthly' and period_start=date_trunc('month',current_date)::date),
  current_setting('test.history_phases')::jsonb,'UTC',null,null,'Synthetic history draft')$$,
  'a real Capitaine saves both phases within the same eight-second API budget');
select is((select count(*)::integer from public.working_time_intervals
  where person_id=current_setting('test.history_captain')::bigint and local_work_date=current_date),
  2,'both disjoint phases are persisted by the controlled draft RPC');

reset role;
reset session authorization;
select * from finish();
rollback;
