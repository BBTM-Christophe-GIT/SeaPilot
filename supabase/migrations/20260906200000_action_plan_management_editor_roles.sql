-- Allow both Administrateur and Direction to use the factual correction controls.
-- The workflow, approvals, assignments, treatment and closure fields remain
-- deliberately outside this RPC contract.

drop policy if exists action_item_correction_log_admin_read on public.action_item_correction_log;
create policy action_item_correction_log_management_read
on public.action_item_correction_log for select to authenticated
using (
  company_id = public.current_planning_company_id()
  and public.has_company_role(company_id, array['admin', 'direction'])
  and public.action_item_user_can_read(action_item_id)
);

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
     or not public.has_company_role(target_company_id, array['admin', 'direction']) then
    raise exception 'Seuls les profils Administrateur et Direction peuvent corriger une fiche.' using errcode = '42501';
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
     or not public.has_company_role(target.company_id, array['admin', 'direction']) then
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

comment on function public.action_item_admin_update(bigint, text, bigint, text, text, timestamptz, date, text, text, text, text, numeric, text) is
  'Administrateur and Direction factual correction. Approval, assignment, treatment, signatures and closure fields are not accepted or modified.';
