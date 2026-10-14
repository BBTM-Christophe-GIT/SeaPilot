-- Real account/RLS coverage for vessel notices in the read window; fixtures roll back.
begin;
do $test$
declare
  company bigint; other_company bigint; vessel bigint; other_vessel bigint; person bigint;
  actor uuid := 'afa70000-0000-4000-8000-000000000001';
  recipient uuid := 'afa70000-0000-4000-8000-000000000002';
  notice bigint; private_notice bigint; draft_notice bigint; foreign_notice bigint; archived_notice bigint; recipient_id bigint;
  n integer; path text;
begin
  insert into public.companies(code,name) values('notice-window-test','Notice window fixture') returning id into company;
  insert into public.companies(code,name) values('notice-window-other','Foreign notice fixture') returning id into other_company;
  insert into auth.users(id,email) values(actor,'notice-reader@example.invalid'),(recipient,'notice-recipient@example.invalid');
  insert into public.profiles(id,email,display_name,active_company_id)
    values(actor,'notice-reader@example.invalid','Notice Reader',company),(recipient,'notice-recipient@example.invalid','Notice Recipient',company);
  insert into public.company_memberships(company_id,user_id,active) values(company,actor,true),(company,recipient,true)
    on conflict(company_id,user_id) do update set active=true;
  insert into public.user_roles(user_id,company_id,role_key) values(actor,company,'marin'),(recipient,company,'marin');
  insert into public.people(company_id,user_id,first_name,last_name,active,hired_on)
    values(company,actor,'Notice','Reader',true,current_date-365) returning id into person;
  insert into public.vessels(company_id,name) values(company,'Notice vessel') returning id into vessel;
  insert into public.vessels(company_id,name) values(other_company,'Foreign notice vessel') returning id into other_vessel;
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,confirmation_status)
    values(company,vessel,person,current_date+10,current_date+12,'confirmed');
  insert into public.qhse_service_notes(company_id,scope,status,subject,body,published_at)
    values(company,'vessels','published','Vessel notice','Operational notice',now()) returning id into notice;
  insert into public.qhse_service_note_target_vessels(company_id,note_id,vessel_id) values(company,notice,vessel);
  insert into public.qhse_service_notes(company_id,scope,vessel_id,status,subject,body,published_at)
    values(company,'vessels',vessel,'archived','Archived vessel notice','Historical operations',now()) returning id into archived_notice;
  insert into public.qhse_service_notes(company_id,scope,vessel_id,status,subject,body,published_at)
    values(company,'people',vessel,'published','Private note','Nominative note',now()) returning id into private_notice;
  insert into public.qhse_service_note_target_people(company_id,note_id,person_id) values(company,private_notice,person);
  insert into public.qhse_service_notes(company_id,scope,vessel_id,status)
    values(company,'vessels',vessel,'draft') returning id into draft_notice;
  insert into public.qhse_service_notes(company_id,scope,vessel_id,status,subject,body,published_at)
    values(other_company,'vessels',other_vessel,'published','Foreign note','Foreign operational note',now()) returning id into foreign_notice;
  path := company||'/'||notice||'/window-fixture.pdf';
  insert into public.qhse_service_note_attachments(company_id,note_id,attachment_kind,display_name,storage_bucket,storage_path)
    values(company,notice,'file','Fixture PDF','service-note-files',path);
  insert into storage.objects(bucket_id,name) values('service-note-files',path);
  insert into public.qhse_service_note_recipients(company_id,note_id,user_id,first_name_snapshot)
    values(company,notice,recipient,'Private recipient') returning id into recipient_id;
  insert into public.qhse_service_note_signatures(company_id,note_id,recipient_id,user_id,person_id,identity_snapshot,signature_kind,signed_at)
    values(company,notice,recipient_id,recipient,person,'{}','historical_assumed',null);

  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  assert public.service_note_can_read(notice) and public.service_note_can_read(archived_notice),'Vessel notices missing before embarkation';
  select count(*) into n from public.qhse_service_notes where id in (notice,archived_notice,private_notice,draft_notice,foreign_notice);
  assert n=2,'Notice status, nominative or company isolation failed';
  assert (select count(*) from public.qhse_service_note_attachments where note_id=notice)=1,'Vessel attachment unavailable';
  assert exists(select 1 from storage.objects where bucket_id='service-note-files' and name=path),'Vessel attachment storage unavailable';
  assert not exists(select 1 from public.qhse_service_note_recipients where note_id=notice),'Recipient identities exposed by read window';
  assert not exists(select 1 from public.qhse_service_note_signatures where note_id=notice),'Recipient signatures exposed by read window';
  assert not public.service_note_can_manage(notice),'Read window granted notice management';
  begin perform public.sign_service_note(notice); raise exception 'Non-recipient signed vessel note';
    exception when check_violation then
      if sqlerrm <> 'SERVICE_NOTE_LINKED_PERSON_REQUIRED.' then raise; end if;
    end;
  execute 'reset role';

  -- Existing recipient read and acknowledgement scope is preserved.
  perform set_config('request.jwt.claim.sub',recipient::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',recipient,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  assert public.service_note_can_read(notice),'Existing recipient lost read rights';
  assert (select count(*) from public.qhse_service_note_recipients where note_id=notice)=1,'Existing recipient lost acknowledgement register';
  execute 'reset role';

  update public.planning_assignments set confirmation_status='cancelled' where company_id=company;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  assert not public.service_note_can_read(notice),'Cancellation did not revoke new vessel notice read scope';
  execute 'reset role';
end;
$test$;
rollback;
select 'Vessel notice window, status/privacy/company/storage and unchanged signing rights passed; fixtures rolled back.' as result;
