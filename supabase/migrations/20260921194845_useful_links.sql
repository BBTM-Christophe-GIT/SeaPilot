-- Company-scoped shared directory, controlled by Administration's module matrix.
insert into public.role_module_permissions(role_key, module_key, is_visible)
select key, 'usefulLinks', true from public.roles
where key in ('admin','direction','armement','capitaine','marin')
on conflict(role_key,module_key) do nothing;

create function public.useful_links_has_access(manage boolean default false)
returns boolean language sql stable security invoker set search_path = '' as $$
  select auth.uid() is not null
    and public.user_belongs_to_company(public.current_planning_company_id())
    and exists (
      select 1 from public.user_roles r
      join public.role_module_permissions p on p.role_key = r.role_key
      where r.user_id = auth.uid() and r.company_id = public.current_planning_company_id()
        and p.module_key = 'usefulLinks' and p.is_visible
        and (not manage or r.role_key in ('admin','direction'))
    );
$$;
create function public.useful_links_can_manage()
returns boolean language sql stable security invoker set search_path = '' as $$
  select public.useful_links_has_access(true);
$$;
revoke all on function public.useful_links_has_access(boolean), public.useful_links_can_manage() from public, anon;
grant execute on function public.useful_links_has_access(boolean), public.useful_links_can_manage() to authenticated;

create table public.useful_link_categories (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null default public.current_planning_company_id() references public.companies(id),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  unique(id,company_id)
);
create unique index useful_link_categories_company_name_idx on public.useful_link_categories(company_id,lower(name));

create table public.useful_links (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null default public.current_planning_company_id() references public.companies(id),
  category_id uuid,
  title text not null check (title = btrim(title) and char_length(title) between 1 and 120),
  url text not null check (char_length(url) <= 8000 and url ~ '^https?://[^/@[:space:]]+([/?#][^[:space:]]*)?$'),
  foreign key (category_id,company_id) references public.useful_link_categories(id,company_id) on delete set null (category_id)
);
create index useful_links_company_category_idx on public.useful_links(company_id,category_id);

alter table public.useful_link_categories enable row level security;
alter table public.useful_links enable row level security;
revoke all on public.useful_link_categories,public.useful_links from anon,authenticated;
grant select,insert,update,delete on public.useful_link_categories,public.useful_links to authenticated;

create policy useful_link_categories_read on public.useful_link_categories for select to authenticated
using(company_id = (select public.current_planning_company_id()) and (select public.useful_links_has_access()));
create policy useful_link_categories_insert on public.useful_link_categories for insert to authenticated
with check(company_id = (select public.current_planning_company_id()) and (select public.useful_links_can_manage()));
create policy useful_link_categories_update on public.useful_link_categories for update to authenticated
using(company_id = (select public.current_planning_company_id()) and (select public.useful_links_can_manage()))
with check(company_id = (select public.current_planning_company_id()) and (select public.useful_links_can_manage()));
create policy useful_link_categories_delete on public.useful_link_categories for delete to authenticated
using(company_id = (select public.current_planning_company_id()) and (select public.useful_links_can_manage()));
create policy useful_links_read on public.useful_links for select to authenticated
using(company_id = (select public.current_planning_company_id()) and (select public.useful_links_has_access()));
create policy useful_links_insert on public.useful_links for insert to authenticated
with check(company_id = (select public.current_planning_company_id()) and (select public.useful_links_can_manage()));
create policy useful_links_update on public.useful_links for update to authenticated
using(company_id = (select public.current_planning_company_id()) and (select public.useful_links_can_manage()))
with check(company_id = (select public.current_planning_company_id()) and (select public.useful_links_can_manage()));
create policy useful_links_delete on public.useful_links for delete to authenticated
using(company_id = (select public.current_planning_company_id()) and (select public.useful_links_can_manage()));

