-- File uploads and desktop conversions share the same publication triggers.
-- Keep this path atomic: a later source update failure must restore every
-- earlier publication and QHSE link removed by those triggers.
create function public.publish_procedure_uploaded_pdf(
  target_procedure bigint, pdf_storage_path text, pdf_file_name text, pdf_bytes bigint, expected_source jsonb)
returns public.published_procedures
language plpgsql security invoker set search_path='' as $$
declare
  source public.procedures;
  publication public.published_procedures;
  verified boolean := false;
  publication_date date := (now() at time zone 'Europe/Paris')::date;
begin
  if auth.uid() is null or not public.has_any_role(array['admin','direction']) then
    raise exception 'Publication non autorisée.' using errcode='42501';
  end if;
  select * into source from public.procedures where id=target_procedure for update;
  if not found then
    raise exception 'Source inaccessible.' using errcode='42501';
  end if;
  if expected_source is distinct from jsonb_build_object(
    'theme',coalesce(source.theme,''),'document_number',coalesce(source.document_number,''),
    'version_label',coalesce(source.version_label,''),'revision_label',coalesce(source.revision_label,'')) then
    raise exception 'La référence ou la version source a changé. Rechargez la procédure avant de publier.' using errcode='40001';
  end if;
  if pdf_storage_path is null or length(pdf_storage_path) > 2000
    or left(pdf_storage_path,length('published/'||source.id||'/')) <> 'published/'||source.id||'/'
    or substring(pdf_storage_path from length('published/'||source.id||'/')+1) !~* '^[^/\\[:cntrl:]]+[.]pdf$'
    or pdf_file_name is null or length(pdf_file_name) not between 5 and 255
    or pdf_file_name !~* '^[^/\\[:cntrl:]]+[.]pdf$'
    or pdf_bytes is null or pdf_bytes not between 1 and 104857600 then
    raise exception 'Fichier PDF invalide.' using errcode='22023';
  end if;

  -- The new row enables the existing read policies for its uploaded object.
  -- It remains invisible to concurrent sessions until all checks commit.
  insert into public.published_procedures(
    procedure_id,procedure_code,title,status,revision_label,published_on,source_label,notes,tags,
    category_label,diffusion_on,description,regulatory_requirement,ism_chapter,vessel_name,project_name,
    document_number,restrictions,annual_review,theme,document_type,bridge_watch,version_label,
    storage_bucket,storage_path,file_name,mime_type,size_bytes)
  values(source.id,source.procedure_code,pdf_file_name,'published',source.revision_label,
    publication_date,'seapilot',source.notes,source.tags,source.category_label,publication_date,
    source.description,source.regulatory_requirement,source.ism_chapter,source.vessel_name,source.project_name,
    source.document_number,source.restrictions,source.annual_review,source.theme,source.document_type,
    source.bridge_watch,coalesce(source.version_label,source.revision_label),
    'procedure-documents',pdf_storage_path,pdf_file_name,'application/pdf',pdf_bytes)
  returning * into publication;

  -- An inactive or denied mapping must never revive an old Storage copy.
  if document_blob_private.has_mapping('procedure-documents',pdf_storage_path) then
    select exists(select 1 from public.document_blob_files f
      where f.source_bucket='procedure-documents' and f.source_path=pdf_storage_path and f.active
        and f.file_name=pdf_file_name and f.mime_type='application/pdf' and f.bytes=pdf_bytes)
      into verified;
  elsif document_drive_private.has_mapping('procedure-documents',pdf_storage_path) then
    select exists(select 1 from public.document_drive_files f
      where f.source_bucket='procedure-documents' and f.source_path=pdf_storage_path and f.active
        and f.file_name=pdf_file_name and f.mime_type='application/pdf' and f.bytes=pdf_bytes)
      into verified;
  else
    select exists(select 1 from storage.objects o
      where o.bucket_id='procedure-documents' and o.name=pdf_storage_path
        and lower(o.metadata->>'mimetype')='application/pdf'
        and o.metadata->>'size'=pdf_bytes::text)
      into verified;
  end if;
  if not verified then
    raise exception 'Vérifiez le PDF téléversé avant de le publier.' using errcode='55000';
  end if;
  update public.procedures set status='published',published_on=publication_date,diffusion_on=publication_date
    where id=source.id;
  if not found then
    raise exception 'La source n’a pas pu être publiée.' using errcode='42501';
  end if;
  return publication;
end;
$$;
revoke all on function public.publish_procedure_uploaded_pdf(bigint,text,text,bigint,jsonb) from public,anon;
grant execute on function public.publish_procedure_uploaded_pdf(bigint,text,text,bigint,jsonb) to authenticated;
