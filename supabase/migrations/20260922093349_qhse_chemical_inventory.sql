-- Shared QHSE inventory, scoped to active company membership and navigation permission.
insert into public.role_module_permissions(role_key,module_key,is_visible)
select key,'chemicals',true from public.roles where key in ('admin','direction','armement','capitaine','marin')
on conflict(role_key,module_key) do nothing;

create function public.chemical_has_access(target_company_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and public.user_belongs_to_company(target_company_id)
    and exists(select 1 from public.user_roles r join public.role_module_permissions p on p.role_key=r.role_key
      where r.user_id=auth.uid() and r.company_id=target_company_id and p.module_key='chemicals' and p.is_visible);
$$;
revoke all on function public.chemical_has_access(bigint) from public,anon;
grant execute on function public.chemical_has_access(bigint) to authenticated;

create table public.chemical_products (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references public.companies(id),
  vessel_id bigint not null references public.vessels(id),
  brand text not null default '' check(length(brand)<=250),
  product_type text not null check(length(btrim(product_type)) between 1 and 250),
  variant text not null default '' check(length(variant)<=500),
  storage_compatibility text not null default '' check(length(storage_compatibility)<=250),
  usage text not null default '' check(length(usage)<=2000),
  pictograms text[] not null default '{}' check(pictograms <@ array['GHS01','GHS02','GHS03','GHS04','GHS05','GHS06','GHS07','GHS08','GHS09']::text[] and cardinality(pictograms)<=9 and array_position(pictograms,null) is null),
  hazards text not null default '' check(length(hazards)<=12000),
  precautions text not null default '' check(length(precautions)<=12000),
  ppe text not null default '' check(length(ppe)<=4000),
  stock_litres numeric(12,3) check(stock_litres>=0 and stock_litres<=999999999),
  storage_location text not null default '' check(length(storage_location)<=500),
  notes text not null default '' check(length(notes)<=4000),
  source_ref text unique,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz
);
create index chemical_products_scope_idx on public.chemical_products(company_id,vessel_id) where deleted_at is null;
create index chemical_products_vessel_idx on public.chemical_products(vessel_id);
create index chemical_products_created_by_idx on public.chemical_products(created_by);
create index chemical_products_updated_by_idx on public.chemical_products(updated_by);
alter table public.chemical_products enable row level security;
revoke all on public.chemical_products from anon,authenticated;
grant select,insert,update on public.chemical_products to authenticated;
-- Deleted records stay inaccessible through the UI; retaining SELECT permits UPDATE RETURNING when archiving.
create policy chemical_products_read on public.chemical_products for select to authenticated using(public.chemical_has_access(company_id));
create policy chemical_products_insert on public.chemical_products for insert to authenticated with check(public.chemical_has_access(company_id) and deleted_at is null);
create policy chemical_products_update on public.chemical_products for update to authenticated
  using(public.chemical_has_access(company_id) and deleted_at is null) with check(public.chemical_has_access(company_id));

create function public.chemical_product_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists(select 1 from public.vessels v where v.id=new.vessel_id and v.company_id=new.company_id and v.asset_kind='vessel') then
    raise exception 'Navire invalide pour cette société.' using errcode='23514';
  end if;
  if tg_op='UPDATE' then
    if row(new.id,new.company_id,new.source_ref,new.created_at,new.created_by) is distinct from row(old.id,old.company_id,old.source_ref,old.created_at,old.created_by) then
      raise exception 'Identité du produit non modifiable.' using errcode='23514';
    end if;
    new.version:=old.version+1;
  else
    new.version:=1; new.created_by:=auth.uid(); new.created_at:=now();
  end if;
  new.updated_at:=clock_timestamp(); new.updated_by:=auth.uid();
  return new;
end $$;
create trigger chemical_product_guard before insert or update on public.chemical_products for each row execute function public.chemical_product_guard();

create function public.chemical_available_vessels()
returns table(id bigint,company_id bigint,name text,acronym text,icon_url text)
language sql stable security definer set search_path = '' as $$
  select v.id,v.company_id,v.name,v.acronym,v.illustration_thumbnail_url from public.vessels v
  where public.chemical_has_access(v.company_id) and v.asset_kind='vessel'
    and (v.active or exists(select 1 from public.chemical_products p where p.vessel_id=v.id and p.deleted_at is null))
  order by v.name;
$$;
revoke all on function public.chemical_available_vessels() from public,anon;
grant execute on function public.chemical_available_vessels() to authenticated;

create table public.chemical_attachments(
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references public.companies(id),
  product_id uuid not null references public.chemical_products(id),
  storage_path text not null unique,
  file_name text not null check(length(file_name) between 1 and 250),
  mime_type text not null check(mime_type in ('application/pdf','image/png','image/jpeg','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain')),
  size_bytes bigint not null check(size_bytes>0 and size_bytes<=20971520),
  kind text not null default 'fds' check(kind in ('fds','other')),
  created_at timestamptz not null default now()
);
create index chemical_attachments_product_idx on public.chemical_attachments(product_id);
create index chemical_attachments_company_idx on public.chemical_attachments(company_id);
alter table public.chemical_attachments enable row level security;
revoke all on public.chemical_attachments from anon,authenticated;
grant select,insert,delete on public.chemical_attachments to authenticated;
create function public.chemical_storage_access(object_path text)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.chemical_products p where p.company_id::text=split_part(object_path,'/',1)
   and p.id::text=split_part(object_path,'/',2) and p.deleted_at is null and public.chemical_has_access(p.company_id))
   and array_length(string_to_array(object_path,'/'),1)=3 and length(split_part(object_path,'/',3))>0;
