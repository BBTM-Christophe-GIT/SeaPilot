set local lock_timeout = '5s';

alter table public.pharmacy_inventory
  add column required_stock_unit text check (length(btrim(required_stock_unit)) between 1 and 100),
  add column required_strength text check (length(btrim(required_strength)) between 1 and 100),
  add column required_package_size integer check (required_package_size between 1 and 1000000);

comment on column public.pharmacy_inventory.required_stock_quantity is 'Target count, in required_stock_unit when specified. Legacy targets without independent units can still use the historical stock unit.';
comment on column public.pharmacy_inventory.required_strength is 'Target volume or dose per unit. Stock and dotation may have different presentations.';

create function pharmacy_private.designation_key(p_value text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select translate(lower(btrim(regexp_replace(normalize(coalesce(p_value, '')), '[[:space:]]+', ' ', 'g'))),
    'àâäçéèêëîïôöùûüÿ', 'aaaceeeeiioouuuy');
$$;

create table pharmacy_private.dotation_requirements (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id),
  dotation_key text not null check (dotation_key <> ''),
  medical_section text not null check (medical_section in ('medicines', 'equipment')),
  designation_key text not null check (designation_key <> ''),
  designation text not null check (length(designation) between 1 and 2000),
  required_quantity text not null check (length(required_quantity) <= 250),
  required_stock_quantity numeric check (required_stock_quantity between 0 and 1000000000000 and scale(trim_scale(required_stock_quantity)) <= 3),
  required_stock_unit text check (length(btrim(required_stock_unit)) between 1 and 100),
  required_strength text check (length(btrim(required_strength)) between 1 and 100),
  required_package_size integer check (required_package_size between 1 and 1000000),
  revision integer not null default 1 check (revision >= 1)
);

alter table pharmacy_private.dotation_requirements enable row level security;
revoke all on pharmacy_private.dotation_requirements from public, anon, authenticated, service_role;
create policy pharmacy_dotation_requirements_private on pharmacy_private.dotation_requirements
  for all to authenticated using (false) with check (false);
revoke all on function pharmacy_private.designation_key(text) from public, anon, authenticated, service_role;

-- Keep the unique index bounded for long imported names. All matching and
-- updates also check the full text, so a collision cannot change another target.
create unique index pharmacy_dotation_requirement_scope_idx on pharmacy_private.dotation_requirements (
  company_id, md5(dotation_key), medical_section, md5(designation_key)
);

-- Keep differing legacy targets on their original rows until a user explicitly
-- defines a common target. A blank target does not disagree with a known one.
with legacy_targets as (
  select distinct company_id, pharmacy_private.dotation_key(medical_dotation) as dotation_key,
    medical_section, pharmacy_private.designation_key(designation) as designation_key,
    min(btrim(designation)) over (partition by company_id, pharmacy_private.dotation_key(medical_dotation),
      medical_section, pharmacy_private.designation_key(designation)) as designation,
    btrim(required_quantity) as required_quantity, required_stock_quantity,
    case when required_stock_quantity is not null then stock_unit end as required_stock_unit,
    case when required_stock_quantity is not null then strength end as required_strength
  from public.pharmacy_inventory
  where active and not outside_dotation and medical_section in ('medicines', 'equipment')
    and pharmacy_private.dotation_key(medical_dotation) <> ''
    and pharmacy_private.designation_key(designation) <> ''
    and (btrim(required_quantity) <> '' or required_stock_quantity is not null)
), candidates as (
  select *, count(*) over (partition by company_id, dotation_key, medical_section, designation_key) as variants
  from legacy_targets
)
insert into pharmacy_private.dotation_requirements (
  company_id, dotation_key, medical_section, designation_key, designation, required_quantity,
  required_stock_quantity, required_stock_unit, required_strength
)
select company_id, dotation_key, medical_section, designation_key, designation, required_quantity,
  required_stock_quantity, required_stock_unit, required_strength
from candidates where variants = 1;

update public.pharmacy_inventory i set
  required_quantity = d.required_quantity, required_stock_quantity = d.required_stock_quantity,
  required_stock_unit = d.required_stock_unit, required_strength = d.required_strength,
  revision = i.revision + 1, updated_at = clock_timestamp()
