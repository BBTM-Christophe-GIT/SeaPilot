create table if not exists public.fleet_certificates (
  id bigint generated always as identity primary key,
  vessel_id bigint references public.vessels(id) on delete set null,
  vessel_sharepoint_item_id text,
  vessel_name text,
  category_key text not null default 'certificate',
  title text not null,
  status text not null default 'valid',
  issued_on date,
  expires_on date,
  source_label text not null default 'sharepoint',
  source_sharepoint_id text,
  file_url text,
  notes text,
  sharepoint_site_url text,
  sharepoint_list_id text,
  sharepoint_list_title text,
  sharepoint_item_id text,
  sharepoint_unique_id text,
  sharepoint_file_ref text,
  sharepoint_encoded_abs_url text,
  source_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fleet_certificates_status_check
    check (status in ('valid', 'renew_due', 'expired', 'missing', 'pending_validation'))
);

create index if not exists fleet_certificates_vessel_id_idx
  on public.fleet_certificates (vessel_id);

create index if not exists fleet_certificates_vessel_sharepoint_item_id_idx
  on public.fleet_certificates (vessel_sharepoint_item_id);

create index if not exists fleet_certificates_vessel_name_normalized_idx
  on public.fleet_certificates (public.normalize_import_label(vessel_name));

create index if not exists fleet_certificates_category_key_idx
  on public.fleet_certificates (category_key);

create index if not exists fleet_certificates_status_idx
  on public.fleet_certificates (status);

create index if not exists fleet_certificates_expires_on_idx
  on public.fleet_certificates (expires_on);

create index if not exists fleet_certificates_sharepoint_item_idx
  on public.fleet_certificates (sharepoint_list_id, sharepoint_item_id);

create unique index if not exists fleet_certificates_sharepoint_item_unique_idx
  on public.fleet_certificates (sharepoint_list_id, sharepoint_item_id);

insert into public.sharepoint_field_mappings (
  source_key,
  field_label,
  internal_name,
  data_type,
  target_table,
  target_column,
  required,
  notes
)
values
  ('library-certificats-flotte', 'Navire SharePoint ID', 'NavireId', 'Lookup', 'fleet_certificates', 'vessel_sharepoint_item_id', false, null),
  ('library-certificats-flotte', 'Navire', 'Navire', 'Lookup/Text', 'fleet_certificates', 'vessel_name', false, null),
  ('library-certificats-flotte', 'Nom fichier', 'FileLeafRef', 'Text', 'fleet_certificates', 'title', true, null),
  ('library-certificats-flotte', 'Date delivrance', 'DateDelivrance', 'DateTime', 'fleet_certificates', 'issued_on', false, null),
  ('library-certificats-flotte', 'Date echeance', 'DateEch_x00e9_ance', 'DateTime', 'fleet_certificates', 'expires_on', false, null),
  ('library-certificats-flotte', 'URL fichier', 'EncodedAbsUrl', 'Text/Url', 'fleet_certificates', 'file_url', false, null),
  ('library-certificats-flotte', 'Chemin fichier', 'FileRef', 'Text', 'fleet_certificates', 'notes', false, null)
on conflict (source_key, internal_name, target_table, target_column) do update
set field_label = excluded.field_label,
    data_type = excluded.data_type,
    required = excluded.required,
    notes = excluded.notes,
    updated_at = now();

create or replace function public.resolve_sharepoint_fleet_certificate_links()
returns table (
  target_table text,
  resolved_certificates integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resolved_count integer := 0;
begin
  update public.fleet_certificates certificate
  set vessel_id = vessel.id,
      updated_at = now()
  from public.vessels vessel
  where certificate.vessel_id is null
    and (
      (
        certificate.vessel_sharepoint_item_id is not null
        and vessel.sharepoint_item_id = certificate.vessel_sharepoint_item_id
      )
      or (
        public.normalize_import_label(certificate.vessel_name) is not null
        and (
          public.normalize_import_label(certificate.vessel_name) = public.normalize_import_label(vessel.name)
          or public.normalize_import_label(certificate.vessel_name) = public.normalize_import_label(vessel.acronym)
        )
      )
    );

  get diagnostics resolved_count = row_count;

  return query
  values ('fleet_certificates', resolved_count);
end;
$$;

revoke all on function public.resolve_sharepoint_fleet_certificate_links() from public;
grant execute on function public.resolve_sharepoint_fleet_certificate_links() to authenticated;

grant select, insert, update, delete on public.fleet_certificates to authenticated;
grant usage on public.fleet_certificates_id_seq to authenticated;

alter table public.fleet_certificates enable row level security;

drop policy if exists fleet_certificates_role_read on public.fleet_certificates;
create policy fleet_certificates_role_read on public.fleet_certificates
  for select to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin']));

drop policy if exists fleet_certificates_office_write on public.fleet_certificates;
create policy fleet_certificates_office_write on public.fleet_certificates
  for all to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement']))
  with check (public.has_any_role(array['admin', 'direction', 'armement']));
