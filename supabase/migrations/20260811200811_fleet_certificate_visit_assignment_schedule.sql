alter table public.fleet_certificate_visit_providers
  add column scheduled_start timestamptz,
  add column scheduled_end timestamptz;

update public.fleet_certificate_visit_providers assignment
set scheduled_start = visit.scheduled_start,
    scheduled_end = coalesce(visit.scheduled_end, visit.scheduled_start)
from public.fleet_certificate_visits visit
where visit.id = assignment.visit_id;

alter table public.fleet_certificate_visit_providers
  alter column scheduled_start set not null,
  alter column scheduled_end set not null,
  add constraint fleet_certificate_visit_provider_schedule_check
    check (scheduled_end >= scheduled_start);

create index fleet_certificate_visit_provider_agenda_idx
  on public.fleet_certificate_visit_providers (company_id, scheduled_start, scheduled_end);

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
  target_assignment_start timestamptz;
  target_assignment_end timestamptz;
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
    or p_scheduled_end is null
    or p_scheduled_end < p_scheduled_start
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
    target_assignment_start := nullif(assignment ->> 'scheduledStart', '')::timestamptz;
    target_assignment_end := nullif(assignment ->> 'scheduledEnd', '')::timestamptz;

    if target_assignment_start is null
      or target_assignment_end is null
      or target_assignment_end < target_assignment_start
      or target_assignment_start < p_scheduled_start
      or target_assignment_end > p_scheduled_end then
      raise exception using errcode = '22023', message = 'FLEET_CERTIFICATE_VISIT_SCHEDULE_INVALID';
    end if;

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
      company_id, visit_id, provider_id, specialty_id, contact_id, scheduled_start, scheduled_end
    ) values (
      target_company_id, target_visit_id, target_provider_id, target_specialty_id, target_contact_id,
      target_assignment_start, target_assignment_end
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

comment on column public.fleet_certificate_visit_providers.scheduled_start is
  'Individual provider intervention start; overlapping assignments are allowed.';
comment on column public.fleet_certificate_visit_providers.scheduled_end is
  'Individual provider intervention end; overlapping assignments are allowed.';