from pharmacy_private.dotation_requirements d
where i.active and not i.outside_dotation and i.company_id = d.company_id
  and pharmacy_private.dotation_key(i.medical_dotation) = d.dotation_key
  and i.medical_section = d.medical_section and pharmacy_private.designation_key(i.designation) = d.designation_key
  and (btrim(i.required_quantity), i.required_stock_quantity, i.required_stock_unit, i.required_strength)
    is distinct from (d.required_quantity, d.required_stock_quantity, d.required_stock_unit, d.required_strength);

create function pharmacy_private.list_dotation_requirements(p_vessel_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c bigint := public.current_planning_company_id(); assigned_key text; result jsonb;
begin
  if not coalesce(pharmacy_private.can_access(c, p_vessel_id), false) then
    raise exception using errcode = '42501', message = 'Navire inaccessible.';
  end if;
  select pharmacy_private.dotation_key(v.medical_dotation) into assigned_key
  from public.vessels v where v.company_id = c and v.id = p_vessel_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'dotation_key', d.dotation_key, 'medical_section', d.medical_section, 'designation_key', d.designation_key, 'designation', d.designation,
    'required_quantity', d.required_quantity, 'required_stock_quantity', d.required_stock_quantity,
    'required_stock_unit', d.required_stock_unit, 'required_strength', d.required_strength,
    'required_package_size', d.required_package_size, 'dotation_requirement_revision', d.revision
  ) order by d.dotation_key, d.medical_section, d.designation_key), '[]'::jsonb) into result
  from pharmacy_private.dotation_requirements d
  where d.company_id = c and (
    d.dotation_key = assigned_key
    or d.dotation_key in (
      select pharmacy_private.dotation_key(i.medical_dotation)
      from public.pharmacy_inventory i where i.company_id = c and i.vessel_id = p_vessel_id
    )
  );
  return result;
end;
$$;

create function public.list_pharmacy_dotation_requirements(p_vessel_id bigint)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select pharmacy_private.list_dotation_requirements(p_vessel_id);
$$;

revoke all on function pharmacy_private.list_dotation_requirements(bigint),
  public.list_pharmacy_dotation_requirements(bigint) from public, anon, authenticated, service_role;
grant execute on function pharmacy_private.list_dotation_requirements(bigint),
  public.list_pharmacy_dotation_requirements(bigint) to authenticated;

-- Keep old stock expressions and also recognize compact volume labels and litres.
create or replace function pharmacy_private.legacy_quantity(p_value text)
returns table(amount numeric, kind text, unit_key text)
language plpgsql immutable security invoker set search_path = '' as $$
declare parts text[]; normalized text := pharmacy_private.quantity_key(p_value);
begin
  parts := regexp_match(normalized, '^([0-9]+(?:[.,][0-9]+)?)$');
  if parts is not null then
    kind := 'bare'; unit_key := '';
  else
    parts := regexp_match(normalized, '^([0-9]+(?:[.,][0-9]+)?) *[x×] *([0-9]+(?:[.,][0-9]+)?) *(µg|μg|ug|mcg|mg|g|kg|ml|cl|dl|l|litres?|ui|iu|%)$');
    if parts is not null then
      kind := 'strength';
      unit_key := replace(parts[2], ',', '.') || parts[3];
    else
      parts := regexp_match(normalized, '^([0-9]+(?:[.,][0-9]+)?)(?: +([a-z]+(?:[ -][a-z]+)*)| *(ml|cl|dl|l))$');
      if parts is null then return; end if;
      kind := 'label'; unit_key := pharmacy_private.quantity_key(coalesce(parts[2], parts[3]));
      if unit_key = any(array['ug', 'mcg', 'mg', 'g', 'kg', 'ui', 'iu']) then return; end if;
    end if;
  end if;
  amount := trim_scale(replace(parts[1], ',', '.')::numeric);
  if amount <= 1000000000000 and scale(amount) <= 3 then return next; end if;
end;
$$;

