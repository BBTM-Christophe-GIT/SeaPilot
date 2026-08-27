-- Event report creation, named QHSE approval and multi-assignee treatment.

alter table public.action_items
  add column if not exists occurred_at timestamptz,
  add column if not exists vessel_maneuver text,
  add column if not exists weather_conditions text,
  add column if not exists issuer_person_id bigint references public.people(id) on delete set null,
  add column if not exists issuer_signature_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists workflow_status text,
  add column if not exists approval_requested_at timestamptz,
  add column if not exists approver_person_id bigint references public.people(id) on delete restrict,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by_person_id bigint references public.people(id) on delete restrict;

update public.action_items
set occurred_at = opened_on::timestamp at time zone 'Europe/Paris'
where occurred_at is null and opened_on is not null;

update public.action_items
set workflow_status = case
  when closed_on is not null then 'closed'
  else 'approved'
end
where workflow_status is null;

alter table public.action_items
  alter column workflow_status set default 'pending_approval',
  alter column workflow_status set not null,
  drop constraint if exists action_items_workflow_status_check,
  add constraint action_items_workflow_status_check check (
    workflow_status in ('draft', 'pending_approval', 'approved', 'closed')
  );

create index if not exists action_items_company_workflow_idx
  on public.action_items(company_id, workflow_status, approver_person_id, occurred_at desc);
create index if not exists action_items_issuer_person_idx
  on public.action_items(company_id, issuer_person_id, occurred_at desc);

create table if not exists public.action_item_assignees (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  action_item_id bigint not null,
  assignee_kind text not null,
  person_id bigint,
  vessel_id bigint,
  display_name_snapshot text not null,
  assigned_by_person_id bigint references public.people(id) on delete set null,
  assigned_at timestamptz not null default now(),
  constraint action_item_assignees_action_company_fkey
    foreign key (action_item_id, company_id)
    references public.action_items(id, company_id) on delete cascade,
  constraint action_item_assignees_kind_check check (
    (assignee_kind = 'person' and person_id is not null and vessel_id is null)
    or (assignee_kind = 'vessel_crew' and person_id is null and vessel_id is not null)
  ),
  constraint action_item_assignees_person_company_fkey
    foreign key (person_id, company_id)
    references public.people(id, company_id) on delete cascade,
  constraint action_item_assignees_vessel_company_fkey
    foreign key (vessel_id, company_id)
    references public.vessels(id, company_id) on delete cascade
);

create unique index if not exists action_item_assignees_person_uidx
  on public.action_item_assignees(action_item_id, person_id)
  where assignee_kind = 'person';
create unique index if not exists action_item_assignees_vessel_uidx
  on public.action_item_assignees(action_item_id, vessel_id)
  where assignee_kind = 'vessel_crew';
create index if not exists action_item_assignees_person_lookup_idx
  on public.action_item_assignees(company_id, person_id, action_item_id)
  where person_id is not null;
create index if not exists action_item_assignees_vessel_lookup_idx
  on public.action_item_assignees(company_id, vessel_id, action_item_id)
  where vessel_id is not null;

create or replace function public.action_plan_approver_person_id(target_company_id bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select person.id
  from public.people person
  where person.company_id = target_company_id
    and person.active
    and public.normalize_import_label(person.first_name) = 'christophe'
    and public.normalize_import_label(person.last_name) = 'minassian'
  order by (person.user_id is null), person.id
  limit 1;
$$;

create or replace function public.action_item_user_is_assignee(target_action_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.action_item_assignees assignee
    where assignee.action_item_id = target_action_id
      and assignee.company_id = public.current_planning_company_id()
      and (
        assignee.person_id = public.current_person_id()
        or (
          assignee.assignee_kind = 'vessel_crew'
          and exists (
            select 1
            from public.planning_assignments assignment
            where assignment.company_id = assignee.company_id
              and assignment.vessel_id = assignee.vessel_id
              and assignment.crew_person_id = public.current_person_id()
              and assignment.confirmation_status <> 'cancelled'
              and current_date between assignment.starts_on and assignment.ends_on
          )
        )
      )
  );
$$;

create or replace function public.action_item_user_can_read(target_action_id bigint)
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
      and (
        public.has_company_role(action.company_id, array['admin', 'direction', 'armement'])
        or action.issuer_person_id = public.current_person_id()
        or (
          action.approver_person_id = public.current_person_id()
          and action.workflow_status = 'pending_approval'
        )
        or public.action_item_user_is_assignee(action.id)
        or (
          coalesce(action.source_label, '') <> 'seapilot'
          and public.has_company_role(action.company_id, array['capitaine', 'marin'])
        )
      )
  );
