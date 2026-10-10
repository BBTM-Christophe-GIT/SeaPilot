-- Real auth/company/HR/planning fixtures; all fixture data and mutations are rolled back.
begin;
do $test$
declare
  c bigint; other_c bigint; vessel bigint; second_vessel bigint; other_vessel bigint;
  captain bigint; sailor bigint; inspection bigint; previous_inspection bigint; report_count bigint;
  uid uuid; role_name text; prior jsonb; prior_entries jsonb; issued date := current_date-10;
begin
  select id into c from public.companies where code='bbtm';
  insert into public.companies(code,name) values('lifting-dates-other','Lifting dates other tenant') returning id into other_c;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(c,'LIFTING DATES FIXTURE','LDA',true,'vessel') returning id into vessel;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(c,'LIFTING DATES SECOND','LDB',true,'vessel') returning id into second_vessel;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(other_c,'LIFTING DATES OTHER','LDC',true,'vessel') returning id into other_vessel;
  for uid,role_name in select * from (values
    ('9e100900-0000-0000-0000-000000000001'::uuid,'admin'),
    ('9e100900-0000-0000-0000-000000000002'::uuid,'direction'),
    ('9e100900-0000-0000-0000-000000000003'::uuid,'armement'),
    ('9e100900-0000-0000-0000-000000000004'::uuid,'capitaine'),
    ('9e100900-0000-0000-0000-000000000005'::uuid,'marin')) f(id,role_key)
  loop
    insert into auth.users(id,email) values(uid,'lifting-dates-'||role_name||'@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id) values(uid,'lifting-dates-'||role_name||'@example.invalid','Lifting dates '||role_name,c);
    insert into public.company_memberships(company_id,user_id,active) values(c,uid,true) on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(uid,c,role_name);
  end loop;
  insert into public.people(company_id,user_id,first_name,last_name,function_label,sailor_number,active)
    values(c,'9e100900-0000-0000-0000-000000000004','Lifting dates','Captain','Capitaine','LDA-CAP',true) returning id into captain;
  insert into public.people(company_id,user_id,first_name,last_name,function_label,sailor_number,active)
    values(c,'9e100900-0000-0000-0000-000000000005','Lifting dates','Sailor','Matelot','LDA-MAR',true) returning id into sailor;
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,assignment_role,confirmation_status)
    values(c,vessel,captain,current_date-1,current_date+1,'Capitaine','confirmed'),(c,vessel,sailor,current_date-1,current_date+1,'Matelot','confirmed');
  insert into public.lifting_inventory(company_id,vessel_id,kind,reference,material_type,description,active,commissioned_on)
    values(c,vessel,'lifting','1','Manilles','First apparatus',true,current_date-100),
      (c,vessel,'lifting','2','Crocs','Second apparatus',true,current_date-90),
      (c,vessel,'lifting','3','Manilles','Inactive apparatus',false,current_date-80),
      (c,second_vessel,'lifting','1','Manilles','Other vessel apparatus',true,current_date-70),
      (other_c,other_vessel,'lifting','1','Manilles','Other tenant apparatus',true,current_date-60);
  insert into public.lifting_inventory(company_id,vessel_id,kind,reference,material_type,towing_type,description,commissioned_on)
    values(c,vessel,'towing','1','Remorque','textile_line','Towing equipment',current_date-50);
  select jsonb_agg(to_jsonb(i) order by i.id) into prior from public.lifting_inventory i
    where (i.company_id=c and i.vessel_id in (vessel,second_vessel)) or i.company_id=other_c;
  assert not has_table_privilege('authenticated','public.lifting_inventory','UPDATE'), 'Inventory mutations remain guarded RPCs';
  assert not has_function_privilege('anon','public.start_lifting_inspection(bigint,text,date,date)','EXECUTE'), 'Anonymous creation denied';
  execute 'set local role authenticated';

  -- Actual assigned Marin and an ordinary Capitaine cannot start a control or alter any date.
  foreach uid in array array['9e100900-0000-0000-0000-000000000005'::uuid,'9e100900-0000-0000-0000-000000000004'::uuid] loop
    perform set_config('request.jwt.claim.sub',uid::text,true);
    assert public.lifting_can_access(c,vessel), 'Onboard fixture has actual assigned vessel access';
    begin
      perform public.start_lifting_inspection(vessel,'lifting',issued,issued+365);
      raise exception 'Unauthorized annual creation accepted';
    exception when insufficient_privilege then null; end;
    assert (select count(*) from public.lifting_inspections where vessel_id=vessel)=0, 'Unauthorized creation has no report';
    assert not exists(select 1 from public.lifting_inventory where vessel_id=vessel and commissioned_on=issued), 'Unauthorized creation changes no date';
  end loop;
  execute 'reset role';
  insert into public.lifting_inspector_grants(company_id,user_id) values(c,'9e100900-0000-0000-0000-000000000004');
  execute 'set local role authenticated';

  -- Office roles and the explicitly granted Captain update every active apparatus and its snapshot.
  foreach uid in array array['9e100900-0000-0000-0000-000000000001'::uuid,'9e100900-0000-0000-0000-000000000002'::uuid,'9e100900-0000-0000-0000-000000000003'::uuid,'9e100900-0000-0000-0000-000000000004'::uuid] loop
    perform set_config('request.jwt.claim.sub',uid::text,true);
    inspection:=public.start_lifting_inspection(vessel,'lifting',issued,issued+365);
    assert (select count(*) from public.lifting_inventory where vessel_id=vessel and kind='lifting' and active and commissioned_on=issued and updated_by=uid)=2, 'All selected active apparatus receive issue date and actor';
    assert (select count(*) from public.lifting_inspection_entries where inspection_id=inspection and item_snapshot->>'commissioned_on'=issued::text)=2, 'New snapshots receive exact issue date';
    assert (select count(*) from public.lifting_inspection_entries where inspection_id=inspection)=2, 'Inactive apparatus and towing excluded';
    if previous_inspection is not null then
      assert (select jsonb_agg(to_jsonb(e) order by e.id) from public.lifting_inspection_entries e where inspection_id=previous_inspection)=prior_entries, 'Existing inspection snapshots unchanged';
    end if;
    previous_inspection:=inspection;
    select jsonb_agg(to_jsonb(e) order by e.id) into prior_entries from public.lifting_inspection_entries e where inspection_id=inspection;
    issued:=issued+1;
  end loop;
  -- A granted captain still cannot act on a vessel outside the real planning scope or company.
  begin perform public.start_lifting_inspection(second_vessel,'lifting',issued,issued+365); raise exception 'Unassigned creation accepted'; exception when insufficient_privilege then null; end;
  begin perform public.start_lifting_inspection(other_vessel,'lifting',issued,issued+365); raise exception 'Cross-tenant creation accepted'; exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub','9e100900-0000-0000-0000-000000000001',true);
  select count(*) into report_count from public.lifting_inspections where vessel_id=vessel;
  begin perform public.start_lifting_inspection(vessel,'lifting',issued,issued); raise exception 'Invalid dates accepted'; exception when raise_exception then assert sqlerrm='Dates du contrôle invalides.',sqlerrm; end;
  assert (select count(*) from public.lifting_inspections where vessel_id=vessel)=report_count, 'Rejected dates leave no report';
  assert (select count(*) from public.lifting_inventory where vessel_id=vessel and kind='lifting' and active and commissioned_on=issued-1)=2, 'Rejected dates leave current commissioning dates';
  perform public.start_lifting_inspection(vessel,'towing',issued,issued+365);
  execute 'reset role';
  -- Compare entire excluded rows and non-date material fields, including lifecycle generation and due date.
  assert not exists(select 1 from jsonb_array_elements(prior) p join public.lifting_inventory i on i.id=(p->>'id')::bigint
    where not (i.company_id=c and i.vessel_id=vessel and i.kind='lifting' and i.active) and to_jsonb(i)<>p), 'Other vessels/tenants, inactive apparatus and towing remain unchanged';
  assert not exists(select 1 from jsonb_array_elements(prior) p join public.lifting_inventory i on i.id=(p->>'id')::bigint
    where i.vessel_id=vessel and i.kind='lifting' and i.active
      and (to_jsonb(i)-array['commissioned_on','updated_at','updated_by'])<>(p-array['commissioned_on','updated_at','updated_by'])), 'Creation changes no lifecycle generation, deadline or material characteristics';
end $test$;
select 'PASS: annual commissioning dates, all active apparatus, real profile/RLS scopes, historical snapshots and isolated towing' as result;
rollback;
