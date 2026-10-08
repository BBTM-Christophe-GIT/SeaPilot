begin;

select plan(45);

select has_function(
  'public', 'purchase_request_add_comment', array['bigint', 'text'],
  'follow-up exposes an RPC accepting only the request and comment'
);
select function_returns(
  'public', 'purchase_request_add_comment', array['bigint', 'text'], 'purchase_request_events',
  'the RPC returns the persisted event'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.purchase_request_add_comment(bigint,text)'::regprocedure),
  'the exposed RPC respects the caller request RLS'
);
select ok(
  not has_function_privilege('anon', 'public.purchase_request_add_comment(bigint,text)', 'EXECUTE'),
  'anonymous clients cannot execute the RPC'
);

insert into public.companies (code, name, active)
values
  ('purchase-followup-own', 'Purchase Follow-up Own Company', true),
  ('purchase-followup-other', 'Purchase Follow-up Other Company', true);

create temporary table followup_users (id uuid, email text, display_name text, role_key text, company_code text);
insert into followup_users values
  ('7c000000-0000-0000-0000-000000000001', 'followup-admin@example.invalid', 'Admin Followup', 'admin', 'purchase-followup-own'),
  ('7c000000-0000-0000-0000-000000000002', 'followup-direction@example.invalid', 'Direction Followup', 'direction', 'purchase-followup-own'),
  ('7c000000-0000-0000-0000-000000000003', 'followup-armement@example.invalid', 'Armement Followup', 'armement', 'purchase-followup-own'),
  ('7c000000-0000-0000-0000-000000000004', 'followup-capitaine@example.invalid', 'Capitaine Followup', 'capitaine', 'purchase-followup-own'),
  ('7c000000-0000-0000-0000-000000000005', 'followup-marin@example.invalid', 'Marin Followup', 'marin', 'purchase-followup-own'),
  ('7c000000-0000-0000-0000-000000000006', 'followup-other@example.invalid', 'Other Admin Followup', 'admin', 'purchase-followup-other'),
  ('7c000000-0000-0000-0000-000000000007', 'followup-no-role@example.invalid', 'No Role Followup', null, 'purchase-followup-own'),
  ('7c000000-0000-0000-0000-000000000008', 'followup-inactive@example.invalid', 'Inactive Followup', 'marin', 'purchase-followup-own');

insert into auth.users (id, email) select id, email from followup_users;
insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from followup_users fixture
join public.companies company on company.code = fixture.company_code;
insert into public.user_roles (user_id, company_id, role_key)
select fixture.id, company.id, fixture.role_key
from followup_users fixture
join public.companies company on company.code = fixture.company_code
where fixture.role_key is not null;

-- The administrator is still authorized while another company is selected.
insert into public.company_memberships (company_id, user_id, active)
select id, '7c000000-0000-0000-0000-000000000001', true
from public.companies where code = 'purchase-followup-other';
update public.profiles
set active_company_id = (select id from public.companies where code = 'purchase-followup-other')
where id = '7c000000-0000-0000-0000-000000000001';
update public.company_memberships set active = false
where user_id = '7c000000-0000-0000-0000-000000000008';

insert into public.purchase_requests (
  company_id, request_number, title, status, approval_status, owner_name,
  expected_delivery_on, processing_comment, source_label, updated_at
)
select company.id, fixture.request_number, fixture.request_number,
       fixture.status, fixture.approval_status, 'Responsable existant',
       date '2026-10-15', 'Traitement existant', 'sharepoint', timestamptz '2026-10-01 08:00:00+00'
from (values
  ('FOLLOWUP-PENDING', 'À traiter', 'En attente', 'purchase-followup-own'),
  ('FOLLOWUP-REFUSED', 'À traiter', 'Demande refusée', 'purchase-followup-own'),
  ('FOLLOWUP-RECEIVED', 'Traitée', 'Demande acceptée', 'purchase-followup-own'),
  ('FOLLOWUP-OTHER', 'À traiter', 'En attente', 'purchase-followup-other')
) fixture(request_number, status, approval_status, company_code)
join public.companies company on company.code = fixture.company_code;

create temporary table followup_requests as
select * from public.purchase_requests where request_number like 'FOLLOWUP-%';
grant select on followup_requests to authenticated;

insert into public.purchase_request_events (
  company_id, purchase_request_id, event_type, status_label, actor_name, comment
)
select company_id, id, 'created', 'Demande créée', 'Auteur initial', 'Commentaire initial'
from followup_requests where request_number = 'FOLLOWUP-PENDING';

-- Even a malformed legacy company/request link must not leak another request.
insert into public.purchase_request_events (
  company_id, purchase_request_id, event_type, status_label, comment
)
select own_company.id, request.id, 'created', 'Lien incohérent', 'Invisible'
from followup_requests request
cross join public.companies own_company
where request.request_number = 'FOLLOWUP-OTHER' and own_company.code = 'purchase-followup-own';

set local role authenticated;
select set_config('request.jwt.claim.sub', '7c000000-0000-0000-0000-000000000001', true);

