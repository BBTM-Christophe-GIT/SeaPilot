-- Service-note chronology is allocated atomically when a draft is published.
-- The imported NS 07-26-KROKDUR remains a private draft until an explicit publication.

create or replace function public.service_note_create_draft()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  actor_person public.people%rowtype;
  actor_profile public.profiles%rowtype;
  target_note public.qhse_service_notes%rowtype;
begin
  if (select auth.uid()) is null
    or target_company_id is null
    or not public.has_company_role(target_company_id, array['admin', 'direction']) then
    raise exception using errcode = '42501', message = 'SERVICE_NOTE_CREATE_FORBIDDEN.';
  end if;

  select * into actor_person
  from public.people person
  where person.user_id = (select auth.uid())
    and person.company_id = target_company_id
  limit 1;

  select * into actor_profile
  from public.profiles profile
  where profile.id = (select auth.uid());

  insert into public.qhse_service_notes (
    company_id, chronology_code, author_person_id, author_identity_snapshot, created_by
  ) values (
    target_company_id,
    '',
    actor_person.id,
    jsonb_build_object(
      'user_id', (select auth.uid()),
      'person_id', actor_person.id,
      'first_name', coalesce(actor_person.first_name, ''),
      'last_name', coalesce(actor_person.last_name, ''),
      'display_name', coalesce(nullif(trim(actor_person.first_name || ' ' || actor_person.last_name), ''), actor_profile.display_name, actor_profile.email, ''),
      'function_label', coalesce(actor_person.function_label, '')
    ),
    (select auth.uid())
  ) returning * into target_note;

  return target_note.id;
end;
$$;

create or replace function public.publish_service_note(p_note_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_note public.qhse_service_notes%rowtype;
  actor_person public.people%rowtype;
  actor_profile public.profiles%rowtype;
  author_signature jsonb;
  recipient_count integer;
  chronology_sequence integer;
  chronology_year text := to_char(current_date, 'YY');
begin
  select * into target_note
  from public.qhse_service_notes
  where id = p_note_id
  for update;

  if target_note.id is null or not public.service_note_can_manage(target_note.id) then
    raise exception using errcode = '42501', message = 'SERVICE_NOTE_PUBLISH_FORBIDDEN.';
  end if;
  if length(trim(target_note.subject)) < 2 or length(trim(target_note.body)) < 2 then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_CONTENT_REQUIRED.';
  end if;

  if target_note.author_person_id is null then
    select * into actor_person
    from public.people person
    where person.user_id = (select auth.uid())
      and person.company_id = target_note.company_id
    limit 1;

    if actor_person.id is null then
      raise exception using errcode = '23514', message = 'SERVICE_NOTE_AUTHOR_PROFILE_REQUIRED.';
    end if;

    select * into actor_profile
    from public.profiles profile
    where profile.id = (select auth.uid());

    target_note.author_person_id := actor_person.id;
    target_note.author_identity_snapshot := jsonb_build_object(
      'user_id', (select auth.uid()),
      'person_id', actor_person.id,
      'first_name', coalesce(actor_person.first_name, ''),
      'last_name', coalesce(actor_person.last_name, ''),
      'display_name', coalesce(nullif(trim(actor_person.first_name || ' ' || actor_person.last_name), ''), actor_profile.display_name, actor_profile.email, ''),
      'function_label', coalesce(actor_person.function_label, '')
    );
  end if;

  author_signature := public.working_time_active_signature_snapshot(
    target_note.company_id,
    target_note.author_person_id
  );
  if author_signature = '{}'::jsonb then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_AUTHOR_SIGNATURE_REQUIRED.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(format('service-notes:%s:%s', target_note.company_id, chronology_year), 0)
  );

  select coalesce(max(substring(note.chronology_code from format('^NS ([0-9]+)-%s', chronology_year))::integer), 0) + 1
  into chronology_sequence
  from public.qhse_service_notes note
  where note.company_id = target_note.company_id
    and note.id <> target_note.id;

  insert into public.qhse_service_note_recipients (
    company_id, note_id, user_id, person_id,
    first_name_snapshot, last_name_snapshot, function_snapshot
  )
  select
    target_note.company_id,
    target_note.id,
    account.user_id,
    person.id,
    coalesce(person.first_name, ''),
    coalesce(person.last_name, ''),
    coalesce(person.function_label, '')
  from (
    select membership.user_id
    from public.company_memberships membership
    where membership.company_id = target_note.company_id
      and membership.active
    union
    select profile.id
    from public.profiles profile
    where profile.active_company_id = target_note.company_id
  ) account
  left join public.people person
    on person.user_id = account.user_id
   and person.company_id = target_note.company_id
  on conflict (note_id, user_id) do nothing;

  select count(*) into recipient_count
  from public.qhse_service_note_recipients recipient
  where recipient.note_id = target_note.id;
  if recipient_count = 0 then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_RECIPIENTS_REQUIRED.';
  end if;

  update public.qhse_service_notes
  set chronology_code = format('NS %s-%s', lpad(chronology_sequence::text, 2, '0'), chronology_year),
      status = 'published',
      author_person_id = target_note.author_person_id,
      author_identity_snapshot = target_note.author_identity_snapshot,
      author_signature_snapshot = author_signature,
      published_at = clock_timestamp(),
      published_by = (select auth.uid()),
      updated_at = clock_timestamp()
  where id = target_note.id;

  return target_note.id;
end;
$$;

revoke all on function public.service_note_create_draft() from public, anon;
revoke all on function public.publish_service_note(bigint) from public, anon;
grant execute on function public.service_note_create_draft() to authenticated;
grant execute on function public.publish_service_note(bigint) to authenticated;

with target_notes as (
  select id
  from public.qhse_service_notes
  where chronology_code = 'NS 07-26-KROKDUR'
    and source_kind = 'sharepoint'
)
delete from public.qhse_service_note_signatures signature
using target_notes target
where signature.note_id = target.id;

with target_notes as (
  select id
  from public.qhse_service_notes
  where chronology_code = 'NS 07-26-KROKDUR'
    and source_kind = 'sharepoint'
)
delete from public.qhse_service_note_recipients recipient
using target_notes target
where recipient.note_id = target.id;

update public.qhse_service_notes
set status = 'draft',
    author_signature_snapshot = '{}'::jsonb,
    published_at = null,
    published_by = null,
    updated_at = clock_timestamp()
where chronology_code = 'NS 07-26-KROKDUR'
  and source_kind = 'sharepoint';
