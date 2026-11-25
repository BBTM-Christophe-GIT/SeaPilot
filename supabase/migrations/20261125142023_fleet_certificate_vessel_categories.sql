create function private.fleet_certificate_vessel_type(navigation_category text, type_label text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(btrim(navigation_category)) = 'fluvial'
      or (nullif(btrim(navigation_category), '') is null and type_label ilike '%fluvial%')
      then 'fluvial'
    else 'maritime'
  end;
$$;

revoke all on function private.fleet_certificate_vessel_type(text, text) from public, anon;
grant execute on function private.fleet_certificate_vessel_type(text, text) to authenticated;

create function public.list_fleet_certificate_vessels()
returns table (
  id bigint,
  company_id bigint,
  name text,
  acronym text,
  overall_length_m text,
  vessel_type text,
  asset_kind text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select vessel.id, vessel.company_id, vessel.name, vessel.acronym, vessel.length_overall,
         private.fleet_certificate_vessel_type(vessel.navigation_category, vessel.type_label),
         vessel.asset_kind
  from public.vessels vessel
  where vessel.company_id = (select public.current_planning_company_id())
    and (select public.has_any_role(array['admin', 'direction', 'armement']))
    and vessel.active
    and (
      vessel.asset_kind = 'vessel'
      or exists (
        select 1 from public.fleet_certificates certificate
        where certificate.company_id = vessel.company_id and certificate.vessel_id = vessel.id
      )
    );
$$;

revoke all on function public.list_fleet_certificate_vessels() from public, anon;
grant execute on function public.list_fleet_certificate_vessels() to authenticated;

create table public.fleet_certificate_categories (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  vessel_type text not null check (vessel_type in ('maritime', 'fluvial')),
  category_key text not null check (
    category_key = btrim(category_key) and category_key <> ''
    and category_key not in (
      '07-2-life-jacket', '07-4-gmdss', '07-6-pyrotechnie', '07-8-bouee-feux-retournement-mob'
    )
  ),
  category_label text not null check (char_length(category_label) between 1 and 160),
  parent_key text,
  is_active boolean not null default true,
  unique (company_id, vessel_type, category_key),
  foreign key (company_id, vessel_type, parent_key)
    references public.fleet_certificate_categories (company_id, vessel_type, category_key)
);

create unique index fleet_certificate_categories_label_idx
  on public.fleet_certificate_categories (company_id, vessel_type, lower(category_label));

create index fleet_certificate_categories_parent_idx
  on public.fleet_certificate_categories (company_id, vessel_type, parent_key)
  where parent_key is not null;

alter table public.fleet_certificate_categories enable row level security;
revoke all on public.fleet_certificate_categories from public, anon, authenticated;
grant select on public.fleet_certificate_categories to authenticated;
grant insert (company_id, vessel_type, category_key, category_label, parent_key, is_active)
  on public.fleet_certificate_categories to authenticated;
grant update (category_label, parent_key, is_active)
  on public.fleet_certificate_categories to authenticated;

create policy fleet_certificate_categories_read on public.fleet_certificate_categories
for select to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and (
    (select public.has_any_role(array['admin', 'direction', 'armement']))
    or (select exists (
      select 1 from public.fleet_certificates certificate
      where certificate.company_id = (select public.current_planning_company_id())
    ))
  )
);

create policy fleet_certificate_categories_insert on public.fleet_certificate_categories
for insert to authenticated
with check (
  company_id = (select public.current_planning_company_id())
  and (select public.has_any_role(array['admin', 'direction', 'armement']))
);

create policy fleet_certificate_categories_update on public.fleet_certificate_categories
for update to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and (select public.has_any_role(array['admin', 'direction', 'armement']))
)
with check (
  company_id = (select public.current_planning_company_id())
  and (select public.has_any_role(array['admin', 'direction', 'armement']))
);

insert into public.fleet_certificate_categories (company_id, vessel_type, category_key, category_label, parent_key)
select company.id, initial.vessel_type, initial.category_key, initial.category_label, initial.parent_key
from public.companies company
cross join (values
  ('maritime', '04-assurance', '04 - Assurance', null),
  ('maritime', '06-incendie', '06 - Incendie', null),
  ('maritime', '06-1-extincteurs-portatifs', '06.1 - Extincteurs portatifs', '06-incendie'),
  ('maritime', '06-2-extinction-fixe', '06.2 - Extinction fixe', '06-incendie'),
  ('maritime', '06-3-tenue-pompier-ari', '06.3 - Tenue de pompier, ARI', '06-incendie'),
  ('maritime', '07-lsa', '07 - LSA', null),
  ('maritime', '07-1-radeaux-hru', '07.1 - Radeaux / HRU', '07-lsa'),
  ('maritime', '07-3-combinaison-survie', '07.3 - Combinaison de survie', '07-lsa'),
  ('maritime', '07-5-personal-locator-beacon-ais', '07.5 - Personal Locator Beacon, AIS', '07-lsa'),
  ('maritime', '07-7-lance-amarre', '07.7 - Lance Amarre', '07-lsa'),
  ('maritime', '07-9-defibrilateur', '07.9 - Défibrilateur', '07-lsa'),
  ('maritime', '08-levage', '08 - Levage', null),
  ('maritime', '08-1-grue', '08.1 - Grue', '08-levage'),
  ('maritime', '08-2-bossoir', '08.2 - Bossoir', '08-levage'),
  ('maritime', '08-3-accessoires-levage', '08.3 - Accessoires de levage', '08-levage'),
  ('maritime', '08-4-treuils', '08.4 - Treuils', '08-levage'),
  ('maritime', '08-5-remorques', '08.5 - Remorques', '08-levage'),
  ('maritime', '15-dotation-medicale', '15 - Dotation Médicale', null),
  ('maritime', '16-registre-produits-dangereux', '16 - Registre des produits dangereux', null),
  ('maritime', '16-1-liste-produits-dangereux', '16.1 - Liste des produits Dangereux', '16-registre-produits-dangereux'),
  ('maritime', '16-2-fiches-donnee-securite', '16.2 - Fiches de Donnée de Sécurité', '16-registre-produits-dangereux'),
  ('fluvial', 'fluvial-certificats-navigation', 'Certificats de navigation', null),
  ('fluvial', 'fluvial-immatriculation', 'Immatriculation et documents de bord', null),
  ('fluvial', 'fluvial-assurances', 'Assurances', null),
  ('fluvial', 'fluvial-securite-incendie', 'Sécurité et incendie', null),
  ('fluvial', 'fluvial-controles-techniques', 'Contrôles techniques', null),
  ('fluvial', 'fluvial-environnement', 'Environnement', null)
) as initial(vessel_type, category_key, category_label, parent_key);

