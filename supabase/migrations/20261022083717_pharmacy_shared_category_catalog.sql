-- Shared category metadata; inventory, its source text and its vessel ownership
-- remain independent. No quantity, expiry, source or fleet assignment is merged.
set local lock_timeout='5s';

create function pharmacy_private.dotation_key(p_value text)
returns text language plpgsql immutable parallel safe set search_path='' as $$
declare raw_value text:=lower(btrim(coalesce(p_value,''))); folded text; parts text[];
begin
  folded:=regexp_replace(translate(raw_value,'àâäáãåçéèêëíìîïóòôöõúùûüýÿ','aaaaaaceeeeiiiiooooouuuuyy'),'[[:space:]]+',' ','g');
  parts:=regexp_match(folded,'^(?:dotation(?: medicale)? )?([abc])(?: (restreinte?))?(?:\s*[-–—(].*)?$');
  if parts is not null then
    return 'dotation '||parts[1]||case when parts[2] is null then '' else ' restreinte' end;
  end if;
  return raw_value;
end $$;
create function pharmacy_private.medical_section_from_source(p_section text)
returns text language sql immutable parallel safe set search_path='' as $$
  with value as (select translate(lower(coalesce(p_section,'')),'àâäáãåçéèêëíìîïóòôöõúùûüýÿ','aaaaaaceeeeiiiiooooouuuuyy') label),
  flags as (select label like '%medicament%' medicines,
    label like '%materiel%' or label like '%pansement%' or label like '%pensement%' equipment from value)
  select case when medicines and not equipment then 'medicines' when equipment and not medicines then 'equipment' else 'unclassified' end from flags;
$$;

-- Keep the full vessel-era catalog and audit history privately. It also proves
-- pre-existing historical branches whose categories had no inventory articles.
alter table public.pharmacy_categories set schema pharmacy_private;
alter table pharmacy_private.pharmacy_categories rename to pharmacy_category_vessel_archive;
revoke all on pharmacy_private.pharmacy_category_vessel_archive from public,anon,authenticated,service_role;

alter table public.pharmacy_inventory add column medical_section text not null default 'unclassified'
  check(medical_section in ('medicines','equipment','unclassified'));
alter table public.pharmacy_inventory add column category_id bigint;
update public.pharmacy_inventory set medical_section=pharmacy_private.medical_section_from_source(section);
comment on column public.pharmacy_inventory.medical_section is
  'Structured branch, inferred only from an explicit source section at migration; ambiguous/legacy entries remain unclassified.';

create table public.pharmacy_category_catalog (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id),
  medical_dotation text not null default '' check(medical_dotation=btrim(medical_dotation)),
  medical_section text not null check(medical_section in ('medicines','equipment','unclassified')),
  name text not null check(name=btrim(name) and length(name) between 1 and 200),
  revision integer not null default 1 check(revision>=1),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id),updated_by uuid references auth.users(id)
);
create unique index pharmacy_category_catalog_scope_name_idx on public.pharmacy_category_catalog
  (company_id,pharmacy_private.dotation_key(medical_dotation),medical_section,lower(name));
create index pharmacy_category_catalog_created_by_idx on public.pharmacy_category_catalog(created_by);
create index pharmacy_category_catalog_updated_by_idx on public.pharmacy_category_catalog(updated_by);
alter table public.pharmacy_category_catalog enable row level security;
revoke all on public.pharmacy_category_catalog from public,anon,authenticated;
grant select on public.pharmacy_category_catalog to authenticated;
comment on table public.pharmacy_category_catalog is
  'Company-wide categories shared by dotation type and medical branch. Stock remains per vessel. Writes use authorized revision RPCs.';

