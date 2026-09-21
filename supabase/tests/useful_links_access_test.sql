-- Real authenticated identities and company memberships; no UI profile simulation.
begin;
do $$
declare
  company bigint;
  other_company bigint;
  actor uuid;
  role_name text;
  index integer := 0;
  category uuid;
  link uuid;
  affected integer;
begin
  select id into strict company from public.companies where code='bbtm';
  select id into other_company from public.companies where id<>company limit 1;
  update public.role_module_permissions set is_visible=true where module_key='usefulLinks';
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    index := index+1;
    actor := ('ae210000-0000-4000-8000-00000000010' || index)::uuid;
    insert into auth.users(id,email) values(actor,'links-' || role_name || '@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id) values(actor,'links-' || role_name || '@example.invalid','Links fixture',company);
    insert into public.company_memberships(company_id,user_id,active) values(company,actor,true) on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(actor,company,role_name);
  end loop;
  insert into public.useful_link_categories(company_id,name) values(company,'__Fixture Links__') returning id into category;
  insert into public.useful_links(company_id,category_id,title,url) values(company,category,'Fixture','https://example.invalid/') returning id into link;
  index := 0;
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    index := index+1;
    actor := ('ae210000-0000-4000-8000-00000000010' || index)::uuid;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    assert public.useful_links_has_access(), 'Profile cannot read enabled module';
    assert (select count(*)=1 from public.useful_links where id=link), 'Link missing for allowed role';
    assert (select count(*)=1 from public.useful_link_categories where id=category), 'Category missing for allowed role';
    if role_name in ('admin','direction') then
      assert public.useful_links_can_manage(), 'Manager denied';
      update public.useful_links set title='Updated fixture' where id=link;
      get diagnostics affected = row_count;
      assert affected=1, 'Manager update failed';
      insert into public.useful_links(title,url) values('Insert fixture','https://example.invalid/new');
      delete from public.useful_links where title='Insert fixture';
      get diagnostics affected = row_count;
      assert affected=1, 'Manager delete failed';
      insert into public.useful_link_categories(name) values('__New category__');
      update public.useful_link_categories set name='__Renamed category__' where name='__New category__';
      delete from public.useful_link_categories where name='__Renamed category__';
      get diagnostics affected = row_count;
      assert affected=1, 'Category CRUD failed';
      if other_company is not null then
        begin
          insert into public.useful_links(company_id,title,url) values(other_company,'Cross company','https://example.invalid/');
          raise exception 'Cross-company insert allowed';
        exception when insufficient_privilege then null;
        end;
        begin
          update public.useful_links set company_id=other_company where id=link;
          raise exception 'Company reassignment allowed';
        exception when insufficient_privilege then null;
        end;
      end if;
      begin
        insert into public.useful_links(title,url) values('Unsafe','javascript:alert(1)');
        raise exception 'Unsafe URL accepted';
      exception when check_violation then null;
      end;
    else
      assert not public.useful_links_can_manage(), 'Reader has write access';
      update public.useful_links set title='Forbidden' where id=link;
      get diagnostics affected = row_count; assert affected=0, 'Reader updated link';
      delete from public.useful_links where id=link;
      get diagnostics affected = row_count; assert affected=0, 'Reader deleted link';
      update public.useful_link_categories set name='Forbidden' where id=category;
      get diagnostics affected = row_count; assert affected=0, 'Reader updated category';
      delete from public.useful_link_categories where id=category;
      get diagnostics affected = row_count; assert affected=0, 'Reader deleted category';
      begin
        insert into public.useful_links(title,url) values('Forbidden','https://example.invalid/');
        raise exception 'Reader inserted link';
      exception when insufficient_privilege then null;
      end;
      begin
        insert into public.useful_link_categories(name) values('Forbidden');
        raise exception 'Reader inserted category';
      exception when insufficient_privilege then null;
      end;
    end if;
    execute 'reset role';
    update public.role_module_permissions set is_visible=false where module_key='usefulLinks' and role_key=role_name;
    execute 'set local role authenticated';
    assert not public.useful_links_has_access(), 'Revoked read access remains';
    assert not public.useful_links_can_manage(), 'Revoked write access remains';
    assert (select count(*)=0 from public.useful_links), 'Revoked profile reads links';
    assert (select count(*)=0 from public.useful_link_categories), 'Revoked profile reads categories';
    begin
      insert into public.useful_links(title,url) values('Revoked','https://example.invalid/');
      raise exception 'Revoked profile inserted link';
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';
    update public.role_module_permissions set is_visible=true where module_key='usefulLinks' and role_key=role_name;
  end loop;
  perform set_config('request.jwt.claim.sub','ae210000-0000-4000-8000-000000000101',true);
  execute 'set local role authenticated';
  delete from public.useful_link_categories where id=category;
  assert (select category_id is null from public.useful_links where id=link), 'Category deletion lost link or failed to unclassify';
  execute 'reset role';
  update public.company_memberships set active=false where user_id='ae210000-0000-4000-8000-000000000101';
  execute 'set local role authenticated';
  assert not public.useful_links_has_access(), 'Inactive membership grants access';
  execute 'reset role';
  execute 'set local role anon';
  begin
    perform 1 from public.useful_links;
    raise exception 'Anonymous access allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.useful_link_categories;
    raise exception 'Anonymous category access allowed';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end $$;
select 'PASS: five real role fixtures; CRUD; revoked permissions; inactive membership; tenant scope; URL checks; category deletion preserves links; anonymous denied' as result;
rollback;
