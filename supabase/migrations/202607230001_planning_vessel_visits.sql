-- Vessel-level visits and audits, linked to the SharePoint provider catalog.
-- This migration also generalizes the administrator-only absence deletion RPC.

create table if not exists public.service_providers (
  id bigint generated always as identity primary key,
  company_id bigint not null default public.current_planning_company_id()
    references public.companies(id) on delete cascade,
  name text not null,
  category text,
  service_type text,
  activity text,
  address text,
  city text,
  phone text,
  legal_form text,
  accounting_email text,
  company_email text,
  contact_name text,
  contact_role text,
  contact_phone text,
  contact_email text,
  supplies text,
  evaluation text,
  active boolean not null default true,
  sharepoint_site_url text,
  sharepoint_list_id text,
  sharepoint_list_title text,
  sharepoint_item_id text,
  sharepoint_unique_id text,
  sharepoint_file_ref text,
  sharepoint_encoded_abs_url text,
  source_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_providers_name_check check (length(trim(name)) between 1 and 200)
);

create unique index if not exists service_providers_sharepoint_item_unique_idx
  on public.service_providers (sharepoint_list_id, sharepoint_item_id)
  where sharepoint_list_id is not null and sharepoint_item_id is not null;
create index if not exists service_providers_company_name_idx
  on public.service_providers (company_id, active, name);

create table if not exists public.vessel_visits (
  id bigint generated always as identity primary key,
  company_id bigint not null default public.current_planning_company_id()
    references public.companies(id) on delete cascade,
  vessel_id bigint not null references public.vessels(id) on delete restrict,
  visit_type text not null,
  provider_id bigint not null references public.service_providers(id) on delete restrict,
  comments text not null default '',
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vessel_visits_type_check check (visit_type in (
    'water_analysis',
    'client_audit',
    'imca_audit',
    'internal_audit',
    'anfr_visit',
    'annual_maritime_affairs',
    'annual_classification_society',
    'davits_visit',
    'crane_visit',
    'fire_visit',
    'qhse_visit'
  )),
  constraint vessel_visits_comments_check check (length(comments) <= 2000)
);

create index if not exists vessel_visits_company_vessel_idx
  on public.vessel_visits (company_id, vessel_id);

create table if not exists public.vessel_visit_occurrences (
  id bigint generated always as identity primary key,
  company_id bigint not null default public.current_planning_company_id()
    references public.companies(id) on delete cascade,
  visit_id bigint not null references public.vessel_visits(id) on delete cascade,
  scheduled_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint vessel_visit_occurrences_unique unique (visit_id, scheduled_at)
);

create index if not exists vessel_visit_occurrences_schedule_idx
  on public.vessel_visit_occurrences (company_id, scheduled_at, visit_id);

create table if not exists public.vessel_visit_attachments (
  id bigint generated always as identity primary key,
  company_id bigint not null default public.current_planning_company_id()
    references public.companies(id) on delete cascade,
  visit_id bigint not null references public.vessel_visits(id) on delete cascade,
  bucket_name text not null default 'vessel-visits',
  object_path text not null,
  original_file_name text not null,
  mime_type text,
  file_size bigint,
  uploaded_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint vessel_visit_attachments_path_unique unique (bucket_name, object_path),
  constraint vessel_visit_attachments_name_check check (length(trim(original_file_name)) between 1 and 255),
  constraint vessel_visit_attachments_size_check check (file_size is null or file_size between 0 and 20971520)
);

alter table public.service_providers enable row level security;
alter table public.vessel_visits enable row level security;
alter table public.vessel_visit_occurrences enable row level security;
alter table public.vessel_visit_attachments enable row level security;

drop policy if exists service_providers_company_read on public.service_providers;
create policy service_providers_company_read on public.service_providers
  for select to authenticated
  using ((select public.user_belongs_to_company(company_id)));

drop policy if exists vessel_visits_planning_read on public.vessel_visits;
create policy vessel_visits_planning_read on public.vessel_visits
  for select to authenticated
  using ((select public.planning_user_can('read', company_id, vessel_id, null, null)));

