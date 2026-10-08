-- Files are stored exclusively in the shared Google Drive folder; Supabase keeps metadata only.
-- The initial module has no uploaded files. Never discard a file if a transfer occurred meanwhile.
do $$ begin
  if exists(select 1 from public.chemical_attachments) or exists(select 1 from storage.objects where bucket_id='chemical-documents') then
    raise exception 'Existing chemical files must be transferred to Google Drive before this migration.';
  end if;
end $$;
drop policy chemical_attachments_read on public.chemical_attachments;
drop policy chemical_attachments_insert on public.chemical_attachments;
drop policy chemical_attachments_delete on public.chemical_attachments;
drop policy chemical_objects_read on storage.objects;
drop policy chemical_objects_insert on storage.objects;
drop policy chemical_objects_delete on storage.objects;
drop function public.chemical_storage_access(text);
-- This bucket was created by the preceding migration and is proven empty above.
set local storage.allow_delete_query = 'true';
delete from storage.buckets where id='chemical-documents' and not exists(select 1 from storage.objects where bucket_id='chemical-documents');
set local storage.allow_delete_query = 'false';
alter table public.chemical_attachments rename column storage_path to drive_path;
alter table public.chemical_attachments add column sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$');
alter table public.chemical_attachments add constraint chemical_attachment_drive_path_length check(length(drive_path)<=500);

create function public.chemical_drive_folder(target_product uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare p public.chemical_products%rowtype; vessel_name text;
begin
  select * into p from public.chemical_products where id=target_product and deleted_at is null;
  if not found or not public.chemical_has_access(p.company_id) then raise exception 'Accès refusé au produit.' using errcode='42501'; end if;
  select name into vessel_name from public.vessels where id=p.vessel_id and company_id=p.company_id;
  return left(btrim(regexp_replace(vessel_name,'[^a-zA-Z0-9 -]','-','g')),60) || ' - c' || p.company_id || '-v' || p.vessel_id || '/' || p.id;
end $$;
revoke all on function public.chemical_drive_folder(uuid) from public,anon;
grant execute on function public.chemical_drive_folder(uuid) to authenticated;

create policy chemical_attachments_read on public.chemical_attachments for select to authenticated
using(public.chemical_has_access(company_id) and exists(select 1 from public.chemical_products p where p.id=product_id and p.company_id=chemical_attachments.company_id and p.deleted_at is null));
create policy chemical_attachments_insert on public.chemical_attachments for insert to authenticated
with check(public.chemical_has_access(company_id)
  and exists(select 1 from public.chemical_products p where p.id=product_id and p.company_id=chemical_attachments.company_id and p.deleted_at is null)
  and drive_path like public.chemical_drive_folder(product_id) || '/' || id::text || '-%'
  and split_part(drive_path,'/',3) ~ '^[a-f0-9-]{36}-[a-zA-Z0-9_.-]+\.(pdf|png|jpg|jpeg|docx|xlsx|txt)$'
  and array_length(string_to_array(drive_path,'/'),1)=3);
create policy chemical_attachments_delete on public.chemical_attachments for delete to authenticated
using(public.chemical_has_access(company_id) and exists(select 1 from public.chemical_products p where p.id=product_id and p.company_id=chemical_attachments.company_id and p.deleted_at is null));

create function public.chemical_drive_scope(target_product uuid,target_attachment uuid default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare folder text; a public.chemical_attachments%rowtype;
begin
  folder:=public.chemical_drive_folder(target_product);
  if target_attachment is null then
    return jsonb_build_object('directory','Produits Chimiques','folder',folder);
  end if;
  select * into a from public.chemical_attachments where id=target_attachment and product_id=target_product;
  if not found then raise exception 'Pièce jointe inaccessible.' using errcode='42501'; end if;
  -- The original folder remains valid if a product is subsequently assigned to another vessel.
  return jsonb_build_object('directory','Produits Chimiques','folder',split_part(a.drive_path,'/',1)||'/'||split_part(a.drive_path,'/',2),
    'path',a.drive_path,'sha256',a.sha256,'bytes',a.size_bytes);
end $$;
revoke all on function public.chemical_drive_scope(uuid,uuid) from public,anon;
grant execute on function public.chemical_drive_scope(uuid,uuid) to authenticated;
comment on table public.chemical_attachments is 'Google Drive file references only. Files live under the shared SeaPilot/Produits Chimiques folder. Removing a reference preserves the original file on Drive.';
