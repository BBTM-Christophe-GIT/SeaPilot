-- Match browser Unicode normalization and reject incomplete Drive receipts even
-- when a nullable value would otherwise make a CHECK evaluate to UNKNOWN.
create or replace function public.procedure_drive_pdf_name(target_procedure public.procedures)
returns text language sql immutable set search_path = '' as $$
  select rtrim(left(regexp_replace(normalize(
    concat_ws(' ', nullif(btrim(target_procedure.theme),''), nullif(btrim(target_procedure.document_number),''),
      nullif(upper(btrim(coalesce(target_procedure.version_label,target_procedure.revision_label))),''))
      || ' - ' || btrim(target_procedure.title), NFC), '[\\<>:"/|?*[:cntrl:]]', '-', 'g'), 180), '. ') || '.pdf';
$$;

alter table public.published_procedures add constraint published_procedures_drive_metadata_required
check (google_drive_path is null or (mime_type is not null and file_name is not null));