$$;
revoke all on function public.chemical_storage_access(text) from public,anon;
grant execute on function public.chemical_storage_access(text) to authenticated;
create policy chemical_attachments_read on public.chemical_attachments for select to authenticated
using(public.chemical_has_access(company_id) and public.chemical_storage_access(storage_path));
create policy chemical_attachments_insert on public.chemical_attachments for insert to authenticated
with check(public.chemical_has_access(company_id) and public.chemical_storage_access(storage_path)
  and split_part(storage_path,'/',1)=company_id::text and split_part(storage_path,'/',2)=product_id::text
  and exists(select 1 from storage.objects o where o.bucket_id='chemical-documents' and o.name=storage_path
    and (o.metadata->>'size')::bigint=size_bytes and o.metadata->>'mimetype'=mime_type));
create policy chemical_attachments_delete on public.chemical_attachments for delete to authenticated
using(public.chemical_has_access(company_id) and public.chemical_storage_access(storage_path));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('chemical-documents','chemical-documents',false,20971520,array['application/pdf','image/png','image/jpeg','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain']);
create policy chemical_objects_read on storage.objects for select to authenticated using(bucket_id='chemical-documents' and public.chemical_storage_access(name));
create policy chemical_objects_insert on storage.objects for insert to authenticated with check(bucket_id='chemical-documents' and public.chemical_storage_access(name));
create policy chemical_objects_delete on storage.objects for delete to authenticated using(bucket_id='chemical-documents' and public.chemical_storage_access(name));
comment on table public.chemical_products is 'QHSE chemical inventory. Null stock means unknown, not zero. Imported hazards and pictograms reproduce supplied inventory, not a verified SDS.';

-- Source import: 10 GOURY rows from the supplied PDF, 14 LANDEMER rows from the supplied screenshot.
-- No inferred safety classification; unknown stocks remain NULL.
do $import$
begin
  if (select count(*) from public.vessels v join public.companies c on c.id=v.company_id
      where c.code='bbtm' and v.active and v.asset_kind='vessel' and upper(v.name) in ('GOURY','LANDEMER')) <> 2 then
    raise exception 'Expected one active GOURY and one active LANDEMER for BBTM';
  end if;
