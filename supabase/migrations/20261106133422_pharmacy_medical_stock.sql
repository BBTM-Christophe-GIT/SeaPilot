set local lock_timeout = '4s';

alter table public.pharmacy_inventory
  add column no_expiry boolean not null default false,
  add column outside_dotation boolean not null default false,
  add column stock_quantity numeric check (stock_quantity between 0 and 1000000000000 and scale(trim_scale(stock_quantity)) <= 3),
  add column required_stock_quantity numeric check (required_stock_quantity between 0 and 1000000000000 and scale(trim_scale(required_stock_quantity)) <= 3),
  add column stock_unit text check (length(btrim(stock_unit)) between 1 and 100),
  add column package_size integer check (package_size between 1 and 1000000),
  add column strength text check (length(btrim(strength)) between 1 and 100),
  add constraint pharmacy_inventory_no_expiry_date
    check (not no_expiry or (expires_on is null and expiry_precision = 'unknown' and expiry_text = ''));

comment on column public.pharmacy_inventory.stock_quantity is 'Total base units on board. Legacy text remains available when it cannot be interpreted safely.';
comment on column public.pharmacy_inventory.required_stock_quantity is 'Target stock in the same base units as stock_quantity.';
comment on column public.pharmacy_inventory.package_size is 'Number of base units in one box or package.';

create function pharmacy_private.quantity_key(p_value text)
returns text language sql immutable security invoker set search_path = '' as $$
  with normalized as (
    select btrim(regexp_replace(translate(lower(p_value), 'àâäçéèêëîïôöùûüÿ', 'aaaceeeeiioouuuy'), '[[:space:]]+', ' ', 'g')) as value
  )
  select case when value = any(array['boites', 'comprimes', 'gelules', 'ampoules', 'flacons', 'sachets',
    'unites', 'doses', 'tubes', 'suppositoires', 'patchs', 'pieces', 'litres']) then left(value, -1) else value end
  from normalized;
$$;

create function pharmacy_private.legacy_quantity(p_value text)
returns table(amount numeric, kind text, unit_key text)
language plpgsql immutable security invoker set search_path = '' as $$
declare parts text[]; normalized text := pharmacy_private.quantity_key(p_value);
begin
  parts := regexp_match(normalized, '^([0-9]+(?:[.,][0-9]+)?)$');
  if parts is not null then
    kind := 'bare'; unit_key := '';
  else
    parts := regexp_match(normalized, '^([0-9]+(?:[.,][0-9]+)?) *[x×] *([0-9]+(?:[.,][0-9]+)?) *(µg|μg|ug|mcg|mg|g|kg|ml|cl|dl|l|ui|iu|%)$');
    if parts is not null then
      kind := 'strength';
      unit_key := replace(parts[2], ',', '.') || parts[3];
    else
      parts := regexp_match(normalized, '^([0-9]+(?:[.,][0-9]+)?) +([a-z]+(?:[ -][a-z]+)*)$');
      if parts is null then return; end if;
      kind := 'label'; unit_key := pharmacy_private.quantity_key(parts[2]);
      if unit_key = any(array['ug', 'mcg', 'mg', 'g', 'kg', 'ui', 'iu']) then return; end if;
    end if;
  end if;
  amount := trim_scale(replace(parts[1], ',', '.')::numeric);
  if amount <= 1000000000000 and scale(amount) <= 3 then return next; end if;
end;
$$;

create function pharmacy_private.stock_is_low(p_item public.pharmacy_inventory)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select coalesce(coalesce(p_item.stock_quantity, actual.amount) < coalesce(p_item.required_stock_quantity, required.amount)
    and (
      (p_item.stock_quantity is not null and p_item.required_stock_quantity is not null)
      or (actual.kind = required.kind and actual.unit_key = required.unit_key)
      or (p_item.stock_quantity is not null and (
        required.kind = 'bare'
        or (required.kind = 'label' and required.unit_key = pharmacy_private.quantity_key(p_item.stock_unit))
        or (required.kind = 'strength' and required.unit_key = replace(replace(pharmacy_private.quantity_key(p_item.strength), ' ', ''), ',', '.'))
      ))
      or (p_item.required_stock_quantity is not null and (
        actual.kind = 'bare'
        or (actual.kind = 'label' and actual.unit_key = pharmacy_private.quantity_key(p_item.stock_unit))
        or (actual.kind = 'strength' and actual.unit_key = replace(replace(pharmacy_private.quantity_key(p_item.strength), ' ', ''), ',', '.'))
      ))
    ), false)
  from (values (1)) anchor(value)
  left join lateral pharmacy_private.legacy_quantity(p_item.quantity) actual on p_item.stock_quantity is null or p_item.required_stock_quantity is null
  left join lateral pharmacy_private.legacy_quantity(p_item.required_quantity) required on p_item.stock_quantity is null or p_item.required_stock_quantity is null;
