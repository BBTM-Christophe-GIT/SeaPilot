-- Reorganize the SharePoint fleet reference as a mixed asset register and keep
-- staffing decisions scoped to each vessel. The Planning integration is kept
-- behind an explicit, disabled-by-default company switch.

alter table public.companies
  add column if not exists staffing_decision_planning_enabled boolean not null default false;

update public.companies
set staffing_decision_planning_enabled = false
where staffing_decision_planning_enabled is distinct from false;

alter table public.vessels
  add column if not exists asset_kind text not null default 'vessel',
  add column if not exists source_guid uuid,
  add column if not exists source_etag text,
  add column if not exists source_active_label text,
  add column if not exists source_fleet_exit_at timestamptz,
  add column if not exists photo_url text,
  add column if not exists photo_storage_bucket text,
  add column if not exists photo_storage_path text,
  add column if not exists brochure_subtitle text,
  add column if not exists brochure_summary text,
  add column if not exists brochure_operations text[] not null default '{}'::text[],
  add column if not exists built_year integer,
  add column if not exists classification_label text,
  add column if not exists navigation_category text,
  add column if not exists beam_overall_m numeric(8,2),
  add column if not exists lightship_tonnes numeric(10,2),
  add column if not exists deadweight_tonnes numeric(10,2),
  add column if not exists safe_manning integer,
  add column if not exists main_engine text,
  add column if not exists main_engine_power_kw integer,
  add column if not exists bow_thruster_power_kw integer,
  add column if not exists gensets text,
  add column if not exists max_speed_knots numeric(6,2),
  add column if not exists bollard_pull_tonnes numeric(8,2),
  add column if not exists fuel_capacity_m3 numeric(10,2),
  add column if not exists range_description text,
  add column if not exists deck_equipment text,
  add column if not exists electronics_communications text,
  add column if not exists accommodation text;

alter table public.vessels
  drop constraint if exists vessels_asset_kind_check;
alter table public.vessels
  add constraint vessels_asset_kind_check
  check (asset_kind in ('vessel', 'office', 'quay'));

alter table public.vessels
  drop constraint if exists vessels_built_year_check;
alter table public.vessels
  add constraint vessels_built_year_check
  check (built_year is null or built_year between 1800 and 2200);

alter table public.vessels
  drop constraint if exists vessels_photo_storage_check;
alter table public.vessels
  add constraint vessels_photo_storage_check
  check (
    (photo_storage_bucket is null and photo_storage_path is null)
    or (photo_storage_bucket = 'fleet-media' and length(trim(photo_storage_path)) > 0)
  );

create index if not exists vessels_company_asset_kind_idx
  on public.vessels (company_id, asset_kind, active, name);

