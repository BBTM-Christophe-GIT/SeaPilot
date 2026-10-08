-- Bind supporting documents to the physical equipment generation.
alter table public.lifting_item_certificates add column service_version integer;
update public.lifting_item_certificates c set service_version=i.service_version from public.lifting_inventory i where i.id=c.item_id;
alter table public.lifting_item_certificates alter column service_version set not null,
  add constraint lifting_certificate_service_version_positive check(service_version>0);
create index lifting_item_certificates_service_idx on public.lifting_item_certificates(item_id,service_version);

-- Legacy paths remain downloadable; new paths carry the generation explicitly.
create or replace function public.lifting_certificate_path_access(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and p_path ~ '^[0-9]+/[0-9]+/[0-9]+/([1-9][0-9]*/)?[0-9a-f-]+[.](pdf|jpg|png)$'
  and exists(select 1 from public.lifting_inventory i where i.id::text=split_part(p_path,'/',3)
    and i.company_id::text=split_part(p_path,'/',1) and i.vessel_id::text=split_part(p_path,'/',2)
    and public.lifting_can_access(i.company_id,i.vessel_id));
$$;
create function public.lifting_certificate_path_upload(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(public.lifting_certificate_path_access(p_path),false)
  and p_path ~ '^[0-9]+/[0-9]+/[0-9]+/[1-9][0-9]*/[0-9a-f-]+[.](pdf|jpg|png)$'
  and exists(select 1 from public.lifting_inventory i where i.id::text=split_part(p_path,'/',3)
    and (split_part(p_path,'/',4)=i.service_version::text or
      (split_part(p_path,'/',4)=(i.service_version+1)::text and public.has_any_role(array['admin','direction','armement']))));
$$;
revoke all on function public.lifting_certificate_path_upload(text) from public,anon;
grant execute on function public.lifting_certificate_path_upload(text) to authenticated;
alter policy lifting_certificate_files_add on storage.objects with check(bucket_id='lifting-certificates' and public.lifting_certificate_path_upload(name));

create or replace function public.add_lifting_item_certificate(p_item_id bigint,p_storage_path text,p_file_name text,p_mime_type text,p_file_size bigint) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; i public.lifting_inventory%rowtype;
begin
  if p_item_id is null or not coalesce(public.lifting_certificate_path_access(p_storage_path),false) or split_part(p_storage_path,'/',3)<>p_item_id::text then raise exception using errcode='42501',message='Accès refusé au certificat de ce matériel.'; end if;
  select * into i from public.lifting_inventory where id=p_item_id for update;
  if p_storage_path !~ ('^'||i.company_id||'/'||i.vessel_id||'/'||i.id||'/'||i.service_version||'/[0-9a-f-]+[.](pdf|jpg|png)$') then
    raise exception 'Ce matériel a été remplacé. Rechargez sa fiche avant d’ajouter un certificat.'; end if;
  if nullif(btrim(p_file_name),'') is null or length(p_file_name)>255 or p_mime_type not in ('application/pdf','image/jpeg','image/png') or p_file_size is null or p_file_size<=0 or p_file_size>20971520
    or not exists(select 1 from storage.objects where bucket_id='lifting-certificates' and name=p_storage_path and metadata->>'mimetype'=p_mime_type and (metadata->>'size')::bigint=p_file_size)
    then raise exception 'Joignez un PDF, JPG ou PNG de 20 Mo maximum.'; end if;
  insert into public.lifting_item_certificates(item_id,service_version,storage_path,file_name,mime_type,file_size,created_by)
    values(p_item_id,i.service_version,p_storage_path,btrim(p_file_name),p_mime_type,p_file_size,auth.uid())
    on conflict(storage_path) do nothing returning id into result;
  if result is null then select id into result from public.lifting_item_certificates where storage_path=p_storage_path and item_id=p_item_id; end if;
  return result;
end $$;
revoke all on function public.add_lifting_item_certificate(bigint,text,text,text,bigint) from public,anon;
grant execute on function public.add_lifting_item_certificate(bigint,text,text,text,bigint) to authenticated;

drop function public.replace_lifting_item(bigint,integer,date);
create function public.replace_lifting_item(p_id bigint,p_service_version integer,p_commissioned_on date,p_certificates jsonb default '[]') returns void
language plpgsql security definer set search_path='' as $$
declare i public.lifting_inventory%rowtype; attachment jsonb;
begin
  if auth.uid() is null or not public.has_any_role(array['admin','direction','armement']) then raise exception using errcode='42501',message='Accès refusé au remplacement.'; end if;
  select * into i from public.lifting_inventory where id=p_id and company_id=public.current_planning_company_id() for update;
  if i.id is null or not public.lifting_can_access(i.company_id,i.vessel_id) or not i.active then raise exception using errcode='42501',message='Matériel actif introuvable ou accès refusé.'; end if;
  if i.service_version is distinct from p_service_version then raise exception 'Ce matériel a déjà été remplacé. Rechargez son inventaire.'; end if;
  if p_commissioned_on is null or p_commissioned_on<i.commissioned_on or p_commissioned_on>(now() at time zone 'Europe/Paris')::date then raise exception 'Date de mise en service invalide.'; end if;
  if p_certificates is null or jsonb_typeof(p_certificates)<>'array' then raise exception 'Liste de certificats invalide.'; end if;
  if jsonb_array_length(p_certificates)=0 and exists(select 1 from public.lifting_item_certificates where item_id=i.id and service_version=i.service_version) then
    raise exception 'Joignez un nouveau certificat pour remplacer les pièces jointes existantes.'; end if;
  update public.lifting_inventory set commissioned_on=p_commissioned_on,replaced_on=p_commissioned_on,last_control_on=null,
    service_version=service_version+1,replacement_history=replacement_history||jsonb_build_array(jsonb_build_object(
      'replaced_at',clock_timestamp(),'replaced_by',auth.uid(),'previous_commissioned_on',i.commissioned_on,
      'previous_last_control_on',i.last_control_on,'previous_service_version',i.service_version,'new_commissioned_on',p_commissioned_on)),
    updated_at=clock_timestamp(),updated_by=auth.uid() where id=i.id;
  for attachment in select value from jsonb_array_elements(p_certificates) loop
    perform public.add_lifting_item_certificate(i.id,attachment->>'storage_path',attachment->>'file_name',attachment->>'mime_type',(attachment->>'file_size')::bigint);
  end loop;
end $$;
revoke all on function public.replace_lifting_item(bigint,integer,date,jsonb) from public,anon;
grant execute on function public.replace_lifting_item(bigint,integer,date,jsonb) to authenticated;
