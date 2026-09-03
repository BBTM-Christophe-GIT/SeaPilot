-- Service-note audience targeting, planning-based recipient resolution and
-- historically assumed signatures for the imported archive.

alter table public.qhse_service_notes
  drop constraint if exists qhse_service_notes_scope_check;

alter table public.qhse_service_notes
  add constraint qhse_service_notes_scope_check
    check (scope in ('all_accounts', 'vessels', 'people'));

create table public.qhse_service_note_target_vessels (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  note_id bigint not null,
  vessel_id bigint not null references public.vessels(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint qhse_service_note_target_vessels_note_fk foreign key (note_id, company_id)
    references public.qhse_service_notes(id, company_id) on delete cascade,
  constraint qhse_service_note_target_vessels_unique unique (note_id, vessel_id)
);

create table public.qhse_service_note_target_people (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  note_id bigint not null,
  person_id bigint not null references public.people(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint qhse_service_note_target_people_note_fk foreign key (note_id, company_id)
    references public.qhse_service_notes(id, company_id) on delete cascade,
  constraint qhse_service_note_target_people_unique unique (note_id, person_id)
);

create index qhse_service_note_target_vessels_note_idx
  on public.qhse_service_note_target_vessels (note_id, vessel_id);
create index qhse_service_note_target_people_note_idx
  on public.qhse_service_note_target_people (note_id, person_id);

alter table public.qhse_service_note_target_vessels enable row level security;
alter table public.qhse_service_note_target_people enable row level security;

create policy qhse_service_note_target_vessels_read
on public.qhse_service_note_target_vessels
for select to authenticated
using ((select public.service_note_can_read(note_id)));

create policy qhse_service_note_target_people_read
on public.qhse_service_note_target_people
for select to authenticated
using ((select public.service_note_can_read(note_id)));

grant select on public.qhse_service_note_target_vessels to authenticated;
grant select on public.qhse_service_note_target_people to authenticated;

alter table public.qhse_service_note_signatures
  add column signature_kind text not null default 'captured';

alter table public.qhse_service_note_signatures
  alter column signature_version_id drop not null,
  alter column signature_snapshot drop not null,
  alter column signed_at drop not null,
  drop constraint if exists qhse_service_note_signatures_snapshot_check;

alter table public.qhse_service_note_signatures
  add constraint qhse_service_note_signatures_kind_check
    check (signature_kind in ('captured', 'historical_assumed')),
  add constraint qhse_service_note_signatures_snapshot_check
    check (signature_snapshot is null or jsonb_typeof(signature_snapshot) = 'object'),
  add constraint qhse_service_note_signatures_capture_check check (
    signature_kind = 'historical_assumed'
    or (signature_version_id is not null and signature_snapshot is not null and signed_at is not null)
  );

create or replace function public.service_note_can_read(target_note_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.qhse_service_notes note
    where note.id = target_note_id
      and public.user_belongs_to_company(note.company_id)
      and (
        public.has_company_role(note.company_id, array['admin', 'direction'])
        or (
          note.status in ('published', 'archived')
          and exists (
            select 1
            from public.qhse_service_note_recipients recipient
            where recipient.note_id = note.id
              and recipient.user_id = (select auth.uid())
          )
        )
      )
  );
$$;

create or replace function public.service_note_targeting_options(
  p_note_id bigint,
  p_on_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_note public.qhse_service_notes%rowtype;
  target_date date;
  result jsonb;
begin
  select * into target_note
  from public.qhse_service_notes
  where id = p_note_id;

  if (select auth.uid()) is null
    or target_note.id is null
    or not public.has_company_role(target_note.company_id, array['admin', 'direction']) then
    raise exception using errcode = '42501', message = 'SERVICE_NOTE_TARGETING_FORBIDDEN.';
  end if;

  target_date := coalesce(p_on_date, target_note.authored_on, current_date);

  with planned_people as (
    select assignment.crew_person_id as person_id, assignment.vessel_id
    from public.planning_assignments assignment
    where assignment.company_id = target_note.company_id
      and assignment.starts_on <= target_date
      and assignment.ends_on >= target_date
      and lower(coalesce(assignment.confirmation_status, '')) <> 'cancelled'
    union
    select assignment.captain_person_id, assignment.vessel_id
    from public.planning_assignments assignment
    where assignment.company_id = target_note.company_id
      and assignment.captain_person_id is not null
      and assignment.starts_on <= target_date
      and assignment.ends_on >= target_date
      and lower(coalesce(assignment.confirmation_status, '')) <> 'cancelled'
    union
    select period.person_id, period.vessel_id
    from public.planning_periods period
    where period.company_id = target_note.company_id
      and period.person_id is not null
      and period.vessel_id is not null
      and period.starts_on <= target_date
      and period.ends_on >= target_date
    union
    select day.person_id, day.vessel_id
    from public.planning_days day
    where day.company_id = target_note.company_id
      and day.person_id is not null
      and day.vessel_id is not null
      and day.work_date = target_date
  ), eligible_people as (
    select person.*
    from public.people person
    where person.company_id = target_note.company_id
      and person.user_id is not null
      and person.hired_on is not null
      and person.hired_on <= target_date
      and (person.departed_on is null or person.departed_on > target_date)
      and person.id is distinct from target_note.author_person_id
      and (
        exists (
          select 1 from public.company_memberships membership
          where membership.company_id = target_note.company_id
            and membership.user_id = person.user_id
            and membership.active
        )
        or exists (
          select 1 from public.profiles profile
          where profile.id = person.user_id
            and profile.active_company_id = target_note.company_id
        )
      )
  )
  select jsonb_build_object(
    'date', target_date,
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', person.id,
        'first_name', person.first_name,
        'last_name', person.last_name,
        'function_label', coalesce(person.function_label, ''),
        'hired_on', person.hired_on,
        'departed_on', person.departed_on,
        'vessel_ids', coalesce((
          select jsonb_agg(planned.vessel_id order by planned.vessel_id)
          from planned_people planned
          where planned.person_id = person.id
        ), '[]'::jsonb)
      ) order by person.last_name, person.first_name)
      from eligible_people person
    ), '[]'::jsonb),
    'vessels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', vessel.id,
        'name', coalesce(nullif(trim(vessel.name), ''), vessel.acronym, format('Navire %s', vessel.id)),
        'recipient_count', (
          select count(distinct person.id)
          from eligible_people person
          join planned_people planned on planned.person_id = person.id
          where planned.vessel_id = vessel.id
        )
      ) order by coalesce(nullif(trim(vessel.name), ''), vessel.acronym, format('Navire %s', vessel.id)))
      from public.vessels vessel
      where vessel.company_id = target_note.company_id
        and vessel.active
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create or replace function public.save_service_note_draft(
  p_note_id bigint,
  p_subject text,
  p_body text,
  p_authored_on date,
  p_scope text,
  p_vessel_ids bigint[],
  p_person_ids bigint[]
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_note public.qhse_service_notes%rowtype;
  normalized_vessel_ids bigint[] := coalesce(p_vessel_ids, '{}'::bigint[]);
  normalized_person_ids bigint[] := coalesce(p_person_ids, '{}'::bigint[]);
  target_count integer;
begin
  select * into target_note
  from public.qhse_service_notes
  where id = p_note_id
  for update;

  if (select auth.uid()) is null
    or target_note.id is null
    or target_note.status <> 'draft'
    or not public.has_company_role(target_note.company_id, array['admin', 'direction']) then
    raise exception using errcode = '42501', message = 'SERVICE_NOTE_DRAFT_FORBIDDEN.';
  end if;
  if p_scope not in ('all_accounts', 'vessels', 'people') then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_SCOPE_INVALID.';
  end if;

  select count(*) into target_count
  from unnest(normalized_vessel_ids) requested(id)
  join public.vessels vessel on vessel.id = requested.id
  where vessel.company_id = target_note.company_id;
  if target_count <> (select count(distinct id) from unnest(normalized_vessel_ids) requested(id)) then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_VESSEL_SCOPE_INVALID.';
  end if;

  select count(*) into target_count
  from unnest(normalized_person_ids) requested(id)
  join public.people person on person.id = requested.id
  where person.company_id = target_note.company_id;
  if target_count <> (select count(distinct id) from unnest(normalized_person_ids) requested(id)) then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_PEOPLE_SCOPE_INVALID.';
  end if;

  update public.qhse_service_notes
  set subject = trim(coalesce(p_subject, '')),
      body = coalesce(p_body, ''),
      authored_on = coalesce(p_authored_on, current_date),
      scope = p_scope,
      vessel_id = case
        when p_scope = 'vessels' and cardinality(normalized_vessel_ids) = 1 then normalized_vessel_ids[1]
        else null
      end,
      updated_at = clock_timestamp()
  where id = target_note.id;

  delete from public.qhse_service_note_target_vessels target
  where target.note_id = target_note.id;
  delete from public.qhse_service_note_target_people target
  where target.note_id = target_note.id;

  if p_scope = 'vessels' then
    insert into public.qhse_service_note_target_vessels (company_id, note_id, vessel_id)
    select target_note.company_id, target_note.id, requested.id
    from (select distinct unnest(normalized_vessel_ids) as id) requested;
  elsif p_scope = 'people' then
    insert into public.qhse_service_note_target_people (company_id, note_id, person_id)
    select target_note.company_id, target_note.id, requested.id
    from (select distinct unnest(normalized_person_ids) as id) requested;
  end if;

  return target_note.id;
end;
$$;

create or replace function public.service_note_resolved_recipients(p_note_id bigint)
returns table (
  person_id bigint,
  user_id uuid,
  first_name text,
  last_name text,
  function_label text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_note public.qhse_service_notes%rowtype;
begin
  select * into target_note
  from public.qhse_service_notes
  where id = p_note_id;

  if (select auth.uid()) is null
    or target_note.id is null
    or not public.has_company_role(target_note.company_id, array['admin', 'direction']) then
    raise exception using errcode = '42501', message = 'SERVICE_NOTE_TARGETING_FORBIDDEN.';
  end if;

  return query
  with planned_people as (
    select assignment.crew_person_id as person_id, assignment.vessel_id
    from public.planning_assignments assignment
    where assignment.company_id = target_note.company_id
      and assignment.starts_on <= target_note.authored_on
      and assignment.ends_on >= target_note.authored_on
      and lower(coalesce(assignment.confirmation_status, '')) <> 'cancelled'
    union
    select assignment.captain_person_id, assignment.vessel_id
    from public.planning_assignments assignment
    where assignment.company_id = target_note.company_id
      and assignment.captain_person_id is not null
      and assignment.starts_on <= target_note.authored_on
      and assignment.ends_on >= target_note.authored_on
      and lower(coalesce(assignment.confirmation_status, '')) <> 'cancelled'
    union
    select period.person_id, period.vessel_id
    from public.planning_periods period
    where period.company_id = target_note.company_id
      and period.person_id is not null
      and period.vessel_id is not null
      and period.starts_on <= target_note.authored_on
      and period.ends_on >= target_note.authored_on
    union
    select day.person_id, day.vessel_id
    from public.planning_days day
    where day.company_id = target_note.company_id
      and day.person_id is not null
      and day.vessel_id is not null
      and day.work_date = target_note.authored_on
  )
  select distinct person.id, person.user_id, person.first_name, person.last_name,
         coalesce(person.function_label, '')
  from public.people person
  where person.company_id = target_note.company_id
    and person.user_id is not null
    and person.hired_on is not null
    and person.hired_on <= target_note.authored_on
    and (person.departed_on is null or person.departed_on > target_note.authored_on)
    and person.id is distinct from target_note.author_person_id
    and (
      exists (
        select 1 from public.company_memberships membership
        where membership.company_id = target_note.company_id
          and membership.user_id = person.user_id
          and membership.active
      )
      or exists (
        select 1 from public.profiles profile
        where profile.id = person.user_id
          and profile.active_company_id = target_note.company_id
      )
    )
    and (
      target_note.scope = 'all_accounts'
      or (
        target_note.scope = 'people'
        and exists (
          select 1 from public.qhse_service_note_target_people target
          where target.note_id = target_note.id and target.person_id = person.id
        )
      )
      or (
        target_note.scope = 'vessels'
        and exists (
          select 1
          from planned_people planned
          join public.qhse_service_note_target_vessels target
            on target.note_id = target_note.id and target.vessel_id = planned.vessel_id
          where planned.person_id = person.id
        )
      )
    )
  order by person.last_name, person.first_name;
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
  where id = p_note_id;

  if (select auth.uid()) is null
    or target_note.id is null
    or not public.has_company_role(target_note.company_id, array['admin', 'direction']) then
    raise exception using errcode = '42501', message = 'SERVICE_NOTE_PUBLISH_FORBIDDEN.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(format('service-notes-lifecycle:%s', target_note.company_id), 0)
  );

  select * into target_note
  from public.qhse_service_notes
  where id = p_note_id
  for update;

  if target_note.status not in ('draft', 'recalled') then
    raise exception using errcode = '42501', message = 'SERVICE_NOTE_PUBLISH_FORBIDDEN.';
  end if;
  if length(trim(target_note.subject)) < 2 or length(trim(target_note.body)) < 2 then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_CONTENT_REQUIRED.';
  end if;
  if target_note.scope = 'vessels' and not exists (
    select 1 from public.qhse_service_note_target_vessels target where target.note_id = target_note.id
  ) then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_VESSEL_TARGET_REQUIRED.';
  end if;
  if target_note.scope = 'people' and not exists (
    select 1 from public.qhse_service_note_target_people target where target.note_id = target_note.id
  ) then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_PEOPLE_TARGET_REQUIRED.';
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

  if target_note.status = 'recalled' then
    delete from public.qhse_service_note_signatures signature
    where signature.note_id = target_note.id;
  end if;
  delete from public.qhse_service_note_recipients recipient
  where recipient.note_id = target_note.id;

  insert into public.qhse_service_note_recipients (
    company_id, note_id, user_id, person_id,
    first_name_snapshot, last_name_snapshot, function_snapshot
  )
  select
    target_note.company_id,
    target_note.id,
    recipient.user_id,
    recipient.person_id,
    recipient.first_name,
    recipient.last_name,
    recipient.function_label
  from public.service_note_resolved_recipients(target_note.id) recipient;

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
      source_kind = 'seapilot',
      updated_at = clock_timestamp()
  where id = target_note.id;

  return target_note.id;
end;
$$;

-- The SharePoint import is the historical archive. Everyone with an account who
-- was employed on the note date is registered, except a known issuer.
update public.qhse_service_notes
set status = 'archived', updated_at = clock_timestamp()
where source_kind = 'sharepoint' and status = 'published';

-- Old draft generators could reserve chronology codes. Drafts never own a code.
update public.qhse_service_notes
set chronology_code = '', updated_at = clock_timestamp()
where status = 'draft' and chronology_code <> '';

do $$
declare
  target_count integer;
begin
  select count(*) into target_count
  from public.qhse_service_notes note
  where note.chronology_code = 'NS 03-26'
    and note.subject = 'Transmission et formation interne'
    and note.source_kind = 'sharepoint';

  if target_count <> 1 then
    raise exception 'Expected exactly one NS 03-26 Transmission et formation interne row, found %', target_count;
  end if;

  delete from public.qhse_service_notes note
  where note.chronology_code = 'NS 03-26'
    and note.subject = 'Transmission et formation interne'
    and note.source_kind = 'sharepoint';
end;
$$;

insert into public.qhse_service_note_recipients (
  company_id, note_id, user_id, person_id,
  first_name_snapshot, last_name_snapshot, function_snapshot
)
select note.company_id, note.id, person.user_id, person.id,
       coalesce(person.first_name, ''), coalesce(person.last_name, ''), coalesce(person.function_label, '')
from public.qhse_service_notes note
join public.people person on person.company_id = note.company_id
where note.source_kind = 'sharepoint'
  and note.status = 'archived'
  and person.user_id is not null
  and person.hired_on is not null
  and person.hired_on <= note.authored_on
  and (person.departed_on is null or person.departed_on > note.authored_on)
  and person.id is distinct from note.author_person_id
on conflict (note_id, user_id) do nothing;

insert into public.qhse_service_note_signatures (
  company_id, note_id, recipient_id, user_id, person_id,
  identity_snapshot, signature_version_id, signature_snapshot,
  signed_at, read_confirmed, signature_kind
)
select recipient.company_id, recipient.note_id, recipient.id, recipient.user_id, recipient.person_id,
       jsonb_build_object(
         'first_name', recipient.first_name_snapshot,
         'last_name', recipient.last_name_snapshot,
         'function_label', recipient.function_snapshot,
         'person_id', recipient.person_id,
         'user_id', recipient.user_id,
         'historical_assumption', true
       ),
       profile_signature.id,
       case when profile_signature.id is null then null else jsonb_build_object(
         'signature_id', profile_signature.id,
         'signer_person_id', recipient.person_id,
         'signer_user_id', recipient.user_id,
         'signer_name', trim(recipient.first_name_snapshot || ' ' || recipient.last_name_snapshot),
         'version_number', profile_signature.version_number,
         'storage_bucket', profile_signature.storage_bucket,
         'storage_path', profile_signature.storage_path,
         'mime_type', profile_signature.mime_type,
         'file_size_bytes', profile_signature.file_size_bytes,
         'sha256', profile_signature.sha256,
         'valid_from', profile_signature.valid_from
       ) end,
       null,
       true,
       'historical_assumed'
from public.qhse_service_note_recipients recipient
join public.qhse_service_notes note on note.id = recipient.note_id
left join lateral (
  select signature.*
  from public.working_time_profile_signatures signature
  where signature.company_id = recipient.company_id
    and signature.person_id = recipient.person_id
  order by signature.valid_from desc, signature.version_number desc
  limit 1
) profile_signature on true
where note.source_kind = 'sharepoint'
  and note.status = 'archived'
on conflict (note_id, user_id) do nothing;

revoke all on function public.service_note_can_read(bigint) from public, anon;
revoke all on function public.service_note_targeting_options(bigint, date) from public, anon;
revoke all on function public.save_service_note_draft(bigint, text, text, date, text, bigint[], bigint[]) from public, anon;
revoke all on function public.service_note_resolved_recipients(bigint) from public, anon;
revoke all on function public.publish_service_note(bigint) from public, anon;

grant execute on function public.service_note_can_read(bigint) to authenticated;
grant execute on function public.service_note_targeting_options(bigint, date) to authenticated;
grant execute on function public.save_service_note_draft(bigint, text, text, date, text, bigint[], bigint[]) to authenticated;
grant execute on function public.service_note_resolved_recipients(bigint) to authenticated;
grant execute on function public.publish_service_note(bigint) to authenticated;

comment on function public.service_note_targeting_options(bigint, date) is
  'Returns HR-eligible account holders and their planning vessels for a manager editing a service note.';
comment on function public.service_note_resolved_recipients(bigint) is
  'Resolves the publication audience from explicit people or planning assignments on the authored date.';
comment on column public.qhse_service_note_signatures.signature_kind is
  'captured for an explicit SeaPilot signature, historical_assumed for an imported archive without a signature date.';
