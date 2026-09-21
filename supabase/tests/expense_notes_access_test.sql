-- Transactional fixtures for actual Postgres roles/RLS, never session profile simulation.
begin;
-- Exercise each real role with the module enabled, independently of live admin settings.
-- This transaction restores the original permission matrix on rollback.
update public.role_module_permissions set is_visible=true where module_key='expenseNotes';
create temp table ndf_test_results (label text);
create function pg_temp.ndf_assert(condition boolean, label text) returns void
language plpgsql security definer set search_path = pg_temp as $$
begin
  if condition is distinct from true then raise exception 'NDF assertion failed: %', label; end if;
  insert into ndf_test_results values (label);
end; $$;

insert into public.companies(code,name) values ('ndf-test-a','NDF test A'),('ndf-test-b','NDF test B');
insert into auth.users(id,email)
select ('ab100000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'ndf-test-' || n || '@example.invalid' from generate_series(1,6) n;
insert into public.profiles(id,email,display_name,active_company_id)
select u.id,u.email,'NDF user ' || right(u.id::text,1), c.id from auth.users u
join public.companies c on c.code = case when right(u.id::text,1) = '6' then 'ndf-test-b' else 'ndf-test-a' end
where u.id::text like 'ab100000-%';
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,case right(id::text,1) when '1' then 'marin' when '2' then 'capitaine' when '3' then 'armement' when '4' then 'direction' else 'admin' end
from public.profiles where id::text like 'ab100000-%';
insert into public.people(user_id,first_name,last_name,company_id,hired_on)
select id,'NDF',display_name,active_company_id,(now() at time zone 'Europe/Paris')::date - 30 from public.profiles where id::text like 'ab100000-%';
insert into public.people(first_name,last_name,company_id,hired_on,departed_on,active)
select 'NDF directory', x.label, c.id, x.hired_on, x.departed_on, x.active
from public.companies c
cross join (select (now() at time zone 'Europe/Paris')::date as today) d
cross join lateral (values
  ('joined-today', today, null::date, true),
  ('leaves-tomorrow', today - 30, today + 1, true),
  ('left-today', today - 30, today, true),
  ('already-left', today - 30, today - 1, true),
  ('future-hire', today + 1, null, true),
  ('unknown-hire', null, null, true),
  ('inactive', today - 30, null, false)
) x(label,hired_on,departed_on,active) where c.code = 'ndf-test-a';
insert into public.vessels(name,company_id) select 'NDF ' || code,id from public.companies where code like 'ndf-test-%';
insert into public.expense_note_settings(company_id) select id from public.companies where code like 'ndf-test-%';

-- All five profiles can create their own note; identity and vessel snapshots are canonical.
set local role authenticated;
do $$ declare n integer; actor uuid; begin
  for n in 1..6 loop
    actor := ('ab100000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform pg_temp.ndf_assert((select count(*) = case when n = 6 then 1 else 7 end from public.expense_note_people()), 'employed directory and company scope for role ' || n);
    perform pg_temp.ndf_assert((select count(*) = 1 from public.expense_note_people() where is_current), 'current account preselection for role ' || n);
    perform pg_temp.ndf_assert(not exists (select 1 from public.expense_note_people() where name in ('NDF directory left-today','NDF directory already-left','NDF directory future-hire','NDF directory unknown-hire','NDF directory inactive')), 'employment boundaries for role ' || n);
    insert into public.expense_notes(id,issuer_name,issuer_person_id,vessel_id,kind,expense_on,title,payment_method,amount,receipt_count)
    values (('ac100000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'Spoofed display name',
      (select id from public.expense_note_people() where is_current limit 1),
      (select min(id) from public.vessels where name like 'NDF ndf-test-%'), 'expense',current_date,'NDF test','CB-Perso',25,1);
    perform pg_temp.ndf_assert((select created_by = actor and issuer_name <> 'Spoofed display name' and creator_name = 'NDF user ' || n from public.expense_notes where id = ('ac100000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid), 'canonical identity for role ' || n);
  end loop;
end; $$;
reset role;
-- Storage rows simulate a successful upload; nothing leaves the transaction.
insert into storage.objects(bucket_id,name) select 'expense-note-pdfs',pdf_path from public.expense_notes where id::text like 'ac100000-%';
set local role authenticated;
do $$ declare n integer; begin
  for n in 1..6 loop
    perform set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-' || lpad(n::text,12,'0'),true);
    update public.expense_notes set status='issued' where id = ('ac100000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
  end loop;
  for n in 1..6 loop
    perform set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-' || lpad(n::text,12,'0'),true);
    perform pg_temp.ndf_assert((select count(*) = case when n in (4,5) then 5 else 1 end from public.expense_notes where id::text like 'ac100000-%'), 'note visibility for role ' || n);
    perform pg_temp.ndf_assert((select count(*) = case when n in (4,5) then 5 else 1 end from storage.objects where bucket_id='expense-note-pdfs' and name like '%/ac100000-%'), 'PDF visibility for role ' || n);
  end loop;
end; $$;

select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000001',true);
do $$ begin
  begin
    update public.expense_notes set created_by='ab100000-0000-4000-8000-000000000002' where id='ac100000-0000-4000-8000-000000000001';
    raise exception 'author change unexpectedly allowed';
  exception when insufficient_privilege then perform pg_temp.ndf_assert(true,'creator cannot be reassigned'); end;
  begin
    update public.expense_notes set delivery_status='sent' where id='ac100000-0000-4000-8000-000000000001';
    raise exception 'delivery spoof unexpectedly allowed';
  exception when insufficient_privilege then perform pg_temp.ndf_assert(true,'delivery cannot be spoofed'); end;
  delete from public.expense_notes where id='ac100000-0000-4000-8000-000000000001';
  perform pg_temp.ndf_assert(found = false,'issued note cannot be deleted');
  update public.expense_notes set status='preparing' where id='ac100000-0000-4000-8000-000000000001';
  perform pg_temp.ndf_assert(found = false,'issued note cannot be reopened');
  update public.expense_note_settings set default_payment_method='CB-GOURY';
  perform pg_temp.ndf_assert(found = false,'Marin cannot change settings');
end; $$;

-- A typed emitter can differ; the real creator remains unchanged and access stays personal.
insert into public.expense_notes(id,issuer_name,kind,expense_on,title,payment_method,amount,receipt_count)
values ('ac100000-0000-4000-8000-000000000011','Autre personne','expense',current_date,'Sans navire','CB-Perso',10,0);
select pg_temp.ndf_assert((select issuer_name='Autre personne' and created_by=auth.uid() and vessel_name='Hors navire' from public.expense_notes where id='ac100000-0000-4000-8000-000000000011'),'editable emitter preserves creator');
do $$ begin
  begin
    update public.expense_notes set status='issued' where id='ac100000-0000-4000-8000-000000000011';
    raise exception 'missing PDF unexpectedly allowed';
  exception when raise_exception then
    if sqlerrm <> 'Le PDF doit être enregistré avant émission.' then raise; end if;
    perform pg_temp.ndf_assert(true,'cannot issue without PDF');
  end;
end; $$;

-- Recompute NDF mileage rules on the server, ignoring a tampered client total.
insert into public.expense_notes(id,issuer_name,kind,expense_on,title,amount,receipt_count,mileage)
values ('ac100000-0000-4000-8000-000000000012','NDF Mileage','mileage',current_date,'Trajet',999,0,
  '{"fuel":"diesel","vehicle":"Test","fiscalPower":"5","function":"Marin","period":"Septembre","tolls":12.30,"trips":[{"date":"2026-09-17","route":"A-B","reason":"Embarquement","km":200,"amount":999}]}'::jsonb);
select pg_temp.ndf_assert((select amount=112.30 and (mileage->'trips'->0->>'amount')::numeric=100 from public.expense_notes where id='ac100000-0000-4000-8000-000000000012'),'server enforces mileage cap and tolls');

select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000004',true);
do $$ begin
  update public.expense_note_settings set default_payment_method='CB-GOURY';
  perform pg_temp.ndf_assert(found = false,'Direction cannot change settings');
  perform pg_temp.ndf_assert((select count(*)=5 from public.expense_notes where id::text like 'ac100000-%'),'Direction cannot see other preparations');
end; $$;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000005',true);
update public.expense_note_settings set default_payment_method='CB-GOURY';
select pg_temp.ndf_assert((select default_payment_method='CB-GOURY' from public.expense_note_settings),'Admin can choose default card');
select pg_temp.ndf_assert((select count(*)=7 from public.expense_note_people()),'directory is limited to employed people in active company');

-- Leaving employment removes the person from choices without hiding issued notes.
reset role;
update public.people set departed_on=(now() at time zone 'Europe/Paris')::date where user_id='ab100000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.ndf_assert(not exists (select 1 from public.expense_note_people() where name='NDF NDF user 1'),'departed issuer disappears from directory');
select pg_temp.ndf_assert((select issuer_name='NDF NDF user 1' from public.expense_notes where id='ac100000-0000-4000-8000-000000000001'),'issued note retains departed issuer snapshot');

reset role;
update public.company_memberships set active=false where user_id='ab100000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000001',true);
select pg_temp.ndf_assert((select count(*)=0 from public.expense_notes),'inactive member cannot read notes');
select pg_temp.ndf_assert((select count(*)=0 from storage.objects where bucket_id='expense-note-pdfs'),'inactive member cannot read PDFs');
select pg_temp.ndf_assert((select count(*)=0 from public.expense_note_people()),'inactive member cannot read issuer directory');
reset role;
select pg_temp.ndf_assert(not has_function_privilege('anon','public.expense_note_people()','execute'),'anonymous cannot read issuer directory');
update public.role_module_permissions set is_visible=false where module_key='expenseNotes' and role_key='capitaine';
set local role authenticated;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000002',true);
select pg_temp.ndf_assert((select count(*)=0 from public.expense_note_people()),'disabled module cannot read issuer directory');
reset role;
select count(*) as passed_checks, array_agg(label) as checks from ndf_test_results;
rollback;
