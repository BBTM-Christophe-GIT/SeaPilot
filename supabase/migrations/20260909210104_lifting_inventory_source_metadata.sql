-- Stable source identity allows repeatable inventory enrichment without replacing inspections.
alter table public.lifting_inventory add column source_key text;
alter table public.lifting_inventory add column source_data jsonb not null default '{}'::jsonb
  check (jsonb_typeof(source_data)='object');
create unique index lifting_inventory_source_key_idx on public.lifting_inventory(company_id,source_key)
  where source_key is not null;
comment on column public.lifting_inventory.source_data is 'Historical source metadata, not a new or approved inspection. Maintained by administrative imports only.';


create or replace function public.lifting_accessory_code(p_type text) returns text
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
    when 'an' then 'AN' when 'anneau' then 'AN' when 'anneaux' then 'AN' when 'anneaux de levage' then 'AN'
    when 'pn' then 'PN' when 'pince' then 'PN' when 'pinces' then 'PN' when 'pinces de levage' then 'PN' when 'pinces a tôles' then 'PN' when 'pinces a toles' then 'PN'
    when 'gp' then 'GP' when 'grappin' then 'GP' when 'grappins' then 'GP'
    when 'tl' then 'TL' when 'remorque' then 'TL' when 'remorques' then 'TL' when 'towing line' then 'TL' end;
$$;

create or replace function public.lifting_accessory_label(p_code text) returns text
language sql immutable set search_path='' as $$
  select case p_code when 'SH' then 'Manilles' when 'HK' then 'Crocs' when 'SL' then 'Élingues / Sangles textiles'
    when 'CH' then 'Chaînes' when 'WI' then 'Câbles' when 'RO' then 'Aussières textiles' when 'PU' then 'Moufles et poulies de retour'
    when 'AN' then 'Anneaux de levage' when 'PN' then 'Pinces à tôles' when 'GP' then 'Grappins'
    when 'HC' then 'Palans à chaîne et tireforts manuels' when 'TL' then 'Remorque' end;
$$;

create or replace function public.lifting_control_codes(p_item jsonb) returns text[]
language sql immutable set search_path='' as $$
  select case public.lifting_accessory_code(p_item->>'material_type')
    when 'AN' then array['EG','ID'] when 'PN' then array['EG','ID','V1','V2','V3']
    when 'SH' then array['EG','ID','V1'] when 'HK' then array['EG','ID','V1']
    when 'SL' then array['EG','ID','V1','V2','V3','V4','V5']
    when 'CH' then array['EG','ID','V1','V2'] when 'WI' then array['EG','ID','V1','V2'] when 'PU' then array['EG','ID','V1','V2']
    when 'HC' then array['EG','ID','V1','V2','V3','V4']
    when 'TL' then case p_item->>'towing_type'
      when 'chain_bridle' then array['EG','NID','V1','V2']
      when 'textile_line' then array['EG','NID'] when 'towing_wire' then array['EG','NID'] when 'winch_wire' then array['EG','NID']
      when 'textile_bridle' then array['EG','NID','V1','V2','V3','V4','V5'] else array[]::text[] end
    else array[]::text[] end;
$$;

create or replace function public.lifting_available_vessels() returns setof public.vessels
language sql stable security definer set search_path = '' as $$
  select v.* from public.vessels v where v.active and v.asset_kind in ('vessel','quay')
    and public.lifting_can_access(v.company_id, v.id) order by v.name;
$$;

create or replace function public.save_lifting_item(p_vessel_id bigint,p_kind text,p_item jsonb,p_id bigint default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare c bigint:=public.current_planning_company_id(); result_id bigint; code text; next_number bigint; old public.lifting_inventory%rowtype;
begin
  if auth.uid() is null or not public.has_any_role(array['admin','direction','armement']) or not exists(
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
