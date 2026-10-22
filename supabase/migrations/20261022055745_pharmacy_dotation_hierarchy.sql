-- The fleet assignment is a snapshot parent, independent from imported section,
-- category text, quantities and provenance. Later fleet edits never reclassify it.
set local lock_timeout='5s';

alter table public.pharmacy_inventory add column medical_dotation text not null default '';
alter table public.pharmacy_categories add column medical_dotation text not null default '';
update public.pharmacy_inventory i set medical_dotation=btrim(coalesce(v.medical_dotation,''))
  from public.vessels v where v.id=i.vessel_id and v.company_id=i.company_id;
update public.pharmacy_categories k set medical_dotation=btrim(coalesce(v.medical_dotation,''))
  from public.vessels v where v.id=k.vessel_id and v.company_id=k.company_id;
alter table public.pharmacy_inventory add constraint pharmacy_inventory_dotation_trimmed
  check(medical_dotation=btrim(medical_dotation));
alter table public.pharmacy_categories add constraint pharmacy_categories_dotation_trimmed
  check(medical_dotation=btrim(medical_dotation));
comment on column public.pharmacy_inventory.medical_dotation is
  'Snapshot of the vessel medical dotation at import/creation; fleet changes never move existing articles. Empty means unassigned.';
comment on column public.pharmacy_categories.medical_dotation is
  'Immutable dotation parent snapshot. Category names are unique only within the same vessel and dotation.';
drop index public.pharmacy_categories_vessel_name_idx;
create unique index pharmacy_categories_vessel_dotation_name_idx
  on public.pharmacy_categories(vessel_id,lower(medical_dotation),lower(name));

-- Append assignment without changing vessel access rules or existing fields.
drop function public.pharmacy_available_vessels();
drop function pharmacy_private.available_vessels();
create function pharmacy_private.available_vessels()
returns table(id bigint,company_id bigint,name text,acronym text,can_manage boolean,length_overall text,medical_dotation text)
language sql stable security definer set search_path='' as $$
  select v.id,v.company_id,v.name,v.acronym,pharmacy_private.can_manage(v.company_id,v.id),v.length_overall,
    btrim(coalesce(v.medical_dotation,''))
  from public.vessels v where pharmacy_private.can_access(v.company_id,v.id) order by v.name,v.id;
$$;
create function public.pharmacy_available_vessels()
returns table(id bigint,company_id bigint,name text,acronym text,can_manage boolean,length_overall text,medical_dotation text)
language sql stable security invoker set search_path='' as $$ select * from pharmacy_private.available_vessels(); $$;

-- Replace the four-argument endpoint with a five-argument endpoint whose last
-- argument is optional. Old clients keep working without an ambiguous overload.
drop function public.save_pharmacy_category(bigint,text,bigint,integer);
drop function pharmacy_private.save_category(bigint,text,bigint,integer);
create function pharmacy_private.save_category(p_vessel_id bigint,p_name text,p_id bigint,p_revision integer,p_medical_dotation text)
returns bigint language plpgsql security definer set search_path='' as $$
declare c bigint:=public.current_planning_company_id(); r public.pharmacy_categories%rowtype;
  category_name text:=btrim(p_name); result_id bigint; current_dotation text; parent_dotation text;