-- Stable entry points replace one-use OAuth state/nonce/PKCE links. Keep both meeting identities.
insert into public.useful_link_categories(company_id,name)
select c.id, names.name from public.companies c
cross join (values ('Fournisseurs & partenaires'),('Classification & conformité'),('Opérations & flotte'),('Documents & signature'),('Réunions Teams')) names(name)
where c.code='bbtm';

with seeds(title,url,category) as (values
  ('SupplHi · Portail fournisseurs','https://vendor.supplhi.com/','Fournisseurs & partenaires'),
  ('Offshare · LEMS','https://offshare.lems-fr.com/ui/profile?filters=%5B%5D','Fournisseurs & partenaires'),
  ('Bureau Veritas · MOVE','https://move.bureauveritas.com/#/app-drawer','Classification & conformité'),
  ('Veracity · DNV','https://www.veracity.com/','Classification & conformité'),
  ('DNV · Portail maritime','https://services.veracity.com/','Classification & conformité'),
  ('Offshore Energy Manager','https://www.offshoreenergymanager.com/account/signin','Opérations & flotte'),
  ('IMCA · eCMID','https://database.ecmid.com/default.aspx','Classification & conformité'),
  ('OMI · Publications','https://imo-epublications.org/content/books/9789280125160/read','Documents & signature'),
  ('Marad · Administration du navire','https://www.marad.online/main/vessel/29d924e3-871f-4b4a-bf60-c52391cc57dc/start/administration','Opérations & flotte'),
  ('Nomade · Ports de Normandie','https://nomade.portsdenormandie.fr/','Opérations & flotte'),
  ('Docusign · Documents','https://apps.docusign.com/send/documents?view=inbox','Documents & signature'),
  ('Oracle · Construction & Engineering','https://constructionandengineering.oraclecloud.com/idcsLogin','Fournisseurs & partenaires'),
  ('Open-es','https://openes.io/fr/signup','Fournisseurs & partenaires'),
  ('Teams · Réunion 1','https://teams.microsoft.com/dl/launcher/launcher.html?url=%2F_%23%2Fl%2Fmeetup-join%2F19%3Ameeting_ZTViZjgwYWQtODIwMS00MzAzLTg0ZDEtZjNlZjExYTczOTBj%40thread.v2%2F0%3Fcontext%3D%257b%2522Tid%2522%253a%2522c56bbb4e-3c0e-4533-8570-44862ac3ee3c%2522%252c%2522Oid%2522%253a%2522601255e1-080f-42cc-a05f-245633ff9b0c%2522%257d%26anon%3Dtrue&type=meetup-join&deeplinkId=28606e1d-d5eb-476e-b90b-b1a0aa9fe682&directDl=true&msLaunch=true&enableMobilePage=true&suppressPrompt=true','Réunions Teams'),
  ('Teams · Réunion 2','https://teams.microsoft.com/dl/launcher/launcher.html?url=%2F_%23%2Fl%2Fmeetup-join%2F19%3Ameeting_YmZlMmI3MDktYmZhZC00MmRjLWIyNDYtNmNiYTI5M2Y1MGJm%40thread.v2%2F0%3Fcontext%3D%257b%2522Tid%2522%253a%2522c56bbb4e-3c0e-4533-8570-44862ac3ee3c%2522%252c%2522Oid%2522%253a%25222cedb261-d216-4da2-ae72-546138cfbf2e%2522%257d%26anon%3Dtrue&type=meetup-join&deeplinkId=3f3ba439-51c9-4506-a4b2-421e7b827a98&directDl=true&msLaunch=true&enableMobilePage=true&suppressPrompt=true','Réunions Teams')
)
insert into public.useful_links(company_id,category_id,title,url)
select c.company_id,c.id,s.title,s.url from seeds s
join public.useful_link_categories c on c.name=s.category
join public.companies company on company.id=c.company_id and company.code='bbtm';

comment on table public.useful_links is 'Company directory. Module visibility gates reads; authorized Admin/Direction manage links. No OAuth session credentials stored.';
