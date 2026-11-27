-- Division 217 (30 September 2021). Reference rows are separate from stock
-- and from company-defined requirements so an inventory edit cannot change them.
set local lock_timeout = '5s';

alter table public.vessels add column medical_emergency_bag boolean not null default false;
alter table public.pharmacy_inventory add column stock_packaging text
  check (length(stock_packaging) <= 500);

create table pharmacy_private.d217_catalog (
  dotation_key text not null check (dotation_key in ('dotation a', 'dotation b', 'dotation b restreinte', 'dotation c', 'dotation c restreinte', 'sac medical d''urgence')),
  medical_section text not null check (medical_section in ('medicines', 'equipment')),
  catalog_code text not null,
  category text not null,
  designation text not null,
  quantity_text text not null,
  stock_quantity numeric,
  stock_unit text,
  package_size integer,
  strength text,
  packaging text,
  notes text,
  source_page integer not null,
  administration_route text,
  classification text,
  applicability text not null check (applicability in ('standard', 'conditional', 'recommended', 'variable')),
  minimum_crew integer check (minimum_crew > 0),
  primary key (dotation_key, catalog_code)
);
create unique index pharmacy_d217_designation_idx on pharmacy_private.d217_catalog (
  dotation_key, medical_section, pharmacy_private.designation_key(designation)
);
alter table pharmacy_private.d217_catalog enable row level security;
revoke all on pharmacy_private.d217_catalog from public, anon, authenticated, service_role;

drop function public.pharmacy_available_vessels();
drop function pharmacy_private.available_vessels();

create function pharmacy_private.available_vessels()
returns table(id bigint, company_id bigint, name text, acronym text, can_manage boolean,
  length_overall text, medical_dotation text, medical_emergency_bag boolean)
language sql stable security definer set search_path = '' as $$
  select v.id, v.company_id, v.name, v.acronym, pharmacy_private.can_manage(v.company_id, v.id),
    v.length_overall, btrim(coalesce(v.medical_dotation, '')), v.medical_emergency_bag
  from public.vessels v where pharmacy_private.can_access(v.company_id, v.id)
  order by v.name, v.id;
$$;

create function public.pharmacy_available_vessels()
returns table(id bigint, company_id bigint, name text, acronym text, can_manage boolean,
  length_overall text, medical_dotation text, medical_emergency_bag boolean)
language sql stable security invoker set search_path = '' as $$
  select * from pharmacy_private.available_vessels();
$$;

revoke all on function pharmacy_private.available_vessels(), public.pharmacy_available_vessels()
  from public, anon, authenticated, service_role;
grant execute on function pharmacy_private.available_vessels() to authenticated;
grant execute on function public.pharmacy_available_vessels() to authenticated, service_role;

