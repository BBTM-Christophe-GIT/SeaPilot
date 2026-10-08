-- Onboard profiles can add equipment on their currently accessible active vessels.
-- Existing office inventory editing rights and read-only table grants are preserved.
create function private.can_access_lsa_vessel(p_company_id bigint,p_vessel_id bigint) returns boolean
language sql stable security invoker set search_path='' as $$
  select auth.uid() is not null
    and p_company_id=public.current_planning_company_id()
    and private.lsa_has_access()
    and exists (
      select 1 from public.vessels v
      where v.id=p_vessel_id and v.company_id=p_company_id and v.asset_kind='vessel'
        and (
          public.has_company_role(p_company_id,array['admin','direction','armement'])
          or (
            v.active and public.has_company_role(p_company_id,array['capitaine','marin'])
            and public.planning_can_read_row(p_company_id,v.id,null,current_date,current_date)
          )
        )
    );
$$;
revoke all on function private.can_access_lsa_vessel(bigint,bigint) from public,anon,authenticated;

create or replace function private.save_lsa_item(p_vessel_id bigint,p_item jsonb,p_id bigint,p_expected_updated_at timestamptz)
returns bigint language plpgsql security definer set search_path='' as $$
declare
  company bigint := public.current_planning_company_id(); result_id bigint;
  vessel public.vessels; previous public.lsa_items; designation public.lsa_designations; equipment public.lsa_equipment_types;
  chosen bigint := nullif(p_item->>'designation_id','')::bigint;
  next_number integer; item_title text; category text; selected_category_label text;
  expiry date := nullif(p_item->>'expires_on','')::date;
begin
  if auth.uid() is null or not private.lsa_has_access()
    or (p_id is null and not private.can_access_lsa_vessel(company,p_vessel_id))
    or (p_id is not null and not public.has_company_role(company,array['admin','direction','armement'])) then
    raise exception 'Modification du registre LSA non autorisée.' using errcode='42501'; end if;
  if not (p_item ? 'designation_id') then
    raise exception 'Le formulaire LSA a évolué. Rechargez la page avant de réessayer.' using errcode='22023'; end if;
  -- Catalog edits and saves take the same company lock: no half-renamed/archived selection.
  perform pg_advisory_xact_lock(hashtextextended('lsa-catalog:'||company,0));
  select * into vessel from public.vessels v where v.id=p_vessel_id and v.company_id=company and v.asset_kind='vessel';
  if vessel.id is null then raise exception 'Navire non autorisé.' using errcode='42501'; end if;
  if p_id is not null then
    select * into previous from public.lsa_items i where i.id=p_id and i.company_id=company and i.vessel_id=p_vessel_id for update;
    if previous.id is null or previous.updated_at is distinct from p_expected_updated_at then
      raise exception 'Fiche modifiée ou inaccessible. Rechargez le registre avant de réessayer.' using errcode='40001'; end if;
  end if;
  if chosen is null then
    if previous.id is null or previous.designation_id is not null then
      raise exception 'Choisissez une désignation.' using errcode='22023'; end if;
    item_title:=previous.document_title; category:=previous.category_key; selected_category_label:=previous.category_label;
  else
    select * into designation from public.lsa_designations d where d.id=chosen and d.company_id=company;
    select * into equipment from public.lsa_equipment_types t where t.id=designation.equipment_type_id and t.company_id=company;
    if designation.id is null or equipment.id is null then
      raise exception 'Désignation non autorisée.' using errcode='42501'; end if;
    if (not designation.active or not equipment.active) and chosen is distinct from previous.designation_id then
      raise exception 'Cette désignation est archivée. Choisissez une désignation disponible.' using errcode='22023'; end if;
    if chosen=previous.designation_id then
      next_number:=previous.item_number; item_title:=previous.document_title;
    else
      insert into private.lsa_designation_counters(company_id,vessel_id,designation_id,last_number)
        values(company,p_vessel_id,chosen,1)
      on conflict(company_id,vessel_id,designation_id) do update set last_number=lsa_designation_counters.last_number+1
      returning last_number into next_number;
      item_title:=designation.name||' - '||lpad(next_number::text,greatest(2,length(next_number::text)),'0');
    end if;
    category:='lsa-type-'||equipment.id; selected_category_label:=equipment.name;
  end if;
  if p_id is null then
    insert into public.lsa_items(company_id,vessel_id,vessel_name,category_key,category_label,title,document_title,
      designation_id,item_number,brand,model,serial_number,expires_on,alarm_on,notes,source_label,status,is_active_fleet)
    values(company,p_vessel_id,vessel.name,category,selected_category_label,item_title,item_title,chosen,next_number,
      nullif(btrim(p_item->>'brand'),''),nullif(btrim(p_item->>'model'),''),nullif(btrim(p_item->>'serial_number'),''),
      expiry,expiry-90,p_item->>'notes','seapilot','valid',vessel.active) returning id into result_id;
  else
    update public.lsa_items i set designation_id=chosen,item_number=next_number,category_key=category,category_label=selected_category_label,
      title=item_title,document_title=item_title,brand=nullif(btrim(p_item->>'brand'),''),model=nullif(btrim(p_item->>'model'),''),
      serial_number=nullif(btrim(p_item->>'serial_number'),''),expires_on=expiry,alarm_on=expiry-90,notes=p_item->>'notes',updated_at=clock_timestamp()
    where i.id=p_id returning id into result_id;
  end if;
  return result_id;
