-- PDF-only issuance and the existing private Benjamin BON signature, no live data.
begin;
-- A future broad upload policy still cannot re-enable Word issuance.
create policy hr_contract_pdf_test_broad on storage.objects for insert to authenticated
with check(bucket_id='hr-employment-contracts');
do $$
declare
  company bigint;
  signer_person bigint;
  other_person bigint;
  signature_id bigint;
  signature_path text;
  actor uuid;
  role_name text;
  counter integer:=0;
  result jsonb;
  path text;
begin
  insert into public.companies(code,name) values('hr-contract-pdf-fixture','HR contract PDF fixture') returning id into company;
  insert into public.people(company_id,first_name,last_name,active) values(company,'Benjamin','BON',true) returning id into signer_person;
  insert into public.people(company_id,first_name,last_name,active) values(company,'Other','Signer',true) returning id into other_person;
  signature_path:=company||'/'||signer_person||'/fixture.png';
  insert into storage.objects(bucket_id,name,metadata)
    values('working-time-signatures',signature_path,'{"mimetype":"image/png","size":100}');
  insert into public.working_time_profile_signatures(company_id,person_id,version_number,storage_bucket,storage_path,mime_type,file_size_bytes,sha256,valid_from)
    values(company,signer_person,1,'working-time-signatures',signature_path,'image/png',100,repeat('a',64),now()-interval '1 day') returning id into signature_id;
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    counter:=counter+1;
    actor:=('ec060000-0000-4000-8000-00000000010'||counter)::uuid;
    insert into auth.users(id,email) values(actor,'hr-contract-pdf-'||role_name||'@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id)
      values(actor,'hr-contract-pdf-'||role_name||'@example.invalid','PDF fixture',company);
    insert into public.user_roles(user_id,company_id,role_key) values(actor,company,role_name);
    insert into public.people(company_id,user_id,first_name,last_name,active) values(company,actor,'PDF',role_name,true);
  end loop;
  counter:=0;
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    counter:=counter+1;
    actor:=('ec060000-0000-4000-8000-00000000010'||counter)::uuid;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    if role_name in ('admin','direction') then
      result:=public.hr_employment_contract_signer();
      assert result->>'person_id'=signer_person::text and result->>'id'=signature_id::text
        and result->>'signer_name'='Benjamin BON' and result->>'storage_path'=signature_path,
        'Company signer must be the exact active Benjamin BON and existing signature';
      assert exists(select 1 from storage.objects o where o.bucket_id='working-time-signatures' and o.name=signature_path), 'Authorized contract issuer cannot read existing private signer image';
      path:=company||'/people/'||other_person||'/'||gen_random_uuid()||'.pdf';
      insert into storage.objects(bucket_id,name,metadata) values('hr-employment-contracts',path,'{"mimetype":"application/pdf","size":100}');
      insert into public.hr_employment_contracts(company_id,person_id,contract_type,title,file_name,storage_path,file_size_bytes,input_data)
        values(company,other_person,'CDI','PDF fixture','Contrat.pdf',path,100,jsonb_build_object('employerSignatureId',signature_id));
      begin
        insert into storage.objects(bucket_id,name,metadata)
          values('hr-employment-contracts',replace(path,'.pdf','.docx'),'{"mimetype":"application/vnd.openxmlformats-officedocument.wordprocessingml.document","size":100}');
        raise exception 'A new Word upload was accepted';
      exception when insufficient_privilege then null; end;
      begin
        insert into public.hr_employment_contracts(company_id,person_id,contract_type,title,file_name,storage_path,file_size_bytes,input_data)
          values(company,other_person,'CDI','Forbidden Word fixture','Contrat.docx',replace(path,'.pdf','.docx'),100,'{}');
        raise exception 'A new Word contract record was accepted';
      exception when check_violation then null; end;
      assert public.hr_employment_contract_path_allowed(replace(path,'.pdf','.docx')), 'Historical Word paths must stay readable';
    else
      begin
        perform public.hr_employment_contract_signer();
        raise exception 'Forbidden role queried the contract signer endpoint';
      exception when insufficient_privilege then null; end;
    end if;
    execute 'reset role';
  end loop;
  -- Fail closed rather than silently use another employee or a public image.
  update public.people set active=false where id=signer_person;
  perform set_config('request.jwt.claim.sub','ec060000-0000-4000-8000-000000000101',true);
  execute 'set local role authenticated';
  begin perform public.hr_employment_contract_signer(); raise exception 'Inactive Benjamin BON was used';
  exception when invalid_parameter_value then null; end;
  execute 'reset role';
  execute 'set local role anon';
  begin perform public.hr_employment_contract_signer(); raise exception 'Anonymous contract signer query succeeded';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  assert (select allowed_mime_types=array['application/pdf']::text[] and not public from storage.buckets where id='hr-employment-contracts'), 'Contract bucket must accept PDF only and stay private';
end $$;
select 'PASS: PDF-only issuance, private exact company signer for Admin/Direction, existing Word compatibility, unauthorized/anonymous/inactive signer denied' as result;
rollback;
