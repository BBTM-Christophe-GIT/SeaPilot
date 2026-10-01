-- Real Auth identities and membership fixtures, independent of simulated UI roles.
begin;
do $test$
declare
  company bigint; foreign_company bigint; actor uuid; role_name text; i integer:=0;
  safety_text uuid; transport_text uuid; foreign_text uuid; review_id uuid; review_started timestamptz;
  created_text uuid; affected integer; original_title text;
begin
  select id into strict company from public.companies where code='bbtm';
  insert into public.companies(code,name) values('regulatory-fixture-'||gen_random_uuid(),'Regulatory foreign fixture') returning id into foreign_company;
  insert into public.regulatory_texts(company_id,category,title,url) values(company,'safety','Safety fixture','https://example.invalid/safety') returning id into safety_text;
  insert into public.regulatory_texts(company_id,category,title,url) values(company,'transport','Transport fixture','https://example.invalid/transport') returning id into transport_text;
  insert into public.regulatory_texts(company_id,category,title,url) values(foreign_company,'safety','Foreign fixture','https://example.invalid/foreign') returning id into foreign_text;
  update public.role_module_permissions set is_visible=true where module_key in ('regulatoryLibrary','regulatorySafety','regulatoryTransport');
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    i:=i+1;
    actor:=('d2140000-0000-4000-8000-00000000000'||i)::uuid;
    insert into auth.users(id,email) values(actor,'regulatory-'||role_name||'@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id) values(actor,'regulatory-'||role_name||'@example.invalid','Regulatory '||role_name,company);
    insert into public.company_memberships(company_id,user_id,active) values(company,actor,true) on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(actor,company,role_name);
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    assert public.regulatory_library_has_access('safety'), 'Enabled safety module not readable';
    assert public.regulatory_library_has_access('transport'), 'Enabled transport module not readable';
    assert (select count(*)=2 from public.regulatory_texts where id in (safety_text,transport_text)), 'Role cannot read references';
    assert not exists(select 1 from public.regulatory_texts where id=foreign_text), 'Foreign company reference leaked';
    assert (select count(*)=6 from public.regulatory_texts where id::text like 'd1600000-%'), 'User supplied source links missing';
    if role_name in ('admin','direction','armement') then
      assert public.regulatory_library_has_access('safety',true), 'Manager cannot manage safety';
      insert into public.regulatory_texts(category,title,url) values('safety','New '||role_name,'https://example.invalid/new-'||role_name) returning id into created_text;
      update public.regulatory_texts set title='Edited '||role_name where id=safety_text;
      get diagnostics affected=row_count; assert affected=1, 'Manager cannot edit reference';
      select title into original_title from public.regulatory_texts where id=safety_text;
      review_started:=clock_timestamp();
      insert into public.regulatory_reviews(text_id,has_updates,updates) values(safety_text,true,'Recorded observation '||role_name) returning id into review_id;
      assert (select reviewer_id=actor and reviewer_name='Regulatory '||role_name and reviewed_at>=review_started
        and title_snapshot=original_title and url_snapshot='https://example.invalid/safety' from public.regulatory_reviews where id=review_id), 'Server review identity/date/source snapshot incorrect';
      update public.regulatory_texts set title='After review '||role_name where id=safety_text;
      assert (select title_snapshot=original_title from public.regulatory_reviews where id=review_id), 'Historical source snapshot was changed';
      insert into public.regulatory_reviews(text_id,has_updates,updates) values(transport_text,false,'');
      begin
        insert into public.regulatory_reviews(text_id,has_updates,updates,reviewed_at,reviewer_name)
        values(safety_text,false,'','2099-01-01','Forged identity');
        raise exception 'Client supplied review date/reviewer accepted';
      exception when insufficient_privilege then null; end;
      begin
        insert into public.regulatory_reviews(text_id,has_updates,updates) values(safety_text,true,'');
        raise exception 'Empty update list accepted';
      exception when check_violation then null; end;
      begin
        insert into public.regulatory_reviews(text_id,has_updates,updates) values(foreign_text,false,'');
        raise exception 'Foreign review accepted';
      exception when insufficient_privilege then null; end;
      begin
        insert into public.regulatory_texts(category,title,url,company_id) values('safety','Foreign','https://example.invalid/',foreign_company);
        raise exception 'Foreign company insert accepted';
      exception when insufficient_privilege then null; end;
      begin
        update public.regulatory_texts set company_id=foreign_company where id=safety_text;
        raise exception 'Company identity editable';
      exception when insufficient_privilege then null; end;
      foreach original_title in array array['javascript:alert(1)','http://example.invalid/','https://name:secret@example.invalid/','https://name@example.invalid/','https://example.invalid/a b','https://example.invalid'||chr(92)||'bad'] loop
        begin
          insert into public.regulatory_texts(category,title,url) values('safety','Unsafe link',original_title);
          raise exception 'Unsafe URL accepted: %',original_title;
        exception when check_violation then null; end;
      end loop;
    else
      assert not public.regulatory_library_has_access('safety',true), 'Marin/Capitaine management granted';
      assert exists(select 1 from public.regulatory_reviews where text_id=safety_text), 'Marin/Capitaine cannot read shared review history';
      update public.regulatory_texts set title='Forbidden' where id=safety_text;
      get diagnostics affected=row_count; assert affected=0, 'Reader edited a reference';
      begin
        insert into public.regulatory_texts(category,title,url) values('safety','Forbidden','https://example.invalid/');
        raise exception 'Reader inserted a reference';
      exception when insufficient_privilege then null; end;
      begin
        insert into public.regulatory_reviews(text_id,has_updates,updates) values(safety_text,false,'');
        raise exception 'Reader recorded a review';
      exception when insufficient_privilege then null; end;
    end if;
    begin
      update public.regulatory_reviews set updates='Modified history' where text_id=safety_text;
      raise exception 'Review history editable';
    exception when insufficient_privilege then null; end;
    begin
      delete from public.regulatory_reviews where text_id=safety_text;
      raise exception 'Review history deletable';
    exception when insufficient_privilege then null; end;
    execute 'reset role';
    update public.role_module_permissions set is_visible=false where role_key=role_name and module_key='regulatorySafety';
    execute 'set local role authenticated';
    assert not public.regulatory_library_has_access('safety'), 'Hidden category still readable';
    assert public.regulatory_library_has_access('transport'), 'Hiding safety also hides transport';
    assert not exists(select 1 from public.regulatory_texts where id=safety_text), 'Hidden category references leaked';
    assert not exists(select 1 from public.regulatory_reviews where text_id=safety_text), 'Hidden category review history leaked';
    assert exists(select 1 from public.regulatory_reviews where text_id=transport_text), 'Transport history unavailable';
    begin
      insert into public.regulatory_reviews(text_id,has_updates,updates) values(safety_text,false,'');
      raise exception 'Hidden category review allowed';
    exception when insufficient_privilege then null; end;
    execute 'reset role';
    update public.role_module_permissions set is_visible=true where role_key=role_name and module_key='regulatorySafety';
    update public.role_module_permissions set is_visible=false where role_key=role_name and module_key='regulatoryLibrary';
    execute 'set local role authenticated';
    assert not exists(select 1 from public.regulatory_texts), 'Hidden parent still exposes category references';
    assert not exists(select 1 from public.regulatory_reviews), 'Hidden parent still exposes review history';
    execute 'reset role';
    update public.role_module_permissions set is_visible=true where role_key=role_name and module_key='regulatoryLibrary';
  end loop;
  -- Navigation accumulates visible modules across the account's roles in one company.
  actor:='d2140000-0000-4000-8000-000000000006'::uuid;
  insert into auth.users(id,email) values(actor,'regulatory-multiple-roles@example.invalid');
  insert into public.profiles(id,email,display_name,active_company_id) values(actor,'regulatory-multiple-roles@example.invalid','Regulatory multiple roles',company);
  insert into public.company_memberships(company_id,user_id,active) values(company,actor,true) on conflict(company_id,user_id) do update set active=true;
  insert into public.user_roles(user_id,company_id,role_key) values(actor,company,'admin'),(actor,company,'marin');
  update public.role_module_permissions set is_visible=(role_key='admin') where role_key in ('admin','marin') and module_key='regulatoryLibrary';
  update public.role_module_permissions set is_visible=(role_key='marin') where role_key in ('admin','marin') and module_key='regulatorySafety';
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  assert public.regulatory_library_has_access('safety'), 'Parent and category grants do not accumulate across company roles';
  assert public.regulatory_library_has_access('safety',true), 'Manager role does not accumulate with visible company module grants';
  insert into public.regulatory_reviews(text_id,has_updates,updates) values(safety_text,false,'');
  execute 'reset role';
  update public.role_module_permissions set is_visible=false where role_key='marin' and module_key='regulatorySafety';
  execute 'set local role authenticated';
  assert not public.regulatory_library_has_access('safety'), 'Multi-role account reads a category with no visible grant';
  execute 'reset role';
  update public.role_module_permissions set is_visible=true where role_key='marin' and module_key in ('regulatoryLibrary','regulatorySafety');
  delete from public.user_roles where user_id=actor and company_id=company and role_key='admin';
  insert into public.company_memberships(company_id,user_id,active) values(foreign_company,actor,true);
  insert into public.user_roles(user_id,company_id,role_key) values(actor,foreign_company,'admin');
  execute 'set local role authenticated';
  assert public.regulatory_library_has_access('safety'), 'Multi-role reader lost visible local category';
  assert not public.regulatory_library_has_access('safety',true), 'Foreign-company manager role grants local management';
  execute 'reset role';
  update public.company_memberships set active=false where company_id=company and user_id=actor;
  execute 'set local role authenticated';
  assert not public.regulatory_library_has_access('safety'), 'Inactive membership grants access';
  assert not exists(select 1 from public.regulatory_texts), 'Inactive member reads references';
  execute 'reset role';
  execute 'set local role anon';
  begin
    perform 1 from public.regulatory_texts;
    raise exception 'Anonymous reference access';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.regulatory_reviews;
    raise exception 'Anonymous review access';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
end $test$;
select 'PASS: real Admin/Direction/Armement management and Marin/Capitaine read-only; cumulative company roles; category/parent visibility; tenant isolation; immutable server-stamped reviews; HTTPS guards' as result;
rollback;
