begin;

insert into auth.users(id,email) values
 ('76000000-0000-0000-0000-000000000001','balance-office@example.invalid'),
 ('76000000-0000-0000-0000-000000000002','balance-sailor@example.invalid'),
 ('76000000-0000-0000-0000-000000000003','balance-captain@example.invalid');
insert into public.profiles(id,email,display_name,active_company_id)
select u.id,u.email,'Balance test',c.id from auth.users u cross join public.companies c
where u.id in ('76000000-0000-0000-0000-000000000001','76000000-0000-0000-0000-000000000002','76000000-0000-0000-0000-000000000003') and c.code='bbtm';
insert into public.user_roles(user_id,company_id,role_key)
select f.uid,c.id,f.role from (values
 ('76000000-0000-0000-0000-000000000001'::uuid,'armement'),
 ('76000000-0000-0000-0000-000000000002'::uuid,'marin'),
 ('76000000-0000-0000-0000-000000000003'::uuid,'capitaine')) f(uid,role)
cross join public.companies c where c.code='bbtm';
insert into public.people(company_id,user_id,first_name,last_name,function_label,active)
select c.id,f.uid,f.name,'BALANCE TEST',f.role,true from (values
 ('76000000-0000-0000-0000-000000000002'::uuid,'Marin','Matelot'),
 ('76000000-0000-0000-0000-000000000003'::uuid,'Capitaine','Capitaine')) f(uid,name,role)
cross join public.companies c where c.code='bbtm';
insert into public.vessels(company_id,name,acronym,active)
select id,'CREW BALANCE TEST VESSEL','CBT',true from public.companies where code='bbtm';

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','76000000-0000-0000-0000-000000000001',true);
do $$
declare sailor bigint; captain bigint; vessel bigint; assignment bigint; result jsonb;
begin
  select id into sailor from public.people where user_id='76000000-0000-0000-0000-000000000002';
  select id into captain from public.people where user_id='76000000-0000-0000-0000-000000000003';
  select id into vessel from public.vessels where name='CREW BALANCE TEST VESSEL';
  perform public.save_planning_crew_balance(sailor,'2026-09-30',12.50);
  perform public.save_planning_crew_balance(sailor,'2026-09-30',-3.25);
  perform public.save_planning_crew_balance(captain,'2026-09-30',2);
  if (select count(*) from public.planning_crew_balance_checkpoints where person_id=sailor) <> 1
    or (select balance from public.planning_crew_balance_checkpoints where person_id=sailor) <> -3.25 then
    raise exception 'EOD checkpoint upsert/precision failed';
  end if;
  begin
    perform public.save_planning_crew_balance(sailor,'2026-09-30',1.234);
    raise exception 'Invalid precision was accepted';
  exception when raise_exception then
    if sqlerrm <> 'Date ou solde invalide.' then raise; end if;
  end;
  perform public.apply_planning_grid_cells(jsonb_build_array(jsonb_build_object(
    'personId',sailor,'vesselId',vessel,'workDate','2026-10-01','status','Extra',
    'note','','watchGroup','Bordée 1','functionLabel','Matelot')));
  select id into assignment from public.planning_assignments where crew_person_id=sailor and vessel_id=vessel and starts_on='2026-10-01';
  if assignment is null then raise exception 'Extra did not persist'; end if;
  perform public.save_planning_assignment_day_state(assignment,'2026-10-01','Formation','Test');
  if not exists(select 1 from public.planning_days where person_id=sailor and work_date='2026-10-01' and sailor_status='Formation') then
    raise exception 'Formation daily state did not persist';
  end if;
  result := public.planning_assignment_overview_with_revisions();
  if not exists(select 1 from jsonb_array_elements(result) a where (a->>'id')::bigint=assignment and a->>'updated_at' is not null) then
    raise exception 'Assignment revision missing';
  end if;
end;
$$;

-- Real JWT subjects and role grants: no simulated UI profile.
select set_config('request.jwt.claim.sub','76000000-0000-0000-0000-000000000002',true);
do $$
declare sailor bigint := public.current_person_id();
begin
  if not exists(select 1 from public.planning_crew_balance_checkpoints where person_id=sailor) then raise exception 'Marin cannot read own balance'; end if;
  begin
    perform public.save_planning_crew_balance(sailor,'2026-09-30',99);
    raise exception 'Marin unexpectedly wrote a balance';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.planning_crew_balance_checkpoints set balance=99 where person_id=sailor;
    if found then raise exception 'Marin bypassed RPC through direct update'; end if;
  exception when insufficient_privilege then null;
  end;
end;
$$;
select set_config('request.jwt.claim.sub','76000000-0000-0000-0000-000000000003',true);
do $$
declare captain bigint := public.current_person_id();
begin
  if not exists(select 1 from public.planning_crew_balance_checkpoints where person_id=captain) then raise exception 'Capitaine cannot read own balance'; end if;
  begin
    perform public.save_planning_crew_balance(captain,'2026-09-30',99);
    raise exception 'Capitaine unexpectedly wrote a balance';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
do $$
begin
  if has_table_privilege('anon','public.planning_crew_balance_checkpoints','SELECT')
    or has_function_privilege('anon','public.save_planning_crew_balance(bigint,date,numeric)','EXECUTE') then
    raise exception 'Anonymous access granted';
  end if;
end;
$$;
rollback;
select '1..1' as tap union all select 'ok 1 - Crew balances, Extra, Formation and real profile RLS';