-- A category used in both branches is split without guessing from its name.
-- All original per-vessel IDs remain mapped, including IDs merged together.
create temporary table pharmacy_catalog_seed on commit drop as
with expanded as (
  select a.id legacy_id,a.company_id,a.medical_dotation,a.name,a.revision,a.created_at,a.updated_at,a.created_by,a.updated_by,
    coalesce(s.medical_section,'unclassified') medical_section
  from pharmacy_private.pharmacy_category_vessel_archive a
  left join lateral (
    select distinct i.medical_section from public.pharmacy_inventory i
    where i.company_id=a.company_id and i.vessel_id=a.vessel_id
      and pharmacy_private.dotation_key(i.medical_dotation)=pharmacy_private.dotation_key(a.medical_dotation)
      and lower(btrim(i.category))=lower(a.name)
  ) s on true
  union all
  select null::bigint,i.company_id,i.medical_dotation,btrim(i.category),i.revision,i.created_at,i.updated_at,i.created_by,i.updated_by,i.medical_section
  from public.pharmacy_inventory i where btrim(i.category)<>'' and not exists (
    select 1 from pharmacy_private.pharmacy_category_vessel_archive a where a.company_id=i.company_id and a.vessel_id=i.vessel_id
      and pharmacy_private.dotation_key(a.medical_dotation)=pharmacy_private.dotation_key(i.medical_dotation)
      and lower(a.name)=lower(btrim(i.category)))
), ranked as (
  select *,row_number() over(partition by company_id,pharmacy_private.dotation_key(medical_dotation),medical_section,lower(name)
    order by legacy_id nulls last,created_at,name) spelling,
    min(legacy_id) over(partition by company_id,pharmacy_private.dotation_key(medical_dotation),medical_section,lower(name)) proposed_id,
    max(revision) over(partition by company_id,pharmacy_private.dotation_key(medical_dotation),medical_section,lower(name))+1 initial_revision
  from expanded
), selected as (
  select * from ranked where spelling=1
)
select *,row_number() over(partition by proposed_id order by medical_section,company_id,name) id_use from selected;
select pg_catalog.setval(pg_catalog.pg_get_serial_sequence('public.pharmacy_category_catalog','id'),
  greatest(coalesce((select max(id) from pharmacy_private.pharmacy_category_vessel_archive),0)+1,1),false);
insert into public.pharmacy_category_catalog(id,company_id,medical_dotation,medical_section,name,revision,created_at,updated_at,created_by,updated_by)
overriding system value
select case when proposed_id is not null and id_use=1 then proposed_id
    else pg_catalog.nextval(pg_catalog.pg_get_serial_sequence('public.pharmacy_category_catalog','id')) end,
  company_id,medical_dotation,medical_section,name,initial_revision,created_at,updated_at,created_by,updated_by
from pharmacy_catalog_seed;

create table pharmacy_private.pharmacy_category_legacy_ids (
  legacy_id bigint not null,vessel_id bigint not null,company_id bigint not null,
  category_id bigint not null references public.pharmacy_category_catalog(id) on delete cascade,
  primary key(legacy_id,category_id)
);
alter table pharmacy_private.pharmacy_category_legacy_ids enable row level security;
revoke all on pharmacy_private.pharmacy_category_legacy_ids from public,anon,authenticated,service_role;
create index pharmacy_category_legacy_ids_category_idx on pharmacy_private.pharmacy_category_legacy_ids(category_id);
insert into pharmacy_private.pharmacy_category_legacy_ids(legacy_id,vessel_id,company_id,category_id)
select a.id,a.vessel_id,a.company_id,k.id from pharmacy_private.pharmacy_category_vessel_archive a
join public.pharmacy_category_catalog k on k.company_id=a.company_id
  and pharmacy_private.dotation_key(k.medical_dotation)=pharmacy_private.dotation_key(a.medical_dotation)
  and lower(k.name)=lower(a.name)
where exists(select 1 from public.pharmacy_inventory i where i.company_id=a.company_id and i.vessel_id=a.vessel_id
  and pharmacy_private.dotation_key(i.medical_dotation)=pharmacy_private.dotation_key(a.medical_dotation)
  and lower(btrim(i.category))=lower(a.name) and i.medical_section=k.medical_section)
  or (k.medical_section='unclassified' and not exists(select 1 from public.pharmacy_inventory i
    where i.company_id=a.company_id and i.vessel_id=a.vessel_id
      and pharmacy_private.dotation_key(i.medical_dotation)=pharmacy_private.dotation_key(a.medical_dotation)
      and lower(btrim(i.category))=lower(a.name)));
update public.pharmacy_inventory i set category_id=k.id from public.pharmacy_category_catalog k
where k.company_id=i.company_id and pharmacy_private.dotation_key(k.medical_dotation)=pharmacy_private.dotation_key(i.medical_dotation)
  and k.medical_section=i.medical_section and lower(k.name)=lower(btrim(i.category)) and btrim(i.category)<>'';
