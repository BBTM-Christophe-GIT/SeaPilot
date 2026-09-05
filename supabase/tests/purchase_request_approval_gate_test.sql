begin;

select plan(29);

select has_function(
  'public', 'purchase_request_transition', array['bigint', 'text', 'text', 'date'],
  'purchase requests expose the secured workflow transition function'
);

insert into auth.users (id, email)
values
  ('7b000000-0000-0000-0000-000000000001', 'purchase-gate-admin@example.invalid'),
  ('7b000000-0000-0000-0000-000000000002', 'purchase-gate-direction@example.invalid'),
  ('7b000000-0000-0000-0000-000000000003', 'purchase-gate-armement@example.invalid'),
  ('7b000000-0000-0000-0000-000000000004', 'purchase-gate-captain@example.invalid'),
  ('7b000000-0000-0000-0000-000000000005', 'purchase-gate-marin@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.user_id, fixture.email, fixture.display_name, company.id
from (
  values
    ('7b000000-0000-0000-0000-000000000001'::uuid, 'purchase-gate-admin@example.invalid', 'Admin Purchase Gate'),
    ('7b000000-0000-0000-0000-000000000002'::uuid, 'purchase-gate-direction@example.invalid', 'Direction Purchase Gate'),
    ('7b000000-0000-0000-0000-000000000003'::uuid, 'purchase-gate-armement@example.invalid', 'Armement Purchase Gate'),
    ('7b000000-0000-0000-0000-000000000004'::uuid, 'purchase-gate-captain@example.invalid', 'Captain Purchase Gate'),
    ('7b000000-0000-0000-0000-000000000005'::uuid, 'purchase-gate-marin@example.invalid', 'Marin Purchase Gate')
) fixture(user_id, email, display_name)
cross join public.companies company
where company.code = 'bbtm';

insert into public.company_memberships (company_id, user_id, active)
select company.id, fixture.user_id, true
from (
  values
    ('7b000000-0000-0000-0000-000000000001'::uuid),
    ('7b000000-0000-0000-0000-000000000002'::uuid),
    ('7b000000-0000-0000-0000-000000000003'::uuid),
    ('7b000000-0000-0000-0000-000000000004'::uuid),
    ('7b000000-0000-0000-0000-000000000005'::uuid)
) fixture(user_id)
cross join public.companies company
where company.code = 'bbtm'
on conflict (company_id, user_id) do update set active = excluded.active;

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (
  values
    ('7b000000-0000-0000-0000-000000000001'::uuid, 'admin'),
    ('7b000000-0000-0000-0000-000000000002'::uuid, 'direction'),
    ('7b000000-0000-0000-0000-000000000003'::uuid, 'armement'),
    ('7b000000-0000-0000-0000-000000000004'::uuid, 'capitaine'),
    ('7b000000-0000-0000-0000-000000000005'::uuid, 'marin')
) fixture(user_id, role_key)
cross join public.companies company
where company.code = 'bbtm';

insert into public.purchase_requests (
  company_id, request_number, title, status, approval_status, source_label
)
select company.id, fixture.request_number, fixture.title,
       'À traiter', 'En attente', 'seapilot'
from (
  values
    ('PURCHASE-GATE-PENDING', 'Pending approval gate'),
    ('PURCHASE-GATE-CAPTAIN', 'Captain decision gate'),
    ('PURCHASE-GATE-DIRECTION', 'Direction decision gate'),
    ('PURCHASE-GATE-REFUSAL', 'Armement refusal gate')
) fixture(request_number, title)
cross join public.companies company
where company.code = 'bbtm';

set local role authenticated;
select set_config('request.jwt.claim.sub', '7b000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.purchase_request_create(
    '{"request_number":"PURCHASE-GATE-CREATED","title":"Created through RPC","expected_delivery_on":"2026-09-12"}'::jsonb
  )$$,
  'an administrator can create a purchase request'
);

select is(
  (select status from public.purchase_requests where request_number = 'PURCHASE-GATE-CREATED'),
  'À traiter',
  'a created request starts in À traiter even with a desired delivery date'
);

select is(
  (select approval_status from public.purchase_requests where request_number = 'PURCHASE-GATE-CREATED'),
  'En attente',
  'a created request starts with a pending approval decision'
);

select is(
  (select expected_delivery_on from public.purchase_requests where request_number = 'PURCHASE-GATE-CREATED'),
  date '2026-09-12',
  'the desired delivery date is retained without advancing the workflow'
);

select lives_ok(
  $$select public.purchase_request_transition(
    (select id from public.purchase_requests where request_number = 'PURCHASE-GATE-CREATED'),
    'approve', null, null
  )$$,
  'an administrator can approve a pending request'
);

select is(
  (select approval_status from public.purchase_requests where request_number = 'PURCHASE-GATE-CREATED'),
  'Demande acceptée',
  'administrator approval is persisted'
);

select set_config('request.jwt.claim.sub', '7b000000-0000-0000-0000-000000000005', true);

select throws_ok(
  $$select public.purchase_request_transition(
    (select id from public.purchase_requests where request_number = 'PURCHASE-GATE-PENDING'),
    'take_charge', null, null
  )$$,
  '55000', null,
  'a Marin cannot start logistics before approval'
);