drop policy if exists vessel_visit_occurrences_planning_read on public.vessel_visit_occurrences;
create policy vessel_visit_occurrences_planning_read on public.vessel_visit_occurrences
  for select to authenticated
  using (
    exists (
      select 1
      from public.vessel_visits visit
      where visit.id = vessel_visit_occurrences.visit_id
        and visit.company_id = vessel_visit_occurrences.company_id
        and public.planning_user_can(
          'read',
          visit.company_id,
          visit.vessel_id,
          (vessel_visit_occurrences.scheduled_at at time zone 'Europe/Paris')::date,
          (vessel_visit_occurrences.scheduled_at at time zone 'Europe/Paris')::date
        )
    )
  );

drop policy if exists vessel_visit_attachments_planning_read on public.vessel_visit_attachments;
create policy vessel_visit_attachments_planning_read on public.vessel_visit_attachments
  for select to authenticated
  using (
    exists (
      select 1
      from public.vessel_visits visit
      where visit.id = vessel_visit_attachments.visit_id
        and visit.company_id = vessel_visit_attachments.company_id
        and public.planning_user_can('read', visit.company_id, visit.vessel_id, null, null)
    )
  );

drop policy if exists vessel_visit_attachments_planning_insert on public.vessel_visit_attachments;
create policy vessel_visit_attachments_planning_insert on public.vessel_visit_attachments
  for insert to authenticated
  with check (
    bucket_name = 'vessel-visits'
    and object_path like visit_id::text || '/%'
    and exists (
      select 1
      from public.vessel_visits visit
      where visit.id = vessel_visit_attachments.visit_id
        and visit.company_id = vessel_visit_attachments.company_id
        and public.planning_user_can('edit_event', visit.company_id, visit.vessel_id, null, null)
    )
  );

drop policy if exists vessel_visit_attachments_planning_delete on public.vessel_visit_attachments;
create policy vessel_visit_attachments_planning_delete on public.vessel_visit_attachments
  for delete to authenticated
  using (
    exists (
      select 1
      from public.vessel_visits visit
      where visit.id = vessel_visit_attachments.visit_id
        and visit.company_id = vessel_visit_attachments.company_id
        and public.planning_user_can('edit_event', visit.company_id, visit.vessel_id, null, null)
    )
  );

grant select on public.service_providers, public.vessel_visits, public.vessel_visit_occurrences, public.vessel_visit_attachments to authenticated;
grant insert, delete on public.vessel_visit_attachments to authenticated;
grant usage, select on sequence public.vessel_visit_attachments_id_seq to authenticated;

alter table public.planning_change_log drop constraint if exists planning_change_log_entity_kind_check;
alter table public.planning_change_log add constraint planning_change_log_entity_kind_check
  check (entity_kind in (
    'assignment', 'day', 'period', 'project', 'vessel', 'publication', 'handover',
    'handover_position', 'derogation', 'rotation_series', 'rotation_occurrence',
    'template', 'manning_matrix', 'absence', 'conflict_case', 'work_rest_policy', 'dependency',
    'assistant_suggestion', 'assistant_pilot', 'vessel_visit'
  ));

