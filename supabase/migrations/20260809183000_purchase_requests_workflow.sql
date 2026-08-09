alter table public.purchase_requests
  add column if not exists vessel_id bigint references public.vessels(id) on delete set null,
  add column if not exists vessel_sharepoint_item_id text,
  add column if not exists vessel_name text,
  add column if not exists reference text,
  add column if not exists quantity numeric(12, 3),
  add column if not exists unit_label text,
  add column if not exists unit_price_ht numeric(14, 2),
  add column if not exists urgent boolean not null default false,
  add column if not exists urgency_reason text,
  add column if not exists owner_name text,
  add column if not exists ordered_on date,
  add column if not exists expected_delivery_on date,
  add column if not exists received_on date,
  add column if not exists delivery_location text,
  add column if not exists delivery_details text,
  add column if not exists rebilling_label text,
  add column if not exists category_label text,
  add column if not exists processing_comment text,
  add column if not exists approval_status text,
  add column if not exists approval_reason text,
  add column if not exists approver_name text,
  add column if not exists approval_history text,
  add column if not exists website_url text;

create index if not exists purchase_requests_company_vessel_status_idx
  on public.purchase_requests (company_id, vessel_id, status);
create index if not exists purchase_requests_vessel_sharepoint_item_idx
  on public.purchase_requests (vessel_sharepoint_item_id);
create index if not exists purchase_requests_expected_delivery_idx
  on public.purchase_requests (expected_delivery_on) where expected_delivery_on is not null;
create index if not exists purchase_requests_urgent_idx
  on public.purchase_requests (urgent) where urgent;

create table if not exists public.purchase_request_attachments (
  id bigint generated always as identity primary key,
  company_id bigint not null default public.current_planning_company_id() references public.companies(id) on delete restrict,
  purchase_request_id bigint references public.purchase_requests(id) on delete cascade,
  purchase_sharepoint_item_id text,
  title text not null,
  content_type text,
  file_size_bytes bigint,
  source_kind text not null default 'seapilot',
  file_url text,
  storage_bucket text,
  storage_path text,
  sharepoint_list_id text,
  sharepoint_server_relative_url text,
  source_modified_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint purchase_request_attachments_source_kind_check check (source_kind in ('sharepoint', 'seapilot')),
  constraint purchase_request_attachments_location_check check (
    file_url is not null or (storage_bucket is not null and storage_path is not null)
  )
);

create unique index if not exists purchase_request_attachments_sharepoint_unique_idx
  on public.purchase_request_attachments (sharepoint_list_id, purchase_sharepoint_item_id, sharepoint_server_relative_url);
create unique index if not exists purchase_request_attachments_storage_unique_idx
  on public.purchase_request_attachments (storage_bucket, storage_path)
  where storage_path is not null;
create index if not exists purchase_request_attachments_request_idx
  on public.purchase_request_attachments (purchase_request_id, created_at);

create table if not exists public.purchase_request_events (
  id bigint generated always as identity primary key,
  company_id bigint not null default public.current_planning_company_id() references public.companies(id) on delete restrict,
  purchase_request_id bigint not null references public.purchase_requests(id) on delete cascade,
  event_type text not null,
  status_label text,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  comment text,
  effective_on date,
  created_at timestamptz not null default now(),
  constraint purchase_request_events_type_check check (event_type in (
    'created', 'taken_in_charge', 'delivery_planned', 'received',
    'approved', 'refused', 'information_requested', 'attachment_added'
  ))
);

create index if not exists purchase_request_events_request_idx
  on public.purchase_request_events (purchase_request_id, created_at desc);

