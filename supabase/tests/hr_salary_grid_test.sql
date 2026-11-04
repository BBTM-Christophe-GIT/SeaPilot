-- Real accounts, company-scoped roles and rollback-only salary fixtures.
begin;
do $$
declare
  company bigint; foreign_company bigint; actor uuid; role_name text; counter integer:=0; person bigint;
  result jsonb; prior_revision bigint; affected integer;
  rows jsonb:='[{"id":"fixture-poste","positionLabel":"Poste fictif","ccn":"Officier","enimCategory":"15","conventionalAnnualBase":30000,"indexationPercent":10,"annualGross":33000,"annualPremium":3000,"totalAnnualBase":36000,"active":true}]';
begin
  insert into public.companies(code,name) values('hr-salary-grid-fixture','Salary grid fixture') returning id into company;
  insert into public.companies(code,name) values('hr-salary-grid-foreign','Foreign salary grid fixture') returning id into foreign_company;
  insert into public.hr_salary_grids(company_id,rows) values(foreign_company,rows);
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    counter:=counter+1; actor:=('ec070000-0000-4000-8000-00000000010'||counter)::uuid;
    insert into auth.users(id,email) values(actor,'salary-grid-'||role_name||'@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id) values(actor,'salary-grid-'||role_name||'@example.invalid','Salary fixture',company);
    insert into public.user_roles(user_id,company_id,role_key) values(actor,company,role_name);
    insert into public.people(company_id,user_id,first_name,last_name) values(company,actor,'Salary',role_name) returning id into person;
  end loop;
  counter:=0;
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    counter:=counter+1; actor:=('ec070000-0000-4000-8000-00000000010'||counter)::uuid;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    if role_name in ('admin','direction') then
      result:=public.get_hr_salary_grid(); prior_revision:=(result->>'revision')::bigint;
      result:=public.save_hr_salary_grid(rows,prior_revision);
      assert (result->>'revision')::bigint=prior_revision+1,'Authorized grid save must increment revision';
      assert result->'rows'->0->>'totalAnnualBase'='36000','Synthetic annual amounts must stay annual and exact';
      begin perform public.save_hr_salary_grid(rows,prior_revision); raise exception 'Stale salary revision overwrote data';
      exception when serialization_failure then null; end;
      begin update public.hr_salary_grids set rows=hr_salary_grids.rows where company_id=company; raise exception 'Direct update bypassed revision control';
      exception when serialization_failure then null; end;
      begin perform public.save_hr_salary_grid(jsonb_set(rows,'{0,totalAnnualBase}','-1'),(result->>'revision')::bigint); raise exception 'Negative amount accepted';
      exception when invalid_parameter_value then null; end;
      begin perform public.save_hr_salary_grid(jsonb_set(rows,'{0,annualGross}','1.234'),(result->>'revision')::bigint); raise exception 'Excess decimals accepted';
      exception when invalid_parameter_value then null; end;
      begin perform public.save_hr_salary_grid(rows||rows,(result->>'revision')::bigint); raise exception 'Duplicate position IDs accepted';
      exception when invalid_parameter_value then null; end;
      begin perform public.save_hr_salary_grid(jsonb_set(rows,'{0,unknown}','"field"'),(result->>'revision')::bigint); raise exception 'Unknown source column accepted';
      exception when invalid_parameter_value then null; end;
      perform public.patch_hr_employment_contract_details(person,'{"socialSecurityNumber":"fixture-ssn","grossMonthlySalary":"3000.00","annualGrossSalary":"36000.00","salaryGridRowId":"fixture-poste","salaryGridRevision":"1"}');
      perform public.patch_hr_employment_contract_details(person,'{"salaryGridRevision":"2"}');
      assert exists(select 1 from public.hr_employment_contract_details d where d.person_id=person
        and d.input_data->>'socialSecurityNumber'='fixture-ssn' and d.input_data->>'annualGrossSalary'='36000.00'), 'Grid selection evidence erased other private RH values';
    else
      begin perform public.get_hr_salary_grid(); raise exception 'Forbidden role read salary grid RPC'; exception when insufficient_privilege then null; end;
      begin perform public.save_hr_salary_grid(rows,0); raise exception 'Forbidden role edited salary grid RPC'; exception when insufficient_privilege then null; end;
      assert not exists(select 1 from public.hr_salary_grids where company_id=company),'Forbidden role read raw grid rows';
      update public.hr_salary_grids set revision=revision+1 where company_id=company;
      get diagnostics affected=row_count; assert affected=0,'Forbidden role updated raw grid row';
    end if;
    assert not exists(select 1 from public.hr_salary_grids where company_id=foreign_company),'Another company salary grid leaked';
    execute 'reset role';
  end loop;
  execute 'set local role anon';
  begin perform public.get_hr_salary_grid(); raise exception 'Anonymous salary grid access succeeded'; exception when insufficient_privilege then null; end;
  execute 'reset role';
end $$;
select 'PASS: synthetic amounts, five real roles, private salary grid, optimistic concurrency, numeric/schema validation, company isolation and private selection evidence' as result;
rollback;