begin
  if not coalesce(pharmacy_private.can_manage(c,p_vessel_id),false) then
    raise exception using errcode='42501',message='Accès refusé aux catégories de ce navire.';
  end if;
  -- Shared with item saves and fleet updates; always take this before child locks.
  select btrim(coalesce(medical_dotation,'')) into current_dotation from public.vessels
    where id=p_vessel_id and company_id=c for update;
  if not found then raise exception using errcode='42501',message='Navire inaccessible.'; end if;
  if category_name is null or length(category_name) not between 1 and 200 then
    raise exception using errcode='22023',message='Renseignez une catégorie de 1 à 200 caractères.';
  end if;
  if p_id is not null then
    select * into r from public.pharmacy_categories
      where id=p_id and company_id=c and vessel_id=p_vessel_id for update;
    if r.id is null then raise exception using errcode='42501',message='Catégorie introuvable ou accès refusé.'; end if;
    if p_revision is distinct from r.revision then
      raise exception using errcode='40001',message='Cette catégorie a été modifiée sur un autre appareil. Rechargez l’inventaire.';
    end if;
    parent_dotation:=r.medical_dotation;
    if p_medical_dotation is not null and lower(btrim(p_medical_dotation))<>lower(parent_dotation) then
      raise exception using errcode='40001',message='La dotation de cette catégorie a changé. Rechargez l’inventaire.';
    end if;
  else
    parent_dotation:=btrim(coalesce(p_medical_dotation,current_dotation));
    -- A category can be added to the current assignment or an existing history
    -- branch; arbitrary dotation names cannot create a new fleet assignment.
    if lower(parent_dotation)<>lower(current_dotation)
      and not exists(select 1 from public.pharmacy_categories where company_id=c and vessel_id=p_vessel_id
        and lower(medical_dotation)=lower(parent_dotation))
      and not exists(select 1 from public.pharmacy_inventory where company_id=c and vessel_id=p_vessel_id
        and lower(medical_dotation)=lower(parent_dotation)) then
      raise exception using errcode='40001',message='Cette dotation n’est plus affectée à ce navire. Rechargez l’inventaire.';
    end if;
    -- Reuse a stored spelling for case/space-equivalent historical parents.
    parent_dotation:=coalesce((select medical_dotation from public.pharmacy_categories
      where company_id=c and vessel_id=p_vessel_id and lower(medical_dotation)=lower(parent_dotation)
      order by id limit 1),(select medical_dotation from public.pharmacy_inventory
      where company_id=c and vessel_id=p_vessel_id and lower(medical_dotation)=lower(parent_dotation)
      order by id limit 1),parent_dotation);
  end if;
  if exists(select 1 from public.pharmacy_categories where vessel_id=p_vessel_id
    and lower(medical_dotation)=lower(parent_dotation) and lower(name)=lower(category_name)
    and (p_id is null or id<>p_id)) then
    raise exception using errcode='23505',message='Une catégorie de ce nom existe déjà dans cette dotation.';
  end if;
  if p_id is null then
    insert into public.pharmacy_categories(company_id,vessel_id,medical_dotation,name,created_by,updated_by)
      values(c,p_vessel_id,parent_dotation,category_name,auth.uid(),auth.uid()) returning id into result_id;
  else
    update public.pharmacy_categories set name=category_name,revision=revision+1,
      updated_at=clock_timestamp(),updated_by=auth.uid() where id=r.id returning id into result_id;
    update public.pharmacy_inventory set category=category_name,revision=revision+1,
      updated_at=clock_timestamp(),updated_by=auth.uid()
      where company_id=c and vessel_id=p_vessel_id and lower(medical_dotation)=lower(parent_dotation)
        and lower(btrim(category))=lower(r.name) and category is distinct from category_name;
  end if;
  return result_id;
end $$;
create function public.save_pharmacy_category(p_vessel_id bigint,p_name text,p_id bigint default null,
  p_revision integer default null,p_medical_dotation text default null)
returns bigint language sql security invoker set search_path='' as $$
  select pharmacy_private.save_category(p_vessel_id,p_name,p_id,p_revision,p_medical_dotation);
$$;

create or replace function pharmacy_private.delete_category(p_vessel_id bigint,p_id bigint,p_revision integer)
returns void language plpgsql security definer set search_path='' as $$
declare c bigint:=public.current_planning_company_id(); r public.pharmacy_categories%rowtype;
begin
  if not coalesce(pharmacy_private.can_manage(c,p_vessel_id),false) then
    raise exception using errcode='42501',message='Accès refusé aux catégories de ce navire.';
  end if;
  perform 1 from public.vessels where id=p_vessel_id and company_id=c for update;
  if not found then raise exception using errcode='42501',message='Navire inaccessible.'; end if;
  select * into r from public.pharmacy_categories
    where id=p_id and company_id=c and vessel_id=p_vessel_id for update;
  if r.id is null then raise exception using errcode='42501',message='Catégorie introuvable ou accès refusé.'; end if;
  if p_revision is distinct from r.revision then
    raise exception using errcode='40001',message='Cette catégorie a été modifiée sur un autre appareil. Rechargez l’inventaire.';
  end if;
  -- Retired rows are included, but the same category under another parent is not.
  update public.pharmacy_inventory set category='',revision=revision+1,
    updated_at=clock_timestamp(),updated_by=auth.uid()
    where company_id=c and vessel_id=p_vessel_id and lower(medical_dotation)=lower(r.medical_dotation)
      and lower(btrim(category))=lower(r.name);
  delete from public.pharmacy_categories where id=r.id;
end $$;

-- Preserve full-draft validation, source data and item CAS. New items use the
-- current fleet assignment; old items keep their parent even for older clients.
create or replace function pharmacy_private.save_item(p_vessel_id bigint,p_item jsonb,p_id bigint,p_revision integer)
returns bigint language plpgsql security definer set search_path='' as $$
declare c bigint:=public.current_planning_company_id(); result_id bigint; r public.pharmacy_inventory%rowtype;
  category_name text; canonical_name text; current_dotation text; parent_dotation text;