$$;

revoke all on function pharmacy_private.quantity_key(text), pharmacy_private.legacy_quantity(text),
  pharmacy_private.stock_is_low(public.pharmacy_inventory) from public, anon, authenticated;
grant execute on function pharmacy_private.quantity_key(text), pharmacy_private.legacy_quantity(text),
  pharmacy_private.stock_is_low(public.pharmacy_inventory) to authenticated;

-- Keep the dated-only RPC for clients opened before this migration.
create function public.pharmacy_inventory_notifications()
returns table(id text,kind text,vessel_id bigint,vessel_name text,title text,expires_on date,days_until_expiry integer,item_id bigint)
language sql stable security invoker set search_path='' as $$
  select * from public.pharmacy_notifications()
  union all
  select alert.prefix||i.id,alert.kind,i.vessel_id,v.name,i.designation,null::date,null::integer,i.id
  from public.pharmacy_inventory i
  join public.vessels v on v.id=i.vessel_id
  cross join lateral (values
    ('stock-', 'stock', pharmacy_private.stock_is_low(i)),
    ('outside-dotation-', 'outside_dotation', i.outside_dotation)
  ) alert(prefix,kind,is_active)
  where i.active and alert.is_active
  order by expires_on,vessel_name,title;
$$;

revoke all on function public.pharmacy_inventory_notifications() from public, anon, authenticated, service_role;
grant execute on function public.pharmacy_inventory_notifications() to authenticated;

create or replace function pharmacy_private.save_item(p_vessel_id bigint,p_item jsonb,p_id bigint,p_revision integer)
returns bigint language plpgsql security definer set search_path='' as $$
declare c bigint:=public.current_planning_company_id(); result_id bigint; r public.pharmacy_inventory%rowtype;
  category_name text; canonical_id bigint; canonical_name text; current_dotation text; parent_dotation text; branch text;
  no_date boolean; extra_stock boolean; actual_stock numeric; target_stock numeric; unit_name text; units_per_package integer; dose text;
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
  no_date:=case when p_item ? 'no_expiry' then coalesce((p_item->>'no_expiry')::boolean,false) else coalesce(r.no_expiry,false) end;
  extra_stock:=case when p_item ? 'outside_dotation' then coalesce((p_item->>'outside_dotation')::boolean,false)
    else coalesce(r.outside_dotation,false) end;
  actual_stock:=case when p_item ? 'stock_quantity' then nullif(p_item->>'stock_quantity','')::numeric
    when p_item->>'quantity' is not distinct from r.quantity then r.stock_quantity end;
  target_stock:=case when p_item ? 'required_stock_quantity' then nullif(p_item->>'required_stock_quantity','')::numeric
    when p_item->>'required_quantity' is not distinct from r.required_quantity then r.required_stock_quantity end;
  unit_name:=case when p_item ? 'stock_unit' then nullif(btrim(p_item->>'stock_unit'),'') else r.stock_unit end;
  units_per_package:=case when p_item ? 'package_size' then nullif(p_item->>'package_size','')::integer else r.package_size end;
  dose:=case when p_item ? 'strength' then nullif(btrim(p_item->>'strength'),'') else r.strength end;
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
      expires_on,expiry_text,expiry_precision,no_expiry,outside_dotation,stock_quantity,required_stock_quantity,stock_unit,package_size,strength,notes,active,created_by,updated_by)
    values(c,p_vessel_id,parent_dotation,branch,canonical_id,coalesce(p_item->>'section',''),category_name,coalesce(p_item->>'brand',''),btrim(p_item->>'designation'),coalesce(p_item->>'lot_number',''),
      coalesce(p_item->>'quantity',''),coalesce(p_item->>'required_quantity',''),
      case when not no_date then nullif(p_item->>'expires_on','')::date end,
      case when no_date then '' else coalesce(p_item->>'expiry_text','') end,
      case when no_date then 'unknown' else coalesce(p_item->>'expiry_precision','unknown') end,
      no_date,extra_stock,actual_stock,target_stock,unit_name,units_per_package,dose,coalesce(p_item->>'notes',''),coalesce((p_item->>'active')::boolean,true),auth.uid(),auth.uid())
    returning id into result_id;
  else
    update public.pharmacy_inventory set medical_section=branch,category_id=canonical_id,section=coalesce(p_item->>'section',''),category=category_name,brand=coalesce(p_item->>'brand',''),designation=btrim(p_item->>'designation'),
      lot_number=coalesce(p_item->>'lot_number',''),quantity=coalesce(p_item->>'quantity',''),required_quantity=coalesce(p_item->>'required_quantity',''),
      expires_on=case when not no_date then nullif(p_item->>'expires_on','')::date end,
      expiry_text=case when no_date then '' else coalesce(p_item->>'expiry_text','') end,
      expiry_precision=case when no_date then 'unknown' else coalesce(p_item->>'expiry_precision','unknown') end,
      no_expiry=no_date,outside_dotation=extra_stock,stock_quantity=actual_stock,required_stock_quantity=target_stock,stock_unit=unit_name,package_size=units_per_package,strength=dose,
      notes=coalesce(p_item->>'notes',''),active=coalesce((p_item->>'active')::boolean,true),
      revision=revision+1,updated_at=clock_timestamp(),updated_by=auth.uid() where id=r.id returning id into result_id;
  end if;
  return result_id;
