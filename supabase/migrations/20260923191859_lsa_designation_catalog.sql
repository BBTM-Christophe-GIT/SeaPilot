create temporary table lsa_before_catalog on commit drop as select id,to_jsonb(i) snapshot from public.lsa_items i;

-- Company-owned LSA catalog. Existing certificates, dates and documents are preserved.
create table public.lsa_equipment_types (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id),
  name text not null check (name=btrim(name) and length(name) between 1 and 120),
  legacy_key text,
  active boolean not null default true,
  updated_at timestamptz not null default clock_timestamp(),
  unique(company_id,id), unique(company_id,legacy_key)
);
create unique index lsa_equipment_type_name_idx on public.lsa_equipment_types(company_id,lower(name));
create table public.lsa_designations (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id),
  equipment_type_id bigint not null,
  name text not null check (name=btrim(name) and length(name) between 1 and 120),
  active boolean not null default true,
  updated_at timestamptz not null default clock_timestamp(),
  unique(company_id,id),
  foreign key(company_id,equipment_type_id) references public.lsa_equipment_types(company_id,id)
);
-- A designation identifies one equipment type unambiguously within a company.
create unique index lsa_designation_name_idx on public.lsa_designations(company_id,lower(name));
create index lsa_designation_type_idx on public.lsa_designations(company_id,equipment_type_id);
alter table public.lsa_equipment_types enable row level security;
alter table public.lsa_designations enable row level security;
revoke all on public.lsa_equipment_types,public.lsa_designations from public,anon,authenticated;
grant select on public.lsa_equipment_types,public.lsa_designations to authenticated;
create policy lsa_types_read on public.lsa_equipment_types for select to authenticated using (
  company_id=(select public.current_planning_company_id()) and (select private.lsa_has_access())
);
create policy lsa_designations_read on public.lsa_designations for select to authenticated using (
  company_id=(select public.current_planning_company_id()) and (select private.lsa_has_access())
);

create function private.seed_lsa_catalog(p_company bigint) returns void
language sql security definer set search_path='' as $$
  insert into public.lsa_equipment_types(company_id,name,legacy_key) values
    (p_company,'GMDSS','07-4-gmdss'),(p_company,'Pyrotechnie','07-6-pyrotechnie'),
    (p_company,'Survie','07-8-bouee-feux-retournement-mob'),
    (p_company,'Gilets de Sauvetage','07-2-life-jacket'),(p_company,'Navigation',null);
  insert into public.lsa_designations(company_id,equipment_type_id,name)
  select p_company,t.id,d.name from (values
    ('GMDSS','EPIRB'),('GMDSS','SART'),('GMDSS','Batterie VHF GMDSS'),
    ('Pyrotechnie','Fusée à parachute'),('Pyrotechnie','Fusée du lance amarre'),
    ('Pyrotechnie','Feu à main'),('Pyrotechnie','Fumigène flottant'),
    ('Survie','Combinaison d’immersion'),('Survie','Feu à retournement'),
    ('Survie','Lampe flash'),('Survie','Lampe à éclat'),('Survie','Couverture de survie'),
    ('Gilets de Sauvetage','VFI - 150N'),('Gilets de Sauvetage','VFI - 250N'),('Gilets de Sauvetage','VFI - 300N'),
    ('Navigation','Bloc Marine')
  ) d(type_name,name) join public.lsa_equipment_types t on t.company_id=p_company and t.name=d.type_name;
$$;
revoke all on function private.seed_lsa_catalog(bigint) from public,anon,authenticated;
select private.seed_lsa_catalog(id) from public.companies;
create function private.seed_new_company_lsa_catalog() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform private.seed_lsa_catalog(new.id); return new; end $$;
revoke all on function private.seed_new_company_lsa_catalog() from public,anon,authenticated;
create trigger seed_company_lsa_catalog after insert on public.companies
for each row execute function private.seed_new_company_lsa_catalog();

alter table public.lsa_items
  add column designation_id bigint,
  add column item_number integer check(item_number>0),
  add column brand text check(length(brand)<=200),
  add column model text check(length(model)<=200),
  add column serial_number text check(length(serial_number)<=200),
  add column original_designation text,
  add foreign key(company_id,designation_id) references public.lsa_designations(company_id,id),
  add constraint lsa_number_pair_check check((designation_id is null)=(item_number is null)),
  drop constraint lsa_items_category_check;
alter table public.lsa_items add constraint lsa_items_category_check check(category_key in
  ('07-2-life-jacket','07-4-gmdss','07-6-pyrotechnie','07-8-bouee-feux-retournement-mob') or category_key ~ '^lsa-type-[0-9]+$');
create unique index lsa_item_number_idx on public.lsa_items(company_id,vessel_id,designation_id,item_number) where designation_id is not null;
create index lsa_item_designation_idx on public.lsa_items(company_id,designation_id);