alter table public.pharmacy_inventory add constraint pharmacy_inventory_category_id_fkey
  foreign key(category_id) references public.pharmacy_category_catalog(id);
create index pharmacy_inventory_category_id_idx on public.pharmacy_inventory(category_id);

-- Read only category metadata for a vessel the real account can access, using
-- the current assignment, its inventory snapshots or the private legacy proof.
create function pharmacy_private.has_dotation_context(p_company_id bigint,p_vessel_id bigint,p_dotation text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(pharmacy_private.can_access(p_company_id,p_vessel_id),false) and (
    exists(select 1 from public.vessels v where v.id=p_vessel_id and v.company_id=p_company_id
      and pharmacy_private.dotation_key(v.medical_dotation)=pharmacy_private.dotation_key(p_dotation))
    or exists(select 1 from public.pharmacy_inventory i where i.company_id=p_company_id and i.vessel_id=p_vessel_id
      and pharmacy_private.dotation_key(i.medical_dotation)=pharmacy_private.dotation_key(p_dotation))
    or exists(select 1 from pharmacy_private.pharmacy_category_vessel_archive a where a.company_id=p_company_id and a.vessel_id=p_vessel_id
      and pharmacy_private.dotation_key(a.medical_dotation)=pharmacy_private.dotation_key(p_dotation)));
$$;
create function pharmacy_private.can_read_catalog(p_company_id bigint,p_dotation text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.vessels v where v.company_id=p_company_id
    and pharmacy_private.has_dotation_context(p_company_id,v.id,p_dotation));
$$;
create policy pharmacy_category_catalog_read on public.pharmacy_category_catalog for select to authenticated
  using(pharmacy_private.can_read_catalog(company_id,medical_dotation));
create function pharmacy_private.category_rows()
returns table(id bigint,company_id bigint,vessel_id bigint,name text,revision integer,created_at timestamptz,
  updated_at timestamptz,created_by uuid,updated_by uuid,medical_dotation text,medical_section text)
language sql stable security definer set search_path='' as $$
  select k.id,k.company_id,v.id,k.name,k.revision,k.created_at,k.updated_at,k.created_by,k.updated_by,k.medical_dotation,k.medical_section
  from public.pharmacy_category_catalog k join public.vessels v on v.company_id=k.company_id
  where pharmacy_private.has_dotation_context(k.company_id,v.id,k.medical_dotation);
$$;
create view public.pharmacy_categories with(security_invoker=true,security_barrier=true) as
  select * from pharmacy_private.category_rows();
revoke all on public.pharmacy_categories from public,anon,authenticated;
grant select on public.pharmacy_categories to authenticated;
comment on view public.pharmacy_categories is
  'Read-only compatibility projection: shared canonical IDs and category metadata with an authorized contextual vessel_id. Inventory is never projected across vessels.';

-- Company-wide serialization precedes vessel/category/article locks. A shared
-- rename can touch several inventories without deadlocking per-vessel saves.
drop function public.save_pharmacy_category(bigint,text,bigint,integer,text);
drop function pharmacy_private.save_category(bigint,text,bigint,integer,text);
create function pharmacy_private.save_category(p_vessel_id bigint,p_name text,p_id bigint,p_revision integer,p_medical_dotation text,p_medical_section text)
returns bigint language plpgsql security definer set search_path='' as $$
declare c bigint:=public.current_planning_company_id(); r public.pharmacy_category_catalog%rowtype;
  category_name text:=btrim(p_name); result_id bigint; current_dotation text; parent_dotation text;
  branch text; mapped_id bigint; mapping_count bigint;
begin
  if not coalesce(pharmacy_private.can_manage(c,p_vessel_id),false) then
    raise exception using errcode='42501',message='Accès refusé aux catégories de ce navire.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pharmacy-catalog:'||c::text,0));
  select btrim(coalesce(medical_dotation,'')) into current_dotation from public.vessels
    where id=p_vessel_id and company_id=c for update;
  if not found or not coalesce(pharmacy_private.can_manage(c,p_vessel_id),false) then
    raise exception using errcode='42501',message='Navire inaccessible.'; end if;
  if category_name is null or length(category_name) not between 1 and 200 then
    raise exception using errcode='22023',message='Renseignez une catégorie de 1 à 200 caractères.'; end if;
  if p_medical_section is not null and p_medical_section not in ('medicines','equipment','unclassified') then
    raise exception using errcode='22023',message='Choisissez une branche médicale valide.'; end if;
  if p_id is not null then
    select * into r from public.pharmacy_category_catalog where id=p_id and company_id=c for update;
    if r.id is null then
      select count(*),min(m.category_id) into mapping_count,mapped_id from pharmacy_private.pharmacy_category_legacy_ids m
        join public.pharmacy_category_catalog k on k.id=m.category_id
        where m.legacy_id=p_id and m.company_id=c and m.vessel_id=p_vessel_id
          and (p_medical_section is null or k.medical_section=p_medical_section);
      if mapping_count>1 then raise exception using errcode='40001',message='Cette ancienne catégorie a été répartie entre plusieurs branches. Rechargez l’inventaire.'; end if;
      select * into r from public.pharmacy_category_catalog where id=mapped_id and company_id=c for update;
    end if;
    if r.id is null or not pharmacy_private.has_dotation_context(c,p_vessel_id,r.medical_dotation) then
      raise exception using errcode='42501',message='Catégorie introuvable ou accès refusé.'; end if;
    if p_revision is distinct from r.revision then
      raise exception using errcode='40001',message='Cette catégorie partagée a été modifiée. Rechargez l’inventaire.'; end if;
    parent_dotation:=r.medical_dotation; branch:=r.medical_section;
    if (p_medical_dotation is not null and pharmacy_private.dotation_key(p_medical_dotation)<>pharmacy_private.dotation_key(parent_dotation))
      or (p_medical_section is not null and p_medical_section<>branch) then
      raise exception using errcode='40001',message='La dotation ou la branche de cette catégorie a changé. Rechargez l’inventaire.'; end if;
  else
    parent_dotation:=btrim(coalesce(p_medical_dotation,current_dotation)); branch:=coalesce(p_medical_section,'unclassified');
    if not pharmacy_private.has_dotation_context(c,p_vessel_id,parent_dotation) then
      raise exception using errcode='40001',message='Cette dotation n’est pas affectée à ce navire. Rechargez l’inventaire.'; end if;
    parent_dotation:=coalesce((select medical_dotation from public.pharmacy_category_catalog where company_id=c
      and pharmacy_private.dotation_key(medical_dotation)=pharmacy_private.dotation_key(parent_dotation) order by id limit 1),parent_dotation);
  end if;
  if exists(select 1 from public.pharmacy_category_catalog where company_id=c
    and pharmacy_private.dotation_key(medical_dotation)=pharmacy_private.dotation_key(parent_dotation)
    and medical_section=branch and lower(name)=lower(category_name) and (r.id is null or id<>r.id)) then
    raise exception using errcode='23505',message='Une catégorie de ce nom existe déjà dans cette dotation et cette branche.'; end if;
  if p_id is null then
    insert into public.pharmacy_category_catalog(company_id,medical_dotation,medical_section,name,created_by,updated_by)
      values(c,parent_dotation,branch,category_name,auth.uid(),auth.uid()) returning id into result_id;
  else
    update public.pharmacy_category_catalog set name=category_name,revision=revision+1,
      updated_at=clock_timestamp(),updated_by=auth.uid() where id=r.id returning id into result_id;
    update public.pharmacy_inventory set category=category_name,revision=revision+1,
      updated_at=clock_timestamp(),updated_by=auth.uid() where company_id=c and category_id=r.id
        and pharmacy_private.dotation_key(medical_dotation)=pharmacy_private.dotation_key(parent_dotation)
        and medical_section=branch and category is distinct from category_name;
  end if;
  return result_id;