create table if not exists public.purchase_request_notifications (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete restrict,
  purchase_request_id bigint not null references public.purchase_requests(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_role text not null,
  event_type text not null default 'created',
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint purchase_request_notifications_role_check check (recipient_role in ('admin', 'direction', 'armement')),
  unique (purchase_request_id, recipient_user_id, event_type)
);

create index if not exists purchase_request_notifications_recipient_idx
  on public.purchase_request_notifications (recipient_user_id, read_at, created_at desc);

create or replace function public.purchase_request_actor_name()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif(concat_ws(' ', person.first_name, person.last_name), ''),
    nullif(profile.display_name, ''),
    profile.email,
    'Utilisateur SeaPilot'
  )
  from public.profiles profile
  left join public.people person on person.user_id = profile.id
  where profile.id = (select auth.uid())
  limit 1
$$;

create or replace function public.purchase_request_can_create()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.has_any_role(array['admin', 'direction', 'armement', 'capitaine'])
    or exists (
      select 1
      from public.people person
      where person.user_id = (select auth.uid())
        and person.active
        and public.normalize_import_label(person.function_label) like '%chef mecanicien%'
    )
$$;

create or replace function public.notify_purchase_request_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.source_label = 'sharepoint' then
    return new;
  end if;

  insert into public.purchase_request_notifications (
    company_id, purchase_request_id, recipient_user_id, recipient_role, title, body
  )
  select distinct
    new.company_id,
    new.id,
    role.user_id,
    role.role_key,
    'Nouvelle demande d''achat #' || coalesce(new.request_number, new.id::text),
    coalesce(new.vessel_name || ' · ', '') || new.title
  from public.user_roles role
  left join public.people person on person.user_id = role.user_id
  where role.role_key in ('admin', 'direction', 'armement')
    and (person.company_id is null or person.company_id = new.company_id)
  on conflict (purchase_request_id, recipient_user_id, event_type) do nothing;

  return new;
end;
$$;

drop trigger if exists purchase_request_created_notifications on public.purchase_requests;
create trigger purchase_request_created_notifications
after insert on public.purchase_requests
for each row execute function public.notify_purchase_request_created();

create or replace function public.purchase_request_create(p_payload jsonb)
returns public.purchase_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_request public.purchase_requests;
  target_vessel public.vessels;
  actor_name text := public.purchase_request_actor_name();
  target_vessel_id bigint := nullif(p_payload ->> 'vessel_id', '')::bigint;
begin
  if not public.purchase_request_can_create() then
    raise exception 'Vous ne pouvez pas créer de demande d''achat.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_payload ->> 'title'), '') = '' then
    raise exception 'La désignation est obligatoire.' using errcode = '22023';
  end if;

  if target_vessel_id is not null then
    select * into target_vessel
    from public.vessels
    where id = target_vessel_id
      and company_id = public.current_planning_company_id()
      and active;
    if not found then
      raise exception 'Navire invalide.' using errcode = '22023';
    end if;
  end if;

  insert into public.purchase_requests (
    company_id, request_number, title, requested_on, requester_name, supplier_name,
    vessel_id, vessel_name, reference, quantity, unit_label, unit_price_ht, amount_ht,
    currency, status, description, urgent, urgency_reason, delivery_location,
    delivery_details, expected_delivery_on, rebilling_label, category_label, website_url,
    source_label
  ) values (
    public.current_planning_company_id(),
    nullif(btrim(p_payload ->> 'request_number'), ''),
    btrim(p_payload ->> 'title'),
    coalesce(nullif(p_payload ->> 'requested_on', '')::date, current_date),
    coalesce(nullif(btrim(p_payload ->> 'requester_name'), ''), actor_name),
    nullif(btrim(p_payload ->> 'supplier_name'), ''),
    target_vessel_id,
    target_vessel.name,
    nullif(btrim(p_payload ->> 'reference'), ''),
    nullif(p_payload ->> 'quantity', '')::numeric,
    nullif(btrim(p_payload ->> 'unit_label'), ''),
    nullif(p_payload ->> 'unit_price_ht', '')::numeric,
    nullif(p_payload ->> 'amount_ht', '')::numeric,
    coalesce(nullif(btrim(p_payload ->> 'currency'), ''), 'EUR'),
    'Commandes à traiter',
    nullif(btrim(p_payload ->> 'description'), ''),
    coalesce((p_payload ->> 'urgent')::boolean, false),
    nullif(btrim(p_payload ->> 'urgency_reason'), ''),
    nullif(btrim(p_payload ->> 'delivery_location'), ''),
    nullif(btrim(p_payload ->> 'delivery_details'), ''),
    nullif(p_payload ->> 'expected_delivery_on', '')::date,
    nullif(btrim(p_payload ->> 'rebilling_label'), ''),
    nullif(btrim(p_payload ->> 'category_label'), ''),
    nullif(btrim(p_payload ->> 'website_url'), ''),
    'seapilot'
  ) returning * into created_request;

  if created_request.request_number is null then
    update public.purchase_requests
    set request_number = created_request.id::text
    where id = created_request.id
    returning * into created_request;
  end if;

  insert into public.purchase_request_events (
    company_id, purchase_request_id, event_type, status_label, actor_user_id, actor_name, comment, effective_on
  ) values (
    created_request.company_id, created_request.id, 'created', 'Demande créée', auth.uid(), actor_name,
    created_request.description, created_request.requested_on
  );

  return created_request;
