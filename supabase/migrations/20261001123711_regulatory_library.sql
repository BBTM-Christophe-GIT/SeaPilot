-- Company-shared regulatory references and append-only manual review history.
insert into public.role_module_permissions(role_key,module_key,is_visible)
select r.key,m.key,true from public.roles r
cross join (values ('regulatoryLibrary'),('regulatorySafety'),('regulatoryTransport')) m(key)
where r.key in ('admin','direction','armement','capitaine','marin')
on conflict(role_key,module_key) do nothing;

create function public.regulatory_library_has_access(target_category text, manage boolean default false)
returns boolean language sql stable security invoker set search_path = '' as $$
  select auth.uid() is not null
    and target_category in ('safety','transport')
    and public.user_belongs_to_company(public.current_planning_company_id())
    and exists (
      select 1 from public.user_roles r join public.role_module_permissions parent on parent.role_key=r.role_key
      where r.user_id=auth.uid() and r.company_id=public.current_planning_company_id()
        and parent.module_key='regulatoryLibrary' and parent.is_visible
    )
    and exists (
      select 1 from public.user_roles r join public.role_module_permissions child on child.role_key=r.role_key
      where r.user_id=auth.uid() and r.company_id=public.current_planning_company_id() and child.is_visible
        and child.module_key=case target_category when 'safety' then 'regulatorySafety' when 'transport' then 'regulatoryTransport' end
    )
    and (not manage or exists (
      select 1 from public.user_roles r where r.user_id=auth.uid() and r.company_id=public.current_planning_company_id()
        and r.role_key in ('admin','direction','armement')
    ));
$$;
revoke all on function public.regulatory_library_has_access(text,boolean) from public,anon;
grant execute on function public.regulatory_library_has_access(text,boolean) to authenticated;

