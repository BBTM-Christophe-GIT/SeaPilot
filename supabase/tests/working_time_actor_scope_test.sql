-- Independent synthetic companies. Use the API session identity, not postgres's maintenance date bypass.
begin;
select no_plan();

insert into public.companies(code,name) values
  ('wt-actor-scope-test','Synthetic actor scope company'),
  ('wt-actor-other-test','Synthetic other scope company');
insert into auth.users(id,email)
select ('91910000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'wt-actor-' || n || '@example.invalid' from generate_series(1,8) n;
insert into public.profiles(id,email,display_name,active_company_id)
select u.id,u.email,'Synthetic actor ' || right(u.id::text,1),c.id
from auth.users u join public.companies c on c.code=case when right(u.id::text,1)='7' then 'wt-actor-other-test' else 'wt-actor-scope-test' end
where u.id::text like '91910000-0000-4000-8000-%';
insert into public.user_roles(user_id,company_id,role_key)
select p.id,p.active_company_id,case right(p.id::text,1)
  when '2' then 'admin' when '3' then 'direction' when '4' then 'armement'
  when '5' then 'capitaine' when '7' then 'admin' when '8' then 'admin' else 'marin' end
from public.profiles p where p.id::text like '91910000-0000-4000-8000-%';
insert into public.people(company_id,user_id,first_name,last_name,function_label,sailor_number,active)
select p.active_company_id,p.id,'Synthetic','Actor ' || right(p.id::text,1),
  case when right(p.id::text,1)='5' then 'Capitaine' else 'Matelot' end,
  'WTAS-' || right(p.id::text,1),true
from public.profiles p where p.id::text like '91910000-0000-4000-8000-%' and right(p.id::text,1)<>'6';
insert into public.working_time_registers(company_id,person_id,period_kind,period_start,period_end,created_by)
select p.company_id,p.id,'monthly',date_trunc('month',current_date)::date,
  (date_trunc('month',current_date)+interval'1 month - 1 day')::date,p.user_id
from public.people p where p.sailor_number like 'WTAS-%' on conflict do nothing;
insert into public.working_time_registers(company_id,person_id,period_kind,period_start,period_end,created_by)
select p.company_id,p.id,'monthly',m.starts_on,(m.starts_on+interval'1 month - 1 day')::date,p.user_id
from public.people p cross join(values
  ((date_trunc('month',current_date)-interval'1 month')::date),
  ((date_trunc('month',current_date)-interval'3 months')::date)
) m(starts_on) where p.sailor_number='WTAS-1' on conflict do nothing;
select set_config('test.scope_person',(select id::text from public.people where sailor_number='WTAS-1'),true);
select set_config('test.scope_company',(select id::text from public.companies where code='wt-actor-scope-test'),true);
select set_config('test.scope_register',(select id::text from public.working_time_registers where person_id=current_setting('test.scope_person')::bigint and period_kind='monthly' and period_start=date_trunc('month',current_date)::date),true);
insert into public.working_time_registers(company_id,person_id,period_kind,period_start,period_end,created_by)
values(current_setting('test.scope_company')::bigint,current_setting('test.scope_person')::bigint,'weekly',current_date-1,current_date+5,'91910000-0000-4000-8000-000000000001');
select set_config('test.scope_weekly',(select id::text from public.working_time_registers where person_id=current_setting('test.scope_person')::bigint and period_kind='weekly' and period_start=current_date-1),true);
insert into public.working_time_day_approvals(company_id,register_id,person_id,local_work_date,status,
  approver_person_id,submitted_by,submitted_by_person_id,submitted_at,validated_by,validated_by_person_id,validated_at)
select p.company_id,r.id,p.id,current_date-1,'validated',captain.id,p.user_id,p.id,now(),captain.user_id,captain.id,now()
from public.people p join public.people captain on captain.sailor_number='WTAS-5'
join public.working_time_registers r on r.person_id=p.id and r.period_kind='monthly'
  and r.period_start=date_trunc('month',current_date-1)::date
where p.sailor_number='WTAS-1';
insert into storage.objects(bucket_id,name,owner,owner_id,metadata)
values('working-time-signatures',current_setting('test.scope_company')||'/'||current_setting('test.scope_person')||'/owner.png',
  '91910000-0000-4000-8000-000000000001','91910000-0000-4000-8000-000000000001','{"mimetype":"image/png","size":10}'::jsonb);
insert into public.working_time_edit_settings(company_id,unrestricted_editing_enabled,authorized_user_id)
values(current_setting('test.scope_company')::bigint,true,'91910000-0000-4000-8000-000000000002');

select ok(not has_function_privilege('anon','public.working_time_day_context(bigint,date)','EXECUTE'),'anonymous users cannot invoke the day context');
select ok(has_function_privilege('authenticated','public.working_time_day_context(bigint,date)','EXECUTE'),'authenticated day-context grant is preserved');
set local session authorization authenticator;
set local role authenticated;
select is(session_user::text,'authenticator','date checks use the real API session role');
select set_config('request.jwt.claim.sub','91910000-0000-4000-8000-000000000006',true);
select set_config('request.jwt.claims','{"sub":"91910000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select is(public.current_person_id(),null::bigint,'the unlinked Marin has no HR identity');
select is(public.working_time_can_manage_signature_person(current_setting('test.scope_company')::bigint,current_setting('test.scope_person')::bigint),false,'unlinked signature authorization is explicitly false');
select throws_ok($$select public.working_time_day_context(current_setting('test.scope_person')::bigint,current_date)$$,
  '42501','WORKING_TIME_PERMISSION_DENIED: contexte planning.','unlinked Marin cannot read another day context');
select throws_ok($$select public.working_time_signature_upload_context(current_setting('test.scope_person')::bigint)$$,
  '42501','WORKING_TIME_PERMISSION_DENIED: gestion de signature.','unlinked Marin cannot prepare another signature');
select throws_ok($$select public.discard_working_time_draft(current_setting('test.scope_weekly')::bigint)$$,
  '42501','WORKING_TIME_PERMISSION_DENIED: suppression du brouillon.','unlinked Marin cannot discard another empty draft');
select throws_ok($$select public.register_working_time_profile_signature(current_setting('test.scope_person')::bigint,
  current_setting('test.scope_company')||'/'||current_setting('test.scope_person')||'/owner.png','image/png',10,repeat('a',64))$$,
  '42501','WORKING_TIME_PERMISSION_DENIED: signature.','unlinked Marin cannot register another uploaded signature');

select set_config('request.jwt.claim.sub','91910000-0000-4000-8000-000000000001',true);
select is((public.working_time_day_context(current_setting('test.scope_person')::bigint,current_date)->>'register_id')::bigint,
  current_setting('test.scope_register')::bigint,'context targets the exact monthly register');
select is((public.working_time_day_context(current_setting('test.scope_person')::bigint,current_date)->>'actor_can_edit_day')::boolean,true,'owner can edit an open unvalidated day');
select is(jsonb_typeof(public.working_time_day_context(current_setting('test.scope_person')::bigint,current_date)->'actor_can_edit_day'),'boolean','permission is a strict JSON boolean');
select is((public.working_time_day_context(current_setting('test.scope_person')::bigint,current_date-1)->>'actor_can_edit_day')::boolean,false,'validated monthly day remains locked despite an editable weekly register');
select is((public.working_time_day_context(current_setting('test.scope_person')::bigint,(date_trunc('month',current_date)-interval'3 months')::date)->>'actor_can_edit_day')::boolean,false,'closed historical owner day remains locked under authenticator');
select is((public.working_time_day_context(current_setting('test.scope_person')::bigint,(date_trunc('month',current_date)+interval'2 months')::date)->>'actor_can_edit_day')::boolean,false,'absent monthly register never grants editing');
select is(public.working_time_can_manage_signature_person(current_setting('test.scope_company')::bigint,current_setting('test.scope_person')::bigint),true,'linked owner can still manage their signature');
select lives_ok($$select public.working_time_signature_upload_context(current_setting('test.scope_person')::bigint)$$,'linked owner can still prepare a signature');
select lives_ok($$select public.register_working_time_profile_signature(current_setting('test.scope_person')::bigint,
  current_setting('test.scope_company')||'/'||current_setting('test.scope_person')||'/owner.png','image/png',10,repeat('a',64))$$,'linked owner can still register the verified upload');
select lives_ok($$select public.discard_working_time_draft(current_setting('test.scope_weekly')::bigint)$$,'linked owner can still discard their empty draft');

select set_config('request.jwt.claim.sub','91910000-0000-4000-8000-000000000003',true);
select is((public.working_time_day_context(current_setting('test.scope_person')::bigint,current_date)->>'actor_can_edit_day')::boolean,false,'Direction retains read access without general entry permission');
select is(public.working_time_can_manage_signature_person(current_setting('test.scope_company')::bigint,current_setting('test.scope_person')::bigint),false,'Direction cannot manage another signature');
select set_config('request.jwt.claim.sub','91910000-0000-4000-8000-000000000004',true);
select is((public.working_time_day_context(current_setting('test.scope_person')::bigint,current_date)->>'actor_can_edit_day')::boolean,true,'Armement retains company draft entry');
select is((public.working_time_day_context(current_setting('test.scope_person')::bigint,current_date-1)->>'actor_can_edit_day')::boolean,false,'Armement cannot use the designated admin override');
select is(public.working_time_can_manage_signature_person(current_setting('test.scope_company')::bigint,current_setting('test.scope_person')::bigint),true,'Armement retains company signature management');
select set_config('request.jwt.claim.sub','91910000-0000-4000-8000-000000000005',true);
select is((public.working_time_day_context(public.current_person_id(),current_date)->>'actor_can_edit_day')::boolean,true,'Capitaine retains personal draft entry');
select is(public.working_time_can_manage_signature_person(current_setting('test.scope_company')::bigint,current_setting('test.scope_person')::bigint),false,'Capitaine cannot manage an unrelated signature');
select throws_ok($$select public.working_time_day_context(current_setting('test.scope_person')::bigint,current_date)$$,
  '42501','WORKING_TIME_PERMISSION_DENIED: contexte planning.','Capitaine without a shared assignment cannot read another context');
select set_config('request.jwt.claim.sub','91910000-0000-4000-8000-000000000008',true);
select is((public.working_time_day_context(current_setting('test.scope_person')::bigint,current_date-1)->>'actor_can_edit_day')::boolean,false,'another admin cannot use the designated override');
select set_config('request.jwt.claim.sub','91910000-0000-4000-8000-000000000002',true);
select is((public.working_time_day_context(current_setting('test.scope_person')::bigint,current_date-1)->>'actor_can_edit_day')::boolean,true,'designated admin retains editing of validated days');
select is((public.working_time_day_context(current_setting('test.scope_person')::bigint,(date_trunc('month',current_date)-interval'3 months')::date)->>'actor_can_edit_day')::boolean,true,'designated admin retains closed-month editing');
select is(public.working_time_can_manage_signature_person(current_setting('test.scope_company')::bigint,current_setting('test.scope_person')::bigint),true,'admin retains company signature management');
select set_config('request.jwt.claim.sub','91910000-0000-4000-8000-000000000007',true);
select throws_ok($$select public.working_time_day_context(current_setting('test.scope_person')::bigint,current_date)$$,
  '42501','WORKING_TIME_PERMISSION_DENIED: contexte planning.','cross-company admin cannot read the context');
select is(public.working_time_can_manage_signature_person(current_setting('test.scope_company')::bigint,current_setting('test.scope_person')::bigint),false,'cross-company signature access is explicitly false');
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select public.working_time_day_context(current_setting('test.scope_person')::bigint,current_date)$$,
  '42501','WORKING_TIME_PERMISSION_DENIED: contexte planning.','missing JWT identity cannot read the context');
select is(public.working_time_can_manage_signature_person(current_setting('test.scope_company')::bigint,current_setting('test.scope_person')::bigint),false,'missing JWT identity cannot manage a signature');
reset role;
reset session authorization;
select * from finish();
rollback;