$$;

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
      and (
        public.has_company_role(action.company_id, array['admin', 'direction', 'armement'])
        or public.action_item_user_is_assignee(action.id)
        or (
          coalesce(action.source_label, '') <> 'seapilot'
          and public.has_company_role(action.company_id, array['capitaine'])
        )
      )
  );
$$;

create or replace function public.action_item_apply_import_workflow_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.occurred_at := coalesce(
    new.occurred_at,
    new.opened_on::timestamp at time zone 'Europe/Paris',
    clock_timestamp()
  );
  new.opened_on := coalesce(
    new.opened_on,
    (new.occurred_at at time zone 'Europe/Paris')::date
  );

  if coalesce(new.source_label, '') <> 'seapilot' then
    new.workflow_status := case when new.closed_on is null then 'approved' else 'closed' end;
  end if;
  return new;
end;
$$;

drop trigger if exists action_item_apply_import_workflow_defaults on public.action_items;
create trigger action_item_apply_import_workflow_defaults
before insert on public.action_items
for each row execute function public.action_item_apply_import_workflow_defaults();

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
  deviation_required boolean;
begin
  if (select auth.uid()) is null
     or not public.has_company_role(target_company_id, array['admin', 'direction', 'armement']) then
    raise exception 'Vous ne pouvez pas créer ce rapport.' using errcode = '42501';
  end if;

  select * into actor_person
  from public.people person
  where person.id = public.current_person_id()
    and person.company_id = target_company_id
    and person.active;
  if actor_person.id is null then
    raise exception 'Le profil émetteur actif est introuvable.' using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_title, ''))) < 2
     or p_occurred_at is null
     or p_due_on is null
     or length(btrim(coalesce(p_corrective_action, ''))) < 2 then
    raise exception 'Les champs obligatoires du rapport sont incomplets.' using errcode = '22023';
  end if;

  select * into target_vessel
  from public.vessels vessel
  where vessel.id = p_vessel_id
    and vessel.company_id = target_company_id
    and vessel.active;
  if target_vessel.id is null then
    raise exception 'Le navire sélectionné est invalide.' using errcode = '22023';
  end if;

  select * into target_type
  from public.action_type_catalog catalog
  where catalog.company_id = target_company_id
    and catalog.type_key = p_action_type_key
    and catalog.active;
  if target_type.id is null then
    raise exception 'Le type d''évènement sélectionné est invalide.' using errcode = '22023';
  end if;

  deviation_required := p_action_type_key = any(array[
    'audit_client', 'audit_ecmid', 'audit_internal', 'visit_davit',
    'visit_crane', 'visit_hse', 'visit_radio', 'visit_classification'
  ]);
  if deviation_required and target_deviation_type is null then
    raise exception 'Le type d''écart est obligatoire pour cet évènement.' using errcode = '22023';
  end if;
  if not deviation_required then
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
  )
  returning * into target_action;

  return target_action;
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
  select * into target
  from public.action_items action
  where action.id = p_action_id
    and action.company_id = public.current_planning_company_id()
  for update;

  if target.id is null
     or not public.has_company_role(target.company_id, array['admin', 'direction', 'armement']) then
    raise exception 'Rapport introuvable ou inaccessible.' using errcode = '42501';
  end if;
  if photo_1 is not null and photo_1 not like target.company_id::text || '/' || target.id::text || '/photo-1-%' then
    raise exception 'Le chemin de la première photo est invalide.' using errcode = '22023';
  end if;
  if photo_2 is not null and photo_2 not like target.company_id::text || '/' || target.id::text || '/photo-2-%' then
    raise exception 'Le chemin de la seconde photo est invalide.' using errcode = '22023';
  end if;

  update public.action_items
  set photo_1_path = photo_1,
      photo_2_path = photo_2,
      updated_at = clock_timestamp()
  where id = target.id
  returning * into target;
  return target;