create function pharmacy_private.volume_in_ml(p_unit text, p_strength text)
returns numeric language sql immutable security invoker set search_path = '' as $$
  with measurement as (
    select pharmacy_private.quantity_key(p_unit) as unit_key,
      regexp_match(regexp_replace(lower(p_strength), '[[:space:]]+', '', 'g'),
        '^([0-9]+(?:[.,][0-9]+)?)(ml|cl|dl|l|litres?)$') as parts
  )
  select case unit_key when 'ml' then 1 when 'cl' then 10 when 'dl' then 100 when 'l' then 1000 when 'litre' then 1000
    else nullif(replace(parts[1], ',', '.')::numeric, 0)
      * case parts[2] when 'ml' then 1 when 'cl' then 10 when 'dl' then 100 else 1000 end
    end
  from measurement;
$$;

revoke all on function pharmacy_private.volume_in_ml(text, text) from public, anon, authenticated, service_role;
grant execute on function pharmacy_private.volume_in_ml(text, text) to authenticated;

create or replace function pharmacy_private.stock_is_low(p_item public.pharmacy_inventory)
returns boolean language sql immutable security invoker set search_path = '' as $$
  with stock as (
    select coalesce(p_item.stock_quantity, actual.amount) as actual_amount,
      coalesce(p_item.required_stock_quantity, required.amount) as target_amount,
      coalesce(p_item.stock_unit, case when actual.kind = 'label' then actual.unit_key end) as actual_unit,
      coalesce(p_item.strength, case when actual.kind = 'strength' then actual.unit_key end) as actual_strength,
      coalesce(p_item.required_stock_unit, case when required.kind = 'label' then required.unit_key end) as explicit_target_unit,
      coalesce(p_item.required_strength, case when required.kind = 'strength' then required.unit_key end) as explicit_target_strength,
      (p_item.required_stock_unit is not null or p_item.required_strength is not null) as independent_target,
      actual.kind as actual_kind, actual.unit_key as actual_key,
      required.kind as target_kind, required.unit_key as target_key
    from (values (1)) anchor(value)
    left join lateral pharmacy_private.legacy_quantity(p_item.quantity) actual on true
    left join lateral pharmacy_private.legacy_quantity(p_item.required_quantity) required on true
  ), presentation as (
    select stock.*,
      coalesce(explicit_target_unit, case when not independent_target and coalesce(target_kind, 'bare') = 'bare' then p_item.stock_unit end) as target_unit,
      coalesce(explicit_target_strength, case when not independent_target and coalesce(target_kind, 'bare') = 'bare' then p_item.strength end) as target_strength
    from stock
  ), measured as (
    select presentation.*, pharmacy_private.volume_in_ml(actual_unit, actual_strength) as actual_volume,
      pharmacy_private.volume_in_ml(target_unit, target_strength) as target_volume
    from presentation
  )
  select coalesce(case
    when p_item.outside_dotation then false
    when actual_volume is not null and target_volume is not null
      then actual_amount * actual_volume < target_amount * target_volume
    when independent_target then actual_volume is null and target_volume is null
      and pharmacy_private.quantity_key(actual_unit) is not distinct from pharmacy_private.quantity_key(target_unit)
      and replace(regexp_replace(lower(actual_strength), '[[:space:]]+', '', 'g'), ',', '.')
        is not distinct from replace(regexp_replace(lower(target_strength), '[[:space:]]+', '', 'g'), ',', '.')
      and actual_amount < target_amount
    else actual_amount < target_amount and (
      (p_item.stock_quantity is not null and p_item.required_stock_quantity is not null)
      or (actual_kind = target_kind and actual_key = target_key)
      or (p_item.stock_quantity is not null and (
        target_kind = 'bare'
        or (target_kind = 'label' and target_key = pharmacy_private.quantity_key(p_item.stock_unit))
        or (target_kind = 'strength' and target_key = replace(regexp_replace(lower(p_item.strength), '[[:space:]]+', '', 'g'), ',', '.'))
      ))
      or (p_item.required_stock_quantity is not null and (
        actual_kind = 'bare'
        or (actual_kind = 'label' and actual_key = pharmacy_private.quantity_key(p_item.stock_unit))
        or (actual_kind = 'strength' and actual_key = replace(regexp_replace(lower(p_item.strength), '[[:space:]]+', '', 'g'), ',', '.'))
      ))
    ) end, false)
  from measured;