select isnt(
  public.current_planning_company_id(),
  (select company_id from followup_requests where request_number = 'FOLLOWUP-PENDING'),
  'the administrator has selected a different company'
);
select lives_ok(
  $$select public.purchase_request_add_comment(
    (select id from followup_requests where request_number = 'FOLLOWUP-PENDING'), E' \n Suivi initial\nSeconde ligne \t '
  )$$,
  'an administrator can add a follow-up to an accessible unapproved request'
);
select is(
  (select comment from public.purchase_request_events where event_type = 'comment_added'),
  E'Suivi initial\nSeconde ligne',
  'the server trims outer whitespace and preserves internal line breaks'
);
select is(
  (select actor_user_id from public.purchase_request_events where event_type = 'comment_added'),
  '7c000000-0000-0000-0000-000000000001'::uuid,
  'the author identity is the authenticated user'
);
select is(
  (select actor_name from public.purchase_request_events where event_type = 'comment_added'),
  'Admin Followup',
  'the author name comes from the server profile'
);
select is(
  (select status_label from public.purchase_request_events where event_type = 'comment_added'),
  'Commentaire de suivi',
  'follow-up comments have their own history label'
);
select ok(
  (select created_at between transaction_timestamp() and clock_timestamp()
   from public.purchase_request_events where event_type = 'comment_added'),
  'the event is timestamped at the server current instant'
);
select ok(
  (select effective_on is null from public.purchase_request_events where event_type = 'comment_added'),
  'a follow-up does not impersonate a dated workflow transition'
);
select is(
  (select count(*) from public.purchase_request_events where status_label = 'Lien incohérent'),
  0::bigint,
  'event RLS rejects a company/request mismatch'
);

select set_config('request.jwt.claim.sub', '7c000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.purchase_request_add_comment((select id from followup_requests where request_number = 'FOLLOWUP-PENDING'), 'Suivi Direction')$$,
  'a real Direction profile can comment'
);
select set_config('request.jwt.claim.sub', '7c000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$select public.purchase_request_add_comment((select id from followup_requests where request_number = 'FOLLOWUP-PENDING'), 'Suivi Armement')$$,
  'a real Armement profile can comment'
);
select set_config('request.jwt.claim.sub', '7c000000-0000-0000-0000-000000000004', true);
select lives_ok(
  $$select public.purchase_request_add_comment((select id from followup_requests where request_number = 'FOLLOWUP-PENDING'), 'Suivi Capitaine')$$,
  'a real Capitaine profile can comment'
);
select is(
  (select actor_user_id from public.purchase_request_events where comment = 'Suivi Capitaine'),
  '7c000000-0000-0000-0000-000000000004'::uuid,
  'Capitaine comments use their own account identity'
);
select set_config('request.jwt.claim.sub', '7c000000-0000-0000-0000-000000000005', true);
select lives_ok(
  $$select public.purchase_request_add_comment((select id from followup_requests where request_number = 'FOLLOWUP-PENDING'), 'Suivi Marin')$$,
  'a real Marin profile can comment'
);
select is(
  (select actor_user_id from public.purchase_request_events where comment = 'Suivi Marin'),
  '7c000000-0000-0000-0000-000000000005'::uuid,
  'Marin comments use their own account identity'
);
select is(
  (select count(*) from public.purchase_request_events
   where purchase_request_id = (select id from followup_requests where request_number = 'FOLLOWUP-PENDING')),
  6::bigint,
  'all five role comments remain alongside the original workflow event'
);
select ok(
  (select to_jsonb(request) = to_jsonb(snapshot)
   from public.purchase_requests request join followup_requests snapshot using (id)
   where request.request_number = 'FOLLOWUP-PENDING'),
  'comments do not mutate the request, approval, delivery, owner, or update timestamp'
);

select throws_ok(
  $$select public.purchase_request_add_comment((select id from followup_requests where request_number = 'FOLLOWUP-PENDING'), null)$$,
  '22023', 'Le commentaire est obligatoire.', 'a null comment is rejected'
);
select throws_ok(
  $$select public.purchase_request_add_comment((select id from followup_requests where request_number = 'FOLLOWUP-PENDING'), '')$$,
  '22023', 'Le commentaire est obligatoire.', 'an empty comment is rejected'
);
select throws_ok(
  $$select public.purchase_request_add_comment((select id from followup_requests where request_number = 'FOLLOWUP-PENDING'), E' \r\n\t ')$$,
  '22023', 'Le commentaire est obligatoire.', 'a whitespace-only comment is rejected'
);
select throws_ok(
  $$select public.purchase_request_add_comment((select id from followup_requests where request_number = 'FOLLOWUP-PENDING'), repeat('a', 4001))$$,
  '22023', 'Le commentaire ne peut pas dépasser 4 000 caractères.', 'comments exceeding the limit are rejected'
);
select lives_ok(
  $$select public.purchase_request_add_comment((select id from followup_requests where request_number = 'FOLLOWUP-PENDING'), ' ' || repeat('é', 4000) || ' ')$$,
  'exactly 4000 Unicode characters after trimming are accepted'
);
select lives_ok(
  $$select public.purchase_request_add_comment((select id from followup_requests where request_number = 'FOLLOWUP-REFUSED'), 'Suivi après refus')$$,
  'a refused request can retain follow-up comments'
);
select lives_ok(
  $$select public.purchase_request_add_comment((select id from followup_requests where request_number = 'FOLLOWUP-RECEIVED'), 'Suivi après réception')$$,
  'a received request can retain follow-up comments'
);
select ok(
  (select bool_and(to_jsonb(request) = to_jsonb(snapshot))
   from public.purchase_requests request join followup_requests snapshot using (id)),
  'follow-up on refused and received requests leaves all request fields intact'
);

