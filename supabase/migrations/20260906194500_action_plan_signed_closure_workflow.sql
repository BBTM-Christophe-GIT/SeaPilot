-- Action plan signed collaboration and dual-control closure workflow.

create table if not exists public.action_plan_settings (
  company_id bigint primary key references public.companies(id) on delete cascade,
  edit_button_enabled boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default clock_timestamp()
);

insert into public.action_plan_settings (company_id)
select company.id from public.companies company
on conflict (company_id) do nothing;

alter table public.action_plan_settings enable row level security;
revoke all on public.action_plan_settings from anon, authenticated;
grant select on public.action_plan_settings to authenticated;

create policy action_plan_settings_company_read
on public.action_plan_settings for select to authenticated
using (
  company_id = public.current_planning_company_id()
  and public.has_any_role(array['admin','direction','armement','capitaine','marin'])
);

create or replace function public.action_plan_save_settings(p_edit_button_enabled boolean)
returns public.action_plan_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  saved public.action_plan_settings;
begin
  if (select auth.uid()) is null
     or target_company_id is null
     or not public.has_company_role(target_company_id, array['admin']) then
    raise exception 'Seul un administrateur peut modifier les réglages du Plan d''action.' using errcode = '42501';
  end if;

  insert into public.action_plan_settings (company_id, edit_button_enabled, updated_by, updated_at)
  values (target_company_id, coalesce(p_edit_button_enabled, true), (select auth.uid()), clock_timestamp())
  on conflict (company_id) do update set
    edit_button_enabled = excluded.edit_button_enabled,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning * into saved;
  return saved;
end;
$$;

revoke all on function public.action_plan_save_settings(boolean) from public, anon, authenticated;
grant execute on function public.action_plan_save_settings(boolean) to authenticated;

alter table public.action_items
  add column if not exists closure_review_status text not null default 'none',
  add column if not exists closure_requested_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists closure_requested_by_person_id bigint references public.people(id) on delete set null,
  add column if not exists closure_requested_by_name text,
  add column if not exists closure_requested_at timestamptz;

alter table public.action_items
  drop constraint if exists action_items_closure_review_status_check,
  add constraint action_items_closure_review_status_check check (closure_review_status in ('none', 'pending')),
  drop constraint if exists action_items_closure_review_consistency_check,
  add constraint action_items_closure_review_consistency_check check (
    (closure_review_status = 'none')
    or (
      closure_review_status = 'pending'
      and closure_requested_by_profile_id is not null
      and closure_requested_by_person_id is not null
      and length(btrim(closure_requested_by_name)) >= 2
      and closure_requested_at is not null
      and workflow_status = 'approved'
      and closed_on is null
    )
  );

create index if not exists action_items_closure_review_idx
  on public.action_items(company_id, closure_review_status, closure_requested_at desc)
  where closure_review_status = 'pending';

alter table public.action_item_treatment_events
  add column if not exists signature_version_id bigint references public.working_time_profile_signatures(id) on delete restrict,
  add column if not exists signature_snapshot jsonb not null default '{}'::jsonb;

alter table public.action_item_treatment_events
  drop constraint if exists action_item_treatment_event_type_check,
  add constraint action_item_treatment_event_type_check check (
    event_type in ('commented', 'attachment_added', 'closed', 'closure_requested', 'closure_approved', 'closure_rejected')
  ),
  drop constraint if exists action_item_treatment_event_content_check,
  add constraint action_item_treatment_event_content_check check (
    event_type in ('closed', 'closure_requested', 'closure_approved', 'closure_rejected')
    or note is not null
    or attachment_storage_path is not null
  );

alter table public.planning_notifications
  drop constraint if exists planning_notifications_type_check;
alter table public.planning_notifications
  add constraint planning_notifications_type_check check (notification_type in (
    'new_assignment', 'assignment_modified', 'publication', 'handover', 'absence',
    'critical_conflict', 'expiring_certificate', 'vacant_position',
    'working_time_non_compliance',
    'action_closure_requested', 'action_closure_approved', 'action_closure_rejected'
  ));

