-- Equipment identity, annual lifecycle and permissions are enforced server-side.
create table public.lifting_inspector_grants (
  company_id bigint not null references public.companies(id),
  user_id uuid not null references auth.users(id), primary key(company_id,user_id)
);
alter table public.lifting_inspector_grants enable row level security;
create index lifting_inspector_grants_user_idx on public.lifting_inspector_grants(user_id);
revoke all on public.lifting_inspector_grants from public,anon,authenticated;
create policy lifting_inspector_grants_private on public.lifting_inspector_grants for all to authenticated using(false) with check(false);
insert into public.lifting_inspector_grants(company_id,user_id)
  select m.company_id,u.id from auth.users u join public.company_memberships m on m.user_id=u.id and m.active
  join public.companies c on c.id=m.company_id and c.code='bbtm' where lower(u.email)='antoine@bbtm.fr';
create function public.lifting_can_start_inspection() returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (
    public.has_any_role(array['admin','direction','armement']) or
    (public.has_any_role(array['capitaine']) and exists(select 1 from public.lifting_inspector_grants
      where user_id=auth.uid() and company_id=public.current_planning_company_id()))
  );
$$;
revoke all on function public.lifting_can_start_inspection() from public,anon;
grant execute on function public.lifting_can_start_inspection() to authenticated;

alter table public.lifting_inventory
  add column added_on date not null default ((now() at time zone 'Europe/Paris')::date),
  add column commissioned_on date not null default ((now() at time zone 'Europe/Paris')::date),
  add column last_control_on date,
  add column replaced_on date,
  add column service_version integer not null default 1 check(service_version>0),
  add column replacement_history jsonb not null default '[]' check(jsonb_typeof(replacement_history)='array');
update public.lifting_inventory i set
  added_on=(created_at at time zone 'Europe/Paris')::date,
  commissioned_on=coalesce(nullif(source_data->>'commissioned_on','')::date,(created_at at time zone 'Europe/Paris')::date),
  last_control_on=greatest(nullif(source_data->>'last_inspected_on','')::date,
    (select max(r.issued_on) from public.lifting_inspection_entries e join public.lifting_inspections r on r.id=e.inspection_id
     where e.item_id=i.id and r.status='published' and e.condition not in ('pending','not_present')));
alter table public.lifting_inventory add column inspection_due_on date generated always as
  ((coalesce(last_control_on,replaced_on,added_on)+interval '1 year')::date) stored;

-- Avoid transient uniqueness conflicts; abort on an ambiguous destination identity.
do $$ begin
  if exists(select 1 from public.lifting_inventory group by company_id,vessel_id,kind,coalesce(nullif(legacy_reference,''),reference) having count(*)>1)
    then raise exception 'Identifiants de matériel ambigus : rapprochement requis.'; end if;
end $$;
update public.lifting_inventory set reference='__identity_'||id where legacy_reference<>'';
update public.lifting_inventory set reference=legacy_reference where legacy_reference<>'';
insert into public.lifting_inventory_counters(company_id,vessel_id,kind,last_number)
  select company_id,vessel_id,kind,max(reference::bigint) from public.lifting_inventory where reference ~ '^[0-9]+$' group by 1,2,3
  on conflict(company_id,vessel_id,kind) do update set last_number=greatest(public.lifting_inventory_counters.last_number,excluded.last_number);
update public.lifting_inspection_entries e set item_snapshot=e.item_snapshot||jsonb_build_object('reference',i.reference,'service_version',i.service_version)
  from public.lifting_inventory i, public.lifting_inspections r where e.item_id=i.id and e.inspection_id=r.id and r.status='draft';
update public.lifting_inspections set revision=revision+1 where status='draft';