$$;

create or replace function public.pharmacy_inventory_notifications()
returns table(id text, kind text, vessel_id bigint, vessel_name text, title text, expires_on date, days_until_expiry integer, item_id bigint)
language sql stable security invoker set search_path = '' as $$
  select * from public.pharmacy_notifications()
  union all
  select 'stock-' || i.id, 'stock', i.vessel_id, v.name, i.designation, null::date, null::integer, i.id
  from public.pharmacy_inventory i
  join public.vessels v on v.id = i.vessel_id
  where i.active and not i.outside_dotation and pharmacy_private.stock_is_low(i)
  order by expires_on, vessel_name, title;
$$;

create or replace function pharmacy_private.save_item(p_vessel_id bigint,p_item jsonb,p_id bigint,p_revision integer)
returns bigint language plpgsql security definer set search_path='' as $$
declare c bigint:=public.current_planning_company_id(); result_id bigint; r public.pharmacy_inventory%rowtype;
  category_name text; canonical_id bigint; canonical_name text; current_dotation text; parent_dotation text; branch text;
  no_date boolean; extra_stock boolean; actual_stock numeric; target_stock numeric; unit_name text; units_per_package integer; dose text;
  item_active boolean; article_key text; parent_key text; can_share boolean; change_target boolean;
  target_text text; target_unit text; target_dose text; target_package integer;
  requirement pharmacy_private.dotation_requirements%rowtype;
