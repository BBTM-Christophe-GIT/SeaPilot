-- Vessel-scoped pharmacy category catalog. Existing inventory values and source
-- provenance are preserved; only later explicit rename/delete actions reclassify.
set local lock_timeout='5s';

create table public.pharmacy_categories (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id),
  vessel_id bigint not null references public.vessels(id),
  name text not null check(name=btrim(name) and length(name) between 1 and 200),
  revision integer not null default 1 check(revision>=1),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);
create unique index pharmacy_categories_vessel_name_idx
  on public.pharmacy_categories(vessel_id,lower(name));
create index pharmacy_categories_company_idx on public.pharmacy_categories(company_id);
create index pharmacy_categories_created_by_idx on public.pharmacy_categories(created_by);
create index pharmacy_categories_updated_by_idx on public.pharmacy_categories(updated_by);
alter table public.pharmacy_categories enable row level security;
revoke all on public.pharmacy_categories from public,anon,authenticated;
grant select on public.pharmacy_categories to authenticated;
create policy pharmacy_categories_read on public.pharmacy_categories for select to authenticated
  using(pharmacy_private.can_access(company_id,vessel_id));
comment on table public.pharmacy_categories is
  'Pharmacy categories, including empty groups. Changes use vessel-authorized revision RPCs; deleting a category never deletes inventory.';

-- Include categories used only by retired articles. DISTINCT ON chooses one
-- canonical spelling if historical clients supplied different letter case.
insert into public.pharmacy_categories(company_id,vessel_id,name,created_by,updated_by)
select distinct on (vessel_id,lower(btrim(category)))
  company_id,vessel_id,btrim(category),created_by,updated_by
from public.pharmacy_inventory
where btrim(category)<>''
order by vessel_id,lower(btrim(category)),id;

create function pharmacy_private.save_category(p_vessel_id bigint,p_name text,p_id bigint,p_revision integer)
returns bigint language plpgsql security definer set search_path='' as $$
declare c bigint:=public.current_planning_company_id(); r public.pharmacy_categories%rowtype;
  category_name text:=btrim(p_name); result_id bigint;
begin
  if not coalesce(pharmacy_private.can_manage(c,p_vessel_id),false) then
    raise exception using errcode='42501',message='Accès refusé aux catégories de ce navire.';
  end if;
  -- All category changes and item saves take this lock before any article lock.
  perform 1 from public.vessels where id=p_vessel_id and company_id=c for update;
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
  end if;
  if exists(select 1 from public.pharmacy_categories
    where vessel_id=p_vessel_id and lower(name)=lower(category_name) and (p_id is null or id<>p_id)) then
    raise exception using errcode='23505',message='Une catégorie de ce nom existe déjà pour ce navire.';
  end if;
  if p_id is null then
    insert into public.pharmacy_categories(company_id,vessel_id,name,created_by,updated_by)
      values(c,p_vessel_id,category_name,auth.uid(),auth.uid()) returning id into result_id;
  else
    update public.pharmacy_categories set name=category_name,revision=revision+1,
      updated_at=clock_timestamp(),updated_by=auth.uid() where id=r.id returning id into result_id;
    update public.pharmacy_inventory set category=category_name,revision=revision+1,
      updated_at=clock_timestamp(),updated_by=auth.uid()
      where company_id=c and vessel_id=p_vessel_id and lower(btrim(category))=lower(r.name)
        and category is distinct from category_name;
  end if;
  return result_id;
end $$;
create function public.save_pharmacy_category(p_vessel_id bigint,p_name text,p_id bigint default null,p_revision integer default null)
returns bigint language sql security invoker set search_path='' as $$
  select pharmacy_private.save_category(p_vessel_id,p_name,p_id,p_revision);
$$;

