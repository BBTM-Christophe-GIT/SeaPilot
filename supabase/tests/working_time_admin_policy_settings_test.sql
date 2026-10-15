-- Synthetic LOCAL regression only. Real authenticated roles, no administrator UI simulation.
-- No production data or policy is changed; every fixture is rolled back.
begin;
select no_plan();

select ok(has_function_privilege('authenticated',
  'public.save_planning_work_rest_policy(bigint,text,text,bigint,date,date,numeric,numeric,numeric,numeric,numeric,integer,time,time,numeric,boolean,boolean,text,numeric,numeric)',
  'EXECUTE'), 'authenticated users can invoke the controlled policy RPC');
select ok(not has_function_privilege('anon',
  'public.save_planning_work_rest_policy(bigint,text,text,bigint,date,date,numeric,numeric,numeric,numeric,numeric,integer,time,time,numeric,boolean,boolean,text,numeric,numeric)',
  'EXECUTE'), 'anonymous users cannot invoke the policy RPC');
select ok(pg_get_functiondef(
  'public.save_planning_work_rest_policy(bigint,text,text,bigint,date,date,numeric,numeric,numeric,numeric,numeric,integer,time,time,numeric,boolean,boolean,text,numeric,numeric)'::regprocedure
  ) like '%has_company_role(target_company_id, array[''admin''])%',
  'the policy RPC requires the administrator role in the active company');
select ok(pg_get_functiondef(
  'public.save_planning_work_rest_policy(bigint,text,text,bigint,date,date,numeric,numeric,numeric,numeric,numeric,integer,time,time,numeric,boolean,boolean,text,numeric,numeric)'::regprocedure
  ) not like '%planning_user_can%',
  'delegated Planning permissions cannot grant policy administration');
select ok((select bool_and(column_default is null) from information_schema.columns
  where table_schema='public' and table_name='planning_work_rest_policies'
    and column_name in ('max_work_24h','min_rest_24h','max_work_7d','min_rest_7d',
      'min_consecutive_rest_hours','max_rest_periods_24h','night_starts_at','night_ends_at','max_night_work_24h')),
  'existing policy thresholds and the night window have no implicit database defaults');