create or replace function public.action_item_notify_closure(
  p_action_id bigint,
  p_notification_type text,
  p_title text,
  p_body text,
  p_fingerprint text,
  p_reviewers_only boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.action_items;
  inserted_count integer := 0;
begin
  select action.* into target from public.action_items action where action.id = p_action_id;
  if target.id is null then return 0; end if;

  with recipients as (
    select person.user_id
    from public.people person
    where p_reviewers_only
      and target.action_type_key = 'discrimination_human_rights'
      and person.id = target.approver_person_id
      and person.company_id = target.company_id
      and person.user_id is not null
    union
    select role.user_id
    from public.user_roles role
    join public.company_memberships membership
      on membership.company_id = role.company_id and membership.user_id = role.user_id and membership.active
    where p_reviewers_only
      and target.action_type_key <> 'discrimination_human_rights'
      and role.company_id = target.company_id
      and role.role_key in ('admin', 'direction')
    union
    select person.user_id
    from public.people person
    where not p_reviewers_only
      and person.company_id = target.company_id
      and person.id in (
        target.issuer_person_id,
        target.approver_person_id,
        target.approved_by_person_id,
        target.closure_requested_by_person_id
      )
      and person.user_id is not null
    union
    select person.user_id
    from public.action_item_assignees assignee
    join public.people person
      on person.id = assignee.person_id and person.company_id = assignee.company_id
    where not p_reviewers_only
      and assignee.action_item_id = target.id
      and assignee.assignee_kind = 'person'
      and person.user_id is not null
    union
    select crew.user_id
    from public.action_item_assignees assignee
    join public.planning_assignments assignment
      on assignment.company_id = assignee.company_id
     and assignment.vessel_id = assignee.vessel_id
     and assignment.confirmation_status <> 'cancelled'
     and current_date between assignment.starts_on and assignment.ends_on
    join public.people crew
      on crew.id = assignment.crew_person_id and crew.company_id = assignment.company_id
    where not p_reviewers_only
      and assignee.action_item_id = target.id
      and assignee.assignee_kind = 'vessel_crew'
      and crew.user_id is not null
    union
    select event.created_by_profile_id
    from public.action_item_treatment_events event
    where not p_reviewers_only
      and event.action_item_id = target.id
      and event.created_by_profile_id is not null
  )
  insert into public.planning_notifications (
    company_id, recipient_user_id, notification_type, severity, title, body,
    entity_kind, entity_id, person_id, vessel_id, due_on, fingerprint
  )
  select target.company_id, recipient.user_id, p_notification_type,
    case when p_notification_type = 'action_closure_rejected' then 'warning' else 'information' end,
    left(btrim(p_title), 180), left(btrim(p_body), 2000),
    'action_item', target.id, target.closure_requested_by_person_id, target.vessel_id,
    target.due_on, left(btrim(p_fingerprint), 300)
  from recipients recipient
  where recipient.user_id is not null
  on conflict (company_id, recipient_user_id, fingerprint) do update set
    severity = excluded.severity,
    title = excluded.title,
    body = excluded.body,
    read_at = null,
    created_at = clock_timestamp();

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.action_item_notify_closure(bigint, text, text, text, text, boolean)
  from public, anon, authenticated;

-- Management commands are reserved to Administrateur and Direction.
create or replace function public.action_item_user_can_treat(target_action_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.action_items action
    where action.id = target_action_id
      and action.company_id = public.current_planning_company_id()
      and action.workflow_status = 'approved'
      and action.closed_on is null
      and public.has_company_role(action.company_id, array['admin', 'direction'])
      and public.action_item_user_can_read(action.id)
  );
$$;

-- Follow-up attachments are available to every profile that can read the action.
-- Finding and closure evidence retain the narrower issuer/management scope.
create or replace function public.action_plan_evidence_user_can_upload(target_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.action_items action
    where action.id = public.action_plan_evidence_action_id(target_name)
      and action.company_id = public.current_planning_company_id()
      and split_part(target_name, '/', 1) = action.company_id::text
      and public.action_item_user_can_read(action.id)
      and (
        target_name like action.company_id::text || '/' || action.id::text || '/suivi-%'
        or action.issuer_person_id = public.current_person_id()
        or public.action_item_user_can_treat(action.id)
        or action.approver_person_id = public.current_person_id()
      )
  );
$$;

drop policy if exists action_plan_treatment_signature_storage_read on storage.objects;
create policy action_plan_treatment_signature_storage_read
on storage.objects for select to authenticated
using (
  bucket_id = 'working-time-signatures'
  and exists (
    select 1
    from public.action_item_treatment_events event
    where event.signature_snapshot->>'storage_bucket' = storage.objects.bucket_id
      and event.signature_snapshot->>'storage_path' = storage.objects.name
      and public.action_item_user_can_read(event.action_item_id)
  )
);

drop policy if exists action_type_catalog_company_read on public.action_type_catalog;
create policy action_type_catalog_company_read
on public.action_type_catalog for select to authenticated
using (
  company_id = public.current_planning_company_id()
  and public.has_any_role(array['admin','direction','armement','capitaine','marin'])
  and (active or public.has_company_role(company_id, array['admin', 'direction']))
);

drop policy if exists action_type_catalog_change_log_admin_read on public.action_type_catalog_change_log;
create policy action_type_catalog_change_log_admin_read
on public.action_type_catalog_change_log for select to authenticated
using (
  company_id = public.current_planning_company_id()
  and public.has_company_role(company_id, array['admin', 'direction'])
);

create or replace function public.action_type_catalog_admin_save(
  p_label text,
  p_family text,
  p_requires_deviation_type boolean default false,
  p_active boolean default true,
  p_sort_order integer default 0,
  p_type_key text default null
)
returns public.action_type_catalog
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  target_key text := nullif(btrim(p_type_key), '');
  target public.action_type_catalog;
  before_value jsonb;
  operation_name text;
begin
  if (select auth.uid()) is null
     or target_company_id is null
     or not public.has_company_role(target_company_id, array['admin', 'direction']) then
    raise exception 'Seuls les profils Administrateur et Direction peuvent modifier les types d''évènement.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_label, ''))) < 2 or length(btrim(p_label)) > 140 then
    raise exception 'Le libellé du type doit contenir entre 2 et 140 caractères.' using errcode = '22023';
  end if;
  if p_family not in ('action', 'audit', 'visit', 'event') then
    raise exception 'La famille du type est invalide.' using errcode = '22023';
  end if;
  if p_sort_order < 0 or p_sort_order > 100000 then
    raise exception 'L''ordre d''affichage est invalide.' using errcode = '22023';
  end if;

  if target_key is null then
    target_key := 'custom_' || replace(gen_random_uuid()::text, '-', '');
    insert into public.action_type_catalog (
      company_id, type_key, label, family, hse_classification,
      tracks_exposure_rate, active, sort_order, requires_deviation_type
    ) values (
      target_company_id, target_key, btrim(p_label), p_family, null,
      false, coalesce(p_active, true), p_sort_order, coalesce(p_requires_deviation_type, false)
    ) returning * into target;
    operation_name := 'created';
  else
    select catalog.* into target
    from public.action_type_catalog catalog
    where catalog.company_id = target_company_id and catalog.type_key = target_key
    for update;
    if target.id is null then
      raise exception 'Le type d''évènement est introuvable.' using errcode = 'P0002';
    end if;
    before_value := to_jsonb(target);
    update public.action_type_catalog catalog
    set label = btrim(p_label), family = p_family,
        requires_deviation_type = coalesce(p_requires_deviation_type, false),
        active = coalesce(p_active, true), sort_order = p_sort_order,
        updated_at = clock_timestamp()
    where catalog.id = target.id
    returning catalog.* into target;
    operation_name := 'updated';
  end if;

  insert into public.action_type_catalog_change_log (
    company_id, type_key, operation, changed_by_person_id, before_value, after_value
  ) values (
    target_company_id, target.type_key, operation_name, public.current_person_id(), before_value, to_jsonb(target)
  );
  return target;
end;
$$;

-- Every active role may create a report; the named QHSE approval remains unchanged.
create or replace function public.action_item_create(
  p_title text,
  p_vessel_id bigint,
  p_action_type_key text,
  p_deviation_type text,
  p_occurred_at timestamptz,
  p_due_on date,
  p_vessel_maneuver text,
  p_weather_conditions text,
  p_description text,
  p_corrective_action text,
  p_lost_days numeric default 0
)
returns public.action_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  actor_person public.people;
  target_vessel public.vessels;
  target_type public.action_type_catalog;
  target_approver_id bigint;
  target_deviation_type text := nullif(btrim(p_deviation_type), '');
  target_action public.action_items;
begin
  if (select auth.uid()) is null
     or not public.has_company_role(target_company_id, array['admin', 'direction', 'armement', 'capitaine', 'marin']) then
    raise exception 'Vous ne pouvez pas créer ce rapport.' using errcode = '42501';
  end if;

  select * into actor_person
  from public.people person
  where person.id = public.current_person_id()
    and person.company_id = target_company_id and person.active;
  if actor_person.id is null then
    raise exception 'Le profil émetteur actif est introuvable.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_title, ''))) < 2
     or p_occurred_at is null or p_due_on is null
     or length(btrim(coalesce(p_corrective_action, ''))) < 2 then
    raise exception 'Les champs obligatoires du rapport sont incomplets.' using errcode = '22023';
  end if;

  select * into target_vessel
  from public.vessels vessel
  where vessel.id = p_vessel_id and vessel.company_id = target_company_id and vessel.active;
  if target_vessel.id is null then
    raise exception 'Le navire sélectionné est invalide.' using errcode = '22023';
  end if;

  select * into target_type
  from public.action_type_catalog catalog
  where catalog.company_id = target_company_id
    and catalog.type_key = p_action_type_key and catalog.active;
  if target_type.id is null then
    raise exception 'Le type d''évènement sélectionné est invalide.' using errcode = '22023';
  end if;
  if target_type.requires_deviation_type and target_deviation_type is null then
    raise exception 'Le type d''écart est obligatoire pour cet évènement.' using errcode = '22023';
  end if;
  if not target_type.requires_deviation_type then target_deviation_type := null; end if;

  target_approver_id := public.action_plan_approver_person_id(target_company_id);
  if target_approver_id is null then
    raise exception 'Christophe MINASSIAN doit disposer d''un profil actif avant la création.' using errcode = '55000';
  end if;

  insert into public.action_items (
    company_id, vessel_id, vessel_name, category_key, action_type_key,
    action_type, title, status, deviation_type, occurred_at, opened_on,
    due_on, issuer_person_id, issuer_name, issuer_signature_snapshot,
    vessel_maneuver, weather_conditions, description, corrective_action,
    lost_days, source_label, workflow_status, approval_requested_at,
    approver_person_id
  ) values (
    target_company_id, target_vessel.id, target_vessel.name, 'action', target_type.type_key,
    target_type.label, btrim(p_title), 'En attente d''approbation', target_deviation_type,
    p_occurred_at, (p_occurred_at at time zone 'Europe/Paris')::date,
    p_due_on, actor_person.id, btrim(actor_person.first_name || ' ' || upper(actor_person.last_name)),
    public.working_time_active_signature_snapshot(target_company_id, actor_person.id),
    nullif(btrim(p_vessel_maneuver), ''), nullif(btrim(p_weather_conditions), ''),
    nullif(btrim(p_description), ''), btrim(p_corrective_action), greatest(coalesce(p_lost_days, 0), 0),
    'seapilot', 'pending_approval', clock_timestamp(), target_approver_id
  ) returning * into target_action;
  return target_action;
end;
$$;

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
  actor_signature jsonb;
  signature_version_id bigint;
  normalized_note text := nullif(btrim(p_note), '');
  normalized_file_name text := nullif(btrim(p_attachment_file_name), '');
  normalized_storage_path text := nullif(btrim(p_attachment_storage_path), '');
  normalized_mime_type text := nullif(btrim(p_attachment_mime_type), '');
  has_attachment boolean;
  management_closure boolean;
  event_kind text;
begin
  if (select auth.uid()) is null then
    raise exception 'Vous ne pouvez pas commenter cette action.' using errcode = '42501';
  end if;

  select action.* into target
  from public.action_items action
  where action.id = p_action_id and action.company_id = public.current_planning_company_id()
  for update;
  if target.id is null or not public.action_item_user_can_read(target.id) then
    raise exception 'Action introuvable ou inaccessible.' using errcode = '42501';
  end if;
  if target.closed_on is not null or target.workflow_status = 'closed' then
    raise exception 'Une action soldée ne peut plus être modifiée.' using errcode = '55000';
  end if;

  has_attachment := normalized_storage_path is not null
    or normalized_file_name is not null or normalized_mime_type is not null
    or p_attachment_size_bytes is not null;
  if normalized_note is null and not has_attachment and not coalesce(p_close_action, false) then
    raise exception 'Ajoutez un commentaire, une pièce jointe ou demandez la clôture.' using errcode = '22023';
  end if;
  if normalized_note is not null and length(normalized_note) > 5000 then
    raise exception 'Le commentaire de suivi est limité à 5 000 caractères.' using errcode = '22023';
  end if;
  if coalesce(p_close_action, false) and target.workflow_status <> 'approved' then
    raise exception 'La clôture ne peut être demandée qu''après approbation.' using errcode = '55000';
  end if;
  if coalesce(p_close_action, false) and target.closure_review_status = 'pending' then
    raise exception 'Une demande de clôture est déjà en attente de contre-validation.' using errcode = '55000';
  end if;

  if has_attachment then
    if normalized_file_name is null or length(normalized_file_name) > 255
      or normalized_mime_type is null or length(normalized_mime_type) > 180
      or p_attachment_size_bytes not between 1 and 10485760
      or normalized_storage_path is null
      or normalized_storage_path not like target.company_id::text || '/' || target.id::text || '/suivi-%'
      or not exists (
        select 1 from storage.objects object
        where object.bucket_id = 'action-plan-evidence' and object.name = normalized_storage_path
      ) then
      raise exception 'La pièce jointe du suivi est invalide.' using errcode = '22023';
    end if;
  end if;

  select coalesce(
    nullif(btrim(concat_ws(' ', person.first_name, upper(person.last_name))), ''),
    nullif(btrim(profile.display_name), ''), profile.email, 'Utilisateur SeaPilot'
  ) into actor_name
  from public.profiles profile
  left join public.people person
    on person.user_id = profile.id and person.company_id = target.company_id and person.active
  where profile.id = (select auth.uid())
  order by person.id limit 1;
  actor_name := coalesce(actor_name, 'Utilisateur SeaPilot');

  actor_signature := public.working_time_active_signature_snapshot(target.company_id, actor_person_id);
  if actor_person_id is null or actor_signature = '{}'::jsonb then
    raise exception 'Une signature active doit être enregistrée dans le dossier RH avant de continuer.' using errcode = '55000';
  end if;
  signature_version_id := (actor_signature->>'signature_id')::bigint;
  management_closure := coalesce(p_close_action, false)
    and public.has_company_role(target.company_id, array['admin', 'direction']);
  event_kind := case
    when management_closure then 'closure_approved'
    when coalesce(p_close_action, false) then 'closure_requested'
    when has_attachment then 'attachment_added'
    else 'commented'
  end;

  insert into public.action_item_treatment_events (
    company_id, action_item_id, event_type, note,
    attachment_file_name, attachment_storage_bucket, attachment_storage_path,
    attachment_mime_type, attachment_size_bytes,
    created_by_profile_id, created_by_person_id, created_by_name,
    signature_version_id, signature_snapshot
  ) values (
    target.company_id, target.id, event_kind,
    coalesce(normalized_note, case event_kind
      when 'closure_requested' then 'Clôture demandée.'
      when 'closure_approved' then 'Clôture validée.'
      else null end),
    case when has_attachment then normalized_file_name end,
    case when has_attachment then 'action-plan-evidence' end,
    case when has_attachment then normalized_storage_path end,
    case when has_attachment then normalized_mime_type end,
    case when has_attachment then p_attachment_size_bytes end,
    (select auth.uid()), actor_person_id, actor_name,
    signature_version_id, actor_signature
  ) returning * into created_event;

  if management_closure then
    update public.action_items action
    set status = 'Ecart Soldé', closed_on = (clock_timestamp() at time zone 'Europe/Paris')::date,
        workflow_status = 'closed', closure_review_status = 'none',
        closure_requested_by_profile_id = null, closure_requested_by_person_id = null,
        closure_requested_by_name = null, closure_requested_at = null,
        updated_at = clock_timestamp()
    where action.id = target.id;
    perform public.action_item_notify_closure(
      target.id, 'action_closure_approved', 'Clôture validée',
      actor_name || ' a clôturé la fiche « ' || target.title || ' ».',
      'action-close-approved-' || target.id || '-' || created_event.id, false
    );
  elsif coalesce(p_close_action, false) then
    update public.action_items action
    set closure_review_status = 'pending',
        closure_requested_by_profile_id = (select auth.uid()),
        closure_requested_by_person_id = actor_person_id,
        closure_requested_by_name = actor_name,
        closure_requested_at = created_event.created_at,
        updated_at = clock_timestamp()
    where action.id = target.id;
    perform public.action_item_notify_closure(
      target.id, 'action_closure_requested', 'Clôture à contre-valider',
      actor_name || ' demande la clôture de la fiche « ' || target.title || ' ».',
      'action-close-requested-' || target.id || '-' || created_event.id, true
    );
  end if;

  return created_event;
end;
$$;

create or replace function public.action_item_review_closure(
  p_action_id bigint,
  p_approve boolean,
  p_comment text default null
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
  actor_signature jsonb;
  signature_version_id bigint;
  normalized_comment text := nullif(btrim(p_comment), '');
begin
  select action.* into target
  from public.action_items action
  where action.id = p_action_id and action.company_id = public.current_planning_company_id()
  for update;
  if (select auth.uid()) is null or target.id is null
     or not public.has_company_role(target.company_id, array['admin', 'direction'])
     or not public.action_item_user_can_read(target.id) then
    raise exception 'Vous ne pouvez pas contre-valider cette clôture.' using errcode = '42501';
  end if;
  if target.closure_review_status <> 'pending' or target.closed_on is not null then
    raise exception 'Aucune demande de clôture n''est en attente.' using errcode = '55000';
  end if;
  if normalized_comment is not null and length(normalized_comment) > 5000 then
    raise exception 'Le commentaire de contre-validation est limité à 5 000 caractères.' using errcode = '22023';
  end if;

  select coalesce(
    nullif(btrim(concat_ws(' ', person.first_name, upper(person.last_name))), ''),
    nullif(btrim(profile.display_name), ''), profile.email, 'Utilisateur SeaPilot'
  ) into actor_name
  from public.profiles profile
  left join public.people person
    on person.user_id = profile.id and person.company_id = target.company_id and person.active
  where profile.id = (select auth.uid())
  order by person.id limit 1;
  actor_name := coalesce(actor_name, 'Utilisateur SeaPilot');

  actor_signature := public.working_time_active_signature_snapshot(target.company_id, actor_person_id);
  if actor_person_id is null or actor_signature = '{}'::jsonb then
    raise exception 'Une signature active doit être enregistrée dans le dossier RH avant de continuer.' using errcode = '55000';
  end if;
  signature_version_id := (actor_signature->>'signature_id')::bigint;

  insert into public.action_item_treatment_events (
    company_id, action_item_id, event_type, note,
    created_by_profile_id, created_by_person_id, created_by_name,
    signature_version_id, signature_snapshot
  ) values (
    target.company_id, target.id,
    case when coalesce(p_approve, false) then 'closure_approved' else 'closure_rejected' end,
    coalesce(normalized_comment, case when coalesce(p_approve, false) then 'Clôture validée.' else 'Clôture refusée.' end),
    (select auth.uid()), actor_person_id, actor_name,
    signature_version_id, actor_signature
  ) returning * into created_event;

  if coalesce(p_approve, false) then
    update public.action_items action
    set status = 'Ecart Soldé', closed_on = (clock_timestamp() at time zone 'Europe/Paris')::date,
        workflow_status = 'closed', closure_review_status = 'none', updated_at = clock_timestamp()
    where action.id = target.id;
  else
    update public.action_items action
    set closure_review_status = 'none', updated_at = clock_timestamp()
    where action.id = target.id;
  end if;

  perform public.action_item_notify_closure(
    target.id,
    case when coalesce(p_approve, false) then 'action_closure_approved' else 'action_closure_rejected' end,
    case when coalesce(p_approve, false) then 'Clôture validée' else 'Clôture refusée' end,
    actor_name || case when coalesce(p_approve, false)
      then ' a validé la clôture de la fiche « '
      else ' a refusé la clôture de la fiche « ' end || target.title || ' ».'
      || case when normalized_comment is not null then ' Commentaire : ' || normalized_comment else '' end,
    case when coalesce(p_approve, false) then 'action-close-approved-' else 'action-close-rejected-' end
      || target.id || '-' || created_event.id,
    false
  );

  update public.action_items action
  set closure_requested_by_profile_id = null, closure_requested_by_person_id = null,
      closure_requested_by_name = null, closure_requested_at = null
  where action.id = target.id;
  return created_event;
end;
$$;

-- The detailed treatment command remains available only to management and now
-- writes a signed journal event whenever treatment content changes or closes.
create or replace function public.action_item_treat(
  p_action_id bigint,
  p_comments text default null,
  p_realized_action text default null,
  p_close_action boolean default false,
  p_closure_photo_path text default null
)
returns public.action_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.action_items;
  updated_action public.action_items;
  requested_closure_photo_path text := nullif(btrim(p_closure_photo_path), '');
  actor_person_id bigint := public.current_person_id();
  actor_name text;
  actor_signature jsonb;
  signature_version_id bigint;
  created_event public.action_item_treatment_events;
  content_changed boolean;
begin
  select action.* into target
  from public.action_items action
  where action.id = p_action_id and action.company_id = public.current_planning_company_id()
  for update;
  if (select auth.uid()) is null or target.id is null
     or not public.has_company_role(target.company_id, array['admin', 'direction'])
     or not public.action_item_user_can_read(target.id) then
    raise exception 'Seuls les profils Administrateur et Direction peuvent traiter cette action.' using errcode = '42501';
  end if;
  if target.closed_on is not null or target.workflow_status = 'closed' then
    raise exception 'Une action soldée ne peut plus être traitée.' using errcode = '55000';
  end if;
  if target.workflow_status <> 'approved' then
    raise exception 'Cette action doit être approuvée avant traitement.' using errcode = '55000';
  end if;
  if requested_closure_photo_path is distinct from target.closure_photo_path
     and requested_closure_photo_path is not null
     and requested_closure_photo_path not like target.company_id::text || '/' || target.id::text || '/cloture-%' then
    raise exception 'Le chemin de la photo de clôture est invalide.' using errcode = '22023';
  end if;

  content_changed := nullif(btrim(p_comments), '') is distinct from target.comments
    or nullif(btrim(p_realized_action), '') is distinct from target.realized_action
    or requested_closure_photo_path is distinct from target.closure_photo_path
    or coalesce(p_close_action, false);
  if content_changed then
    actor_signature := public.working_time_active_signature_snapshot(target.company_id, actor_person_id);
    if actor_person_id is null or actor_signature = '{}'::jsonb then
      raise exception 'Une signature active doit être enregistrée dans le dossier RH avant de continuer.' using errcode = '55000';
    end if;
    signature_version_id := (actor_signature->>'signature_id')::bigint;
    select coalesce(
      nullif(btrim(concat_ws(' ', person.first_name, upper(person.last_name))), ''),
      nullif(btrim(profile.display_name), ''), profile.email, 'Utilisateur SeaPilot'
    ) into actor_name
    from public.profiles profile
    left join public.people person
      on person.user_id = profile.id and person.company_id = target.company_id and person.active
    where profile.id = (select auth.uid()) order by person.id limit 1;
    actor_name := coalesce(actor_name, 'Utilisateur SeaPilot');

    insert into public.action_item_treatment_events (
      company_id, action_item_id, event_type, note,
      created_by_profile_id, created_by_person_id, created_by_name,
      signature_version_id, signature_snapshot
    ) values (
      target.company_id, target.id,
      case when coalesce(p_close_action, false) then 'closure_approved' else 'commented' end,
      coalesce(nullif(btrim(p_comments), ''), nullif(left(btrim(p_realized_action), 5000), ''),
        case when coalesce(p_close_action, false) then 'Clôture validée.' else 'Traitement mis à jour.' end),
      (select auth.uid()), actor_person_id, actor_name, signature_version_id, actor_signature
    ) returning * into created_event;
  end if;

  update public.action_items action
  set comments = nullif(btrim(p_comments), ''),
      realized_action = nullif(btrim(p_realized_action), ''),
      closure_photo_path = coalesce(requested_closure_photo_path, target.closure_photo_path),
      status = case when coalesce(p_close_action, false) then 'Ecart Soldé' else action.status end,
      closed_on = case when coalesce(p_close_action, false) then (clock_timestamp() at time zone 'Europe/Paris')::date else action.closed_on end,
      workflow_status = case when coalesce(p_close_action, false) then 'closed' else action.workflow_status end,
      closure_review_status = case when coalesce(p_close_action, false) then 'none' else action.closure_review_status end,
      closure_requested_by_profile_id = case when coalesce(p_close_action, false) then null else action.closure_requested_by_profile_id end,
      closure_requested_by_person_id = case when coalesce(p_close_action, false) then null else action.closure_requested_by_person_id end,
      closure_requested_by_name = case when coalesce(p_close_action, false) then null else action.closure_requested_by_name end,
      closure_requested_at = case when coalesce(p_close_action, false) then null else action.closure_requested_at end,
      updated_at = clock_timestamp()
  where action.id = target.id
  returning action.* into updated_action;

  if coalesce(p_close_action, false) then
    perform public.action_item_notify_closure(
      target.id, 'action_closure_approved', 'Clôture validée',
      actor_name || ' a clôturé la fiche « ' || target.title || ' ».',
      'action-close-approved-' || target.id || '-' || created_event.id, false
    );
  end if;
  return updated_action;
end;
$$;

revoke all on function public.action_item_add_treatment_followup(bigint, text, text, text, text, bigint, boolean)
  from public, anon, authenticated;
revoke all on function public.action_item_review_closure(bigint, boolean, text)
  from public, anon, authenticated;
grant execute on function public.action_item_add_treatment_followup(bigint, text, text, text, text, bigint, boolean)
  to authenticated;
grant execute on function public.action_item_review_closure(bigint, boolean, text)
  to authenticated;

comment on table public.action_plan_settings is
  'Company-scoped Action Plan UI settings managed from Administration.';
comment on column public.action_items.closure_review_status is
  'Pending requires an Administrateur or Direction countersignature before the action is closed.';
comment on function public.action_item_review_closure(bigint, boolean, text) is
  'Approves or rejects a signed closure request and notifies every action participant.';