create function pharmacy_private.delete_category(p_vessel_id bigint,p_id bigint,p_revision integer)
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
  -- Clear the classification on every matching article, including retired rows.
  -- No quantity, expiry, medical data, source value or provenance is removed.
  update public.pharmacy_inventory set category='',revision=revision+1,
    updated_at=clock_timestamp(),updated_by=auth.uid()
    where company_id=c and vessel_id=p_vessel_id and lower(btrim(category))=lower(r.name);
  delete from public.pharmacy_categories where id=r.id;
end $$;
create function public.delete_pharmacy_category(p_vessel_id bigint,p_id bigint,p_revision integer)
returns void language sql security invoker set search_path='' as $$
  select pharmacy_private.delete_category(p_vessel_id,p_id,p_revision);
$$;

-- Retain the existing full-draft validation and item compare-and-swap contract.
-- Free-form categories from older clients are registered atomically and reuse
-- the canonical spelling of an existing case-insensitive category.
create or replace function pharmacy_private.save_item(p_vessel_id bigint,p_item jsonb,p_id bigint,p_revision integer)
returns bigint language plpgsql security definer set search_path='' as $$
declare c bigint:=public.current_planning_company_id(); result_id bigint; r public.pharmacy_inventory%rowtype;
  category_name text; canonical_name text;
begin
  if not coalesce(pharmacy_private.can_manage(c,p_vessel_id),false) then
    raise exception using errcode='42501',message='Accès refusé à la modification de cet inventaire.'; end if;
  perform 1 from public.vessels where id=p_vessel_id and company_id=c for update;
  if not found then raise exception using errcode='42501',message='Navire inaccessible.'; end if;
  if p_item is null or jsonb_typeof(p_item)<>'object' or octet_length(p_item::text)>20000 then
    raise exception 'Contenu de l’article invalide.'; end if;
  if p_id is not null then
    select * into r from public.pharmacy_inventory where id=p_id and company_id=c and vessel_id=p_vessel_id for update;
    if r.id is null then raise exception using errcode='42501',message='Article introuvable ou accès refusé.'; end if;
    if p_revision is distinct from r.revision then raise exception using errcode='40001',message='Cet article a été modifié sur un autre appareil. Rechargez l’inventaire.'; end if;
  end if;
  category_name:=btrim(coalesce(p_item->>'category',''));
  if length(category_name)>200 then
    raise exception using errcode='22023',message='Le nom de catégorie ne doit pas dépasser 200 caractères.';
  end if;
  if category_name<>'' then
    select name into canonical_name from public.pharmacy_categories
      where company_id=c and vessel_id=p_vessel_id and lower(name)=lower(category_name);
    if found then
      category_name:=canonical_name;
    else
      insert into public.pharmacy_categories(company_id,vessel_id,name,created_by,updated_by)
        values(c,p_vessel_id,category_name,auth.uid(),auth.uid());
    end if;
  end if;
  if p_id is null then
    insert into public.pharmacy_inventory(company_id,vessel_id,section,category,brand,designation,lot_number,quantity,required_quantity,expires_on,expiry_text,expiry_precision,notes,active,created_by,updated_by)
    values(c,p_vessel_id,coalesce(p_item->>'section',''),category_name,coalesce(p_item->>'brand',''),btrim(p_item->>'designation'),coalesce(p_item->>'lot_number',''),
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

revoke all on function pharmacy_private.save_category(bigint,text,bigint,integer),
  pharmacy_private.delete_category(bigint,bigint,integer),pharmacy_private.save_item(bigint,jsonb,bigint,integer)
  from public,anon,authenticated;
grant execute on function pharmacy_private.save_category(bigint,text,bigint,integer),
  pharmacy_private.delete_category(bigint,bigint,integer),pharmacy_private.save_item(bigint,jsonb,bigint,integer)
  to authenticated;
revoke all on function public.save_pharmacy_category(bigint,text,bigint,integer),
  public.delete_pharmacy_category(bigint,bigint,integer) from public,anon,authenticated;
grant execute on function public.save_pharmacy_category(bigint,text,bigint,integer),
  public.delete_pharmacy_category(bigint,bigint,integer) to authenticated;

notify pgrst,'reload schema';