end $import$;
insert into public.chemical_products(company_id,vessel_id,brand,product_type,variant,storage_compatibility,usage,pictograms,hazards,precautions,ppe,stock_litres,source_ref,notes)
select v.company_id,v.id,s.brand,s.product_type,s.variant,s.storage_compatibility,s.usage,s.pictograms,s.hazards,s.precautions,s.ppe,s.stock_litres,s.source_ref,s.notes
from jsonb_to_recordset($chemical_seed$[
  {
    "vessel": "GOURY",
    "brand": "CORROBAN",
    "product_type": "Super Proban",
    "variant": "",
    "storage_compatibility": "1",
    "usage": "Dégraissant émulsionnant",
    "pictograms": [
      "GHS02",
      "GHS07",
      "GHS08",
      "GHS09"
    ],
    "hazards": "H304 : Peut être mortel en cas d'ingestion et de pénétration dans les\nvoies respiratoires\nH319 : Provoque une sévère irritation des yeux\nH336 : Peut provoquer somnolence ou vertiges\nH411 : Toxique pour les organismes aquatiques, entraîne des effets\nnéfastes à long terme",
    "precautions": "P261 : Éviter de respirer les vapeurs/aérosols\nP280 : Porter des équipements de protection (gants, lunettes, etc.)\nP301+P310 : En cas d’ingestion, appeler immédiatement un centre antipoison\nP305+P351+P338 : En cas de contact avec les yeux, rincer abondamment à l’eau\nP403+P233 : Stocker dans un endroit bien ventilé et fermé hermétiquement",
    "ppe": "Gants de protection chimique,\nmasque de sécurité,\nutiliser dans un local ventilé.",
    "stock_litres": 20.0,
    "source_ref": "goury-inventory-pdf-20260922-1",
    "notes": "Repris du PDF fourni « Inventaire des Produits Chimiques - GOURY ». Données et pictogrammes à vérifier avec la FDS du produit."
  },
  {
    "vessel": "GOURY",
    "brand": "CORROBAN",
    "product_type": "Carban PLus 3",
    "variant": "",
    "storage_compatibility": "1",
    "usage": "Nettoyage entretien",
    "pictograms": [
      "GHS05",
      "GHS07",
      "GHS09"
    ],
    "hazards": "314 : Provoque des brûlures de la peau et des lésions oculaires\ngraves\nH318 : Provoque des lésions oculaires graves\nH335 : Peut irriter les voies respiratoires\nH412 : Nocif pour les organismes aquatiques, entraîne des effets\nnéfastes à long terme",
    "precautions": "P280 : Porter des gants de protection, des vêtements de protection, un équipement de\nprotection des yeux/du visage\nP261 : Éviter de respirer les vapeurs/aérosols\nP305+P351+P338 : En cas de contact avec les yeux, rincer avec précaution à l’eau\npendant plusieurs minutes. Enlever les lentilles si possible\nP302+P352 : En cas de contact avec la peau, laver abondamment à l’eau\nP273 : Éviter le rejet dans l’environnement\nP501 : Éliminer le contenu/récipient conformément à la réglementation locale",
    "ppe": "Gants de protection chimique,\nlunettes de protection",
    "stock_litres": 5.0,
    "source_ref": "goury-inventory-pdf-20260922-2",
    "notes": "Repris du PDF fourni « Inventaire des Produits Chimiques - GOURY ». Données et pictogrammes à vérifier avec la FDS du produit."
  },
  {
    "vessel": "GOURY",
    "brand": "",
    "product_type": "Acétone",
    "variant": "",
    "storage_compatibility": "1",
    "usage": "solvant organique",
    "pictograms": [
      "GHS02",
      "GHS07"
    ],
    "hazards": "H225 : Liquide et vapeurs très inflammables\nH319 : Provoque une sévère irritation des yeux\nH336 : Peut provoquer somnolence ou vertiges\nEUH066 : L'exposition répétée peut provoquer dessèchement ou\ngerçures de la peau",
    "precautions": "P210 : Tenir à l’écart de la chaleur/des étincelles/des flammes nues/des surfaces\nchaudes – Ne pas fumer\nP261 : Éviter de respirer les vapeurs\nP280 : Porter des gants de protection/des vêtements de protection/un équipement de\nprotection des yeux/du visage\nP305+P351+P338 : EN CAS DE CONTACT AVEC LES YEUX : rincer avec précaution\nà l’eau pendant plusieurs minutes. Enlever les lentilles de contact si possible\nP403+P233 : Stocker dans un endroit bien ventilé. Maintenir le récipient fermé de\nmanière étanche\nP501 : Éliminer le contenu/récipient conformément à la réglementation locale",
    "ppe": "Gants de protection chimique,\nmasque de sécurité,\nutiliser dans un local ventilé.",
    "stock_litres": 10.0,
    "source_ref": "goury-inventory-pdf-20260922-3",
    "notes": "Repris du PDF fourni « Inventaire des Produits Chimiques - GOURY ». Données et pictogrammes à vérifier avec la FDS du produit."
  },
  {
    "vessel": "GOURY",
    "brand": "CORROBAN",
    "product_type": "Grisban 3",
    "variant": "",
    "storage_compatibility": "1",
    "usage": "solvant, détergent,\némulsionnant, autocassable",
    "pictograms": [
      "GHS02",
      "GHS07",
      "GHS09"
    ],
    "hazards": "H226 : Liquide et vapeurs inflammables\nH315 : Provoque une irritation cutanée\nH319 : Provoque une sévère irritation des yeux\nH336 : Peut provoquer somnolence ou vertiges\nH411 : Toxique pour les organismes aquatiques, entraîne des effets\nnéfastes à long terme",
    "precautions": "P210 : Tenir à l’écart de la chaleur/des étincelles/des flammes nues\nP280 : Porter des gants, des lunettes de protection, un masque si nécessaire\nP302+P352 : En cas de contact avec la peau, laver abondamment à l’eau\nP305+P351+P338 : En cas de contact avec les yeux, rincer avec précaution à l’eau\npendant plusieurs minutes\nP273 : Éviter le rejet dans l’environnement\nP501 : Éliminer le contenu/récipient conformément à la réglementation locale",
    "ppe": "Gants de protection chimique,\nmasque de sécurité,",
    "stock_litres": 5.0,
    "source_ref": "goury-inventory-pdf-20260922-4",
    "notes": "Repris du PDF fourni « Inventaire des Produits Chimiques - GOURY ». Données et pictogrammes à vérifier avec la FDS du produit."
  },
  {
    "vessel": "GOURY",
    "brand": "",
    "product_type": "Corrobrill",
    "variant": "",
    "storage_compatibility": "1",
    "usage": "désoxydant maritime",
    "pictograms": [
      "GHS05",
      "GHS07"
    ],
    "hazards": "H314 : Provoque des brûlures de la peau et des lésions oculaires\ngraves\nH290 : Peut être corrosif pour les métaux\nH335 : Peut irriter les voies respiratoires",
    "precautions": "P280 : Porter des gants de protection, des lunettes de protection, un masque si\nnécessaire\nP301+P330+P331 : EN CAS D’INGESTION : rincer la bouche. NE PAS faire vomir\nP303+P361+P353 : EN CAS DE CONTACT AVEC LA PEAU (ou les cheveux) : enlever\nimmédiatement les vêtements contaminés. Rincer la peau à l’eau\nP305+P351+P338 : EN CAS DE CONTACT AVEC LES YEUX : rincer avec précaution\nà l’eau pendant plusieurs minutes\nP501 : Éliminer le contenu/récipient conformément à la réglementation locale",
    "ppe": "Gants de protection chimique,\nmasque de sécurité,",
    "stock_litres": 10.0,
    "source_ref": "goury-inventory-pdf-20260922-5",
    "notes": "Repris du PDF fourni « Inventaire des Produits Chimiques - GOURY ». Données et pictogrammes à vérifier avec la FDS du produit."
  },
  {
    "vessel": "GOURY",
    "brand": "",
    "product_type": "Xbee",
    "variant": "",
    "storage_compatibility": "1",
    "usage": "additif enzymatique",
    "pictograms": [
      "GHS02",
      "GHS07",
      "GHS08",
      "GHS09"
    ],
    "hazards": "H226 : Liquide et vapeurs inflammables\nH304 : Peut être mortel en cas d’ingestion et de pénétration dans les\nvoies respiratoires\nH315 : Provoque une irritation cutanée\nH319 : Provoque une sévère irritation des yeux\nH336 : Peut provoquer somnolence ou vertiges\nH411 : Toxique pour les organismes aquatiques, entraîne des effets\nnéfastes à long terme",
    "precautions": "P210 : Tenir à l’écart de la chaleur/des étincelles/des flammes nues\nP280 : Porter des gants, des lunettes de protection\nP301+P310 : EN CAS D’INGESTION : appeler immédiatement un centre antipoison\nP305+P351+P338 : EN CAS DE CONTACT AVEC LES YEUX : rincer avec précaution\nà l’eau pendant plusieurs minutes\nP403+P233 : Stocker dans un endroit bien ventilé. Maintenir le récipient fermé de\nmanière étanche\nP501 : Éliminer le contenu/récipient conformément à la réglementation locale",
    "ppe": "Gants de protection chimique,\nmasque de sécurité,",
    "stock_litres": 35.0,
    "source_ref": "goury-inventory-pdf-20260922-6",
    "notes": "Repris du PDF fourni « Inventaire des Produits Chimiques - GOURY ». Données et pictogrammes à vérifier avec la FDS du produit."
  },
  {
    "vessel": "GOURY",
    "brand": "",
    "product_type": "Vigor",
    "variant": "",
    "storage_compatibility": "1",
    "usage": "Détergent ménager",
    "pictograms": [
      "GHS07"
    ],
    "hazards": "H319 : Provoque une sévère irritation des yeux",
    "precautions": "P101 : En cas de consultation d’un médecin, garder à disposition le récipient ou\nl’étiquette\nP102 : Tenir hors de portée des enfants\nP264 : Se laver les mains soigneusement après manipulation\nP280 : Porter un équipement de protection des yeux\nP305+P351+P338 : EN CAS DE CONTACT AVEC LES YEUX : rincer avec précaution\nà l’eau pendant plusieurs minutes. Enlever les lentilles si possible. Continuer à rincer\nP337+P313 : Si l’irritation oculaire persiste : consulter un médecin\nP390 : Absorber toute substance répandue pour éviter qu’elle attaque les matériaux\nenvironnants",
    "ppe": "Gants de protection chimique,\nmasque de sécurité,\nutiliser dans un local ventilé.",
    "stock_litres": 5.0,
    "source_ref": "goury-inventory-pdf-20260922-7",
    "notes": "Repris du PDF fourni « Inventaire des Produits Chimiques - GOURY ». Données et pictogrammes à vérifier avec la FDS du produit."
  },
  {
    "vessel": "GOURY",
    "brand": "",
    "product_type": "Teepol",
    "variant": "",
    "storage_compatibility": "1",
    "usage": "Nettoyage multi-surfaces",
    "pictograms": [
      "GHS07"
    ],
    "hazards": "H319 : Provoque une sévère irritation des yeux",
    "precautions": "P101 : En cas de consultation d’un médecin, garder à disposition le récipient ou\nl’étiquette\nP102 : Tenir hors de portée des enfants\nP264 : Se laver soigneusement les mains après manipulation\nP280 : Porter un équipement de protection des yeux\nP305+P351+P338 : EN CAS DE CONTACT AVEC LES YEUX : rincer avec précaution\nà l’eau pendant plusieurs minutes. Enlever les lentilles si possible. Continuer à rincer\nP337+P313 : Si l’irritation oculaire persiste : consulter un médecin",
    "ppe": "Gants de protection chimique,\nmasque de sécurité,\nutiliser dans un local ventilé.",
    "stock_litres": 5.0,
    "source_ref": "goury-inventory-pdf-20260922-8",
    "notes": "Repris du PDF fourni « Inventaire des Produits Chimiques - GOURY ». Données et pictogrammes à vérifier avec la FDS du produit."
  },
  {
    "vessel": "GOURY",
    "brand": "CORROBAN",
    "product_type": "Corrosolgras",
    "variant": "",
    "storage_compatibility": "2",
    "usage": "détergent alcalin concentré\ndestiné aux travaux de\ndégraissage intensif",
    "pictograms": [
      "GHS05",
      "GHS07"
    ],
    "hazards": "H314 : Provoque des brûlures de la peau et des lésions oculaires\ngraves\nH290 : Peut être corrosif pour les métaux\nH335 : Peut irriter les voies respiratoires",
    "precautions": "P280 : Porter des gants, des lunettes de protection, un masque si nécessaire\nP301+P330+P331 : EN CAS D’INGESTION : rincer la bouche. NE PAS faire vomir\nP303+P361+P353 : EN CAS DE CONTACT AVEC LA PEAU : enlever immédiatement\nles vêtements contaminés. Rincer la peau à l’eau\nP305+P351+P338 : EN CAS DE CONTACT AVEC LES YEUX : rincer avec précaution\nà l’eau pendant plusieurs minutes\nP501 : Éliminer le contenu/récipient conformément à la réglementation locale",
    "ppe": "Gants de protection chimique,\nmasque de sécurité,\nutiliser dans un local ventilé.",
    "stock_litres": 5.0,
    "source_ref": "goury-inventory-pdf-20260922-9",
    "notes": "Repris du PDF fourni « Inventaire des Produits Chimiques - GOURY ». Données et pictogrammes à vérifier avec la FDS du produit."
  },
  {
    "vessel": "GOURY",
    "brand": "",
    "product_type": "Javel Liquide",
    "variant": "",
    "storage_compatibility": "3",
    "usage": "Désinfectant (oxydant)",
    "pictograms": [
      "GHS05",
      "GHS09"
    ],
    "hazards": "H315 : Provoque une irritation cutanée\nH319 : Provoque une sévère irritation des yeux\nH410 : Très toxique pour les organismes aquatiques, entraîne des\neffets néfastes à long terme\nEUH206 : Attention ! Ne pas utiliser en combinaison avec d'autres\nproduits. Peut libérer des gaz dangereux (chlore)",
    "precautions": "P101 : En cas de consultation d’un médecin, garder à disposition le récipient ou\nl’étiquette\nP102 : Tenir hors de portée des enfants\nP264 : Se laver soigneusement les mains après manipulation\nP273 : Éviter le rejet dans l’environnement\nP280 : Porter des gants de protection et un équipement de protection des yeux\nP305+P351+P338 : EN CAS DE CONTACT AVEC LES YEUX : rincer avec précaution\nà l’eau pendant plusieurs minutes. Enlever les lentilles si possible. Continuer à rincer\nP501 : Éliminer le contenu/récipient dans un centre agréé",
    "ppe": "Gants de protection chimique,\nmasque de sécurité",
    "stock_litres": 30.0,
    "source_ref": "goury-inventory-pdf-20260922-10",
    "notes": "Repris du PDF fourni « Inventaire des Produits Chimiques - GOURY ». Données et pictogrammes à vérifier avec la FDS du produit."
  },
  {
    "vessel": "LANDEMER",
    "brand": "JOTUN",
    "product_type": "Conseal Touch-Up",
    "variant": "Base 2, 4,5 L",
    "storage_compatibility": "",
    "usage": "",
    "pictograms": [],
    "hazards": "",
    "precautions": "",
    "ppe": "",
    "stock_litres": null,
    "source_ref": "landemer-capture-20260922-1",
    "notes": "Repris de la capture fournie, affectation LANDEMER confirmée. Stock, pictogrammes et données de sécurité à renseigner depuis la FDS."
  },
  {
    "vessel": "LANDEMER",
    "brand": "JOTUN",
    "product_type": "Pilot II",
    "variant": "Base 3",
    "storage_compatibility": "",
    "usage": "",
    "pictograms": [],
    "hazards": "",
    "precautions": "",
    "ppe": "",
    "stock_litres": null,
    "source_ref": "landemer-capture-20260922-2",
    "notes": "Repris de la capture fournie, affectation LANDEMER confirmée. Stock, pictogrammes et données de sécurité à renseigner depuis la FDS."
  },
  {
    "vessel": "LANDEMER",
    "brand": "CHUGOKU",
    "product_type": "Seatender 10",
    "variant": "Format à relever",
    "storage_compatibility": "",
    "usage": "",
    "pictograms": [],
    "hazards": "",
    "precautions": "",
    "ppe": "",
    "stock_litres": null,
    "source_ref": "landemer-capture-20260922-3",
    "notes": "Repris de la capture fournie, affectation LANDEMER confirmée. Stock, pictogrammes et données de sécurité à renseigner depuis la FDS."
  },
  {
    "vessel": "LANDEMER",
    "brand": "JOTUN",
    "product_type": "Pilot II",
    "variant": "Base 6",
    "storage_compatibility": "",
    "usage": "",
    "pictograms": [],
    "hazards": "",
    "precautions": "",
    "ppe": "",
    "stock_litres": null,
    "source_ref": "landemer-capture-20260922-4",
    "notes": "Repris de la capture fournie, affectation LANDEMER confirmée. Stock, pictogrammes et données de sécurité à renseigner depuis la FDS."
  },
  {
    "vessel": "LANDEMER",
    "brand": "",
    "product_type": "Acétone",
    "variant": "UN 1090, CE 200-662-2",
    "storage_compatibility": "",
    "usage": "",
    "pictograms": [],
    "hazards": "",
    "precautions": "",
    "ppe": "",
    "stock_litres": null,
    "source_ref": "landemer-capture-20260922-5",
    "notes": "Repris de la capture fournie, affectation LANDEMER confirmée. Stock, pictogrammes et données de sécurité à renseigner depuis la FDS."
  },
  {
    "vessel": "LANDEMER",
    "brand": "JOTUN",
    "product_type": "Pilot QD Primer",
    "variant": "White",
    "storage_compatibility": "",
    "usage": "",
    "pictograms": [],
    "hazards": "",
    "precautions": "",
    "ppe": "",
    "stock_litres": null,
    "source_ref": "landemer-capture-20260922-6",
    "notes": "Repris de la capture fournie, affectation LANDEMER confirmée. Stock, pictogrammes et données de sécurité à renseigner depuis la FDS."
  },
  {
    "vessel": "LANDEMER",
    "brand": "JOTUN",
    "product_type": "Pilot II",
    "variant": "Base 1",
    "storage_compatibility": "",
    "usage": "",
    "pictograms": [],
    "hazards": "",
    "precautions": "",
    "ppe": "",
    "stock_litres": null,
    "source_ref": "landemer-capture-20260922-7",
    "notes": "Repris de la capture fournie, affectation LANDEMER confirmée. Stock, pictogrammes et données de sécurité à renseigner depuis la FDS."
  },
  {
    "vessel": "LANDEMER",
    "brand": "",
    "product_type": "Substitut du White Spirit",
    "variant": "Marque et UFI manquants",
    "storage_compatibility": "",
    "usage": "",
    "pictograms": [],
    "hazards": "",
    "precautions": "",
    "ppe": "",
    "stock_litres": null,
    "source_ref": "landemer-capture-20260922-8",
    "notes": "Repris de la capture fournie, affectation LANDEMER confirmée. Stock, pictogrammes et données de sécurité à renseigner depuis la FDS."
  },
  {
    "vessel": "LANDEMER",
    "brand": "MIEUXA",
    "product_type": "Essence F",
    "variant": "Référence et UFI à confirmer",
    "storage_compatibility": "",
    "usage": "",
    "pictograms": [],
    "hazards": "",
    "precautions": "",
    "ppe": "",
    "stock_litres": null,
    "source_ref": "landemer-capture-20260922-9",
    "notes": "Repris de la capture fournie, affectation LANDEMER confirmée. Stock, pictogrammes et données de sécurité à renseigner depuis la FDS."
  },
  {
    "vessel": "LANDEMER",
    "brand": "Mr Muscle",
    "product_type": "Oven Cleaner",
    "variant": "UFI CFFQ-C0GV-200X-PDF7",
    "storage_compatibility": "",
    "usage": "",
    "pictograms": [],
    "hazards": "",
    "precautions": "",
    "ppe": "",
    "stock_litres": null,
    "source_ref": "landemer-capture-20260922-10",
    "notes": "Repris de la capture fournie, affectation LANDEMER confirmée. Stock, pictogrammes et données de sécurité à renseigner depuis la FDS."
  },
  {
    "vessel": "LANDEMER",
    "brand": "AMBERSIL",
    "product_type": "Wire Rope Lube",
    "variant": "Aérosol ou vrac",
    "storage_compatibility": "",
    "usage": "",
    "pictograms": [],
    "hazards": "",
    "precautions": "",
    "ppe": "",
    "stock_litres": null,
    "source_ref": "landemer-capture-20260922-11",
    "notes": "Repris de la capture fournie, affectation LANDEMER confirmée. Stock, pictogrammes et données de sécurité à renseigner depuis la FDS."
  },
  {
    "vessel": "LANDEMER",
    "brand": "MORRIS",
    "product_type": "Lubricants",
    "variant": "Nom et grade manquants",
    "storage_compatibility": "",
    "usage": "",
    "pictograms": [],
    "hazards": "",
    "precautions": "",
    "ppe": "",
    "stock_litres": null,
    "source_ref": "landemer-capture-20260922-12",
    "notes": "Repris de la capture fournie, affectation LANDEMER confirmée. Stock, pictogrammes et données de sécurité à renseigner depuis la FDS."
  },
  {
    "vessel": "LANDEMER",
    "brand": "PROTEC",
    "product_type": "Precision Brake Cleaner",
    "variant": "Référence UFI format manquants",
    "storage_compatibility": "",
    "usage": "",
    "pictograms": [],
    "hazards": "",
    "precautions": "",
    "ppe": "",
    "stock_litres": null,
    "source_ref": "landemer-capture-20260922-13",
    "notes": "Repris de la capture fournie, affectation LANDEMER confirmée. Stock, pictogrammes et données de sécurité à renseigner depuis la FDS."
  },
  {
    "vessel": "LANDEMER",
    "brand": "Vickers Oils",
    "product_type": "NEOX DT",
    "variant": "Format à relever",
    "storage_compatibility": "",
    "usage": "",
    "pictograms": [],
    "hazards": "",
    "precautions": "",
    "ppe": "",
    "stock_litres": null,
    "source_ref": "landemer-capture-20260922-14",
    "notes": "Repris de la capture fournie, affectation LANDEMER confirmée. Stock, pictogrammes et données de sécurité à renseigner depuis la FDS."
  }
]$chemical_seed$::jsonb) as s(vessel text,brand text,product_type text,variant text,storage_compatibility text,usage text,pictograms text[],hazards text,precautions text,ppe text,stock_litres numeric,source_ref text,notes text)
join public.vessels v on upper(v.name)=s.vessel and v.active and v.asset_kind='vessel'
join public.companies c on c.id=v.company_id and c.code='bbtm'
on conflict(source_ref) do nothing;
