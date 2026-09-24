begin;

select plan(20);

insert into public.companies (code, name, active)
values ('purchase-marin-approval', 'Marin approval test', true),
       ('purchase-marin-other', 'Other company test', true);

insert into auth.users (id, email)
values ('7c000000-0000-0000-0000-000000000001', 'marin-approval@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select '7c000000-0000-0000-0000-000000000001', 'marin-approval@example.invalid',
       'Marin Approval', id
from public.companies where code = 'purchase-marin-approval';

insert into public.user_roles (user_id, company_id, role_key)
select '7c000000-0000-0000-0000-000000000001', id, 'marin'
from public.companies where code = 'purchase-marin-approval';

insert into public.purchase_requests (
  id, company_id, request_number, title, status, approval_status, source_label
)
overriding system value
select fixture.id, company.id, fixture.number, fixture.number,
       fixture.status, fixture.approval, 'sharepoint'
from (values
  (-724001::bigint, 'MARIN-APPROVAL-PENDING', 'À traiter', 'En attente'),
  (-724002::bigint, 'MARIN-APPROVAL-REFUSED', 'À traiter', 'Demande refusée'),
  (-724003::bigint, 'MARIN-APPROVAL-COMPLETED', 'Traitée', 'Demande acceptée'),
  (-724004::bigint, 'MARIN-APPROVAL-INFORMATION', 'À traiter', 'Complément demandé')
) fixture(id, number, status, approval)
cross join public.companies company where company.code = 'purchase-marin-approval';

insert into public.purchase_requests (
  id, company_id, request_number, title, status, approval_status, source_label
)
overriding system value
select -724005, id, 'MARIN-APPROVAL-OTHER', 'Other company request',
       'À traiter', 'En attente', 'sharepoint'
from public.companies where code = 'purchase-marin-other';

select ok(
  (select count(*) = 1 and bool_and(role_key = 'marin')
   from public.user_roles where user_id = '7c000000-0000-0000-0000-000000000001'),
  'the fixture has only the real Marin role'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '7c000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*) from public.purchase_requests where id between -724005 and -724001),
  4::bigint, 'a Marin can read requests in their company through RLS'
);

select throws_ok(
  $$select public.purchase_request_transition(-724001, 'take_charge')$$,
  '55000', null, 'logistics still require approval'
);

select throws_ok(
  $$select public.purchase_request_transition(-724001, 'refuse', 'Refusal test')$$,
  '42501', null, 'a Marin cannot refuse a request'
);

select throws_ok(
  $$select public.purchase_request_transition(-724001, 'request_information', 'Information test')$$,
  '42501', null, 'a Marin cannot request additional information'
);

select lives_ok(
  $$select public.purchase_request_transition(-724001, 'approve')$$,
  'a Marin can approve a pending request in their company'
);

select is(
  (select approval_status from public.purchase_requests where id = -724001),
  'Demande acceptée', 'Marin approval is persisted'
);

select is(
  (select status from public.purchase_requests where id = -724001),
  'À traiter', 'approval does not skip the take-charge step'
);

select is(
  (select approver_name from public.purchase_requests where id = -724001),
  'Marin Approval', 'approval records the Marin name'
);

select is(
  (select count(*) from public.purchase_request_events
   where purchase_request_id = -724001 and event_type = 'approved'
     and actor_user_id = '7c000000-0000-0000-0000-000000000001'
     and actor_name = 'Marin Approval'),
  1::bigint, 'approval creates one audit event attributed to the Marin'
);

select throws_ok(
  $$select public.purchase_request_transition(-724001, 'approve')$$,
  '55000', null, 'a request cannot be approved twice'
);

select throws_ok(
  $$select public.purchase_request_transition(-724002, 'approve')$$,
  '55000', null, 'a refused request cannot be approved'
);

select throws_ok(
  $$select public.purchase_request_transition(-724003, 'approve')$$,
  '55000', null, 'a completed request cannot be approved'
);

select lives_ok(
  $$select public.purchase_request_transition(-724004, 'approve')$$,
  'a Marin can approve a request awaiting additional information'
);

select throws_ok(
  $$select public.purchase_request_transition(-724005, 'approve')$$,
  'P0002', null, 'a Marin cannot approve another company request by ID'
);

select is(
  (select count(*) from public.purchase_requests where id = -724005),
  0::bigint, 'RLS hides another company request'
);

reset role;
update public.company_memberships set active = false
where user_id = '7c000000-0000-0000-0000-000000000001';
set local role authenticated;

select throws_ok(
  $$select public.purchase_request_transition(-724001, 'approve')$$,
  'P0002', null, 'an inactive company member cannot approve'
);

select is(
  (select count(*) from public.purchase_requests where id = -724001),
  0::bigint, 'RLS hides requests from an inactive company member'
);

select ok(
  not has_function_privilege('anon', 'public.purchase_request_transition(bigint,text,text,date)', 'EXECUTE'),
  'anonymous callers cannot execute purchase transitions'
);

select ok(
  has_function_privilege('authenticated', 'public.purchase_request_transition(bigint,text,text,date)', 'EXECUTE'),
  'authenticated callers can execute the role-checked transition'
);

select * from finish();
rollback;
