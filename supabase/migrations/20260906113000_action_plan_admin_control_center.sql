-- Plan d'action control center: admin-only factual corrections and a safe,
-- company-scoped event-type catalogue. Existing approval and treatment states
-- remain immutable through these entry points.

alter table public.action_type_catalog
  add column if not exists requires_deviation_type boolean not null default false;

update public.action_type_catalog
set requires_deviation_type = type_key = any(array[
  'audit_client', 'audit_ecmid', 'audit_internal', 'visit_davit',
  'visit_crane', 'visit_hse', 'visit_radio', 'visit_classification'
]);

create table if not exists public.action_item_correction_log (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  action_item_id bigint not null references public.action_items(id) on delete cascade,
  corrected_by_profile_id uuid references public.profiles(id) on delete set null default auth.uid(),
  corrected_by_person_id bigint references public.people(id) on delete set null,
  reason text not null,
  changes jsonb not null,
  corrected_at timestamptz not null default clock_timestamp(),
  constraint action_item_correction_reason_check check (length(btrim(reason)) between 3 and 500),
  constraint action_item_correction_changes_check check (jsonb_typeof(changes) = 'object')
);

create index if not exists action_item_correction_log_action_idx
  on public.action_item_correction_log(company_id, action_item_id, corrected_at desc);

create table if not exists public.action_type_catalog_change_log (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  type_key text not null,
  operation text not null,
  changed_by_profile_id uuid references public.profiles(id) on delete set null default auth.uid(),
  changed_by_person_id bigint references public.people(id) on delete set null,
  before_value jsonb,
  after_value jsonb not null,
  changed_at timestamptz not null default clock_timestamp(),
  constraint action_type_catalog_change_operation_check check (operation in ('created', 'updated')),
  constraint action_type_catalog_before_value_check check (before_value is null or jsonb_typeof(before_value) = 'object'),
  constraint action_type_catalog_after_value_check check (jsonb_typeof(after_value) = 'object')
);

create index if not exists action_type_catalog_change_log_company_idx
  on public.action_type_catalog_change_log(company_id, changed_at desc);

alter table public.action_item_correction_log enable row level security;
alter table public.action_type_catalog_change_log enable row level security;
revoke all on public.action_item_correction_log, public.action_type_catalog_change_log from anon, authenticated;
grant select on public.action_item_correction_log, public.action_type_catalog_change_log to authenticated;

create policy action_item_correction_log_admin_read
on public.action_item_correction_log for select to authenticated
using (
  company_id = public.current_planning_company_id()
  and public.has_company_role(company_id, array['admin'])
  and public.action_item_user_can_read(action_item_id)
);

create policy action_type_catalog_change_log_admin_read
on public.action_type_catalog_change_log for select to authenticated
using (
  company_id = public.current_planning_company_id()
  and public.has_company_role(company_id, array['admin'])
);

