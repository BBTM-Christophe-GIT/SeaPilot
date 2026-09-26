-- Real database role fixtures. All test data and writes are rolled back.
begin;
do $$
declare
  company bigint; other_company bigint; person bigint; departed bigint; future_person bigint;
  other_person bigint; ship bigint; actor uuid; role_name text; n integer:=0;
  snapshot jsonb; saved bigint; link_id bigint; other_ship bigint;
begin
  select id into strict company from public.companies where code='bbtm';
  insert into public.companies(code,name) values('org-fixture-other','Organigramme fixture') returning id into other_company;
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    n:=n+1; actor:=('a9570000-0000-4000-8000-00000000010'||n)::uuid;
    insert into auth.users(id,email) values(actor,'org-'||role_name||'@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id) values(actor,'org-'||role_name||'@example.invalid','Org fixture',company);
    insert into public.company_memberships(company_id,user_id,active) values(company,actor,true) on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(actor,company,role_name);
  end loop;
  insert into public.people(company_id,first_name,last_name,function_label,hired_on,active) values(company,'Org','ACTIVE','Capitaine',current_date-365,true) returning id into person;
  update public.people set email='org-fixture@example.invalid',phone='00 00 00 00 01',emergency_contact_phone='PRIVATE FAMILY PHONE' where id=person;
  insert into public.people(company_id,first_name,last_name,function_label,hired_on,departed_on,active) values(company,'Org','DEPARTED','Capitaine',current_date-365,current_date,false) returning id into departed;
  insert into public.people(company_id,first_name,last_name,function_label,hired_on,active) values(company,'Org','FUTURE','Capitaine',current_date+10,true) returning id into future_person;
  insert into public.people(company_id,first_name,last_name,function_label,hired_on,active) values(other_company,'Org','OTHER','Capitaine',current_date-365,true) returning id into other_person;
  insert into public.vessels(company_id,name,asset_kind,active) values(company,'ORG FIXTURE','vessel',true) returning id into ship;
  insert into public.vessels(company_id,name,asset_kind,active) values(other_company,'OTHER FIXTURE','vessel',true) returning id into other_ship;
  insert into public.organigramme_categories(company_id,key,label) values(other_company,'external','Other tenant');
  insert into public.organigramme_links(company_id,source_category,target_kind,target_key) values(other_company,'external','category','office');
  insert into public.planning_board_rows(company_id,vessel_id,person_id,watch_group,function_label,created_by) values(company,ship,person,'Bordée 1','Capitaine','a9570000-0000-4000-8000-000000000101');
  n:=0;
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    n:=n+1; actor:=('a9570000-0000-4000-8000-00000000010'||n)::uuid;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    if role_name in ('admin','direction') then
      snapshot:=public.organigramme_snapshot(current_date);
      assert exists(select 1 from jsonb_array_elements(snapshot->'people') p where (p->>'id')::bigint=person), 'Active person missing';
      assert not exists(select 1 from jsonb_array_elements(snapshot->'people') p where (p->>'id')::bigint in (departed,future_person,other_person)), 'Date/company scope leaked';
      assert exists(select 1 from jsonb_array_elements(snapshot->'memberships') m where (m->>'personId')::bigint=person and (m->>'vesselId')::bigint=ship), 'Permanent watch missing';
      assert not exists(select 1 from jsonb_array_elements(snapshot->'people') p where p ? 'emergency_contact_phone' or p ? 'emergency_contact_name' or p ? 'birth_date' or p ? 'sailor_number'), 'Private HR fields leaked';
      assert exists(select 1 from jsonb_array_elements(snapshot->'people') p where (p->>'id')::bigint=person and p->>'email'='org-fixture@example.invalid' and p->>'phone'='00 00 00 00 01'), 'Requested personnel contacts missing';
      saved:=public.save_organigramme_support(null,person,'Fixture','Responsabilité','office',1);
      perform public.save_organigramme_support(saved,person,'Fixture','Responsabilité mise à jour','office',2);
      assert exists(select 1 from public.organigramme_support where id=saved and position=2), 'Authorized update failed';
      perform public.save_organigramme_category('external','Partenaires fixture');
      perform public.save_organigramme_category('external','Conseils fixture');
      link_id:=public.save_organigramme_link(null,'external','category','office','','Conseil');
      perform public.save_organigramme_link(link_id,'external','person',person::text,'','Référent');
      snapshot:=public.organigramme_snapshot(current_date);
      assert snapshot->'categoryLabels'->>'external'='Conseils fixture', 'Category rename did not persist';
      assert exists(select 1 from jsonb_array_elements(snapshot->'links') l where (l->>'id')::bigint=link_id and l->>'targetKey'=person::text), 'Link update missing in snapshot';
      assert not exists(select 1 from public.organigramme_categories where company_id=other_company), 'Cross-company category leaked';
      assert not exists(select 1 from public.organigramme_links where company_id=other_company), 'Cross-company link leaked';
      begin
        perform public.save_organigramme_link(null,'external','person',other_person::text,'','');
        raise exception 'Cross-company linked person accepted';
      exception when insufficient_privilege then null; end;
      begin
        insert into public.organigramme_links(source_category,target_kind,target_key,target_section) values('external','group','Bordée 1','vessel-'||other_ship);
        raise exception 'Direct cross-company group write accepted';
      exception when insufficient_privilege then null; end;
      begin
        perform public.save_organigramme_link(null,'external','category','external','','');
        raise exception 'Self link accepted';
      exception when check_violation then null; end;
      begin
        perform public.save_organigramme_link(null,'external','person',person::text,'','Duplicate');
        raise exception 'Duplicate link accepted';
      exception when unique_violation then null; end;
      perform public.save_organigramme_link(link_id,'external','group',ship||'-Bordée 1','vessel-'||ship,'Assistance');
      assert exists(select 1 from public.organigramme_links where id=link_id and target_kind='group'), 'Group link save failed';
      delete from public.organigramme_links where id=link_id;
      assert not exists(select 1 from public.organigramme_links where id=link_id), 'Link delete failed';
      delete from public.organigramme_categories where company_id=company;
      begin
        perform public.save_organigramme_support(null,other_person,'Other','Other','office',1);
        raise exception 'Cross-company person accepted';
      exception when insufficient_privilege then null; end;
      delete from public.organigramme_support where id=saved;
      snapshot:=public.organigramme_snapshot(current_date-1);
      assert exists(select 1 from jsonb_array_elements(snapshot->'people') p where (p->>'id')::bigint=departed), 'Historical employee missing';
    else
      begin
        perform public.organigramme_snapshot(current_date);
        raise exception 'Forbidden profile could read organigramme';
      exception when insufficient_privilege then null; end;
      assert (select count(*)=0 from public.organigramme_support), 'Support data leaked';
      assert (select count(*)=0 from public.organigramme_categories), 'Category data leaked';
      assert (select count(*)=0 from public.organigramme_links), 'Link data leaked';
      begin
        perform public.save_organigramme_category('external','Forbidden');
        raise exception 'Forbidden profile could rename';
      exception when insufficient_privilege then null; end;
      begin
        perform public.save_organigramme_link(null,'external','category','office','','Forbidden');
        raise exception 'Forbidden profile could link';
      exception when insufficient_privilege then null; end;
      begin
        insert into public.organigramme_links(source_category,target_kind,target_key) values('external','category','office');
        raise exception 'Forbidden profile could insert directly';
      exception when insufficient_privilege then null; end;
      begin
        perform public.save_organigramme_support(null,null,'Forbidden','Forbidden','external',1);
        raise exception 'Forbidden profile could write';
      exception when insufficient_privilege then null; end;
    end if;
    assert not public.organigramme_has_access(other_company), 'Cross-company permission leaked';
    execute 'reset role';
  end loop;
  update public.role_module_permissions set is_visible=false where module_key='organigramme' and role_key='direction';
  perform set_config('request.jwt.claim.sub','a9570000-0000-4000-8000-000000000102',true);
  execute 'set local role authenticated';
  begin
    perform public.organigramme_snapshot(current_date);
    raise exception 'Revoked permission still allows reads';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  begin
    update public.role_module_permissions set is_visible=true where module_key='organigramme' and role_key='marin';
    raise exception 'Forbidden navigation grant accepted';
  exception when check_violation then null; end;
  execute 'set local role anon';
  begin
    perform public.organigramme_snapshot(current_date);
    raise exception 'Anonymous access accepted';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
end;
$$;
rollback;
