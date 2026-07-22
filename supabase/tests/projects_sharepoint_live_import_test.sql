begin;

select plan(31);

select has_table('public', 'towage_options', 'towage lookup table exists');
select has_column('public', 'clients', 'final_customer', 'final customer is typed');
select has_column('public', 'clients', 'is_broker', 'broker flag is typed');
select has_column('public', 'clients', 'contact_name', 'client contact is typed');
select has_column('public', 'clients', 'siret', 'SIRET is typed');
select has_column('public', 'clients', 'vat_number', 'VAT number is typed');
select has_column('public', 'clients', 'charterer_operation_location', 'charterer operation location is typed');
select has_column('public', 'clients', 'representative_name', 'client representative is typed');
select has_column('public', 'towage_options', 'source_payload', 'towage source payload is preserved');
select has_column('public', 'towage_options', 'company_id', 'towage lookup is tenant scoped');
select has_function('public', 'parse_sharepoint_numeric', array['text'], 'safe numeric parser exists');
select has_function('public', 'sync_sharepoint_project_contracts', array[]::text[], 'contract sync exists');

select is(
  (select list_id from public.sharepoint_sources where key = 'list-bbtm-projets'),
  '6abf8928-acfd-47ec-a848-29e4071249fc',
  'live project list id is registered'
);
select is(
  (select list_id from public.sharepoint_sources where key = 'list-bbtm-clients'),
  'eacbc0c3-1028-44bf-975b-ed50f762943d',
  'live client list id is registered'
);
select is(
  (select list_id from public.sharepoint_sources where key = 'list-remorque'),
  '585151b0-190c-4634-b534-74aac6cd8400',
  'live towage list id is registered'
);
select is(
  (select list_id from public.sharepoint_sources where key = 'library-documents-projets'),
  '7559dfae-5ab9-4616-bb63-97819c606365',
  'live project library list id is registered'
);
select is(
  (select list_id from public.sharepoint_sources where key = 'library-documents-contractuels'),
  '27475196-8f56-4c61-893f-cb49d17ddca5',
  'live contract library list id is registered'
);
select ok(
  (select drive_id like '%QFywFKhPc9dkTkf_%' from public.sharepoint_sources where key = 'library-documents-contractuels'),
  'live contract library drive id contains the verified segment'
);

select is(public.parse_sharepoint_numeric('14 500 EUR'), null::numeric, 'descriptive numbers are not coerced');
select is(public.parse_sharepoint_numeric('14500,50'), 14500.50::numeric, 'simple decimal text is parsed');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.towage_options'::regclass),
  'towage lookup has RLS enabled'
);
select ok(
  not has_table_privilege('authenticated', 'public.towage_options', 'INSERT'),
  'authenticated users cannot import towage rows directly'
);

insert into public.clients (
  name,
  source_label,
  sharepoint_list_id,
  sharepoint_item_id,
  source_payload
)
values (
  'SharePoint live client fixture',
  'sharepoint',
  'eacbc0c3-1028-44bf-975b-ed50f762943d',
  '600',
  '{"Title":"SharePoint live client fixture"}'::jsonb
);

insert into public.projects (
  title,
  project_code,
  client_sharepoint_item_id,
  contract_type,
  source_label,
  sharepoint_list_id,
  sharepoint_item_id,
  source_payload
)
values (
  'SharePoint live project fixture',
  'P990',
  '600',
  'BIMCO - SUPPLYTIME - Time Charter Party',
  'sharepoint',
  '6abf8928-acfd-47ec-a848-29e4071249fc',
  '700',
  '{
    "Title":"P990 - SharePoint live project fixture",
    "Loyerjournalier":"14500",
    "ForfaitMobilisation":"9000",
    "ForfaitD_x00e9_mobilisation":"8000",
    "_x0031_0_x002e_1_x002e_1nombrede":"10",
    "_x0031_0_x002e_1_x002e_2dur_x00e":"2",
    "_x0031_0_x002e_1_x002e_3unit_x00":"mois",
    "_x0032__x002e_Armateuretlieudeso":"BBTM - Le Rozel",
    "_x0032_0_x002e_Loyerdaffr_x00e8_":"Rates: 14 500 EUR",
    "_x0033_1_x002e_Taxes":"Owners taxes"
  }'::jsonb
);

select lives_ok(
  $$select * from public.resolve_sharepoint_project_links()$$,
  'database session can reconcile project lookups'
);
select ok(
  (select client_id is not null from public.projects where project_code = 'P990'),
  'project client lookup is resolved'
);
select is(
  (select client_name from public.projects where project_code = 'P990'),
  'SharePoint live client fixture',
  'resolved project keeps the client name snapshot'
);
select lives_ok(
  $$select public.sync_sharepoint_project_contracts()$$,
  'database session can sync typed project contracts'
);
select is(
  (select count(*)::integer from public.project_contracts contract join public.projects project on project.id = contract.project_id where project.project_code = 'P990'),
  1,
  'one contract is created for the project'
);
select is(
  (select contract.charter_hire from public.project_contracts contract join public.projects project on project.id = contract.project_id where project.project_code = 'P990'),
  14500.00::numeric,
  'charter hire is typed'
);
select is(
  (select contract.fee_currency from public.project_contracts contract join public.projects project on project.id = contract.project_id where project.project_code = 'P990'),
  'EUR',
  'fee currency is populated with imported fees'
);
select is(
  (select contract.supplytime_data ->> 'box31_taxes' from public.project_contracts contract join public.projects project on project.id = contract.project_id where project.project_code = 'P990'),
  'Owners taxes',
  'validated SUPPLYTIME free text is transferred'
);
select is(
  (select next_number from public.project_number_counters counter join public.companies company on company.id = counter.company_id where company.code = 'bbtm' and counter.prefix = 'P'),
  991,
  'project number floor advances above imported historical codes'
);

select * from finish();
rollback;