begin
  if not coalesce(pharmacy_private.can_manage(c,p_vessel_id),false) then
    raise exception using errcode='42501',message='Accès refusé à la modification de cet inventaire.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pharmacy-catalog:'||c::text,0));
  -- Freeze the Fleet type while allowing foreign-key checks for medical saves.
  select btrim(coalesce(medical_dotation,'')) into current_dotation from public.vessels
    where id=p_vessel_id and company_id=c for no key update;
  if not found or not coalesce(pharmacy_private.can_manage(c,p_vessel_id),false) then
    raise exception using errcode='42501',message='Navire inaccessible.'; end if;
  if p_item is null or jsonb_typeof(p_item)<>'object' or octet_length(p_item::text)>20000 then
    raise exception 'Contenu de l’article invalide.'; end if;
  if p_id is not null then
    select * into r from public.pharmacy_inventory where id=p_id and company_id=c and vessel_id=p_vessel_id;
    if r.id is null then raise exception using errcode='42501',message='Article introuvable ou accès refusé.'; end if;
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
  extra_stock:=case when p_item ? 'outside_dotation' then coalesce((p_item->>'outside_dotation')::boolean,false)
    else coalesce(r.outside_dotation,false) end;
  item_active:=coalesce((p_item->>'active')::boolean,true);
  article_key:=pharmacy_private.designation_key(p_item->>'designation');
  parent_key:=pharmacy_private.dotation_key(parent_dotation);
  can_share:=item_active and not extra_stock and parent_key<>'' and article_key<>'' and branch in ('medicines','equipment');
  change_target:=can_share and coalesce((p_item->>'update_dotation_requirement')::boolean,false);

  -- Medical dispensing also locks inventory rows in ID order. Acquire the
  -- edited lot together with its siblings before any row mutation.
  if change_target then
    perform 1 from public.pharmacy_inventory i
    where i.id=p_id or (i.company_id=c and i.active and not i.outside_dotation
      and pharmacy_private.dotation_key(i.medical_dotation)=parent_key and i.medical_section=branch
      and pharmacy_private.designation_key(i.designation)=article_key)
    order by i.id for update;
  end if;
  if p_id is not null then
    select * into r from public.pharmacy_inventory where id=p_id and company_id=c and vessel_id=p_vessel_id for update;
    if p_revision is distinct from r.revision then raise exception using errcode='40001',message='Cet article a été modifié sur un autre appareil. Rechargez l’inventaire.'; end if;
  end if;

  no_date:=case when p_item ? 'no_expiry' then coalesce((p_item->>'no_expiry')::boolean,false) else coalesce(r.no_expiry,false) end;
  actual_stock:=case when p_item ? 'stock_quantity' then nullif(p_item->>'stock_quantity','')::numeric
    when p_item->>'quantity' is not distinct from r.quantity then r.stock_quantity end;
  target_stock:=case when p_item ? 'required_stock_quantity' then nullif(p_item->>'required_stock_quantity','')::numeric
    when p_item->>'required_quantity' is not distinct from r.required_quantity then r.required_stock_quantity end;
  unit_name:=case when p_item ? 'stock_unit' then nullif(btrim(p_item->>'stock_unit'),'') else r.stock_unit end;
  units_per_package:=case when p_item ? 'package_size' then nullif(p_item->>'package_size','')::integer else r.package_size end;
  dose:=case when p_item ? 'strength' then nullif(btrim(p_item->>'strength'),'') else r.strength end;
  target_text:=coalesce(p_item->>'required_quantity','');
  target_unit:=case when p_item ? 'required_stock_unit' then nullif(btrim(p_item->>'required_stock_unit'),'') else r.required_stock_unit end;
  target_dose:=case when p_item ? 'required_strength' then nullif(btrim(p_item->>'required_strength'),'') else r.required_strength end;
  target_package:=case when p_item ? 'required_package_size' then nullif(p_item->>'required_package_size','')::integer else r.required_package_size end;

  if can_share then
    select * into requirement from pharmacy_private.dotation_requirements d
    where d.company_id=c and d.dotation_key=parent_key and d.medical_section=branch and d.designation_key=article_key;

    if change_target then
      if (p_item->>'dotation_requirement_revision')::integer is distinct from requirement.revision then
        raise exception using errcode='40001',message='La dotation commune a changé. Rechargez l’inventaire.';
      end if;
      if requirement.id is null then
        insert into pharmacy_private.dotation_requirements (
          company_id,dotation_key,medical_section,designation_key,designation,required_quantity,
          required_stock_quantity,required_stock_unit,required_strength,required_package_size
        ) values(c,parent_key,branch,article_key,btrim(p_item->>'designation'),target_text,target_stock,target_unit,target_dose,target_package);
      else
        update pharmacy_private.dotation_requirements d set
          required_quantity=target_text,required_stock_quantity=target_stock,required_stock_unit=target_unit,
          required_strength=target_dose,required_package_size=target_package,revision=d.revision+1
        where d.id=requirement.id
          and (d.required_quantity,d.required_stock_quantity,d.required_stock_unit,d.required_strength,d.required_package_size)
            is distinct from (target_text,target_stock,target_unit,target_dose,target_package);
      end if;
    elsif requirement.revision is not null then
      -- A client opened before shared targets can still change onboard stock.
      -- Ask it to reload if it tried to write a shared target without a revision.
      if p_id is not null and not (p_item ? 'update_dotation_requirement') and (
        (p_item ? 'required_quantity' and target_text is distinct from r.required_quantity)
        or (p_item ? 'required_stock_quantity' and target_stock is distinct from r.required_stock_quantity
          and target_stock is distinct from coalesce(r.required_stock_quantity,
            (select amount from pharmacy_private.legacy_quantity(r.required_quantity) where kind='bare')))
      ) then
        raise exception using errcode='40001',message='Rechargez l’inventaire pour modifier la dotation commune.';
      end if;
      target_text:=requirement.required_quantity;
      target_stock:=requirement.required_stock_quantity;
      target_unit:=requirement.required_stock_unit;
      target_dose:=requirement.required_strength;
      target_package:=requirement.required_package_size;
    end if;
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
    insert into public.pharmacy_inventory(company_id,vessel_id,medical_dotation,medical_section,category_id,section,category,brand,designation,lot_number,quantity,required_quantity,
      expires_on,expiry_text,expiry_precision,no_expiry,outside_dotation,stock_quantity,required_stock_quantity,stock_unit,package_size,strength,
      required_stock_unit,required_strength,required_package_size,notes,active,created_by,updated_by)
    values(c,p_vessel_id,parent_dotation,branch,canonical_id,coalesce(p_item->>'section',''),category_name,coalesce(p_item->>'brand',''),btrim(p_item->>'designation'),coalesce(p_item->>'lot_number',''),
      coalesce(p_item->>'quantity',''),target_text,
      case when not no_date then nullif(p_item->>'expires_on','')::date end,
      case when no_date then '' else coalesce(p_item->>'expiry_text','') end,
      case when no_date then 'unknown' else coalesce(p_item->>'expiry_precision','unknown') end,
      no_date,extra_stock,actual_stock,target_stock,unit_name,units_per_package,dose,target_unit,target_dose,target_package,
      coalesce(p_item->>'notes',''),item_active,auth.uid(),auth.uid())
    returning id into result_id;
  else
    update public.pharmacy_inventory set medical_section=branch,category_id=canonical_id,section=coalesce(p_item->>'section',''),category=category_name,brand=coalesce(p_item->>'brand',''),designation=btrim(p_item->>'designation'),
      lot_number=coalesce(p_item->>'lot_number',''),quantity=coalesce(p_item->>'quantity',''),required_quantity=target_text,
      expires_on=case when not no_date then nullif(p_item->>'expires_on','')::date end,
      expiry_text=case when no_date then '' else coalesce(p_item->>'expiry_text','') end,
      expiry_precision=case when no_date then 'unknown' else coalesce(p_item->>'expiry_precision','unknown') end,
      no_expiry=no_date,outside_dotation=extra_stock,stock_quantity=actual_stock,required_stock_quantity=target_stock,stock_unit=unit_name,package_size=units_per_package,strength=dose,
      required_stock_unit=target_unit,required_strength=target_dose,required_package_size=target_package,
      notes=coalesce(p_item->>'notes',''),active=item_active,
      revision=revision+1,updated_at=clock_timestamp(),updated_by=auth.uid() where id=r.id returning id into result_id;
  end if;

  if change_target then
    update public.pharmacy_inventory i set
      required_quantity=target_text,required_stock_quantity=target_stock,required_stock_unit=target_unit,
      required_strength=target_dose,required_package_size=target_package,
      revision=i.revision+1,updated_at=clock_timestamp(),updated_by=auth.uid()
    where i.id<>result_id and i.company_id=c and i.active and not i.outside_dotation
      and pharmacy_private.dotation_key(i.medical_dotation)=parent_key and i.medical_section=branch
      and pharmacy_private.designation_key(i.designation)=article_key
      and (i.required_quantity,i.required_stock_quantity,i.required_stock_unit,i.required_strength,i.required_package_size)
        is distinct from (target_text,target_stock,target_unit,target_dose,target_package);
  end if;
  return result_id;
