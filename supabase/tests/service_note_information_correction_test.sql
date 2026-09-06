begin;

select plan(19);

select has_function(
  'public',
  'update_service_note_information',
  array['bigint', 'text', 'text', 'date', 'text'],
  'the temporary information-correction RPC exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.update_service_note_information(bigint,text,text,date,text)',
    'execute'
  ),
  'authenticated clients can invoke the protected RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.update_service_note_information(bigint,text,text,date,text)',
    'execute'
  ),
  'anonymous clients cannot invoke the RPC'
);

insert into auth.users (id, email)
values
  ('75000000-0000-0000-0000-000000000101', 'service-note-editor@example.invalid'),
  ('75000000-0000-0000-0000-000000000102', 'service-note-reader@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (values
  ('75000000-0000-0000-0000-000000000101'::uuid, 'service-note-editor@example.invalid', 'Diane Direction'),
  ('75000000-0000-0000-0000-000000000102'::uuid, 'service-note-reader@example.invalid', 'Marc Marin')
) fixture(id, email, display_name)
cross join public.companies company
where company.code = 'bbtm';

insert into public.company_memberships (company_id, user_id, active)
select company.id, fixture.user_id, true
from (values
  ('75000000-0000-0000-0000-000000000101'::uuid),
  ('75000000-0000-0000-0000-000000000102'::uuid)
) fixture(user_id)
cross join public.companies company
where company.code = 'bbtm'
on conflict (company_id, user_id) do update set active = true;

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (values
  ('75000000-0000-0000-0000-000000000101'::uuid, 'direction'),
  ('75000000-0000-0000-0000-000000000102'::uuid, 'marin')
) fixture(user_id, role_key)
cross join public.companies company
where company.code = 'bbtm';

insert into public.people (company_id, user_id, first_name, last_name, function_label, hired_on, active)
select company.id, fixture.user_id, fixture.first_name, fixture.last_name, fixture.function_label, current_date - 365, true
from (values
  ('75000000-0000-0000-0000-000000000101'::uuid, 'Diane', 'DIRECTION', 'Direction'),
  ('75000000-0000-0000-0000-000000000102'::uuid, 'Marc', 'MARIN', 'Matelot')
) fixture(user_id, first_name, last_name, function_label)
cross join public.companies company
where company.code = 'bbtm';

insert into public.qhse_service_notes (
  company_id, chronology_code, subject, body, scope, status, author_person_id,
  author_identity_snapshot, author_signature_snapshot, authored_on, published_at,
  published_by, created_by
)
select
  company.id, 'NS CORRECTION TEST', 'Objet incomplet', 'Contenu incomplet',
  'all_accounts', 'published', editor.id,
  jsonb_build_object('display_name', 'Émetteur incomplet', 'person_id', editor.id),
  jsonb_build_object('signature_id', 123),
  current_date - 10, current_timestamp - interval '10 days', editor.user_id, editor.user_id
from public.companies company
join public.people editor
  on editor.company_id = company.id
 and editor.user_id = '75000000-0000-0000-0000-000000000101'
where company.code = 'bbtm';

select set_config(
  'test.service_note_correction.id',
  (select id::text from public.qhse_service_notes where chronology_code = 'NS CORRECTION TEST'),
  false
);
select set_config(
  'test.service_note_correction.published_at',
  (select published_at::text from public.qhse_service_notes where id = current_setting('test.service_note_correction.id')::bigint),
  false
);

insert into public.qhse_service_note_recipients (
  company_id, note_id, user_id, person_id,
  first_name_snapshot, last_name_snapshot, function_snapshot
)
select note.company_id, note.id, person.user_id, person.id,
       person.first_name, person.last_name, person.function_label
from public.qhse_service_notes note
join public.people person
  on person.company_id = note.company_id
 and person.user_id = '75000000-0000-0000-0000-000000000102'
where note.id = current_setting('test.service_note_correction.id')::bigint;

