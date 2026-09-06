begin;

select plan(22);

select has_function(
  'public', 'action_item_admin_update',
  array['bigint','text','bigint','text','text','timestamp with time zone','date','text','text','text','text','numeric','text'],
  'administrator factual correction uses a dedicated RPC'
);
select has_function(
  'public', 'action_type_catalog_admin_save',
  array['text','text','boolean','boolean','integer','text'],
  'event-type catalogue changes use a dedicated RPC'
);
select ok(
  not has_function_privilege('anon', 'public.action_item_admin_update(bigint,text,bigint,text,text,timestamptz,date,text,text,text,text,numeric,text)', 'EXECUTE'),
  'anonymous users cannot correct action sheets'
);
select ok(
  not has_table_privilege('authenticated', 'public.action_items', 'UPDATE'),
  'authenticated users still cannot bypass the action workflow with direct updates'
);
select ok(
  not has_table_privilege('authenticated', 'public.action_type_catalog', 'UPDATE'),
  'authenticated users cannot bypass the protected type catalogue RPC'
);

insert into auth.users (id, email)
values
  ('7c340000-0000-0000-0000-000000000001', 'action-admin@example.invalid'),
  ('7c340000-0000-0000-0000-000000000002', 'action-direction@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (values
  ('7c340000-0000-0000-0000-000000000001'::uuid, 'action-admin@example.invalid', 'Alice ADMIN'),
  ('7c340000-0000-0000-0000-000000000002'::uuid, 'action-direction@example.invalid', 'Diane DIRECTION')
) fixture(id, email, display_name)
cross join public.companies company where company.code = 'bbtm';

insert into public.company_memberships (company_id, user_id, active)
select company.id, fixture.user_id, true
from (values
  ('7c340000-0000-0000-0000-000000000001'::uuid),
  ('7c340000-0000-0000-0000-000000000002'::uuid)
) fixture(user_id)
cross join public.companies company where company.code = 'bbtm'
on conflict (company_id, user_id) do update set active = excluded.active;

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (values
  ('7c340000-0000-0000-0000-000000000001'::uuid, 'admin'),
  ('7c340000-0000-0000-0000-000000000002'::uuid, 'direction')
) fixture(user_id, role_key)
cross join public.companies company where company.code = 'bbtm';

insert into public.people (company_id, user_id, first_name, last_name, function_label, active)
select company.id, fixture.user_id, fixture.first_name, fixture.last_name, fixture.function_label, true
from (values
  ('7c340000-0000-0000-0000-000000000001'::uuid, 'Alice', 'ADMIN', 'Administrateur'),
  ('7c340000-0000-0000-0000-000000000002'::uuid, 'Diane', 'DIRECTION', 'Direction')
) fixture(user_id, first_name, last_name, function_label)
cross join public.companies company where company.code = 'bbtm';

insert into public.vessels (company_id, name, active)
select company.id, 'ACTION ADMIN TEST', true
from public.companies company where company.code = 'bbtm';

insert into public.action_items (
  company_id, vessel_id, vessel_name, category_key, action_type_key, action_type,
  title, status, opened_on, occurred_at, due_on, issuer_person_id, issuer_name,
  owner_name, workflow_status, approved_at, approved_by_person_id,
  description, corrective_action, realized_action, closed_on, source_label
)
select company.id, vessel.id, vessel.name, 'audit', 'audit_internal', 'Audit Interne - BBTM',
  'FICHE-ADMIN-A-CORRIGER', 'Ecart Non Soldé', '2026-09-01', '2026-09-01T08:00:00+02'::timestamptz,
  '2026-09-20', admin_person.id, 'Alice ADMIN', 'Équipage — ACTION ADMIN TEST', 'approved',
  '2026-09-01T10:00:00+02'::timestamptz, admin_person.id,
  'Description initiale', 'Action initiale', 'Traitement à préserver', null, 'seapilot'
from public.companies company
join public.vessels vessel on vessel.company_id = company.id and vessel.name = 'ACTION ADMIN TEST'
join public.people admin_person on admin_person.company_id = company.id and admin_person.user_id = '7c340000-0000-0000-0000-000000000001'
where company.code = 'bbtm';

