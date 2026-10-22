begin;

select plan(47);

-- These are real authenticated profile fixtures, not simulated application roles.
insert into public.companies (code, name, active)
values
  ('purchase-crew-submission', 'Purchase Crew Submission', true),
  ('purchase-crew-other', 'Purchase Crew Other Company', true);

insert into auth.users (id, email)
select fixture.user_id, fixture.email
from (values
  ('7c000000-0000-0000-0000-000000000001'::uuid, 'purchase-submit-captain@example.invalid'),
  ('7c000000-0000-0000-0000-000000000002'::uuid, 'purchase-submit-second-captain@example.invalid'),
  ('7c000000-0000-0000-0000-000000000003'::uuid, 'purchase-submit-marin@example.invalid'),
  ('7c000000-0000-0000-0000-000000000004'::uuid, 'purchase-submit-admin@example.invalid'),
  ('7c000000-0000-0000-0000-000000000005'::uuid, 'purchase-submit-direction@example.invalid'),
  ('7c000000-0000-0000-0000-000000000006'::uuid, 'purchase-submit-armement@example.invalid'),
  ('7c000000-0000-0000-0000-000000000007'::uuid, 'purchase-submit-roleless@example.invalid'),
  ('7c000000-0000-0000-0000-000000000008'::uuid, 'purchase-submit-inactive@example.invalid'),
  ('7c000000-0000-0000-0000-000000000009'::uuid, 'purchase-submit-other-company@example.invalid')
) fixture(user_id, email);

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.user_id, fixture.email, fixture.display_name, company.id
from (values
  ('7c000000-0000-0000-0000-000000000001'::uuid, 'purchase-submit-captain@example.invalid', 'Submission Captain', 'purchase-crew-submission'),
  ('7c000000-0000-0000-0000-000000000002'::uuid, 'purchase-submit-second-captain@example.invalid', 'Submission Second Captain', 'purchase-crew-submission'),
  ('7c000000-0000-0000-0000-000000000003'::uuid, 'purchase-submit-marin@example.invalid', 'Submission Marin', 'purchase-crew-submission'),
  ('7c000000-0000-0000-0000-000000000004'::uuid, 'purchase-submit-admin@example.invalid', 'Submission Admin', 'purchase-crew-submission'),
  ('7c000000-0000-0000-0000-000000000005'::uuid, 'purchase-submit-direction@example.invalid', 'Submission Direction', 'purchase-crew-submission'),
  ('7c000000-0000-0000-0000-000000000006'::uuid, 'purchase-submit-armement@example.invalid', 'Submission Armement', 'purchase-crew-submission'),
  ('7c000000-0000-0000-0000-000000000007'::uuid, 'purchase-submit-roleless@example.invalid', 'Submission Roleless Mechanic', 'purchase-crew-submission'),
  ('7c000000-0000-0000-0000-000000000008'::uuid, 'purchase-submit-inactive@example.invalid', 'Submission Inactive Marin', 'purchase-crew-submission'),
  ('7c000000-0000-0000-0000-000000000009'::uuid, 'purchase-submit-other-company@example.invalid', 'Submission Other Company', 'purchase-crew-other')
) fixture(user_id, email, display_name, company_code)
join public.companies company on company.code = fixture.company_code;

insert into public.company_memberships (company_id, user_id, active)
select company.id, '7c000000-0000-0000-0000-000000000009', true
from public.companies company where company.code = 'purchase-crew-submission';

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (values
  ('7c000000-0000-0000-0000-000000000001'::uuid, 'capitaine'),
  ('7c000000-0000-0000-0000-000000000002'::uuid, 'marin'),
  ('7c000000-0000-0000-0000-000000000003'::uuid, 'marin'),
  ('7c000000-0000-0000-0000-000000000004'::uuid, 'admin'),
  ('7c000000-0000-0000-0000-000000000005'::uuid, 'direction'),
  ('7c000000-0000-0000-0000-000000000006'::uuid, 'armement'),
  ('7c000000-0000-0000-0000-000000000008'::uuid, 'marin'),
  ('7c000000-0000-0000-0000-000000000009'::uuid, 'marin')
) fixture(user_id, role_key)
cross join public.companies company
where company.code = 'purchase-crew-submission';

-- Arthur/Gary's reported configuration: app role Marin, HR function 2nd Capitaine.
insert into public.people (company_id, user_id, first_name, last_name, function_label, active)
select company.id, fixture.user_id, fixture.first_name, fixture.last_name, fixture.function_label, true
from (values
  ('7c000000-0000-0000-0000-000000000002'::uuid, 'Second', 'Captain Fixture', '2nd Capitaine'),
  ('7c000000-0000-0000-0000-000000000007'::uuid, 'Roleless', 'Mechanic Fixture', 'Chef mecanicien')
) fixture(user_id, first_name, last_name, function_label)
cross join public.companies company
where company.code = 'purchase-crew-submission';