end;
$$;

create or replace function public.purchase_request_transition(
  p_request_id bigint,
  p_action text,
  p_comment text default null,
  p_effective_date date default null
)
returns public.purchase_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.purchase_requests;
  actor_name text := public.purchase_request_actor_name();
  event_name text;
  event_status text;
begin
  if not public.has_any_role(array['admin', 'direction', 'armement', 'capitaine']) then
    raise exception 'Vous ne pouvez pas traiter cette demande.' using errcode = '42501';
  end if;

  select * into target
  from public.purchase_requests
  where id = p_request_id
    and company_id = public.current_planning_company_id()
  for update;
  if not found then
    raise exception 'Demande introuvable.' using errcode = 'P0002';
  end if;

  case p_action
    when 'take_charge' then
      update public.purchase_requests
      set owner_name = actor_name,
          status = 'Commandes en cours',
          updated_at = now()
      where id = p_request_id returning * into target;
      event_name := 'taken_in_charge'; event_status := 'Prise en charge';
    when 'plan_delivery' then
      if p_effective_date is null then
        raise exception 'La date de livraison est obligatoire.' using errcode = '22023';
      end if;
      update public.purchase_requests
      set expected_delivery_on = p_effective_date,
          status = 'Commandes en cours',
          owner_name = coalesce(owner_name, actor_name),
          updated_at = now()
      where id = p_request_id returning * into target;
      event_name := 'delivery_planned'; event_status := 'Livraison planifiée';
    when 'mark_received' then
      update public.purchase_requests
      set received_on = coalesce(p_effective_date, current_date),
          status = 'Commandes traitées',
          updated_at = now()
      where id = p_request_id returning * into target;
      event_name := 'received'; event_status := 'Reçu à bord';
    when 'approve' then
      update public.purchase_requests
      set approval_status = 'Demande acceptée', approval_reason = null,
          approver_name = actor_name, updated_at = now()
      where id = p_request_id returning * into target;
      event_name := 'approved'; event_status := 'Approuvée';
    when 'refuse' then
      if coalesce(btrim(p_comment), '') = '' then
        raise exception 'La justification du refus est obligatoire.' using errcode = '22023';
      end if;
      update public.purchase_requests
      set approval_status = 'Demande refusée', approval_reason = btrim(p_comment),
          approver_name = actor_name, updated_at = now()
      where id = p_request_id returning * into target;
      event_name := 'refused'; event_status := 'Refusée';
    when 'request_information' then
      if coalesce(btrim(p_comment), '') = '' then
        raise exception 'Le complément demandé est obligatoire.' using errcode = '22023';
      end if;
      update public.purchase_requests
      set approval_status = 'Complément demandé', approval_reason = btrim(p_comment),
          approver_name = actor_name, updated_at = now()
      where id = p_request_id returning * into target;
      event_name := 'information_requested'; event_status := 'Complément demandé';
    else
      raise exception 'Action de traitement inconnue.' using errcode = '22023';
  end case;

  insert into public.purchase_request_events (
    company_id, purchase_request_id, event_type, status_label, actor_user_id, actor_name, comment, effective_on
  ) values (
    target.company_id, target.id, event_name, event_status, auth.uid(), actor_name,
    nullif(btrim(p_comment), ''), coalesce(p_effective_date, current_date)
  );

  return target;