-- Full, structured snapshot of the IQY target list
-- 543b9f00-aed2-489a-808a-7b64cc835a83. Active/archive state remains an
-- application decision; the source exit date and source active label are kept
-- separately so a refresh cannot silently undo an administrator's archive.
with source (
  item_id, title, fleet_exit_at, type_label, gross_tonnage, registration_number,
  imo_number, registration_port, call_sign, mmsi, max_people, crew_members,
  medical_dotation, active_label, unit_type_label, modified_at, source_guid, source_etag
) as (values
  (1, 'GOURY', null::timestamptz, 'Navire de charge', '293', '934968', '9213870', 'MARSEILLE', 'FLBU', '361001000', null::integer, null::text, 'Dotation médicale B - Médicaments (catégorie 2 - 200 miles)', 'GOURY', 'Navire', '2026-05-31T10:45:21Z'::timestamptz, '9c29663e-fe10-4560-b2cf-4bd228e38da5'::uuid, '33'),
  (2, 'LE ROZEL', null, 'Navire de charge', '61', '937905', null, 'MARSEILLE', 'FAJ4175', '228098070', 6, '4', null, 'LE ROZEL', 'Navire', '2026-05-31T10:45:26Z', '43a738bd-e77e-4391-8546-6b86a112d638', '37'),
  (3, 'KROKDUR', null, 'Navire de charge', '31.28', '578250', null, 'MARSEILLE', 'FS9987', '227008930', 8, '4', 'C Restreint', 'KROKDUR', 'Navire', '2026-05-31T10:45:29Z', 'fc69433e-3bed-4f61-aa6f-ce96142ee368', '35'),
  (4, 'SUROIT', null, 'Navire de charge', '95', '926637', null, 'MARSEILLE', 'FGG2153', '227779340', 12, '3', 'Dotation C restreinte', 'SUROIT', 'Navire', '2026-05-31T10:45:33Z', '57042fdb-261e-434d-908d-c1be4fc332c1', '34'),
  (5, 'HOLENN EUSA', null, 'Navire de charge', '2.19', '934046', null, 'BREST', 'FAF9250', '227906620', 5, '1', 'Dotation C restreinte', 'HOLENN EUSA', 'Navire', '2026-05-31T10:45:38Z', '09f7ad8e-499f-4a79-a9f5-33741841fd68', '16'),
  (6, 'HIRONDELLE DE LA MANCHE', null, 'Navire de charge', '13.7', '934425', null, 'LE HAVRE', 'FAE5307', '227485930', 6, '2', 'Dotation C restreinte', 'HIRONDELLE DE LA MANCHE', 'Navire', '2026-05-31T10:45:40Z', '16736dd7-509b-4139-8e71-4d9a72ef43af', '19'),
  (8, 'YARD - Le Havre', null, null, null, null, null, null, null, null, null, null, null, null, 'Yard', '2026-05-31T10:47:15Z', '94223751-316b-40e8-bca7-fb1b99d2a5b7', '4'),
  (10, 'BBTM 2710', null, 'Navire de charge', null, null, null, null, null, null, null, null, null, 'BBTM2710', 'Navire', '2026-05-31T10:45:44Z', '59de40b3-bfe0-489f-ab19-320b896c4963', '5'),
  (11, 'TAMARIS', '2025-12-31T23:00:00Z', null, null, null, null, null, null, null, null, null, null, null, 'Navire', '2026-05-31T10:45:59Z', '067bd271-b279-430a-97d7-94f49ffeb8b5', '4'),
  (12, 'ECREHOUEL', null, 'Navire de charge', null, null, null, null, null, null, null, null, null, null, 'Navire', '2026-05-31T10:45:56Z', 'c389ab1e-4a19-4a78-9576-f76d7557bd90', '3'),
  (13, 'LANDEMER', null, 'Navire de charge', '50.49', null, '9059262', null, 'MHIU8', null, null, null, null, null, 'Navire', '2026-05-31T10:46:03Z', 'b659ae5e-886e-44f9-a857-00e1564c121a', '13'),
  (14, 'BBTM TENDER 1', null, null, null, null, null, null, null, null, 4, null, null, null, 'Navire', '2026-05-31T10:46:10Z', '9b12f804-7521-4b82-91a7-a67de798e36c', '2'),
  (15, 'Armement - Cherbourg', null, null, null, null, null, null, null, null, null, null, null, null, 'Armement', '2026-05-31T10:46:51Z', 'a252cc04-0d84-4b6c-9233-e1d5b8feefee', '2'),
  (16, 'Bureau - LE HAVRE', null, null, null, null, null, null, null, null, null, null, null, null, 'Bureau', '2026-05-31T10:47:04Z', '442350ab-81a6-4d50-9eda-455c9dbe7324', '2')
)
insert into public.vessels (
  company_id, name, acronym, active, type_label, unit_type_label, fleet_exit_on,
  registration_number, imo_number, registration_port, call_sign, mmsi,
  gross_tonnage, max_people, crew_members, medical_dotation,
  sharepoint_site_url, sharepoint_list_id, sharepoint_list_title,
  sharepoint_item_id, sharepoint_unique_id, source_modified_at,
  source_guid, source_etag, source_active_label, source_fleet_exit_at,
  asset_kind
)
select company.id,
       source.title,
       null,
       source.fleet_exit_at is null,
       source.type_label,
       source.unit_type_label,
       source.fleet_exit_at::date,
       source.registration_number,
       source.imo_number,
       source.registration_port,
       source.call_sign,
       source.mmsi,
       source.gross_tonnage,
       source.max_people,
       source.crew_members,
       source.medical_dotation,
       'https://bbtm668.sharepoint.com/sites/QHSE',
       '543b9f00-aed2-489a-808a-7b64cc835a83',
       'BBTM - Flotte',
       source.item_id::text,
       source.source_guid::text,
       source.modified_at,
       source.source_guid,
       source.source_etag,
       source.active_label,
       source.fleet_exit_at,
       case
         when lower(trim(source.title)) = lower('Armement - Cherbourg') then 'office'
         when lower(trim(source.title)) = lower('YARD - Le Havre') then 'quay'
         else 'vessel'
       end