update public.company_memberships
set active = false
where user_id = '7c000000-0000-0000-0000-000000000008';

insert into public.vessels (company_id, name, active)
select company.id, 'Purchase Submission ' || company.code, true
from public.companies company
where company.code in ('purchase-crew-submission', 'purchase-crew-other');

select set_config('test.purchase_other_company_id',
  (select id::text from public.companies where code = 'purchase-crew-other'), true);
select set_config('test.purchase_other_vessel_id',
  (select id::text from public.vessels where name = 'Purchase Submission purchase-crew-other'), true);

-- The captain has read rights in both companies; ownership must still be
-- restricted to the currently selected company.
insert into public.company_memberships (company_id, user_id, active)
select company.id, '7c000000-0000-0000-0000-000000000001', true
from public.companies company where company.code = 'purchase-crew-other';
insert into public.user_roles (company_id, user_id, role_key)
select company.id, '7c000000-0000-0000-0000-000000000001', 'capitaine'
from public.companies company where company.code = 'purchase-crew-other';

insert into public.purchase_requests (company_id, request_number, title, source_label)
select company.id, fixture.request_number, fixture.request_number, 'seapilot'
from (values
  ('CREW-SUBMIT-OTHER-AUTHOR', 'purchase-crew-submission'),
  ('CREW-SUBMIT-OTHER-COMPANY', 'purchase-crew-other'),
  ('CREW-SUBMIT-ROLELESS-HISTORY', 'purchase-crew-submission'),
  ('CREW-SUBMIT-INACTIVE-HISTORY', 'purchase-crew-submission'),
  ('CREW-SUBMIT-COMPANY-HISTORY', 'purchase-crew-submission')
) fixture(request_number, company_code)
join public.companies company on company.code = fixture.company_code;

insert into public.purchase_request_events (
  company_id, purchase_request_id, event_type, actor_user_id
)
select request.company_id, request.id, 'created', fixture.user_id
from (values
  ('CREW-SUBMIT-OTHER-AUTHOR', '7c000000-0000-0000-0000-000000000003'::uuid),
  ('CREW-SUBMIT-OTHER-COMPANY', '7c000000-0000-0000-0000-000000000001'::uuid),
  ('CREW-SUBMIT-ROLELESS-HISTORY', '7c000000-0000-0000-0000-000000000007'::uuid),
  ('CREW-SUBMIT-INACTIVE-HISTORY', '7c000000-0000-0000-0000-000000000008'::uuid),
  ('CREW-SUBMIT-COMPANY-HISTORY', '7c000000-0000-0000-0000-000000000009'::uuid)
) fixture(request_number, user_id)
join public.purchase_requests request on request.request_number = fixture.request_number;

insert into public.purchase_request_events (
  company_id, purchase_request_id, event_type, actor_user_id
)
select company_id, id, 'comment_added', '7c000000-0000-0000-0000-000000000001'
from public.purchase_requests where request_number = 'CREW-SUBMIT-OTHER-AUTHOR';

set local role authenticated;
select set_config('request.jwt.claim.sub', '7c000000-0000-0000-0000-000000000001', true);

select ok(public.purchase_request_can_create(), 'a real Capitaine can create in the active company');
select lives_ok(
  $$select public.purchase_request_create(jsonb_build_object(
    'request_number', 'CREW-SUBMIT-CAPTAIN', 'title', 'Captain submission',
    'vessel_id', (select id from public.vessels where name = 'Purchase Submission purchase-crew-submission')
  ))$$,
  'a Capitaine submits a request through the secured RPC'
);
select is((select status from public.purchase_requests where request_number = 'CREW-SUBMIT-CAPTAIN'),
  'À traiter', 'a captain request starts in À traiter');
select is((select approval_status from public.purchase_requests where request_number = 'CREW-SUBMIT-CAPTAIN'),
  'En attente', 'a captain request starts with approval pending');
select is((select requester_name from public.purchase_requests where request_number = 'CREW-SUBMIT-CAPTAIN'),
  'Submission Captain', 'the captain identity is retained');
select is((select count(*) from public.purchase_request_events event
  join public.purchase_requests request on request.id = event.purchase_request_id
  where request.request_number = 'CREW-SUBMIT-CAPTAIN' and event.event_type = 'created'
    and event.actor_user_id = '7c000000-0000-0000-0000-000000000001'),
  1::bigint, 'captain submission records an attributed creation event');
