-- Confirmed aliases are kept for historical Planning, DPR and HSE references.
create table private.people_directory_aliases (
  company_id bigint not null,
  alias_person_id bigint not null,
  canonical_person_id bigint not null,
  primary key (company_id, alias_person_id),
  check (alias_person_id <> canonical_person_id),
  foreign key (alias_person_id, company_id) references public.people(id, company_id) on delete cascade,
  foreign key (canonical_person_id, company_id) references public.people(id, company_id) on delete restrict
);

create index people_directory_aliases_canonical_idx
  on private.people_directory_aliases(canonical_person_id, company_id);

alter table private.people_directory_aliases enable row level security;
revoke all on private.people_directory_aliases from public, anon, authenticated;
grant select on private.people_directory_aliases to authenticated;

create policy people_directory_aliases_read on private.people_directory_aliases
for select to authenticated using (
  (company_id = public.current_planning_company_id() and public.has_company_role(company_id, array['admin']))
  or public.organigramme_has_access(company_id)
);

comment on table private.people_directory_aliases is
  'Verified duplicate person IDs retained for operational history. Current directories display the canonical HR record.';

-- Validate both identities on the production data so clean databases and unrelated IDs stay untouched.
insert into private.people_directory_aliases(company_id, alias_person_id, canonical_person_id)
select legacy.company_id, legacy.id, master.id
from (values
  (1012, 1094, 'kimi', 'cauvain', 'cauvin'),
  (1013, 27, 'gabin', 'giovanon', 'giovannon'),
  (55, 38, 'nicolas', 'bodinier', 'bodinier')
) as verified(alias_id, canonical_id, first_name, alias_last_name, canonical_last_name)
join public.people legacy on legacy.id = verified.alias_id
  and lower(btrim(legacy.first_name)) = verified.first_name
  and lower(btrim(legacy.last_name)) = verified.alias_last_name
  and legacy.user_id is null
join public.people master on master.id = verified.canonical_id and master.company_id = legacy.company_id
  and lower(btrim(master.first_name)) = verified.first_name
  and lower(btrim(master.last_name)) = verified.canonical_last_name
join public.companies c on c.id = legacy.company_id and c.code = 'bbtm';

-- Preserve the canonical watch entry if a watch already contains both records.
insert into public.organigramme_watch_members(company_id, watch_id, person_id, function_label)
select member.company_id, member.watch_id, alias.canonical_person_id, member.function_label
from public.organigramme_watch_members member
join private.people_directory_aliases alias
  on alias.company_id = member.company_id and alias.alias_person_id = member.person_id
on conflict (watch_id, person_id) do nothing;

delete from public.organigramme_watch_members member
using private.people_directory_aliases alias
where alias.company_id = member.company_id and alias.alias_person_id = member.person_id;

update public.organigramme_support support
set person_id = alias.canonical_person_id
from private.people_directory_aliases alias
where alias.company_id = support.company_id and alias.alias_person_id = support.person_id;

-- If both person links exist, retain the one set on the canonical identity.
delete from public.organigramme_links legacy
using private.people_directory_aliases alias, public.organigramme_links canonical
where legacy.company_id = alias.company_id and legacy.target_kind = 'person'
  and legacy.target_key = alias.alias_person_id::text
  and canonical.company_id = legacy.company_id and canonical.source_category = legacy.source_category
  and canonical.target_kind = legacy.target_kind and canonical.target_section = legacy.target_section
  and canonical.target_key = alias.canonical_person_id::text;

update public.organigramme_links link
set target_key = alias.canonical_person_id::text
from private.people_directory_aliases alias
where link.company_id = alias.company_id and link.target_kind = 'person'
  and link.target_key = alias.alias_person_id::text;

-- The old list exclusions are record-specific. Emergency defaults name people, so follow the identity.
update public.organigramme_emergency_defaults defaults
set person_ids = array(
  select distinct coalesce(alias.canonical_person_id, selected.id)
  from unnest(defaults.person_ids) as selected(id)
  left join private.people_directory_aliases alias
    on alias.company_id = defaults.company_id and alias.alias_person_id = selected.id
  order by 1
)
where exists (
  select 1 from private.people_directory_aliases alias
  where alias.company_id = defaults.company_id and alias.alias_person_id = any(defaults.person_ids)
);

-- Shared defaults can also be written directly by authorized database clients.
create or replace function public.organigramme_emergency_people_valid(p_company_id bigint, p_person_ids bigint[])
returns boolean language sql stable security invoker set search_path = '' as $$
  select p_person_ids is not null and cardinality(p_person_ids) <= 2000
    and not exists (
      select 1 from unnest(p_person_ids) as selected(id)
      where selected.id is null or not exists (
        select 1 from public.people p where p.id = selected.id and p.company_id = p_company_id
      ) or exists (
        select 1 from private.people_directory_aliases alias
        where alias.company_id = p_company_id and alias.alias_person_id = selected.id
      )
    );
$$;

create view public.admin_people_directory with (security_invoker = true) as
select person.id, person.user_id, person.first_name, person.last_name, person.email,
  person.function_label, person.active, person.hired_on, person.departed_on
from public.people person
where person.company_id = (select public.current_planning_company_id())
  and public.has_company_role(person.company_id, array['admin'])
  and not exists (
    select 1 from private.people_directory_aliases alias
    where alias.company_id = person.company_id and alias.alias_person_id = person.id
  );

revoke all on public.admin_people_directory from public, anon, authenticated;
grant select on public.admin_people_directory to authenticated;

-- Keep account provisioning on the HR record even if an old invitation still names a legacy ID.
create function private.reject_people_alias_account_link()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from private.people_directory_aliases alias
    where alias.company_id = new.company_id and alias.alias_person_id = new.id
  ) then
    raise exception 'Utilisez la fiche RH de référence pour associer le compte.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.reject_people_alias_account_link() from public, anon, authenticated;

create trigger people_alias_account_link_guard
before update of user_id on public.people
for each row when (new.user_id is not null and old.user_id is distinct from new.user_id)
execute function private.reject_people_alias_account_link();

-- Identifiers are independent of spelling. Blank identifiers and names alone do not determine identity.
create unique index people_company_employee_identity_idx
  on public.people(company_id, lower(btrim(employee_number)))
  where nullif(btrim(employee_number), '') is not null;

create unique index people_company_sailor_identity_idx
  on public.people(company_id, lower(btrim(sailor_number)))
  where nullif(btrim(sailor_number), '') is not null;

notify pgrst, 'reload schema';
