-- DPR PDFs are generated in the browser on demand and must never be persisted.
-- Storage objects must be removed through the Storage API before this migration
-- is applied; deleting storage.objects through SQL would orphan the binaries.

begin;

delete from public.dpr_files where file_kind = 'pdf';
create or replace function public.dpr_reject_stored_pdf()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.file_kind = 'pdf' or new.bucket_name = 'dpr-pdfs' then
    raise exception 'DPR PDFs are generated on demand and must not be stored'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.dpr_reject_stored_pdf() from public, anon, authenticated;

drop trigger if exists dpr_files_reject_stored_pdf on public.dpr_files;
create trigger dpr_files_reject_stored_pdf
before insert or update of file_kind, bucket_name on public.dpr_files
for each row execute function public.dpr_reject_stored_pdf();

drop policy if exists dpr_storage_company_read on storage.objects;
create policy dpr_storage_company_read on storage.objects
for select to authenticated
using (
  bucket_id in ('dpr-photos', 'dpr-attachments')
  and exists (
    select 1
    from public.dpr_files file
    where file.bucket_name = storage.objects.bucket_id
      and file.object_path = storage.objects.name
      and file.file_kind in ('photo', 'attachment')
      and file.status = 'ready'
      and file.deleted_at is null
      and public.has_company_role(file.company_id, array['admin', 'direction', 'armement', 'capitaine', 'marin'])
  )
);

comment on function public.dpr_reject_stored_pdf() is
  'Database invariant: generated DPR PDFs are ephemeral browser artifacts and cannot be registered in dpr_files.';

comment on table public.dpr_files is
  'Private Storage metadata for DPR photos and attachments only. Generated DPR PDFs are never persisted.';

commit;
