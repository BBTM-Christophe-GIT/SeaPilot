begin;
select no_plan();

-- Production already grants this SELECT used by an unrelated Storage policy;
-- old local database fixtures omit that grant. Match production only within
-- this rolled-back transaction so all real Storage policies can be evaluated.
grant select on public.project_billing_documents to authenticated;

create temporary table signer_profiles(user_id uuid, number text, role_key text, company_code text);
insert into signer_profiles values
  ('78840000-0000-0000-0000-000000000001', 'SIG-MARIN-1', 'marin', 'signer-signature-a'),
  ('78840000-0000-0000-0000-000000000002', 'SIG-MARIN-2', 'marin', 'signer-signature-a'),
  ('78840000-0000-0000-0000-000000000003', 'SIG-MARIN-3', 'marin', 'signer-signature-a'),
  ('78840000-0000-0000-0000-000000000004', 'SIG-CAPTAIN-1', 'capitaine', 'signer-signature-a'),
  ('78840000-0000-0000-0000-000000000005', 'SIG-CAPTAIN-2', 'capitaine', 'signer-signature-a'),
  ('78840000-0000-0000-0000-000000000006', 'SIG-FOREIGN', 'capitaine', 'signer-signature-b');
insert into public.companies(code,name,active)
values ('signer-signature-a','Signer Signature A',true),('signer-signature-b','Signer Signature B',true);
insert into auth.users(id,email) select user_id,user_id || '@example.invalid' from signer_profiles;
insert into public.profiles(id,email,display_name,active_company_id)
select fixture.user_id,fixture.user_id || '@example.invalid',fixture.number,company.id
from signer_profiles fixture join public.companies company on company.code=fixture.company_code;
insert into public.company_memberships(user_id,company_id,active)
select fixture.user_id,company.id,true from signer_profiles fixture join public.companies company on company.code=fixture.company_code
on conflict (user_id,company_id) do update set active=true;
insert into public.user_roles(user_id,company_id,role_key)
select fixture.user_id,company.id,fixture.role_key from signer_profiles fixture join public.companies company on company.code=fixture.company_code;
insert into public.people(company_id,user_id,first_name,last_name,function_label,sailor_number,hired_on,active)
select company.id,fixture.user_id,fixture.number,'SIGNER',case when fixture.role_key='capitaine' then 'Capitaine' else 'Matelot' end,
  fixture.number,'2026-09-01',true from signer_profiles fixture join public.companies company on company.code=fixture.company_code;
insert into public.working_time_profile_signatures(company_id,person_id,version_number,storage_path,mime_type,
  file_size_bytes,sha256,valid_from,valid_to,revoked_by,revocation_reason)
select person.company_id,person.id,version.number,person.company_id || '/' || person.id || '/signer-' || version.number || '.png',
  'image/png',128,repeat(case when version.number=1 then 'a' else 'b' end,64),
  case when version.number=1 then '2026-09-01'::timestamptz else '2026-10-01'::timestamptz end,
  case when version.number=1 then '2026-10-01'::timestamptz end,
  case when version.number=1 then person.user_id end,
  case when version.number=1 then 'Replaced by latest signature' end
from public.people person cross join (values (1),(2)) version(number) where person.sailor_number like 'SIG-%';
insert into storage.objects(bucket_id,name,metadata)
select storage_bucket,storage_path,jsonb_build_object('mimetype','image/png','size',128)
from public.working_time_profile_signatures signature join public.people person on person.id=signature.person_id
where person.sailor_number like 'SIG-%';
create temporary table signer_refs as
select person.user_id,person.id as person_id,person.company_id,person.sailor_number,
  register.id as register_id,signature.id as signature_id,signature.storage_path
from public.people person join public.working_time_registers register on register.person_id=person.id and register.period_start='2026-09-01'
join public.working_time_profile_signatures signature on signature.person_id=person.id and signature.valid_to is null
where person.sailor_number like 'SIG-%';
grant select on signer_refs to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','78840000-0000-0000-0000-000000000001',true);
select is((select count(*) from public.working_time_profile_signatures signature join signer_refs fixture on fixture.signature_id=signature.id),
  1::bigint,'Marin can read own latest signature only before a Captain is designated');
select is((select count(*) from storage.objects object join signer_refs fixture on fixture.storage_path=object.name
  where fixture.sailor_number='SIG-CAPTAIN-1' and object.bucket_id='working-time-signatures'),
  0::bigint,'Marin cannot retrieve an unrelated Captain image');
reset role;
update public.working_time_registers set requested_captain_person_id=(select person_id from signer_refs where sailor_number='SIG-CAPTAIN-1')
where id=(select register_id from signer_refs where sailor_number='SIG-MARIN-1');
set local role authenticated;
select is((select version_number from public.working_time_profile_signatures where id=(select signature_id from signer_refs where sailor_number='SIG-CAPTAIN-1')),
  2,'Marin can read latest signature of the Captain explicitly designated on own register');