begin
  if not coalesce(pharmacy_private.can_manage(c,p_vessel_id),false) then
    raise exception using errcode='42501',message='Accès refusé à la modification de cet inventaire.'; end if;
  select btrim(coalesce(medical_dotation,'')) into current_dotation from public.vessels
    where id=p_vessel_id and company_id=c for update;
  if not found then raise exception using errcode='42501',message='Navire inaccessible.'; end if;
  if p_item is null or jsonb_typeof(p_item)<>'object' or octet_length(p_item::text)>20000 then
    raise exception 'Contenu de l’article invalide.'; end if;
  if p_id is not null then
    select * into r from public.pharmacy_inventory where id=p_id and company_id=c and vessel_id=p_vessel_id for update;
    if r.id is null then raise exception using errcode='42501',message='Article introuvable ou accès refusé.'; end if;
    if p_revision is distinct from r.revision then raise exception using errcode='40001',message='Cet article a été modifié sur un autre appareil. Rechargez l’inventaire.'; end if;
    parent_dotation:=r.medical_dotation;
  else
    parent_dotation:=current_dotation;
  end if;
  if p_item ? 'medical_dotation' and lower(btrim(coalesce(p_item->>'medical_dotation','')))<>lower(parent_dotation) then
    raise exception using errcode='40001',message='La dotation de cet article a changé. Rechargez l’inventaire.';
  end if;
  category_name:=btrim(coalesce(p_item->>'category',''));
  if length(category_name)>200 then
    raise exception using errcode='22023',message='Le nom de catégorie ne doit pas dépasser 200 caractères.';
  end if;
  if category_name<>'' then
    select name into canonical_name from public.pharmacy_categories where company_id=c and vessel_id=p_vessel_id
      and lower(medical_dotation)=lower(parent_dotation) and lower(name)=lower(category_name);
    if found then
      category_name:=canonical_name;
    else
      insert into public.pharmacy_categories(company_id,vessel_id,medical_dotation,name,created_by,updated_by)
        values(c,p_vessel_id,parent_dotation,category_name,auth.uid(),auth.uid());
    end if;
  end if;
  if p_id is null then
    insert into public.pharmacy_inventory(company_id,vessel_id,medical_dotation,section,category,brand,designation,lot_number,quantity,required_quantity,expires_on,expiry_text,expiry_precision,notes,active,created_by,updated_by)
    values(c,p_vessel_id,parent_dotation,coalesce(p_item->>'section',''),category_name,coalesce(p_item->>'brand',''),btrim(p_item->>'designation'),coalesce(p_item->>'lot_number',''),
      coalesce(p_item->>'quantity',''),coalesce(p_item->>'required_quantity',''),nullif(p_item->>'expires_on','')::date,
      coalesce(p_item->>'expiry_text',''),coalesce(p_item->>'expiry_precision','unknown'),coalesce(p_item->>'notes',''),coalesce((p_item->>'active')::boolean,true),auth.uid(),auth.uid())
    returning id into result_id;
  else
    update public.pharmacy_inventory set section=coalesce(p_item->>'section',''),category=category_name,brand=coalesce(p_item->>'brand',''),designation=btrim(p_item->>'designation'),
      lot_number=coalesce(p_item->>'lot_number',''),quantity=coalesce(p_item->>'quantity',''),required_quantity=coalesce(p_item->>'required_quantity',''),expires_on=nullif(p_item->>'expires_on','')::date,
      expiry_text=coalesce(p_item->>'expiry_text',''),expiry_precision=coalesce(p_item->>'expiry_precision','unknown'),notes=coalesce(p_item->>'notes',''),active=coalesce((p_item->>'active')::boolean,true),
      revision=revision+1,updated_at=clock_timestamp(),updated_by=auth.uid() where id=r.id returning id into result_id;
  end if;
  return result_id;
end $$;

revoke all on function pharmacy_private.available_vessels() from public,anon,authenticated,service_role;
grant execute on function pharmacy_private.available_vessels() to authenticated;
revoke all on function public.pharmacy_available_vessels() from public,anon,authenticated,service_role;
grant execute on function public.pharmacy_available_vessels() to authenticated,service_role;
revoke all on function pharmacy_private.save_category(bigint,text,bigint,integer,text),
  pharmacy_private.delete_category(bigint,bigint,integer),pharmacy_private.save_item(bigint,jsonb,bigint,integer)
  from public,anon,authenticated;
grant execute on function pharmacy_private.save_category(bigint,text,bigint,integer,text),
  pharmacy_private.delete_category(bigint,bigint,integer),pharmacy_private.save_item(bigint,jsonb,bigint,integer)
  to authenticated;
revoke all on function public.save_pharmacy_category(bigint,text,bigint,integer,text) from public,anon,authenticated;
grant execute on function public.save_pharmacy_category(bigint,text,bigint,integer,text) to authenticated;

notify pgrst,'reload schema';
