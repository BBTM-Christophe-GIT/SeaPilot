-- Action-plan treatment steering: immutable, timestamped follow-up notes,
-- optional attachments and an atomic close transition. Read and write access
-- reuse the existing action-level confidentiality and assignee rules.

create table public.action_item_treatment_events (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  action_item_id bigint not null references public.action_items(id) on delete cascade,
  event_type text not null,
  note text,
  attachment_file_name text,
  attachment_storage_bucket text,
  attachment_storage_path text,
  attachment_mime_type text,
  attachment_size_bytes bigint,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_by_person_id bigint references public.people(id) on delete set null,
  created_by_name text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint action_item_treatment_event_type_check
    check (event_type in ('commented', 'attachment_added', 'closed')),
  constraint action_item_treatment_event_note_check
    check (note is null or length(btrim(note)) between 1 and 5000),
  constraint action_item_treatment_event_attachment_check check (
    (attachment_storage_path is null
      and attachment_file_name is null
      and attachment_storage_bucket is null
      and attachment_mime_type is null
      and attachment_size_bytes is null)
    or
    (attachment_storage_path is not null
      and attachment_file_name is not null
      and attachment_storage_bucket = 'action-plan-evidence'
      and attachment_mime_type is not null
      and attachment_size_bytes between 1 and 10485760)
  ),
  constraint action_item_treatment_event_content_check
    check (event_type = 'closed' or note is not null or attachment_storage_path is not null)
);

create index action_item_treatment_events_action_idx
  on public.action_item_treatment_events(company_id, action_item_id, created_at desc, id desc);

alter table public.action_item_treatment_events enable row level security;
revoke all on public.action_item_treatment_events from anon, authenticated;
grant select on public.action_item_treatment_events to authenticated;

create policy action_item_treatment_events_read
on public.action_item_treatment_events for select to authenticated
using (
  company_id = public.current_planning_company_id()
  and public.action_item_user_can_read(action_item_id)
);

-- The follow-up accepts the same practical file formats as other SeaPilot
-- document workflows while retaining the existing private 10 MiB bucket.
update storage.buckets
set allowed_mime_types = array[
  'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain'
]::text[]
where id = 'action-plan-evidence';

create or replace function public.action_item_add_treatment_followup(
  p_action_id bigint,
  p_note text default null,
  p_attachment_file_name text default null,
  p_attachment_storage_path text default null,
  p_attachment_mime_type text default null,
  p_attachment_size_bytes bigint default null,
  p_close_action boolean default false
)
returns public.action_item_treatment_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.action_items;
  created_event public.action_item_treatment_events;
  actor_person_id bigint := public.current_person_id();
  actor_name text;
  normalized_note text := nullif(btrim(p_note), '');
  normalized_file_name text := nullif(btrim(p_attachment_file_name), '');
  normalized_storage_path text := nullif(btrim(p_attachment_storage_path), '');
  normalized_mime_type text := nullif(btrim(p_attachment_mime_type), '');
  has_attachment boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Vous ne pouvez pas piloter cette action.' using errcode = '42501';
  end if;

  select action.* into target
  from public.action_items action
  where action.id = p_action_id
    and action.company_id = public.current_planning_company_id()
  for update;

  if target.id is null or not public.action_item_user_can_read(target.id) then
    raise exception 'Action introuvable ou inaccessible.' using errcode = '42501';
  end if;
  if not public.action_item_user_can_treat(target.id) then
    if target.closed_on is not null or target.workflow_status = 'closed' then
      raise exception 'Une action soldée ne peut plus être modifiée.' using errcode = '55000';
    end if;
    raise exception 'Vous n''êtes pas responsable du traitement de cette action.' using errcode = '42501';
  end if;

  has_attachment := normalized_storage_path is not null
    or normalized_file_name is not null
    or normalized_mime_type is not null
    or p_attachment_size_bytes is not null;

  if normalized_note is null and not has_attachment and not coalesce(p_close_action, false) then
    raise exception 'Ajoutez un commentaire, une pièce jointe ou clôturez l''action.' using errcode = '22023';
  end if;
  if normalized_note is not null and length(normalized_note) > 5000 then
    raise exception 'Le commentaire de suivi est limité à 5 000 caractères.' using errcode = '22023';
  end if;

  if has_attachment then
    if normalized_file_name is null or length(normalized_file_name) > 255
      or normalized_mime_type is null or length(normalized_mime_type) > 180
      or p_attachment_size_bytes not between 1 and 10485760
      or normalized_storage_path is null
      or normalized_storage_path not like target.company_id::text || '/' || target.id::text || '/suivi-%'
      or not exists (
        select 1 from storage.objects object
        where object.bucket_id = 'action-plan-evidence'
          and object.name = normalized_storage_path
      ) then
      raise exception 'La pièce jointe du suivi est invalide.' using errcode = '22023';
    end if;
  end if;

  select coalesce(
    nullif(btrim(concat_ws(' ', person.first_name, upper(person.last_name))), ''),
    nullif(btrim(profile.display_name), ''),
    profile.email,
    'Utilisateur SeaPilot'
  ) into actor_name
  from public.profiles profile
  left join public.people person
    on person.user_id = profile.id
   and person.company_id = target.company_id
   and person.active
  where profile.id = (select auth.uid())
  order by person.id
  limit 1;

  actor_name := coalesce(actor_name, 'Utilisateur SeaPilot');

  insert into public.action_item_treatment_events (
    company_id, action_item_id, event_type, note,
    attachment_file_name, attachment_storage_bucket, attachment_storage_path,
    attachment_mime_type, attachment_size_bytes,
    created_by_profile_id, created_by_person_id, created_by_name
  ) values (
    target.company_id, target.id,
    case
      when coalesce(p_close_action, false) then 'closed'
      when has_attachment then 'attachment_added'
      else 'commented'
    end,
    case
      when normalized_note is not null then normalized_note
      when coalesce(p_close_action, false) then 'Action clôturée.'
      else null
    end,
    case when has_attachment then normalized_file_name end,
    case when has_attachment then 'action-plan-evidence' end,
    case when has_attachment then normalized_storage_path end,
    case when has_attachment then normalized_mime_type end,
    case when has_attachment then p_attachment_size_bytes end,
    (select auth.uid()), actor_person_id, actor_name
  ) returning * into created_event;

  update public.action_items action
  set status = case when coalesce(p_close_action, false) then 'Ecart Soldé' else action.status end,
      closed_on = case when coalesce(p_close_action, false) then current_date else action.closed_on end,
      workflow_status = case when coalesce(p_close_action, false) then 'closed' else action.workflow_status end,
      updated_at = clock_timestamp()
  where action.id = target.id;

  return created_event;
end;
$$;

revoke all on function public.action_item_add_treatment_followup(
  bigint, text, text, text, text, bigint, boolean
) from public, anon, authenticated;
grant execute on function public.action_item_add_treatment_followup(
  bigint, text, text, text, text, bigint, boolean
) to authenticated;

comment on table public.action_item_treatment_events is
  'Immutable, timestamped treatment follow-up journal with an author snapshot and optional private attachment.';
comment on function public.action_item_add_treatment_followup(bigint, text, text, text, text, bigint, boolean) is
  'Adds a treatment follow-up for an authorized owner and optionally closes the action without changing the approval workflow.';
