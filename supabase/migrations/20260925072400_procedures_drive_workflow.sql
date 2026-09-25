-- Sources and published PDFs live in distinct synchronized Drive directories.
-- Existing Storage publications remain readable during migration.
create or replace function public.procedure_drive_path_valid(value text, pdf_only boolean default false)
returns boolean language sql immutable set search_path = '' as $$
  select value is not null and length(value) between 1 and 500
    and value !~ '[\\<>:"|?*[:cntrl:]]'
    and value ~* case when pdf_only then '\.pdf$' else '\.(docx?|xlsx?|pptx?|odt|ods|odp|txt|pdf)$' end
    and not exists (
      select 1 from regexp_split_to_table(value, '/') part
      where part in ('', '.', '..') or part ~ '[. ]$'
        or part ~* '^(con|prn|aux|nul|com[1-9]|lpt[1-9])([.]|$)'
    );
$$;
revoke all on function public.procedure_drive_path_valid(text, boolean) from public, anon;
grant execute on function public.procedure_drive_path_valid(text, boolean) to authenticated;

alter table public.procedures drop constraint procedures_google_drive_link_check;
alter table public.procedures add constraint procedures_google_drive_link_check check (
  (source_google_drive_file_id is null and source_google_drive_path is null)
  or (public.procedure_drive_path_valid(source_google_drive_path)
    and (source_google_drive_file_id is null or source_google_drive_file_id ~ '^[a-zA-Z0-9_-]{10,200}$'))
);
create unique index procedures_drive_path_unique_idx on public.procedures(lower(source_google_drive_path))
  where source_google_drive_path is not null;

alter table public.published_procedures
  add column google_drive_path text,
  add column drive_sha256 text,
  add constraint published_procedures_drive_check check (
    (google_drive_path is null and drive_sha256 is null)
    or (public.procedure_drive_path_valid(google_drive_path, true)
      and google_drive_path not like '%/%'
      and drive_sha256 is not null and drive_sha256 ~ '^[a-f0-9]{64}$'
      and size_bytes is not null and size_bytes between 1 and 26214400
      and mime_type = 'application/pdf' and file_name = google_drive_path
      and storage_bucket is null and storage_path is null)
  );
create unique index published_procedures_drive_path_unique_idx on public.published_procedures(lower(google_drive_path))
  where google_drive_path is not null;

drop policy if exists published_procedures_role_read on public.published_procedures;
create policy published_procedures_role_read on public.published_procedures for select to authenticated using (
  public.has_any_role(array['admin','direction'])
  or (public.has_any_role(array['armement','capitaine','marin']) and status = 'published'
    and lower(coalesce(mime_type,'')) = 'application/pdf' and lower(coalesce(file_name,'')) like '%.pdf'
    and ((google_drive_path is not null and drive_sha256 is not null)
      or (storage_bucket = 'procedure-documents' and storage_path like 'published/%')))
);
drop policy if exists published_procedures_administration_write on public.published_procedures;
create policy published_procedures_administration_write on public.published_procedures for all to authenticated
  using (public.has_any_role(array['admin','direction'])) with check (
    public.has_any_role(array['admin','direction']) and status = 'published'
    and lower(coalesce(mime_type,'')) = 'application/pdf' and lower(coalesce(file_name,'')) like '%.pdf'
    and ((google_drive_path is not null and drive_sha256 is not null)
      or (storage_bucket = 'procedure-documents' and storage_path like 'published/%'))
  );

create or replace function public.procedure_drive_pdf_name(target_procedure public.procedures)
returns text language sql immutable set search_path = '' as $$
  select rtrim(left(regexp_replace(
    concat_ws(' ', nullif(btrim(target_procedure.theme),''), nullif(btrim(target_procedure.document_number),''),
      nullif(upper(btrim(coalesce(target_procedure.version_label,target_procedure.revision_label))),''))
      || ' - ' || btrim(target_procedure.title), '[\\<>:"/|?*[:cntrl:]]', '-', 'g'), 180), '. ') || '.pdf';
$$;
revoke all on function public.procedure_drive_pdf_name(public.procedures) from public, anon;
grant execute on function public.procedure_drive_pdf_name(public.procedures) to authenticated;

