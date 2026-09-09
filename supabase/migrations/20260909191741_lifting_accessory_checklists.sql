-- Numbering is local to each vessel/register. Published snapshots and original references are preserved.
alter table public.lifting_inventory add column legacy_reference text not null default '';
alter table public.lifting_inventory add column towing_type text check (towing_type in ('chain_bridle','textile_line','towing_wire','winch_wire','textile_bridle'));
alter table public.lifting_inventory drop constraint lifting_inventory_company_id_vessel_id_reference_key;
with numbered as (
  select id,row_number() over(partition by company_id,vessel_id,kind order by created_at,id)::text as new_reference
  from public.lifting_inventory
)
update public.lifting_inventory i set legacy_reference=i.reference,reference=n.new_reference from numbered n where n.id=i.id;
alter table public.lifting_inventory add constraint lifting_inventory_register_reference_key unique(company_id,vessel_id,kind,reference);

create table public.lifting_inventory_counters (
  company_id bigint not null references public.companies(id),
  vessel_id bigint not null references public.vessels(id),
  kind text not null check(kind in ('lifting','towing')),
  last_number bigint not null check(last_number>0), primary key(company_id,vessel_id,kind)
);
alter table public.lifting_inventory_counters enable row level security;
revoke all on public.lifting_inventory_counters from public,anon,authenticated;
insert into public.lifting_inventory_counters select company_id,vessel_id,kind,max(reference::bigint) from public.lifting_inventory group by 1,2,3;

create function public.lifting_accessory_code(p_type text) returns text
language sql immutable set search_path='' as $$
  select case lower(translate(btrim(p_type),'ÉÈÊéèêÀàÂâÎîÏïÔôÙùÛûÇç','EEEeeeAaAaIiIiOoUuUuCc'))
    when 'sh' then 'SH' when 'manille' then 'SH' when 'manilles' then 'SH'
    when 'hk' then 'HK' when 'croc' then 'HK' when 'crocs' then 'HK' when 'crochet' then 'HK'
    when 'sl' then 'SL' when 'elingue' then 'SL' when 'elingues' then 'SL' when 'sangle' then 'SL' when 'sangles' then 'SL' when 'elingues/sangles' then 'SL' when 'elingues / sangles textiles' then 'SL'
    when 'ch' then 'CH' when 'chaine' then 'CH' when 'chaines' then 'CH'
    when 'wi' then 'WI' when 'cable' then 'WI' when 'cables' then 'WI'
    when 'ro' then 'RO' when 'aussiere' then 'RO' when 'aussiere textile' then 'RO' when 'aussieres textiles' then 'RO'
    when 'pu' then 'PU' when 'poulie' then 'PU' when 'poulies' then 'PU' when 'moufle' then 'PU' when 'moufles et poulies de retour' then 'PU'
    when 'hc' then 'HC' when 'palan' then 'HC' when 'palan a chaine' then 'HC' when 'tirefort' then 'HC' when 'palans a chaine et tireforts manuels' then 'HC'
    when 'tl' then 'TL' when 'remorque' then 'TL' when 'remorques' then 'TL' when 'towing line' then 'TL' end;
$$;
create function public.lifting_accessory_label(p_code text) returns text
language sql immutable set search_path='' as $$
  select case p_code when 'SH' then 'Manilles' when 'HK' then 'Crocs' when 'SL' then 'Élingues / Sangles textiles'
    when 'CH' then 'Chaînes' when 'WI' then 'Câbles' when 'RO' then 'Aussières textiles' when 'PU' then 'Moufles et poulies de retour'
    when 'HC' then 'Palans à chaîne et tireforts manuels' when 'TL' then 'Remorque' end;
$$;
update public.lifting_inventory set material_type=coalesce(public.lifting_accessory_label(public.lifting_accessory_code(material_type)),material_type);
-- These five source descriptions are explicit; unmatched towing equipment remains unclassified.
update public.lifting_inventory set towing_type=case
  when description ilike '%PATTE D''OIE CHAINE%' then 'chain_bridle'
  when description ilike '%PATTE D''OIE TEXTILE%' then 'textile_bridle'
  when description ilike '%REMORQUE TEXTILE%' then 'textile_line'
  when description ilike '%CABLE DE REMORQUAGE%' then 'towing_wire'
  when description ilike '%CABLE DE TREUIL%' then 'winch_wire' end where kind='towing';

create function public.lifting_control_codes(p_item jsonb) returns text[]
language sql immutable set search_path='' as $$
  select case public.lifting_accessory_code(p_item->>'material_type')
    when 'SH' then array['EG','ID','V1'] when 'HK' then array['EG','ID','V1']
    when 'SL' then array['EG','ID','V1','V2','V3','V4','V5']
    when 'CH' then array['EG','ID','V1','V2'] when 'WI' then array['EG','ID','V1','V2'] when 'PU' then array['EG','ID','V1','V2']
    when 'HC' then array['EG','ID','V1','V2','V3','V4']
    when 'TL' then case p_item->>'towing_type'
      when 'chain_bridle' then array['EG','NID','V1','V2']
      when 'textile_line' then array['EG','NID'] when 'towing_wire' then array['EG','NID'] when 'winch_wire' then array['EG','NID']
      when 'textile_bridle' then array['EG','V1','V2','V3','V4','V5'] else array[]::text[] end
    else array[]::text[] end;
