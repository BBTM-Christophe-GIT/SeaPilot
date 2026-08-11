-- Document-level provider visits for Fleet Certificates.
-- The SharePoint provider list remains the source of truth; this migration
-- normalizes its repeated rows into providers, specialties and contacts.

alter table public.service_providers
  add column if not exists merged_into_provider_id bigint
    references public.service_providers(id) on delete set null;

create index if not exists service_providers_canonical_idx
  on public.service_providers (company_id, active, merged_into_provider_id, name);

create table public.service_provider_specialties (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  provider_id bigint not null references public.service_providers(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_provider_specialties_name_check
    check (length(trim(name)) between 1 and 160)
);

create unique index service_provider_specialties_name_unique_idx
  on public.service_provider_specialties (provider_id, lower(trim(name)));

create table public.service_provider_contacts (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  provider_id bigint not null references public.service_providers(id) on delete cascade,
  full_name text not null,
  role_label text,
  email text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_provider_contacts_name_check
    check (length(trim(full_name)) between 1 and 160),
  constraint service_provider_contacts_channel_check
    check (nullif(trim(coalesce(email, '')), '') is not null
      or nullif(trim(coalesce(phone, '')), '') is not null)
);

create unique index service_provider_contacts_identity_unique_idx
  on public.service_provider_contacts (
    provider_id,
    lower(trim(full_name)),
    lower(trim(coalesce(email, ''))),
    trim(coalesce(phone, ''))
  );

insert into public.service_provider_specialties (company_id, provider_id, name)
select provider.company_id, provider.id,
       coalesce(nullif(trim(provider.service_type), ''), 'Général')
from public.service_providers provider
on conflict do nothing;

insert into public.service_provider_contacts (
  company_id, provider_id, full_name, role_label, email, phone
)
select provider.company_id, provider.id, trim(provider.contact_name),
       nullif(trim(provider.contact_role), ''),
       nullif(trim(provider.contact_email), ''),
       nullif(trim(provider.contact_phone), '')
from public.service_providers provider
where nullif(trim(provider.contact_name), '') is not null
  and (
    nullif(trim(coalesce(provider.contact_email, '')), '') is not null
    or nullif(trim(coalesce(provider.contact_phone, '')), '') is not null
  )
on conflict do nothing;

-- SharePoint stores SERVAUX once per specialty/contact. Present it as one
-- provider while retaining all specialties and people from the source rows.
do $$
declare
  company record;
  canonical_id bigint;
begin
  for company in
    select distinct provider.company_id
    from public.service_providers provider
    where upper(provider.name) like 'SERVAUX%'
  loop
    select min(provider.id) into canonical_id
    from public.service_providers provider
    where provider.company_id = company.company_id
      and upper(provider.name) like 'SERVAUX%';

    insert into public.service_provider_specialties (company_id, provider_id, name)
    select specialty.company_id, canonical_id, specialty.name
    from public.service_provider_specialties specialty
    join public.service_providers provider on provider.id = specialty.provider_id
    where provider.company_id = company.company_id
      and upper(provider.name) like 'SERVAUX%'
    on conflict do nothing;

    insert into public.service_provider_contacts (
      company_id, provider_id, full_name, role_label, email, phone
    )
    select contact.company_id, canonical_id, contact.full_name,
           contact.role_label, contact.email, contact.phone
    from public.service_provider_contacts contact
    join public.service_providers provider on provider.id = contact.provider_id
    where provider.company_id = company.company_id
      and upper(provider.name) like 'SERVAUX%'
    on conflict do nothing;

    update public.vessel_visits visit
    set provider_id = canonical_id, updated_at = now()
    where visit.company_id = company.company_id
      and visit.provider_id in (
        select provider.id from public.service_providers provider
        where provider.company_id = company.company_id
          and upper(provider.name) like 'SERVAUX%'
          and provider.id <> canonical_id
      );

    update public.service_providers provider
    set active = false, merged_into_provider_id = canonical_id, updated_at = now()
    where provider.company_id = company.company_id
      and upper(provider.name) like 'SERVAUX%'
      and provider.id <> canonical_id;

    update public.service_providers provider
    set name = 'SERVAUX', merged_into_provider_id = null, updated_at = now()
    where provider.id = canonical_id;
  end loop;
end;
$$;

create table public.fleet_certificate_provider_links (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  certificate_id bigint not null references public.fleet_certificates(id) on delete cascade,
  provider_id bigint not null references public.service_providers(id) on delete restrict,
  specialty_id bigint not null references public.service_provider_specialties(id) on delete restrict,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint fleet_certificate_provider_links_unique
    unique (certificate_id, provider_id, specialty_id)
);

create table public.fleet_certificate_visits (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  certificate_id bigint not null references public.fleet_certificates(id) on delete cascade,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz,
  location text not null default '',
  purpose text not null default '',
  notes text not null default '',
  status text not null default 'planned',
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fleet_certificate_visits_schedule_check
    check (scheduled_end is null or scheduled_end >= scheduled_start),
  constraint fleet_certificate_visits_status_check
    check (status in ('planned', 'confirmed', 'completed', 'cancelled')),
  constraint fleet_certificate_visits_text_check
    check (length(location) <= 250 and length(purpose) <= 250 and length(notes) <= 2000)
);

create index fleet_certificate_visits_calendar_idx
  on public.fleet_certificate_visits (company_id, scheduled_start, certificate_id)
  where status <> 'cancelled';

create table public.fleet_certificate_visit_providers (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  visit_id bigint not null references public.fleet_certificate_visits(id) on delete cascade,
  provider_id bigint not null references public.service_providers(id) on delete restrict,
  specialty_id bigint not null references public.service_provider_specialties(id) on delete restrict,
  contact_id bigint references public.service_provider_contacts(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint fleet_certificate_visit_providers_unique
    unique (visit_id, provider_id, specialty_id)
);

alter table public.service_provider_specialties enable row level security;
alter table public.service_provider_contacts enable row level security;
alter table public.fleet_certificate_provider_links enable row level security;
alter table public.fleet_certificate_visits enable row level security;
alter table public.fleet_certificate_visit_providers enable row level security;

create policy service_provider_specialties_company_read
on public.service_provider_specialties for select to authenticated
using ((select public.user_belongs_to_company(company_id)));

create policy service_provider_contacts_company_read
on public.service_provider_contacts for select to authenticated
using ((select public.user_belongs_to_company(company_id)));

create policy fleet_certificate_provider_links_company_read
on public.fleet_certificate_provider_links for select to authenticated
using ((select public.user_belongs_to_company(company_id)));

create policy fleet_certificate_visits_company_read
on public.fleet_certificate_visits for select to authenticated
using ((select public.user_belongs_to_company(company_id)));

create policy fleet_certificate_visit_providers_company_read
on public.fleet_certificate_visit_providers for select to authenticated
using ((select public.user_belongs_to_company(company_id)));

grant select on public.service_provider_specialties,
  public.service_provider_contacts,
  public.fleet_certificate_provider_links,
  public.fleet_certificate_visits,
  public.fleet_certificate_visit_providers to authenticated;

create or replace function public.save_fleet_certificate_visit(
  p_certificate_id bigint,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz,
  p_location text,
  p_purpose text,
  p_notes text,
  p_assignments jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint;
  target_visit_id bigint;
  assignment jsonb;
  target_provider_id bigint;
  target_specialty_id bigint;
  target_contact_id bigint;
begin
  select certificate.company_id into target_company_id
  from public.fleet_certificates certificate
  where certificate.id = p_certificate_id;

  if target_company_id is null
    or target_company_id is distinct from public.current_planning_company_id()
    or not (
      public.has_role('admin') or public.has_role('direction') or public.has_role('armement')
    ) then
    raise exception using errcode = '42501', message = 'FLEET_CERTIFICATE_VISIT_PERMISSION_DENIED';
  end if;

  if p_scheduled_start is null
    or (p_scheduled_end is not null and p_scheduled_end < p_scheduled_start)
    or length(coalesce(p_location, '')) > 250
    or length(coalesce(p_purpose, '')) > 250
    or length(coalesce(p_notes, '')) > 2000
    or jsonb_typeof(p_assignments) is distinct from 'array'
    or jsonb_array_length(p_assignments) not between 1 and 10 then
    raise exception using errcode = '22023', message = 'FLEET_CERTIFICATE_VISIT_INVALID';
  end if;

  insert into public.fleet_certificate_visits (
    company_id, certificate_id, scheduled_start, scheduled_end, location, purpose, notes
  ) values (
    target_company_id, p_certificate_id, p_scheduled_start, p_scheduled_end,
    trim(coalesce(p_location, '')), trim(coalesce(p_purpose, '')), trim(coalesce(p_notes, ''))
  ) returning id into target_visit_id;

  for assignment in select value from jsonb_array_elements(p_assignments)
  loop
    target_provider_id := nullif(assignment ->> 'providerId', '')::bigint;
    target_specialty_id := nullif(assignment ->> 'specialtyId', '')::bigint;
    target_contact_id := nullif(assignment ->> 'contactId', '')::bigint;

    if not exists (
      select 1 from public.service_providers provider
      where provider.id = target_provider_id
        and provider.company_id = target_company_id
        and provider.active
        and provider.merged_into_provider_id is null
    ) or not exists (
      select 1 from public.service_provider_specialties specialty
      where specialty.id = target_specialty_id
        and specialty.provider_id = target_provider_id
        and specialty.company_id = target_company_id
        and specialty.active
    ) or (
      target_contact_id is not null and not exists (
        select 1 from public.service_provider_contacts contact
        where contact.id = target_contact_id
          and contact.provider_id = target_provider_id
          and contact.company_id = target_company_id
          and contact.active
      )
    ) then
      raise exception using errcode = '22023', message = 'FLEET_CERTIFICATE_VISIT_PROVIDER_INVALID';
    end if;

    insert into public.fleet_certificate_visit_providers (
      company_id, visit_id, provider_id, specialty_id, contact_id
    ) values (
      target_company_id, target_visit_id, target_provider_id, target_specialty_id, target_contact_id
    );

    insert into public.fleet_certificate_provider_links (
      company_id, certificate_id, provider_id, specialty_id
    ) values (
      target_company_id, p_certificate_id, target_provider_id, target_specialty_id
    ) on conflict (certificate_id, provider_id, specialty_id) do nothing;
  end loop;

  return target_visit_id;
end;
$$;

revoke all on function public.save_fleet_certificate_visit(
  bigint, timestamptz, timestamptz, text, text, text, jsonb
) from public, anon;
grant execute on function public.save_fleet_certificate_visit(
  bigint, timestamptz, timestamptz, text, text, text, jsonb
) to authenticated;

comment on table public.service_provider_contacts is
  'Multiple contact people per SharePoint service provider, with individual e-mail and phone.';
comment on table public.service_provider_specialties is
  'Multiple specialties per service provider, normalized from SharePoint service types.';
comment on table public.fleet_certificate_visits is
  'Document-level provider visits shown in the Fleet Certificates grouped calendar.';
