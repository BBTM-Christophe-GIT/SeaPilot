-- Synthetic accounts and dictionary entries only; all test writes roll back.
begin;
do $$
declare
  company bigint;
  actor uuid;
  role_name text;
  table_name text;
  resolver text;
  counter integer:=0;
  fixture_key text;
  visible integer;
  affected integer;
begin
  select id into strict company from public.companies where code='bbtm';
  foreach table_name in array array['emergency_exercise_types','port_call_reason_types','waste_types'] loop
    assert (select relrowsecurity from pg_class where oid=('public.'||table_name)::regclass),'Reference catalogue RLS must be enabled';
    assert not has_table_privilege('anon','public.'||table_name,'SELECT'),'Anonymous catalogue read privilege remains';
    assert not has_table_privilege('anon','public.'||table_name,'INSERT'),'Anonymous catalogue insert privilege remains';
    assert not has_table_privilege('anon','public.'||table_name,'UPDATE'),'Anonymous catalogue update privilege remains';
    assert not has_table_privilege('anon','public.'||table_name,'DELETE'),'Anonymous catalogue delete privilege remains';
    assert not has_table_privilege('authenticated','public.'||table_name,'TRUNCATE'),'Interactive catalogue truncate privilege remains';
    if table_name='waste_types' then
      execute format('insert into public.%I(key,label,unit,display_order) values($1,$2,''kg'',10000)',table_name)
      using 'security-catalogue-sentinel','Synthetic security sentinel';
    else
      execute format('insert into public.%I(key,label,display_order) values($1,$2,10000)',table_name)
      using 'security-catalogue-sentinel','Synthetic security sentinel';
    end if;
  end loop;
  foreach resolver in array array['resolve_sharepoint_document_links','resolve_sharepoint_hr_document_links','resolve_sharepoint_planning_links'] loop
    assert not has_function_privilege('anon','public.'||resolver||'()','EXECUTE'),'Anonymous import RPC execute privilege remains';
    assert not has_function_privilege('authenticated','public.'||resolver||'()','EXECUTE'),'Interactive import RPC execute privilege remains';
    assert has_function_privilege('service_role','public.'||resolver||'()','EXECUTE'),'Technical API import path was removed';
    assert has_function_privilege('postgres','public.'||resolver||'()','EXECUTE'),'Linked SQL import path was removed';
    assert not (select prosecdef from pg_proc where oid=('public.'||resolver||'()')::regprocedure),'Import RPC must use invoker rights';
    -- Prove that an accidental future grant cannot bypass the identity guard.
    execute format('grant execute on function public.%I() to authenticated',resolver);
  end loop;
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    counter:=counter+1;
    actor:=('ec080000-0000-4000-8000-00000000010'||counter)::uuid;
    insert into auth.users(id,email) values(actor,'catalogue-security-'||role_name||'@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id)
      values(actor,'catalogue-security-'||role_name||'@example.invalid','Catalogue security fixture',company);
    insert into public.user_roles(user_id,company_id,role_key) values(actor,company,role_name);
  end loop;
  counter:=0;
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    counter:=counter+1;
    actor:=('ec080000-0000-4000-8000-00000000010'||counter)::uuid;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    foreach table_name in array array['emergency_exercise_types','port_call_reason_types','waste_types'] loop
      execute format('select count(*) from public.%I where key=$1',table_name) into visible using 'security-catalogue-sentinel';
      assert visible=1,'A signed-in DPR/QHSE role lost reference-catalogue read access';
      fixture_key:='security-catalogue-'||role_name;
      if role_name in ('admin','direction','armement') then
        if table_name='waste_types' then
          execute format('insert into public.%I(key,label,unit,display_order) values($1,$2,''kg'',10001)',table_name)
          using fixture_key,'Synthetic catalogue '||role_name;
        else
          execute format('insert into public.%I(key,label,display_order) values($1,$2,10001)',table_name)
          using fixture_key,'Synthetic catalogue '||role_name;
        end if;
        execute format('update public.%I set active=false where key=$1',table_name) using fixture_key;
        get diagnostics affected=row_count;
        assert affected=1,'Existing office role lost catalogue maintenance';
        execute format('delete from public.%I where key=$1',table_name) using fixture_key;
        get diagnostics affected=row_count;
        assert affected=1,'Existing office role cannot delete its synthetic catalogue entry';
      else
        begin
          if table_name='waste_types' then
            execute format('insert into public.%I(key,label,unit,display_order) values($1,$2,''kg'',10001)',table_name)
            using fixture_key,'Forbidden synthetic catalogue '||role_name;
          else
            execute format('insert into public.%I(key,label,display_order) values($1,$2,10001)',table_name)
            using fixture_key,'Forbidden synthetic catalogue '||role_name;
          end if;
          raise exception 'Restricted profile inserted a reference catalogue entry';
        exception when insufficient_privilege then null; end;
        execute format('update public.%I set active=false where key=$1',table_name) using 'security-catalogue-sentinel';
        get diagnostics affected=row_count;
        assert affected=0,'Restricted profile changed a reference catalogue';
        execute format('delete from public.%I where key=$1',table_name) using 'security-catalogue-sentinel';
        get diagnostics affected=row_count;
        assert affected=0,'Restricted profile deleted a reference catalogue';
      end if;
    end loop;
    foreach resolver in array array['resolve_sharepoint_document_links','resolve_sharepoint_hr_document_links','resolve_sharepoint_planning_links'] loop
      begin
        execute format('select * from public.%I()',resolver);
        raise exception 'An interactive profile bypassed the technical-import identity guard';
      exception when insufficient_privilege then null; end;
    end loop;
    execute 'reset role';
  end loop;
  execute 'set local role anon';
  foreach table_name in array array['emergency_exercise_types','port_call_reason_types','waste_types'] loop
    begin execute format('select count(*) from public.%I',table_name); raise exception 'Anonymous catalogue read succeeded';
    exception when insufficient_privilege then null; end;
  end loop;
  foreach resolver in array array['resolve_sharepoint_document_links','resolve_sharepoint_hr_document_links','resolve_sharepoint_planning_links'] loop
    begin execute format('select * from public.%I()',resolver); raise exception 'Anonymous import RPC succeeded';
    exception when insufficient_privilege then null; end;
  end loop;
  execute 'reset role';
  execute 'set local role service_role';
  foreach table_name in array array['emergency_exercise_types','port_call_reason_types','waste_types'] loop
    execute format('update public.%I set active=false where key=$1',table_name) using 'security-catalogue-sentinel';
    get diagnostics affected=row_count;
    assert affected=1,'Technical DPR import lost reference-catalogue upsert access';
  end loop;
  execute 'reset role';
end $$;
select 'PASS: anonymous catalogue/RPC access closed; five real roles retain reads; office maintenance and technical imports preserved; interactive import bypass denied' as result;
rollback;