end;
$$;

create or replace function public.resolve_sharepoint_purchase_request_links()
returns table (resolved_vessels integer, resolved_attachments integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  vessel_count integer := 0;
  attachment_count integer := 0;
begin
  update public.purchase_requests request
  set vessel_id = vessel.id,
      vessel_name = vessel.name,
      updated_at = now()
  from public.vessels vessel
  where request.company_id = vessel.company_id
    and (
      (request.vessel_sharepoint_item_id is not null and vessel.sharepoint_item_id = request.vessel_sharepoint_item_id)
      or public.normalize_import_label(request.vessel_name) = public.normalize_import_label(vessel.name)
      or public.normalize_import_label(request.vessel_name) = public.normalize_import_label(vessel.acronym)
    )
    and request.vessel_id is distinct from vessel.id;
  get diagnostics vessel_count = row_count;

  update public.purchase_request_attachments attachment
  set purchase_request_id = request.id,
      company_id = request.company_id
  from public.purchase_requests request
  where attachment.purchase_request_id is null
    and attachment.sharepoint_list_id = request.sharepoint_list_id
    and attachment.purchase_sharepoint_item_id = request.sharepoint_item_id;
  get diagnostics attachment_count = row_count;

  return query select vessel_count, attachment_count;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit)
values ('purchase-request-attachments', 'purchase-request-attachments', false, 26214400)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

alter table public.purchase_request_attachments enable row level security;
alter table public.purchase_request_events enable row level security;
alter table public.purchase_request_notifications enable row level security;

