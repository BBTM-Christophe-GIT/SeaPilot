-- Real authenticated role fixtures, company/Planning RLS, RPC and Blob gateway.
-- All accounts, documents, reservations and assignments are rolled back.
begin;
create temporary table hr_upload_fixture(company_id bigint,other_company bigint,captain bigint,crew bigint,outsider bigint,foreign_person bigint,assignment_id bigint);
grant select on hr_upload_fixture to authenticated;
do $$
declare company bigint; other_company bigint; captain bigint; crew bigint; outsider bigint; foreign_person bigint; ship bigint; assignment_id bigint;
begin
  insert into public.companies(code,name) values('hr-captain-upload-test','HR captain upload fixture') returning id into company;
  insert into public.companies(code,name) values('hr-captain-upload-other','HR upload other company') returning id into other_company;
  insert into auth.users(id,email) values
    ('89210000-0000-4000-8000-000000000001','hr-upload-captain@example.invalid'),
    ('89210000-0000-4000-8000-000000000002','hr-upload-marin@example.invalid'),
    ('89210000-0000-4000-8000-000000000003','hr-upload-office@example.invalid');
  insert into public.profiles(id,email,display_name,active_company_id)
    select id,email,'HR upload fixture',company from auth.users where id::text like '89210000-%';
  insert into public.user_roles(user_id,company_id,role_key) values
    ('89210000-0000-4000-8000-000000000001',company,'capitaine'),
    ('89210000-0000-4000-8000-000000000002',company,'marin'),
    ('89210000-0000-4000-8000-000000000003',company,'armement');
  insert into public.people(company_id,user_id,first_name,last_name,active)
    values(company,'89210000-0000-4000-8000-000000000001','HR','Captain',true) returning id into captain;
  insert into public.people(company_id,user_id,first_name,last_name,active)
    values(company,'89210000-0000-4000-8000-000000000002','HR','Crew',true) returning id into crew;
  insert into public.people(company_id,first_name,last_name,active)
    values(company,'HR','Other watch',true) returning id into outsider;
  insert into public.people(company_id,first_name,last_name,active)
    values(other_company,'HR','Foreign person',true) returning id into foreign_person;
  insert into public.vessels(company_id,name,acronym) values(company,'HR upload fixture ship','HRUT') returning id into ship;
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,captain_person_id,starts_on,ends_on,status_label,watch_group)
    values(company,ship,crew,captain,current_date,current_date+7,'En Mer','HR upload watch') returning id into assignment_id;
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,status_label,watch_group)
    values(company,ship,outsider,current_date,current_date+7,'En Mer','Another watch');
  insert into hr_upload_fixture values(company,other_company,captain,crew,outsider,foreign_person,assignment_id);
  insert into public.hr_documents(company_id,person_id,category_key,title,status,source_label,drive_path,drive_sha256,file_size_bytes,mime_type)
    select company,person,'deck','Legacy Drive fixture','valid','hr-upload-legacy','HR upload/'||person||'-legacy.pdf',repeat('a',64),7,'application/pdf'
    from unnest(array[captain,crew]) person;
  insert into public.document_blob_files(source_bucket,source_path,blob_pathname,blob_url,file_name,mime_type,bytes,sha256,source_sha256,verified_at,uploader_id)
  select 'hr-documents','people/'||person||'/89210000-0000-4000-8000-000000000099-fixture.pdf',
    'documents/test/hr-upload-'||person,'https://fixture.private.blob.vercel-storage.com/documents/test/hr-upload-'||person,
    'fixture.pdf','application/pdf',7,repeat('a',64),repeat('a',64),now(),'89210000-0000-4000-8000-000000000001'
    from unnest(array[captain,crew,outsider,foreign_person]) person;
  insert into public.document_blob_files(source_bucket,source_path,blob_pathname,blob_url,file_name,mime_type,bytes,sha256,source_sha256,verified_at,uploader_id,active)
  select 'hr-documents','people/'||captain||'/89210000-0000-4000-8000-000000000099-'||suffix||'.pdf',
    'documents/test/hr-upload-'||suffix,'https://fixture.private.blob.vercel-storage.com/documents/test/hr-upload-'||suffix,
    'fixture.pdf','application/pdf',7,repeat('a',64),repeat('a',64),now(),actor,enabled
  from (values('inactive','89210000-0000-4000-8000-000000000001'::uuid,false),
    ('other-uploader','89210000-0000-4000-8000-000000000003'::uuid,true)) f(suffix,actor,enabled);