$$;
create function public.lifting_default_checks(p_item jsonb) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_object_agg(k,case when k=any(public.lifting_control_codes(p_item)) then 'ok' else 'na' end)
    from unnest(array['EG','ID','NID','V1','V2','V3','V4','V5']) k;
$$;
alter table public.lifting_inspection_entries add column checklist_version integer not null default 1 check(checklist_version in (1,2));
alter table public.lifting_inspection_entries alter column checklist_version set default 2;
-- Drafts adopt the new form without turning unknown legacy checks into an approved inspection.
update public.lifting_inspection_entries e set checklist_version=2,
  condition=case when e.condition='not_present' or exists(select 1 from jsonb_each_text(e.checks) where value='pending') then 'pending' else e.condition end,
  item_snapshot=e.item_snapshot||jsonb_build_object('reference',i.reference,'legacy_reference',i.legacy_reference,'material_type',i.material_type,'towing_type',i.towing_type),
  checks=(select jsonb_object_agg(k,case when k=any(public.lifting_control_codes(to_jsonb(i))) then
    case when coalesce(e.checks->>k,case when k='ID' then e.checks->>'NID' end)='defect' then 'defect' else 'ok' end else 'na' end)
    from unnest(array['EG','ID','NID','V1','V2','V3','V4','V5']) k)
from public.lifting_inventory i,public.lifting_inspections r where i.id=e.item_id and r.id=e.inspection_id and r.status='draft';
update public.lifting_inspections set revision=revision+1 where status='draft';