from source
join public.companies company on company.code = 'bbtm'
on conflict (sharepoint_list_id, sharepoint_item_id) do update
set name = excluded.name,
    type_label = excluded.type_label,
    gross_tonnage = excluded.gross_tonnage,
    registration_number = excluded.registration_number,
    imo_number = excluded.imo_number,
    registration_port = excluded.registration_port,
    call_sign = excluded.call_sign,
    mmsi = excluded.mmsi,
    max_people = excluded.max_people,
    crew_members = excluded.crew_members,
    medical_dotation = excluded.medical_dotation,
    unit_type_label = excluded.unit_type_label,
    sharepoint_site_url = excluded.sharepoint_site_url,
    sharepoint_list_title = excluded.sharepoint_list_title,
    sharepoint_unique_id = excluded.sharepoint_unique_id,
    source_modified_at = excluded.source_modified_at,
    source_guid = excluded.source_guid,
    source_etag = excluded.source_etag,
    source_active_label = excluded.source_active_label,
    source_fleet_exit_at = excluded.source_fleet_exit_at,
    asset_kind = excluded.asset_kind;

-- Classification deliberately follows the user's exact business rule; the
-- SharePoint unit label remains available as source metadata.
update public.vessels
set asset_kind = case
  when lower(trim(name)) = lower('Armement - Cherbourg') then 'office'
  when lower(trim(name)) = lower('YARD - Le Havre') then 'quay'
  else 'vessel'
end
where company_id = (select id from public.companies where code = 'bbtm');

-- GOURY characteristics are taken from the supplied 2024 BBTM brochure.
update public.vessels
set photo_url = '/vessels/goury.jpg',
    brochure_subtitle = 'Offshore Guard Vessel',
    brochure_summary = 'Navire polyvalent conçu pour la surveillance, l’assistance aux travaux offshore, le transfert de personnel et le soutien aux opérations maritimes.',
    brochure_operations = array['Standby & Guard Vessel', 'Transfert de personnel', 'Support plongée', 'Assistance offshore'],
    built_year = 2001,
    flag_state = coalesce(nullif(flag_state, ''), 'France'),
    classification_label = 'DNV',
    navigation_category = 'Catégorie 2 — jusqu’à 200 milles des côtes',
    length_overall = '30.62 m',
    beam_overall_m = 8.50,
    lightship_tonnes = 400,
    deadweight_tonnes = 100,
    safe_manning = 4,
    max_people = coalesce(max_people, 12),
    main_engine = 'CATERPILLAR C3512 B',
    main_engine_power_kw = 750,
    bow_thruster_power_kw = 75,
    gensets = '2 × 230 KVA + 1 × 180 KVA',
    max_speed_knots = 12,
    bollard_pull_tonnes = 12,
    fuel_capacity_m3 = 110,
    range_description = '4 semaines · 11 000 milles nautiques à 8 nœuds · Hs 5 m',
    deck_equipment = 'Treuil de remorquage, cabestan, grue de pont et zone de travail arrière.',
    electronics_communications = 'Équipements de navigation et de radiocommunication adaptés à la zone SMDSM.',
    accommodation = 'Capacité maximale de 12 personnes à bord.'
where lower(trim(name)) = 'goury'
  and company_id = (select id from public.companies where code = 'bbtm');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fleet-media', 'fleet-media', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fleet_media_company_read on storage.objects;
create policy fleet_media_company_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'fleet-media'
    and public.user_belongs_to_company(
      case when (storage.foldername(name))[1] ~ '^[0-9]+$' then ((storage.foldername(name))[1])::bigint end
    )
  );