create or replace function pharmacy_private.has_dotation_context(p_company_id bigint, p_vessel_id bigint, p_dotation text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(pharmacy_private.can_access(p_company_id, p_vessel_id), false) and case
    when pharmacy_private.dotation_key(p_dotation) = 'sac medical d''urgence' then
      exists(select 1 from public.vessels v where v.id = p_vessel_id and v.company_id = p_company_id and v.medical_emergency_bag)
    else
      exists(select 1 from public.vessels v where v.id = p_vessel_id and v.company_id = p_company_id
        and pharmacy_private.dotation_key(v.medical_dotation) = pharmacy_private.dotation_key(p_dotation))
      or exists(select 1 from public.pharmacy_inventory i where i.company_id = p_company_id and i.vessel_id = p_vessel_id
        and pharmacy_private.dotation_key(i.medical_dotation) = pharmacy_private.dotation_key(p_dotation))
      or exists(select 1 from pharmacy_private.pharmacy_category_vessel_archive a where a.company_id = p_company_id and a.vessel_id = p_vessel_id
        and pharmacy_private.dotation_key(a.medical_dotation) = pharmacy_private.dotation_key(p_dotation))
  end;
$$;

-- The Fleet form records minimum safe manning, while dotation A is based on
-- the crew habitually on board. Preserve the 25-person reference for review.
create function pharmacy_private.d217_vessel_requirement(reference pharmacy_private.d217_catalog, max_people integer)
returns table(amount numeric, quantity_label text, applicability text, notes text)
language sql immutable set search_path = '' as $$
  select
    case when (reference.minimum_crew is not null and max_people < reference.minimum_crew)
        or (reference.dotation_key = 'dotation a' and reference.stock_quantity <> 1)
      then null else reference.stock_quantity end,
    case when reference.dotation_key = 'dotation a' and reference.stock_quantity <> 1
      then reference.quantity_text || ' pour 25 marins' else reference.quantity_text end,
    case when reference.minimum_crew is not null and max_people < reference.minimum_crew then 'not_applicable'
      when reference.dotation_key = 'dotation a' and reference.stock_quantity <> 1 and reference.applicability = 'standard' then 'variable'
      else reference.applicability end,
    concat_ws(' ', nullif(reference.notes, ''),
      case when reference.dotation_key = 'dotation a' and reference.stock_quantity <> 1
        then 'Quantité de base pour 25 marins. Ajuster selon l’effectif habituellement embarqué (annexe 217-3.A.1).' end,
      case when reference.minimum_crew is not null and max_people < reference.minimum_crew
        then 'Non applicable à la capacité maximale renseignée pour ce navire.' end);
$$;
revoke all on function pharmacy_private.d217_vessel_requirement(pharmacy_private.d217_catalog, integer)
  from public, anon, authenticated, service_role;

create or replace function pharmacy_private.list_dotation_requirements(p_vessel_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  c bigint := public.current_planning_company_id();
  vessel public.vessels%rowtype;
  assigned_key text;
  result jsonb;
begin
  if not coalesce(pharmacy_private.can_access(c, p_vessel_id), false) then
    raise exception using errcode = '42501', message = 'Navire inaccessible.';
  end if;
  select * into strict vessel from public.vessels v where v.company_id = c and v.id = p_vessel_id;
  assigned_key := pharmacy_private.dotation_key(vessel.medical_dotation);

  with official as (
    select d.*, pharmacy_private.designation_key(d.designation) as designation_key,
      r.amount, r.quantity_label, r.applicability as vessel_applicability, r.notes as vessel_notes
    from pharmacy_private.d217_catalog d
    cross join lateral pharmacy_private.d217_vessel_requirement(d, vessel.max_people) r
    where d.dotation_key = assigned_key
      or (vessel.medical_emergency_bag and d.dotation_key = 'sac medical d''urgence')
  ), entries as (
    select d.dotation_key, d.medical_section, d.designation_key, jsonb_build_object(
      'dotation_key', d.dotation_key, 'medical_section', d.medical_section,
      'designation_key', d.designation_key, 'designation', d.designation,
      'required_quantity', d.quantity_label, 'required_stock_quantity', d.amount,
      'required_stock_unit', d.stock_unit, 'required_strength', d.strength,
      'required_package_size', d.package_size, 'dotation_requirement_revision', null,
      'catalog_code', d.catalog_code, 'category', d.category, 'packaging', d.packaging,
      'regulatory_notes', d.vessel_notes, 'source_page', d.source_page, 'applicability', d.vessel_applicability,
      'administration_route', d.administration_route, 'classification', d.classification
    ) as value
    from official d
    union all
    select d.dotation_key, d.medical_section, d.designation_key, jsonb_build_object(
      'dotation_key', d.dotation_key, 'medical_section', d.medical_section,
      'designation_key', d.designation_key, 'designation', d.designation,
      'required_quantity', d.required_quantity, 'required_stock_quantity', d.required_stock_quantity,
      'required_stock_unit', d.required_stock_unit, 'required_strength', d.required_strength,
      'required_package_size', d.required_package_size, 'dotation_requirement_revision', d.revision
    )
    from pharmacy_private.dotation_requirements d
    where d.company_id = c and (
      d.dotation_key = assigned_key
      or (d.dotation_key = 'sac medical d''urgence' and vessel.medical_emergency_bag)
      or (d.dotation_key <> 'sac medical d''urgence' and exists (
        select 1 from public.pharmacy_inventory i where i.company_id = c and i.vessel_id = p_vessel_id
          and pharmacy_private.dotation_key(i.medical_dotation) = d.dotation_key
      ))
    )
    and not exists(select 1 from official o where (o.dotation_key, o.medical_section, o.designation_key) =
      (d.dotation_key, d.medical_section, d.designation_key))
  )
  select coalesce(jsonb_agg(e.value order by e.dotation_key, e.medical_section, e.designation_key), '[]'::jsonb)
    into result from entries e;
  return result;
end;
$$;

create or replace function pharmacy_private.save_item(p_vessel_id bigint,p_item jsonb,p_id bigint,p_revision integer)
returns bigint language plpgsql security definer set search_path='' as $$
declare c bigint:=public.current_planning_company_id(); result_id bigint; r public.pharmacy_inventory%rowtype;
  category_name text; canonical_id bigint; canonical_name text; current_dotation text; parent_dotation text; branch text;
  no_date boolean; extra_stock boolean; actual_stock numeric; target_stock numeric; unit_name text; units_per_package integer; dose text;
  item_active boolean; article_key text; parent_key text; can_share boolean; change_target boolean;
  target_text text; target_unit text; target_dose text; target_package integer; actual_packaging text;
  requirement pharmacy_private.dotation_requirements%rowtype; reference pharmacy_private.d217_catalog%rowtype; emergency_bag boolean; vessel_capacity integer;
begin
  if not coalesce(pharmacy_private.can_manage(c,p_vessel_id),false) then
    raise exception using errcode='42501',message='Accès refusé à la modification de cet inventaire.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pharmacy-catalog:'||c::text,0));
  -- Freeze the Fleet type while allowing foreign-key checks for medical saves.
  select btrim(coalesce(medical_dotation,'')), medical_emergency_bag, max_people
    into current_dotation, emergency_bag, vessel_capacity from public.vessels
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
    if emergency_bag and pharmacy_private.dotation_key(p_item->>'medical_dotation')='sac medical d''urgence' then
      parent_dotation:='sac medical d''urgence';
    end if;
  end if;
  if p_item ? 'medical_dotation' and pharmacy_private.dotation_key(p_item->>'medical_dotation')<>pharmacy_private.dotation_key(parent_dotation) then
    raise exception using errcode='40001',message='La dotation de cet article a changé. Rechargez l’inventaire.'; end if;
  if pharmacy_private.dotation_key(parent_dotation)='sac medical d''urgence' and not emergency_bag then
    raise exception using errcode='40001',message='Le sac médical d’urgence n’est plus affecté à ce navire.';
  end if;
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
  if can_share and (parent_key=pharmacy_private.dotation_key(current_dotation) or parent_key='sac medical d''urgence') then
    select * into reference from pharmacy_private.d217_catalog d
    where d.dotation_key=parent_key and d.medical_section=branch
      and pharmacy_private.designation_key(d.designation)=article_key;
  end if;
  change_target:=can_share and reference.catalog_code is null and coalesce((p_item->>'update_dotation_requirement')::boolean,false);

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
  actual_packaging:=case when p_item ? 'stock_packaging' then nullif(btrim(p_item->>'stock_packaging'),'') else r.stock_packaging end;
  dose:=case when p_item ? 'strength' then nullif(btrim(p_item->>'strength'),'') else r.strength end;
  target_text:=coalesce(p_item->>'required_quantity','');
  target_unit:=case when p_item ? 'required_stock_unit' then nullif(btrim(p_item->>'required_stock_unit'),'') else r.required_stock_unit end;
  target_dose:=case when p_item ? 'required_strength' then nullif(btrim(p_item->>'required_strength'),'') else r.required_strength end;
  target_package:=case when p_item ? 'required_package_size' then nullif(p_item->>'required_package_size','')::integer else r.required_package_size end;

  if reference.catalog_code is not null then
    select rr.quantity_label, rr.amount into target_text, target_stock
      from pharmacy_private.d217_vessel_requirement(reference, vessel_capacity) rr;
    target_unit:=reference.stock_unit;
    target_dose:=reference.strength;
    target_package:=reference.package_size;
  elsif can_share then
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
      required_stock_unit,required_strength,required_package_size,stock_packaging,notes,active,created_by,updated_by)
    values(c,p_vessel_id,parent_dotation,branch,canonical_id,coalesce(p_item->>'section',''),category_name,coalesce(p_item->>'brand',''),btrim(p_item->>'designation'),coalesce(p_item->>'lot_number',''),
      coalesce(p_item->>'quantity',''),target_text,
      case when not no_date then nullif(p_item->>'expires_on','')::date end,
      case when no_date then '' else coalesce(p_item->>'expiry_text','') end,
      case when no_date then 'unknown' else coalesce(p_item->>'expiry_precision','unknown') end,
      no_date,extra_stock,actual_stock,target_stock,unit_name,units_per_package,dose,target_unit,target_dose,target_package,actual_packaging,
      coalesce(p_item->>'notes',''),item_active,auth.uid(),auth.uid())
    returning id into result_id;
  else
    update public.pharmacy_inventory set medical_section=branch,category_id=canonical_id,section=coalesce(p_item->>'section',''),category=category_name,brand=coalesce(p_item->>'brand',''),designation=btrim(p_item->>'designation'),
      lot_number=coalesce(p_item->>'lot_number',''),quantity=coalesce(p_item->>'quantity',''),required_quantity=target_text,
      expires_on=case when not no_date then nullif(p_item->>'expires_on','')::date end,
      expiry_text=case when no_date then '' else coalesce(p_item->>'expiry_text','') end,
      expiry_precision=case when no_date then 'unknown' else coalesce(p_item->>'expiry_precision','unknown') end,
      no_expiry=no_date,outside_dotation=extra_stock,stock_quantity=actual_stock,required_stock_quantity=target_stock,stock_unit=unit_name,package_size=units_per_package,strength=dose,
      required_stock_unit=target_unit,required_strength=target_dose,required_package_size=target_package,stock_packaging=actual_packaging,
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