select ok(not has_table_privilege('authenticated', 'public.planning_work_rest_policies', 'INSERT')
  and not has_table_privilege('authenticated', 'public.planning_work_rest_policies', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.planning_work_rest_policies', 'DELETE'),
  'policy writes cannot bypass the controlled RPC through direct table DML');

insert into public.companies(code,name) values
  ('wt-policy-admin-test','Synthetic policy company'),
  ('wt-policy-admin-other','Synthetic other policy company');
insert into auth.users(id,email)
select ('77000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  'policy-actor-'||n||'@example.invalid' from generate_series(1,6) n;
insert into public.profiles(id,email,display_name,active_company_id)
select u.id,u.email,'Synthetic policy actor',c.id from auth.users u join public.companies c
  on c.code=case when right(u.id::text,1)='6' then 'wt-policy-admin-other' else 'wt-policy-admin-test' end
where u.id::text like '77000000-0000-0000-0000-%';
insert into public.company_memberships(company_id,user_id,active)
select active_company_id,id,true from public.profiles where id::text like '77000000-0000-0000-0000-%'
on conflict(company_id,user_id) do update set active=true;
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,case right(id::text,1)
  when '1' then 'admin' when '2' then 'direction' when '3' then 'armement'
  when '4' then 'capitaine' when '5' then 'marin' else 'admin' end
from public.profiles where id::text like '77000000-0000-0000-0000-%';
insert into public.people(company_id,user_id,first_name,last_name,function_label,sailor_number,hired_on,active)
select active_company_id,id,'Synthetic','Policy actor '||right(id::text,1),
  case when right(id::text,1)='4' then 'Capitaine' else 'Matelot' end,
  'POLICY-ROLE-'||right(id::text,1),current_date-10,true
from public.profiles where id::text like '77000000-0000-0000-0000-%';
insert into public.vessels(company_id,name,acronym,active)
select id,'POLICY SETTINGS TEST VESSEL','PST',true from public.companies where code='wt-policy-admin-test';
insert into public.planning_work_rest_policies(company_id,name,scope,effective_from,
  max_work_24h,min_rest_24h,max_work_7d,min_rest_7d,min_consecutive_rest_hours,
  max_rest_periods_24h,night_starts_at,night_ends_at,max_night_work_24h,
  max_amplitude_hours,max_interval_between_rests_hours,active)
select id,'Synthetic role policy','company','2031-01-01',12,10,84,52,6,6,'20:00','06:00',10,14,14,false
from public.companies where code='wt-policy-admin-test';
select set_config('test.policy_id',(select id::text from public.planning_work_rest_policies where name='Synthetic role policy'),true);
select set_config('test.policy_company',(select id::text from public.companies where code='wt-policy-admin-test'),true);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.save_planning_work_rest_policy(
  null,'Synthetic role policy','company',null,'2031-01-01',null,
  12,10,84,52,6,6,'20:00','06:00',10,true,false,'Denied policy write',13.5,13)$$,
  '42501','Seul un administrateur peut gérer les politiques de travail et repos.',
  'direction cannot create a policy');
select throws_ok($$select public.save_planning_work_rest_policy(
  current_setting('test.policy_id')::bigint,'Synthetic role policy','company',null,'2031-01-01',null,
  11,10,84,52,6,6,'20:00','06:00',10,true,false,'Denied policy write',13.5,13)$$,
  '42501','Seul un administrateur peut gérer les politiques de travail et repos.',
  'direction cannot change policy thresholds');
select throws_ok($$select public.save_planning_work_rest_policy(
  current_setting('test.policy_id')::bigint,'Synthetic role policy','company',null,'2031-01-01',null,
  12,10,84,52,6,6,'20:00','06:00',10,true,false,'Denied policy write',13.5,13)$$,
  '42501','Seul un administrateur peut gérer les politiques de travail et repos.',
  'direction cannot deactivate a policy');
select throws_ok($$insert into public.planning_work_rest_policies default values$$,
  '42501','permission denied for table planning_work_rest_policies','direction cannot insert policies directly');
select throws_ok($$update public.planning_work_rest_policies set max_work_24h=1 where id=current_setting('test.policy_id')::bigint$$,
  '42501','permission denied for table planning_work_rest_policies','direction cannot update thresholds directly');
select throws_ok($$delete from public.planning_work_rest_policies where id=current_setting('test.policy_id')::bigint$$,
  '42501','permission denied for table planning_work_rest_policies','direction cannot delete policies directly');
select is((select min_rest_24h from public.planning_work_rest_policies where id=current_setting('test.policy_id')::bigint),
  10::numeric,'direction retains read-only access to own company thresholds');

select set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.save_planning_work_rest_policy(
  null,'Synthetic role policy','company',null,'2031-01-01',null,
  12,10,84,52,6,6,'20:00','06:00',10,true,false,'Denied policy write',13.5,13)$$,
  '42501','Seul un administrateur peut gérer les politiques de travail et repos.',
  'armement cannot create a policy');
select throws_ok($$select public.save_planning_work_rest_policy(
  current_setting('test.policy_id')::bigint,'Synthetic role policy','company',null,'2031-01-01',null,
  11,10,84,52,6,6,'20:00','06:00',10,true,false,'Denied policy write',13.5,13)$$,
  '42501','Seul un administrateur peut gérer les politiques de travail et repos.',
  'armement cannot change policy thresholds');
select throws_ok($$select public.save_planning_work_rest_policy(
  current_setting('test.policy_id')::bigint,'Synthetic role policy','company',null,'2031-01-01',null,
  12,10,84,52,6,6,'20:00','06:00',10,true,false,'Denied policy write',13.5,13)$$,
  '42501','Seul un administrateur peut gérer les politiques de travail et repos.',
  'armement cannot deactivate a policy');
select throws_ok($$insert into public.planning_work_rest_policies default values$$,
  '42501','permission denied for table planning_work_rest_policies','armement cannot insert policies directly');