create or replace function public.save_vessel_visit(
  p_visit_id bigint,
  p_vessel_id bigint,
  p_visit_type text,
  p_provider_id bigint,
  p_comments text,
  p_scheduled_at timestamptz[]
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint;
  target_id bigint;
  existing_visit public.vessel_visits%rowtype;
  provider_company_id bigint;
  occurrence_at timestamptz;
  occurrence_count integer;
  first_date date;
  last_date date;
  existing_first_date date;
  existing_last_date date;
  action_name text;
begin
  select company_id into target_company_id from public.vessels where id = p_vessel_id;
  select company_id into provider_company_id from public.service_providers where id = p_provider_id and active;
  occurrence_count := coalesce(array_length(p_scheduled_at, 1), 0);

  if target_company_id is null
    or provider_company_id is distinct from target_company_id
    or p_visit_type not in (
      'water_analysis', 'client_audit', 'imca_audit', 'internal_audit', 'anfr_visit',
      'annual_maritime_affairs', 'annual_classification_society', 'davits_visit',
      'crane_visit', 'fire_visit', 'qhse_visit'
    )
    or occurrence_count not between 1 and 10
    or exists (select 1 from unnest(p_scheduled_at) value where value is null)
    or length(coalesce(p_comments, '')) > 2000 then
    raise exception using errcode = '22023', message = 'PLANNING_VISIT_INVALID';
  end if;

  select min((value at time zone 'Europe/Paris')::date),
         max((value at time zone 'Europe/Paris')::date)
  into first_date, last_date
  from unnest(p_scheduled_at) value;

  if not public.planning_user_can('edit_event', target_company_id, p_vessel_id, first_date, last_date) then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: visite ou audit.';
  end if;

  if p_visit_id is not null then
    select * into existing_visit
    from public.vessel_visits
    where id = p_visit_id and company_id = target_company_id
    for update;
    if existing_visit.id is null then
      raise exception using errcode = 'P0002', message = 'PLANNING_VISIT_NOT_FOUND';
    end if;

    select min((occurrence.scheduled_at at time zone 'Europe/Paris')::date),
           max((occurrence.scheduled_at at time zone 'Europe/Paris')::date)
    into existing_first_date, existing_last_date
    from public.vessel_visit_occurrences occurrence
    where occurrence.visit_id = existing_visit.id;

    if not public.planning_user_can(
      'edit_event',
      existing_visit.company_id,
      existing_visit.vessel_id,
      existing_first_date,
      existing_last_date
    ) then
      raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: visite ou audit existant.';
    end if;
  end if;

  if p_visit_id is null then
    insert into public.vessel_visits (
      company_id, vessel_id, visit_type, provider_id, comments
    ) values (
      target_company_id, p_vessel_id, p_visit_type, p_provider_id, trim(coalesce(p_comments, ''))
    )
    returning id into target_id;
    action_name := 'create';
  else
    update public.vessel_visits
    set vessel_id = p_vessel_id,
        visit_type = p_visit_type,
        provider_id = p_provider_id,
        comments = trim(coalesce(p_comments, '')),
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_visit_id
    returning id into target_id;
    delete from public.vessel_visit_occurrences where visit_id = target_id;
    action_name := 'update';
  end if;

  foreach occurrence_at in array p_scheduled_at loop
    insert into public.vessel_visit_occurrences (company_id, visit_id, scheduled_at)
    values (target_company_id, target_id, occurrence_at);
  end loop;

  insert into public.planning_change_log (
    company_id, entity_kind, entity_id, action, payload, changed_by, changed_by_name,
    vessel_id, starts_on, ends_on, summary
  )
  values (
    target_company_id, 'vessel_visit', target_id, action_name,
    jsonb_build_object(
      'visit', (select to_jsonb(visit) from public.vessel_visits visit where visit.id = target_id),
      'occurrences', (select jsonb_agg(to_jsonb(occurrence) order by occurrence.scheduled_at)
                      from public.vessel_visit_occurrences occurrence where occurrence.visit_id = target_id)
    ),
    auth.uid(), public.planning_current_actor_name(), p_vessel_id, first_date, last_date,
    case when action_name = 'create' then 'Visite / Audit créé' else 'Visite / Audit mis à jour' end
  );

  return target_id;
end;
$$;

revoke all on function public.save_vessel_visit(bigint, bigint, text, bigint, text, timestamptz[]) from public, anon;
grant execute on function public.save_vessel_visit(bigint, bigint, text, bigint, text, timestamptz[]) to authenticated;

create or replace function public.delete_vessel_visit(p_visit_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.vessel_visits%rowtype;
  target_snapshot jsonb;
  first_date date;
  last_date date;
begin
  if not public.has_role('admin') then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: suppression visite ou audit.';
  end if;

  select visit.* into target
  from public.vessel_visits visit
  where visit.id = p_visit_id
    and visit.company_id = public.current_planning_company_id()
  for update;

  if target.id is null then
    raise exception using errcode = 'P0002', message = 'PLANNING_VISIT_NOT_FOUND';
  end if;

  select jsonb_build_object(
    'visit', to_jsonb(target),
    'occurrences', coalesce(jsonb_agg(to_jsonb(occurrence) order by occurrence.scheduled_at), '[]'::jsonb)
  ),
  min((occurrence.scheduled_at at time zone 'Europe/Paris')::date),
  max((occurrence.scheduled_at at time zone 'Europe/Paris')::date)
  into target_snapshot, first_date, last_date
  from public.vessel_visit_occurrences occurrence
  where occurrence.visit_id = target.id;

  delete from public.vessel_visits where id = target.id;

  insert into public.planning_change_log (
    company_id, entity_kind, entity_id, action, payload, changed_by, changed_by_name,
    vessel_id, starts_on, ends_on, summary
  )
  values (
    target.company_id, 'vessel_visit', target.id, 'delete',
    jsonb_build_object('before', target_snapshot, 'after', null),
    auth.uid(), public.planning_current_actor_name(), target.vessel_id, first_date, last_date,
    'Visite / Audit supprimé'
  );

  return target.id;
end;
$$;

revoke all on function public.delete_vessel_visit(bigint) from public, anon;
grant execute on function public.delete_vessel_visit(bigint) to authenticated;

create or replace function public.delete_planning_absence(p_absence_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.planning_absences%rowtype;
  related_dependency public.planning_dependencies%rowtype;
begin
  if not public.has_role('admin') then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: suppression demande absence.';
  end if;

  select absence.* into target
  from public.planning_absences absence
  where absence.id = p_absence_id
    and absence.company_id = public.current_planning_company_id()
  for update;

  if target.id is null then
    raise exception using errcode = 'P0002', message = 'PLANNING_ABSENCE_NOT_FOUND';
  end if;

  for related_dependency in
    select dependency.*
    from public.planning_dependencies dependency
    where dependency.company_id = target.company_id
      and (
        (dependency.predecessor_kind = 'absence' and dependency.predecessor_id = target.id)
        or (dependency.successor_kind = 'absence' and dependency.successor_id = target.id)
      )
    for update
  loop
    delete from public.planning_dependencies where id = related_dependency.id;
    insert into public.planning_change_log (
      company_id, entity_kind, entity_id, action, payload, changed_by, changed_by_name,
      vessel_id, starts_on, ends_on, summary
    )
    values (
      related_dependency.company_id, 'dependency', related_dependency.id, 'delete',
      to_jsonb(related_dependency), auth.uid(), public.planning_current_actor_name(),
      related_dependency.vessel_id, related_dependency.starts_on, related_dependency.ends_on,
      'Dépendance Planning supprimée avec la demande d’absence'
    );
  end loop;

  delete from public.planning_absences where id = target.id and company_id = target.company_id;

  insert into public.planning_change_log (
    company_id, entity_kind, entity_id, action, payload, changed_by, changed_by_name,
    starts_on, ends_on, summary
  )
  values (
    target.company_id, 'absence', target.id, 'delete',
    jsonb_build_object('before', to_jsonb(target), 'after', null),
    auth.uid(), public.planning_current_actor_name(),
    (target.starts_at at time zone 'Europe/Paris')::date,
    ((target.ends_at - interval '1 millisecond') at time zone 'Europe/Paris')::date,
    'Demande d’absence supprimée'
  );

  return target.id;
end;
$$;

revoke all on function public.delete_planning_absence(bigint) from public, anon;
grant execute on function public.delete_planning_absence(bigint) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vessel-visits',
  'vessel-visits',
  false,
  20971520,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = 20971520,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists vessel_visits_storage_read on storage.objects;
create policy vessel_visits_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'vessel-visits'
    and exists (
      select 1
      from public.vessel_visit_attachments attachment
      join public.vessel_visits visit on visit.id = attachment.visit_id
      where attachment.bucket_name = storage.objects.bucket_id
        and attachment.object_path = storage.objects.name
        and public.planning_user_can('read', visit.company_id, visit.vessel_id, null, null)
    )
  );

drop policy if exists vessel_visits_storage_insert on storage.objects;
create policy vessel_visits_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vessel-visits'
    and exists (
      select 1
      from public.vessel_visits visit
      where visit.id = case
        when (storage.foldername(name))[1] ~ '^[0-9]+$'
          then (storage.foldername(name))[1]::bigint
        else null
      end
        and public.planning_user_can('edit_event', visit.company_id, visit.vessel_id, null, null)
    )
  );

drop policy if exists vessel_visits_storage_delete on storage.objects;
create policy vessel_visits_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'vessel-visits'
    and exists (
      select 1
      from public.vessel_visits visit
      where visit.id = case
        when (storage.foldername(name))[1] ~ '^[0-9]+$'
          then (storage.foldername(name))[1]::bigint
        else null
      end
        and public.planning_user_can('edit_event', visit.company_id, visit.vessel_id, null, null)
    )
  );

