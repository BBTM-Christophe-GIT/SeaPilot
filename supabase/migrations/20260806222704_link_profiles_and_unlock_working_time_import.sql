-- Repair historical account/RH links only when the normalized email identifies
-- exactly one profile and one person in the same company. Ambiguous or already
-- linked records are deliberately left untouched for manual review.
with unique_profile_emails as (
  select lower(trim(profile.email)) as normalized_email, min(profile.id::text)::uuid as profile_id
  from public.profiles profile
  where nullif(trim(profile.email), '') is not null
  group by lower(trim(profile.email))
  having count(*) = 1
),
unique_person_emails as (
  select lower(trim(person.email)) as normalized_email, min(person.id) as person_id
  from public.people person
  where nullif(trim(person.email), '') is not null
  group by lower(trim(person.email))
  having count(*) = 1
),
safe_links as (
  select person.id as person_id, profile_email.profile_id
  from unique_profile_emails profile_email
  join unique_person_emails person_email using (normalized_email)
  join public.people person on person.id = person_email.person_id
  where person.user_id is null
    and not exists (
      select 1 from public.people linked_person
      where linked_person.user_id = profile_email.profile_id
    )
    and exists (
      select 1 from public.user_roles user_role
      where user_role.user_id = profile_email.profile_id
        and user_role.company_id = person.company_id
    )
)
update public.people person
set user_id = safe_link.profile_id,
    updated_at = clock_timestamp()
from safe_links safe_link
where person.id = safe_link.person_id;

-- MIME types are case-insensitive by specification, but Storage compares the
-- configured strings literally. Windows can expose the XLSM subtype fully in
-- lowercase after the file is unblocked, so retain both equivalent spellings.
update storage.buckets
set allowed_mime_types = array[
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.ms-excel.sheet.macroenabled.12'
]::text[]
where id = 'working-time-imports';