end $$;
-- The API's server-only finalize is exercised using synthetic binary proof.
create function pg_temp.complete_hr_blob(reservation jsonb) returns void
language plpgsql security invoker as $$
begin
  execute 'reset role';
  execute 'set local role service_role';
  perform public.document_blob_register_verified(jsonb_build_object(
    'source_bucket',reservation->>'source_bucket','source_path',reservation->>'source_path',
    'upload_id',reservation->>'id','uploader_id',reservation->>'uploader_id',
    'blob_pathname','documents/uploads/'||(reservation->>'id'),
    'blob_url','https://fixture.private.blob.vercel-storage.com/documents/uploads/'||(reservation->>'id'),
    'file_name','fixture.pdf','mime_type','application/pdf','bytes',7,'sha256',repeat('a',64),
    'verified_mime_type','application/pdf','verified_bytes',7,'verified_sha256',repeat('a',64)));
  execute 'reset role';
  execute 'set local role authenticated';
end $$;
grant execute on function pg_temp.complete_hr_blob(jsonb) to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','89210000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"89210000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare f record; person bigint; path text; document_id bigint; changed integer; reservation jsonb; suffix text;
begin
  select * into f from hr_upload_fixture;
  foreach person in array array[f.captain,f.crew] loop
    assert public.hr_document_can_add(person),'Captain can add to self and own watch';
    assert public.hr_document_drive_scope(person)->>'directory'='Ressources Humaines','Drive scope accepts real Captain';
    assert public.hr_document_drive_scope(null,(select id from public.hr_documents where person_id=person and source_label='hr-upload-legacy'))->>'path'='HR upload/'||person||'-legacy.pdf','Legacy Drive read scope remains available to self and watch';
    path:='people/'||person||'/89210000-0000-4000-8000-000000000099-fixture.pdf';
    assert public.document_blob_can_upload('hr-documents',path,'application/pdf',7),'Gateway authorizes own/watch file upload';
    reservation:=public.document_blob_upload_scope('hr-documents',replace(path,'-fixture.pdf','-prepared.pdf'),'fixture.pdf','application/pdf',7,repeat('a',64));
    assert public.document_blob_upload_revalidate((reservation->>'upload_id')::uuid) is not null,'Gateway revalidates real actor';
    perform pg_temp.complete_hr_blob(reservation);
    path:=reservation->>'source_path';
    insert into public.hr_documents(company_id,person_id,category_key,title,status,source_label,storage_bucket,storage_path,file_size_bytes,mime_type)
      values(f.company_id,person,'deck','Captain uploaded certificate','valid','seapilot_blob','hr-documents',path,7,'application/pdf') returning id into document_id;
    assert public.document_blob_lookup('hr-documents',path) is not null,'Captain reads verified uploaded document';
    update public.hr_documents set title='Forbidden edit' where id=document_id;
    get diagnostics changed=row_count;
    assert changed=0,'Captain cannot alter existing document metadata';
    delete from public.hr_documents where id=document_id;
    get diagnostics changed=row_count;
    assert changed=0,'Captain cannot delete existing documents';
  end loop;
  foreach person in array array[f.outsider,f.foreign_person] loop
    assert not public.hr_document_can_add(person),'Other watch and company are denied';
    path:='people/'||person||'/89210000-0000-4000-8000-000000000099-fixture.pdf';
    assert not public.document_blob_can_upload('hr-documents',path,'application/pdf',7),'Gateway denies outsider upload';
    begin perform public.hr_document_drive_scope(person);raise exception 'Outsider Drive scope accepted';exception when insufficient_privilege then null;end;
    begin perform public.document_blob_upload_scope('hr-documents',path,'fixture.pdf','application/pdf',7,repeat('a',64));raise exception 'Outsider Blob reservation accepted';exception when insufficient_privilege then null;end;
    begin
      insert into public.hr_documents(company_id,person_id,category_key,title,status,source_label,storage_bucket,storage_path,file_size_bytes,mime_type)
      values(f.company_id,person,'deck','Forbidden outsider certificate','valid','seapilot_blob','hr-documents',path,7,'application/pdf');
      raise exception 'Outsider metadata accepted';
    exception when insufficient_privilege or check_violation then null;end;
  end loop;
  foreach suffix in array array['inactive','other-uploader'] loop
    begin
      insert into public.hr_documents(company_id,person_id,category_key,title,status,source_label,storage_bucket,storage_path,file_size_bytes,mime_type)
      values(f.company_id,f.captain,'deck','Forbidden binary','valid','seapilot_blob','hr-documents',
        'people/'||f.captain||'/89210000-0000-4000-8000-000000000099-'||suffix||'.pdf',7,'application/pdf');
      raise exception 'Inactive or other uploader binary accepted';
    exception when insufficient_privilege then null;end;
  end loop;
  begin
    insert into public.hr_documents(company_id,person_id,category_key,title,status,source_label,storage_bucket,storage_path,file_size_bytes,mime_type)
    values(f.company_id,f.captain,'annual_review','Forged annual review','valid','seapilot_blob','hr-documents',
      'people/'||f.captain||'/89210000-0000-4000-8000-000000000099-fixture.pdf',7,'application/pdf');
    raise exception 'Captain forged annual review';
  exception when insufficient_privilege then null;end;
  begin
    insert into public.hr_documents(company_id,person_id,category_key,title,status,source_label,storage_bucket,storage_path,file_size_bytes,mime_type)
    values(f.company_id,f.captain,'deck','Missing binary','valid','seapilot_blob','hr-documents',
      'people/'||f.captain||'/89210000-0000-4000-8000-000000000098-missing.pdf',7,'application/pdf');
    raise exception 'Unverified binary accepted';
  exception when insufficient_privilege then null;end;
  begin
    insert into public.hr_documents(company_id,person_id,category_key,title,status,source_label,storage_bucket,storage_path,file_size_bytes,mime_type)
    values(f.company_id,f.crew,'deck','Reassigned binary','valid','seapilot_blob','hr-documents',
      'people/'||f.captain||'/89210000-0000-4000-8000-000000000099-fixture.pdf',7,'application/pdf');
    raise exception 'Binary from wrong person accepted';
  exception when insufficient_privilege then null;end;