create or replace function public.save_lifting_item(p_vessel_id bigint,p_kind text,p_item jsonb,p_id bigint default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare c bigint:=public.current_planning_company_id(); result_id bigint; code text; next_number bigint; old public.lifting_inventory%rowtype;
begin
  if auth.uid() is null or not public.has_any_role(array['admin','direction','armement']) or not exists(
    select 1 from public.vessels where id=p_vessel_id and company_id=c and active and asset_kind='vessel'
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
  if p_id is null then
    insert into public.lifting_inventory(company_id,vessel_id,kind,reference,material_type,towing_type,description,swl_tonnes,serial_number,location,notes,created_by,updated_by)
    values(c,p_vessel_id,p_kind,next_number::text,public.lifting_accessory_label(code),case when code='TL' then p_item->>'towing_type' end,btrim(p_item->>'description'),
      nullif(p_item->>'swl_tonnes','')::numeric,coalesce(p_item->>'serial_number',''),coalesce(p_item->>'location',''),coalesce(p_item->>'notes',''),auth.uid(),auth.uid()) returning id into result_id;
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
  select * into v from public.vessels where id=p_vessel_id and active and asset_kind='vessel';
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
exception when unique_violation then raise exception 'Un contrôle existe déjà pour ce navire, cette section et cette année. Reprenez-le dans les rapports.';
end $$;

create or replace function public.save_lifting_inspection_entry(p_inspection_id bigint,p_entry_id bigint,p_revision integer,p_condition text,p_checks jsonb,p_observations text)
returns integer language plpgsql security definer set search_path='' as $$
declare r public.lifting_inspections%rowtype; e public.lifting_inspection_entries%rowtype; k text; codes text[]; normalized jsonb:='{}';
begin
  select * into r from public.lifting_inspections where id=p_inspection_id for update;
  if auth.uid() is null or r.id is null or not public.lifting_can_access(r.company_id,r.vessel_id) then raise exception using errcode='42501',message='Accès refusé.'; end if;
  if r.status<>'draft' then raise exception 'Ce rapport est finalisé et ne peut plus être modifié.'; end if;
  if r.revision is distinct from p_revision then raise exception 'Ce contrôle a été modifié depuis un autre appareil. Rechargez-le avant de continuer.'; end if;
  select * into e from public.lifting_inspection_entries where id=p_entry_id and inspection_id=r.id;
  if e.id is null then raise exception 'Matériel absent de ce contrôle.'; end if;
  if p_condition is null or p_condition not in ('good','repair','withdrawn') then raise exception 'Choisissez une des trois décisions proposées.'; end if;
  if p_checks is null or jsonb_typeof(p_checks)<>'object' then raise exception 'Points de contrôle invalides.'; end if;
  codes:=public.lifting_control_codes(e.item_snapshot);
  if cardinality(codes)=0 then raise exception 'La notice des contrôles de ce type d’accessoire doit être complétée.'; end if;
  foreach k in array array['EG','ID','NID','V1','V2','V3','V4','V5'] loop
    if k=any(codes) then
      if coalesce(p_checks->>k,'') not in ('ok','defect') then raise exception 'Renseignez chaque point de contrôle applicable.'; end if;
      normalized:=normalized||jsonb_build_object(k,p_checks->>k);
    else normalized:=normalized||jsonb_build_object(k,'na'); end if;
  end loop;
  if p_condition='good' and exists(select 1 from jsonb_each_text(normalized) where value='defect') then raise exception 'Un matériel présentant un défaut ne peut pas être maintenu en service sans réserve.'; end if;
  update public.lifting_inspection_entries set condition=p_condition,checks=normalized,observations=coalesce(p_observations,''),checklist_version=2,updated_by=auth.uid(),updated_at=clock_timestamp() where id=e.id;
  update public.lifting_inspections set revision=revision+1,updated_at=clock_timestamp() where id=r.id returning revision into p_revision;
  return p_revision;
end $$;

-- The entire submitted group is saved in one transaction. A stale or invalid row rolls back every row.
create function public.save_lifting_inspection_entries(p_inspection_id bigint,p_revision integer,p_entries jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare row_data jsonb; r public.lifting_inspections%rowtype;
begin
  select * into r from public.lifting_inspections where id=p_inspection_id for update;
  if auth.uid() is null or r.id is null or not public.lifting_can_access(r.company_id,r.vessel_id) then raise exception using errcode='42501',message='Accès refusé.'; end if;
  if r.status<>'draft' then raise exception 'Ce rapport est finalisé et ne peut plus être modifié.'; end if;
  if r.revision is distinct from p_revision then raise exception 'Ce contrôle a été modifié depuis un autre appareil. Rechargez-le avant de continuer.'; end if;
  if p_entries is null or jsonb_typeof(p_entries)<>'array' or jsonb_array_length(p_entries)=0 or jsonb_array_length(p_entries)>2000 then raise exception 'Liste de matériels invalide.'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_entries))<>jsonb_array_length(p_entries) then raise exception 'Un matériel ne peut apparaître qu’une fois.'; end if;
  for row_data in select value from jsonb_array_elements(p_entries) loop
    p_revision:=public.save_lifting_inspection_entry(p_inspection_id,(row_data->>'id')::bigint,p_revision,row_data->>'condition',row_data->'checks',row_data->>'observations');
  end loop;
  return p_revision;
end $$;

create function public.lifting_entry_ready(p_item jsonb,p_condition text,p_checks jsonb,p_observations text) returns boolean
language sql immutable set search_path='' as $$
  select coalesce(p_condition in ('good','repair','withdrawn')
    and cardinality(public.lifting_control_codes(p_item))>0
    and (p_condition='good' or nullif(btrim(p_observations),'') is not null)
    and not exists(select 1 from unnest(public.lifting_control_codes(p_item)) k where coalesce(p_checks->>k,'') not in ('ok','defect'))
    and not (p_condition='good' and exists(select 1 from unnest(public.lifting_control_codes(p_item)) k where p_checks->>k='defect')),false);
$$;
-- Keep the existing atomic certificate creation and storage/revision guards; replace only completeness rules.
do $patch$
declare definition text; start_pos integer; end_pos integer;
begin
  select pg_get_functiondef('public.publish_lifting_inspection(bigint,integer,text,text,bigint)'::regprocedure) into definition;
  start_pos:=strpos(definition,'  if not exists(select 1 from public.lifting_inspection_entries');
  end_pos:=strpos(definition,'  if p_file_size is null');
  if start_pos=0 or end_pos<=start_pos then raise exception 'Publication function did not match the expected migration baseline.'; end if;
  definition:=substr(definition,1,start_pos-1)||$replacement$  if not exists(select 1 from public.lifting_inspection_entries where inspection_id=r.id) or exists(
    select 1 from public.lifting_inspection_entries e where e.inspection_id=r.id and
      not public.lifting_entry_ready(e.item_snapshot,e.condition,e.checks,e.observations)
  ) then raise exception 'Terminez tous les contrôles et renseignez les observations pour chaque réserve.'; end if;
$replacement$||substr(definition,end_pos);
  execute definition;
end $patch$;

revoke all on function public.lifting_accessory_code(text),public.lifting_accessory_label(text),public.lifting_control_codes(jsonb),public.lifting_default_checks(jsonb),public.lifting_entry_ready(jsonb,text,jsonb,text) from public,anon;
grant execute on function public.lifting_accessory_code(text),public.lifting_accessory_label(text),public.lifting_control_codes(jsonb),public.lifting_default_checks(jsonb),public.lifting_entry_ready(jsonb,text,jsonb,text) to authenticated;
revoke all on function public.save_lifting_inspection_entries(bigint,integer,jsonb) from public,anon;
grant execute on function public.save_lifting_inspection_entries(bigint,integer,jsonb) to authenticated;
