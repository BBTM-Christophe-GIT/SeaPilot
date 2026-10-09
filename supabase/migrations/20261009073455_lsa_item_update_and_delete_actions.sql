-- All profiles can act on the inventory of their currently accessible vessels.
-- Keep document versions, renewal history, Storage objects and numbering after deletion.
alter table public.lsa_items
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users(id) on delete set null;

alter policy lsa_items_read on public.lsa_items using (
  deleted_at is null
  and (select private.lsa_has_access())
  and company_id=(select public.current_planning_company_id())
  and (
    public.planning_can_read_row(company_id,vessel_id,null,coalesce(issued_on,current_date),coalesce(expires_on,current_date))
    or public.lsa_can_add_item(vessel_id)
  )
);
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
    or not coalesce(private.lsa_can_add_item(p_vessel_id),false) then
    raise exception 'Modification du registre LSA non autorisée.' using errcode='42501'; end if;
  if not (p_item ? 'designation_id') then
    raise exception 'Le formulaire LSA a évolué. Rechargez la page avant de réessayer.' using errcode='22023'; end if;
  -- Catalog edits and saves take the same company lock: no half-renamed/archived selection.
  perform pg_advisory_xact_lock(hashtextextended('lsa-catalog:'||company,0));
  select * into vessel from public.vessels v where v.id=p_vessel_id and v.company_id=company and v.asset_kind='vessel';
  if vessel.id is null then raise exception 'Navire non autorisé.' using errcode='42501'; end if;
  if p_id is not null then
    select * into previous from public.lsa_items i where i.id=p_id and i.company_id=company and i.vessel_id=p_vessel_id and i.deleted_at is null for update;
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

create function private.update_lsa_item_expiry(p_id bigint,p_expires_on date,p_expected_updated_at timestamptz)
returns bigint language plpgsql security definer set search_path='' as $$
declare
  company bigint:=public.current_planning_company_id(); previous public.lsa_items;
begin
  if auth.uid() is null or not private.lsa_has_access() then
    raise exception 'Modification du registre LSA non autorisée.' using errcode='42501'; end if;
  select * into previous from public.lsa_items i where i.id=p_id and i.company_id=company and i.deleted_at is null for update;
  if previous.id is null then
    raise exception 'Fiche modifiée ou inaccessible. Rechargez le registre avant de réessayer.' using errcode='40001'; end if;
  if not coalesce(private.lsa_can_add_item(previous.vessel_id),false) then
    raise exception 'Modification du registre LSA non autorisée.' using errcode='42501'; end if;
  if previous.updated_at is distinct from p_expected_updated_at then
    raise exception 'Fiche modifiée ou inaccessible. Rechargez le registre avant de réessayer.' using errcode='40001'; end if;
  if p_expires_on is null then
    raise exception 'Renseignez la date d’échéance.' using errcode='22023'; end if;
  -- Only the expiry and its derived alert date change; document metadata stay intact.
  update public.lsa_items set expires_on=p_expires_on,alarm_on=p_expires_on-90,updated_at=clock_timestamp() where id=p_id;
  return p_id;
end $$;
revoke all on function private.update_lsa_item_expiry(bigint,date,timestamptz) from public,anon;
grant execute on function private.update_lsa_item_expiry(bigint,date,timestamptz) to authenticated;
create function public.update_lsa_item_expiry(p_id bigint,p_expires_on date,p_expected_updated_at timestamptz)
returns bigint language sql security invoker set search_path='' as $$
  select private.update_lsa_item_expiry(p_id,p_expires_on,p_expected_updated_at);
$$;
revoke all on function public.update_lsa_item_expiry(bigint,date,timestamptz) from public,anon;
grant execute on function public.update_lsa_item_expiry(bigint,date,timestamptz) to authenticated;

create function private.delete_lsa_item(p_id bigint,p_expected_updated_at timestamptz)
returns bigint language plpgsql security definer set search_path='' as $$
declare
  company bigint:=public.current_planning_company_id(); previous public.lsa_items;
begin
  if auth.uid() is null or not private.lsa_has_access() then
    raise exception 'Suppression du registre LSA non autorisée.' using errcode='42501'; end if;
  select * into previous from public.lsa_items i where i.id=p_id and i.company_id=company and i.deleted_at is null for update;
  if previous.id is null then
    raise exception 'Fiche modifiée ou inaccessible. Rechargez le registre avant de réessayer.' using errcode='40001'; end if;
  if not coalesce(private.lsa_can_add_item(previous.vessel_id),false) then
    raise exception 'Suppression du registre LSA non autorisée.' using errcode='42501'; end if;
  if previous.updated_at is distinct from p_expected_updated_at then
    raise exception 'Fiche modifiée ou inaccessible. Rechargez le registre avant de réessayer.' using errcode='40001'; end if;
  update public.lsa_items set deleted_at=clock_timestamp(),deleted_by=auth.uid(),updated_at=clock_timestamp() where id=p_id;
  return p_id;
end $$;
revoke all on function private.delete_lsa_item(bigint,timestamptz) from public,anon;
grant execute on function private.delete_lsa_item(bigint,timestamptz) to authenticated;
create function public.delete_lsa_item(p_id bigint,p_expected_updated_at timestamptz)
returns bigint language sql security invoker set search_path='' as $$
  select private.delete_lsa_item(p_id,p_expected_updated_at);
$$;
revoke all on function public.delete_lsa_item(bigint,timestamptz) from public,anon;
grant execute on function public.delete_lsa_item(bigint,timestamptz) to authenticated;

notify pgrst,'reload schema';