select throws_ok(
  $$select public.purchase_request_transition((select id from public.purchase_requests where request_number = 'CREW-SUBMIT-CAPTAIN'), 'approve', null, null)$$,
  '42501', null, 'a captain cannot approve their submitted request'
);
select throws_ok(
  $$select public.purchase_request_transition((select id from public.purchase_requests where request_number = 'CREW-SUBMIT-CAPTAIN'), 'take_charge', null, null)$$,
  '55000', null, 'a captain cannot bypass approval for a newly submitted request'
);
select lives_ok(
  $$insert into public.purchase_request_attachments (purchase_request_id, title, storage_bucket, storage_path)
    select id, 'captain-proof.pdf', 'purchase-request-attachments', 'crew-submission/captain-proof.pdf'
    from public.purchase_requests where request_number = 'CREW-SUBMIT-CAPTAIN'$$,
  'a captain can attach metadata to the submitted request'
);
select lives_ok(
  $$select public.purchase_request_create('{"request_number":"CREW-SUBMIT-CAPTAIN-NO-VESSEL","title":"Captain submission without a vessel"}'::jsonb)$$,
  'a captain can submit without a vessel'
);
select is(public.assigned_vessel_read_scope(), '{}'::bigint[],
  'the captain fixture has no assigned vessel read scope');
select is(public.purchase_request_own_submission_ids(),
  (select array_agg(id order by id) from public.purchase_requests
    where request_number in ('CREW-SUBMIT-CAPTAIN', 'CREW-SUBMIT-CAPTAIN-NO-VESSEL')),
  'own history includes vessel and vessel-less submissions outside assignment scope, but excludes other authors, comments and other companies');

select set_config('request.jwt.claim.sub', '7c000000-0000-0000-0000-000000000002', true);

select ok(public.purchase_request_can_create(), 'a Marin with HR function 2nd Capitaine can create');
select lives_ok(
  $$select public.purchase_request_create(jsonb_build_object(
    'request_number', 'CREW-SUBMIT-SECOND-CAPTAIN', 'title', 'Second captain submission',
    'company_id', current_setting('test.purchase_other_company_id')::bigint
  ))$$,
  'a Marin second captain submits through the secured RPC'
);
select is((select approval_status from public.purchase_requests where request_number = 'CREW-SUBMIT-SECOND-CAPTAIN'),
  'En attente', 'a Marin second captain request starts with approval pending');
select is((select requester_name from public.purchase_requests where request_number = 'CREW-SUBMIT-SECOND-CAPTAIN'),
  'Second Captain Fixture', 'the Marin second captain identity is retained');
select lives_ok(
  $$insert into public.purchase_request_attachments (purchase_request_id, title, storage_bucket, storage_path)
    select id, 'marin-proof.pdf', 'purchase-request-attachments', 'crew-submission/marin-proof.pdf'
    from public.purchase_requests where request_number = 'CREW-SUBMIT-SECOND-CAPTAIN'$$,
  'a Marin can attach metadata to the submitted request'
);
select is((select count(*) from public.purchase_request_attachments where title = 'marin-proof.pdf'),
  1::bigint, 'a Marin can read their persisted attachment');
select throws_ok(
  $$select public.purchase_request_transition((select id from public.purchase_requests where request_number = 'CREW-SUBMIT-SECOND-CAPTAIN'), 'refuse', 'Refused', null)$$,
  '42501', null, 'a Marin cannot refuse a submitted request'
);
-- Deliberately submit a vessel from another company by ID without relying on its RLS visibility.
select throws_ok(
  $$select public.purchase_request_create(jsonb_build_object(
    'request_number', 'CREW-SUBMIT-FORBIDDEN-VESSEL', 'title', 'Cross-company vessel',
    'vessel_id', current_setting('test.purchase_other_vessel_id')::bigint
  ))$$,
  '22023', null, 'a Marin cannot submit against a vessel in another company'
);
select is((select company_id from public.purchase_requests where request_number = 'CREW-SUBMIT-SECOND-CAPTAIN'),
  public.current_planning_company_id(), 'the RPC ignores a caller-supplied company and uses the authorized active company');
select lives_ok(
  $$select public.purchase_request_transition((select id from public.purchase_requests where request_number = 'CREW-SUBMIT-SECOND-CAPTAIN'), 'approve', null, null)$$,
  'the existing Marin approval permission remains available'
);
select is((select approval_status from public.purchase_requests where request_number = 'CREW-SUBMIT-SECOND-CAPTAIN'),
  'Demande acceptée', 'Marin approval still follows the existing transition rules');