end $$;
-- Marin retains read-only document permissions; office upload remains valid.
select set_config('request.jwt.claim.sub','89210000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"89210000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare f record; begin
  select * into f from hr_upload_fixture;
  assert not public.hr_document_can_add(f.crew),'Marin document permissions stay unchanged';
  assert not public.document_blob_can_upload('hr-documents','people/'||f.crew||'/89210000-0000-4000-8000-000000000099-fixture.pdf','application/pdf',7),'Marin cannot bypass UI via Blob';
end $$;
select set_config('request.jwt.claim.sub','89210000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"89210000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ declare f record; begin
  select * into f from hr_upload_fixture;
  assert public.hr_document_can_add(f.crew),'Office RH upload stays available';
  assert public.document_blob_can_upload('hr-documents','people/'||f.crew||'/89210000-0000-4000-8000-000000000099-fixture.pdf','application/pdf',7),'Office Blob access stays available';
end $$;
reset role;
-- A Planning change between prepare and complete revokes the live reservation.
do $$ declare f record; reservation jsonb; begin
  select * into f from hr_upload_fixture;
  perform set_config('request.jwt.claim.sub','89210000-0000-4000-8000-000000000001',true);
  perform set_config('request.jwt.claims','{"sub":"89210000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  execute 'set local role authenticated';
  reservation:=public.document_blob_upload_scope('hr-documents','people/'||f.crew||'/89210000-0000-4000-8000-000000000099-revoked.pdf','fixture.pdf','application/pdf',7,repeat('a',64));
  execute 'reset role';
  update public.planning_assignments set confirmation_status='cancelled' where id=f.assignment_id;
  execute 'set local role authenticated';
  assert not public.hr_document_can_add(f.crew),'Cancelled watch assignment revokes crew upload';
  assert public.hr_document_can_add(f.captain),'Captain retains own document addition';
  begin perform public.document_blob_upload_revalidate((reservation->>'id')::uuid);raise exception 'Revoked watch reservation completed';
  exception when insufficient_privilege then null;end;
  execute 'reset role';
end $$;
-- Membership removal also revokes the upload RPC, including after prepare.
update public.company_memberships set active=false where user_id='89210000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','89210000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"89210000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare f record; begin
  select * into f from hr_upload_fixture;
  assert not public.user_belongs_to_company(f.company_id),'Fixture membership is explicitly inactive';
  assert not public.hr_document_can_add(f.captain),'Inactive membership denies own upload even with a retained role and profile company';
  assert not public.document_blob_can_upload('hr-documents','people/'||f.captain||'/89210000-0000-4000-8000-000000000099-fixture.pdf','application/pdf',7),'Inactive membership denies Blob';
end $$;
reset role;
select 'PASS: captain own/watch RH upload, verified Blob linkage, unchanged Marin and document edits/deletion' as result;
rollback;