end $$;

create or replace function private.save_lsa_catalog_entry(p_kind text,p_entry jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
declare
  company bigint:=public.current_planning_company_id(); entry_id bigint:=nullif(p_entry->>'id','')::bigint;
  label text:=btrim(p_entry->>'name'); selected_type bigint:=nullif(p_entry->>'equipment_type_id','')::bigint;
  result_id bigint; old_designation public.lsa_designations;
  available boolean:=coalesce((p_entry->>'active')::boolean,true);
begin
  if auth.uid() is null or not private.lsa_has_access() or not public.has_company_role(company,array['admin','capitaine']) then
    raise exception 'Seuls les administrateurs et les capitaines peuvent modifier les désignations LSA.' using errcode='42501'; end if;
  if coalesce(length(label),0) not between 1 and 120 then raise exception 'Renseignez un libellé de 1 à 120 caractères.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('lsa-catalog:'||company,0));
  if p_kind='type' then
    if entry_id is null then
      insert into public.lsa_equipment_types(company_id,name,active) values(company,label,available) returning id into result_id;
    else
      update public.lsa_equipment_types set name=label,active=available,updated_at=clock_timestamp()
      where id=entry_id and company_id=company and updated_at=(p_entry->>'updated_at')::timestamptz returning id into result_id;
      update public.lsa_items set category_label=label,updated_at=clock_timestamp()
      where company_id=company and category_key='lsa-type-'||result_id;
    end if;
  elsif p_kind='designation' then
    if not exists(select 1 from public.lsa_equipment_types where id=selected_type and company_id=company) then
      raise exception 'Type d’équipement non autorisé.' using errcode='42501'; end if;
    if entry_id is null then
      insert into public.lsa_designations(company_id,equipment_type_id,name,active) values(company,selected_type,label,available) returning id into result_id;
    else
      select * into old_designation from public.lsa_designations where id=entry_id and company_id=company;
      update public.lsa_designations set name=label,equipment_type_id=selected_type,active=available,updated_at=clock_timestamp()
      where id=entry_id and company_id=company and updated_at=(p_entry->>'updated_at')::timestamptz returning id into result_id;
      -- Rename generated titles only; imported titles remain available verbatim.
      update public.lsa_items i set
        document_title=case when i.document_title=old_designation.name||' - '||lpad(i.item_number::text,greatest(2,length(i.item_number::text)),'0')
          then label||' - '||lpad(i.item_number::text,greatest(2,length(i.item_number::text)),'0') else i.document_title end,
        title=case when i.title=old_designation.name||' - '||lpad(i.item_number::text,greatest(2,length(i.item_number::text)),'0')
          then label||' - '||lpad(i.item_number::text,greatest(2,length(i.item_number::text)),'0') else i.title end,
        category_key='lsa-type-'||selected_type,category_label=(select name from public.lsa_equipment_types where id=selected_type),updated_at=clock_timestamp()
      where i.company_id=company and i.designation_id=result_id;
    end if;
  else raise exception 'Élément de catalogue invalide.' using errcode='22023'; end if;
  if result_id is null then raise exception 'Arborescence modifiée ou inaccessible. Fermez puis rechargez avant de réessayer.' using errcode='40001'; end if;
  return result_id;
exception when unique_violation then raise exception 'Ce libellé existe déjà dans l’arborescence.' using errcode='22023';
end $$;

create or replace function private.lsa_next_item_number(p_vessel_id bigint,p_designation_id bigint) returns integer
language plpgsql stable security definer set search_path='' as $$
declare company bigint:=public.current_planning_company_id();
begin
  if not private.can_access_lsa_vessel(company,p_vessel_id)
    or not exists(select 1 from public.lsa_designations where id=p_designation_id and company_id=company) then
    raise exception 'Numérotation LSA non autorisée.' using errcode='42501'; end if;
  return coalesce((select last_number from private.lsa_designation_counters
    where company_id=company and vessel_id=p_vessel_id and designation_id=p_designation_id),0)+1;
end $$;

notify pgrst,'reload schema';