insert into public.qhse_service_note_signatures (
  company_id, note_id, recipient_id, user_id, person_id, identity_snapshot,
  signature_version_id, signature_snapshot, signed_at, read_confirmed, signature_kind
)
select recipient.company_id, recipient.note_id, recipient.id, recipient.user_id, recipient.person_id,
       jsonb_build_object('display_name', 'Marc MARIN'), null, null, null, true, 'historical_assumed'
from public.qhse_service_note_recipients recipient
where recipient.note_id = current_setting('test.service_note_correction.id')::bigint;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '75000000-0000-0000-0000-000000000101', true);

update public.qhse_service_notes
set subject = 'Tentative directe'
where id = current_setting('test.service_note_correction.id')::bigint;
select is(
  (select subject from public.qhse_service_notes where id = current_setting('test.service_note_correction.id')::bigint),
  'Objet incomplet',
  'direct table updates still cannot bypass the protected workflow'
);

select lives_ok(
  format(
    'select public.update_service_note_information(%s, %L, %L, %L::date, %L)',
    current_setting('test.service_note_correction.id')::bigint,
    'Objet complété',
    '<p>Contenu complété sans rediffusion.</p>',
    current_date - 5,
    'Élodie ÉMETTRICE'
  ),
  'Direction can correct information on an already-published note'
);
select is((select subject from public.qhse_service_notes where id = current_setting('test.service_note_correction.id')::bigint), 'Objet complété', 'the subject is updated');
select is((select body from public.qhse_service_notes where id = current_setting('test.service_note_correction.id')::bigint), '<p>Contenu complété sans rediffusion.</p>', 'the body is updated');
select is((select authored_on from public.qhse_service_notes where id = current_setting('test.service_note_correction.id')::bigint), current_date - 5, 'the document date is updated');
select is((select author_identity_snapshot->>'display_name' from public.qhse_service_notes where id = current_setting('test.service_note_correction.id')::bigint), 'Élodie ÉMETTRICE', 'the displayed issuer is updated');
select is((select status from public.qhse_service_notes where id = current_setting('test.service_note_correction.id')::bigint), 'published', 'the published status is unchanged');
select is((select chronology_code from public.qhse_service_notes where id = current_setting('test.service_note_correction.id')::bigint), 'NS CORRECTION TEST', 'the chronology is unchanged');
select is((select published_at from public.qhse_service_notes where id = current_setting('test.service_note_correction.id')::bigint), current_setting('test.service_note_correction.published_at')::timestamptz, 'the publication timestamp is unchanged');
select is((select published_by from public.qhse_service_notes where id = current_setting('test.service_note_correction.id')::bigint), '75000000-0000-0000-0000-000000000101'::uuid, 'the publication actor is unchanged');
select is((select scope from public.qhse_service_notes where id = current_setting('test.service_note_correction.id')::bigint), 'all_accounts', 'the audience scope is unchanged');
select is((select count(*)::integer from public.qhse_service_note_recipients where note_id = current_setting('test.service_note_correction.id')::bigint), 1, 'the recipient register is unchanged');
select is((select count(*)::integer from public.qhse_service_note_signatures where note_id = current_setting('test.service_note_correction.id')::bigint), 1, 'the signature register is unchanged');
select is((select author_identity_snapshot->>'person_id' from public.qhse_service_notes where id = current_setting('test.service_note_correction.id')::bigint), (select author_person_id::text from public.qhse_service_notes where id = current_setting('test.service_note_correction.id')::bigint), 'the issuer account identity remains unchanged');

select set_config('request.jwt.claim.sub', '75000000-0000-0000-0000-000000000102', true);
select throws_ok(
  format(
    'select public.update_service_note_information(%s, %L, %L, current_date, %L)',
    current_setting('test.service_note_correction.id')::bigint,
    'Altération Marin',
    '<p>Altération</p>',
    'Marc MARIN'
  ),
  '42501',
  'SERVICE_NOTE_INFORMATION_UPDATE_FORBIDDEN.',
  'a Marin cannot correct a service note'
);
select is((select subject from public.qhse_service_notes where id = current_setting('test.service_note_correction.id')::bigint), 'Objet complété', 'the forbidden attempt changes nothing');

select * from finish();
rollback;
