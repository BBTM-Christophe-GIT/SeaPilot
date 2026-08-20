begin;

select plan(13);

select is(
  (select count(*)::integer from public.vessels where sharepoint_list_id = '543b9f00-aed2-489a-808a-7b64cc835a83'),
  14,
  'the complete non-empty BBTM - Flotte IQY snapshot is imported'
);

select is((select count(*)::integer from public.vessels where sharepoint_list_id = '543b9f00-aed2-489a-808a-7b64cc835a83' and asset_kind = 'vessel'), 12, 'twelve source entries are vessels');
select is((select count(*)::integer from public.vessels where sharepoint_list_id = '543b9f00-aed2-489a-808a-7b64cc835a83' and asset_kind = 'office'), 1, 'Armement - Cherbourg is the only office');
select is((select count(*)::integer from public.vessels where sharepoint_list_id = '543b9f00-aed2-489a-808a-7b64cc835a83' and asset_kind = 'quay'), 1, 'YARD - Le Havre is the only quay');

select is((select asset_kind from public.vessels where name = 'GOURY'), 'vessel', 'GOURY remains a vessel');
select is((select asset_kind from public.vessels where name = 'Armement - Cherbourg'), 'office', 'Armement - Cherbourg is classified as an office');
select is((select asset_kind from public.vessels where name = 'YARD - Le Havre'), 'quay', 'YARD - Le Havre is classified as a quay');
select is((select asset_kind from public.vessels where name = 'Bureau - LE HAVRE'), 'vessel', 'every other source label follows the requested vessel fallback');

select results_eq(
  $$ select registration_number, imo_number, registration_port, call_sign, mmsi, gross_tonnage, medical_dotation
     from public.vessels where name = 'GOURY' $$,
  $$ values ('934968'::text, '9213870'::text, 'MARSEILLE'::text, 'FLBU'::text, '361001000'::text, '293'::text,
             'Dotation médicale B - Médicaments (catégorie 2 - 200 miles)'::text) $$,
  'the IQY maritime fields are retained without flattening'
);

select results_eq(
  $$ select max_people, crew_members, medical_dotation from public.vessels where name = 'SUROIT' $$,
  $$ values (12, '3'::text, 'Dotation C restreinte'::text) $$,
  'the IQY capacity and medical fields are retained'
);

select ok(
  (select photo_url = '/vessels/goury.jpg' and built_year = 2001 and main_engine_power_kw = 750 and max_speed_knots = 12 from public.vessels where name = 'GOURY'),
  'the supplied GOURY brochure enriches the vessel characteristics and photo'
);

select is(
  (select bool_and(not staffing_decision_planning_enabled) from public.companies),
  true,
  'staffing decision checks are disabled for Planning'
);

select results_eq(
  $$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'fleet-media' $$,
  $$ values (false, 10485760::bigint, array['image/jpeg', 'image/png', 'image/webp']::text[]) $$,
  'vessel photos use the expected private constrained bucket'
);

select * from finish();
rollback;