drop policy if exists action_type_catalog_company_read on public.action_type_catalog;
create policy action_type_catalog_company_read
on public.action_type_catalog for select to authenticated
using (
  company_id = public.current_planning_company_id()
  and public.has_any_role(array['admin','direction','armement','capitaine','marin'])
  and (active or public.has_company_role(company_id, array['admin']))
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
     or not public.has_company_role(target_company_id, array['admin']) then
    raise exception 'Seul un administrateur peut modifier les types d''évènement.' using errcode = '42501';
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
    set label = btrim(p_label),
        family = p_family,
        requires_deviation_type = coalesce(p_requires_deviation_type, false),
        active = coalesce(p_active, true),
        sort_order = p_sort_order,
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

create or replace function public.action_item_admin_update(
  p_action_id bigint,
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
  p_lost_days numeric,
  p_correction_reason text
)
returns public.action_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  target public.action_items;
  target_vessel public.vessels;
  target_type public.action_type_catalog;
  target_deviation_type text := nullif(btrim(p_deviation_type), '');
  before_value jsonb;
  after_value jsonb;
begin
  if (select auth.uid()) is null
     or target_company_id is null
     or not public.has_company_role(target_company_id, array['admin']) then
    raise exception 'Seul un administrateur peut corriger une fiche.' using errcode = '42501';
  end if;

  select action.* into target
  from public.action_items action
  where action.id = p_action_id and action.company_id = target_company_id
  for update;
  if target.id is null or not public.action_item_user_can_read(target.id) then
    raise exception 'Rapport introuvable ou inaccessible.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_correction_reason, ''))) < 3 then
    raise exception 'Le motif de correction est obligatoire.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_title, ''))) < 2
     or p_occurred_at is null or p_due_on is null
     or length(btrim(coalesce(p_corrective_action, ''))) < 2 then
    raise exception 'Les champs obligatoires de la fiche sont incomplets.' using errcode = '22023';
  end if;

  select vessel.* into target_vessel
  from public.vessels vessel
  where vessel.id = p_vessel_id and vessel.company_id = target_company_id and vessel.active;
  if target_vessel.id is null then
    raise exception 'Le navire ou lieu sélectionné est invalide.' using errcode = '22023';
  end if;

  select catalog.* into target_type
  from public.action_type_catalog catalog
  where catalog.company_id = target_company_id
    and catalog.type_key = p_action_type_key
    and (catalog.active or catalog.type_key = target.action_type_key);
  if target_type.id is null then
    raise exception 'Le type d''évènement sélectionné est invalide.' using errcode = '22023';
  end if;
  if target.action_type_key = 'discrimination_human_rights'
     and target_type.type_key <> target.action_type_key then
    raise exception 'Le type confidentiel de ce rapport ne peut pas être modifié.' using errcode = '42501';
  end if;
  if target.action_type_key <> 'discrimination_human_rights'
     and target_type.type_key = 'discrimination_human_rights' then
    raise exception 'La conversion vers un signalement confidentiel exige un parcours dédié.' using errcode = '42501';
  end if;
  if target_type.requires_deviation_type and target_deviation_type is null then
    raise exception 'Le type d''écart est obligatoire pour cet évènement.' using errcode = '22023';
  end if;
  if not target_type.requires_deviation_type then
    target_deviation_type := null;
  end if;

  before_value := jsonb_build_object(
    'title', target.title, 'vessel_id', target.vessel_id, 'vessel_name', target.vessel_name,
    'action_type_key', target.action_type_key, 'action_type', target.action_type,
    'deviation_type', target.deviation_type, 'occurred_at', target.occurred_at,
    'due_on', target.due_on, 'vessel_maneuver', target.vessel_maneuver,
    'weather_conditions', target.weather_conditions, 'description', target.description,
    'corrective_action', target.corrective_action, 'lost_days', target.lost_days
  );

  update public.action_items action
  set title = btrim(p_title),
      vessel_id = target_vessel.id,
      vessel_name = target_vessel.name,
      category_key = target_type.family,
      action_type_key = target_type.type_key,
      action_type = target_type.label,
      deviation_type = target_deviation_type,
      occurred_at = p_occurred_at,
      opened_on = (p_occurred_at at time zone 'Europe/Paris')::date,
      due_on = p_due_on,
      vessel_maneuver = nullif(btrim(p_vessel_maneuver), ''),
      weather_conditions = nullif(btrim(p_weather_conditions), ''),
      description = nullif(btrim(p_description), ''),
      corrective_action = btrim(p_corrective_action),
      lost_days = greatest(coalesce(p_lost_days, 0), 0),
      updated_at = clock_timestamp()
  where action.id = target.id
  returning action.* into target;

  after_value := jsonb_build_object(
    'title', target.title, 'vessel_id', target.vessel_id, 'vessel_name', target.vessel_name,
    'action_type_key', target.action_type_key, 'action_type', target.action_type,
    'deviation_type', target.deviation_type, 'occurred_at', target.occurred_at,
    'due_on', target.due_on, 'vessel_maneuver', target.vessel_maneuver,
    'weather_conditions', target.weather_conditions, 'description', target.description,
    'corrective_action', target.corrective_action, 'lost_days', target.lost_days
  );
  if before_value = after_value then
    raise exception 'Aucune modification n''a été détectée.' using errcode = '22023';
  end if;

  insert into public.action_item_correction_log (
    company_id, action_item_id, corrected_by_person_id, reason, changes
  ) values (
    target_company_id, target.id, public.current_person_id(), btrim(p_correction_reason),
    jsonb_build_object('before', before_value, 'after', after_value)
  );
  return target;
end;
$$;

-- Keep initial photo attachment available to the report issuer while pending,
-- then reserve subsequent factual photo corrections to Administrators.
create or replace function public.action_item_attach_finding_photos(
  p_action_id bigint,
  p_photo_1_path text default null,
  p_photo_2_path text default null
)
returns public.action_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.action_items;
  photo_1 text := nullif(btrim(p_photo_1_path), '');
  photo_2 text := nullif(btrim(p_photo_2_path), '');
begin
  select action.* into target
  from public.action_items action
  where action.id = p_action_id and action.company_id = public.current_planning_company_id()
  for update;

  if target.id is null or not public.action_item_user_can_read(target.id)
     or not (
       public.has_company_role(target.company_id, array['admin'])
       or (target.workflow_status = 'pending_approval' and target.issuer_person_id = public.current_person_id())
     ) then
    raise exception 'Rapport introuvable ou inaccessible.' using errcode = '42501';
  end if;
  if photo_1 is not null and photo_1 not like target.company_id::text || '/' || target.id::text || '/photo-1-%' then
    raise exception 'Le chemin de la première photo est invalide.' using errcode = '22023';
  end if;
  if photo_2 is not null and photo_2 not like target.company_id::text || '/' || target.id::text || '/photo-2-%' then
    raise exception 'Le chemin de la seconde photo est invalide.' using errcode = '22023';
  end if;

  update public.action_items action
  set photo_1_path = photo_1, photo_2_path = photo_2, updated_at = clock_timestamp()
  where action.id = target.id
  returning action.* into target;
  return target;
end;
$$;

-- The creation workflow is unchanged; only the deviation requirement now comes
-- from the catalogue instead of duplicated hard-coded frontend/backend lists.
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
     or not public.has_company_role(target_company_id, array['admin', 'direction', 'armement']) then
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
  if not target_type.requires_deviation_type then
    target_deviation_type := null;
  end if;

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
    p_due_on, actor_person.id, btrim(actor_person.first_name || ' ' || actor_person.last_name),
    public.working_time_active_signature_snapshot(target_company_id, actor_person.id),
    nullif(btrim(p_vessel_maneuver), ''), nullif(btrim(p_weather_conditions), ''),
    nullif(btrim(p_description), ''), btrim(p_corrective_action), greatest(coalesce(p_lost_days, 0), 0),
    'seapilot', 'pending_approval', clock_timestamp(), target_approver_id
  ) returning * into target_action;
  return target_action;
end;
$$;

revoke all on function public.action_type_catalog_admin_save(text, text, boolean, boolean, integer, text) from public, anon, authenticated;
revoke all on function public.action_item_admin_update(bigint, text, bigint, text, text, timestamptz, date, text, text, text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.action_type_catalog_admin_save(text, text, boolean, boolean, integer, text) to authenticated;
grant execute on function public.action_item_admin_update(bigint, text, bigint, text, text, timestamptz, date, text, text, text, text, numeric, text) to authenticated;

comment on column public.action_type_catalog.requires_deviation_type is
  'Whether reports created or corrected with this type require a deviation classification.';
comment on function public.action_type_catalog_admin_save(text, text, boolean, boolean, integer, text) is
  'Administrator-only catalogue editor. Stable keys and KPI classifications remain unchanged for existing types; new types are standard and non-KPI.';
comment on function public.action_item_admin_update(bigint, text, bigint, text, text, timestamptz, date, text, text, text, text, numeric, text) is
  'Administrator-only factual correction. Approval, assignment, treatment, signatures and closure fields are not accepted or modified.';