end $$;
create function public.save_pharmacy_category(p_vessel_id bigint,p_name text,p_id bigint default null,
  p_revision integer default null,p_medical_dotation text default null,p_medical_section text default null)
returns bigint language sql security invoker set search_path='' as $$
  select pharmacy_private.save_category(p_vessel_id,p_name,p_id,p_revision,p_medical_dotation,p_medical_section);
$$;

create or replace function pharmacy_private.delete_category(p_vessel_id bigint,p_id bigint,p_revision integer)
returns void language plpgsql security definer set search_path='' as $$
declare c bigint:=public.current_planning_company_id(); r public.pharmacy_category_catalog%rowtype;
  mapped_id bigint; mapping_count bigint;
begin
  if not coalesce(pharmacy_private.can_manage(c,p_vessel_id),false) then
    raise exception using errcode='42501',message='Accès refusé aux catégories de ce navire.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pharmacy-catalog:'||c::text,0));
  perform 1 from public.vessels where id=p_vessel_id and company_id=c for update;
  if not found or not coalesce(pharmacy_private.can_manage(c,p_vessel_id),false) then
    raise exception using errcode='42501',message='Navire inaccessible.'; end if;
  select * into r from public.pharmacy_category_catalog where id=p_id and company_id=c for update;
  if r.id is null then
    select count(*),min(category_id) into mapping_count,mapped_id from pharmacy_private.pharmacy_category_legacy_ids
      where legacy_id=p_id and company_id=c and vessel_id=p_vessel_id;
    if mapping_count>1 then raise exception using errcode='40001',message='Cette ancienne catégorie a été répartie entre plusieurs branches. Rechargez l’inventaire.'; end if;
    select * into r from public.pharmacy_category_catalog where id=mapped_id and company_id=c for update;
  end if;
  if r.id is null or not pharmacy_private.has_dotation_context(c,p_vessel_id,r.medical_dotation) then
    raise exception using errcode='42501',message='Catégorie introuvable ou accès refusé.'; end if;
  if p_revision is distinct from r.revision then
    raise exception using errcode='40001',message='Cette catégorie partagée a été modifiée. Rechargez l’inventaire.'; end if;
  update public.pharmacy_inventory set category='',category_id=null,revision=revision+1,
    updated_at=clock_timestamp(),updated_by=auth.uid() where company_id=c and category_id=r.id
      and pharmacy_private.dotation_key(medical_dotation)=pharmacy_private.dotation_key(r.medical_dotation)
      and medical_section=r.medical_section;
  delete from public.pharmacy_category_catalog where id=r.id;