create table public.regulatory_texts (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null default public.current_planning_company_id() references public.companies(id),
  category text not null check(category in ('safety','transport')),
  title text not null check(title=btrim(title) and char_length(title) between 1 and 240),
  url text not null check(char_length(url)<=8000 and url !~ '[[:space:]]' and position(chr(92) in url)=0
    and url ~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?([/?#].*)?$'),
  is_primary boolean not null default false,
  sort_order integer not null default 1000 check(sort_order between 0 and 1000000),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(id,company_id)
);
create index regulatory_texts_company_category_idx on public.regulatory_texts(company_id,category,sort_order);
create unique index regulatory_texts_primary_idx on public.regulatory_texts(company_id,category) where is_primary;

create function public.regulatory_text_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op='UPDATE' and row(new.id,new.company_id,new.created_at) is distinct from row(old.id,old.company_id,old.created_at) then
    raise exception 'L’identité de la référence réglementaire ne peut pas être modifiée.' using errcode='23514';
  end if;
  new.updated_at:=clock_timestamp();
  return new;
end $$;
revoke all on function public.regulatory_text_guard() from public,anon,authenticated;
create trigger regulatory_text_guard before insert or update on public.regulatory_texts
for each row execute function public.regulatory_text_guard();

alter table public.regulatory_texts enable row level security;
revoke all on public.regulatory_texts from public,anon,authenticated;
grant select on public.regulatory_texts to authenticated;
grant insert(category,title,url,is_primary,sort_order),update(category,title,url,is_primary,sort_order)
on public.regulatory_texts to authenticated;
create policy regulatory_texts_read on public.regulatory_texts for select to authenticated
using(company_id=(select public.current_planning_company_id()) and public.regulatory_library_has_access(category));
create policy regulatory_texts_insert on public.regulatory_texts for insert to authenticated
with check(company_id=(select public.current_planning_company_id()) and public.regulatory_library_has_access(category,true));
create policy regulatory_texts_update on public.regulatory_texts for update to authenticated
using(company_id=(select public.current_planning_company_id()) and public.regulatory_library_has_access(category,true))
with check(company_id=(select public.current_planning_company_id()) and public.regulatory_library_has_access(category,true));

create table public.regulatory_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null default public.current_planning_company_id() references public.companies(id),
  text_id uuid not null,
  reviewed_at timestamptz not null default clock_timestamp() check(isfinite(reviewed_at)),
  reviewer_id uuid not null,
  reviewer_name text not null check(char_length(reviewer_name) between 1 and 200),
  has_updates boolean not null,
  updates text not null default '' check(updates=btrim(updates) and char_length(updates)<=12000
    and has_updates=(char_length(updates)>0)),
  title_snapshot text not null,
  url_snapshot text not null,
  foreign key(text_id,company_id) references public.regulatory_texts(id,company_id)
);
create index regulatory_reviews_company_text_date_idx on public.regulatory_reviews(company_id,text_id,reviewed_at desc);
create index regulatory_reviews_text_idx on public.regulatory_reviews(text_id);

create function public.regulatory_review_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  source public.regulatory_texts;
  actor_name text;
begin
  if tg_op<>'INSERT' then
    raise exception 'Une revue enregistrée est immuable. Enregistrez une nouvelle revue.' using errcode='23514';
  end if;
  select * into source from public.regulatory_texts t where t.id=new.text_id;
  if source.id is null or auth.uid() is null or source.company_id<>public.current_planning_company_id()
      or not public.regulatory_library_has_access(source.category,true) then
    raise exception 'Revue non autorisée dans cette rubrique.' using errcode='42501';
  end if;
  select coalesce(nullif(btrim(p.display_name),''),nullif(btrim(p.email),''),'Utilisateur')
  into actor_name from public.profiles p where p.id=auth.uid();
  if actor_name is null then raise exception 'Profil introuvable.' using errcode='42501'; end if;
  new.company_id:=source.company_id;
  new.reviewed_at:=clock_timestamp();
  new.reviewer_id:=auth.uid();
  new.reviewer_name:=left(actor_name,200);
  new.title_snapshot:=source.title;
  new.url_snapshot:=source.url;
  return new;
end $$;
revoke all on function public.regulatory_review_guard() from public,anon,authenticated;
create trigger regulatory_review_guard before insert or update or delete on public.regulatory_reviews
for each row execute function public.regulatory_review_guard();

alter table public.regulatory_reviews enable row level security;
revoke all on public.regulatory_reviews from public,anon,authenticated;
grant select on public.regulatory_reviews to authenticated;
grant insert(text_id,has_updates,updates) on public.regulatory_reviews to authenticated;
create policy regulatory_reviews_read on public.regulatory_reviews for select to authenticated
using(company_id=(select public.current_planning_company_id()) and exists(
  select 1 from public.regulatory_texts t where t.id=text_id and t.company_id=regulatory_reviews.company_id
    and public.regulatory_library_has_access(t.category)));
create policy regulatory_reviews_insert on public.regulatory_reviews for insert to authenticated
with check(company_id=(select public.current_planning_company_id()) and reviewer_id=(select auth.uid()) and exists(
  select 1 from public.regulatory_texts t where t.id=text_id and t.company_id=regulatory_reviews.company_id
    and public.regulatory_library_has_access(t.category,true)));

-- These references are supplied by the user. Seeding is never recorded as a regulatory review.
with seeds(id,category,title,url,is_primary,sort_order) as (values
  ('d1600000-0000-4000-8000-000000000001'::uuid,'safety','Pôle réglementation de la sécurité maritime','https://www.mer.gouv.fr/pole-reglementation-de-la-securite-maritime',true,0),
  ('d1600000-0000-4000-8000-000000000002'::uuid,'safety','Division 160 - Gestion de la Sécurité','https://www.mer.gouv.fr/sites/default/files/2026-08/d160-20-06-26.pdf',false,160),
  ('d1600000-0000-4000-8000-000000000003'::uuid,'safety','Division 213 - Prévention de la Pollution','https://www.mer.gouv.fr/sites/default/files/2023-04/d213%20%2828.03.2023%29.pdf',false,213),
  ('d1600000-0000-4000-8000-000000000004'::uuid,'safety','Division 214 - Protection des travailleurs et appareils de levage','https://www.mer.gouv.fr/sites/default/files/2025-07/d214-09-07-24.pdf',false,214),
  ('d1600000-0000-4000-8000-000000000005'::uuid,'safety','Division 222 - Conception et Exploitation des navires de charge de jauge brute inférieure à 500','https://www.mer.gouv.fr/sites/default/files/2025-05/d222-11-04-25.pdf',false,222),
  ('d1600000-0000-4000-8000-000000000006'::uuid,'transport','Code des Transports','https://www.legifrance.gouv.fr/loda/id/LEGISCTA000043341020',true,0)
)
insert into public.regulatory_texts(id,company_id,category,title,url,is_primary,sort_order)
select case when c.code='bbtm' then s.id else gen_random_uuid() end,c.id,s.category,s.title,s.url,s.is_primary,s.sort_order
from public.companies c cross join seeds s;

comment on table public.regulatory_texts is 'Shared HTTPS regulatory references. Parent and category module visibility gate reads. Admin/Direction/Armement manage links; Marin/Capitaine read only.';
comment on table public.regulatory_reviews is 'Append-only manual reviews. Server timestamp and reviewer; original title/URL snapshots survive reference edits. No automatic or fabricated legal changelog.';