drop policy if exists purchase_request_attachments_read on public.purchase_request_attachments;
create policy purchase_request_attachments_read on public.purchase_request_attachments
for select to authenticated
using (company_id = public.current_planning_company_id()
  and public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin']));

drop policy if exists purchase_request_attachments_create on public.purchase_request_attachments;
create policy purchase_request_attachments_create on public.purchase_request_attachments
for insert to authenticated
with check (company_id = public.current_planning_company_id() and public.purchase_request_can_create());

drop policy if exists purchase_request_events_read on public.purchase_request_events;
create policy purchase_request_events_read on public.purchase_request_events
for select to authenticated
using (company_id = public.current_planning_company_id()
  and public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin']));

drop policy if exists purchase_request_notifications_read on public.purchase_request_notifications;
create policy purchase_request_notifications_read on public.purchase_request_notifications
for select to authenticated using (recipient_user_id = auth.uid());

drop policy if exists purchase_request_storage_read on storage.objects;
create policy purchase_request_storage_read on storage.objects
for select to authenticated using (bucket_id = 'purchase-request-attachments');

drop policy if exists purchase_request_storage_create on storage.objects;
create policy purchase_request_storage_create on storage.objects
for insert to authenticated with check (
  bucket_id = 'purchase-request-attachments' and public.purchase_request_can_create()
);

grant select, insert on public.purchase_request_attachments to authenticated;
grant select on public.purchase_request_events, public.purchase_request_notifications to authenticated;
grant usage on public.purchase_request_attachments_id_seq, public.purchase_request_events_id_seq,
  public.purchase_request_notifications_id_seq to authenticated;

revoke all on function public.purchase_request_actor_name() from public, anon;
revoke all on function public.purchase_request_can_create() from public, anon;
revoke all on function public.purchase_request_create(jsonb) from public, anon;
revoke all on function public.purchase_request_transition(bigint, text, text, date) from public, anon;
revoke all on function public.resolve_sharepoint_purchase_request_links() from public, anon;
grant execute on function public.purchase_request_actor_name() to authenticated;
grant execute on function public.purchase_request_can_create() to authenticated;
grant execute on function public.purchase_request_create(jsonb) to authenticated;
grant execute on function public.purchase_request_transition(bigint, text, text, date) to authenticated;
grant execute on function public.resolve_sharepoint_purchase_request_links() to authenticated;

insert into public.sharepoint_sources (
  key, title, source_type, module_key, related_module_keys, site_url, list_id,
  server_relative_url, browser_url, target_table, import_priority, confirmed, notes
)
values (
  'list-demande-achat', 'Demande d''Achat', 'list', 'purchaseRequests', array['projects','fleet'],
  'https://bbtm668.sharepoint.com/sites/QHSE',
  '3dce17c3-a634-4c04-ab77-18d47d717642',
  '/sites/QHSE/Lists/Demande dAchat',
  'https://bbtm668.sharepoint.com/sites/QHSE/Lists/Demande%20dAchat/AllItems.aspx',
  'purchase_requests', 135, true,
  'Source Power Query Demande d''Achat.iqy, vue 540EA6D5-D078-4125-BFC4-0884D4977A44. Les fichiers et photos sont importés.'
)
on conflict (key) do update set
  title = excluded.title,
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
  ('list-demande-achat', 'Identifiant', 'ID', 'counter', 'purchase_requests', 'request_number', true, null),
  ('list-demande-achat', 'Désignation', 'Title', 'text', 'purchase_requests', 'title', true, null),
  ('list-demande-achat', 'Émetteur', 'Emetteur', 'person/text', 'purchase_requests', 'requester_name', false, null),
  ('list-demande-achat', 'Navire', 'Navire', 'lookup', 'purchase_requests', 'vessel_name', false, null),
  ('list-demande-achat', 'Référence', 'R_x00e9_f_x00e9_rence', 'text', 'purchase_requests', 'reference', false, null),
  ('list-demande-achat', 'Quantité', 'Quantit_x00e9_', 'number', 'purchase_requests', 'quantity', false, null),
  ('list-demande-achat', 'Unité', 'Unit_x00e9__x002d_Conditionnemen', 'choice', 'purchase_requests', 'unit_label', false, null),
  ('list-demande-achat', 'Fournisseur', 'Fournisseur_x002d_Prestataire', 'lookup/text', 'purchase_requests', 'supplier_name', false, null),
  ('list-demande-achat', 'Prix total HT', 'Prix_x0020_Total_x0020_HT', 'currency', 'purchase_requests', 'amount_ht', false, null),
  ('list-demande-achat', 'Statut commande', 'Statut_x0020_commande', 'choice', 'purchase_requests', 'status', false, null),
  ('list-demande-achat', 'Commande urgente', 'CommandeUrgente', 'boolean', 'purchase_requests', 'urgent', false, null),
  ('list-demande-achat', 'Date de livraison', 'DateLivraison', 'date', 'purchase_requests', 'expected_delivery_on', false, null),
  ('list-demande-achat', 'Approbation', 'Approbation', 'choice', 'purchase_requests', 'approval_status', false, null),
  ('list-demande-achat', 'Historique approbation', 'HistoriqueApprobation', 'note', 'purchase_requests', 'approval_history', false, null),
  ('list-demande-achat', 'Pièces jointes', 'AttachmentFiles', 'attachments', 'purchase_request_attachments', 'file_url', false, 'Fichiers et photos SharePoint')
on conflict (source_key, internal_name, target_table, target_column) do update set
  field_label = excluded.field_label,
  data_type = excluded.data_type,
  required = excluded.required,
  notes = excluded.notes,
  updated_at = now();

comment on table public.purchase_request_attachments is 'Fichiers et photos SharePoint ou SeaPilot liés aux demandes d achat.';
comment on function public.purchase_request_transition(bigint, text, text, date) is 'Transitions métier sécurisées, y compris traitement par un autre capitaine.';