drop policy if exists fleet_media_admin_insert on storage.objects;
create policy fleet_media_admin_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fleet-media'
    and public.has_company_role(
      case when (storage.foldername(name))[1] ~ '^[0-9]+$' then ((storage.foldername(name))[1])::bigint end,
      array['admin']
    )
  );

drop policy if exists fleet_media_admin_delete on storage.objects;
create policy fleet_media_admin_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'fleet-media'
    and public.has_company_role(
      case when (storage.foldername(name))[1] ~ '^[0-9]+$' then ((storage.foldername(name))[1])::bigint end,
      array['admin']
    )
  );

-- Server-side kill switch: old RPCs stay callable for future reactivation, but
-- they neither surface Planning alerts nor block publication while disabled.
create or replace function public.planning_staffing_alerts(p_starts_on date, p_ends_on date)
returns table (
  vessel_id bigint,
  watch_group text,
  work_date date,
  status jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
begin
  if target_company_id is null or p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on
    or not public.has_company_role(target_company_id, array['admin', 'direction', 'armement']) then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: alertes de décision d’effectif.';
  end if;
  if not coalesce((
    select company.staffing_decision_planning_enabled
    from public.companies company
    where company.id = target_company_id
  ), false) then
    return;
  end if;
  return query
  select scope.vessel_id, scope.watch_group, scope.work_date, board.status
  from (
    select distinct assignment.vessel_id, coalesce(nullif(trim(assignment.watch_group), ''), 'Affectation') as watch_group, day::date as work_date
    from public.planning_assignments assignment
    cross join lateral generate_series(
      greatest(assignment.starts_on, p_starts_on)::timestamp,
      least(assignment.ends_on, p_ends_on)::timestamp,
      interval '1 day'
    ) day
    where assignment.company_id = target_company_id
      and assignment.starts_on <= p_ends_on
      and assignment.ends_on >= p_starts_on
      and coalesce(assignment.confirmation_status, '') <> 'cancelled'
  ) scope
  cross join lateral (select public.planning_staffing_board_status(scope.vessel_id, scope.watch_group, scope.work_date) as status) board
  where coalesce((board.status->>'blocking_count')::integer, 0) > 0
     or coalesce((board.status->>'warning_count')::integer, 0) > 0
  order by scope.work_date, scope.vessel_id, scope.watch_group;
end;
$$;

create or replace function public.planning_staffing_release_has_blockers(target_company_id bigint)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  scope record;
  board_status jsonb;
begin
  if target_company_id is null or target_company_id is distinct from public.current_planning_company_id() then
    return true;
  end if;
  if not coalesce((
    select company.staffing_decision_planning_enabled
    from public.companies company
    where company.id = target_company_id
  ), false) then
    return false;
  end if;
  for scope in
    select distinct assignment.vessel_id, coalesce(nullif(trim(assignment.watch_group), ''), 'Affectation') as watch_group, day::date as work_date
    from public.planning_assignments assignment
    cross join lateral generate_series(
      greatest(assignment.starts_on, current_date)::timestamp,
      assignment.ends_on::timestamp,
      interval '1 day'
    ) day
    where assignment.company_id = target_company_id
      and assignment.ends_on >= current_date
      and coalesce(assignment.confirmation_status, '') <> 'cancelled'
  loop
    board_status := public.planning_staffing_board_status(scope.vessel_id, scope.watch_group, scope.work_date);
    if coalesce((board_status->>'blocking_count')::integer, 0) > 0 then return true; end if;
  end loop;
  return false;
end;
$$;

revoke all on function public.planning_staffing_alerts(date, date) from public, anon, authenticated;
revoke all on function public.planning_staffing_release_has_blockers(bigint) from public, anon, authenticated;
grant execute on function public.planning_staffing_alerts(date, date) to authenticated;

comment on column public.companies.staffing_decision_planning_enabled is
  'Feature switch for Planning staffing alerts and publication blockers. Disabled until the business workflow is reactivated.';
comment on column public.vessels.asset_kind is
  'Business classification of the mixed BBTM - Flotte source: vessel, office or quay.';