select set_config('request.jwt.claim.sub', '7b000000-0000-0000-0000-000000000004', true);

select throws_ok(
  $$select public.purchase_request_transition(
    (select id from public.purchase_requests where request_number = 'PURCHASE-GATE-CAPTAIN'),
    'approve', null, null
  )$$,
  '42501', null,
  'a Capitaine cannot approve a purchase request'
);

select throws_ok(
  $$select public.purchase_request_transition(
    (select id from public.purchase_requests where request_number = 'PURCHASE-GATE-CAPTAIN'),
    'refuse', 'Décision du capitaine', null
  )$$,
  '42501', null,
  'a Capitaine cannot refuse a purchase request'
);

select set_config('request.jwt.claim.sub', '7b000000-0000-0000-0000-000000000002', true);

select lives_ok(
  $$select public.purchase_request_transition(
    (select id from public.purchase_requests where request_number = 'PURCHASE-GATE-DIRECTION'),
    'approve', null, null
  )$$,
  'Direction can approve a pending request'
);

select is(
  (select approval_status from public.purchase_requests where request_number = 'PURCHASE-GATE-DIRECTION'),
  'Demande acceptée',
  'Direction approval is persisted'
);

select set_config('request.jwt.claim.sub', '7b000000-0000-0000-0000-000000000003', true);

select throws_ok(
  $$select public.purchase_request_transition(
    (select id from public.purchase_requests where request_number = 'PURCHASE-GATE-REFUSAL'),
    'refuse', '   ', null
  )$$,
  '22023', null,
  'Armement cannot refuse without a justification'
);

select is(
  (select approval_status from public.purchase_requests where request_number = 'PURCHASE-GATE-REFUSAL'),
  'En attente',
  'a missing refusal justification leaves the request pending'
);

select lives_ok(
  $$select public.purchase_request_transition(
    (select id from public.purchase_requests where request_number = 'PURCHASE-GATE-REFUSAL'),
    'refuse', 'Budget non validé', null
  )$$,
  'Armement can refuse with a justification'
);

select is(
  (select approval_status from public.purchase_requests where request_number = 'PURCHASE-GATE-REFUSAL'),
  'Demande refusée',
  'the refusal decision is persisted'
);

select is(
  (select approval_reason from public.purchase_requests where request_number = 'PURCHASE-GATE-REFUSAL'),
  'Budget non validé',
  'the refusal justification is persisted'
);

select set_config('request.jwt.claim.sub', '7b000000-0000-0000-0000-000000000005', true);

select throws_ok(
  $$select public.purchase_request_transition(
    (select id from public.purchase_requests where request_number = 'PURCHASE-GATE-REFUSAL'),
    'take_charge', null, null
  )$$,
  '55000', null,
  'a refused request cannot continue into logistics'
);

select lives_ok(
  $$select public.purchase_request_transition(
    (select id from public.purchase_requests where request_number = 'PURCHASE-GATE-CREATED'),
    'take_charge', null, null
  )$$,
  'a Marin can take charge after approval'
);

select is(
  (select status from public.purchase_requests where request_number = 'PURCHASE-GATE-CREATED'),
  'En commande',
  'taking charge advances the request to En commande'
);

select is(
  (select ordered_on from public.purchase_requests where request_number = 'PURCHASE-GATE-CREATED'),
  current_date,
  'taking charge records the order date'
);

select lives_ok(
  $$select public.purchase_request_transition(
    (select id from public.purchase_requests where request_number = 'PURCHASE-GATE-CREATED'),
    'plan_delivery', null, date '2026-09-15'
  )$$,
  'a Marin can plan delivery after taking charge'
);

select is(
  (select status from public.purchase_requests where request_number = 'PURCHASE-GATE-CREATED'),
  'À réception',
  'planning delivery advances the request to À réception'
);

select is(
  (select expected_delivery_on from public.purchase_requests where request_number = 'PURCHASE-GATE-CREATED'),
  date '2026-09-15',
  'planning delivery records the effective delivery date'
);

select lives_ok(
  $$select public.purchase_request_transition(
    (select id from public.purchase_requests where request_number = 'PURCHASE-GATE-CREATED'),
    'mark_received', null, date '2026-09-16'
  )$$,
  'a Marin can confirm receipt after delivery planning'
);

select is(
  (select status from public.purchase_requests where request_number = 'PURCHASE-GATE-CREATED'),
  'Traitée',
  'receipt advances the request to Traitée'
);

select is(
  (select received_on from public.purchase_requests where request_number = 'PURCHASE-GATE-CREATED'),
  date '2026-09-16',
  'receipt records the effective receipt date'
);

select throws_ok(
  $$select public.purchase_request_transition(
    (select id from public.purchase_requests where request_number = 'PURCHASE-GATE-CREATED'),
    'mark_received', null, date '2026-09-17'
  )$$,
  '55000', null,
  'a completed request cannot be received twice'
);

select is(
  (select count(*) from public.purchase_request_events
   where purchase_request_id = (
     select id from public.purchase_requests where request_number = 'PURCHASE-GATE-CREATED'
   )),
  5::bigint,
  'creation, approval, ordering, delivery and receipt are all recorded'
);

select * from finish();
rollback;