insert into public.sharepoint_sources (
  key, title, source_type, module_key, related_module_keys, site_url, list_id,
  server_relative_url, browser_url, target_table, import_priority, confirmed, notes
)
values (
  'list-administration-prestataires-fournisseurs',
  'Administration - Prestataires - Fournisseurs',
  'list',
  'planning',
  array['administration'],
  'https://bbtm668.sharepoint.com/sites/QHSE',
  '5e29f7db-a85e-4147-9c54-b00f0e588f7e',
  '/sites/QHSE/Lists/Fournisseurs',
  'https://bbtm668.sharepoint.com/sites/QHSE/Lists/Fournisseurs/AllItems.aspx',
  'service_providers',
  12,
  true,
  'Source IQY et affichage de 32 lignes vérifiés le 23/07/2026.'
)
on conflict (key) do update
set title = excluded.title,
    source_type = excluded.source_type,
    module_key = excluded.module_key,
    related_module_keys = excluded.related_module_keys,
    site_url = excluded.site_url,
    list_id = excluded.list_id,
    server_relative_url = excluded.server_relative_url,
    browser_url = excluded.browser_url,
    target_table = excluded.target_table,
    import_priority = excluded.import_priority,
    confirmed = excluded.confirmed,
    notes = excluded.notes,
    updated_at = now();