create or replace function pharmacy_private.purchase_order_context(p_vessel_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  actor_id uuid := (select auth.uid());
  issued_on date := (current_timestamp at time zone 'Europe/Paris')::date;
  vessel public.vessels%rowtype;
  signer public.people%rowtype;
  signer_name text;
  temporary_function text;
  signature_path text;
  signature_mime_type text;
  assigned_dotation_key text;
  items jsonb;
  requirements jsonb;
begin
  if actor_id is null or not coalesce(pharmacy_private.can_manage(target_company_id, p_vessel_id), false) then
    raise exception using errcode = '42501', message = 'Vous n’êtes pas autorisé à émettre un bon de commande pour ce navire.';
  end if;

  select v.* into strict vessel from public.vessels v where v.company_id = target_company_id and v.id = p_vessel_id;
  select p.* into signer from public.people p
  where p.company_id = target_company_id and p.user_id = actor_id and p.active
    and (p.hired_on is null or p.hired_on <= issued_on)
    and (p.departed_on is null or p.departed_on >= issued_on);
  signer_name := nullif(btrim(concat_ws(' ', btrim(signer.first_name), btrim(signer.last_name))), '');
  if signer_name is null then
    raise exception using errcode = '23514', message = 'Associez votre compte à une fiche RH active pour émettre le bon de commande.';
  end if;

  select effective.label into temporary_function
  from public.planning_assignments a
  cross join lateral (select nullif(btrim(public.planning_assignment_function_on_date(a.id, issued_on)), '') as label) effective
  where a.company_id = target_company_id and a.crew_person_id = signer.id and a.vessel_id = p_vessel_id
    and issued_on between a.starts_on and a.ends_on and a.confirmation_status <> 'cancelled'
    -- Legacy assignments sometimes store a department instead of a function.
    and (translate(lower(effective.label), 'éèêë', 'eeee') not in ('crew', 'pont', 'machine', 'equipage')
      or translate(lower(effective.label), 'éèêë', 'eeee') <> translate(lower(btrim(a.assignment_role)), 'éèêë', 'eeee'))
    and public.planning_status_is_working(public.planning_effective_person_status(
      a.company_id, signer.id, issued_on, a.vessel_id, a.status_label
    ))
  order by (a.confirmation_status = 'confirmed') desc, a.starts_on desc, a.id desc
  limit 1;

  select s.storage_path, s.mime_type into signature_path, signature_mime_type
  from public.working_time_profile_signatures s
  where s.company_id = target_company_id and s.person_id = signer.id
    and s.valid_to is null and s.valid_from <= current_timestamp
    and s.storage_bucket = 'working-time-signatures' and s.mime_type in ('image/png', 'image/jpeg', 'image/webp')
    and exists (
      select 1 from document_blob_private.objects() o
      where o.bucket_id = s.storage_bucket and o.name = s.storage_path
        and o.metadata->>'mimetype' = s.mime_type and o.metadata->>'size' = s.file_size_bytes::text
        and (o.metadata->>'document_blob_verified' is distinct from 'true' or o.metadata->>'sha256' = s.sha256)
    );
  if signature_path is null then
    raise exception using errcode = '23514', message = 'Ajoutez une signature active dans votre profil pour émettre le bon de commande.';
  end if;

  assigned_dotation_key := pharmacy_private.dotation_key(vessel.medical_dotation);
  select coalesce(jsonb_agg(to_jsonb(i) - array['source_data', 'created_by', 'updated_by', 'created_at'] order by i.id), '[]'::jsonb)
  into items
  from public.pharmacy_inventory i
  where i.company_id = target_company_id and i.vessel_id = p_vessel_id and i.active
    and (pharmacy_private.dotation_key(i.medical_dotation) = assigned_dotation_key
      or (vessel.medical_emergency_bag and pharmacy_private.dotation_key(i.medical_dotation) = 'sac medical d''urgence'));

  select coalesce(jsonb_agg(r.value order by r.ordinality), '[]'::jsonb) into requirements
  from jsonb_array_elements(pharmacy_private.list_dotation_requirements(p_vessel_id)) with ordinality as r
  where r.value->>'dotation_key' = assigned_dotation_key
    or (vessel.medical_emergency_bag and r.value->>'dotation_key' = 'sac medical d''urgence');

  return jsonb_build_object(
    'issued_on', issued_on, 'vessel_name', vessel.name,
    'registration_number', nullif(btrim(vessel.registration_number), ''), 'imo_number', nullif(btrim(vessel.imo_number), ''),
    'medical_dotation', btrim(coalesce(vessel.medical_dotation, '')),
    'medical_emergency_bag', vessel.medical_emergency_bag,
    'armament', (select c.name from public.companies c where c.id = target_company_id),
    'flag_state', nullif(btrim(vessel.flag_state), ''),
    'registration_port', nullif(btrim(vessel.registration_port), ''),
    'signer_name', signer_name, 'signer_function', coalesce(temporary_function, nullif(btrim(signer.function_label), '')),
    'signature_path', signature_path, 'signature_mime_type', signature_mime_type,
    'items', items, 'requirements', requirements
  );
end;
$$;

create function pharmacy_private.d217_stock_is_low(p_item public.pharmacy_inventory, p_max_people integer, p_current_dotation text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  item_key text := pharmacy_private.dotation_key(p_item.medical_dotation);
  reference pharmacy_private.d217_catalog%rowtype;
  vessel_requirement record;
begin
  if item_key = pharmacy_private.dotation_key(p_current_dotation) or item_key = 'sac medical d''urgence' then
    select * into reference from pharmacy_private.d217_catalog d
    where d.dotation_key = item_key and d.medical_section = p_item.medical_section
      and pharmacy_private.designation_key(d.designation) = pharmacy_private.designation_key(p_item.designation);
  end if;
  if reference.catalog_code is null then
    return pharmacy_private.stock_is_low(p_item);
  end if;
  select * into vessel_requirement from pharmacy_private.d217_vessel_requirement(reference, p_max_people);
  if vessel_requirement.applicability <> 'standard' or vessel_requirement.amount is null then
    return false;
  end if;
  p_item.required_quantity := vessel_requirement.quantity_label;
  p_item.required_stock_quantity := vessel_requirement.amount;
  p_item.required_stock_unit := reference.stock_unit;
  p_item.required_strength := reference.strength;
  return pharmacy_private.stock_is_low(p_item);
end;
$$;
revoke all on function pharmacy_private.d217_stock_is_low(public.pharmacy_inventory, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function pharmacy_private.d217_stock_is_low(public.pharmacy_inventory, integer, text) to authenticated;

create or replace function public.pharmacy_notifications()
returns table(id text, kind text, vessel_id bigint, vessel_name text, title text, expires_on date, days_until_expiry integer, item_id bigint)
language sql stable security invoker set search_path = '' as $$
  with today as (select (current_timestamp at time zone 'Europe/Paris')::date d)
  select 'control-' || c.id as id, 'control' as kind, c.vessel_id, v.name as vessel_name,
    'Contrôle Pharmacie' as title, c.expires_on, c.expires_on - t.d as days_until_expiry, null::bigint as item_id
  from public.pharmacy_controls c join public.vessels v on v.id = c.vessel_id cross join today t
  where c.is_current and c.expires_on <= t.d + 30
  union all
  select 'item-' || i.id, 'item', i.vessel_id, v.name, i.designation, i.expires_on, i.expires_on - t.d, i.id
  from public.pharmacy_inventory i join public.vessels v on v.id = i.vessel_id cross join today t
  where i.active and i.expires_on <= t.d + 30
    and (v.medical_emergency_bag or pharmacy_private.dotation_key(i.medical_dotation) <> 'sac medical d''urgence')
  order by expires_on, vessel_name, title;
$$;

create or replace function public.pharmacy_inventory_notifications()
returns table(id text, kind text, vessel_id bigint, vessel_name text, title text, expires_on date, days_until_expiry integer, item_id bigint)
language sql stable security invoker set search_path = '' as $$
  select * from public.pharmacy_notifications()
  union all
  select 'stock-' || i.id, 'stock', i.vessel_id, v.name, i.designation, null::date, null::integer, i.id
  from public.pharmacy_inventory i join public.vessels v on v.id = i.vessel_id
  where i.active and not i.outside_dotation
    and (v.medical_emergency_bag or pharmacy_private.dotation_key(i.medical_dotation) <> 'sac medical d''urgence')
    and pharmacy_private.d217_stock_is_low(i, v.max_people, v.medical_dotation)
  order by expires_on, vessel_name, title;
$$;

notify pgrst, 'reload schema';