end $$;

create or replace function pharmacy_private.save_item(p_vessel_id bigint,p_item jsonb,p_id bigint,p_revision integer)
returns bigint language plpgsql security definer set search_path='' as $$
declare c bigint:=public.current_planning_company_id(); result_id bigint; r public.pharmacy_inventory%rowtype;
  category_name text; canonical_id bigint; canonical_name text; current_dotation text; parent_dotation text; branch text;
begin
  if not coalesce(pharmacy_private.can_manage(c,p_vessel_id),false) then
    raise exception using errcode='42501',message='Accès refusé à la modification de cet inventaire.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pharmacy-catalog:'||c::text,0));
  select btrim(coalesce(medical_dotation,'')) into current_dotation from public.vessels
    where id=p_vessel_id and company_id=c for update;
  if not found or not coalesce(pharmacy_private.can_manage(c,p_vessel_id),false) then
    raise exception using errcode='42501',message='Navire inaccessible.'; end if;
  if p_item is null or jsonb_typeof(p_item)<>'object' or octet_length(p_item::text)>20000 then
    raise exception 'Contenu de l’article invalide.'; end if;
  if p_id is not null then
    select * into r from public.pharmacy_inventory where id=p_id and company_id=c and vessel_id=p_vessel_id for update;
    if r.id is null then raise exception using errcode='42501',message='Article introuvable ou accès refusé.'; end if;
    if p_revision is distinct from r.revision then raise exception using errcode='40001',message='Cet article a été modifié sur un autre appareil. Rechargez l’inventaire.'; end if;
    parent_dotation:=r.medical_dotation; branch:=r.medical_section;
  else
    parent_dotation:=current_dotation; branch:=pharmacy_private.medical_section_from_source(p_item->>'section');
  end if;
  if p_item ? 'medical_dotation' and pharmacy_private.dotation_key(p_item->>'medical_dotation')<>pharmacy_private.dotation_key(parent_dotation) then
    raise exception using errcode='40001',message='La dotation de cet article a changé. Rechargez l’inventaire.'; end if;
  if p_item ? 'medical_section' then
    if p_item->>'medical_section' is null or p_item->>'medical_section' not in ('medicines','equipment','unclassified') then
      raise exception using errcode='22023',message='Choisissez une branche médicale valide.'; end if;
    branch:=p_item->>'medical_section';
  end if;
  category_name:=btrim(coalesce(p_item->>'category',''));
  if length(category_name)>200 then
    raise exception using errcode='22023',message='Le nom de catégorie ne doit pas dépasser 200 caractères.'; end if;
  -- category_id input is deliberately ignored: older forms spread the previous
  -- row and keep that ID after changing category text. Resolve within this scope.
  if category_name<>'' then
    select id,name into canonical_id,canonical_name from public.pharmacy_category_catalog where company_id=c
      and pharmacy_private.dotation_key(medical_dotation)=pharmacy_private.dotation_key(parent_dotation)
      and medical_section=branch and lower(name)=lower(category_name);
    if found then category_name:=canonical_name;
    else
      insert into public.pharmacy_category_catalog(company_id,medical_dotation,medical_section,name,created_by,updated_by)
        values(c,parent_dotation,branch,category_name,auth.uid(),auth.uid()) returning id into canonical_id;
    end if;
  end if;
  if p_id is null then
    insert into public.pharmacy_inventory(company_id,vessel_id,medical_dotation,medical_section,category_id,section,category,brand,designation,lot_number,quantity,required_quantity,expires_on,expiry_text,expiry_precision,notes,active,created_by,updated_by)
    values(c,p_vessel_id,parent_dotation,branch,canonical_id,coalesce(p_item->>'section',''),category_name,coalesce(p_item->>'brand',''),btrim(p_item->>'designation'),coalesce(p_item->>'lot_number',''),
      coalesce(p_item->>'quantity',''),coalesce(p_item->>'required_quantity',''),nullif(p_item->>'expires_on','')::date,
      coalesce(p_item->>'expiry_text',''),coalesce(p_item->>'expiry_precision','unknown'),coalesce(p_item->>'notes',''),coalesce((p_item->>'active')::boolean,true),auth.uid(),auth.uid())
    returning id into result_id;
  else
    update public.pharmacy_inventory set medical_section=branch,category_id=canonical_id,section=coalesce(p_item->>'section',''),category=category_name,brand=coalesce(p_item->>'brand',''),designation=btrim(p_item->>'designation'),
      lot_number=coalesce(p_item->>'lot_number',''),quantity=coalesce(p_item->>'quantity',''),required_quantity=coalesce(p_item->>'required_quantity',''),expires_on=nullif(p_item->>'expires_on','')::date,
      expiry_text=coalesce(p_item->>'expiry_text',''),expiry_precision=coalesce(p_item->>'expiry_precision','unknown'),notes=coalesce(p_item->>'notes',''),active=coalesce((p_item->>'active')::boolean,true),
      revision=revision+1,updated_at=clock_timestamp(),updated_by=auth.uid() where id=r.id returning id into result_id;
  end if;
  return result_id;