create or replace function public.save_lifting_item(p_vessel_id bigint,p_kind text,p_item jsonb,p_id bigint default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare c bigint:=public.current_planning_company_id(); result_id bigint; code text; next_number bigint; old public.lifting_inventory%rowtype;
begin
  if auth.uid() is null or not coalesce(public.lifting_can_access(c,p_vessel_id),false) or (p_id is not null and not public.has_any_role(array['admin','direction','armement'])) or not exists(
    select 1 from public.vessels where id=p_vessel_id and company_id=c and active and asset_kind in ('vessel','quay')
  ) then raise exception using errcode='42501',message='Accès refusé à cet inventaire.'; end if;
  code:=public.lifting_accessory_code(p_item->>'material_type');
  if code is null then raise exception 'Choisissez un type d’accessoire de la liste.'; end if;
  if p_kind is null or p_kind not in ('lifting','towing') or (p_kind='towing')<>(code='TL') then
    raise exception using errcode='23514',message='Les remorques doivent être enregistrées dans le registre Remorques.'; end if;
  if code='TL' and coalesce(p_item->>'towing_type','') not in ('chain_bridle','textile_line','towing_wire','winch_wire','textile_bridle') then raise exception 'Choisissez le type de remorque.'; end if;
  if p_id is not null then
    select * into old from public.lifting_inventory where id=p_id and company_id=c and vessel_id=p_vessel_id for update;
    if old.id is null then raise exception 'Matériel introuvable.'; end if;
  end if;
  if p_id is null or old.kind<>p_kind then
    insert into public.lifting_inventory_counters(company_id,vessel_id,kind,last_number) values(c,p_vessel_id,p_kind,1)
      on conflict(company_id,vessel_id,kind) do update set last_number=public.lifting_inventory_counters.last_number+1 returning last_number into next_number;
  end if;
  if p_id is null and nullif(p_item->>'commissioned_on','')::date > (now() at time zone 'Europe/Paris')::date then raise exception 'La mise en service ne peut pas être future.'; end if;
  if p_id is null then
    insert into public.lifting_inventory(company_id,vessel_id,kind,reference,material_type,towing_type,description,swl_tonnes,serial_number,location,notes,commissioned_on,created_by,updated_by)
    values(c,p_vessel_id,p_kind,next_number::text,public.lifting_accessory_label(code),case when code='TL' then p_item->>'towing_type' end,btrim(p_item->>'description'),
      nullif(p_item->>'swl_tonnes','')::numeric,coalesce(p_item->>'serial_number',''),coalesce(p_item->>'location',''),coalesce(p_item->>'notes',''),coalesce(nullif(p_item->>'commissioned_on','')::date,(now() at time zone 'Europe/Paris')::date),auth.uid(),auth.uid()) returning id into result_id;
  else
    update public.lifting_inventory set kind=p_kind,reference=coalesce(next_number::text,old.reference),
      legacy_reference=case when old.kind<>p_kind and old.legacy_reference='' then old.reference else old.legacy_reference end,
      material_type=public.lifting_accessory_label(code),towing_type=case when code='TL' then p_item->>'towing_type' end,description=btrim(p_item->>'description'),
      swl_tonnes=nullif(p_item->>'swl_tonnes','')::numeric,serial_number=coalesce(p_item->>'serial_number',''),location=coalesce(p_item->>'location',''),notes=coalesce(p_item->>'notes',''),
      updated_by=auth.uid(),updated_at=clock_timestamp() where id=old.id returning id into result_id;
  end if;
  return result_id;
end $$;


create or replace function public.start_lifting_inspection(p_vessel_id bigint,p_kind text,p_issued_on date,p_expires_on date) returns bigint
language plpgsql security definer set search_path='' as $$
declare v public.vessels%rowtype; result_id bigint;
begin
  if not coalesce(public.lifting_can_start_inspection(),false) then raise exception using errcode='42501',message='La création des contrôles est réservée aux profils de gestion et au vérificateur autorisé.'; end if;
  select * into v from public.vessels where id=p_vessel_id and active and asset_kind in ('vessel','quay');
  if auth.uid() is null or v.id is null or not public.lifting_can_access(v.company_id,v.id) then raise exception using errcode='42501',message='Accès refusé à ce navire.'; end if;
  if p_issued_on is null or p_expires_on is null or p_expires_on<=p_issued_on then raise exception 'Dates du contrôle invalides.'; end if;
  if not exists(select 1 from public.lifting_inventory where vessel_id=v.id and kind=p_kind and active) then raise exception 'Ajoutez du matériel avant de démarrer un contrôle.'; end if;
  insert into public.lifting_inspections(company_id,vessel_id,kind,inspection_year,issued_on,expires_on,vessel_snapshot,created_by)
    values(v.company_id,v.id,p_kind,extract(year from p_issued_on),p_issued_on,p_expires_on,
      jsonb_build_object('id',v.id,'company_id',v.company_id,'name',v.name,'acronym',v.acronym,'registration_number',v.registration_number,'call_sign',v.call_sign,'registration_port',v.registration_port),auth.uid()) returning id into result_id;
  insert into public.lifting_inspection_entries(inspection_id,item_id,item_snapshot,checks,checklist_version)
    select result_id,i.id,to_jsonb(i),public.lifting_default_checks(to_jsonb(i)),2 from public.lifting_inventory i
      where i.vessel_id=v.id and i.kind=p_kind and i.active order by i.material_type,i.reference::bigint;
  return result_id;
end $$;

create function public.replace_lifting_item(p_id bigint,p_service_version integer,p_commissioned_on date) returns void
language plpgsql security definer set search_path='' as $$
declare i public.lifting_inventory%rowtype;
begin
  if auth.uid() is null or not public.has_any_role(array['admin','direction','armement']) then raise exception using errcode='42501',message='Accès refusé au remplacement.'; end if;
  select * into i from public.lifting_inventory where id=p_id and company_id=public.current_planning_company_id() for update;
  if i.id is null or not public.lifting_can_access(i.company_id,i.vessel_id) or not i.active then raise exception using errcode='42501',message='Matériel actif introuvable ou accès refusé.'; end if;
  if i.service_version is distinct from p_service_version then raise exception 'Ce matériel a déjà été remplacé. Rechargez son inventaire.'; end if;
  if p_commissioned_on is null or p_commissioned_on<i.commissioned_on or p_commissioned_on>(now() at time zone 'Europe/Paris')::date then raise exception 'Date de mise en service invalide.'; end if;
  update public.lifting_inventory set commissioned_on=p_commissioned_on,replaced_on=p_commissioned_on,last_control_on=null,
    service_version=service_version+1,replacement_history=replacement_history||jsonb_build_array(jsonb_build_object(
      'replaced_at',clock_timestamp(),'replaced_by',auth.uid(),'previous_commissioned_on',i.commissioned_on,
      'previous_last_control_on',i.last_control_on,'previous_service_version',i.service_version,'new_commissioned_on',p_commissioned_on)),
    updated_at=clock_timestamp(),updated_by=auth.uid() where id=i.id;
end $$;
revoke all on function public.replace_lifting_item(bigint,integer,date) from public,anon;
grant execute on function public.replace_lifting_item(bigint,integer,date) to authenticated;

create function public.lifting_update_visit_after_publication() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- Old-generation drafts cannot renew equipment replaced after the draft was opened.
  update public.lifting_inventory i set last_control_on=greatest(i.last_control_on,new.issued_on)
    from public.lifting_inspection_entries e where e.inspection_id=new.id and e.item_id=i.id
    and e.condition not in ('pending','not_present')
    and coalesce((e.item_snapshot->>'service_version')::integer,1)=i.service_version
    and (i.replaced_on is null or new.issued_on>=i.replaced_on);
  return new;
end $$;
revoke all on function public.lifting_update_visit_after_publication() from public,anon,authenticated;
create trigger lifting_visit_after_publication after update of status on public.lifting_inspections for each row
  when (old.status='draft' and new.status='published') execute function public.lifting_update_visit_after_publication();

-- Private supporting certificates for all lifting and towing equipment.
create table public.lifting_item_certificates (
  id uuid primary key default gen_random_uuid(), item_id bigint not null references public.lifting_inventory(id),
  storage_path text not null unique, file_name text not null, mime_type text not null,
  file_size bigint not null check(file_size>0 and file_size<=20971520),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create index lifting_item_certificates_item_idx on public.lifting_item_certificates(item_id);
create index lifting_item_certificates_creator_idx on public.lifting_item_certificates(created_by);
alter table public.lifting_item_certificates enable row level security;
revoke all on public.lifting_item_certificates from public,anon,authenticated;
grant select on public.lifting_item_certificates to authenticated;
create policy lifting_item_certificates_read on public.lifting_item_certificates for select to authenticated using(
  exists(select 1 from public.lifting_inventory i where i.id=item_id)
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('lifting-certificates','lifting-certificates',false,20971520,array['application/pdf','image/jpeg','image/png']);
create function public.lifting_certificate_path_access(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and p_path ~ '^[0-9]+/[0-9]+/[0-9]+/[0-9a-f-]+[.](pdf|jpg|png)$'
  and exists(select 1 from public.lifting_inventory i where i.id::text=split_part(p_path,'/',3)
    and i.company_id::text=split_part(p_path,'/',1) and i.vessel_id::text=split_part(p_path,'/',2)
    and public.lifting_can_access(i.company_id,i.vessel_id));
$$;
revoke all on function public.lifting_certificate_path_access(text) from public,anon;
grant execute on function public.lifting_certificate_path_access(text) to authenticated;
create policy lifting_certificate_files_read on storage.objects for select to authenticated using(bucket_id='lifting-certificates' and public.lifting_certificate_path_access(name));
create policy lifting_certificate_files_add on storage.objects for insert to authenticated with check(bucket_id='lifting-certificates' and public.lifting_certificate_path_access(name));
create function public.add_lifting_item_certificate(p_item_id bigint,p_storage_path text,p_file_name text,p_mime_type text,p_file_size bigint) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if p_item_id is null or not coalesce(public.lifting_certificate_path_access(p_storage_path),false) or split_part(p_storage_path,'/',3)<>p_item_id::text then raise exception using errcode='42501',message='Accès refusé au certificat de ce matériel.'; end if;
  if nullif(btrim(p_file_name),'') is null or length(p_file_name)>255 or p_mime_type not in ('application/pdf','image/jpeg','image/png') or p_file_size is null or p_file_size<=0 or p_file_size>20971520
    or not exists(select 1 from storage.objects where bucket_id='lifting-certificates' and name=p_storage_path and metadata->>'mimetype'=p_mime_type and (metadata->>'size')::bigint=p_file_size)
    then raise exception 'Joignez un PDF, JPG ou PNG de 20 Mo maximum.'; end if;
  insert into public.lifting_item_certificates(item_id,storage_path,file_name,mime_type,file_size,created_by)
    values(p_item_id,p_storage_path,btrim(p_file_name),p_mime_type,p_file_size,auth.uid())
    on conflict(storage_path) do nothing returning id into result;
  if result is null then select id into result from public.lifting_item_certificates where storage_path=p_storage_path and item_id=p_item_id; end if;
  return result;
end $$;
revoke all on function public.add_lifting_item_certificate(bigint,text,text,text,bigint) from public,anon;
grant execute on function public.add_lifting_item_certificate(bigint,text,text,text,bigint) to authenticated;
