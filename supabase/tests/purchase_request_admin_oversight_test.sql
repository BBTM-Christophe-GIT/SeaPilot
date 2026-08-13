begin;

select plan(10);

select has_function(
  'public', 'purchase_request_has_company_role', array['bigint', 'text[]'],
  'purchase requests expose an explicit company-role authorization helper'
);

insert into public.companies (code, name, active)
values ('purchase-admin-active', 'Purchase Admin Active Company', true)
on conflict (code) do update set active = excluded.active;

insert into auth.users (id, email)
values
  ('7a000000-0000-0000-0000-000000000001', 'purchase-admin@example.invalid'),
  ('7a000000-0000-0000-0000-000000000002', 'purchase-captain@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select '7a000000-0000-0000-0000-000000000001', 'purchase-admin@example.invalid',
       'Admin Purchase', company.id
from public.companies company
where company.code = 'purchase-admin-active';

insert into public.profiles (id, email, display_name, active_company_id)
select '7a000000-0000-0000-0000-000000000002', 'purchase-captain@example.invalid',
       'Captain Purchase', company.id
from public.companies company
where company.code = 'bbtm';

insert into public.company_memberships (company_id, user_id, active)
select company.id, '7a000000-0000-0000-0000-000000000001', true
from public.companies company
where company.code = 'bbtm'
on conflict (company_id, user_id) do update set active = excluded.active;

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (
  values
    ('7a000000-0000-0000-0000-000000000001'::uuid, 'admin'),
    ('7a000000-0000-0000-0000-000000000002'::uuid, 'capitaine')
) fixture(user_id, role_key)
cross join public.companies company
where company.code = 'bbtm';

insert into public.purchase_requests (
  company_id, request_number, title, status, approval_status, source_label
)
select company.id, 'ADMIN-OVERSIGHT-001', 'Test admin oversight',
       'Commandes à traiter', 'En attente', 'seapilot'
from public.companies company
where company.code = 'bbtm';

insert into public.purchase_request_attachments (
  company_id, purchase_request_id, title, source_kind, file_url
)
select request.company_id, request.id, 'oversight-proof.pdf', 'sharepoint',
       'https://example.invalid/oversight-proof.pdf'
from public.purchase_requests request
where request.request_number = 'ADMIN-OVERSIGHT-001';

insert into public.purchase_request_events (
  company_id, purchase_request_id, event_type, status_label, actor_name
)
select request.company_id, request.id, 'created', 'Demande créée', 'Captain Purchase'
from public.purchase_requests request
where request.request_number = 'ADMIN-OVERSIGHT-001';

select ok(
  exists (
    select 1 from public.user_roles
    where user_id = '7a000000-0000-0000-0000-000000000002'
      and role_key = 'capitaine'
  ),
  'a captain profile exists in the purchase request company'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a000000-0000-0000-0000-000000000001', true);

select isnt(
  public.current_planning_company_id(),
  (select company_id from public.purchase_requests where request_number = 'ADMIN-OVERSIGHT-001'),
  'the administrator active company can differ from the request company'
);

select ok(
  public.purchase_request_has_company_role(
    (select company_id from public.purchase_requests where request_number = 'ADMIN-OVERSIGHT-001'),
    array['admin']
  ),
  'the administrator keeps oversight through the company role assignment'
);

select is(
  (select count(*) from public.purchase_requests where request_number = 'ADMIN-OVERSIGHT-001'),
  1::bigint,
  'the administrator can see the purchase request when a captain exists'
);

select is(
  (select count(*) from public.purchase_request_attachments where title = 'oversight-proof.pdf'),
  1::bigint,
  'the administrator can see purchase request attachments'
);

select is(
  (select count(*) from public.purchase_request_events where status_label = 'Demande créée'),
  1::bigint,
  'the administrator can see the validation timeline'
);

select lives_ok(
  $$select public.purchase_request_transition(
    (select id from public.purchase_requests where request_number = 'ADMIN-OVERSIGHT-001'),
    'approve', 'Intervention administrateur', current_date
  )$$,
  'the administrator can intervene in the workflow'
);

select is(
  (select approval_status from public.purchase_requests where request_number = 'ADMIN-OVERSIGHT-001'),
  'Demande acceptée',
  'the administrator intervention updates the request state'
);

select is(
  (select count(*) from public.purchase_request_events
   where purchase_request_id = (
     select id from public.purchase_requests where request_number = 'ADMIN-OVERSIGHT-001'
   ) and event_type = 'approved'),
  1::bigint,
  'the administrator intervention is recorded in the timeline'
);

select * from finish();
rollback;