end $$;

revoke all on function pharmacy_private.dotation_key(text),pharmacy_private.medical_section_from_source(text),
  pharmacy_private.has_dotation_context(bigint,bigint,text),pharmacy_private.can_read_catalog(bigint,text),pharmacy_private.category_rows(),
  pharmacy_private.save_category(bigint,text,bigint,integer,text,text),pharmacy_private.delete_category(bigint,bigint,integer),
  pharmacy_private.save_item(bigint,jsonb,bigint,integer) from public,anon,authenticated,service_role;
grant execute on function pharmacy_private.dotation_key(text),pharmacy_private.medical_section_from_source(text),
  pharmacy_private.has_dotation_context(bigint,bigint,text),pharmacy_private.can_read_catalog(bigint,text),pharmacy_private.category_rows(),
  pharmacy_private.save_category(bigint,text,bigint,integer,text,text),pharmacy_private.delete_category(bigint,bigint,integer),
  pharmacy_private.save_item(bigint,jsonb,bigint,integer) to authenticated;
revoke all on function public.save_pharmacy_category(bigint,text,bigint,integer,text,text) from public,anon,authenticated,service_role;
grant execute on function public.save_pharmacy_category(bigint,text,bigint,integer,text,text) to authenticated;

notify pgrst,'reload schema';