create or replace function public.procedure_drive_scope(target_action text, target_procedure bigint default null, target_publication bigint default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare source public.procedures; publication public.published_procedures;
begin
  if auth.uid() is null then raise exception 'Connexion SeaPilot requise' using errcode = '42501'; end if;
  if coalesce(target_publication,0) > 0 then
    if target_action <> 'read' or coalesce(target_procedure,0) > 0 then raise exception 'PDF en lecture seule' using errcode = '42501'; end if;
    select * into publication from public.published_procedures where id = target_publication and status = 'published'
      and google_drive_path is not null and mime_type = 'application/pdf';
    if not found then raise exception 'Publication inaccessible' using errcode = '42501'; end if;
    return jsonb_build_object('directory','Procedures PDF','path',publication.google_drive_path,'sha256',publication.drive_sha256,'bytes',publication.size_bytes);
  end if;
  if not public.has_any_role(array['admin','direction']) then raise exception 'Source reservee a Administration et Direction' using errcode = '42501'; end if;
  if target_action = 'write' and coalesce(target_procedure,0) = 0 then return jsonb_build_object('directory','Procedures'); end if;
  if target_action not in ('read','open','publish') then raise exception 'Operation non autorisee' using errcode = '42501'; end if;
  select * into source from public.procedures where id = target_procedure and source_google_drive_path is not null;
  if not found then raise exception 'Importez la source dans le dossier Procedures avant cette action' using errcode = '42501'; end if;
  return jsonb_build_object('directory','Procedures','path',source.source_google_drive_path,'pdfName',public.procedure_drive_pdf_name(source));
end;
$$;
revoke all on function public.procedure_drive_scope(text,bigint,bigint) from public, anon;
grant execute on function public.procedure_drive_scope(text,bigint,bigint) to authenticated;

-- Register the PDF and update the source lifecycle in one transaction. The
-- exact same receipt is retryable after an interrupted acknowledgement.
create or replace function public.publish_procedure_drive(target_procedure bigint, pdf_path text, pdf_bytes bigint, pdf_sha256 text)
returns public.published_procedures language plpgsql security invoker set search_path = '' as $$
declare source public.procedures; publication public.published_procedures; publication_date date := (now() at time zone 'Europe/Paris')::date;
begin
  if auth.uid() is null or not public.has_any_role(array['admin','direction']) then raise exception 'Publication non autorisee' using errcode = '42501'; end if;
  select * into source from public.procedures where id = target_procedure for update;
  if not found or source.source_google_drive_path is null then raise exception 'Source Drive introuvable'; end if;
  if pdf_path is null or pdf_path <> public.procedure_drive_pdf_name(source) or not public.procedure_drive_path_valid(pdf_path,true)
    or pdf_path like '%/%' or pdf_bytes is null or pdf_bytes not between 1 and 26214400
    or pdf_sha256 is null or pdf_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'Recu PDF invalide'; end if;
  select * into publication from public.published_procedures where lower(google_drive_path) = lower(pdf_path);
  if found then
    if publication.procedure_id <> source.id or publication.drive_sha256 <> pdf_sha256 or publication.size_bytes <> pdf_bytes then
      raise exception 'Cette version PDF existe deja. Changez la version du document.';
    end if;
    return publication;
  end if;
  insert into public.published_procedures (
    procedure_id, procedure_code, title, status, revision_label, published_on, source_label, notes,
    category_label, diffusion_on, description, regulatory_requirement, ism_chapter, vessel_name, project_name,
    document_number, restrictions, annual_review, theme, document_type, bridge_watch, version_label,
    file_name, mime_type, size_bytes, google_drive_path, drive_sha256, published_by
  ) values (
    source.id, source.procedure_code, pdf_path, 'published', source.revision_label, publication_date, 'seapilot', source.notes,
    source.category_label, publication_date, source.description, source.regulatory_requirement, source.ism_chapter, source.vessel_name, source.project_name,
    source.document_number, source.restrictions, source.annual_review, source.theme, source.document_type, source.bridge_watch, source.version_label,
    pdf_path, 'application/pdf', pdf_bytes, pdf_path, pdf_sha256, auth.uid()
  ) returning * into publication;
  update public.procedures set status = 'published', published_on = publication_date, diffusion_on = publication_date where id = source.id;
  return publication;
end;
$$;
revoke all on function public.publish_procedure_drive(bigint,text,bigint,text) from public, anon;
grant execute on function public.publish_procedure_drive(bigint,text,bigint,text) to authenticated;

comment on column public.procedures.source_google_drive_path is 'Private source path relative to SeaPilot/Procedures. The Google file ID is optional for newly synchronized files.';
comment on column public.published_procedures.google_drive_path is 'Read-only published PDF path relative to SeaPilot/Procedures PDF, never a source path.';