insert into public.sharepoint_field_mappings (
  source_key, field_label, internal_name, data_type, target_table, target_column, required, notes
)
values
  ('list-administration-prestataires-fournisseurs', 'Société', 'Title', 'Text', 'service_providers', 'name', true, null),
  ('list-administration-prestataires-fournisseurs', 'Catégorie', 'Cat_x00e9_gorie', 'Text', 'service_providers', 'category', false, null),
  ('list-administration-prestataires-fournisseurs', 'Type de Service', 'FOU_x002d_TypedeService', 'Text', 'service_providers', 'service_type', false, null),
  ('list-administration-prestataires-fournisseurs', 'FOU-Activité', 'Activit_x00e9_', 'Text', 'service_providers', 'activity', false, null),
  ('list-administration-prestataires-fournisseurs', 'FOU-Adresse', 'FOU_x002d_Adresse', 'Text', 'service_providers', 'address', false, null),
  ('list-administration-prestataires-fournisseurs', 'FOU-Adresse : Ville', 'City', 'Text', 'service_providers', 'city', false, null),
  ('list-administration-prestataires-fournisseurs', 'FOU-Téléphone', 'FOU_x002d_T_x00e9_l_x00e9_phone', 'Text', 'service_providers', 'phone', false, null),
  ('list-administration-prestataires-fournisseurs', 'FOU-Forme Juridique', 'FOU_x002d_FormeJuridique', 'Text', 'service_providers', 'legal_form', false, null),
  ('list-administration-prestataires-fournisseurs', 'FOU-email Comptable', 'FOU_x002d_emailComptable', 'Text', 'service_providers', 'accounting_email', false, null),
  ('list-administration-prestataires-fournisseurs', 'FOU-Mail', 'FOU_x002d_Mail', 'Text', 'service_providers', 'company_email', false, null),
  ('list-administration-prestataires-fournisseurs', 'Contact 1 - Prénom NOM', 'Pr_x00e9_nomNOM', 'Text', 'service_providers', 'contact_name', false, null),
  ('list-administration-prestataires-fournisseurs', 'Contact 1 - Fonction', 'Contact1_x002d_Fonction', 'Text', 'service_providers', 'contact_role', false, null),
  ('list-administration-prestataires-fournisseurs', 'Contact 1 - Téléphone', 'Contact1_x002d_T_x00e9_l_x00e9_p', 'Text', 'service_providers', 'contact_phone', false, null),
  ('list-administration-prestataires-fournisseurs', 'Contact 1 - Mail', 'Contact1_x002d_Mail', 'Text', 'service_providers', 'contact_email', false, null)
on conflict do nothing;

comment on table public.service_providers is
  'Company provider catalog synchronized from Administration - Prestataires - Fournisseurs in SharePoint.';
comment on table public.vessel_visits is
  'Vessel-level visit and audit requests; scheduled instances are stored in vessel_visit_occurrences.';
comment on table public.vessel_visit_attachments is
  'Private Supabase Storage metadata for vessel visit and audit attachments.';