select throws_ok($$update public.planning_work_rest_policies set max_work_24h=1 where id=current_setting('test.policy_id')::bigint$$,
  '42501','permission denied for table planning_work_rest_policies','armement cannot update thresholds directly');
select throws_ok($$delete from public.planning_work_rest_policies where id=current_setting('test.policy_id')::bigint$$,
  '42501','permission denied for table planning_work_rest_policies','armement cannot delete policies directly');
select is((select min_rest_24h from public.planning_work_rest_policies where id=current_setting('test.policy_id')::bigint),
  10::numeric,'armement retains read-only access to own company thresholds');

select set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000004',true);
select throws_ok($$select public.save_planning_work_rest_policy(
  null,'Synthetic role policy','company',null,'2031-01-01',null,
  12,10,84,52,6,6,'20:00','06:00',10,true,false,'Denied policy write',13.5,13)$$,
  '42501','Seul un administrateur peut gérer les politiques de travail et repos.',
  'capitaine cannot create a policy');
select throws_ok($$select public.save_planning_work_rest_policy(
  current_setting('test.policy_id')::bigint,'Synthetic role policy','company',null,'2031-01-01',null,
  11,10,84,52,6,6,'20:00','06:00',10,true,false,'Denied policy write',13.5,13)$$,
  '42501','Seul un administrateur peut gérer les politiques de travail et repos.',
  'capitaine cannot change policy thresholds');
select throws_ok($$select public.save_planning_work_rest_policy(
  current_setting('test.policy_id')::bigint,'Synthetic role policy','company',null,'2031-01-01',null,
  12,10,84,52,6,6,'20:00','06:00',10,true,false,'Denied policy write',13.5,13)$$,
  '42501','Seul un administrateur peut gérer les politiques de travail et repos.',
  'capitaine cannot deactivate a policy');
select throws_ok($$insert into public.planning_work_rest_policies default values$$,
  '42501','permission denied for table planning_work_rest_policies','capitaine cannot insert policies directly');
select throws_ok($$update public.planning_work_rest_policies set max_work_24h=1 where id=current_setting('test.policy_id')::bigint$$,
  '42501','permission denied for table planning_work_rest_policies','capitaine cannot update thresholds directly');
select throws_ok($$delete from public.planning_work_rest_policies where id=current_setting('test.policy_id')::bigint$$,
  '42501','permission denied for table planning_work_rest_policies','capitaine cannot delete policies directly');
select is((select min_rest_24h from public.planning_work_rest_policies where id=current_setting('test.policy_id')::bigint),
  10::numeric,'capitaine retains read-only access to own company thresholds');

select set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000005',true);
select throws_ok($$select public.save_planning_work_rest_policy(
  null,'Synthetic role policy','company',null,'2031-01-01',null,
  12,10,84,52,6,6,'20:00','06:00',10,true,false,'Denied policy write',13.5,13)$$,
  '42501','Seul un administrateur peut gérer les politiques de travail et repos.',
  'marin cannot create a policy');
select throws_ok($$select public.save_planning_work_rest_policy(
  current_setting('test.policy_id')::bigint,'Synthetic role policy','company',null,'2031-01-01',null,
  11,10,84,52,6,6,'20:00','06:00',10,true,false,'Denied policy write',13.5,13)$$,
  '42501','Seul un administrateur peut gérer les politiques de travail et repos.',
  'marin cannot change policy thresholds');
select throws_ok($$select public.save_planning_work_rest_policy(
  current_setting('test.policy_id')::bigint,'Synthetic role policy','company',null,'2031-01-01',null,
  12,10,84,52,6,6,'20:00','06:00',10,true,false,'Denied policy write',13.5,13)$$,
  '42501','Seul un administrateur peut gérer les politiques de travail et repos.',
  'marin cannot deactivate a policy');
select throws_ok($$insert into public.planning_work_rest_policies default values$$,
  '42501','permission denied for table planning_work_rest_policies','marin cannot insert policies directly');