end $$;

create or replace function medical_logbook_private.list_medications(p_vessel_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare company bigint; result jsonb;
begin
  if not medical_logbook_private.can_access(p_vessel_id) then
    raise exception 'MEDICAL_LOGBOOK_PERMISSION_DENIED' using errcode = '42501';
  end if;
  select v.company_id into strict company from public.vessels v where v.id = p_vessel_id;
  if not coalesce(pharmacy_private.can_manage(company, p_vessel_id), false) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'item_id', i.id, 'designation', i.designation, 'brand', i.brand, 'lot_number', i.lot_number,
    'category', i.category, 'medical_section', i.medical_section,
    'stock_unit', coalesce(i.stock_unit, case when legacy.kind = 'label' then legacy.unit_key end, 'unité'),
    'strength', coalesce(i.strength, case when legacy.kind = 'strength' then legacy.unit_key end),
    'package_size', i.package_size, 'stock_quantity', coalesce(i.stock_quantity, legacy.amount)
  ) order by i.medical_section, i.category, i.designation, i.lot_number, i.id), '[]'::jsonb) into result
  from public.pharmacy_inventory i
  left join lateral pharmacy_private.legacy_quantity(i.quantity) legacy on true
  where i.company_id = company and i.vessel_id = p_vessel_id and i.active;
  return result;
end;
$$;

notify pgrst, 'reload schema';