end $$;

alter table medical_logbook_private.entries
  add column medications jsonb not null default '[]'::jsonb check (jsonb_typeof(medications) = 'array'),
  add column create_request_id uuid,
  add constraint medical_logbook_treatment_required check (
    btrim(treatment_medicines) <> '' or medications <> '[]'::jsonb
  ),
  drop constraint entries_treatment_medicines_check,
  add constraint medical_logbook_treatment_length check (length(btrim(treatment_medicines)) <= 4000);

create unique index medical_logbook_create_request_idx
  on medical_logbook_private.entries (created_by, vessel_id, create_request_id)
  where create_request_id is not null;

create function medical_logbook_private.list_medications(p_vessel_id bigint)
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
    'stock_unit', coalesce(i.stock_unit, case when legacy.kind = 'label' then legacy.unit_key end, 'unité'),
    'strength', coalesce(i.strength, case when legacy.kind = 'strength' then legacy.unit_key end),
    'package_size', i.package_size, 'stock_quantity', coalesce(i.stock_quantity, legacy.amount)
  ) order by i.designation, i.lot_number, i.id), '[]'::jsonb) into result
  from public.pharmacy_inventory i
  left join lateral pharmacy_private.legacy_quantity(i.quantity) legacy on true
  where i.company_id = company and i.vessel_id = p_vessel_id and i.active;
  return result;
end;
$$;

create function public.list_medical_logbook_medications(p_vessel_id bigint)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select medical_logbook_private.list_medications(p_vessel_id);
$$;

revoke all on function medical_logbook_private.list_medications(bigint),
  public.list_medical_logbook_medications(bigint) from public, anon, authenticated, service_role;
grant execute on function medical_logbook_private.list_medications(bigint),
  public.list_medical_logbook_medications(bigint) to authenticated;