end;
$$;

create or replace function public.action_item_approve(
  p_action_id bigint,
  p_anomaly_cause text,
  p_person_ids bigint[] default '{}'::bigint[],
  p_vessel_ids bigint[] default '{}'::bigint[]
)
returns public.action_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.action_items;
  actor_person_id bigint := public.current_person_id();
  normalized_person_ids bigint[];
  normalized_vessel_ids bigint[];
  assignee_labels text;
begin
  select * into target
  from public.action_items action
  where action.id = p_action_id
    and action.company_id = public.current_planning_company_id()
  for update;

  if target.id is null then
    raise exception 'Rapport introuvable.' using errcode = 'P0002';
  end if;
  if target.approver_person_id is distinct from actor_person_id
     or target.approver_person_id is distinct from public.action_plan_approver_person_id(target.company_id) then
    raise exception 'Seul Christophe MINASSIAN peut approuver ce rapport.' using errcode = '42501';
  end if;
  if target.workflow_status <> 'pending_approval' then
    raise exception 'Ce rapport n''est pas en attente d''approbation.' using errcode = '55000';
  end if;
  if btrim(coalesce(p_anomaly_cause, '')) not in (
    'Avarie Moteur de Propulsion',
    'Matériel/Equipement défectueux /Inadapté',
    'Non Respect des Procédures/Consignes',
    'Opération de Levage',
    'Panne Equipement',
    'Propreté Rangement',
    'Respect de la Reglementation Applicable',
    'Travaux Spéciaux'
  ) then
    raise exception 'La cause de l''anomalie est invalide.' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct person_id order by person_id), '{}'::bigint[])
  into normalized_person_ids
  from unnest(coalesce(p_person_ids, '{}'::bigint[])) person_id;
  select coalesce(array_agg(distinct vessel_id order by vessel_id), '{}'::bigint[])
  into normalized_vessel_ids
  from unnest(coalesce(p_vessel_ids, '{}'::bigint[])) vessel_id;

  if cardinality(normalized_person_ids) + cardinality(normalized_vessel_ids) = 0 then
    raise exception 'Sélectionnez au moins un responsable du traitement.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(normalized_person_ids) selected_id
    where not exists (
      select 1 from public.people person
      where person.id = selected_id and person.company_id = target.company_id and person.active
    )
  ) or exists (
    select 1 from unnest(normalized_vessel_ids) selected_id
    where not exists (
      select 1 from public.vessels vessel
      where vessel.id = selected_id and vessel.company_id = target.company_id and vessel.active
    )
  ) then
    raise exception 'Un responsable sélectionné est invalide.' using errcode = '22023';
  end if;

  delete from public.action_item_assignees where action_item_id = target.id;

  insert into public.action_item_assignees (
    company_id, action_item_id, assignee_kind, person_id,
    display_name_snapshot, assigned_by_person_id
  )
  select target.company_id, target.id, 'person', person.id,
    btrim(person.first_name || ' ' || person.last_name), actor_person_id
  from public.people person
  where person.company_id = target.company_id and person.id = any(normalized_person_ids);

  insert into public.action_item_assignees (
    company_id, action_item_id, assignee_kind, vessel_id,
    display_name_snapshot, assigned_by_person_id
  )
  select target.company_id, target.id, 'vessel_crew', vessel.id,
    'Équipage — ' || vessel.name, actor_person_id
  from public.vessels vessel
  where vessel.company_id = target.company_id and vessel.id = any(normalized_vessel_ids);

  select string_agg(assignee.display_name_snapshot, ', ' order by assignee.display_name_snapshot)
  into assignee_labels
  from public.action_item_assignees assignee
  where assignee.action_item_id = target.id;

  update public.action_items
  set anomaly_cause = btrim(p_anomaly_cause),
      owner_name = assignee_labels,
      workflow_status = 'approved',
      status = 'Ecart Non Soldé',
      approved_at = clock_timestamp(),
      approved_by_person_id = actor_person_id,
      updated_at = clock_timestamp()
  where id = target.id
  returning * into target;

  return target;
