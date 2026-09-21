-- Actual authenticated roles; every fixture is rolled back, with no emails or PDF uploads.
begin;
-- Rollback restores the administrator's live module permissions.
update public.role_module_permissions set is_visible=true where module_key='expenseNotes';
create temp table vehicle_test_results(label text);
create function pg_temp.vehicle_assert(condition boolean, label text) returns void
language plpgsql security definer set search_path = pg_temp as $$
begin
  if condition is distinct from true then raise exception 'Vehicle assertion failed: %', label; end if;
  insert into vehicle_test_results values (label);
end; $$;
insert into public.companies(code,name) values ('vehicle-test-a','Vehicle test A'),('vehicle-test-b','Vehicle test B');
insert into auth.users(id,email)
select ('da200000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'vehicle-test-' || n || '@example.invalid' from generate_series(1,6) n;
insert into public.profiles(id,email,display_name,active_company_id)
select u.id,u.email,'Vehicle user ' || right(u.id::text,1),c.id from auth.users u
join public.companies c on c.code = case when right(u.id::text,1) = '6' then 'vehicle-test-b' else 'vehicle-test-a' end
where u.id::text like 'da200000-%';
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,case right(id::text,1) when '1' then 'marin' when '2' then 'capitaine' when '3' then 'armement' when '4' then 'direction' else 'admin' end
from public.profiles where id::text like 'da200000-%';

set local role authenticated;
do $$ declare n integer; begin
  for n in 1..6 loop
    perform set_config('request.jwt.claim.sub','da200000-0000-4000-8000-' || lpad(n::text,12,'0'),true);
    insert into public.expense_personal_vehicles(vehicle,fiscal_power,fuel) values ('Test diesel','6 CV','diesel'),('Test electric','4 CV','electric');
    perform pg_temp.vehicle_assert((select count(*)=2 from public.expense_personal_vehicles),'multiple personal vehicles for role ' || n);
    perform pg_temp.vehicle_assert((select bool_and(user_id=auth.uid() and company_id=public.current_planning_company_id()) from public.expense_personal_vehicles),'server owner and company for role ' || n);
    update public.expense_personal_vehicles set fiscal_power='7 CV' where vehicle='Test diesel';
    perform pg_temp.vehicle_assert((select fiscal_power='7 CV' from public.expense_personal_vehicles where vehicle='Test diesel'),'owner update for role ' || n);
    perform public.set_expense_default_vehicle((select id from public.expense_personal_vehicles where vehicle='Test diesel'));
    perform pg_temp.vehicle_assert((select count(*)=1 from public.expense_personal_vehicles where is_default),'one persisted default for role ' || n);
    perform public.set_expense_default_vehicle((select id from public.expense_personal_vehicles where vehicle='Test electric'));
    perform pg_temp.vehicle_assert((select count(*)=1 and bool_and(vehicle='Test electric') from public.expense_personal_vehicles where is_default),'atomic default switch for role ' || n);
    perform public.set_expense_default_vehicle(null);
    perform pg_temp.vehicle_assert((select count(*)=0 from public.expense_personal_vehicles where is_default),'clear default for role ' || n);
    perform public.set_expense_default_vehicle((select id from public.expense_personal_vehicles where vehicle='Test diesel'));
  end loop;
  for n in 1..6 loop
    perform set_config('request.jwt.claim.sub','da200000-0000-4000-8000-' || lpad(n::text,12,'0'),true);
    perform pg_temp.vehicle_assert((select count(*)=2 from public.expense_personal_vehicles),'private book even for admin/direction role ' || n);
    update public.expense_personal_vehicles set vehicle='Forbidden' where user_id<>auth.uid();
    perform pg_temp.vehicle_assert(not found,'cannot update another account role ' || n);
    delete from public.expense_personal_vehicles where user_id<>auth.uid();
    perform pg_temp.vehicle_assert(not found,'cannot delete another account role ' || n);
  end loop;
end; $$;
reset role;
select set_config('test.foreign_vehicle',(select id::text from public.expense_personal_vehicles where user_id='da200000-0000-4000-8000-000000000002' limit 1),true);
select set_config('test.other_company_vehicle',(select id::text from public.expense_personal_vehicles where user_id='da200000-0000-4000-8000-000000000006' limit 1),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','da200000-0000-4000-8000-000000000001',true);
do $$ begin
  begin
    perform public.set_expense_default_vehicle(current_setting('test.foreign_vehicle')::uuid);
    raise exception 'foreign default unexpectedly allowed';
  exception when insufficient_privilege then perform pg_temp.vehicle_assert(true,'cannot choose another profile vehicle'); end;
  begin
    perform public.set_expense_default_vehicle(current_setting('test.other_company_vehicle')::uuid);
    raise exception 'foreign company default unexpectedly allowed';
  exception when insufficient_privilege then perform pg_temp.vehicle_assert(true,'cannot choose another company vehicle'); end;
  begin
    perform public.set_expense_default_vehicle('00000000-0000-4000-8000-000000000099');
    raise exception 'missing default unexpectedly allowed';
  exception when insufficient_privilege then perform pg_temp.vehicle_assert(true,'missing vehicle cannot replace default'); end;
  perform pg_temp.vehicle_assert((select count(*)=1 and bool_and(vehicle='Test diesel') from public.expense_personal_vehicles where is_default),'failed changes preserve prior default');
  begin
    update public.expense_personal_vehicles set is_default=true;
    raise exception 'multiple defaults unexpectedly allowed';
  exception when unique_violation then perform pg_temp.vehicle_assert(true,'unique index rejects two defaults'); end;
  begin
    update public.expense_personal_vehicles set user_id='da200000-0000-4000-8000-000000000002';
    raise exception 'owner reassignment unexpectedly allowed';
  exception when insufficient_privilege then perform pg_temp.vehicle_assert(true,'owner immutable'); end;
  begin
    update public.expense_personal_vehicles set company_id=0;
    raise exception 'company reassignment unexpectedly allowed';
  exception when insufficient_privilege then perform pg_temp.vehicle_assert(true,'company immutable'); end;
  begin
    insert into public.expense_personal_vehicles(user_id,vehicle,fiscal_power,fuel) values ('da200000-0000-4000-8000-000000000002','Spoof','5','diesel');
    raise exception 'spoofed owner unexpectedly allowed';
  exception when insufficient_privilege then perform pg_temp.vehicle_assert(true,'cannot insert for another account'); end;
  begin
    insert into public.expense_personal_vehicles(vehicle,fiscal_power,fuel) values ('Invalid','5','other');
    raise exception 'invalid fuel unexpectedly allowed';
  exception when check_violation then perform pg_temp.vehicle_assert(true,'fuel validated'); end;
  begin
    insert into public.expense_personal_vehicles(vehicle,fiscal_power,fuel) values ('   ','5','diesel');
    raise exception 'empty model unexpectedly allowed';
  exception when check_violation then perform pg_temp.vehicle_assert(true,'empty model rejected'); end;
end; $$;
insert into public.expense_notes(id,issuer_name,kind,expense_on,title,amount,receipt_count,mileage)
select 'da210000-0000-4000-8000-000000000001','Vehicle test','mileage',current_date,'Vehicle snapshot',1,0,
  jsonb_build_object('vehicle',vehicle,'fiscalPower',fiscal_power,'fuel',fuel,'function','Marin','period','Septembre','tolls',0,
    'trips',jsonb_build_array(jsonb_build_object('date','2026-09-17','route','A-B','reason','Test','km',120,'amount',0)))
from public.expense_personal_vehicles where vehicle='Test diesel';
reset role;
insert into storage.objects(bucket_id,name) select 'expense-note-pdfs',pdf_path from public.expense_notes where id='da210000-0000-4000-8000-000000000001';
set local role authenticated;
update public.expense_notes set status='issued' where id='da210000-0000-4000-8000-000000000001';
update public.expense_personal_vehicles set vehicle='Renamed',fiscal_power='8 CV',fuel='hybrid' where vehicle='Test diesel';
delete from public.expense_personal_vehicles where vehicle='Renamed';
select pg_temp.vehicle_assert((select count(*)=1 from public.expense_personal_vehicles),'owner can remove vehicle');
select pg_temp.vehicle_assert((select count(*)=0 from public.expense_personal_vehicles where is_default),'deleting default leaves no stale preference');
select pg_temp.vehicle_assert((select mileage->>'vehicle'='Test diesel' and mileage->>'fiscalPower'='7 CV' and mileage->>'fuel'='diesel' and amount=72.72 from public.expense_notes where id='da210000-0000-4000-8000-000000000001'),'issued snapshot unchanged after vehicle edit and deletion');
reset role;
update public.company_memberships set active=false where user_id='da200000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.vehicle_assert((select count(*)=0 from public.expense_personal_vehicles),'inactive member cannot read vehicles');
do $$ begin
  begin
    perform public.set_expense_default_vehicle(null);
    raise exception 'inactive default change unexpectedly allowed';
  exception when insufficient_privilege then perform pg_temp.vehicle_assert(true,'inactive member cannot change default'); end;
end; $$;
do $$ begin
  begin
    insert into public.expense_personal_vehicles(vehicle,fiscal_power,fuel) values ('Inactive','5','diesel');
    raise exception 'inactive insert unexpectedly allowed';
  exception when insufficient_privilege then perform pg_temp.vehicle_assert(true,'inactive member cannot create vehicle'); end;
end; $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform * from public.expense_personal_vehicles;
    raise exception 'anonymous read unexpectedly allowed';
  exception when insufficient_privilege then perform pg_temp.vehicle_assert(true,'anonymous access denied'); end;
end; $$;
reset role;
select pg_temp.vehicle_assert(not has_function_privilege('anon','public.set_expense_default_vehicle(uuid)','execute'),'anonymous cannot set default');
update public.role_module_permissions set is_visible=false where module_key='expenseNotes' and role_key='capitaine';
set local role authenticated;
select set_config('request.jwt.claim.sub','da200000-0000-4000-8000-000000000002',true);
do $$ begin
  begin
    perform public.set_expense_default_vehicle(null);
    raise exception 'disabled module default change unexpectedly allowed';
  exception when insufficient_privilege then perform pg_temp.vehicle_assert(true,'disabled module cannot set default'); end;
end; $$;
reset role;
select count(*) as passed_checks, array_agg(label) as checks from vehicle_test_results;
rollback;