select throws_ok($$update public.planning_work_rest_policies set max_work_24h=1 where id=current_setting('test.policy_id')::bigint$$,
  '42501','permission denied for table planning_work_rest_policies','marin cannot update thresholds directly');
select throws_ok($$delete from public.planning_work_rest_policies where id=current_setting('test.policy_id')::bigint$$,
  '42501','permission denied for table planning_work_rest_policies','marin cannot delete policies directly');
select is((select min_rest_24h from public.planning_work_rest_policies where id=current_setting('test.policy_id')::bigint),
  10::numeric,'marin retains read-only access to own company thresholds');

select set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.save_planning_work_rest_policy(
  null,'Global dated policy','company',null,'2032-01-01','2032-12-31',
  12,11,72,96,6,2,'22:00','06:00',8,true,true,'Administrator configuration',13.25,12.5)$$,
  'admin can create a dated company policy with explicit amplitude and rest interval');
select is((select row(scope,vessel_id,effective_from,effective_to,max_work_24h,min_rest_24h,
  max_work_7d,min_rest_7d,min_consecutive_rest_hours,max_rest_periods_24h,
  night_starts_at,night_ends_at,max_night_work_24h,max_amplitude_hours,max_interval_between_rests_hours,include_handover)::text
  from public.planning_work_rest_policies where name='Global dated policy'),
  '(company,,2032-01-01,2032-12-31,12.00,11.00,72.00,96.00,6.00,2,22:00:00,06:00:00,8.00,13.25,12.50,t)',
  'every administrator-entered threshold and effective date is preserved');
select lives_ok($$select public.save_planning_work_rest_policy(
  current_setting('test.policy_id')::bigint,'Synthetic role policy','company',null,'2031-01-01','2031-12-31',
  11,10,80,60,7,3,'21:00','05:00',7,false,true,'Administrator update',13,12)$$,
  'admin can update all policy thresholds and activate a policy');
select is((select row(max_work_24h,min_consecutive_rest_hours,max_amplitude_hours,max_interval_between_rests_hours,active)::text
  from public.planning_work_rest_policies where id=current_setting('test.policy_id')::bigint),
  '(11.00,7.00,13.00,12.00,t)','updated thresholds are stored on the selected policy');
select lives_ok($$select public.save_planning_work_rest_policy(
  current_setting('test.policy_id')::bigint,'Synthetic role policy','company',null,'2031-01-01','2031-12-31',
  11,10,80,60,7,3,'21:00','05:00',7,false,false,'Administrator deactivation',13,12)$$,
  'admin can deactivate a policy');
select is((select active from public.planning_work_rest_policies where id=current_setting('test.policy_id')::bigint),
  false,'administrator deactivation retains the dated policy history');
select lives_ok($$select public.save_planning_work_rest_policy(
  null,'Vessel dated policy','vessel',(select id from public.vessels where name='POLICY SETTINGS TEST VESSEL'),
  '2033-01-01',null,13,10,78,90,5,3,'21:30','05:30',7,false,false,'Vessel configuration',14,13)$$,
  'admin can create a dated vessel-specific policy');
select throws_ok($$select public.save_planning_work_rest_policy(
  null,'Overlapping company policy','company',null,'2032-06-01','2032-12-31',
  12,11,72,96,6,2,'22:00','06:00',8,true,true,'Overlap',14,14)$$,
  '23P01','Une politique active couvre déjà cette portée et cette période.',
  'administrator changes retain the existing active-period overlap guard');

select set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000006',true);
select is((select count(*) from public.planning_work_rest_policies where id=current_setting('test.policy_id')::bigint),
  0::bigint,'an administrator in another company cannot read the policy');
select throws_ok($$select public.save_planning_work_rest_policy(
  current_setting('test.policy_id')::bigint,'Cross-company policy write','company',null,'2031-01-01',null,
  12,10,84,52,6,6,'20:00','06:00',10,true,false,'Forbidden tenant change',14,14)$$,
  'P0002','Politique introuvable.','an administrator cannot update another company policy');
select * from finish();
rollback;