create function medical_logbook_private.apply_medications(
  p_company_id bigint, p_vessel_id bigint, p_previous jsonb, p_requested jsonb
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  line record; item public.pharmacy_inventory%rowtype; legacy record; saved jsonb;
  result jsonb := '[]'::jsonb; new_amount numeric; previous_amount numeric; remaining numeric;
  package_units integer; stock_label text;
begin
  -- Older clients can still edit the medical text without changing any medication.
  if p_requested is null then return p_previous; end if;
  if jsonb_typeof(p_requested) <> 'array' or octet_length(p_requested::text) > 10000 then
    raise exception 'MEDICAL_LOGBOOK_INVALID_MEDICATIONS' using errcode = '22023';
  end if;
  if jsonb_array_length(p_requested) > 50 then
    raise exception 'MEDICAL_LOGBOOK_INVALID_MEDICATIONS' using errcode = '22023';
  end if;
  for line in select value as requested from jsonb_array_elements(p_requested) loop
    if jsonb_typeof(line.requested) <> 'object'
      or jsonb_typeof(line.requested->'item_id') is distinct from 'number'
      or jsonb_typeof(line.requested->'quantity') is distinct from 'number'
      or coalesce(line.requested->>'unit', '') not in ('unit', 'package') then
      raise exception 'MEDICAL_LOGBOOK_INVALID_MEDICATIONS' using errcode = '22023';
    end if;
    new_amount := trim_scale((line.requested->>'quantity')::numeric);
    if line.requested - array['item_id', 'quantity', 'unit'] <> '{}'::jsonb
      or line.requested->>'item_id' !~ '^[1-9][0-9]{0,15}$'
      or (line.requested->>'item_id')::numeric > 9007199254740991
      or new_amount <= 0 or new_amount > 1000000 or scale(new_amount) > 3
      or (line.requested->>'unit' = 'package' and scale(new_amount) > 0) then
      raise exception 'MEDICAL_LOGBOOK_INVALID_MEDICATIONS' using errcode = '22023';
    end if;
  end loop;
  if exists (
    select 1 from jsonb_array_elements(p_requested) i group by i->>'item_id' having count(*) > 1
  ) then raise exception 'MEDICAL_LOGBOOK_INVALID_MEDICATIONS' using errcode = '22023'; end if;

  -- All writes lock lots in ID order. The enclosing entry transaction also
  -- rolls back every adjustment when any lot or the medical revision fails.
  for line in
    select coalesce((prior->>'item_id')::bigint, (requested->>'item_id')::bigint) item_id, prior, requested
    from jsonb_array_elements(p_previous) prior
    full join jsonb_array_elements(p_requested) requested on prior->'item_id' = requested->'item_id'
    order by item_id
  loop
    if line.prior->'quantity' = line.requested->'quantity' and line.prior->'unit' = line.requested->'unit' then
      result := result || jsonb_build_array(line.prior);
      continue;
    end if;
    if not coalesce(pharmacy_private.can_manage(p_company_id, p_vessel_id), false) then
      raise exception 'MEDICAL_LOGBOOK_PERMISSION_DENIED' using errcode = '42501';
    end if;
    select * into item from public.pharmacy_inventory i
      where i.id = line.item_id and i.company_id = p_company_id and i.vessel_id = p_vessel_id for update;
    if not found then
      raise exception 'MEDICAL_LOGBOOK_MEDICATION_UNAVAILABLE' using errcode = '22023';
    end if;
    select * into legacy from pharmacy_private.legacy_quantity(item.quantity);
    stock_label := coalesce(item.stock_unit, case when legacy.kind = 'label' then legacy.unit_key end, 'unité');
    previous_amount := coalesce((line.prior->>'stock_quantity')::numeric, 0);
    new_amount := 0;

    if line.requested is not null then
      package_units := item.package_size;
      if line.prior->'unit' = line.requested->'unit' then
        -- Retain the original conversion and product snapshot for a correction.
        package_units := (line.prior->>'package_size')::integer;
        saved := line.prior;
      else
        saved := jsonb_build_object('designation', item.designation, 'brand', item.brand,
          'lot_number', item.lot_number, 'stock_unit', stock_label, 'package_size', package_units,
          'strength', coalesce(item.strength, case when legacy.kind = 'strength' then legacy.unit_key end));
      end if;
      if line.requested->>'unit' = 'package' and package_units is null then
        raise exception 'MEDICAL_LOGBOOK_MEDICATION_PACKAGE_UNAVAILABLE' using errcode = '22023';
      end if;
      new_amount := (line.requested->>'quantity')::numeric
        * case when line.requested->>'unit' = 'package' then package_units else 1 end;
      result := result || jsonb_build_array(saved || line.requested || jsonb_build_object('stock_quantity', new_amount));
    end if;

    if not item.active and (line.prior is null or new_amount > previous_amount) then
      raise exception 'MEDICAL_LOGBOOK_MEDICATION_UNAVAILABLE' using errcode = '22023';
    end if;
    if new_amount = previous_amount then continue; end if;
    if line.prior is not null
      and pharmacy_private.quantity_key(line.prior->>'stock_unit') not in ('unite', pharmacy_private.quantity_key(stock_label)) then
      raise exception 'MEDICAL_LOGBOOK_MEDICATION_STOCK_UNKNOWN' using errcode = '22023';
    end if;
    remaining := coalesce(item.stock_quantity, legacy.amount) + previous_amount - new_amount;
    if remaining is null then raise exception 'MEDICAL_LOGBOOK_MEDICATION_STOCK_UNKNOWN' using errcode = '22023'; end if;
    if remaining < 0 then raise exception 'MEDICAL_LOGBOOK_INSUFFICIENT_STOCK' using errcode = '22023'; end if;
    update public.pharmacy_inventory i
      set stock_quantity = remaining, revision = i.revision + 1, updated_at = clock_timestamp(), updated_by = auth.uid()
      where i.id = item.id;
  end loop;
  return result;
end;
$$;

revoke all on function medical_logbook_private.apply_medications(bigint,bigint,jsonb,jsonb)
  from public, anon, authenticated, service_role;

create or replace function medical_logbook_private.entry_json(p_entry medical_logbook_private.entries)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', p_entry.id, 'company_id', p_entry.company_id, 'vessel_id', p_entry.vessel_id,
    'occurred_on', to_char(p_entry.occurred_on, 'YYYY-MM-DD'), 'occurred_time', to_char(p_entry.occurred_time, 'HH24:MI'),
    'patient_name', p_entry.patient_name, 'injury_illness', p_entry.injury_illness,
    'treatment_medicines', p_entry.treatment_medicines, 'medications', p_entry.medications, 'first_aider_name', p_entry.first_aider_name,
    'signature_name', p_entry.signature_name, 'signature_version_id', p_entry.signature_version_id, 'signature_snapshot', p_entry.signature_snapshot,
    'revision', p_entry.revision, 'archived', p_entry.archived, 'created_at', p_entry.created_at, 'updated_at', p_entry.updated_at
  );