select is((select count(*) from storage.objects object join signer_refs fixture on fixture.storage_path=object.name
  where fixture.sailor_number='SIG-CAPTAIN-1' and object.bucket_id='working-time-signatures'),
  1::bigint,'the same register guard authorizes the latest private Storage image');
select is((select count(*) from public.working_time_profile_signatures where id=(select signature_id from signer_refs where sailor_number='SIG-CAPTAIN-2')),
  0::bigint,'designating a Captain does not expose another Captain profile');
reset role;
update public.working_time_registers set requested_captain_person_id=(select person_id from signer_refs where sailor_number='SIG-FOREIGN')
where id=(select register_id from signer_refs where sailor_number='SIG-MARIN-1');
set local role authenticated;
select is((select count(*) from public.working_time_profile_signatures where id=(select signature_id from signer_refs where sailor_number='SIG-FOREIGN')),
  0::bigint,'an explicit reference cannot expose a signature from another company');
reset role;
update public.working_time_registers set requested_captain_person_id=null
where id=(select register_id from signer_refs where sailor_number='SIG-MARIN-1');
insert into public.working_time_validations(company_id,register_id,person_id,event_type,previous_status,new_status,
  actor_user_id,actor_person_id,signature_version_id,subject_identity_snapshot,actor_identity_snapshot,signature_snapshot)
select subject.company_id,subject.register_id,subject.person_id,'captain_validated','submitted','validated',
  captain.user_id,captain.person_id,captain.signature_id,'{}','{}',jsonb_build_object('signer_person_id',captain.person_id)
from signer_refs subject cross join signer_refs captain where subject.sailor_number='SIG-MARIN-2' and captain.sailor_number='SIG-CAPTAIN-1';
set local role authenticated;
select set_config('request.jwt.claim.sub','78840000-0000-0000-0000-000000000002',true);
select is((select version_number from public.working_time_profile_signatures where id=(select signature_id from signer_refs where sailor_number='SIG-CAPTAIN-1')),
  2,'a recorded monthly validation grants its real signer latest profile signature');
select is((select count(*) from storage.objects object join signer_refs fixture on fixture.storage_path=object.name
  where fixture.sailor_number='SIG-CAPTAIN-1' and object.bucket_id='working-time-signatures'),
  1::bigint,'monthly validation evidence grants the matching latest private image');
select set_config('request.jwt.claim.sub','78840000-0000-0000-0000-000000000001',true);
select is((select count(*) from public.working_time_profile_signatures where id=(select signature_id from signer_refs where sailor_number='SIG-CAPTAIN-1')),
  0::bigint,'validation of another Marin register grants no signature access');
reset role;
insert into public.working_time_day_approvals(company_id,register_id,person_id,local_work_date,status,approver_person_id)
select subject.company_id,subject.register_id,subject.person_id,'2026-09-08','draft',captain.person_id
from signer_refs subject cross join signer_refs captain where subject.sailor_number='SIG-MARIN-3' and captain.sailor_number='SIG-CAPTAIN-1';
set local role authenticated;
select set_config('request.jwt.claim.sub','78840000-0000-0000-0000-000000000003',true);
select is((select version_number from public.working_time_profile_signatures where id=(select signature_id from signer_refs where sailor_number='SIG-CAPTAIN-1')),
  2,'a daily workflow designated approver grants its latest signature');
reset role;
update public.working_time_day_approvals approval set status='validated',submitted_at=now(),
  submitted_by=subject.user_id,submitted_by_person_id=subject.person_id,
  validated_at=now(),validated_by=captain.user_id,validated_by_person_id=captain.person_id,
  approver_signature_snapshot=jsonb_build_object('signer_person_id',captain.person_id)
from signer_refs subject cross join signer_refs captain
where approval.register_id=subject.register_id and subject.sailor_number='SIG-MARIN-3' and captain.sailor_number='SIG-CAPTAIN-2';
set local role authenticated;
select is((select version_number from public.working_time_profile_signatures where id=(select signature_id from signer_refs where sailor_number='SIG-CAPTAIN-2')),
  2,'daily evidence grants the actual validator latest signature when different from the designated approver');
select is((select count(*) from storage.objects object join signer_refs fixture on fixture.storage_path=object.name
  where fixture.sailor_number='SIG-CAPTAIN-2' and object.bucket_id='working-time-signatures'),
  1::bigint,'the actual daily validator image is readable through Storage RLS');
reset role;