select set_config('test.action_admin.id', (select id::text from public.action_items where title = 'FICHE-ADMIN-A-CORRIGER'), false);
select set_config('test.action_admin.approved_at', (select approved_at::text from public.action_items where id = current_setting('test.action_admin.id')::bigint), false);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '7c340000-0000-0000-0000-000000000002', true);

select throws_ok(
  format(
    'select public.action_item_admin_update(%s,%L,(select id from public.vessels where name=%L),%L,%L,now(),current_date + 30,%L,%L,%L,%L,0,%L)',
    current_setting('test.action_admin.id')::bigint, 'Altération Direction', 'ACTION ADMIN TEST',
    'audit_internal', 'Remarque', 'À quai', 'Beau temps', 'Description', 'Action', 'Tentative Direction'
  ),
  '42501', null,
  'Direction cannot correct a recorded action sheet'
);
select throws_ok(
  $$select public.action_type_catalog_admin_save('Audit Direction', 'audit', true, true, 40, 'audit_internal')$$,
  '42501', null,
  'Direction cannot edit the event-type catalogue'
);

select set_config('request.jwt.claim.sub', '7c340000-0000-0000-0000-000000000001', true);

select lives_ok(
  format(
    'select public.action_item_admin_update(%s,%L,(select id from public.vessels where name=%L),%L,%L,%L::timestamptz,%L::date,%L,%L,%L,%L,0,%L)',
    current_setting('test.action_admin.id')::bigint, 'FICHE-ADMIN-CORRIGEE', 'ACTION ADMIN TEST',
    'audit_internal', 'Non Conformité Mineure', '2026-09-02T09:15:00+02', '2026-10-01',
    'Navire à quai', 'Vent faible', 'Description corrigée', 'Action corrigée', 'Informations initiales incomplètes'
  ),
  'Administrator can correct factual action information'
);
select is((select title from public.action_items where id = current_setting('test.action_admin.id')::bigint), 'FICHE-ADMIN-CORRIGEE', 'the factual title is corrected');
select is((select due_on from public.action_items where id = current_setting('test.action_admin.id')::bigint), '2026-10-01'::date, 'the factual due date is corrected');
select is((select workflow_status from public.action_items where id = current_setting('test.action_admin.id')::bigint), 'approved', 'the workflow status is unchanged');
select is((select status from public.action_items where id = current_setting('test.action_admin.id')::bigint), 'Ecart Non Soldé', 'the business status is unchanged');
select is((select owner_name from public.action_items where id = current_setting('test.action_admin.id')::bigint), 'Équipage — ACTION ADMIN TEST', 'the assignee summary is unchanged');
select is((select realized_action from public.action_items where id = current_setting('test.action_admin.id')::bigint), 'Traitement à préserver', 'the treatment content is unchanged');
select is((select approved_at from public.action_items where id = current_setting('test.action_admin.id')::bigint), current_setting('test.action_admin.approved_at')::timestamptz, 'the approval timestamp is unchanged');
select is((select count(*) from public.action_item_correction_log where action_item_id = current_setting('test.action_admin.id')::bigint), 1::bigint, 'the correction is audited once');
select is((select reason from public.action_item_correction_log where action_item_id = current_setting('test.action_admin.id')::bigint), 'Informations initiales incomplètes', 'the correction reason is retained');

select lives_ok(
  $$select public.action_type_catalog_admin_save('Audit interne – BBTM', 'audit', true, true, 40, 'audit_internal')$$,
  'Administrator can rename an existing event type'
);
select is((select label from public.action_type_catalog where type_key = 'audit_internal' and company_id = public.current_planning_company_id()), 'Audit interne – BBTM', 'the stable type key keeps the new label');
select is((select hse_classification from public.action_type_catalog where type_key = 'audit_internal' and company_id = public.current_planning_company_id()), null, 'renaming does not create a KPI classification');

select lives_ok(
  $$select public.action_type_catalog_admin_save('Contrôle interne personnalisé', 'audit', true, true, 1000, null)$$,
  'Administrator can add a standard non-KPI type'
);
select ok(
  exists (
    select 1 from public.action_type_catalog
    where company_id = public.current_planning_company_id()
      and label = 'Contrôle interne personnalisé'
      and type_key like 'custom_%'
      and requires_deviation_type
      and hse_classification is null
      and not tracks_exposure_rate
  ),
  'new catalogue types receive a stable key and no implicit KPI mapping'
);

select * from finish();
rollback;