$$;

create or replace function medical_logbook_private.validate_content(p_entry jsonb)
returns jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare
  field text; field_limit integer;
  occurred_on date; occurred_time time without time zone;
begin
  if p_entry is null or jsonb_typeof(p_entry) <> 'object'
    or exists(select 1 from jsonb_object_keys(p_entry) key where key <> all(array[
      'occurred_on', 'occurred_time', 'patient_name', 'injury_illness', 'treatment_medicines',
      'first_aider_name', 'medications', 'create_request_id'
    ])) then
    raise exception 'MEDICAL_LOGBOOK_INVALID_CONTENT' using errcode = '22023';
  end if;
  foreach field in array array['occurred_on', 'occurred_time', 'patient_name', 'injury_illness', 'treatment_medicines', 'first_aider_name'] loop
    if jsonb_typeof(p_entry->field) is distinct from 'string' then
      raise exception 'MEDICAL_LOGBOOK_REQUIRED_FIELD: %', field using errcode = '22023';
    end if;
    if field not in ('occurred_on', 'occurred_time') then
      field_limit := case when field in ('injury_illness', 'treatment_medicines') then 4000 else 160 end;
      if length(btrim(p_entry->>field)) > field_limit
        or (field <> 'treatment_medicines' and btrim(p_entry->>field) = '') then
        raise exception 'MEDICAL_LOGBOOK_INVALID_FIELD: %', field using errcode = '22023';
      end if;
      p_entry := jsonb_set(p_entry, array[field], to_jsonb(btrim(p_entry->>field)));
    end if;
  end loop;
  if p_entry->>'occurred_on' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or p_entry->>'occurred_time' !~ '^[0-9]{2}:[0-9]{2}(:00)?$' then
    raise exception 'MEDICAL_LOGBOOK_INVALID_DATE_TIME' using errcode = '22023';
  end if;
  begin
    occurred_on := (p_entry->>'occurred_on')::date;
    occurred_time := (p_entry->>'occurred_time')::time;
    if extract(hour from occurred_time) >= 24 or to_char(occurred_on, 'YYYY-MM-DD') <> p_entry->>'occurred_on' then
      raise exception 'MEDICAL_LOGBOOK_INVALID_DATE_TIME' using errcode = '22023';
    end if;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'MEDICAL_LOGBOOK_INVALID_DATE_TIME' using errcode = '22023';
  end;
  return p_entry || jsonb_build_object('occurred_time', to_char(occurred_time, 'HH24:MI'));
end;
$$;