select throws_ok(
  $$insert into public.purchase_request_events (
    company_id, purchase_request_id, event_type, actor_user_id, actor_name, comment, created_at
  ) select company_id, id, 'comment_added', '7c000000-0000-0000-0000-000000000001',
           'Auteur falsifié', 'Texte falsifié', timestamptz '2000-01-01 00:00:00+00'
    from followup_requests where request_number = 'FOLLOWUP-PENDING'$$,
  '42501', null, 'direct insertion cannot spoof author or timestamp'
);
select throws_ok(
  $$update public.purchase_request_events set comment = 'Historique réécrit' where comment = 'Suivi Marin'$$,
  '42501', null, 'an author cannot rewrite their history comment'
);
select throws_ok(
  $$delete from public.purchase_request_events where comment = 'Suivi Marin'$$,
  '42501', null, 'an author cannot delete their history comment'
);
select is(
  (select count(*) from public.purchase_request_events where comment = 'Suivi Marin'),
  1::bigint, 'denied mutation attempts preserve the original event'
);
select throws_ok(
  $$select public.purchase_request_add_comment((select id from followup_requests where request_number = 'FOLLOWUP-OTHER'), 'Autre entreprise')$$,
  'P0002', 'Demande introuvable ou inaccessible.', 'a Marin cannot comment in another company'
);
select throws_ok(
  $$select public.purchase_request_add_comment(-1000001, 'Demande absente')$$,
  'P0002', 'Demande introuvable ou inaccessible.', 'missing and inaccessible requests have the same error'
);

select set_config('request.jwt.claim.sub', '7c000000-0000-0000-0000-000000000006', true);
select throws_ok(
  $$select public.purchase_request_add_comment((select id from followup_requests where request_number = 'FOLLOWUP-PENDING'), 'Accès externe')$$,
  'P0002', 'Demande introuvable ou inaccessible.', 'an administrator from another company cannot comment'
);
select is(
  (select count(*) from public.purchase_request_events
   where purchase_request_id = (select id from followup_requests where request_number = 'FOLLOWUP-PENDING')),
  0::bigint, 'another company cannot read follow-up history'
);
select lives_ok(
  $$select public.purchase_request_add_comment((select id from followup_requests where request_number = 'FOLLOWUP-OTHER'), 'Suivi propre entreprise')$$,
  'the other company administrator can comment on their own request'
);

select set_config('request.jwt.claim.sub', '7c000000-0000-0000-0000-000000000007', true);
select throws_ok(
  $$select public.purchase_request_add_comment((select id from followup_requests where request_number = 'FOLLOWUP-PENDING'), 'Sans rôle')$$,
  'P0002', 'Demande introuvable ou inaccessible.', 'company membership without an allowed role is insufficient'
);
select is(
  (select count(*) from public.purchase_request_events), 0::bigint,
  'a member without an allowed role cannot read events'
);
select throws_ok(
  $$select purchase_request_private.add_comment((select id from followup_requests where request_number = 'FOLLOWUP-PENDING'), 'Contournement')$$,
  'P0002', 'Demande introuvable ou inaccessible.', 'the private writer independently enforces role authorization'
);
select set_config('request.jwt.claim.sub', '7c000000-0000-0000-0000-000000000008', true);
select throws_ok(
  $$select public.purchase_request_add_comment((select id from followup_requests where request_number = 'FOLLOWUP-PENDING'), 'Adhésion inactive')$$,
  'P0002', 'Demande introuvable ou inaccessible.', 'an inactive membership cannot comment even with a Marin role'
);
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select public.purchase_request_add_comment((select id from followup_requests where request_number = 'FOLLOWUP-PENDING'), 'Sans identité')$$,
  '42501', 'Authentification requise.', 'a missing authenticated identity is rejected'
);

reset role;
select is(
  (select count(*) from public.purchase_request_events where event_type = 'comment_added'
   and purchase_request_id in (select id from followup_requests)),
  9::bigint, 'only the nine authorized comment additions are persisted'
);
select is(
  (select comment from public.purchase_request_events where actor_name = 'Auteur initial'),
  'Commentaire initial', 'original workflow history is preserved'
);

select * from finish();
rollback;