end;
$$;

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
  normalized_status text;
  requested_closure_photo_path text := nullif(btrim(p_closure_photo_path), '');
begin
  if (select auth.uid()) is null then
    raise exception 'Vous n''êtes pas responsable du traitement de cette action.' using errcode = '42501';
  end if;

  select action.* into target
  from public.action_items action
  where action.id = p_action_id
    and action.company_id = public.current_planning_company_id()
  for update;

  if not found then
    raise exception 'Action introuvable ou inaccessible.' using errcode = 'P0002';
  end if;

  normalized_status := public.normalize_import_label(target.status);
  if target.closed_on is not null
     or target.workflow_status = 'closed'
     or (
       normalized_status not like '%non sold%'
       and normalized_status not like '%a traiter%'
       and (normalized_status like '%sold%' or normalized_status like '%clos%' or normalized_status like '%termin%')
     ) then
    if not public.action_item_user_can_read(target.id) then
      raise exception 'Vous n''êtes pas responsable du traitement de cette action.' using errcode = '42501';
    end if;
    raise exception 'Une action soldée ne peut plus être traitée.' using errcode = '55000';
  end if;

  if not public.action_item_user_can_treat(target.id) then
    raise exception 'Vous n''êtes pas responsable du traitement de cette action.' using errcode = '42501';
  end if;

  if requested_closure_photo_path is distinct from target.closure_photo_path
     and requested_closure_photo_path is not null
     and requested_closure_photo_path not like target.company_id::text || '/' || target.id::text || '/cloture-%' then
    raise exception 'Le chemin de la photo de clôture est invalide.' using errcode = '22023';
  end if;

  update public.action_items
  set comments = nullif(btrim(p_comments), ''),
      realized_action = nullif(btrim(p_realized_action), ''),
      closure_photo_path = coalesce(requested_closure_photo_path, target.closure_photo_path),
      status = case when p_close_action then 'Ecart Soldé' else coalesce(nullif(target.status, ''), 'Ecart Non Soldé') end,
      closed_on = case when p_close_action then current_date else target.closed_on end,
      workflow_status = case when p_close_action then 'closed' else target.workflow_status end,
      updated_at = clock_timestamp()
  where id = target.id
  returning * into target;

  return target;
end;
$$;

create or replace function public.action_plan_evidence_action_id(target_name text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(target_name, '/', 2) ~ '^[0-9]+$'
      then split_part(target_name, '/', 2)::bigint
    else null
  end;
$$;

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
      and (
        public.has_company_role(action.company_id, array['admin', 'direction', 'armement'])
        or public.action_item_user_can_treat(action.id)
      )
  );
$$;

-- Keep HSE event dates aligned with the date and time captured on the report.
create or replace function public.sync_action_item_hse_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_classification text;
begin
  select catalog.hse_classification into target_classification
  from public.action_type_catalog catalog
  where catalog.company_id = new.company_id
    and catalog.type_key = new.action_type_key
    and catalog.active;

  if target_classification is null then
    delete from public.hse_safety_events where action_item_id = new.id;
    return new;
  end if;

  insert into public.hse_safety_events (
    company_id, action_item_id, occurred_on, classification, person_id,
    vessel_id, project_id, lost_days, title, description, created_by
  ) values (
    new.company_id, new.id,
    coalesce((new.occurred_at at time zone 'Europe/Paris')::date, new.opened_on, new.created_at::date, current_date),
    target_classification, new.victim_person_id, new.vessel_id, new.project_id,
    new.lost_days, new.title, coalesce(new.description, new.comments), (select auth.uid())
  )
  on conflict (action_item_id) where action_item_id is not null do update set
    company_id = excluded.company_id,
    occurred_on = excluded.occurred_on,
    classification = excluded.classification,
    person_id = excluded.person_id,
    vessel_id = excluded.vessel_id,
    project_id = excluded.project_id,
    lost_days = excluded.lost_days,
    title = excluded.title,
    description = excluded.description;

  return new;
end;
$$;

drop trigger if exists action_items_sync_hse_event on public.action_items;
create trigger action_items_sync_hse_event
after insert or update of action_type_key, occurred_at, opened_on, victim_person_id, vessel_id, project_id, lost_days, title, description, comments
on public.action_items
for each row execute function public.sync_action_item_hse_event();

