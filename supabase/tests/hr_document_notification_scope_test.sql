begin;

select plan(3);

insert into auth.users (id, email)
values
  ('77000000-0000-0000-0000-000000000101', 'hr-notification-sailor@example.invalid'),
  ('77000000-0000-0000-0000-000000000102', 'hr-notification-colleague@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (
  values
    ('77000000-0000-0000-0000-000000000101'::uuid, 'hr-notification-sailor@example.invalid', 'HR notification sailor'),
    ('77000000-0000-0000-0000-000000000102'::uuid, 'hr-notification-colleague@example.invalid', 'HR notification colleague')
) fixture(id, email, display_name)
cross join public.companies company
where company.code = 'bbtm';

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, 'marin'
from (
  values
    ('77000000-0000-0000-0000-000000000101'::uuid),
    ('77000000-0000-0000-0000-000000000102'::uuid)
) fixture(user_id)
cross join public.companies company
where company.code = 'bbtm';

insert into public.people (
  company_id, user_id, first_name, last_name, function_label, hired_on, active
)
select company.id, fixture.user_id, fixture.first_name, fixture.last_name,
       'Marin', current_date - 365, true
from (
  values
    ('77000000-0000-0000-0000-000000000101'::uuid, 'Sam', 'NOTIFICATION'),
    ('77000000-0000-0000-0000-000000000102'::uuid, 'Camille', 'COLLEAGUE')
) fixture(user_id, first_name, last_name)
cross join public.companies company
where company.code = 'bbtm';

insert into public.hr_documents (
  company_id, person_id, category_key, title, status, expires_on, source_label
)
select company.id, person.id, 'certificate', fixture.title, 'valid',
       current_date + fixture.days_until_expiry, 'seapilot-test'
from (
  values
    ('77000000-0000-0000-0000-000000000101'::uuid, 'Due today', 0),
    ('77000000-0000-0000-0000-000000000101'::uuid, 'Due at day 40', 40),
    ('77000000-0000-0000-0000-000000000101'::uuid, 'Due after window', 41),
    ('77000000-0000-0000-0000-000000000102'::uuid, 'Colleague document', 12)
) fixture(user_id, title, days_until_expiry)
cross join public.companies company
join public.people person
  on person.company_id = company.id
 and person.user_id = fixture.user_id
where company.code = 'bbtm';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '77000000-0000-0000-0000-000000000101', true);

select is(
  (
    select count(*)::integer
    from public.hr_documents document
    where document.person_id = public.current_person_id()
      and document.expires_on between current_date and current_date + 40
  ),
  2,
  'the signed-in user sees documents due today through day 40 inclusive'
);

select is(
  (
    select max(document.expires_on)
    from public.hr_documents document
    where document.person_id = public.current_person_id()
      and document.expires_on between current_date and current_date + 40
  ),
  current_date + 40,
  'the day-40 boundary is included'
);

select is(
  (
    select count(*)::integer
    from public.hr_documents document
    join public.people person on person.id = document.person_id
    where person.user_id = '77000000-0000-0000-0000-000000000102'
  ),
  0,
  'a Marin cannot read a colleague HR document through the notification query'
);

select * from finish();
rollback;
