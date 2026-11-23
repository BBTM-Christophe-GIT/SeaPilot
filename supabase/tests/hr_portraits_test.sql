-- Transactional fixtures with actual authenticated roles, never simulated UI roles.
begin;
-- The shared Storage policies also read project metadata. Supply the local
-- fixture grants while retaining table RLS. This transaction rolls them back.
do $$
declare reference_table text;
begin
  foreach reference_table in array array['project_billing_documents','project_generated_documents','contract_documents'] loop
    assert (select relrowsecurity from pg_class where oid = ('public.'||reference_table)::regclass),
      'Project metadata RLS must remain enabled for the portrait fixture';
  end loop;
end $$;
grant select on public.project_billing_documents,public.project_generated_documents,public.contract_documents to authenticated;
create temporary table portrait_roles(actor uuid, role_key text, person_id bigint, document_id bigint, path text);
grant select,update on portrait_roles to authenticated;
do $$
declare role_name text; actor_id uuid; company bigint; p bigint; d bigint; n integer:=0; path text;
begin
  select id into strict company from public.companies where code='bbtm';
  foreach role_name in array array['admin','direction','armement','marin','capitaine'] loop
    n:=n+1; actor_id:=('bb870000-0000-4000-8000-00000000000'||n)::uuid;
    insert into auth.users(id,email) values(actor_id,role_name||'-portrait@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id) values(actor_id,role_name||'-portrait@example.invalid','Portrait fixture',company);
    insert into public.company_memberships(company_id,user_id,active) values(company,actor_id,true) on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(actor_id,company,role_name);
    insert into public.people(company_id,user_id,first_name,last_name,active,hired_on) values(company,actor_id,'Portrait',role_name,true,current_date-1) returning id into p;
    insert into public.hr_documents(company_id,person_id,category_key,title,status,source_label,drive_path,drive_sha256,file_size_bytes,mime_type)
      values(company,p,'administrative','Photo fixture','valid','portrait-test','Portrait '||upper(role_name)||' - c'||company||'-p'||p||'/photo.jpg',repeat('a',64),128,'image/jpeg') returning id into d;
    path:=p||'/bb870000-0000-4000-8000-000000000001.jpg';
    insert into storage.objects(bucket_id,name,metadata) values('hr-portraits',path,'{"mimetype":"image/jpeg","size":128}');
    update public.people set photo_document_id=d,photo_storage_path=path where id=p;
    insert into portrait_roles values(actor_id,role_name,p,d,path);
  end loop;
end $$;
create temporary table portrait_blob_documents(person_id bigint, document_id bigint, scenario text, thumbnail_path text);
grant select on portrait_blob_documents to authenticated;
do $$
declare r record; scenario text; original_path text; thumbnail_path text; original_person bigint; d bigint;
begin
  for r in select * from portrait_roles where role_key in ('admin','direction','armement') loop
    thumbnail_path := r.person_id || '/bb870000-0000-4000-8000-000000000003.jpg';
    insert into public.document_blob_files(source_bucket,source_path,blob_pathname,blob_url,file_name,mime_type,bytes,
      sha256,source_sha256,verified_at,uploader_id)
    values('hr-portraits',thumbnail_path,'documents/portrait-test/'||thumbnail_path,
      'https://fixture.private.blob.vercel-storage.com/documents/portrait-test/'||thumbnail_path,
      'thumbnail.jpg','image/jpeg',128,repeat('a',64),repeat('a',64),now(),r.actor);

    foreach scenario in array array['verified','inactive','missing','wrong-size','wrong-person'] loop
      original_person := r.person_id;
      if scenario = 'wrong-person' then
        select person_id into strict original_person from portrait_roles where role_key = 'marin';
      end if;
      original_path := 'people/'||original_person||'/bb870000-0000-4000-8000-000000000003-'||r.role_key||'-'||scenario||'.png';
      if scenario <> 'missing' then
        insert into public.document_blob_files(source_bucket,source_path,blob_pathname,blob_url,file_name,mime_type,bytes,
          sha256,source_sha256,verified_at,uploader_id,active)
        values('hr-documents',original_path,'documents/portrait-test/'||original_path,
          'https://fixture.private.blob.vercel-storage.com/documents/portrait-test/'||original_path,
          'original.png','image/png',128,repeat('a',64),repeat('a',64),now(),r.actor,scenario <> 'inactive');
      end if;
      insert into public.hr_documents(company_id,person_id,category_key,title,status,source_label,storage_bucket,storage_path,file_size_bytes,mime_type)
        select company_id,id,'administrative','Photo Blob fixture','valid','seapilot_blob','hr-documents',original_path,
          case when scenario = 'wrong-size' then 256 else 128 end,'image/png'
        from public.people where id = r.person_id returning id into d;
      insert into portrait_blob_documents values(r.person_id,d,scenario,thumbnail_path);
    end loop;
  end loop;
end $$;
set local role authenticated;
do $$
declare r record; other record; blob record; affected integer; snapshot jsonb;
begin
  for r in select * from portrait_roles loop
    perform set_config('request.jwt.claim.sub',r.actor::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',r.actor,'role','authenticated')::text,true);
    select * into other from portrait_roles where person_id<>r.person_id limit 1;
    assert exists(select 1 from storage.objects where bucket_id='hr-portraits' and name=r.path),'Own photo unreadable';
    if r.role_key in ('admin','direction','armement') then
      assert exists(select 1 from storage.objects where bucket_id='hr-portraits' and name=other.path),'Office photo scope missing';
      begin
        update public.people set photo_document_id=other.document_id,photo_storage_path=other.path where id=r.person_id;
        raise exception 'Foreign photo reference accepted';
      exception when check_violation then null; end;
      update public.people set photo_document_id=null,photo_storage_path=null where id=r.person_id;
      update public.people set photo_document_id=r.document_id,photo_storage_path=r.path where id=r.person_id;
      for blob in select * from portrait_blob_documents where person_id = r.person_id loop
        if blob.scenario = 'verified' then
          update public.people set photo_document_id=blob.document_id,photo_storage_path=blob.thumbnail_path where id=r.person_id;
          assert found,'Verified Blob portrait was not linked';
        else
          begin
            update public.people set photo_document_id=blob.document_id,photo_storage_path=blob.thumbnail_path where id=r.person_id;
            raise exception 'Rejected Blob scenario was accepted: %',blob.scenario;
          exception when check_violation then null; end;
        end if;
      end loop;
      update public.people set photo_document_id=r.document_id,photo_storage_path=r.path where id=r.person_id;
      if r.role_key in ('admin','direction') then
        snapshot:=public.organigramme_snapshot_v2(current_date);
        assert exists(select 1 from jsonb_array_elements(snapshot->'people') p where (p->>'id')::bigint=r.person_id and p->>'photoPath'=r.path),'Snapshot photo missing';
      end if;
    else
      assert not exists(select 1 from storage.objects where bucket_id='hr-portraits' and name=other.path),'Unrelated collaborator photo leaked';
      update public.people set photo_document_id=null,photo_storage_path=null where id=r.person_id;
      get diagnostics affected=row_count;
      assert affected=0,'Restricted profile modified portrait';
      begin
        insert into storage.objects(bucket_id,name,metadata) values('hr-portraits',r.person_id||'/bb870000-0000-4000-8000-000000000002.jpg','{"mimetype":"image/jpeg","size":128}');
        raise exception 'Restricted upload accepted';
      exception when insufficient_privilege then null; end;
    end if;
  end loop;
end $$;
reset role;
set local role anon;
do $$ begin
  assert not exists(select 1 from storage.objects where bucket_id='hr-portraits'),'Anonymous portrait access';
end $$;
reset role;
select 'PASS: private portraits, office writes, verified Blob and legacy Drive, own-profile reads, forged references, real Marin/Capitaine and anonymous restrictions' as result;
rollback;