-- Only unambiguous prefixes are attached to the new catalog. Original names stay intact.
-- A VFI 275N is never reclassified as 250N/300N, nor an HRU as an EPIRB.
update public.lsa_items set original_designation=document_title;
with matched as (
  select i.id,i.company_id,i.vessel_id,d.id designation_id,
    nullif((regexp_match(i.document_title,' - ([0-9]{1,6})$'))[1],'')::integer candidate
  from public.lsa_items i join public.lsa_designations d on d.company_id=i.company_id
  where i.document_title=d.name or i.document_title like d.name||' - %'
    or (d.name='Fusée à parachute' and i.document_title like 'Fusée à parachute %')
    or (d.name='Feu à main' and i.document_title like 'Feu à main rouge%')
), ranked as (
  select *,row_number() over(partition by company_id,vessel_id,designation_id,candidate order by id) duplicate_rank,
    coalesce(max(candidate) over(partition by company_id,vessel_id,designation_id),0) last_number from matched
), numbered as (
  select *,case when candidate>0 and duplicate_rank=1 then candidate
    else last_number+count(*) filter(where candidate is null or candidate=0 or duplicate_rank>1)
      over(partition by company_id,vessel_id,designation_id order by id) end assigned_number from ranked
)
update public.lsa_items i set designation_id=n.designation_id,item_number=n.assigned_number
from numbered n where i.id=n.id;

-- Persistent high-water marks prevent reuse, even after changing a fiche's designation.
create table private.lsa_designation_counters (
  company_id bigint not null,
  vessel_id bigint not null references public.vessels(id),
  designation_id bigint not null,
  last_number integer not null check(last_number>0),
  primary key(company_id,vessel_id,designation_id),
  foreign key(company_id,designation_id) references public.lsa_designations(company_id,id)
);
alter table private.lsa_designation_counters enable row level security;
revoke all on private.lsa_designation_counters from public,anon,authenticated;
create index lsa_counter_vessel_idx on private.lsa_designation_counters(vessel_id);
create index lsa_counter_designation_idx on private.lsa_designation_counters(company_id,designation_id);
insert into private.lsa_designation_counters(company_id,vessel_id,designation_id,last_number)
select company_id,vessel_id,designation_id,max(item_number) from public.lsa_items where designation_id is not null group by company_id,vessel_id,designation_id;

create or replace function private.save_lsa_item(p_vessel_id bigint,p_item jsonb,p_id bigint,p_expected_updated_at timestamptz)
returns bigint language plpgsql security definer set search_path='' as $$
declare
  company bigint := public.current_planning_company_id(); result_id bigint;
  vessel public.vessels; previous public.lsa_items; designation public.lsa_designations; equipment public.lsa_equipment_types;
  chosen bigint := nullif(p_item->>'designation_id','')::bigint;
  next_number integer; item_title text; category text; selected_category_label text;
  expiry date := nullif(p_item->>'expires_on','')::date;
begin
  if auth.uid() is null or not private.lsa_has_access() or not public.has_company_role(company,array['admin','direction','armement']) then
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

create function private.save_lsa_catalog_entry(p_kind text,p_entry jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
declare
  company bigint:=public.current_planning_company_id(); entry_id bigint:=nullif(p_entry->>'id','')::bigint;
  label text:=btrim(p_entry->>'name'); selected_type bigint:=nullif(p_entry->>'equipment_type_id','')::bigint;
  result_id bigint; old_designation public.lsa_designations;
  available boolean:=coalesce((p_entry->>'active')::boolean,true);
begin
  if auth.uid() is null or not private.lsa_has_access() or not public.has_company_role(company,array['admin']) then
    raise exception 'Seuls les administrateurs peuvent modifier les désignations LSA.' using errcode='42501'; end if;
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
revoke all on function private.save_lsa_catalog_entry(text,jsonb) from public,anon;
grant execute on function private.save_lsa_catalog_entry(text,jsonb) to authenticated;
create function public.save_lsa_catalog_entry(p_kind text,p_entry jsonb) returns bigint
language sql security invoker set search_path='' as $$ select private.save_lsa_catalog_entry(p_kind,p_entry); $$;
revoke all on function public.save_lsa_catalog_entry(text,jsonb) from public,anon;
grant execute on function public.save_lsa_catalog_entry(text,jsonb) to authenticated;
notify pgrst,'reload schema';

-- Read-only number preview; the transactional save remains authoritative under concurrency.
create function private.lsa_next_item_number(p_vessel_id bigint,p_designation_id bigint) returns integer
language plpgsql stable security definer set search_path='' as $$
declare company bigint:=public.current_planning_company_id();
begin
  if auth.uid() is null or not private.lsa_has_access() or not public.has_company_role(company,array['admin','direction','armement'])
    or not exists(select 1 from public.vessels where id=p_vessel_id and company_id=company and asset_kind='vessel')
    or not exists(select 1 from public.lsa_designations where id=p_designation_id and company_id=company) then
    raise exception 'Numérotation LSA non autorisée.' using errcode='42501'; end if;
  return coalesce((select last_number from private.lsa_designation_counters
    where company_id=company and vessel_id=p_vessel_id and designation_id=p_designation_id),0)+1;
end $$;
revoke all on function private.lsa_next_item_number(bigint,bigint) from public,anon;
grant execute on function private.lsa_next_item_number(bigint,bigint) to authenticated;
create function public.lsa_next_item_number(p_vessel_id bigint,p_designation_id bigint) returns integer
language sql stable security invoker set search_path='' as $$ select private.lsa_next_item_number(p_vessel_id,p_designation_id); $$;
revoke all on function public.lsa_next_item_number(bigint,bigint) from public,anon;
grant execute on function public.lsa_next_item_number(bigint,bigint) to authenticated;
notify pgrst,'reload schema';

-- Verify this additive migration has not changed any pre-existing business field.
do $$ begin
  if exists(select 1 from lsa_before_catalog b left join public.lsa_items i on i.id=b.id
    where b.snapshot is distinct from (to_jsonb(i)-array['designation_id','item_number','brand','model','serial_number','original_designation'])) then
    raise exception 'Migration LSA interrompue : les données existantes ont changé.';
  end if;
end $$;
