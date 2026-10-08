-- Transactional integration test: real authenticated roles, synthetic records only.
begin;

create temporary table hr_test_roles (user_id uuid, role_key text);
insert into hr_test_roles values
  ('77000000-0000-0000-0000-000000000201', 'admin'),
  ('77000000-0000-0000-0000-000000000202', 'direction'),
  ('77000000-0000-0000-0000-000000000203', 'armement'),
  ('77000000-0000-0000-0000-000000000204', 'marin'),
  ('77000000-0000-0000-0000-000000000205', 'capitaine');
grant select on hr_test_roles to authenticated;

insert into auth.users (id, email)
select user_id, role_key || '-hr-management@example.invalid' from hr_test_roles;
insert into public.profiles (id, email, display_name, active_company_id)
select fixture.user_id, fixture.role_key || '-hr-management@example.invalid', 'HR document test', company.id
from hr_test_roles fixture cross join public.companies company where company.code = 'bbtm';
insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from hr_test_roles fixture cross join public.companies company where company.code = 'bbtm';
insert into public.people (company_id, user_id, first_name, last_name, active)
select company.id, fixture.user_id, 'Document', fixture.role_key, true
from hr_test_roles fixture cross join public.companies company where company.code = 'bbtm';
insert into public.hr_documents (company_id, person_id, category_key, title, status, expires_on, source_label)
select person.company_id, person.id, 'administrative', 'HR management fixture', 'valid', null, 'hr-management-test'
from public.people person join hr_test_roles fixture on fixture.user_id = person.user_id;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  fixture record;
  person_id_value bigint;
  document_id_value bigint;
  changed_count integer;
begin
  for fixture in select * from hr_test_roles loop
    perform set_config('request.jwt.claim.sub', fixture.user_id::text, true);
    person_id_value := public.current_person_id();
    assert person_id_value is not null, 'Each role must have a real linked person';
    select id into document_id_value from public.hr_documents
    where person_id = person_id_value and source_label = 'hr-management-test';
    assert document_id_value is not null, 'Each role can read its own document';

    if fixture.role_key in ('admin', 'direction', 'armement') then
      insert into public.hr_documents (person_id, category_key, title, status, expires_on)
      values (person_id_value, 'deck', 'Synthetic document without expiry', 'valid', null)
      returning id into document_id_value;
      assert exists (select 1 from public.hr_documents where id = document_id_value and expires_on is null),
        'A manager can create without expiry';

      update public.hr_documents set expires_on = current_date + 365, issued_on = current_date
      where id = document_id_value;
      get diagnostics changed_count = row_count;
      assert changed_count = 1, 'A manager can add an expiry';

      update public.hr_documents set category_key = 'administrative', expires_on = null, notes = 'Metadata edited'
      where id = document_id_value;
      assert exists (select 1 from public.hr_documents where id = document_id_value
        and category_key = 'administrative' and expires_on is null and notes = 'Metadata edited'),
        'A manager can reclassify a document and remove its expiry';

      delete from public.hr_documents where id = document_id_value;
      get diagnostics changed_count = row_count;
      assert changed_count = 1, 'A manager can delete the document';
    else
      begin
        insert into public.hr_documents (person_id, category_key, title, status)
        values (person_id_value, 'administrative', 'Forbidden document', 'valid');
        raise exception 'A restricted profile unexpectedly inserted a document';
      exception when insufficient_privilege then null;
      end;
      update public.hr_documents set expires_on = current_date + 365 where id = document_id_value;
      get diagnostics changed_count = row_count;
      assert changed_count = 0, 'Marin and Capitaine cannot edit even their own documents';
      delete from public.hr_documents where id = document_id_value;
      get diagnostics changed_count = row_count;
      assert changed_count = 0, 'Marin and Capitaine cannot delete even their own documents';
    end if;
  end loop;
end $$;

reset role;
select 'PASS: document CRUD and nullable expiry verified for Admin, Direction, Armement; writes denied for Marin and Capitaine' as result;
rollback;