create or replace function medical_logbook_private.save_entry(p_vessel_id bigint, p_entry_id bigint, p_expected_revision integer, p_entry jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  content jsonb; target medical_logbook_private.entries%rowtype; company bigint; signature jsonb;
  medication_snapshot jsonb; request_id uuid;
begin
  if not medical_logbook_private.can_access(p_vessel_id) then raise exception 'MEDICAL_LOGBOOK_PERMISSION_DENIED' using errcode = '42501'; end if;
  content := medical_logbook_private.validate_content(p_entry);
  if content ? 'create_request_id' then
    if p_entry_id is not null or jsonb_typeof(content->'create_request_id') is distinct from 'string'
      or content->>'create_request_id' !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
      raise exception 'MEDICAL_LOGBOOK_INVALID_CONTENT' using errcode = '22023';
    end if;
    request_id := (content->>'create_request_id')::uuid;
  end if;
  if p_entry_id is null then
    if p_expected_revision is not null then raise exception 'MEDICAL_LOGBOOK_REVISION_CONFLICT' using errcode = '40001'; end if;
    if request_id is not null then
      -- Retry after a lost response returns the existing entry without debiting again.
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        'medical-entry:' || auth.uid()::text || ':' || p_vessel_id::text || ':' || request_id::text, 0));
      select * into target from medical_logbook_private.entries entry
        where entry.created_by = auth.uid() and entry.vessel_id = p_vessel_id and entry.create_request_id = request_id;
      if found then return medical_logbook_private.entry_json(target); end if;
    end if;
    select vessel.company_id into strict company from public.vessels vessel where vessel.id = p_vessel_id;
    signature := medical_logbook_private.capture_signature(company);
    if content->>'first_aider_name' <> signature->>'signer_name' then
      raise exception 'MEDICAL_LOGBOOK_FIRST_AIDER_MUST_BE_SIGNER' using errcode = '22023';
    end if;
    medication_snapshot := medical_logbook_private.apply_medications(company, p_vessel_id, '[]'::jsonb, content->'medications');
    if content->>'treatment_medicines' = '' and medication_snapshot = '[]'::jsonb then
      raise exception 'MEDICAL_LOGBOOK_REQUIRED_FIELD: treatment_medicines' using errcode = '22023';
    end if;
    insert into medical_logbook_private.entries(company_id, vessel_id, occurred_on, occurred_time, patient_name,
      injury_illness, treatment_medicines, medications, first_aider_name, signature_name, signature_version_id, signature_snapshot, created_by, updated_by, create_request_id)
    values(company, p_vessel_id, (content->>'occurred_on')::date, (content->>'occurred_time')::time,
      content->>'patient_name', content->>'injury_illness', content->>'treatment_medicines', medication_snapshot, signature->>'signer_name',
      signature->>'signer_name', (signature->>'signature_id')::bigint, signature, auth.uid(), auth.uid(), request_id) returning * into target;
  else
    select * into target from medical_logbook_private.entries entry where entry.id = p_entry_id and entry.vessel_id = p_vessel_id for update;
    if target.id is null then raise exception 'MEDICAL_LOGBOOK_PERMISSION_DENIED' using errcode = '42501'; end if;
    if p_expected_revision is null or p_expected_revision <> target.revision then
      raise exception 'MEDICAL_LOGBOOK_REVISION_CONFLICT' using errcode = '40001';
    end if;
    if target.archived then raise exception 'MEDICAL_LOGBOOK_RESTORE_BEFORE_EDIT' using errcode = '22023'; end if;
    signature := medical_logbook_private.capture_signature(target.company_id);
    if content->>'first_aider_name' <> signature->>'signer_name' then
      raise exception 'MEDICAL_LOGBOOK_FIRST_AIDER_MUST_BE_SIGNER' using errcode = '22023';
    end if;
    medication_snapshot := medical_logbook_private.apply_medications(target.company_id, p_vessel_id, target.medications, content->'medications');
    if content->>'treatment_medicines' = '' and medication_snapshot = '[]'::jsonb then
      raise exception 'MEDICAL_LOGBOOK_REQUIRED_FIELD: treatment_medicines' using errcode = '22023';
    end if;
    update medical_logbook_private.entries entry set occurred_on = (content->>'occurred_on')::date,
      occurred_time = (content->>'occurred_time')::time, patient_name = content->>'patient_name', injury_illness = content->>'injury_illness',
      treatment_medicines = content->>'treatment_medicines', medications = medication_snapshot, first_aider_name = signature->>'signer_name',
      signature_name = signature->>'signer_name', signature_version_id = (signature->>'signature_id')::bigint, signature_snapshot = signature,
      revision = entry.revision + 1, updated_by = auth.uid(), updated_at = clock_timestamp()
    where entry.id = target.id returning * into target;
  end if;
  return medical_logbook_private.entry_json(target);
end;
$$;

-- Archiving retains the clinical record and its dispensing. A correction of
-- the selection is what adjusts stock.
notify pgrst, 'reload schema';
