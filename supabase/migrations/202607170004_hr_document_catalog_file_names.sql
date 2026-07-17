-- Align the shared HR document catalog with the SharePoint Brevet list.
--
-- Verified sources on 2026-07-17:
--   * IQY list 8c8561d7-9fb4-420f-8290-b66309d07e92: 54 rows;
--   * production public.stcw_certificates: 54 active rows.
--
-- The SharePoint "Nom de Fichier" value is the authoritative short label used
-- by the legacy SPFx document naming workflow.

alter table public.stcw_certificates
  add column if not exists file_name text;

update public.stcw_certificates
set file_name = name,
    updated_at = now()
where source_list_id = '8c8561d7-9fb4-420f-8290-b66309d07e92'
  and nullif(trim(file_name), '') is null;

update public.stcw_certificates as certificate
set file_name = source.file_name,
    updated_at = now()
from (
  values
    (15, 'CRO'),
    (16, 'CGO'),
    (25, 'CFBS'),
    (26, 'CSS'),
    (27, 'ASN'),
    (28, 'CAEERS'),
    (29, 'CQALI'),
    (30, 'EM I'),
    (31, 'EM II'),
    (32, 'EM III'),
    (33, 'ECDIS'),
    (37, 'Visite Médicale'),
    (55, 'Induction THOMSEA')
) as source(source_item_id, file_name)
where certificate.source_list_id = '8c8561d7-9fb4-420f-8290-b66309d07e92'
  and certificate.source_item_id = source.source_item_id;

do $$
declare
  active_catalog_count integer;
begin
  select count(*)
  into active_catalog_count
  from public.stcw_certificates
  where source_list_id = '8c8561d7-9fb4-420f-8290-b66309d07e92'
    and active;

  if active_catalog_count <> 54 then
    raise exception 'Expected 54 active SharePoint document types, found %', active_catalog_count;
  end if;
end;
$$;

comment on column public.stcw_certificates.file_name is
  'Short file label from the SharePoint Brevet list, used for automatic HR document naming.';
