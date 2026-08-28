begin;

select plan(11);

select has_function(
  'public', 'purchase_request_transition', array['bigint', 'text', 'text', 'date'],
  'purchase requests expose the secured workflow transition function'
);

insert into auth.users (id, email)
values ('7a000000-0000-0000-0000-000000000003', 'purchase-marin@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select '7a000000-0000-0000-0000-000000000003', 'purchase-marin@example.invalid',
       'Marin Purchase', company.id
from public.companies company
where company.code = 'bbtm';

insert into public.company_memberships (company_id, user_id, active)
select company.id, '7a000000-0000-0000-0000-000000000003', true
from public.companies company
where company.code = 'bbtm'
on conflict (company_id, user_id) do update set active = excluded.active;

insert into public.user_roles (user_id, company_id, role_key)
select '7a000000-0000-0000-0000-000000000003', company.id, 'marin'
from public.companies company
where company.code = 'bbtm';

insert into public.purchase_requests (
  company_id, request_number, title, status, approval_status, source_label
)
select company.id, 'MARIN-OPERATIONS-001', 'Test Marin operations',
       'Commandes à traiter', 'En attente', 'seapilot'
from public.companies company
where company.code = 'bbtm';

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a000000-0000-0000-0000-000000000003', true);

select lives_ok(
  $$select public.purchase_request_transition(
    (select id from public.purchase_requests where request_number = 'MARIN-OPERATIONS-001'),
    'take_charge', null, null
  )$$,
  'a Marin can take charge of a purchase request'
);

select is(
  (select status from public.purchase_requests where request_number = 'MARIN-OPERATIONS-001'),
  'Commandes en cours',
  'taking charge advances the request to the ordering stage'
);

select is(
  (select owner_name from public.purchase_requests where request_number = 'MARIN-OPERATIONS-001'),
  'Marin Purchase',
  'taking charge records the Marin as the request owner'
);

select lives_ok(
  $$select public.purchase_request_transition(
    (select id from public.purchase_requests where request_number = 'MARIN-OPERATIONS-001'),
    'plan_delivery', null, date '2026-09-03'
  )$$,
  'a Marin can plan delivery aboard'
);

select is(
  (select expected_delivery_on from public.purchase_requests where request_number = 'MARIN-OPERATIONS-001'),
  date '2026-09-03',
  'planning delivery records the requested date'
);

select lives_ok(
  $$select public.purchase_request_transition(
    (select id from public.purchase_requests where request_number = 'MARIN-OPERATIONS-001'),
    'mark_received', null, date '2026-09-04'
  )$$,
  'a Marin can mark the order as received aboard'
);

select is(
  (select status from public.purchase_requests where request_number = 'MARIN-OPERATIONS-001'),
  'Commandes traitées',
  'receiving the order completes the purchase request'
);

select is(
  (select received_on from public.purchase_requests where request_number = 'MARIN-OPERATIONS-001'),
  date '2026-09-04',
  'receiving the order records the effective date'
);

select throws_ok(
  $$select public.purchase_request_transition(
    (select id from public.purchase_requests where request_number = 'MARIN-OPERATIONS-001'),
    'approve', null, null
  )$$,
  'P0002', null,
  'a Marin cannot approve a purchase request'
);

select is(
  (select approval_status from public.purchase_requests where request_number = 'MARIN-OPERATIONS-001'),
  'En attente',
  'a rejected approval attempt leaves the approval state unchanged'
);

select * from finish();
rollback;
