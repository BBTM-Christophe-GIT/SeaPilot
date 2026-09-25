-- Real database profiles; no simulated Marin or Capitaine session.
begin;
-- Existing unlinked imports can receive file metadata without inventing a person.
-- The transaction rolls this no-op back with every other fixture.
update public.hr_documents set notes=notes where person_id is null;
create temporary table hr_drive_roles(user_id uuid, role_key text);
insert into hr_drive_roles values
 ('77000000-0000-0000-0000-000000000211','admin'),
 ('77000000-0000-0000-0000-000000000212','direction'),
 ('77000000-0000-0000-0000-000000000213','armement'),
 ('77000000-0000-0000-0000-000000000214','marin'),
 ('77000000-0000-0000-0000-000000000215','capitaine');
grant select on hr_drive_roles to authenticated;
insert into auth.users(id,email) select user_id,role_key||'-hr-drive@example.invalid' from hr_drive_roles;
insert into public.profiles(id,email,display_name,active_company_id)
select r.user_id,r.role_key||'-hr-drive@example.invalid','RH Drive fixture',c.id from hr_drive_roles r cross join public.companies c where c.code='bbtm';
insert into public.user_roles(user_id,company_id,role_key)
select r.user_id,c.id,r.role_key from hr_drive_roles r cross join public.companies c where c.code='bbtm';
insert into public.people(company_id,user_id,first_name,last_name,active)
select c.id,r.user_id,'Drive',r.role_key,true from hr_drive_roles r cross join public.companies c where c.code='bbtm';
insert into public.hr_documents(company_id,person_id,category_key,title,status,source_label,drive_path,drive_sha256,file_size_bytes)
select p.company_id,p.id,'administrative','Drive fixture','valid','hr-drive-test',
 'Drive '||upper(p.last_name)||' - c'||p.company_id||'-p'||p.id||'/fixture.pdf',repeat('a',64),7
from public.people p join hr_drive_roles r on r.user_id=p.user_id;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
do $$
declare r record; person bigint; document bigint; scope jsonb; other_doc bigint; failed boolean;
begin
 for r in select * from hr_drive_roles loop
  perform set_config('request.jwt.claim.sub',r.user_id::text,true);
  person:=public.current_person_id();
  select id into document from public.hr_documents where person_id=person and source_label='hr-drive-test';
  scope:=public.hr_document_drive_scope(null,document);
  assert scope->>'directory'='Ressources Humaines','Own document readable by every real profile';
  assert scope->>'bytes'='7' and scope->>'sha256'=repeat('a',64),'Integrity metadata returned';
  if r.role_key in ('admin','direction','armement') then
   scope:=public.hr_document_drive_scope(person,null);
   assert scope->>'folder' is not null,'Managers can write to their authorized collaborator folder';
   begin
    update public.hr_documents set person_id=null where id=document;
    raise exception 'Removing the collaborator was accepted';
   exception when check_violation then null; end;
   begin
    update public.hr_documents set company_id=-1 where id=document;
    raise exception 'Cross-company reassignment was accepted';
   exception when check_violation then null; end;
   begin
    update public.hr_documents set drive_path='Another person - c999-p999/stolen.pdf' where id=document;
    raise exception 'Forged folder was accepted';
   exception when insufficient_privilege then null; end;
  else
   begin
    perform public.hr_document_drive_scope(person,null);
    raise exception 'Restricted role obtained write scope';
   exception when insufficient_privilege then null; end;
   -- An arbitrary registered id cannot bypass the existing person/watch RLS.
   for other_doc in select generate_series(document-10,document+10) loop
    if other_doc=document or exists(select 1 from public.hr_documents where id=other_doc) then continue; end if;
    failed:=false;
    begin perform public.hr_document_drive_scope(null,other_doc);
    exception when insufficient_privilege then failed:=true; end;
    assert failed,'Out-of-scope document read must fail';
   end loop;
  end if;
 end loop;
end $$;
reset role;
select 'PASS: RH Drive read/write scope, forged references, real Marin/Capitaine restrictions' as result;
rollback;