-- Add categories supplied by imported vessel documents. The explicit catalog
-- above takes precedence for canonical labels and known parent relationships.
insert into public.fleet_certificate_categories (company_id, vessel_type, category_key, category_label)
select distinct on (certificate.company_id, certificate.category_key)
       certificate.company_id, 'maritime', certificate.category_key,
       left(coalesce(nullif(btrim(certificate.category_label), ''), certificate.category_key), 160)
from public.fleet_certificates certificate
left join public.vessels vessel on vessel.id = certificate.vessel_id
where private.fleet_certificate_vessel_type(vessel.navigation_category, vessel.type_label) = 'maritime'
  and certificate.category_key = btrim(certificate.category_key)
  and certificate.category_key not in (
    '', '08-grue-et-bossoir', '07-2-life-jacket', '07-4-gmdss',
    '07-6-pyrotechnie', '07-8-bouee-feux-retournement-mob'
  )
order by certificate.company_id, certificate.category_key,
         nullif(btrim(certificate.category_label), '') is null, certificate.id desc
on conflict do nothing;

create function private.validate_fleet_certificate_category_hierarchy()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.category_label := btrim(new.category_label);
  if tg_op = 'UPDATE' then
    if new.parent_key is not distinct from old.parent_key and new.is_active = old.is_active then
      return new;
    end if;
  end if;

  -- Serialize changes within a catalog so concurrent edits cannot create
  -- grandchildren or archive a parent while an active child is added.
  perform pg_advisory_xact_lock(hashtextextended(
    'fleet-certificate-categories:' || new.company_id || ':' || new.vessel_type, 0
  ));

  if new.parent_key is not null and (
    new.parent_key = new.category_key
    or not exists (
      select 1 from public.fleet_certificate_categories parent
      where parent.company_id = new.company_id
        and parent.vessel_type = new.vessel_type
        and parent.category_key = new.parent_key
        and parent.parent_key is null
        and (parent.is_active or not new.is_active)
    )
  ) then
    raise exception using errcode = '23514', message = 'Sélectionnez une catégorie parente de premier niveau compatible.';
  end if;

  if tg_op = 'UPDATE' and (new.parent_key is not null or not new.is_active) and exists (
    select 1 from public.fleet_certificate_categories child
    where child.company_id = new.company_id
      and child.vessel_type = new.vessel_type
      and child.parent_key = new.category_key
      and (new.parent_key is not null or child.is_active)
  ) then
    raise exception using errcode = '23514', message = 'Déplacez ou archivez d’abord les sous-catégories associées.';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_fleet_certificate_category_hierarchy() from public, anon, authenticated;

create trigger validate_fleet_certificate_category_hierarchy
before insert or update of category_label, parent_key, is_active on public.fleet_certificate_categories
for each row execute function private.validate_fleet_certificate_category_hierarchy();

create function private.validate_fleet_certificate_document_category()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  selected_label text;
begin
  -- Imports and the existing SECURITY DEFINER annual lifting publication
  -- retain their independent document categories.
  if current_user <> 'authenticated' then
    return new;
  end if;

  select category.category_label into selected_label
  from public.vessels vessel
  join public.fleet_certificate_categories category
    on category.company_id = vessel.company_id
    and category.vessel_type = private.fleet_certificate_vessel_type(vessel.navigation_category, vessel.type_label)
    and category.category_key = new.category_key
    and category.is_active
  where vessel.id = new.vessel_id
    and vessel.company_id = new.company_id
    and vessel.active
    and (
      vessel.asset_kind = 'vessel'
      or exists (
        select 1 from public.fleet_certificates certificate
        where certificate.company_id = vessel.company_id and certificate.vessel_id = vessel.id
      )
    )
  for share of category;

  if found then
    new.category_label := selected_label;
    return new;
  end if;

  -- Editing metadata remains possible for historical and archived categories
  -- when the existing document stays on its original vessel and category.
  if tg_op = 'UPDATE'
    and new.company_id is not distinct from old.company_id
    and new.vessel_id is not distinct from old.vessel_id
    and new.category_key is not distinct from old.category_key
  then
    new.category_label := old.category_label;
    return new;
  end if;

  raise exception using errcode = '22023', message = 'Sélectionnez une catégorie active correspondant au type du navire.';
end;
$$;

revoke all on function private.validate_fleet_certificate_document_category() from public, anon, authenticated;

create trigger validate_fleet_certificate_document_category
before insert or update of company_id, vessel_id, category_key, category_label on public.fleet_certificates
for each row execute function private.validate_fleet_certificate_document_category();

notify pgrst, 'reload schema';