-- The production timeout was caused by checking Captain rights on every
-- unrelated register before deciding whether it names this signature's signer.
insert into public.people(company_id,first_name,last_name,function_label,sailor_number,active)
select company_id,'Bulk','UNRELATED','Matelot','SIG-BULK',true from signer_refs where sailor_number='SIG-CAPTAIN-1';
insert into public.working_time_registers(company_id,person_id,period_kind,period_start,period_end)
select person.company_id,person.id,'weekly',date '1980-01-07'+7*n,date '1980-01-13'+7*n
from public.people person cross join generate_series(0,2199) n where person.sailor_number='SIG-BULK';
insert into public.vessels(company_id,name,acronym,active)
select company_id,'SIGNER PERF VESSEL','SPV',true from signer_refs where sailor_number='SIG-CAPTAIN-1';
insert into public.planning_assignments(company_id,vessel_id,captain_person_id,crew_person_id,starts_on,ends_on,
  starts_at,ends_at,assignment_role,status_label,confirmation_status,watch_group,source_label)
select subject.company_id,vessel.id,captain.person_id,subject.person_id,'2026-09-01','2026-09-30',
  '2026-09-01 00:00:00+02','2026-09-30 23:59:00+02',
  case when subject.sailor_number='SIG-CAPTAIN-1' then 'Capitaine' else 'Matelot' end,
  'En Mer','confirmed','Bordée Signer','signer-performance-fixture'
from signer_refs subject cross join signer_refs captain
join public.vessels vessel on vessel.company_id=captain.company_id and vessel.acronym='SPV'
where captain.sailor_number='SIG-CAPTAIN-1' and subject.sailor_number in ('SIG-CAPTAIN-1','SIG-MARIN-1','SIG-MARIN-2','SIG-MARIN-3');

create function pg_temp.verify_signer_read_performance()
returns setof text language plpgsql security invoker as $$
declare actor_id uuid; actor_label text; started_at timestamptz; rows_read bigint;
begin
  for actor_id,actor_label in values
    ('78840000-0000-0000-0000-000000000004'::uuid,'real Captain'),
    ('78840000-0000-0000-0000-000000000003'::uuid,'real Marin') loop
    perform set_config('request.jwt.claim.sub',actor_id::text,true);
    started_at := clock_timestamp();
    perform signature.id,signature.person_id,signature.version_number,signature.storage_bucket,signature.storage_path,
      signature.mime_type,signature.file_size_bytes,signature.sha256,signature.valid_from
    from public.working_time_profile_signatures signature
    where signature.valid_to is null and signature.person_id in (
      select (person->>'person_id')::bigint from jsonb_array_elements(
        public.working_time_entry_context('2026-09-01','2026-09-30')->'readable_people'
      ) person
    ) order by signature.version_number desc,signature.id;
    get diagnostics rows_read=row_count;
    return next extensions.is(rows_read,case when actor_label='real Captain' then 4::bigint else 1::bigint end,
      actor_label || ' active signature query keeps its actual role scope');
    return next extensions.ok(clock_timestamp()-started_at < interval '8 seconds',
      actor_label || ' active signature query remains below timeout with 2200 unrelated registers');
    started_at := clock_timestamp();
    perform signature.id,signature.person_id,signature.version_number,signature.storage_bucket,signature.storage_path,
      signature.mime_type,signature.file_size_bytes,signature.sha256,signature.valid_from
    from public.working_time_profile_signatures signature
    where signature.valid_to is null and signature.person_id in (
      select person_id from signer_refs where sailor_number in ('SIG-MARIN-3','SIG-CAPTAIN-2')
    ) order by signature.version_number desc,signature.id;
    get diagnostics rows_read=row_count;
    return next extensions.is(rows_read,2::bigint,
      actor_label || ' export can read the subject and actual daily validator latest images');
    return next extensions.ok(clock_timestamp()-started_at < interval '8 seconds',
      actor_label || ' export signature query remains below timeout with unrelated registers');
  end loop;
end;
$$;
set local role authenticated;
select * from pg_temp.verify_signer_read_performance();
reset role;

update public.company_memberships set active=false where user_id='78840000-0000-0000-0000-000000000003';
set local role authenticated;
select is((select count(*) from public.working_time_profile_signatures where id=(select signature_id from signer_refs where sailor_number='SIG-CAPTAIN-2')),
  0::bigint,'membership revocation removes access even with an established signer proof');
select is((select count(*) from storage.objects object join signer_refs fixture on fixture.storage_path=object.name
  where fixture.sailor_number='SIG-CAPTAIN-2' and object.bucket_id='working-time-signatures'),
  0::bigint,'membership revocation also removes private image access');
select ok(not has_function_privilege('anon','public.working_time_can_read_signature(bigint)','EXECUTE'),
  'anonymous callers cannot invoke the signature guard');
select ok(not has_table_privilege('authenticated','public.working_time_profile_signatures','INSERT'),
  'clients cannot invent a signer profile or bypass signature registration');
select * from finish();
rollback;