select is(public.purchase_request_own_submission_ids(),
  (select array_agg(id order by id) from public.purchase_requests
    where request_number = 'CREW-SUBMIT-SECOND-CAPTAIN'),
  'a Marin second captain retains only their own submission after a reload');

select set_config('request.jwt.claim.sub', '7c000000-0000-0000-0000-000000000003', true);
select ok(public.purchase_request_can_create(), 'a Marin can create without a special HR function');
select lives_ok(
  $$select public.purchase_request_create('{"request_number":"CREW-SUBMIT-MARIN","title":"Marin submission"}'::jsonb)$$,
  'an ordinary Marin submits a request'
);

select set_config('request.jwt.claim.sub', '7c000000-0000-0000-0000-000000000004', true);
select ok(public.purchase_request_can_create(), 'an administrator retains creation permission');
select lives_ok(
  $$select public.purchase_request_create('{"request_number":"CREW-SUBMIT-ADMIN","title":"Admin submission"}'::jsonb)$$,
  'an administrator still submits a request'
);

select set_config('request.jwt.claim.sub', '7c000000-0000-0000-0000-000000000005', true);
select ok(public.purchase_request_can_create(), 'Direction retains creation permission');
select lives_ok(
  $$select public.purchase_request_create('{"request_number":"CREW-SUBMIT-DIRECTION","title":"Direction submission"}'::jsonb)$$,
  'Direction still submits a request'
);

select set_config('request.jwt.claim.sub', '7c000000-0000-0000-0000-000000000006', true);
select ok(public.purchase_request_can_create(), 'Armement retains creation permission');
select lives_ok(
  $$select public.purchase_request_create('{"request_number":"CREW-SUBMIT-ARMEMENT","title":"Armement submission"}'::jsonb)$$,
  'Armement still submits a request'
);

select set_config('request.jwt.claim.sub', '7c000000-0000-0000-0000-000000000007', true);
select ok(not public.purchase_request_can_create(), 'an HR chief-mechanic label without an authorized role grants no permission');
select is(public.purchase_request_own_submission_ids(), '{}'::bigint[],
  'own historical submissions do not bypass an absent authorized role');
select throws_ok(
  $$select public.purchase_request_create('{"request_number":"CREW-SUBMIT-FORBIDDEN-ROLELESS","title":"Roleless submission"}'::jsonb)$$,
  '42501', null, 'a user without an authorized company role cannot submit'
);
select throws_ok(
  $$insert into public.purchase_request_attachments (title, storage_bucket, storage_path)
    values ('roleless-proof.pdf', 'purchase-request-attachments', 'crew-submission/roleless-proof.pdf')$$,
  '42501', null, 'a roleless user cannot add attachment metadata'
);

select set_config('request.jwt.claim.sub', '7c000000-0000-0000-0000-000000000008', true);
select ok(not public.purchase_request_can_create(), 'an inactive company membership cannot create');
select is(public.purchase_request_own_submission_ids(), '{}'::bigint[],
  'own historical submissions do not bypass an inactive membership');
select throws_ok(
  $$select public.purchase_request_create('{"request_number":"CREW-SUBMIT-FORBIDDEN-INACTIVE","title":"Inactive submission"}'::jsonb)$$,
  '42501', null, 'a Marin with inactive membership cannot submit'
);

select set_config('request.jwt.claim.sub', '7c000000-0000-0000-0000-000000000009', true);
select ok(not public.purchase_request_can_create(), 'a role in another company does not authorize the active company');
select is(public.purchase_request_own_submission_ids(), '{}'::bigint[],
  'own historical submissions in another company do not bypass active-company scope');
select throws_ok(
  $$select public.purchase_request_create('{"request_number":"CREW-SUBMIT-FORBIDDEN-COMPANY","title":"Wrong company submission"}'::jsonb)$$,
  '42501', null, 'a Marin cannot submit in a company where they hold no authorized role'
);

select set_config('request.jwt.claim.sub', '', true);
select ok(not public.purchase_request_can_create(), 'an empty authenticated identity cannot create');
select is(public.purchase_request_own_submission_ids(), '{}'::bigint[],
  'an empty identity has no own submission scope');
select ok(not has_function_privilege('anon', 'public.purchase_request_create(jsonb)', 'EXECUTE'),
  'the creation RPC remains unavailable to anonymous users');
select ok(not has_function_privilege('anon', 'public.purchase_request_own_submission_ids()', 'EXECUTE'),
  'the own-submission scope RPC remains unavailable to anonymous users');

reset role;
select is((select count(*) from public.purchase_requests where request_number like 'CREW-SUBMIT-FORBIDDEN-%'),
  0::bigint, 'rejected submissions persist no requests');

select * from finish();
rollback;