alter table public.action_item_assignees enable row level security;
revoke all on table public.action_item_assignees from anon, authenticated;
grant select on table public.action_item_assignees to authenticated;

create policy action_item_assignees_read
on public.action_item_assignees for select to authenticated
using (public.action_item_user_can_read(action_item_id));

drop policy if exists action_items_role_read on public.action_items;
create policy action_items_role_read
on public.action_items for select to authenticated
using (public.action_item_user_can_read(id));

drop policy if exists action_items_office_write on public.action_items;
revoke insert, update, delete on table public.action_items from authenticated;
grant select on table public.action_items to authenticated;

drop policy if exists action_plan_evidence_storage_read on storage.objects;
create policy action_plan_evidence_storage_read
on storage.objects for select to authenticated
using (
  bucket_id = 'action-plan-evidence'
  and public.action_item_user_can_read(public.action_plan_evidence_action_id(name))
);

drop policy if exists action_plan_evidence_storage_insert on storage.objects;
create policy action_plan_evidence_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'action-plan-evidence'
  and public.action_plan_evidence_user_can_upload(name)
);

drop policy if exists action_plan_issuer_signature_storage_read on storage.objects;
create policy action_plan_issuer_signature_storage_read
on storage.objects for select to authenticated
using (
  bucket_id = 'working-time-signatures'
  and exists (
    select 1
    from public.action_items action
    where action.issuer_signature_snapshot->>'storage_bucket' = storage.objects.bucket_id
      and action.issuer_signature_snapshot->>'storage_path' = storage.objects.name
      and public.action_item_user_can_read(action.id)
  )
);

revoke all on function public.action_plan_approver_person_id(bigint) from public, anon, authenticated;
revoke all on function public.action_item_user_is_assignee(bigint) from public, anon, authenticated;
revoke all on function public.action_item_user_can_read(bigint) from public, anon, authenticated;
revoke all on function public.action_item_user_can_treat(bigint) from public, anon, authenticated;
revoke all on function public.action_item_apply_import_workflow_defaults() from public, anon, authenticated;
revoke all on function public.action_item_create(text, bigint, text, text, timestamptz, date, text, text, text, text, numeric) from public, anon, authenticated;
revoke all on function public.action_item_attach_finding_photos(bigint, text, text) from public, anon, authenticated;
revoke all on function public.action_item_approve(bigint, text, bigint[], bigint[]) from public, anon, authenticated;
revoke all on function public.action_item_treat(bigint, text, text, boolean, text) from public, anon, authenticated;
revoke all on function public.action_plan_evidence_action_id(text) from public, anon, authenticated;
revoke all on function public.action_plan_evidence_user_can_upload(text) from public, anon, authenticated;

grant execute on function public.action_item_user_is_assignee(bigint) to authenticated;
grant execute on function public.action_item_user_can_read(bigint) to authenticated;
grant execute on function public.action_item_user_can_treat(bigint) to authenticated;
grant execute on function public.action_item_create(text, bigint, text, text, timestamptz, date, text, text, text, text, numeric) to authenticated;
grant execute on function public.action_item_attach_finding_photos(bigint, text, text) to authenticated;
grant execute on function public.action_item_approve(bigint, text, bigint[], bigint[]) to authenticated;
grant execute on function public.action_item_treat(bigint, text, text, boolean, text) to authenticated;
grant execute on function public.action_plan_evidence_action_id(text) to authenticated;
grant execute on function public.action_plan_evidence_user_can_upload(text) to authenticated;

comment on column public.action_items.occurred_at is
  'Exact event observation date and time entered by the issuer.';
comment on column public.action_items.issuer_signature_snapshot is
  'Immutable active profile-signature metadata captured when the report is created.';
comment on table public.action_item_assignees is
  'Treatment owners selected after QHSE approval: individual people or dynamic vessel crews.';
comment on function public.action_item_approve(bigint, text, bigint[], bigint[]) is
  'Allows only the active Christophe MINASSIAN profile to define the anomaly cause and one or more treatment owners.';
comment on function public.action_item_user_is_assignee(bigint) is
  'Matches direct assignees and current confirmed Planning crew members of an assigned vessel.';
