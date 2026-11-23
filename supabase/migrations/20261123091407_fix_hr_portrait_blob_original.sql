-- Keep accepting historical Drive originals alongside verified private Blob uploads.
create or replace function public.validate_hr_portrait_reference()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.photo_storage_path is not distinct from old.photo_storage_path
      and new.photo_document_id is not distinct from old.photo_document_id then
      return new;
    end if;
  end if;

  if auth.uid() is not null and (not public.has_any_role(array['admin','direction','armement'])
    or new.company_id <> public.current_planning_company_id()) then
    raise exception 'Modification de la photo refusée.' using errcode = '42501';
  end if;

  if new.photo_storage_path is null then
    return new;
  end if;

  if new.photo_storage_path !~ ('^' || new.id::text || '/[a-f0-9-]{36}[.]jpg$')
    or not exists (
      select 1 from public.hr_documents d
      where d.id = new.photo_document_id and d.person_id = new.id and d.company_id = new.company_id
        and d.mime_type in ('image/png', 'image/jpeg')
        and (
          d.drive_path is not null
          or (
            d.storage_bucket = 'hr-documents'
            and d.storage_path ~ ('^people/' || new.id::text || '/[^/]+$')
            and exists (
              select 1 from public.document_blob_files f
              where f.source_bucket = d.storage_bucket and f.source_path = d.storage_path
                and f.active and f.mime_type = d.mime_type and f.bytes = d.file_size_bytes
            )
          )
        )
    )
    or not exists (
      select 1 from document_blob_private.objects() o
      where o.bucket_id = 'hr-portraits' and o.name = new.photo_storage_path
    ) then
    raise exception 'Référence de photo RH invalide.' using errcode = '23514';
  end if;

  return new;
end
$$;
